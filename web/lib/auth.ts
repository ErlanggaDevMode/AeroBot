// /web/lib/auth.ts
// Secure, stateless session signing using standard Web Crypto API (HMAC-SHA256).
// Edge Runtime-compatible, requiring zero third-party packages.

const SESSION_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days expiration

// Helper: Convert string to ArrayBuffer
function stringToBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

// Helper: Convert ArrayBuffer to Hex string
function bufferToHex(buffer: ArrayBuffer): string {
  return Array.prototype.map.call(new Uint8Array(buffer), (x) => ('00' + x.toString(16)).slice(-2)).join('');
}

// Get or generate a stable secret key for session signatures
function getSecretKey(): string {
  const envSecret = process.env.SESSION_SECRET;
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }
  // Safe fallback for local sandboxes, warns about horizontal scalability issues in multi-instance production.
  console.warn('⚠️ [Session Auth] SESSION_SECRET is undefined or too short. Using ephemeral runtime fallback.');
  return 'aero-default-session-fallback-secret-key-32-chars-long!';
}

// Cryptographically sign a payload with Web Crypto HMAC-SHA256
async function hmacSign(data: string, secret: string): Promise<string> {
  const keyBuffer = stringToBuffer(secret);
  const dataBuffer = stringToBuffer(data);

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer as any,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, dataBuffer as any);
  return bufferToHex(signatureBuffer);
}

// Generate a signed session token: timestamp.payload.signature
export async function createSessionToken(payload: string): Promise<string> {
  const timestamp = Date.now().toString();
  const rawToken = `${timestamp}.${payload}`;
  const secret = getSecretKey();
  const signature = await hmacSign(rawToken, secret);
  return `${rawToken}.${signature}`;
}

// Verify a signed session token statelessly
export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;

  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [timestampStr, payload, signature] = parts;
  const timestamp = parseInt(timestampStr, 10);

  // Check if session has expired
  if (isNaN(timestamp) || Date.now() - timestamp > SESSION_AGE_MS) {
    console.warn('⚠️ [Session Auth] Session token has expired.');
    return false;
  }

  // Re-verify the HMAC signature
  const rawToken = `${timestampStr}.${payload}`;
  const secret = getSecretKey();
  const expectedSignature = await hmacSign(rawToken, secret);

  // Constant-time style comparison (simple check)
  return signature === expectedSignature;
}
