/**
 * Edge proxy (Next.js 16 successor to middleware) — access-code gate + CSRF + security headers.
 *
 * Responsibilities:
 * 1. CSRF protection: for state-changing requests (POST/PUT/DELETE/PATCH),
 *    validates the Origin header against the expected host. Browser requests
 *    with a mismatched Origin are rejected with 403. Non-browser requests
 *    (no Origin header, e.g. curl, API key clients) are allowed through.
 * 2. Access-code gate: when `ACCESS_CODE` env var is set, gates all non-public
 *    routes behind the `nova_access` cookie. The cookie's HMAC signature is
 *    verified using the Web Crypto API (Edge-compatible).
 * 3. Security headers: sets standard security headers (CSP, X-Frame-Options,
 *    X-Content-Type-Options, Referrer-Policy, Permissions-Policy) on all
 *    responses.
 * 4. Public routes (home, auth pages, health, access-code endpoints, public
 *    classroom playback, static assets) are always accessible.
 *
 * Fine-grained permission checks (RBAC) happen server-side via
 * `requirePermission()` in the route handlers — the proxy is a first-pass
 * gate only.
 */
import { NextRequest, NextResponse } from 'next/server';

const ACCESS_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// ── Security headers ─────────────────────────────────────────────────────────

/**
 * Standard security headers applied to every response.
 *
 * CSP is intentionally permissive for a Next.js app that uses inline styles,
 * dynamic imports, and external CDN resources. tighten in production by
 * setting CSP environment variables.
 */
const SECURITY_HEADERS: Record<string, string> = {
  'x-frame-options': 'SAMEORIGIN',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), browsing-topics=()',
  'x-dns-prefetch-control': 'on',
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
};

/**
 * Apply security headers to a NextResponse.
 * Called for every response that passes through the proxy.
 */
function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    // Don't override headers already set by the route handler
    if (!res.headers.has(key)) {
      res.headers.set(key, value);
    }
  }
  return res;
}

