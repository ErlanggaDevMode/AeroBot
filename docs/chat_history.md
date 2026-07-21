# Chat History & Project Log

**Date:** July 20, 2026  
**Conversation ID:** `1940e997-81c2-4540-b129-a3fb25a229d2`  
**Role:** Senior IoT Developer  
**Status:** Architecture Implemented & Verified  

---

## 1. Initial Prompt & Objectives
- **Goal:** Build the complete IoT Solar Outdoor Monitoring Platform according to [prd.md](file:///c:/T/AeroBot/docs/prd.md) and [breakdown.md](file:///c:/T/AeroBot/docs/breakdown.md).
- **Core Requirements:** ESP32 DevKitC V4 reading a BME280 sensor, soil moisture, battery, and solar panel status. Data uploaded via WiFi or GSM (SIM800L failover) to Next.js serverless backend on Vercel, stored in Supabase PostgreSQL, and viewable in a premium dark-themed Dashboard with direct Telegram Bot remote control.

---

## 2. Key Design Decisions & Alignment
- **Security Upgrade (BFF Pattern):** 
  - To protect the credentials of outdoor-deployed units, we removed the Telegram Bot Token and Database credentials from the ESP32 firmware entirely. 
  - The ESP32 now uses a lightweight custom `X-API-Key` to upload telemetry to Next.js.
  - The Next.js API Routes handle database transactions, perform threshold alerts, run the Telegram Webhook command parser, and send alerts to the user.
- **Sensor Choice:** Configured to support **BME280 only** for temperature and humidity measurements based on user feedback.
- **Fail-Safe Offline Mode:** Next.js database client includes an in-memory mock database fallback. If Supabase keys are not set up, the system runs with mock data, enabling immediate out-of-the-box local testing.
- **Zero-Dependency Charts:** Custom responsive SVG line charts built directly into the React page to avoid dependency mismatch risks on Next.js v15/16.

---

## 3. Implemented Files & File Structure

### Database Setup
- **[supabase/schema.sql](file:///c:/T/AeroBot/supabase/schema.sql)**: Database tables (`devices`, `sensor_logs`, `alerts`) and performance indexes.

### Next.js Backend & Dashboard (under `/web`)
- **[web/.env.local](file:///c:/T/AeroBot/web/.env.local)**: Template environment configuration.
- **[web/lib/supabase.ts](file:///c:/T/AeroBot/web/lib/supabase.ts)**: REST connector to Supabase with automatic testing mock mode.
- **[web/app/page.tsx](file:///c:/T/AeroBot/web/app/page.tsx)**: Dark-themed glassmorphism monitoring dashboard with circular gauges, remote reboot switches, and SVG history charts.
- **[web/app/layout.tsx](file:///c:/T/AeroBot/web/app/layout.tsx)**: Modern page layout, metadata, and styles.
- **[web/app/api/device/upload/route.ts](file:///c:/T/AeroBot/web/app/api/device/upload/route.ts)**: Secure upload parser, status logger, threshold warning checks, and command processor.
- **[web/app/api/device/status/route.ts](file:///c:/T/AeroBot/web/app/api/device/status/route.ts)**: Fetches current status and last telemetry for all units.
- **[web/app/api/device/history/route.ts](file:///c:/T/AeroBot/web/app/api/device/history/route.ts)**: History log retrieval endpoint for charts.
- **[web/app/api/device/command/route.ts](file:///c:/T/AeroBot/web/app/api/device/command/route.ts)**: Control command queue gateway.
- **[web/app/api/telegram/webhook/route.ts](file:///c:/T/AeroBot/web/app/api/telegram/webhook/route.ts)**: Webhook bot command handler.
- **[web/app/api/cron/check-status/route.ts](file:///c:/T/AeroBot/web/app/api/cron/check-status/route.ts)**: Keep-alive cron checker to log offline warnings.
- **[web/scripts/set-webhook.js](file:///c:/T/AeroBot/web/scripts/set-webhook.js)**: Script to register webhook domain with Telegram API.
- **[web/scripts/test-supabase.js](file:///c:/T/AeroBot/web/scripts/test-supabase.js)**: Supabase connection tester.

### Firmware & Client (under `/TelegramBotTest`)
- **[TelegramBotTest/TelegramBotTest.ino](file:///c:/T/AeroBot/TelegramBotTest/TelegramBotTest.ino)**: Core firmware. Implements task watchdog, BME280/analog sensor reading, WiFi client POST, fall back to GSM GPRS TCP connection, and remote reboot executor.
- **[TelegramBotTest/secrets.h](file:///c:/T/AeroBot/TelegramBotTest/secrets.h)**: Network SSID, target backend host settings, and upload API keys.

---

## 4. Verification & Verification Results
- Tested local server (`npm run dev`) at `http://127.0.0.1:3000` using automated test script **[test-upload.js](file:///c:/T/AeroBot/web/scripts/test-upload.js)**.
- **Outcome:** Passed all 6 checks:
  1. Rejected uploads without API keys (401).
  2. Rejected uploads with incorrect keys (401).
  3. Logged telemetry with valid keys (200).
  4. Processed mock Telegram `/status` command (200).
  5. Processed mock Telegram `/reboot` command, queueing the reboot status in DB (200).
  6. Dispatched and cleared the `reboot` command on the next device upload check (200).

---

## 5. Deployment Instructions (Step-by-Step)

### A. Supabase PostgreSQL
1. Create a project at [supabase.com](https://supabase.com).
2. Go to **SQL Editor** -> **New Query**, paste the code from [schema.sql](file:///c:/T/AeroBot/supabase/schema.sql) and run it.

### B. Next.js App (Vercel)
1. Deploy the `/web` subdirectory to Vercel.
2. In Vercel Project Settings, add these **Environment Variables**:
   - `SUPABASE_URL` (Supabase Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` (Supabase Service Role Key)
   - `TELEGRAM_BOT_TOKEN` (BotFather Token)
   - `TELEGRAM_CHAT_ID` (Your authorized Chat ID)
   - `ESP32_API_KEY` (Keep identical to `secrets.h`)
3. Connect your Vercel webhook via terminal:
   ```bash
   node web/scripts/set-webhook.js <your-vercel-domain-url>
   ```

### C. ESP32 Board
1. Open [TelegramBotTest.ino](file:///c:/T/AeroBot/TelegramBotTest/TelegramBotTest.ino) in Arduino IDE.
2. In [secrets.h](file:///c:/T/AeroBot/TelegramBotTest/secrets.h), customize WiFi SSID/PASS, set `BACKEND_HOST` to your Vercel domain, and upload the code to your ESP32.
