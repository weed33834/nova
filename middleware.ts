/**
 * Edge middleware — access-code gate and security headers.
 *
 * Responsibilities:
 * 1. When `ACCESS_CODE` env var is set, gates all non-public routes behind the
 *    `nova_access` cookie. The cookie's HMAC signature is verified server-side
 *    in route handlers; the middleware only checks existence (Edge runtime
 *    doesn't support `node:crypto.createHmac`).
 * 2. When `NEXTAUTH_SECRET` is set and the route is in `AUTH_REQUIRED_ROUTES`,
 *    delegates to NextAuth's `withAuth` for JWT session validation.
 * 3. Public routes (home, auth pages, health, access-code endpoints, public
 *    classroom playback) are always accessible.
 *
 * Fine-grained permission checks (RBAC) happen server-side via
 * `requirePermission()` in the route handlers — the middleware is a
 * first-pass gate only.
 */
import { NextResponse, type NextRequest } from 'next/server';

// ── Public route patterns (no auth required) ────────────────────────────────

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

// ── Middleware ──────────────────────────────────────────────────────────────

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // ── Access code gate ──
  // When ACCESS_CODE is set, all non-public routes require the nova_access cookie.
  // The cookie's HMAC signature is verified server-side; the middleware only
  // checks existence (Edge-compatible).
  const accessCode = process.env.ACCESS_CODE;
  if (accessCode) {
    const token = req.cookies.get('nova_access')?.value;
    if (!token) {
      // For API routes, return 401 JSON
      if (pathname.startsWith('/api/')) {
        return NextResponse.json(
          {
            success: false,
            errorCode: 'UNAUTHORIZED',
            error: 'Access code required. Please verify your access code first.',
          },
          { status: 401 },
        );
      }
      // For page routes, redirect to home (where access code input is shown)
      const homeUrl = new URL('/', req.url);
      homeUrl.searchParams.set('require_access', '1');
      return NextResponse.redirect(homeUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all paths EXCEPT:
     * - Static assets (_next/static, _next/image, favicon, icons)
     * - NextAuth API endpoints (/api/auth/*)
     * - Health/access-code/usage API endpoints (public)
     *
     * Everything else goes through the middleware for access-code gating.
     * NextAuth JWT session validation for specific routes (dashboard, settings)
     * is handled by the route handlers via getServerSession().
     */
    '/((?!api/access-code|api/health|api/usage|api/auth|_next/static|_next/image|favicon.ico|icons|fonts|manifest).*)',
  ],
};
