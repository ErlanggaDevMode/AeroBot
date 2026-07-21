// /web/middleware.ts
// Next.js Edge Middleware to intercept unauthorized attempts to reach dashboard views or command endpoints.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifySessionToken } from './lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const sessionToken = request.cookies.get('__Host-aerobot-session')?.value;

  // Verify cookie validity
  const isValid = await verifySessionToken(sessionToken);

  // If already logged in and attempting to access the login page, redirect to Dashboard
  if (pathname === '/login') {
    if (isValid) {
      return NextResponse.redirect(new URL('/', request.url));
    }
    return NextResponse.next();
  }

  // Intercept unauthorized requests to protected paths (Dashboard and commands)
  if (!isValid) {
    console.warn(`🔒 [Middleware] Unauthorized request to [${pathname}]. Redirecting to /login`);
    const loginUrl = new URL('/login', request.url);
    // Remove session cookie if it was expired/corrupt to prevent loop issues
    const response = NextResponse.redirect(loginUrl);
    response.cookies.delete('__Host-aerobot-session');
    return response;
  }

  return NextResponse.next();
}

// Scoping middleware matching paths
export const config = {
  matcher: [
    '/',
    '/login',
    '/api/device/command',
  ],
};
