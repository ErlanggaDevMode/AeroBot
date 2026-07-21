# PRD.md

# IoT Solar Monitoring Platform

**Version:** 2.0

**Status:** Draft

**Architecture:** Serverless

**Target Platform:** Arduino IDE 2.x & PlatformIO

---

# 1. Project Overview

## Project Name

**IoT Solar Monitoring Platform**

## Description

IoT Solar Monitoring Platform merupakan platform monitoring perangkat IoT berbasis **ESP32 DevKitC V4** yang dirancang untuk penggunaan outdoor menggunakan sumber daya **Solar Panel + LiFePO4 Battery**.

Platform ini memungkinkan pengguna memonitor kondisi perangkat secara **real-time** melalui **Web Dashboard** dan **Telegram Bot**, menggunakan arsitektur **serverless** sehingga tidak memerlukan VPS atau dedicated server.

Seluruh sistem dibangun menggunakan layanan gratis (free tier) agar mudah dipelajari, dikembangkan, dan dipublikasikan sebagai portfolio.

---

# 2. Vision

Membangun platform IoT modern yang:

* Gratis untuk digunakan.
* Mudah dikembangkan.
* Production-ready.
* Modular.
* Mendukung banyak perangkat (multi-device).
* Berjalan 24/7.
* Dapat dikembangkan menjadi Smart Agriculture Platform.

---

# 3. Objectives

## Firmware

* ESP32 stabil 24/7
* Auto reconnect WiFi
* Watchdog
* Auto Recovery
* Modular firmware

## Platform

* Web Dashboard
* Telegram Monitoring
* Device Management
* Historical Data
* Real-time Monitoring

---

# 4. Technology Stack

## Firmware

* ESP32 DevKitC V4
* Arduino Framework
* Arduino IDE 2.x
* PlatformIO

---

## Frontend

* Next.js
* React
* Tailwind CSS
* TypeScript
* Chart.js / Apache ECharts

Deployment:

* Vercel

---

## Backend

Menggunakan **Next.js API Routes (Serverless Functions)** yang di-deploy ke Vercel.

Backend bertugas:

* menerima data dari ESP32,
* memvalidasi data,
* menyimpan ke database,
* menyediakan API untuk dashboard,
* menangani webhook Telegram.

---

## Database

Supabase PostgreSQL

Digunakan untuk:

* Device
* Sensor Logs
* User
* Configuration
* Alert History

---

## Notification

Telegram Bot

---

## Repository

GitHub

---

# 5. System Architecture

```text
                    User
                     │
          ┌──────────┼──────────┐
          │                     │
          ▼                     ▼
   Web Dashboard          Telegram Bot
          │                     │
          └──────────┬──────────┘
                     │
          Next.js API Routes
               (Vercel)
                     │
          ┌──────────┼──────────┐
          │                     │
          ▼                     ▼
   Supabase PostgreSQL      Telegram API
                     ▲
                     │
             HTTPS (JSON)
                     │
                   ESP32
                     │
      SHT31 • Soil • Battery • Solar
```

---

# 6. Hardware

Main Controller

* ESP32 DevKitC V4

Power

* Solar Panel 20Wp
* MPPT Solar Charge Controller
* LiFePO4 12V 6Ah
* LM2596 5V
* LM2596 4V

Communication

* WiFi
* SIM800L (Future Backup)

Sensors

* SHT31
* Capacitive Soil Moisture

Enclosure

* ABS IP65

---

# 7. Functional Requirements

## Device Monitoring

ESP32 harus mengirim:

* Temperature
* Humidity
* Soil Moisture
* Battery Voltage
* Solar Status
* RSSI
* Uptime
* Firmware Version
* Device Status

---

## Dashboard

Dashboard menyediakan:

### Home

* Device Summary
* Online Device
* Offline Device
* Last Update

### Monitoring

* Temperature
* Humidity
* Soil Moisture
* Battery
* Solar

### Charts

* Temperature History
* Humidity History
* Battery History
* Soil History

### Device

* Restart Device
* Device Information
* Firmware Version

---

## Telegram

Command

```
/start
/help
/status
/temp
/humidity
/soil
/battery
/network
/version
```

Notification

* Device Online
* Device Offline
* Battery Low
* Battery Critical
* Sensor Error
* Restart
* Charging Started

---

# 8. API Design

## Device Upload

```
POST

/api/device/upload
```

Body

```json
{
    "deviceId":"ESP32-001",
    "temperature":29.2,
    "humidity":73,
    "soil":61,
    "battery":13.1,
    "solar":"charging",
    "rssi":-55,
    "uptime":3600
}
```

