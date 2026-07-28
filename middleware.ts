export { default } from 'next-auth/middleware';

/**
 * NextAuth middleware — protects routes that require authentication.
 *
 * Routes listed in `config.matcher` redirect unauthenticated users to
 * `/auth/signin`. Public routes (home, auth pages, API auth endpoints,
 * public classroom playback) are excluded.
 *
 * The middleware runs on the Edge runtime; it only validates the session JWT
 * (no DB hit). Fine-grained permission checks happen server-side via
 * `requirePermission()` in the route handlers.
 */

export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next/static, _next/image, favicon, icons (static assets)
     * - /auth/* (sign-in, sign-up pages themselves)
     * - /api/auth/* (NextAuth endpoints: signin, signout, callback)
     * - /api/health (liveness probe)
     * - /classroom/play/* (public playback links, checked server-side per-request)
     *
     * Add protected paths here as features land. During the transition
     * (no auth env configured yet), the matcher is empty so the app stays
     * open. Once NEXTAUTH_SECRET is set and auth is enabled, uncomment the
     * matcher to enforce authentication.
     */
    // '/dashboard/:path*',
    // '/settings/:path*',
    // '/api/classrooms/:path*',
    // '/api/skills/:path*',
  ],
};