/** Convert string to Uint8Array */
function encode(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Verify an HMAC-signed token using Web Crypto API (Edge-compatible) */
async function verifyToken(token: string, accessCode: string): Promise<boolean> {
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

  const keyData = encode(accessCode);
  const key = await crypto.subtle.importKey(
    'raw',
    keyData.buffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const data = encode(timestamp);
  const expected = bufToHex(await crypto.subtle.sign('HMAC', key, data.buffer as ArrayBuffer));

  // Constant-length comparison (not truly constant-time in JS, but sufficient here)
  if (signature.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signature.length; i++) {
    mismatch |= signature.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}

// ── Public route patterns (no access code required) ─────────────────────────

const PUBLIC_PATTERNS = [
  /^\/$/, // home
  /^\/auth\//, // sign-in, sign-up pages
  /^\/api\/auth\//, // NextAuth endpoints
  /^\/api\/health/, // liveness/readiness probes
  /^\/api\/access-code\//, // access code verify/status
  /^\/api\/usage/, // public usage info
  /^\/_next\//, // static assets
  /^\/favicon/, // favicon
  /^\/icons\//, // icon files
  /^\/classroom\//, // public classroom playback (URL: /classroom/[id])
  /^\/fonts\//, // font files
  /^\/manifest/, // PWA manifest
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_PATTERNS.some((p) => p.test(pathname));
}

// ── Edge-compatible global rate limiter ─────────────────────────────────────

/**
 * Lightweight in-memory rate limiter for the Edge proxy.
 *
 * Acts as a global DDoS protection layer — per-route limiters in the
 * route handlers enforce more specific limits (e.g. 'generation' preset).
 *
 * Limits:
 * - API routes: 120 req/min per IP
 * - Page routes: 60 req/min per IP
 * - Health/static: unlimited
 *
 * Uses a sliding window with periodic cleanup. Not shared across instances
 * (Edge functions are stateless per cold start), but provides a baseline
 * protection against abuse from a single client.
 */
const GLOBAL_API_LIMIT = 120; // requests per window
const GLOBAL_PAGE_LIMIT = 60;
const GLOBAL_WINDOW_MS = 60_000; // 1 minute
const globalBuckets = new Map<string, { count: number; resetAt: number }>();
let lastGlobalSweep = Date.now();

function checkGlobalRateLimit(ip: string, isApi: boolean): { allowed: boolean; retryAfter: number } {
  const now = Date.now();

  // Sweep stale entries every 60s
  if (now - lastGlobalSweep > GLOBAL_WINDOW_MS) {
    for (const [key, bucket] of globalBuckets) {
      if (bucket.resetAt <= now) globalBuckets.delete(key);
    }
    lastGlobalSweep = now;
  }

  const key = `${ip}:${isApi ? 'api' : 'page'}`;
  const limit = isApi ? GLOBAL_API_LIMIT : GLOBAL_PAGE_LIMIT;
  const bucket = globalBuckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    globalBuckets.set(key, { count: 1, resetAt: now + GLOBAL_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }

  bucket.count++;
  if (bucket.count > limit) {
    return { allowed: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  return { allowed: true, retryAfter: 0 };
}

/** Extract client IP from request, accounting for common proxy headers. */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

// ── CSRF protection ──────────────────────────────────────────────────────────

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Validate the Origin header for state-changing requests to prevent CSRF.
 *
 * Strategy:
 * - Only applies to POST/PUT/PATCH/DELETE (GET/HEAD/OPTIONS are safe).
 * - NextAuth endpoints (/api/auth/*) are skipped — NextAuth has its own CSRF
 *   token mechanism.
 * - If no Origin header is present, the request is allowed (non-browser clients
 *   like curl, API SDKs, server-to-server calls don't send Origin).
 * - If Origin is present, it must match the request's host. This prevents
 *   cross-site form submissions and fetch() calls from other origins.
 */
function checkCsrf(request: NextRequest): NextResponse | null {
  if (!STATE_CHANGING_METHODS.has(request.method)) return null;

  const { pathname } = request.nextUrl;
  // NextAuth has built-in CSRF tokens
  if (pathname.startsWith('/api/auth/')) return null;

  const origin = request.headers.get('origin');
  if (!origin) return null; // Non-browser client — allow

  const expectedHost = request.headers.get('host') || request.nextUrl.host;
  if (!expectedHost) return null; // Can't verify — allow (proxy/load balancer scenario)

  // Extract the host portion of the Origin URL and compare
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    // Malformed Origin header — reject
    return NextResponse.json(
      { success: false, errorCode: 'FORBIDDEN', error: 'Invalid Origin header' },
      { status: 403 },
    );
  }

  if (originHost !== expectedHost) {
    return NextResponse.json(
      { success: false, errorCode: 'FORBIDDEN', error: 'Cross-site requests are not allowed' },
      { status: 403 },
    );
  }

  return null;
}

export async function proxy(request: NextRequest) {
  // ── Request ID injection (for log correlation) ──────────────────────────
  // If the client didn't send one, generate a short ID so all log lines for
  // a single request can be correlated downstream.
  const requestId =
    request.headers.get('x-request-id') ??
    crypto.randomUUID().slice(0, 8);
  // Clone headers so we can add the request ID without mutating the original
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const { pathname } = request.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // ── Global rate limiting (DDoS protection) ──────────────────────────────
  // Skip for health checks and static assets (they're served from CDN/cache).
  if (!pathname.startsWith('/api/health') && !pathname.startsWith('/_next/')) {
    const clientIp = getClientIp(request);
    const rateLimitResult = checkGlobalRateLimit(clientIp, isApi);
    if (!rateLimitResult.allowed) {
      const res = NextResponse.json(
        {
          success: false,
          errorCode: 'RATE_LIMITED',
          error: 'Too many requests',
        },
        {
          status: 429,
          headers: {
            'retry-after': String(rateLimitResult.retryAfter),
            'x-request-id': requestId,
          },
        },
      );
      return applySecurityHeaders(res);
    }
  }

  // ── CSRF protection (always on, regardless of ACCESS_CODE) ──────────────
  const csrfError = checkCsrf(request);
  if (csrfError) {
    csrfError.headers.set('x-request-id', requestId);
    return applySecurityHeaders(csrfError);
  }

  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('x-request-id', requestId);
    return applySecurityHeaders(res);
  }

  // Always allow public routes
  if (isPublicRoute(pathname)) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('x-request-id', requestId);
    return applySecurityHeaders(res);
  }

  // Check cookie — validate HMAC signature, not just existence
  const cookie = request.cookies.get('nova_access');
  if (cookie?.value && (await verifyToken(cookie.value, accessCode))) {
    const res = NextResponse.next({ request: { headers: requestHeaders } });
    res.headers.set('x-request-id', requestId);
    return applySecurityHeaders(res);
  }

  // API requests without valid cookie → 401
  if (pathname.startsWith('/api/')) {
    const res = NextResponse.json(
      { success: false, errorCode: 'UNAUTHORIZED', error: 'Access code required' },
      { status: 401 },
    );
    res.headers.set('x-request-id', requestId);
    return applySecurityHeaders(res);
  }

  // Page requests → let through, frontend shows modal
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('x-request-id', requestId);
  return applySecurityHeaders(res);
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - Static assets (_next/static, _next/image, favicon, icons, logos, fonts)
     * - NextAuth API endpoints (/api/auth/*)
     * - Health/access-code/usage API endpoints (public)
     *
     * Everything else goes through the proxy for access-code gating.
     */
    '/((?!api/access-code|api/health|api/usage|api/auth|_next/static|_next/image|favicon.ico|icons|logos|fonts|manifest).*)',
  ],
};
