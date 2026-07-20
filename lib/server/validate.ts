import { z } from 'zod';
import { apiError, API_ERROR_CODES } from './api-response';

export function validateBody<T>(schema: z.ZodType<T>, body: unknown) {
  const result = schema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return {
      ok: false as const,
      response: apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid request body', details),
    };
  }
  return { ok: true as const, data: result.data };
}
