/**
 * PATCH /api/admin/users/[id]
 *
 * Updates a user's role or disabled status. Requires the `user:manage` permission.
 *
 * Body:
 *  - role: 'admin' | 'user' (optional)
 *  - disabled: boolean (optional)
 */
import { NextRequest } from 'next/server';
import { withApiHandler } from '@/lib/server/api-handler';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { requirePermission } from '@/lib/auth/rbac';
import { getDb } from '@/lib/db/client';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { recordAuditLog } from '@/lib/db/audit';
import { z } from 'zod';

const updateSchema = z.object({
  role: z.enum(['admin', 'user']).optional(),
  disabled: z.boolean().optional(),
});

export const PATCH = withApiHandler(async (req: NextRequest) => {
  const session = await requirePermission('user:manage');

  const userId = req.url.split('/').slice(-2, -1)[0];
  if (!userId) {
    return apiError('INVALID_REQUEST', 400, 'User ID is required');
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return apiError('INVALID_REQUEST', 400, 'Invalid request body', parsed.error.message);
  }

  const db = getDb();

  // Check user exists
  const existing = db.select().from(users).where(eq(users.id, userId)).get();
  if (!existing) {
    return apiError('INVALID_REQUEST', 404, 'User not found');
  }

  // Prevent self-disabling or self-demotion
  const sessionUserId = (session.user as { id?: string }).id;
  if (sessionUserId && sessionUserId === userId) {
    if (parsed.data.disabled === true) {
      return apiError('INVALID_REQUEST', 400, 'Cannot disable your own account');
    }
    if (parsed.data.role === 'user') {
      return apiError('INVALID_REQUEST', 400, 'Cannot demote your own admin account');
    }
  }

  // Build update
  const updates: Record<string, unknown> = {};
  if (parsed.data.role !== undefined) updates.role = parsed.data.role;
  if (parsed.data.disabled !== undefined) updates.disabled = parsed.data.disabled;

  if (Object.keys(updates).length === 0) {
    return apiError('INVALID_REQUEST', 400, 'No fields to update');
  }

  db.update(users)
    .set(updates)
    .where(eq(users.id, userId))
    .run();

  // Audit log
  recordAuditLog({
    actorId: sessionUserId ?? 'unknown',
    actorRole: (session.user as { role?: string }).role ?? 'admin',
    action: 'user.update',
    entityType: 'user',
    entityId: userId,
    details: { before: { role: existing.role, disabled: existing.disabled }, after: updates },
  });

  return apiSuccess({ data: { id: userId, ...updates } });
}, { rateLimit: 'moderate', rateLimitScope: 'admin-user-update' });
