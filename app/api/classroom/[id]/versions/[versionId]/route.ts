import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { isValidClassroomId, readClassroom } from '@/lib/server/classroom-storage';
import { getVersion, deleteVersion } from '@/lib/server/content-versioning';
import { withApiHandler } from '@/lib/server/api-handler';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';

/**
 * GET /api/classroom/[id]/versions/[versionId] — Get a specific version's
 * full content (metadata + complete classroom data snapshot).
 */
export const GET = withApiHandler(async (
  req: NextRequest,
  ctx,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) => {
  try {
    const { id, versionId } = await params;

    if (!id || !isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }
    if (!versionId || !/^[a-zA-Z0-9_-]+$/.test(versionId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid version id');
    }

    const version = await getVersion(id, versionId);
    if (!version) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Version not found');
    }

    return apiSuccess({ version });
  } catch (error) {
    ctx.log.error('Version retrieval failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve version',
      sanitizedErrorDetails(error),
    );
  }
}, { rateLimit: 'light' });

/**
 * DELETE /api/classroom/[id]/versions/[versionId] — Delete a specific version snapshot.
 */
export const DELETE = withApiHandler(async (
  req: NextRequest,
  ctx,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) => {
  try {
    const { id, versionId } = await params;

    if (!id || !isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }
    if (!versionId || !/^[a-zA-Z0-9_-]+$/.test(versionId)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid version id');
    }

    const deleted = await deleteVersion(id, versionId);
    if (!deleted) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Version not found');
    }

    ctx.log.info('Version deleted', { classroomId: id, versionId });
    return apiSuccess({ deleted: true });
  } catch (error) {
    ctx.log.error('Version deletion failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete version',
      sanitizedErrorDetails(error),
    );
  }
}, { rateLimit: 'moderate' });
