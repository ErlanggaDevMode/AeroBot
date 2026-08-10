// TelegramBotTest.ino
// Production-ready ESP32 Firmware for IoT Solar Monitoring System
// Features: Dual-channel upload (WiFi with GSM Failover), Sensor Readings (BME280 + Analog),
// Task Watchdog, and Remote Command parsing.
// Single Codebase compatible with both Arduino IDE and PlatformIO.

#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Wire.h>
#include <Adafruit_Sensor.h>
#include <Adafruit_BME280.h>
#include <LiquidCrystal_I2C.h>
#include <ArduinoJson.h>
#include <esp_task_wdt.h>

#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>

#include "secrets.h"

// Hardware Pins
#define SOIL_PIN 34
#define BATTERY_PIN 32
#define SOLAR_VOLT_PIN 35
#define SOLAR_CHARGE_PIN 25
#define WIND_PIN 14

// SIM800L Pins
#define SIM800_RX_PIN 16
#define SIM800_TX_PIN 17
#define SIM800_RST_PIN 5
#define SIM800_PWR_PIN 4

// Calibration
#define SOIL_DRY_VAL 3200
#define SOIL_WET_VAL 1200

// Anemometer Pulse Counter with 15ms software debouncing (1 pulse/sec = 0.667 m/s)
volatile unsigned long windPulseCount = 0;
volatile unsigned long lastWindPulseInterruptTime = 0;
unsigned long lastWindCalculateTime = 0;

void IRAM_ATTR countWindPulse() {
    unsigned long now = millis();
    if (now - lastWindPulseInterruptTime > 15) { // 15ms debounce window to eliminate contact bounce & noise
        windPulseCount++;
        lastWindPulseInterruptTime = now;
    }
}

// Voltage divider multipliers (Calibrate with a physical multimeter!)
#define BAT_VOLT_MULTIPLIER 0.00446
#define SOLAR_VOLT_MULTIPLIER 0.00618

// Watchdog
#define WDT_TIMEOUT_SECONDS 30
const unsigned long UPLOAD_INTERVAL = 30000; // Upload sensor telemetry every 30 seconds

// Clients
WiFiClientSecure wifiClient;
HardwareSerial SerialAT(2);
TinyGsm modem(SerialAT);
// Ponytail: TinyGsmClientSecure is not used for GSM upload here to save heap memory and ensure
// stability on low-speed cell connection. To upgrade, load root certificates on SIM800L flash
// and enable SSL/TLS on the modem level. We use standard TinyGsmClient for HTTP upload.
TinyGsmClient gsmClient(modem);

Adafruit_BME280 bme;
bool bmeConnected = false;

// LCD I2C Configuration (Default I2C Address 0x27, 16 Columns x 2 Rows)
LiquidCrystal_I2C lcd(0x27, 16, 2);
bool lcdConnected = false;

// Global State
unsigned long lastUploadTime = 0;
float curTemp = NAN;
float curHum = NAN;
int curSoil = 0;
float curBatVolt = 0.0;
float curSolarVolt = 0.0;
float curWindSpeed = 0.0;
bool isCharging = false;
int wifiRSSI = -100;

// Watchdog Helper
void resetWatchdog() {
    esp_task_wdt_reset();
}

