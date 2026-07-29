import { type NextRequest } from 'next/server';
import { createUserWithCredentials } from '@/lib/auth/config';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import { recordAuditLog } from '@/lib/db/audit';
import { createLogger } from '@/lib/logger';
import { checkRateLimitPreset, rateLimitedResponse } from '@/lib/server/rate-limit';

const log = createLogger('Signup API');

/**
 * Email + password sign-up. Creates a user with the `user` role and returns
 * enough info for the client to immediately sign in via NextAuth credentials.
 *
 * Intentionally simple: no email verification flow (Phase 3B baseline).
 * Email verification can be layered on later via NextAuth's EmailProvider.
 */
export async function POST(req: NextRequest) {
  const rlResult = await checkRateLimitPreset(req, 'auth', 'signup');
  if (rlResult.limited) return rateLimitedResponse(rlResult);
  try {
    const body = (await req.json()) as {
      email?: string;
      password?: string;
      name?: string;
    };

    if (!body.email || !body.password) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Email and password are required');
    }

    const user = await createUserWithCredentials(body.email, body.password, body.name);

    recordAuditLog({
      actorId: user.id,
      actorRole: user.role,
      action: 'user.signup',
      entityType: 'user',
      entityId: user.id,
      details: { email: user.email },
      ipAddress: req.headers.get('x-forwarded-for') || req.nextUrl.hostname,
      userAgent: req.headers.get('user-agent'),
    });

    log.info(`User signed up: ${user.email}`);
    return apiSuccess({ id: user.id, email: user.email, role: user.role }, 201);
  } catch (error) {
    const message = sanitizedErrorDetails(error);
    if (message.includes('already exists')) {
      return apiError('EMAIL_TAKEN', 409, message);
    }
    if (message.includes('Password') || message.includes('Email')) {
      return apiError('VALIDATION_ERROR', 400, message);
    }
    log.error('Signup failed:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to create user', message);
  }
}
