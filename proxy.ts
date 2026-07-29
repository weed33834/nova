/**
 * Edge proxy (Next.js 16 successor to middleware) — access-code gate + CSRF.
 *
 * Responsibilities:
 * 1. CSRF protection: for state-changing requests (POST/PUT/DELETE/PATCH),
 *    validates the Origin header against the expected host. Browser requests
 *    with a mismatched Origin are rejected with 403. Non-browser requests
 *    (no Origin header, e.g. curl, API key clients) are allowed through.
 * 2. Access-code gate: when `ACCESS_CODE` env var is set, gates all non-public
 *    routes behind the `nova_access` cookie. The cookie's HMAC signature is
 *    verified using the Web Crypto API (Edge-compatible).
 * 3. Public routes (home, auth pages, health, access-code endpoints, public
 *    classroom playback, static assets) are always accessible.
 *
 * Fine-grained permission checks (RBAC) happen server-side via
 * `requirePermission()` in the route handlers — the proxy is a first-pass
 * gate only.
 */
import { NextRequest, NextResponse } from 'next/server';

const ACCESS_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

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
  // ── CSRF protection (always on, regardless of ACCESS_CODE) ──────────────
  const csrfError = checkCsrf(request);
  if (csrfError) return csrfError;

  const accessCode = process.env.ACCESS_CODE;
  if (!accessCode) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Always allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check cookie — validate HMAC signature, not just existence
  const cookie = request.cookies.get('nova_access');
  if (cookie?.value && (await verifyToken(cookie.value, accessCode))) {
    return NextResponse.next();
  }

  // API requests without valid cookie → 401
  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { success: false, errorCode: 'UNAUTHORIZED', error: 'Access code required' },
      { status: 401 },
    );
  }

  // Page requests → let through, frontend shows modal
  return NextResponse.next();
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
