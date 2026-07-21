# breakdown.md

# IoT Solar Outdoor Monitoring System

> Project Breakdown & Development Blueprint

Version: 1.0

---

# Project Summary

Membangun sistem **IoT Monitoring Outdoor** berbasis **ESP32 DevKitC V4** yang menggunakan tenaga surya sebagai sumber daya utama.

Perangkat mampu melakukan monitoring lingkungan secara real-time, mengirimkan data melalui Telegram Bot, berjalan selama 24/7, serta memiliki kemampuan auto recovery apabila terjadi gangguan.

Project dibuat agar dapat dikembangkan menggunakan:

- Arduino IDE 2.x
- PlatformIO (VSCode)

dengan **satu source code (single codebase).**

---

# Main Goals

- Outdoor Monitoring
- Solar Powered
- Telegram Control
- 24/7 Operation
- Production Ready
- Modular Code
- Expandable
- Low Power Consumption

---

# Hardware

## Main Controller

- ESP32 DevKitC V4

---

## Communication

Primary

- WiFi

Secondary

- SIM800L

---

## Power

- Solar Panel 20Wp
- MPPT Solar Charge Controller
- LiFePO4 12V 6Ah
- LM2596 5V
- LM2596 4V (SIM800)

---

## Sensor

- SHT31
- Capacitive Soil Moisture Sensor

Future

- Rain Sensor
- Light Sensor
- Water Level
- GPS

---

## Protection

- Fuse
- TVS
- Capacitor Bank
- Waterproof Cable Gland

---

## Enclosure

ABS IP65

24 x 16 x 9 cm

---

# Software Stack

Language

- C++

Framework

- Arduino Framework

IDE

- Arduino IDE
- PlatformIO

Libraries

- WiFi
- WiFiClientSecure
- UniversalTelegramBot
- ArduinoJson
- TinyGSM
- Preferences
- Wire
- Adafruit SHT31

---

# Folder Structure

```
iot-solar-monitor/

src/

include/

lib/

docs/

assets/

test/

README.md

platformio.ini
```

Arduino IDE

```
IoT_Solar_Monitor/

IoT_Solar_Monitor.ino

config.h

pin_config.h

secrets.h

app.cpp

wifi_manager.cpp

telegram_manager.cpp

sensor_manager.cpp

battery_manager.cpp

logger.cpp

watchdog.cpp

sim800_manager.cpp
```

---

# Development Principles

- Write Once Build Anywhere
- Arduino IDE Compatible
- PlatformIO Compatible
- Modular
- Production Ready
- Hardware Independent
- Maintainable
- Low Power
- Easy Debugging

---

# Development Roadmap

## Phase 1

ESP32 Setup

Tasks

- Install Arduino IDE
- Install ESP32 Board
- Install Driver
- Install Library
- Verify Upload
- Serial Monitor

Deliverable

ESP32 Running

---

## Phase 2

WiFi

Tasks

- Connect WiFi
- Auto Reconnect
- WiFi Manager

Deliverable

Stable WiFi

---

## Phase 3

Telegram

Tasks

- Create Bot
- Connect API
- Receive Message
- Reply Message
- Command Parser

Commands

/start

/help

/ping

/status

Deliverable

Telegram Online

---

## Phase 4

Logger

Tasks

- Logger Class
- Serial Logger
- Debug Output
- Error Log

Deliverable

Readable Debugging

---

## Phase 5

Sensor

Tasks

- SHT31
- Soil Sensor

Commands

/temp

/humidity

/soil

Deliverable

Environment Monitoring

---

## Phase 6

Battery Monitoring

Tasks

- Voltage Reading
- Calibration
- Battery Percentage

Commands

/battery

Deliverable

Battery Monitoring

---

## Phase 7

Solar Monitoring

Tasks

- Charging Status
- Solar Voltage

Commands

/solar

Deliverable

Solar Monitoring

---

## Phase 8

SIM800L

Tasks

- UART
- SMS
- GPRS

Deliverable

Backup Communication

---

## Phase 9

Watchdog

Tasks

- Software Watchdog
- Auto Restart

Deliverable

Recovery System

---

## Phase 10

Power Management

