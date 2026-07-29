/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * When `SENTRY_DSN` is set, registers Sentry for server-side error tracking.
 * When unset, this is a no-op so the app runs without Sentry.
 *
 * Also registers graceful shutdown handlers to close the database connection
 * and flush Sentry events on SIGTERM/SIGINT.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;

  if (dsn) {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      await import('./sentry.server.config');
    }

    if (process.env.NEXT_RUNTIME === 'edge') {
      await import('./sentry.edge.config');
    }
  }

  // Register graceful shutdown handlers (Node.js runtime only)
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerGracefulShutdown } = await import('@/lib/server/shutdown');
    registerGracefulShutdown();
  }
}
