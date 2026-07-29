/**
 * GET /api/admin/users
 *
 * Lists all users with pagination. Requires the `user:read` permission (admin only).
 *
 * Query params:
 *  - page: page number (default 1)
 *  - pageSize: items per page (default 20, max 100)
 *  - search: filter by email or name (case-insensitive)
 *  - role: filter by role ('admin' | 'user')
 *  - disabled: filter by disabled status ('true' | 'false')
 */
import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/server/api-handler';
import { apiSuccess } from '@/lib/server/api-response';
import { requirePermission } from '@/lib/auth/rbac';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq, or, like, and, sql, count } from 'drizzle-orm';

export const GET = withApiHandler(async (req: NextRequest) => {
  await requirePermission('user:read');

  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') ?? '20', 10)));
  const search = url.searchParams.get('search');
  const roleFilter = url.searchParams.get('role');
  const disabledFilter = url.searchParams.get('disabled');

  const db = getDb();

  // Build WHERE conditions
  const conditions = [];
  if (search) {
    conditions.push(
      or(
        like(users.email, `%${search}%`),
        like(users.name, `%${search}%`),
      ),
    );
  }
  if (roleFilter === 'admin' || roleFilter === 'user') {
    conditions.push(eq(users.role, roleFilter));
  }
  if (disabledFilter === 'true') {
    conditions.push(eq(users.disabled, true));
  } else if (disabledFilter === 'false') {
    conditions.push(eq(users.disabled, false));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Get total count
  const [totalResult] = db
    .select({ count: count() })
    .from(users)
    .where(where ?? sql`1=1`)
    .all();
  const total = totalResult?.count ?? 0;

  // Get paginated results
  const userRows = db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      emailVerified: users.emailVerified,
      image: users.image,
      role: users.role,
      disabled: users.disabled,
      createdAt: users.createdAt,
      updatedAt: users.updatedAt,
    })
    .from(users)
    .where(where ?? sql`1=1`)
    .orderBy(sql`${users.createdAt} DESC`)
    .limit(pageSize)
    .offset((page - 1) * pageSize)
    .all();

  return apiSuccess({
    data: userRows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
      hasMore: page * pageSize < total,
    },
  });
}, { rateLimit: 'light', rateLimitScope: 'admin-users' });
