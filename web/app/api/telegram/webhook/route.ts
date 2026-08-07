// /web/app/api/telegram/webhook/route.ts
// Handles incoming Telegram webhook events.
// Secures the endpoint by checking user Chat ID, parses commands,
// retrieves database status, and queues reboot requests.

import { NextResponse } from 'next/server';
import { getDevices, getSensorLogs, upsertDevice } from '@/lib/supabase';

// Helper: Send message to Telegram API
async function replyToTelegram(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown',
    }),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    // Ignore updates that are not messages or don't have text
    if (!body.message || !body.message.text || !body.message.chat) {
      return NextResponse.json({ ok: true });
    }

    const chatId = body.message.chat.id;
    const chatTitle = body.message.chat.title || '';
    const text = body.message.text.trim();
    const fromName = body.message.from?.first_name || 'User';

    // Extract command ignoring @botusername suffix in groups (e.g. /status@AeroBot -> /status)
    const rawCommand = text.split(' ')[0].split('@')[0].toLowerCase();

    // 1. Authorize User / Group
    const allowedChatIds = (process.env.TELEGRAM_CHAT_ID || '')
      .split(',')
      .map((id) => id.trim());

    if (allowedChatIds.length > 0 && allowedChatIds[0] !== '' && !allowedChatIds.includes(String(chatId))) {
      console.warn(`⚠️ [Telegram Webhook] Unauthorized access attempt from Chat ID: ${chatId} (${chatTitle || 'Private'})`);
      await replyToTelegram(chatId, `❌ *Unauthorized Chat / Group*\nChat ID \`${chatId}\` is not permitted to access this IoT platform.`);
      return NextResponse.json({ ok: true });
    }

    // 2. Query DB state (needed for commands)
    const devices = await getDevices();
    const defaultDevice = devices.length > 0 ? devices[0] : null;

    // Helper to get latest logs
    const getLatestReading = async (deviceId: string) => {
      const logs = await getSensorLogs(deviceId, 1);
      return logs.length > 0 ? logs[0] : null;
    };

    // 3. Command Handler
    if (rawCommand === '/start') {
      let welcome = `Halo *${fromName}* 👋${chatTitle ? ` (Group: *${chatTitle}*)` : ''}\n\n`;
      welcome += `*ESP32 IoT Outdoor System Online*\n\n`;
      welcome += `/status - System Overview\n`;
      welcome += `/temp - Temperature\n`;
      welcome += `/humidity - Humidity\n`;
      welcome += `/soil - Soil Moisture\n`;
      welcome += `/wind - Wind Speed Anemometer\n`;
      welcome += `/battery - Battery Status\n`;
      welcome += `/solar - Solar Status\n`;
      welcome += `/network - Network Info\n`;
      welcome += `/ping - Check Webhook Connection\n`;
      welcome += `/reboot - Force Restart Device\n`;
      welcome += `/version - Firmware Version\n`;
      await replyToTelegram(chatId, welcome);
    } 
    else if (rawCommand === '/help') {
      let help = `*Available Commands:*\n\n`;
      help += `/status, /temp, /humidity, /soil, /wind, /battery, /solar, /network, /ping, /reboot, /version`;
      await replyToTelegram(chatId, help);
    } 
    else if (rawCommand === '/ping') {
      await replyToTelegram(chatId, '🏓 *Pong!*\nNext.js Serverless Webhook is active and responsive.');
    } 
    else if (rawCommand === '/status') {
      if (!defaultDevice) {
        await replyToTelegram(chatId, '⚠️ No devices found in database.');
      } else {
        const reading = await getLatestReading(defaultDevice.id);
        const lastSeen = defaultDevice.last_seen ? new Date(defaultDevice.last_seen) : null;
        const offsetMins = lastSeen ? Math.round((Date.now() - lastSeen.getTime()) / 60000) : null;
        
        let status = `📡 *System Status: ${defaultDevice.device_name}*\n`;
        status += `Status: ${defaultDevice.status === 'online' ? '🟢 Online' : '🔴 Offline'}\n`;
        if (offsetMins !== null) {
          status += `Last Update: ${offsetMins === 0 ? 'Just now' : `${offsetMins} mins ago`}\n`;
        }
        status += `\n`;

        if (reading) {
          status += `🌡️ *Temp:* ${reading.temperature !== null ? `${reading.temperature.toFixed(1)} °C` : 'Error'}\n`;
          status += `💧 *Humidity:* ${reading.humidity !== null ? `${reading.humidity.toFixed(1)} %` : 'Error'}\n`;
          status += `🌱 *Soil Moisture:* ${reading.soil !== null ? `${reading.soil} %` : 'Error'}\n`;
          status += `💨 *Wind Speed:* ${reading.wind_speed !== null && reading.wind_speed !== undefined ? `${reading.wind_speed.toFixed(1)} m/s` : 'N/A'}\n`;
          status += `🔋 *Battery:* ${reading.battery_voltage !== null ? `${reading.battery_voltage.toFixed(2)} V` : 'Error'}\n`;
          status += `☀️ *Solar Panel:* ${reading.solar_status === 'charging' ? '⚡ Charging' : '💤 Idle'}\n`;
          status += `📶 *Signal (RSSI):* ${reading.rssi !== null ? `${reading.rssi} dBm` : 'Unknown'}\n`;
        } else {
          status += `⚠️ No sensor logs received yet.\n`;
        }
        await replyToTelegram(chatId, status);
      }
    } 
    else if (rawCommand === '/temp') {
      if (!defaultDevice) return;
      const reading = await getLatestReading(defaultDevice.id);
      if (reading && reading.temperature !== null) {
        await replyToTelegram(chatId, `🌡️ *Temperature:* ${reading.temperature.toFixed(1)} °C`);
      } else {
        await replyToTelegram(chatId, '❌ Sensor Error: Temperature reading not available.');
      }
    } 
    else if (rawCommand === '/humidity') {
      if (!defaultDevice) return;
      const reading = await getLatestReading(defaultDevice.id);
      if (reading && reading.humidity !== null) {
        await replyToTelegram(chatId, `💧 *Humidity:* ${reading.humidity.toFixed(1)} %`);
      } else {
        await replyToTelegram(chatId, '❌ Sensor Error: Humidity reading not available.');
      }
    } 
    else if (rawCommand === '/soil') {
      if (!defaultDevice) return;
      const reading = await getLatestReading(defaultDevice.id);
      if (reading && reading.soil !== null) {
        await replyToTelegram(chatId, `🌱 *Soil Moisture:* ${reading.soil} %`);
      } else {
        await replyToTelegram(chatId, '❌ Sensor Error: Soil moisture reading not available.');
      }
    } 
    else if (rawCommand === '/wind') {
      if (!defaultDevice) return;
      const reading = await getLatestReading(defaultDevice.id);
      if (reading && reading.wind_speed !== null && reading.wind_speed !== undefined) {
        const kmh = (reading.wind_speed * 3.6).toFixed(1);
        await replyToTelegram(chatId, `💨 *Wind Speed (Anemometer):*\nSpeed: *${reading.wind_speed.toFixed(1)} m/s* (${kmh} km/h)`);
      } else {
        await replyToTelegram(chatId, '❌ Sensor Error: Wind speed reading not available.');
      }
    } 
    else if (rawCommand === '/battery') {
      if (!defaultDevice) return;
      const reading = await getLatestReading(defaultDevice.id);
      if (reading && reading.battery_voltage !== null) {
        const pct = reading.battery_voltage >= 13.6 ? 100 : reading.battery_voltage <= 10.0 ? 0 : Math.round((reading.battery_voltage - 10.0) * (100 / 3.6));
        await replyToTelegram(chatId, `🔋 *Battery Status:*\nVoltage: ${reading.battery_voltage.toFixed(2)} V\nPercentage: ${pct}%`);
      } else {
        await replyToTelegram(chatId, '❌ Battery voltage monitoring not available.');
      }
    } 
    else if (rawCommand === '/solar') {
      if (!defaultDevice) return;
      const reading = await getLatestReading(defaultDevice.id);
      if (reading) {
        await replyToTelegram(chatId, `☀️ *Solar Panel Status:*\nState: ${reading.solar_status === 'charging' ? '⚡ Charging' : '💤 Idle'}`);
      } else {
        await replyToTelegram(chatId, '❌ Solar panel status not available.');
      }
    } 
    else if (rawCommand === '/network') {
      if (!defaultDevice) return;
      const reading = await getLatestReading(defaultDevice.id);
      let net = `📶 *Network Status:*\n`;
      net += `ESP32 Status: ${defaultDevice.status === 'online' ? '🟢 Online' : '🔴 Offline'}\n`;
      if (reading && reading.rssi !== null) {
        net += `WiFi Strength (RSSI): ${reading.rssi} dBm`;
      }
      await replyToTelegram(chatId, net);
    } 
    else if (rawCommand === '/reboot') {
      if (!defaultDevice) {
        await replyToTelegram(chatId, '⚠️ No devices found to reboot.');
      } else {
        await upsertDevice(defaultDevice.id, { pending_command: 'reboot' });
        await replyToTelegram(chatId, `🔄 *Reboot Queue Command*\nReboot command is successfully queued by *${fromName}* for device \`${defaultDevice.id}\`.\nIt will execute on the next upload cycle.`);
      }
    } 
    else if (rawCommand === '/version') {
      if (defaultDevice) {
        await replyToTelegram(chatId, `🏷️ *Firmware Version:* ${defaultDevice.firmware_version || '1.0'}`);
      } else {
        await replyToTelegram(chatId, '🏷️ *Firmware Version:* 1.1 (Default)');
      }
    } 
    else {
      await replyToTelegram(chatId, '❓ *Unknown Command*\nUse /help to list available commands.');
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error('❌ [Telegram Webhook API] Fatal Error:', error);
    return NextResponse.json({ error: 'Internal Error', details: error.message }, { status: 500 });
  }
}
