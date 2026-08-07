// /web/app/api/device/status/route.ts
// Returns active metadata and the latest telemetry record for all registered devices.

import { NextResponse } from 'next/server';
import { getDevices, getSensorLogs } from '@/lib/supabase';

export async function GET() {
  try {
    let devices = await getDevices();

    // Single-device filter: Ensure main-esp32 is present and prioritized
    if (devices.length > 0) {
      const mainDev = devices.find((d) => d.id === 'main-esp32');
      if (mainDev) {
        devices = [mainDev];
      } else {
        // Filter out old test devices if main-esp32 exists
        devices = devices.filter((d) => d.id === 'main-esp32');
        if (devices.length === 0) {
          devices = [{
            id: 'main-esp32',
            device_name: 'AeroBot Solar Station (main-esp32)',
            location: 'Outdoor Field Station',
            firmware_version: '1.2',
            status: 'offline',
            last_seen: null,
            pending_command: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }];
        }
      }
    }

    // Fetch latest sensor reading for the primary device
    const devicesWithLogs = await Promise.all(
      devices.map(async (device) => {
        const logs = await getSensorLogs(device.id, 1);
        return {
          ...device,
          latest_log: logs.length > 0 ? logs[0] : null,
        };
      })
    );

    return NextResponse.json(devicesWithLogs);
  } catch (error: any) {
    console.error('❌ [Status API] Error fetching status:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
