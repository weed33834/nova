/**
 * GET /api/admin/usage
 *
 * Returns aggregated usage analytics. Requires the `usage:read:any` permission.
 *
 * Query params:
 *  - period: '24h' | '7d' | '30d' | '90d' (default 30d)
 *  - groupBy: 'provider' | 'model' | 'kind' | 'day' (default provider)
 */
import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/server/api-handler';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { requirePermission } from '@/lib/auth/rbac';
import { getDb } from '@/lib/db/client';
import { usageRecords } from '@/lib/db/schema';
import { sql, gte } from 'drizzle-orm';

const PERIOD_MS: Record<string, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
};

export const GET = withApiHandler(async (req: NextRequest) => {
  await requirePermission('usage:read:any');

  const url = new URL(req.url);
  const period = url.searchParams.get('period') ?? '30d';
  const groupBy = url.searchParams.get('groupBy') ?? 'provider';

  const periodMs = PERIOD_MS[period];
  if (!periodMs) {
    return apiError('INVALID_REQUEST', 400, `Invalid period. Use: ${Object.keys(PERIOD_MS).join(', ')}`);
  }

  if (!['provider', 'model', 'kind', 'day'].includes(groupBy)) {
    return apiError('INVALID_REQUEST', 400, 'Invalid groupBy. Use: provider, model, kind, day');
  }

  const db = getDb();
  const since = Date.now() - periodMs;

  // Build the GROUP BY expression based on the groupBy parameter
  let groupExpr: ReturnType<typeof sql>;

  if (groupBy === 'provider') {
    groupExpr = sql`${usageRecords.providerId}`;
  } else if (groupBy === 'model') {
    groupExpr = sql`${usageRecords.modelString}`;
  } else if (groupBy === 'kind') {
    groupExpr = sql`${usageRecords.kind}`;
  } else {
    // day
    groupExpr = sql`date(${usageRecords.createdAt} / 1000, 'unixepoch')`;
  }

  const results = db
    .select({
      group: sql<string>`${groupExpr}`.as('group'),
      count: sql<number>`COUNT(*)`,
      totalInput: sql<number>`COALESCE(SUM(${usageRecords.inputTokens}), 0)`,
      totalOutput: sql<number>`COALESCE(SUM(${usageRecords.outputTokens}), 0)`,
      totalCacheRead: sql<number>`COALESCE(SUM(${usageRecords.cacheReadTokens}), 0)`,
      totalReasoning: sql<number>`COALESCE(SUM(${usageRecords.reasoningTokens}), 0)`,
    })
    .from(usageRecords)
    .where(gte(usageRecords.createdAt, since))
    .groupBy(sql`${groupExpr}`)
    .orderBy(sql`count DESC`)
    .all();

  return apiSuccess({
    data: {
      period,
      groupBy,
      since,
      groups: results,
    },
  });
}, { rateLimit: 'light', rateLimitScope: 'admin-usage' });
