/**
 * Sentry server-side configuration.
 *
 * Activated only when SENTRY_DSN is set (checked in instrumentation.ts).
 * Captures unhandled exceptions and rejections on the Node.js runtime.
 */
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
  profilesSampleRate: Number(process.env.SENTRY_PROFILES_SAMPLE_RATE ?? '0.1'),
  ignoreErrors: [
    // Next.js internal cancelled navigation errors
    'NEXT_CANCELLED',
    // ResizeObserver loop limit exceeded — benign browser warning
    'ResizeObserver loop limit exceeded',
  ],
  denyUrls: [
    // Chrome extensions
    /extensions\//i,
    /^chrome:\/\//i,
    /^chrome-extension:\/\//i,
  ],
});
