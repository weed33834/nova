/**
 * CORS (Cross-Origin Resource Sharing) configuration.
 *
 * Provides a centralized CORS policy that can be used by:
 * 1. The Edge proxy (proxy.ts) — adds CORS headers to all responses
 * 2. Individual API routes — via `withCors()` helper for preflight handling
 *
 * Configuration via environment variables:
 * - `CORS_ALLOWED_ORIGINS`: comma-separated list of allowed origins
 *   (default: same-origin only via the request's host)
 * - `CORS_ALLOWED_METHODS`: comma-separated HTTP methods (default: standard set)
 * - `CORS_ALLOWED_HEADERS`: comma-separated header names (default: standard set)
 * - `CORS_MAX_AGE`: preflight cache duration in seconds (default: 86400 = 24h)
 *
 * Security notes:
 * - In production, CORS_ALLOWED_ORIGINS should be set to explicit domains.
 * - `Access-Control-Allow-Credentials` is true because we use cookies for auth.
 * - Wildcard (*) is NOT used because credentials mode requires explicit origins.
 */

const DEFAULT_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const DEFAULT_HEADERS =
  'Content-Type, Authorization, X-API-Key, X-Image-Provider, X-Image-Model, X-Video-Provider, X-Video-Model, X-Model, X-Base-URL, X-Request-ID, X-Thinking-Mode';
const DEFAULT_MAX_AGE = '86400';

/**
 * Get the list of allowed origins from environment.
 * Returns null if not configured (caller should default to same-origin).
 */
export function getAllowedOrigins(): string[] | null {
  const raw = process.env.CORS_ALLOWED_ORIGINS;
  if (!raw) return null;
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Build CORS headers for a response based on the request's Origin header.
 *
 * If the request Origin is in the allowed list (or same-origin), the
 * `Access-Control-Allow-Origin` header is set to that origin.
 * If not allowed, no CORS headers are added (browser will block the response).
 *
 * @param requestOrigin - The Origin header value from the request
 * @param requestHost - The request's host (for same-origin check)
 * @returns Record of CORS headers to add to the response, or empty object
 */
export function buildCorsHeaders(
  requestOrigin: string | null,
  requestHost: string | null,
): Record<string, string> {
  const headers: Record<string, string> = {};

  if (!requestOrigin) return headers;

  const allowed = getAllowedOrigins();

  // Check if origin is allowed
  let isAllowed = false;

  if (allowed) {
    // Explicit allowlist
    isAllowed = allowed.includes(requestOrigin);
  } else if (requestHost) {
    // No allowlist configured → default to same-origin
    try {
      const originUrl = new URL(requestOrigin);
      const originHost = originUrl.host;
      isAllowed = originHost === requestHost;
    } catch {
      isAllowed = false;
    }
  }

  if (!isAllowed) return headers;

  headers['Access-Control-Allow-Origin'] = requestOrigin;
  headers['Access-Control-Allow-Credentials'] = 'true';
  headers['Access-Control-Allow-Methods'] =
    process.env.CORS_ALLOWED_METHODS || DEFAULT_METHODS;
  headers['Access-Control-Allow-Headers'] =
    process.env.CORS_ALLOWED_HEADERS || DEFAULT_HEADERS;
  headers['Access-Control-Max-Age'] =
    process.env.CORS_MAX_AGE || DEFAULT_MAX_AGE;
  // Vary: Origin ensures caches don't serve the wrong CORS headers
  headers['Vary'] = 'Origin';

  return headers;
}

/**
 * Apply CORS headers to a NextResponse.
 * Call this on every response that passes through the proxy.
 */
export function applyCorsHeaders(
  response: Response,
  requestOrigin: string | null,
  requestHost: string | null,
): Response {
  const corsHeaders = buildCorsHeaders(requestOrigin, requestHost);
  for (const [key, value] of Object.entries(corsHeaders)) {
    if (!response.headers.has(key)) {
      response.headers.set(key, value);
    }
  }
  return response;
}