// BME280 & LCD Initializer with automatic I2C bus scanner
void setupSensors() {
    Wire.begin();
    delay(100);

    Serial.println("\n--- Scanning I2C Bus Devices ---");
    int nDevices = 0;
    for (byte address = 1; address < 127; address++) {
        Wire.beginTransmission(address);
        byte error = Wire.endTransmission();
        if (error == 0) {
            Serial.print("I2C device found at address 0x");
            if (address < 16) Serial.print("0");
            Serial.println(address, HEX);
            nDevices++;
        }
    }
    if (nDevices == 0) {
        Serial.println("No I2C devices found! Please check SDA (GPIO21) and SCL (GPIO22) connections & 3.3V power.");
    }
    Serial.println("--------------------------------\n");

    // Initialize LCD I2C
    lcd.init();
    lcd.backlight();
    lcd.clear();
    lcd.setCursor(0, 0);
    lcd.print("AeroBot IoT v1.2");
    lcd.setCursor(0, 1);
    lcd.print("Booting System..");
    lcdConnected = true;

    // Try BME280 at default address 0x76, fallback to 0x77
    if (bme.begin(0x76)) {
        bmeConnected = true;
        Serial.println("BME280 sensor initialized successfully at address 0x76");
    } else if (bme.begin(0x77)) {
        bmeConnected = true;
        Serial.println("BME280 sensor initialized successfully at address 0x77");
    } else {
        bmeConnected = false;
        Serial.println("Could not find a valid BME280 sensor at 0x76 or 0x77! Check wiring & power.");
    }
}

// Update 16x2 LCD I2C display with rotating telemetry pages
void updateLCDDisplay() {
    if (!lcdConnected) return;

    static unsigned long lastLCDToggle = 0;
    static int lcdPage = 0;

    // Toggle display pages every 4 seconds
    if (millis() - lastLCDToggle > 4000) {
        lcdPage = (lcdPage + 1) % 2;
        lastLCDToggle = millis();
    }

    lcd.clear();
    if (lcdPage == 0) {
        // Page 1: Temp, Humidity, Soil, Wind Speed
        lcd.setCursor(0, 0);    
        if (!isnan(curTemp)) {
            lcd.print("T:");
            lcd.print(curTemp, 1);
            lcd.print("C H:");
            lcd.print(curHum, 0);
            lcd.print("%");
        } else {
            lcd.print("Temp: Sensor Err");
        }

        lcd.setCursor(0, 1);
        lcd.print("S:");
        lcd.print(curSoil);
        lcd.print("% W:");
        lcd.print(curWindSpeed, 1);
        lcd.print("m/s");
    } else {
        // Page 2: Battery Voltage, Solar Status, Network Strength
        lcd.setCursor(0, 0);
        lcd.print("Bat:");
        lcd.print(curBatVolt, 2);
        lcd.print("V ");
        lcd.print(isCharging ? "CHG" : "BAT");

        lcd.setCursor(0, 1);
        if (WiFi.status() == WL_CONNECTED) {
            lcd.print("Net:WiFi ");
            lcd.print(WiFi.RSSI());
            lcd.print("dBm");
        } else {
            lcd.print("Net:GSM Cellular");
        }
    }
}

// Read telemetry from physical inputs
void readSensors() {
    if (bmeConnected) {
        curTemp = bme.readTemperature();
        curHum = bme.readHumidity();
    } else {
        curTemp = NAN;
        curHum = NAN;
    }

    int soilRaw = analogRead(SOIL_PIN);
    float soilPercent = map(soilRaw, SOIL_DRY_VAL, SOIL_WET_VAL, 0, 100);
    curSoil = constrain(soilPercent, 0, 100);

    int batRaw = analogRead(BATTERY_PIN);
    curBatVolt = batRaw * BAT_VOLT_MULTIPLIER;

    int solarRaw = analogRead(SOLAR_VOLT_PIN);
    curSolarVolt = solarRaw * SOLAR_VOLT_MULTIPLIER;
    
    // Auto-detect charging status (via status pin if connected, or automatic solar vs battery voltage comparison)
    isCharging = (digitalRead(SOLAR_CHARGE_PIN) == LOW) || (curSolarVolt > (curBatVolt + 0.5));

    // Calculate wind speed in m/s (1 pulse/sec = ~0.667 m/s) over a stable 3-second window
    unsigned long now = millis();
    float elapsedSec = (now - lastWindCalculateTime) / 1000.0;
    if (elapsedSec >= 3.0) {
        noInterrupts();
        unsigned long pulses = windPulseCount;
        windPulseCount = 0;
        interrupts();

        float rawCalculatedSpeed = ((float)pulses / elapsedSec) * 0.667;
        // Filter out extreme noise spikes (speeds > 35 m/s or 126 km/h)
        if (rawCalculatedSpeed > 35.0) {
            curWindSpeed = 0.0;
        } else {
            curWindSpeed = rawCalculatedSpeed;
        }
        lastWindCalculateTime = now;

        Serial.print("Anemometer: ");
        Serial.print(curWindSpeed, 2);
        Serial.print(" m/s (Pulses: ");
        Serial.print(pulses);
        Serial.println(")");
    }

    // Refresh LCD Onscreen Telemetry
    updateLCDDisplay();
}

