// /web/app/api/device/status/route.ts
// Returns active metadata and the latest telemetry record for all registered devices.

import { NextResponse } from 'next/server';
import { getDevices, getSensorLogs } from '@/lib/supabase';

export async function GET() {
  try {
    const devices = await getDevices();
    
    // Fetch latest sensor reading for each device
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
