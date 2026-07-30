import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import {
  isValidClassroomId,
  readClassroom,
  persistClassroom,
  buildRequestOrigin,
} from '@/lib/server/classroom-storage';
import { getVersion, createVersion } from '@/lib/server/content-versioning';
import { withApiHandler } from '@/lib/server/api-handler';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';

/**
 * POST /api/classroom/[id]/versions/[versionId]/restore — Restore a classroom
 * to a specific version.
 *
 * Flow:
 *   1. Read the current classroom state.
 *   2. Create a safety snapshot of the current state (so the user can undo
 *      the restore if they picked the wrong version).
 *   3. Overwrite the classroom file with the target version's data.
 *
 * Returns the restored classroom data.
 */
export const POST = withApiHandler(async (
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

    // Fetch the target version
    const version = await getVersion(id, versionId);
    if (!version) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Version not found');
    }

    // Read the current state to create a safety snapshot before restoring
    const current = await readClassroom(id);
    if (current) {
      try {
        await createVersion(id, current, 'pre-restore');
      } catch (err) {
        ctx.log.warn('Failed to create pre-restore safety snapshot', { classroomId: id, err });
      }
    }

    // Restore: overwrite the classroom with the version data
    const versionData = version.data as {
      id: string;
      stage: unknown;
      scenes: unknown[];
    };

    if (!versionData || typeof versionData !== 'object' || !versionData.stage || !Array.isArray(versionData.scenes)) {
      return apiError(
        API_ERROR_CODES.INVALID_REQUEST,
        500,
        'Version data is corrupt or incomplete',
      );
    }

    const baseUrl = buildRequestOrigin(req);
    const restored = await persistClassroom(
      {
        id,
        stage: versionData.stage as Parameters<typeof persistClassroom>[0]['stage'],
        scenes: versionData.scenes as Parameters<typeof persistClassroom>[0]['scenes'],
        ownerId: (versionData as { ownerId?: string | null }).ownerId,
      },
      baseUrl,
    );

    ctx.log.info('Classroom restored', { classroomId: id, versionId });
    return apiSuccess({
      restored: true,
      versionId,
      url: restored.url,
    });
  } catch (error) {
    ctx.log.error('Version restore failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to restore version',
      sanitizedErrorDetails(error),
    );
  }
}, { rateLimit: 'moderate' });
