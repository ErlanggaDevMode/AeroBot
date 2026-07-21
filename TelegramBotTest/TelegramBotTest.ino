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
#include <ArduinoJson.h>
#include <esp_task_wdt.h>

#define TINY_GSM_MODEM_SIM800
#include <TinyGsmClient.h>

#include "secrets.h"

// Hardware Pins
#define SOIL_PIN 32
#define BATTERY_PIN 33
#define SOLAR_VOLT_PIN 35
#define SOLAR_CHARGE_PIN 25

// SIM800L Pins
#define SIM800_RX_PIN 16
#define SIM800_TX_PIN 17
#define SIM800_RST_PIN 5
#define SIM800_PWR_PIN 4

// Calibration
#define SOIL_DRY_VAL 3200
#define SOIL_WET_VAL 1200

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

// Global State
unsigned long lastUploadTime = 0;
float curTemp = NAN;
float curHum = NAN;
int curSoil = 0;
float curBatVolt = 0.0;
float curSolarVolt = 0.0;
bool isCharging = false;
int wifiRSSI = -100;

// Watchdog Helper
void resetWatchdog() {
    esp_task_wdt_reset();
}

// BME280 Initializer
void setupSensors() {
    Wire.begin();
    if (bme.begin(0x76)) {
        bmeConnected = true;
        Serial.println("BME280 sensor initialized successfully (0x76)");
    } else {
        Serial.println("Could not find a valid BME280 sensor! Check wiring.");
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
    
    // Active low charging indicator pin (Low value means charging)
    isCharging = (digitalRead(SOLAR_CHARGE_PIN) == LOW);
}

// SIM800L HW Boot up
void setupSIM800L() {
    Serial.println("Initializing SIM800L...");
    pinMode(SIM800_PWR_PIN, OUTPUT);
    pinMode(SIM800_RST_PIN, OUTPUT);
    
    // Hardware pulse PWRKEY to boot SIM800L
    digitalWrite(SIM800_PWR_PIN, LOW);
    delay(100);
    digitalWrite(SIM800_PWR_PIN, HIGH);
    delay(1000);
    digitalWrite(SIM800_PWR_PIN, LOW);
    delay(1000);

    SerialAT.begin(9600, SERIAL_8N1, SIM800_RX_PIN, SIM800_TX_PIN);
    delay(3000);
    resetWatchdog();
    
    if (modem.restart()) {
        Serial.println("SIM800L Modem Ready");
        Serial.print("Modem Info: ");
        Serial.println(modem.getModemInfo());
    } else {
        Serial.println("Failed to start SIM800L!");
    }
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
    doc["battery"] = curBatVolt;
    doc["solar"] = isCharging ? "charging" : "idle";
    doc["rssi"] = (WiFi.status() == WL_CONNECTED) ? WiFi.RSSI() : -100;
    doc["uptime"] = millis() / 1000;
    doc["version"] = "1.1";

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

    // Set hardware modes
    pinMode(SOIL_PIN, INPUT);
    pinMode(BATTERY_PIN, INPUT);
    pinMode(SOLAR_VOLT_PIN, INPUT);
    pinMode(SOLAR_CHARGE_PIN, INPUT_PULLUP);

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

    // Trigger upload on interval (non-blocking)
    if (millis() - lastUploadTime > UPLOAD_INTERVAL || lastUploadTime == 0) {
        processUpload();
        lastUploadTime = millis();
    }
}
