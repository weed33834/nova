/**
 * Sentry client-side configuration.
 *
 * Activated only when NEXT_PUBLIC_SENTRY_DSN is set.
 * Captures unhandled errors and promise rejections in the browser.
 */
import * as Sentry from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0.1'),
    replaysSessionSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? '0.1',
    ),
    replaysOnErrorSampleRate: 1.0,
    ignoreErrors: [
      'NEXT_CANCELLED',
      'ResizeObserver loop limit exceeded',
      // Network errors that users can't act on
      'Network request failed',
      'Failed to fetch',
    ],
    denyUrls: [
      /extensions\//i,
      /^chrome:\/\//i,
      /^chrome-extension:\/\//i,
    ],
  });
}
