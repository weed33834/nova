/**
 * Sentry Edge runtime configuration.
 *
 * Activated only when SENTRY_DSN is set (checked in instrumentation.ts).
 * Captures errors in middleware and Edge API routes.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
});
