/**
 * GDPR Data Deletion API
 *
 * DELETE /api/gdpr/delete?userId=<id>
 *
 * Admin-only endpoint that permanently deletes all data associated
 * with a user (right to be forgotten, GDPR Article 17). Uses a
 * database transaction for atomicity.
 */
import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { deleteUserData } from '@/lib/server/gdpr';
import { recordAuditLog } from '@/lib/db/audit';
import { requirePermission } from '@/lib/auth/rbac';

export const DELETE = withApiHandler(async (req: NextRequest) => {
  const userId = req.nextUrl.searchParams.get('userId');

  if (!userId) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'userId query parameter is required');
  }

  // Require admin role — GDPR deletion is a privileged operation
  await requirePermission('user:manage');

  const deletedCount = deleteUserData(userId);

  if (deletedCount === 0) {
    return apiError('INVALID_REQUEST', 404, 'No data found for user');
  }

  // Record the deletion in the audit log (using 'system' as actor since
  // the user's own audit log was just deleted)
  recordAuditLog({
    actorId: 'system',
    action: 'gdpr.delete',
    entityType: 'user',
    entityId: userId,
    details: { deletedRecords: deletedCount },
  });

  return apiSuccess({ deletedRecords: deletedCount });
}, { rateLimit: 'auth' });
