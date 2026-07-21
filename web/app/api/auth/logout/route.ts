// /web/app/api/auth/logout/route.ts
// Secure API endpoint to clear the administrative session cookie.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST() {
  try {
    const cookieStore = await cookies();
    // Delete session cookie
    cookieStore.delete('__Host-aerobot-session');
    
    console.log('✅ [Auth API] Session successfully cleared.');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ [Auth API] Logout error:', error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
