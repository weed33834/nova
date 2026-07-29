/**
 * GET /api/admin/classrooms
 *
 * Lists all classrooms with pagination. Requires the `classroom:read:any` permission.
 *
 * Query params:
 *  - page: page number (default 1)
 *  - pageSize: items per page (default 20, max 100)
 *  - ownerId: filter by owner
 *  - includeDeleted: 'true' to include soft-deleted classrooms (default false)
 */
import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/server/api-handler';
import { apiSuccess } from '@/lib/server/api-response';
import { requirePermission } from '@/lib/auth/rbac';
import { getDb } from '@/lib/db/client';
import { classrooms, users } from '@/lib/db/schema';
import { eq, and, sql, count } from 'drizzle-orm';

export const GET = withApiHandler(async (req: NextRequest) => {
  await requirePermission('classroom:read:any');

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)));
  const ownerIdFilter = url.searchParams.get('ownerId');
  const includeDeleted = url.searchParams.get('includeDeleted') === 'true';

  const db = getDb();

  const conditions = [];
  if (!includeDeleted) conditions.push(eq(classrooms.deleted, false));
  if (ownerIdFilter) conditions.push(eq(classrooms.ownerId, ownerIdFilter));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [totalResult] = db
    .select({ count: count() })
    .from(classrooms)
    .where(where ?? sql`1=1`)
    .all();
  const total = totalResult?.count ?? 0;

  const classroomRows = db
    .select({
      id: classrooms.id,
      ownerId: classrooms.ownerId,
      createdAt: classrooms.createdAt,
      updatedAt: classrooms.updatedAt,
      deleted: classrooms.deleted,
      ownerEmail: users.email,
    })
    .from(classrooms)
    .leftJoin(users, eq(classrooms.ownerId, users.id))
    .where(where ?? sql`1=1`)
    .orderBy(sql`${classrooms.createdAt} DESC`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return apiSuccess({
    data: classroomRows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    },
  });
}, { rateLimit: 'light', rateLimitScope: 'admin-classrooms' });
