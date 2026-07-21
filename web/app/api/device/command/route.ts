// /web/app/api/device/command/route.ts
// Handles queuing of commands (like 'reboot') to specific devices from the Web Dashboard.

import { NextResponse } from 'next/server';
import { upsertDevice } from '@/lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { deviceId, command } = body;

    if (!deviceId || !command) {
      return NextResponse.json({ error: 'Missing deviceId or command' }, { status: 400 });
    }

    console.log(`🔌 [Command API] Queuing command [${command}] for device [${deviceId}]`);

    await upsertDevice(deviceId, {
      pending_command: command,
    });

    return NextResponse.json({ success: true, message: `Command '${command}' queued successfully.` });
  } catch (error: any) {
    console.error('❌ [Command API] Error queuing command:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
