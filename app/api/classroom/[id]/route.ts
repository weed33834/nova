import { type NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { isValidClassroomId, deleteClassroom } from '@/lib/server/classroom-storage';
import { withApiHandler } from '@/lib/server/api-handler';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';

/**
 * DELETE /api/classroom/[id] — Delete a classroom and all its version snapshots.
 *
 * Returns 200 with `{ deleted: true }` if the classroom existed and was removed.
 * Returns 200 with `{ deleted: false }` if the classroom was already absent
 * (idempotent delete — no 404 for missing classrooms, matching REST delete
 * semantics where the end state is "no classroom with this id" regardless).
 */
export const DELETE = withApiHandler(async (
  req: NextRequest,
  ctx,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    if (!id || !isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const existed = await deleteClassroom(id);

    ctx.log.info('Classroom deleted', { classroomId: id, existed });
    return apiSuccess({ deleted: true, existed });
  } catch (error) {
    ctx.log.error('Classroom deletion failed:', error);
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to delete classroom',
      sanitizedErrorDetails(error),
    );
  }
}, { rateLimit: 'moderate' });
