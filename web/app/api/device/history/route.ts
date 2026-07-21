// /web/app/api/device/history/route.ts
// Returns historical sensor logs for charting.
// Query Params:
//   - deviceId (string, required): ID of the device
//   - limit (number, optional): Maximum logs to retrieve (default: 50, max: 200)

import { NextResponse } from 'next/server';
import { getSensorLogs } from '@/lib/supabase';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const deviceId = searchParams.get('deviceId');
    const limitParam = searchParams.get('limit');

    if (!deviceId) {
      return NextResponse.json({ error: 'Missing deviceId parameter' }, { status: 400 });
    }

    let limit = 50;
    if (limitParam) {
      const parsed = parseInt(limitParam, 10);
      if (!isNaN(parsed) && parsed > 0) {
        limit = Math.min(parsed, 200); // cap at 200
      }
    }

    const logs = await getSensorLogs(deviceId, limit);
    return NextResponse.json(logs);
  } catch (error: any) {
    console.error('❌ [History API] Error fetching history:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
