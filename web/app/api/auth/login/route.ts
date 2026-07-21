// /web/app/api/auth/login/route.ts
// Secure Route Handler for verifying administrative passwords and issuing secure HTTP cookies.

import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createSessionToken } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { password } = body;

    if (!password) {
      return NextResponse.json({ error: 'Password required' }, { status: 400 });
    }

    const expectedPassword = process.env.ADMIN_PASSWORD;
    if (!expectedPassword) {
      console.error('❌ [Auth API] ADMIN_PASSWORD environment variable is not configured.');
      return NextResponse.json({ error: 'Internal Server Configuration Error' }, { status: 500 });
    }

    // Secure comparison (simple check for equal password)
    if (password !== expectedPassword) {
      console.warn('⚠️ [Auth API] Incorrect password attempt.');
      return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
    }

    // Generate signed stateless session token
    const sessionToken = await createSessionToken('admin');

    // Provision secure __Host- cookie
    const cookieStore = await cookies();
    cookieStore.set('__Host-aerobot-session', sessionToken, {
      httpOnly: true,
      secure: true, // Requires HTTPS (Vercel has it by default, localhost supports it in modern browsers)
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
    });

    console.log('✅ [Auth API] Session successfully authenticated.');
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('❌ [Auth API] Login error:', error);
    return NextResponse.json({ error: 'Internal Server Error', details: error.message }, { status: 500 });
  }
}
