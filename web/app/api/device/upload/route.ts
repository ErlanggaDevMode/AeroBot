// /web/app/api/device/upload/route.ts
// Handles secure HTTP POST uploads of telemetry data from ESP32.
// Implements API-key authentication, database logging, threshold monitoring, and Telegram notification dispatch.

import { NextResponse } from 'next/server';
import { upsertDevice, insertSensorLog, insertAlert, getAlerts, getDevice } from '@/lib/supabase';

// Helper: Dispatch message to Telegram Bot API
async function sendTelegramNotification(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId || token.includes('8920961595:') && token.startsWith('your')) {
    console.warn('⚠️ [Telegram Bot] Token/ChatID not configured or is a placeholder. Skipping notification.');
    return false;
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'Markdown',
      }),
    });
    return res.ok;
  } catch (error) {
    console.error('❌ [Telegram Bot] Error dispatching message:', error);
    return false;
  }
}

export async function POST(request: Request) {
  try {
    // 1. Authenticate Request
    const apiKey = request.headers.get('X-API-Key');
    const expectedKey = process.env.ESP32_API_KEY;

    if (!expectedKey) {
      console.error('❌ [Upload API] ESP32_API_KEY environment variable is not defined.');
      return NextResponse.json({ error: 'Internal Server Configuration Error' }, { status: 500 });
    }

    if (apiKey !== expectedKey) {
      console.warn(`⚠️ [Upload API] Unauthorized attempt with key: ${apiKey}`);
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Parse and Validate Request Body
    const body = await request.json();
    const { deviceId, temperature, humidity, soil, battery, solar, rssi, uptime, version } = body;

    if (!deviceId || typeof deviceId !== 'string') {
      return NextResponse.json({ error: 'Invalid deviceId' }, { status: 400 });
    }

    // Parse values safely (supporting floats and checking for NaN)
    const tempVal = typeof temperature === 'number' && !isNaN(temperature) ? temperature : null;
    const humVal = typeof humidity === 'number' && !isNaN(humidity) ? humidity : null;
    const soilVal = typeof soil === 'number' && !isNaN(soil) ? soil : null;
    const batVal = typeof battery === 'number' && !isNaN(battery) ? battery : null;
    const solarVal = typeof solar === 'string' ? solar : 'unknown';
    const rssiVal = typeof rssi === 'number' ? rssi : null;
    const fVersion = typeof version === 'string' ? version : '1.0';

    console.log(`📡 [Upload API] Received telemetry from [${deviceId}]: Temp: ${tempVal}°C, Bat: ${batVal}V, Solar: ${solarVal}`);

    // Fetch existing device state to inspect transitions
    const deviceState = await getDevice(deviceId);
    const wasOffline = !deviceState || deviceState.status === 'offline';

    // 3. Update Device Metadata & Get Queue Command
    const deviceUpdates: any = {
      status: 'online',
      firmware_version: fVersion,
      last_seen: new Date().toISOString(),
    };

    // Populate default name only if the device is registered for the first time
    if (!deviceState) {
      deviceUpdates.device_name = `ESP32 Device (${deviceId})`;
    }

    const updatedDevice = await upsertDevice(deviceId, deviceUpdates);

    const pendingCommand = updatedDevice.pending_command;

    // 4. Log Sensor Telemetry
    await insertSensorLog({
      device_id: deviceId,
      temperature: tempVal,
      humidity: humVal,
      soil: soilVal,
      battery_voltage: batVal,
      solar_status: solarVal,
      rssi: rssiVal,
    });

    // 5. Run Alert Checks and State Transitions
    const notifications: string[] = [];

    // Device Online Transition
    if (wasOffline) {
      notifications.push(`🟢 *Device Online*\nDevice \`${deviceId}\` has successfully connected to the cloud.`);
    }

    // Battery Checking Logic
    if (batVal !== null && batVal > 1.0) {
      const recentAlerts = await getAlerts(deviceId, 5);

      // Low Battery Check (< 11.5V)
      const hasRecentLow = recentAlerts.some((a) => a.type === 'battery_low' && new Date(a.created_at).getTime() > Date.now() - 4 * 60 * 60 * 1000);
      if (batVal < 11.5) {
        if (!hasRecentLow) {
          const msg = `🪫 *Alert: Low Battery!*\nDevice: \`${deviceId}\`\nVoltage: ${batVal.toFixed(2)}V\nPlease check the solar charging status.`;
          await insertAlert({ device_id: deviceId, type: 'battery_low', message: msg });
          notifications.push(msg);
        }
      }

      // Critical Battery Check (< 11.0V)
      const hasRecentCrit = recentAlerts.some((a) => a.type === 'battery_critical' && new Date(a.created_at).getTime() > Date.now() - 2 * 60 * 60 * 1000);
      if (batVal < 11.0) {
        if (!hasRecentCrit) {
          const msg = `🚨 *CRITICAL: Battery Critical!*\nDevice: \`${deviceId}\`\nVoltage: ${batVal.toFixed(2)}V\nSystem will enter power-save mode soon.`;
          await insertAlert({ device_id: deviceId, type: 'battery_critical', message: msg });
          notifications.push(msg);
        }
      }
    }

    // Sensor Malfunction Detection
    if (tempVal === null || humVal === null) {
      const recentAlerts = await getAlerts(deviceId, 3);
      const hasRecentError = recentAlerts.some((a) => a.type === 'sensor_error' && new Date(a.created_at).getTime() > Date.now() - 60 * 60 * 1000);
      if (!hasRecentError) {
        const msg = `❌ *Sensor Error*\nDevice: \`${deviceId}\`\nBME280 sensor values are read as NaN/Error.`;
        await insertAlert({ device_id: deviceId, type: 'sensor_error', message: msg });
        notifications.push(msg);
      }
    }

    // Send gathered notification alerts
    for (const notification of notifications) {
      await sendTelegramNotification(notification);
    }

    // 6. Handle & Clear Pending Command Response
    if (pendingCommand) {
      console.log(`🔌 [Upload API] Dispatching command [${pendingCommand}] to [${deviceId}]`);
      await upsertDevice(deviceId, { pending_command: null });
      return NextResponse.json({
        success: true,
        command: pendingCommand,
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ [Upload API] Fatal Error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
