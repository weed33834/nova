/**
 * Audit log retention policy — automatic cleanup of old audit log entries.
 *
 * Enterprise systems must enforce data retention limits to comply with
 * GDPR/CCPA and prevent unbounded database growth. This module provides:
 *
 * 1. `pruneAuditLogs()` — deletes audit log entries older than the retention
 *    period (default: 90 days, configurable via `AUDIT_LOG_RETENTION_DAYS`).
 * 2. `startAuditRetentionTimer()` — schedules periodic cleanup on server
 *    startup (runs every 24h).
 * 3. `getAuditLogStats()` — returns count and oldest entry for monitoring.
 *
 * The prune operation is safe to run concurrently — SQLite's WAL mode handles
 * concurrent reads during the DELETE. The DELETE uses a subquery to identify
 * old rows by `created_at` comparison, which leverages the index on
 * `audit_logs.created_at` (added in migration 0002).
 */
import { getDb, getSqlite } from '@/lib/db/client';
import { auditLogs } from '@/lib/db/schema';
import { lt, count, min } from 'drizzle-orm';
import { createLogger } from '@/lib/logger';

const log = createLogger('AuditRetention');

/** Default retention period in days. */
const DEFAULT_RETENTION_DAYS = 90;

/** How often the background timer runs (24 hours). */
const TIMER_INTERVAL_MS = 24 * 60 * 60 * 1000;

let timerHandle: ReturnType<typeof setInterval> | null = null;

/**
 * Get the configured retention period in days.
 * Reads from `AUDIT_LOG_RETENTION_DAYS` env var, defaults to 90.
 */
export function getRetentionDays(): number {
  const raw = process.env.AUDIT_LOG_RETENTION_DAYS;
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_RETENTION_DAYS;
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RETENTION_DAYS;
  return parsed;
}

/**
 * Prune audit log entries older than the retention period.
 *
 * @returns Number of entries deleted.
 */
export function pruneAuditLogs(): number {
  const retentionDays = getRetentionDays();
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const cutoffIso = cutoff.toISOString();

  try {
    const db = getDb();
    const sqlite = getSqlite();

    // Use raw SQL for efficient batch DELETE with RETURNING count
    const result = sqlite.prepare(
      `DELETE FROM audit_logs WHERE created_at < ?`,
    ).run(cutoffIso);

    const deleted = result.changes;
    if (deleted > 0) {
      log.info(`Pruned ${deleted} audit log entries older than ${retentionDays} days (before ${cutoffIso})`);
    }
    return deleted;
  } catch (err) {
    log.error('Failed to prune audit logs:', err);
    return 0;
  }
}

/**
 * Get audit log statistics for monitoring dashboards.
 */
export function getAuditLogStats(): {
  totalEntries: number;
  oldestEntry: string | null;
  retentionDays: number;
} {
  try {
    const db = getDb();
    const [stats] = db
      .select({
        total: count(),
        oldest: min(auditLogs.createdAt),
      })
      .from(auditLogs)
      .all();

    return {
      totalEntries: stats?.total ?? 0,
      oldestEntry: stats?.oldest ?? null,
      retentionDays: getRetentionDays(),
    };
  } catch {
    return {
      totalEntries: 0,
      oldestEntry: null,
      retentionDays: getRetentionDays(),
    };
  }
}

/**
 * Start the periodic audit log retention timer.
 * Should be called once on server startup (e.g., in instrumentation.ts).
 *
 * Runs immediately on start, then every 24 hours.
 */
export function startAuditRetentionTimer(): void {
  if (timerHandle) {
    log.warn('Audit retention timer already running');
    return;
  }

  // Run once immediately on startup (non-blocking, catch errors)
  setImmediate(() => {
    try {
      pruneAuditLogs();
    } catch (err) {
      log.error('Initial audit log prune failed:', err);
    }
  });

  // Schedule periodic cleanup
  timerHandle = setInterval(() => {
    try {
      pruneAuditLogs();
    } catch (err) {
      log.error('Periodic audit log prune failed:', err);
    }
  }, TIMER_INTERVAL_MS);

  // Don't keep the process alive just for this timer
  if (timerHandle.unref) {
    timerHandle.unref();
  }

  log.info(`Audit retention timer started (every 24h, retention: ${getRetentionDays()} days)`);
}

/**
 * Stop the audit retention timer (for graceful shutdown / tests).
 */
export function stopAuditRetentionTimer(): void {
  if (timerHandle) {
    clearInterval(timerHandle);
    timerHandle = null;
    log.info('Audit retention timer stopped');
  }
}
