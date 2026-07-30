import { cookies } from 'next/headers';
import { timingSafeEqual } from 'crypto';
import type { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createAccessToken } from '@/lib/server/access-token';
import { withApiHandler } from '@/lib/server/api-handler';

export const POST = withApiHandler(async (req: NextRequest) => {
  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    return apiSuccess({ valid: true });
  }

  let body: { code?: string };
  try {
    body = await req.json();
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  // Constant-time comparison
  if (!body.code) {
    return apiError('INVALID_REQUEST', 401, 'Invalid access code');
  }
  const encoder = new TextEncoder();
  const a = encoder.encode(body.code);
  const b = encoder.encode(accessCode);
  if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
    return apiError('INVALID_REQUEST', 401, 'Invalid access code');
  }

  const token = createAccessToken(accessCode);
  const cookieStore = await cookies();
  cookieStore.set('nova_access', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    secure: process.env.NODE_ENV === 'production',
  });

  return apiSuccess({ valid: true });
}, { rateLimit: 'auth' });