// SIM800L HW Boot up with AT wakeup, auto-baud lock, & automatic TX/RX pin swap fallback
void setupSIM800L() {
    Serial.println("\n--- Initializing SIM800L EVB Modem ---");
    pinMode(SIM800_PWR_PIN, OUTPUT);
    pinMode(SIM800_RST_PIN, OUTPUT);
    
    // Set RST line high (normal operation)
    digitalWrite(SIM800_RST_PIN, HIGH);
    digitalWrite(SIM800_PWR_PIN, LOW);
    delay(500);

    bool modemFound = false;

    // Helper lambda to test AT response
    auto testModemAt = [](int rxPin, int txPin, unsigned long baud) -> bool {
        SerialAT.begin(baud, SERIAL_8N1, rxPin, txPin);
        delay(300);
        // Send AT sync bytes 5 times to lock SIM800L auto-baud
        for (int i = 0; i < 5; i++) {
            SerialAT.print("AT\r\n");
            delay(200);
        }
        return modem.init();
    };

    // Test 1: Standard Wiring (ESP32 RX=16, TX=17 at 9600 baud)
    Serial.println("Testing SIM800L (RX=16, TX=17 @ 9600 baud)...");
    if (testModemAt(SIM800_RX_PIN, SIM800_TX_PIN, 9600)) {
        modemFound = true;
        Serial.println("✅ SIM800L detected on RX=16, TX=17 at 9600 baud.");
    } 
    // Test 2: Swapped Wiring (ESP32 RX=17, TX=16 at 9600 baud)
    else {
        Serial.println("Testing Swapped TX/RX (RX=17, TX=16 @ 9600 baud)...");
        if (testModemAt(SIM800_TX_PIN, SIM800_RX_PIN, 9600)) {
            modemFound = true;
            Serial.println("✅ SIM800L detected on Swapped Pins (RX=17, TX=16).");
        }
        // Test 3: 115200 baud fallback
        else {
            Serial.println("Testing 115200 baud fallback...");
            if (testModemAt(SIM800_RX_PIN, SIM800_TX_PIN, 115200)) {
                modemFound = true;
                Serial.println("✅ SIM800L detected at 115200 baud. Setting to 9600...");
                modem.setBaud(9600);
                testModemAt(SIM800_RX_PIN, SIM800_TX_PIN, 9600);
            }
        }
    }

    if (modemFound) {
        Serial.println("✅ SIM800L Modem Ready!");
        Serial.print("Modem Info: ");
        Serial.println(modem.getModemInfo());
        Serial.print("Signal Quality (0-31): ");
        Serial.println(modem.getSignalQuality());
    } else {
        Serial.println("⚠️ Could not respond to AT commands!");
        Serial.println("Hardware Checklist:");
        Serial.println("1) SIM800L VDD -> Must connect to 3V3 ESP32");
        Serial.println("2) LM2596 #1 Output -> Must set to 5.0V - 5.2V (2A Peak)");
        Serial.println("3) SIM800L LED Status -> Must blink every 3 sec for GSM registration.");
    }
    Serial.println("---------------------------------------\n");
}

