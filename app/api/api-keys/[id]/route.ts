import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/client';
import { apiKeys } from '@/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/rbac';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('ApiKeysRoute');

/** DELETE /api/api-keys/[id] — 撤销 API key */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requirePermission('apikey:manage');
    const userId = (session.user as { id: string }).id;
    const { id } = await params;
    const db = getDb();

    // 确保用户只能撤销自己的 key
    const result = await db
      .update(apiKeys)
      .set({ revokedAt: new Date().toISOString() })
      .where(and(eq(apiKeys.id, id), eq(apiKeys.ownerId, userId)))
      .returning({ id: apiKeys.id });

    if (result.length === 0) {
      return apiError('INVALID_REQUEST', 404, 'API key not found');
    }

    log.info('API key revoked', { keyId: id, userId });

    return apiSuccess({ revoked: true });
  } catch (error) {
    log.error('Failed to revoke API key:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to revoke API key');
  }
}
