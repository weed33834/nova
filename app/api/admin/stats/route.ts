/**
 * GET /api/admin/stats
 *
 * Returns high-level system statistics for the admin dashboard.
 * Requires the `user:read` permission (admin only).
 */
import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/server/api-handler';
import { apiSuccess } from '@/lib/server/api-response';
import { requirePermission } from '@/lib/auth/rbac';
import { getDb } from '@/lib/db/client';
import { users, classrooms, usageRecords, apiKeys, auditLogs, learningEvents } from '@/lib/db/schema';
import { count, sql } from 'drizzle-orm';

export const GET = withApiHandler(async (req: NextRequest) => {
  await requirePermission('user:read');

  const db = getDb();

  // Run all count queries
  const [userCount] = db.select({ count: count() }).from(users).all();
  const [classroomCount] = db.select({ count: count() }).from(classrooms).where(sql`${classrooms.deleted} = 0`).all();
  const [activeApiKeyCount] = db.select({ count: count() }).from(apiKeys).where(sql`${apiKeys.revokedAt} IS NULL`).all();
  const [auditLogCount] = db.select({ count: count() }).from(auditLogs).all();
  const [learningEventCount] = db.select({ count: count() }).from(learningEvents).all();

  // Usage in the last 24 hours
  const yesterday = Date.now() - 24 * 60 * 60 * 1000;
  const [recentUsageCount] = db
    .select({ count: count() })
    .from(usageRecords)
    .where(sql`${usageRecords.createdAt} > ${yesterday}`)
    .all();

  // Token usage in the last 30 days
  const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const tokenUsage = db
    .select({
      totalInput: sql<number>`COALESCE(SUM(${usageRecords.inputTokens}), 0)`,
      totalOutput: sql<number>`COALESCE(SUM(${usageRecords.outputTokens}), 0)`,
      totalCacheRead: sql<number>`COALESCE(SUM(${usageRecords.cacheReadTokens}), 0)`,
    })
    .from(usageRecords)
    .where(sql`${usageRecords.createdAt} > ${thirtyDaysAgo}`)
    .all();

  const tokenStats = tokenUsage[0] ?? { totalInput: 0, totalOutput: 0, totalCacheRead: 0 };

  return apiSuccess({
    data: {
      users: {
        total: userCount?.count ?? 0,
      },
      classrooms: {
        total: classroomCount?.count ?? 0,
      },
      apiKeys: {
        active: activeApiKeyCount?.count ?? 0,
      },
      auditLogs: {
        total: auditLogCount?.count ?? 0,
      },
      learningEvents: {
        total: learningEventCount?.count ?? 0,
      },
      usage: {
        last24h: recentUsageCount?.count ?? 0,
        tokens30d: {
          input: tokenStats.totalInput ?? 0,
          output: tokenStats.totalOutput ?? 0,
          cacheRead: tokenStats.totalCacheRead ?? 0,
        },
      },
    },
  });
}, { rateLimit: 'light', rateLimitScope: 'admin-stats' });
