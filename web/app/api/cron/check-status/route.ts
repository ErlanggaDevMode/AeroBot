// /web/app/api/cron/check-status/route.ts
// Cron job designed to run every few minutes (via Vercel Cron).
// Checks for devices that haven't been seen recently, marks them offline, and fires Telegram alerts.

import { NextResponse } from 'next/server';
import { getDevices, upsertDevice, insertAlert } from '@/lib/supabase';

// Helper: Dispatch message to Telegram Bot API
async function sendTelegramNotification(message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId || token.includes('8920961595:') && token.startsWith('your')) {
    console.warn('⚠️ [Telegram Cron] Token/ChatID not configured. Skipping alert.');
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
    console.error('❌ [Telegram Cron] Error dispatching message:', error);
    return false;
  }
}

export async function GET(request: Request) {
  try {
    // Basic verification to ensure this is authorized (e.g. Vercel Cron sends a specific signature header)
    // For simplicity, we run the scan.
    const devices = await getDevices();
    const offlineThresholdMins = 5;
    const now = Date.now();
    let offlineCount = 0;

    console.log(`⏱️ [Cron Job] Scanning ${devices.length} devices for inactivity...`);

    for (const device of devices) {
      if (device.status === 'online' && device.last_seen) {
        const lastSeenTime = new Date(device.last_seen).getTime();
        const inactiveDurationMins = (now - lastSeenTime) / 60000;

        if (inactiveDurationMins >= offlineThresholdMins) {
          console.warn(`🚨 [Cron Job] Device [${device.id}] is inactive for ${inactiveDurationMins.toFixed(1)} mins. Marking offline.`);
          
          // Mark as offline in DB
          await upsertDevice(device.id, { status: 'offline' });

          // Log Alert
          const msg = `⚠️ *Device Offline Alert!*\nDevice: \`${device.id}\` (${device.device_name})\nLocation: ${device.location || 'Unknown'}\nLast seen: ${inactiveDurationMins.toFixed(0)} minutes ago.`;
          await insertAlert({
            device_id: device.id,
            type: 'device_offline',
            message: msg,
          });

          // Dispatch notification
          await sendTelegramNotification(msg);
          offlineCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      scanned: devices.length,
      markedOffline: offlineCount,
    });
  } catch (error: any) {
    console.error('❌ [Cron Job] Error in status scanning:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
