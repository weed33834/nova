/**
 * API route handler wrapper with request ID correlation, metrics, and error handling.
 *
 * Wraps Next.js App Router route handlers to:
 *  1. Extract or generate a request ID from the `x-request-id` header
 *  2. Run the handler within an AsyncLocalStorage context so all log lines
 *     emitted inside it carry the `requestId` field automatically
 *  3. Record HTTP metrics (method, route, status, duration) for Prometheus
 *  4. Catch unhandled errors and return a structured 500 response
 *
 * Usage:
 * ```ts
 * export const POST = withApiHandler(async (req, ctx) => {
 *   ctx.log.info('Processing request');
 *   return apiSuccess({ data: 'ok' });
 * }, { rateLimit: 'generation' });
 * ```
 */
import type { NextRequest } from 'next/server';
import { createLogger, runWithRequestId, type Logger } from '@/lib/logger';
import { apiError, apiErrorLogged } from './api-response';
import { checkRateLimitPreset, rateLimitedResponse, type RateLimitResult } from './rate-limit';
import { recordHttpRequest } from './metrics';

export interface ApiHandlerContext {
  /** The request ID for this request. */
  requestId: string;
  /** A logger pre-bound with the request ID. */
  log: Logger;
}

export interface WithApiHandlerOptions {
  /** Rate limit preset to apply. If omitted, no rate limiting. */
  rateLimit?: 'generation' | 'moderate' | 'light' | 'media' | 'auth';
  /** Rate limit scope name (defaults to the route path). */
  rateLimitScope?: string;
  /** Whether to record metrics for this handler (default: true). */
  metrics?: boolean;
}

/**
 * Wrap a POST/PUT/PATCH/DELETE/GET handler with request ID, metrics, and error handling.
 */
export function withApiHandler<T extends unknown[]>(
  handler: (req: NextRequest, ctx: ApiHandlerContext, ...args: T) => Promise<Response>,
  options?: WithApiHandlerOptions,
): (req: NextRequest, ...args: T) => Promise<Response> {
  return async (req: NextRequest, ...args: T) => {
    const requestId = req.headers.get('x-request-id') ?? crypto.randomUUID().slice(0, 8);
    const route = req.nextUrl.pathname;

    // ── Rate limiting ────────────────────────────────────────────────────
    if (options?.rateLimit) {
      const scope = options.rateLimitScope ?? route;
      const result: RateLimitResult = await checkRateLimitPreset(req, options.rateLimit, scope);
      if (result.limited) {
        if (options.metrics !== false) {
          recordHttpRequest(req.method, route, 429, 0);
        }
        const res = rateLimitedResponse(result);
        res.headers.set('x-request-id', requestId);
        return res;
      }
    }

    const start = Date.now();

    return runWithRequestId(requestId, async () => {
      const log = createLogger('API').child({ requestId, route });
      const ctx: ApiHandlerContext = { requestId, log };

      try {
        const res = await handler(req, ctx, ...args);

        // Ensure request ID is in the response headers
        if (!res.headers.has('x-request-id')) {
          res.headers.set('x-request-id', requestId);
        }

        if (options?.metrics !== false) {
          recordHttpRequest(req.method, route, res.status, Date.now() - start);
        }

        return res;
      } catch (err) {
        const duration = Date.now() - start;
        if (options?.metrics !== false) {
          recordHttpRequest(req.method, route, 500, duration);
        }

        if (err instanceof Error && err.name === 'AuthRequiredError') {
          const res = apiError('INVALID_CREDENTIALS', 401, 'Authentication required');
          res.headers.set('x-request-id', requestId);
          return res;
        }

        if (err instanceof Error && err.name === 'ForbiddenError') {
          const res = apiError('INVALID_REQUEST', 403, err.message);
          res.headers.set('x-request-id', requestId);
          return res;
        }

        log.error('Unhandled error in API handler', err);
        const res = apiErrorLogged(
          'INTERNAL_ERROR',
          500,
          'Internal server error',
          { cause: err, context: route, label: 'ApiHandler' },
        );
        res.headers.set('x-request-id', requestId);
        return res;
      }
    });
  };
}
