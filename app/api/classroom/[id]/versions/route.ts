import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { isValidClassroomId, readClassroom } from '@/lib/server/classroom-storage';
import { listVersions, createVersion } from '@/lib/server/content-versioning';
import { withApiHandler } from '@/lib/server/api-handler';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';

/**
 * GET /api/classroom/[id]/versions — List all version snapshots for a classroom.
 *
 * Returns versions sorted by timestamp descending (newest first).
 * Each entry includes: versionId, timestamp, label, size.
 */
export const GET = withApiHandler(async (
  req: NextRequest,
  ctx,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    if (!id || !isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    // Verify the classroom exists before listing versions
    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    const versions = await listVersions(id);
    return apiSuccess({ versions });
  } catch (error) {
    ctx.log.error('Version listing failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to list versions',
      sanitizedErrorDetails(error),
    );
  }
}, { rateLimit: 'light' });

/**
 * POST /api/classroom/[id]/versions — Create a manual version snapshot.
 *
 * Body: `{ "label"?: string }` — optional label for the snapshot (defaults to "manual").
 * Returns the created version metadata.
 */
export const POST = withApiHandler(async (
  req: NextRequest,
  ctx,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    if (!id || !isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    // Verify the classroom exists
    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    let label = 'manual';
    try {
      const body = await req.json();
      if (typeof body?.label === 'string' && body.label.trim()) {
        label = body.label.trim().slice(0, 50);
      }
    } catch {
      // Empty body is fine — use default label
    }

    const version = await createVersion(id, classroom, label);
    ctx.log.info('Manual version created', { classroomId: id, versionId: version.versionId });

    return apiSuccess({ version }, 201);
  } catch (error) {
    ctx.log.error('Version creation failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to create version',
      sanitizedErrorDetails(error),
    );
  }
}, { rateLimit: 'moderate' });
