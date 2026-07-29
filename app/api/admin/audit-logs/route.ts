/**
 * GET /api/admin/audit-logs
 *
 * Lists audit logs with pagination and filtering. Requires the `audit:read` permission.
 *
 * Query params:
 *  - page: page number (default 1)
 *  - pageSize: items per page (default 50, max 200)
 *  - action: filter by action type
 *  - actorId: filter by actor
 *  - entityType: filter by entity type
 */
import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/server/api-handler';
import { apiSuccess } from '@/lib/server/api-response';
import { requirePermission } from '@/lib/auth/rbac';
import { getDb } from '@/lib/db/client';
import { auditLogs } from '@/lib/db/schema';
import { eq, and, sql, count } from 'drizzle-orm';

export const GET = withApiHandler(async (req: NextRequest) => {
  await requirePermission('audit:read');

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '50', 10)));
  const actionFilter = url.searchParams.get('action');
  const actorIdFilter = url.searchParams.get('actorId');
  const entityTypeFilter = url.searchParams.get('entityType');

  const db = getDb();

  const conditions = [];
  if (actionFilter) conditions.push(eq(auditLogs.action, actionFilter));
  if (actorIdFilter) conditions.push(eq(auditLogs.actorId, actorIdFilter));
  if (entityTypeFilter) conditions.push(eq(auditLogs.entityType, entityTypeFilter));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = db
    .select({ count: count() })
    .from(auditLogs)
    .where(where ?? sql`1=1`)
    .all();
  const total = totalResult?.count ?? 0;

  const logs = db
    .select()
    .from(auditLogs)
    .where(where ?? sql`1=1`)
    .orderBy(sql`${auditLogs.createdAt} DESC`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return apiSuccess({
    data: logs,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    },
  });
}, { rateLimit: 'light', rateLimitScope: 'admin-audit-logs' });
