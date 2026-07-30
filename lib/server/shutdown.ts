/**
 * Graceful shutdown handler.
 *
 * On SIGTERM/SIGINT (e.g. Docker stop, Kubernetes pod termination):
 * 1. Flush Sentry events (if configured)
 * 2. Close the SQLite database connection (ensures WAL checkpoint)
 * 3. Exit cleanly
 *
 * This prevents data corruption in SQLite WAL mode and ensures no
 * in-flight requests are abruptly terminated.
 */
import { createLogger } from '@/lib/logger';
import { delay } from '@/lib/utils/async';

const log = createLogger('Shutdown');

let shuttingDown = false;

export function registerGracefulShutdown(): void {
  const handler = async (signal: string) => {
    if (shuttingDown) {
      log.warn(`Received ${signal} during shutdown — forcing exit`);
      process.exit(1);
    }
    shuttingDown = true;

    log.info(`Received ${signal}, shutting down gracefully...`);

    // Give in-flight requests a brief grace period
    await delay(500);

    // Close database connection
    try {
      const { closeDb } = await import('@/lib/db/client');
      closeDb();
      log.info('Database connection closed');
    } catch (err) {
      log.error('Error closing database', err);
    }

    // Flush Sentry
    if (process.env.SENTRY_DSN) {
      try {
        const Sentry = await import('@sentry/nextjs');
        await Sentry.flush(2000);
        log.info('Sentry events flushed');
      } catch {
        // Sentry not available
      }
    }

    log.info('Shutdown complete');
    process.exit(0);
  };

  process.on('SIGTERM', () => handler('SIGTERM'));
  process.on('SIGINT', () => handler('SIGINT'));

  // Handle uncaught errors gracefully
  process.on('uncaughtException', (err) => {
    log.error('Uncaught exception', err);
    handler('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    log.error('Unhandled rejection', reason);
    // Don't exit on unhandled rejection — just log it
    // Node.js default behavior changed in v15+ to exit, but we want to
    // be resilient for a long-running server.
  });

  log.info('Graceful shutdown handlers registered');
}