// Connect WiFi with robust state management
bool connectWiFi() {
    if (WiFi.status() == WL_CONNECTED) return true;
    
    WiFi.mode(WIFI_STA);
    
    static bool connectionInitiated = false;
    if (!connectionInitiated) {
        Serial.println("\nConnecting WiFi...");
        // Clean start
        WiFi.disconnect(true);
        delay(100);
        WiFi.mode(WIFI_STA);
        WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
        connectionInitiated = true;
    } else {
        Serial.println("\nWiFi connection attempt already in progress...");
    }
    
    unsigned long startAttempt = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - startAttempt < 10000) {
        delay(500);
        Serial.print(".");
        resetWatchdog();
    }
    
    if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi Connected");
        Serial.print("IP Address: ");
        Serial.println(WiFi.localIP());
        wifiRSSI = WiFi.RSSI();
        connectionInitiated = false;
        return true;
    } else {
        Serial.println("\nWiFi Connection Timeout.");
        connectionInitiated = false;
        WiFi.disconnect();
        return false;
    }
}

// Connect GPRS
bool connectGPRS() {
    if (modem.isGprsConnected()) return true;
    
    Serial.println("Connecting GPRS...");
    if (!modem.waitForNetwork(30000L)) {
        Serial.println("GSM Network registration failed.");
        return false;
    }
    
    if (modem.gprsConnect(GSM_APN, GSM_USER, GSM_PASS)) {
        Serial.println("GPRS Connected successfully.");
        return true;
    }
    
    Serial.println("GPRS Connection failed.");
    return false;
}

// Execute any command received in response payload
void parseCommand(String response) {
    if (response.length() == 0) return;
    
    DynamicJsonDocument doc(512);
    DeserializationError error = deserializeJson(doc, response);
    
    if (error) {
        Serial.print("Failed to parse JSON response: ");
        Serial.println(error.c_str());
        return;
    }
    
    if (doc.containsKey("command")) {
        String cmd = doc["command"].as<String>();
        if (cmd == "reboot") {
            Serial.println("🔄 Reboot command received. Restarting ESP32...");
            delay(1000);
            ESP.restart();
        }
    }
}

