/**
 * GDPR data export and deletion utilities.
 *
 * Provides functions to:
 * 1. `exportUserData(userId)` — collects all data associated with a user
 *    (classrooms, skills, API keys, audit logs, learning events, usage records)
 *    into a single JSON object for download.
 * 2. `deleteUserData(userId)` — permanently deletes all user data (right to
 *    be forgotten). Uses a database transaction for atomicity.
 *
 * These functions are called by the /api/gdpr/* admin routes.
 */
import { getDb, dbTransaction } from '@/lib/db/client';
import {
  classrooms,
  skills,
  apiKeys,
  auditLogs,
  learningEvents,
  usageRecords,
  users,
} from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { createLogger } from '@/lib/logger';

const log = createLogger('GDPR');

export interface UserDataExport {
  user: {
    id: string;
    name: string | null;
    email: string;
    role: string;
    createdAt: string | null;
  };
  classrooms: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
  apiKeys: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
  learningEvents: Array<Record<string, unknown>>;
  usageRecords: Array<Record<string, unknown>>;
  exportedAt: string;
}

/**
 * Export all data associated with a user for GDPR compliance.
 * Returns a structured JSON object containing all user-owned records.
 */
export function exportUserData(userId: string): UserDataExport | null {
  const db = getDb();

  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) return null;

  const userClassrooms = db
    .select()
    .from(classrooms)
    .where(eq(classrooms.ownerId, userId))
    .all();

  const userSkills = db
    .select()
    .from(skills)
    .where(eq(skills.ownerId, userId))
    .all();

  const userApiKeys = db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.ownerId, userId))
    .all();

  const userAuditLogs = db
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.actorId, userId))
    .all();

  const userLearningEvents = db
    .select()
    .from(learningEvents)
    .where(eq(learningEvents.userId, userId))
    .all();

  const userUsageRecords = db
    .select()
    .from(usageRecords)
    .where(eq(usageRecords.userId, userId))
    .all();

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    },
    classrooms: userClassrooms as Array<Record<string, unknown>>,
    skills: userSkills as Array<Record<string, unknown>>,
    apiKeys: userApiKeys.map((k) => ({
      ...k,
      hashedKey: '[REDACTED]',
    })) as Array<Record<string, unknown>>,
    auditLogs: userAuditLogs as Array<Record<string, unknown>>,
    learningEvents: userLearningEvents as Array<Record<string, unknown>>,
    usageRecords: userUsageRecords as Array<Record<string, unknown>>,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * Permanently delete all data associated with a user (right to be forgotten).
 * Uses a transaction for atomicity — either all data is deleted or none.
 *
 * @returns Number of records deleted across all tables.
 */
export function deleteUserData(userId: string): number {
  let totalDeleted = 0;

  dbTransaction(() => {
    const db = getDb();

    // Delete in dependency order (children first, parent last)
    const deletions = [
      { table: 'learningEvents', fn: () => db.delete(learningEvents).where(eq(learningEvents.userId, userId)).run() },
      { table: 'usageRecords', fn: () => db.delete(usageRecords).where(eq(usageRecords.userId, userId)).run() },
      { table: 'auditLogs', fn: () => db.delete(auditLogs).where(eq(auditLogs.actorId, userId)).run() },
      { table: 'apiKeys', fn: () => db.delete(apiKeys).where(eq(apiKeys.ownerId, userId)).run() },
      { table: 'skills', fn: () => db.delete(skills).where(eq(skills.ownerId, userId)).run() },
      { table: 'classrooms', fn: () => db.delete(classrooms).where(eq(classrooms.ownerId, userId)).run() },
      { table: 'users', fn: () => db.delete(users).where(eq(users.id, userId)).run() },
    ];

    for (const { table, fn } of deletions) {
      const result = fn();
      const count = (result as { changes?: number }).changes ?? 0;
      if (count > 0) {
        log.info(`Deleted ${count} records from ${table} for user ${userId}`);
      }
      totalDeleted += count;
    }
  });

  log.info(`GDPR deletion complete: ${totalDeleted} records deleted for user ${userId}`);
  return totalDeleted;
}