Tasks

- Low Battery
- Critical Battery
- Safe Shutdown

Deliverable

Power Protection

---

## Phase 11

Outdoor Deployment

Tasks

- Waterproof
- Cable Gland
- Final Wiring

Deliverable

Outdoor Ready

---

# Telegram Commands

Basic

```
/start
/help
/ping
/status
```

Sensor

```
/temp
/humidity
/soil
```

Power

```
/battery
/solar
```

System

```
/network
/version
/reboot
```

Future

```
/log
/config
/update
```

---

# Notification Events

Boot

Restart

WiFi Lost

WiFi Connected

Telegram Connected

Battery Low

Battery Critical

Solar Charging

Sensor Error

Watchdog Reset

---

# System Flow

```
Power On

↓

Serial

↓

Hardware Init

↓

WiFi

↓

Telegram

↓

Sensor

↓

Health Check

↓

Monitoring Loop

↓

Read Sensor

↓

Check Telegram

↓

Execute Command

↓

Update Status

↓

Repeat
```

---

# Software Modules

Application

WiFi Manager

Telegram Manager

Logger

Sensor Manager

Battery Manager

Power Manager

SIM800 Manager

Watchdog Manager

Configuration Manager

---

# Configuration Files

config.h

pin_config.h

secrets.h

---

# Coding Rules

No long delay()

Use millis()

Split every feature

One responsibility one module

Readable code

Comment important logic

Use constants

No magic numbers

---

# Debugging Strategy

Primary

Serial Monitor

115200 baud

Secondary

Telegram Log

Future

SD Card Log

---

# Testing Checklist

ESP32 Boot

WiFi

Telegram

Command

Sensor

Battery

Solar

SIM800

Watchdog

Reconnect

Outdoor

72 Hours Test

---

# Hardware Layout

Inside Box

- Battery
- MPPT
- ESP32
- SIM800
- LM2596
- Fuse
- Capacitor

Outside

- Solar Panel
- Soil Sensor
- SIM Antenna

---

# Future Features

OTA

MQTT

Firebase

Dashboard

AI Irrigation

Rain Sensor

GPS

Cloud Storage

Remote Configuration

---

# Repository Documentation

README.md

PRD.md

BREAKDOWN.md

ARCHITECTURE.md

HARDWARE.md

PIN_MAPPING.md

POWER.md

WIRING.md

TEST_PLAN.md

ROADMAP.md

CHANGELOG.md

---

# Final Deliverables

- Production-ready firmware
- Arduino IDE compatible
- PlatformIO compatible
- Wiring diagram
- Schematic
- BOM / RAB
- Installation guide
- User manual
- Developer documentation
- Test report
- Deployment guide

---

# Current Project Status

| Module | Status |
|----------|--------|
| PRD | ✅ Complete |
| Breakdown | ✅ Complete |
| Hardware Selection | ✅ Complete |
| RAB | ✅ Complete |
| SCC Selection | ✅ Complete |
| Arduino IDE Setup | ✅ Complete |
| Telegram Bot | ✅ Prototype Complete |
| ESP32 WiFi | ✅ Complete |
| Telegram Communication | ✅ Working |
| Folder Structure | ✅ Complete |
| Development Roadmap | ✅ Complete |
| Software Architecture | ✅ Complete |
| Wireframe Enclosure | ✅ Designed |
| Wiring Concept | ✅ Discussed |
| Sensor Integration | ⏳ Next Phase |
| Battery Monitoring | ⏳ Next Phase |
| Solar Monitoring | ⏳ Next Phase |
| SIM800L | ⏳ Next Phase |
| Watchdog | ⏳ Next Phase |
| Outdoor Deployment | ⏳ Final Phase |

---

# Project Vision

Membangun sebuah **IoT Solar Monitoring Platform** yang stabil, modular, dan siap digunakan di lingkungan outdoor. Sistem dikembangkan dengan pendekatan bertahap, dimulai dari prototipe sederhana hingga menjadi solusi produksi yang mampu berjalan 24/7 dengan konsumsi daya efisien, mudah dipelihara, dan dapat dikembangkan untuk berbagai kebutuhan monitoring di masa depan.