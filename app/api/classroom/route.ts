import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { getServerSession } from 'next-auth';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { validateBody } from '@/lib/server/validate';
import {
  buildRequestOrigin,
  isValidClassroomId,
  persistClassroom,
  readClassroom,
} from '@/lib/server/classroom-storage';
import { recordAuditLog } from '@/lib/db/audit';
import { createLogger } from '@/lib/logger';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import { authOptions } from '@/lib/auth/config';
import type { Stage, Scene } from '@/lib/types/stage';

const log = createLogger('Classroom API');

// Zod schema for classroom creation — stage and scenes are complex objects
// validated structurally (presence + type), not field-by-field.
// The validated output is cast to the app-level types since the full schema
// lives in @nova/dsl and is too large to mirror here; the passthrough ensures
// no fields are stripped.
const createClassroomSchema = z.object({
  stage: z.object({ id: z.string().optional() }).passthrough(),
  scenes: z.array(z.object({}).passthrough()),
});

export async function POST(request: NextRequest) {
  let stageId: string | undefined;
  let sceneCount: number | undefined;
  try {
    const body = await request.json();
    const validation = validateBody(createClassroomSchema, body);
    if (!validation.ok) return validation.response;

    // Cast the passthrough-validated objects to their app-level types.
    // The Zod schema guarantees structural presence (object + array);
    // the full field-level contract lives in @nova/dsl and is enforced
    // downstream by the renderer / playback layer.
    const stage = validation.data.stage as unknown as Stage;
    const scenes = validation.data.scenes as unknown as Scene[];
    stageId = stage?.id;
    sceneCount = scenes?.length;

    const id = stage.id || randomUUID();
    if (typeof id !== 'string' || !isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }
    const baseUrl = buildRequestOrigin(request);

    // Record owner when user is authenticated (optional — no auth = anonymous)
    let ownerId: string | null = null;
    let userRole: string | undefined;
    try {
      const session = await getServerSession(authOptions);
      ownerId = (session?.user as { id?: string } | undefined)?.id ?? null;
      userRole = (session?.user as { role?: string } | undefined)?.role;
    } catch {
      // Auth not configured — classroom is anonymous
    }

    const persisted = await persistClassroom(
      { id, stage: { ...stage, id }, scenes, ownerId },
      baseUrl,
    );

    // Audit log
    if (ownerId) {
      recordAuditLog({
        actorId: ownerId,
        actorRole: userRole,
        action: 'classroom.create',
        entityType: 'classroom',
        entityId: id,
        details: { sceneCount: scenes.length, stageName: stage.name },
      });
    }

    return apiSuccess({ id: persisted.id, url: persisted.url }, 201);
  } catch (error) {
    log.error(
      `Classroom storage failed [stageId=${stageId ?? 'unknown'}, scenes=${sceneCount ?? 0}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to store classroom',
      sanitizedErrorDetails(error),
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get('id');

    if (!id) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required parameter: id',
      );
    }

    if (!isValidClassroomId(id)) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid classroom id');
    }

    const classroom = await readClassroom(id);
    if (!classroom) {
      return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Classroom not found');
    }

    return apiSuccess({ classroom });
  } catch (error) {
    log.error(
      `Classroom retrieval failed [id=${request.nextUrl.searchParams.get('id') ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      'Failed to retrieve classroom',
      sanitizedErrorDetails(error),
    );
  }
}
