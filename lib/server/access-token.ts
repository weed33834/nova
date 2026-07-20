import { createHmac, timingSafeEqual } from 'crypto';

const ACCESS_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Create an HMAC-signed token: `timestamp.signature` */
export function createAccessToken(accessCode: string): string {
  const timestamp = Date.now().toString();
  const signature = createHmac('sha256', accessCode).update(timestamp).digest('hex');
  return `${timestamp}.${signature}`;
}

/** Verify an HMAC-signed token against the access code */
export function verifyAccessToken(token: string, accessCode: string): boolean {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return false;

  const timestamp = token.substring(0, dotIndex);
  const signature = token.substring(dotIndex + 1);
  if (!/^\d+$/.test(timestamp)) return false;

  const issuedAt = Number(timestamp);
  const now = Date.now();
  if (
    !Number.isSafeInteger(issuedAt) ||
    issuedAt > now ||
    now - issuedAt > ACCESS_TOKEN_MAX_AGE_MS
  ) {
    return false;
  }

  const expected = createHmac('sha256', accessCode).update(timestamp).digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length) return false;

  return timingSafeEqual(sigBuf, expBuf);
}
