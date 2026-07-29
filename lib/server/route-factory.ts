/**
 * Declarative API route factory — enterprise-grade wrappers for Next.js App Router.
 *
 * Provides higher-level helpers that combine `withApiHandler` (rate limiting,
 * metrics, error handling, request ID) with Zod input validation, producing
 * a single declarative API for route creation.
 *
 * Usage:
 * ```ts
 * import { createPostRoute } from '@/lib/server/route-factory';
 * import { z } from 'zod';
 *
 * const InputSchema = z.object({ topic: z.string().min(1) });
 *
 * export const POST = createPostRoute({
 *   rateLimit: 'generation',
 *   bodySchema: InputSchema,
 *   handler: async (req, ctx, body) => {
 *     ctx.log.info('Creating classroom', { topic: body.topic });
 *     return apiSuccess({ id: 'cls-1' });
 *   },
 * });
 * ```
 *
 * This replaces the ad-hoc pattern of manually calling checkRateLimit,
 * parsing JSON, validating with Zod, wrapping in try/catch, etc.
 */
import type { NextRequest } from 'next/server';
import type { ZodSchema, z } from 'zod';
import { withApiHandler, type ApiHandlerContext, type WithApiHandlerOptions } from './api-handler';
import { apiError, apiSuccess } from './api-response';
import { extractPagination, paginateArray, type PaginationParams, type PaginatedResult } from './pagination';

// Re-export for convenience
export { apiError, apiSuccess, type ApiHandlerContext };
export { extractPagination, paginateArray, type PaginationParams, type PaginatedResult };

// ── Types ───────────────────────────────────────────────────────────────────

type RouteHandler<TBody = unknown, TQuery = unknown> = (
  req: NextRequest,
  ctx: ApiHandlerContext,
  body: TBody,
  query: TQuery,
) => Promise<Response>;

type GetHandler<TQuery = unknown> = (
  req: NextRequest,
  ctx: ApiHandlerContext,
  query: TQuery,
) => Promise<Response>;

interface RouteOptions extends WithApiHandlerOptions {
  /** Zod schema for the JSON request body (POST/PUT/PATCH only). */
  bodySchema?: ZodSchema;
  /** Zod schema for query parameters. */
  querySchema?: ZodSchema;
  /** Maximum body size in bytes (default: 1MB). */
  maxBodyBytes?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const DEFAULT_MAX_BODY_BYTES = 1_024 * 1_024; // 1 MB

/**
 * Parse and validate the JSON body of a request against a Zod schema.
 * Returns either the validated data or an error Response.
 */
async function parseBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>,
  maxBytes: number,
): Promise<{ data: T | null; error: Response | null }> {
  const contentLength = parseInt(req.headers.get('content-length') || '0', 10);
  if (contentLength > maxBytes) {
    return {
      data: null,
      error: apiError(
        'INVALID_REQUEST',
        413,
        'Request body too large',
        `Maximum ${maxBytes} bytes, received ${contentLength}`,
      ),
    };
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      data: null,
      error: apiError('INVALID_REQUEST', 400, 'Invalid JSON body'),
    };
  }

  const result = schema.safeParse(raw);
  if (!result.success) {
    const firstError = result.error.issues[0];
    const message = firstError
      ? `${firstError.path.join('.')}: ${firstError.message}`
      : 'Validation failed';
    return {
      data: null,
      error: apiError('VALIDATION_ERROR', 400, 'Invalid request body', message),
    };
  }

  return { data: result.data, error: null };
}

/**
 * Parse and validate query parameters against a Zod schema.
 * Returns either the validated data or null (if no schema).
 */
function parseQuery<T>(req: NextRequest, schema: ZodSchema<T> | undefined): T | null {
  if (!schema) return null as T;

  const url = new URL(req.url);
  const params: Record<string, string | string[]> = {};
  for (const [key, value] of url.searchParams.entries()) {
    if (key in params) {
      const existing = params[key];
      params[key] = Array.isArray(existing) ? [...existing, value] : [existing, value];
    } else {
      params[key] = value;
    }
  }

  const result = schema.safeParse(params);
  return result.success ? result.data : null;
}

// ── Route factories ─────────────────────────────────────────────────────────

/**
 * Create a POST route with validation, rate limiting, and error handling.
 */
export function createPostRoute<TBody = unknown, TQuery = unknown>(
  options: RouteOptions & { handler: RouteHandler<TBody, TQuery> },
) {
  return withApiHandler(async (req, ctx) => {
    let body: TBody;
    if (options.bodySchema) {
      const { data, error } = await parseBody(req, options.bodySchema, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES);
      if (error) return error;
      body = data as TBody;
    } else {
      try {
        body = (await req.json()) as TBody;
      } catch {
        return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
      }
    }

    const query = parseQuery(req, options.querySchema) as TQuery;
    return options.handler(req, ctx, body, query);
  }, options);
}

/**
 * Create a PUT route with validation, rate limiting, and error handling.
 */
export function createPutRoute<TBody = unknown, TQuery = unknown>(
  options: RouteOptions & { handler: RouteHandler<TBody, TQuery> },
) {
  return createPostRoute(options);
}

/**
 * Create a PATCH route with validation, rate limiting, and error handling.
 */
export function createPatchRoute<TBody = unknown, TQuery = unknown>(
  options: RouteOptions & { handler: RouteHandler<TBody, TQuery> },
) {
  return createPostRoute(options);
}

/**
 * Create a DELETE route with rate limiting and error handling.
 */
export function createDeleteRoute<TQuery = unknown>(
  options: Omit<RouteOptions, 'bodySchema' | 'maxBodyBytes'> & {
    handler: GetHandler<TQuery>;
  },
) {
  return withApiHandler(async (req, ctx) => {
    const query = parseQuery(req, options.querySchema) as TQuery;
    return options.handler(req, ctx, query);
  }, options);
}

/**
 * Create a GET route with rate limiting, error handling, and optional query validation.
 */
export function createGetRoute<TQuery = unknown>(
  options: Omit<RouteOptions, 'bodySchema' | 'maxBodyBytes'> & {
    handler: GetHandler<TQuery>;
  },
) {
  return withApiHandler(async (req, ctx) => {
    const query = parseQuery(req, options.querySchema) as TQuery;
    return options.handler(req, ctx, query);
  }, options);
}

/**
 * Create a paginated GET route that automatically handles pagination parameters.
 */
export function createPaginatedGetRoute<TItem>(
  options: Omit<RouteOptions, 'bodySchema' | 'maxBodyBytes' | 'querySchema'> & {
    handler: (
      req: NextRequest,
      ctx: ApiHandlerContext,
      pagination: PaginationParams,
    ) => Promise<PaginatedResult<TItem> | Response>;
  },
) {
  return withApiHandler(async (req, ctx) => {
    const pagination = extractPagination(req);
    const result = await options.handler(req, ctx, pagination);
    if (result instanceof Response) return result;
    return apiSuccess({
      items: result.items,
      pagination: result.pagination,
    });
  }, options);
}
