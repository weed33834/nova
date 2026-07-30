import { requireAuth } from '@/lib/auth/rbac';
import { withApiHandler } from '@/lib/server/api-handler';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { checkAllQuotas } from '@/lib/server/quota';
import type { NextRequest } from 'next/server';

/** GET /api/quota — 获取当前用户的月度配额状态 */
export const GET = withApiHandler(async (_req: NextRequest, ctx) => {
  try {
    const session = await requireAuth();
    const userId = (session.user as { id: string }).id;
    const role = (session.user as { role?: string }).role;

    const quotas = await checkAllQuotas(userId, role);

    return apiSuccess({ quotas });
  } catch (error) {
    if (error instanceof Error && error.name === 'AuthRequiredError') {
      return apiError('VALIDATION_ERROR', 401, 'Authentication required');
    }
    ctx.log.error('Failed to get quota status:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to get quota status');
  }
}, { rateLimit: 'light' });