Response

```json
{
    "success":true
}
```

---

## Device Status

```
GET

/api/device/status
```

---

## Device History

```
GET

/api/device/history
```

---

# 9. Database Design

## devices

```
id
device_name
location
firmware_version
status
last_seen
created_at
updated_at
```

---

## sensor_logs

```
id
device_id
temperature
humidity
soil
battery_voltage
solar_status
rssi
created_at
```

---

## alerts

```
id
device_id
type
message
created_at
```

---

# 10. Folder Structure

```text
iot-solar-platform/

firmware/
├── arduino/
└── platformio/

web/
├── app/
├── components/
├── lib/
├── app/api/
├── types/
├── public/
└── package.json

supabase/
├── migrations/
├── schema.sql
└── seed.sql

docs/
├── PRD.md
├── BREAKDOWN.md
├── API.md
├── DATABASE.md
├── HARDWARE.md
├── WIRING.md

README.md
```

---

# 11. Development Phases

## Phase 1

Firmware Foundation

* ESP32
* WiFi
* Logger
* Telegram
* Arduino IDE Support
* PlatformIO Support

Deliverable

Firmware Prototype

---

## Phase 2

Sensor Integration

* SHT31
* Soil Moisture
* Battery Monitoring
* Solar Monitoring

Deliverable

Environmental Monitoring

---

## Phase 3

Cloud Integration

* Supabase Project
* Database Schema
* Next.js API Routes
* Device Authentication

Deliverable

Cloud Connected Device

---

## Phase 4

Dashboard

* Authentication
* Device List
* Charts
* Monitoring Page
* Device Detail

Deliverable

Monitoring Dashboard

---

## Phase 5

Notification

* Telegram Bot
* Alert System
* Device Health

Deliverable

Realtime Notification

---

## Phase 6

Deployment

* Outdoor Installation
* Burn-in Test 72 Jam
* Performance Optimization

Deliverable

Production Ready

---

# 12. Non-Functional Requirements

Reliability

* Running 24/7
* Auto Reconnect
* Watchdog Enabled
* Auto Recovery

Performance

* API Response < 1 second
* Dashboard Load < 3 seconds
* Telegram Reply < 3 seconds

Security

* HTTPS Only
* Environment Variables di Vercel
* Row Level Security (RLS) pada Supabase
* Device API Key untuk autentikasi ESP32
* Tidak menyimpan kredensial database di firmware

Maintainability

* Modular Code
* Clean Architecture
* Reusable Components
* Single Codebase

---

# 13. Success Criteria

Project dinyatakan berhasil apabila:

* ESP32 berjalan minimal 72 jam tanpa restart manual.
* Firmware dapat di-build menggunakan Arduino IDE dan PlatformIO.
* Data sensor berhasil dikirim ke API.
* Data tersimpan di Supabase PostgreSQL.
* Dashboard menampilkan data secara real-time.
* Telegram dapat menerima notifikasi dan merespons command.
* Sistem mendukung penambahan lebih dari satu perangkat tanpa perubahan arsitektur.

---

# 14. Future Roadmap

* OTA Firmware Update
* MQTT Integration
* GPS Tracking
* Rain Sensor
* Light Sensor
* Camera Module (ESP32-CAM)
* Multi User Management
* Multi Location Dashboard
* Predictive Analytics
* AI-based Irrigation Recommendation
* Progressive Web App (PWA)

---

# 15. Project Principles

* **Single Codebase** — Firmware yang sama dapat digunakan di Arduino IDE dan PlatformIO.
* **Serverless First** — Mengutamakan layanan serverless untuk meminimalkan biaya operasional.
* **Security by Default** — Semua komunikasi menggunakan HTTPS dan autentikasi perangkat.
* **Modular Design** — Firmware, dashboard, dan API dipisahkan menjadi modul yang independen.
* **Scalable Architecture** — Siap berkembang dari satu perangkat menjadi banyak perangkat tanpa perubahan besar.
* **Portfolio Quality** — Struktur proyek, dokumentasi, dan implementasi mengikuti praktik yang umum digunakan dalam pengembangan perangkat lunak modern.

Dokumen ini sudah cukup sebagai **PRD utama** dan dapat menjadi acuan implementasi firmware, API, database, dan dashboard secara konsisten. Saya juga menyarankan agar langkah berikutnya adalah membuat **`ARCHITECTURE.md`**, karena dokumen tersebut akan menjelaskan alur komunikasi antar komponen (ESP32, Vercel API, Supabase, Dashboard, dan Telegram) secara lebih teknis sebelum mulai menulis kode.