// Send telemetry data via WiFi HTTP Client
void uploadWiFi(String jsonPayload) {
    HTTPClient http;
    wifiClient.setInsecure(); // Bypass Vercel SSL check for simpler setup

    String url = "https://" + String(BACKEND_HOST) + String(BACKEND_PATH);
    Serial.print("Uploading via WiFi: ");
    Serial.println(url);

    http.begin(wifiClient, url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-API-Key", ESP32_API_KEY);

    int httpResponseCode = http.POST(jsonPayload);
    
    if (httpResponseCode > 0) {
        String response = http.getString();
        Serial.print("HTTP Response Code: ");
        Serial.println(httpResponseCode);
        Serial.print("Response: ");
        Serial.println(response);
        parseCommand(response);
    } else {
        Serial.print("Error sending POST request: ");
        Serial.println(httpResponseCode);
    }
    http.end();
}

// Send telemetry data via GSM Raw TCP Connection
void uploadGSM(String jsonPayload) {
    if (!connectGPRS()) return;

    Serial.print("Uploading via GSM GPRS to: ");
    Serial.println(BACKEND_HOST);

    // Ponytail: Standard HTTP endpoint is used over GSM because SSL/TLS handshakes over GPRS 
    // consume excessive data and cause timeouts on slow connections. 
    // To upgrade, route via a secure gateway that supports lightweight UDP/CoAP protocols.
    int port = 80; 
    
    if (gsmClient.connect(BACKEND_HOST, port)) {
        // Send HTTP POST headers and body
        gsmClient.print("POST " + String(BACKEND_PATH) + " HTTP/1.1\r\n");
        gsmClient.print("Host: " + String(BACKEND_HOST) + "\r\n");
        gsmClient.print("X-API-Key: " + String(ESP32_API_KEY) + "\r\n");
        gsmClient.print("Content-Type: application/json\r\n");
        gsmClient.print("Content-Length: " + String(jsonPayload.length()) + "\r\n");
        gsmClient.print("Connection: close\r\n\r\n");
        gsmClient.print(jsonPayload);
        
        // Wait for response
        unsigned long timeout = millis();
        while (gsmClient.connected() && millis() - timeout < 10000) {
            if (gsmClient.available()) {
                String line = gsmClient.readStringUntil('\r');
                // Simple parsing for JSON content in response
                if (line.indexOf("{\"") != -1) {
                    Serial.print("GSM Response: ");
                    Serial.println(line);
                    parseCommand(line);
                    break;
                }
            }
            resetWatchdog();
        }
        gsmClient.stop();
        Serial.println("GSM Upload transaction complete.");
    } else {
        Serial.println("Connection to host failed over GSM.");
    }
}

// Main execution process
void processUpload() {
    readSensors();
    
    // Create telemetry JSON payload
    DynamicJsonDocument doc(512);
    doc["deviceId"] = DEVICE_ID;
    
    if (isnan(curTemp)) doc["temperature"] = nullptr;
    else doc["temperature"] = curTemp;
    
    if (isnan(curHum)) doc["humidity"] = nullptr;
    else doc["humidity"] = curHum;
    
    doc["soil"] = curSoil;
    doc["windSpeed"] = curWindSpeed;
    doc["battery"] = curBatVolt;
    doc["solar"] = isCharging ? "charging" : "idle";
    doc["rssi"] = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : -100;
    doc["uptime"] = millis() / 1000;
    doc["version"] = "1.2";

    String jsonPayload;
    serializeJson(doc, jsonPayload);
    Serial.println("\nPayload: " + jsonPayload);

    // Try uploading over WiFi, failover to GSM if needed
    if (WiFi.status() == WL_CONNECTED || connectWiFi()) {
        uploadWiFi(jsonPayload);
    } else {
        uploadGSM(jsonPayload);
    }
}

void setup() {
    Serial.begin(115200);
    delay(1000);
    Serial.println("\n--- AeroBot Serverless Client Booting ---");

    // Task Watchdog configuration (ESP32-native protection)
    #if defined(ESP_ARDUINO_VERSION_MAJOR) && ESP_ARDUINO_VERSION_MAJOR >= 3
    esp_task_wdt_config_t config = {
        .timeout_ms = WDT_TIMEOUT_SECONDS * 1000,
        .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
        .trigger_panic = true
    };
    esp_task_wdt_reconfigure(&config);
    #else
    esp_task_wdt_init(WDT_TIMEOUT_SECONDS, true);
    #endif
    esp_task_wdt_add(NULL);
    resetWatchdog();

    // Set hardware modes & full 0-3.3V ADC attenuation
    analogSetAttenuation(ADC_11db);
    analogReadResolution(12);

    pinMode(SOIL_PIN, INPUT);
    pinMode(BATTERY_PIN, INPUT);
    pinMode(SOLAR_VOLT_PIN, INPUT);
    pinMode(SOLAR_CHARGE_PIN, INPUT_PULLUP);

    // Configure Anemometer Pulse Counter Pin & Interrupt
    pinMode(WIND_PIN, INPUT_PULLUP);
    attachInterrupt(digitalPinToInterrupt(WIND_PIN), countWindPulse, RISING);
    lastWindCalculateTime = millis();

    setupSensors();
    resetWatchdog();

    connectWiFi();
    resetWatchdog();

    setupSIM800L();
    resetWatchdog();

    Serial.println("Setup completed successfully.");
}

void loop() {
    resetWatchdog();

    // Rotate LCD Telemetry Pages
    updateLCDDisplay();

    // Trigger upload on interval (non-blocking)
    if (millis() - lastUploadTime > UPLOAD_INTERVAL || lastUploadTime == 0) {
        processUpload();
        lastUploadTime = millis();
    }
}
