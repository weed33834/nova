/**
 * Audit log helper.
 *
 * Thin wrapper around the `audit_logs` table that serializes the details
 * payload and tolerates failures (an audit log write must never break the
 * operation it's auditing). Fire-and-forget by default.
 */
import { getDb } from './client';
import { auditLogs, type AuditLog } from './schema';
import { createLogger } from '@/lib/logger';

const log = createLogger('Audit');

export interface AuditLogInput {
  actorId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Write a single audit log entry. Never throws — a logging failure is logged
 * to the structured logger and swallowed so the caller's operation succeeds.
 *
 * Returns the created row on success, or null on failure.
 */
export function recordAuditLog(input: AuditLogInput): AuditLog | null {
  try {
    const db = getDb();
    const row = db
      .insert(auditLogs)
      .values({
        actorId: input.actorId ?? null,
        actorRole: input.actorRole ?? null,
        action: input.action,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        detailsJson: input.details ? JSON.stringify(input.details) : null,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
      })
      .returning()
      .get();
    return row ?? null;
  } catch (err) {
    log.warn('Failed to record audit log (ignored):', err);
    return null;
  }
}
