import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { apiSuccess } from '@/lib/server/api-response';
import { verifyAccessToken } from '@/lib/server/access-token';
import { withApiHandler } from '@/lib/server/api-handler';

export const GET = withApiHandler(async (req: NextRequest) => {
  const accessCode = process.env.ACCESS_CODE;
  const enabled = !!accessCode;

  let authenticated = false;
  if (enabled) {
    const cookieStore = await cookies();
    const token = cookieStore.get('nova_access')?.value;
    authenticated = !!token && verifyAccessToken(token, accessCode);
  }

  return apiSuccess({ enabled, authenticated });
}, { rateLimit: 'light' });
