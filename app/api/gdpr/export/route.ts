/**
 * GDPR Data Export API
 *
 * GET /api/gdpr/export?userId=<id>
 *
 * Admin-only endpoint that exports all data associated with a user
 * as a downloadable JSON file. Required for GDPR Article 20 (right to
 * data portability).
 */
import { type NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { exportUserData } from '@/lib/server/gdpr';
import { recordAuditLog } from '@/lib/db/audit';
import { requirePermission } from '@/lib/auth/rbac';

export const GET = withApiHandler(async (req: NextRequest) => {
  const userId = req.nextUrl.searchParams.get('userId');

  if (!userId) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'userId query parameter is required');
  }

  // Require admin role — GDPR export is a privileged operation
  await requirePermission('user:manage');

  const data = exportUserData(userId);

  if (!data) {
    return apiError('INVALID_REQUEST', 404, 'User not found');
  }

  // Record the export in the audit log
  recordAuditLog({
    actorId: 'system',
    action: 'gdpr.export',
    entityType: 'user',
    entityId: userId,
    details: { recordCount: data.classrooms.length + data.skills.length + data.auditLogs.length },
  });

  return apiSuccess({ data });
}, { rateLimit: 'light' });
