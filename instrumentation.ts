/**
 * Next.js instrumentation hook — runs once on server startup.
 *
 * When `SENTRY_DSN` is set, registers Sentry for server-side error tracking.
 * When unset, this is a no-op so the app runs without Sentry.
 *
 * @see https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */
export async function register() {
  const dsn = process.env.SENTRY_DSN;

  if (!dsn) {
    // No Sentry DSN configured — skip instrumentation entirely.
    return;
  }

  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
  }

  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}
