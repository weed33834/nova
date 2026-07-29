import { type NextRequest } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { validateBody } from '@/lib/server/validate';
import { withApiHandler } from '@/lib/server/api-handler';
import { recordLearningEvent, getClassroomStats } from '@/lib/server/learning-analytics';
import { authOptions } from '@/lib/auth/config';
import { createLogger } from '@/lib/logger';

const log = createLogger('LearningEventsAPI');

const recordEventSchema = z.object({
  classroomId: z.string().optional(),
  sceneId: z.string().optional(),
  sessionId: z.string().optional(),
  verb: z.enum([
    'viewed', 'completed', 'answered', 'played', 'interacted',
    'exported', 'shared', 'generated', 'edited', 'started', 'left',
  ]),
  objectType: z.enum([
    'scene', 'slide', 'quiz', 'tts', 'video', 'image',
    'classroom', 'element', 'agent',
  ]).optional(),
  objectId: z.string().optional(),
  result: z.object({
    score: z.number().optional(),
    success: z.boolean().optional(),
    completion: z.boolean().optional(),
    duration: z.number().optional(),
    response: z.string().optional(),
  }).optional(),
  durationMs: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/** POST /api/learning-events — Record a learning event */
export const POST = withApiHandler(async (req: NextRequest) => {
  try {
    const body = await req.json();
    const validation = validateBody(recordEventSchema, body);
    if (!validation.ok) return validation.response;

    // Get user ID if authenticated (optional — anonymous events are allowed)
    let userId: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      userId = (session?.user as { id?: string } | undefined)?.id ?? null;
    } catch {
      // Auth not configured
    }

    const event = recordLearningEvent({
      ...validation.data,
      userId,
    });

    return apiSuccess({ recorded: !!event }, 201);
  } catch (error) {
    log.error('Failed to record learning event:', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to record learning event');
  }
}, { rateLimit: 'moderate' });

/** GET /api/learning-events — Get classroom learning stats */
export async function GET(req: NextRequest) {
  try {
    const classroomId = req.nextUrl.searchParams.get('classroomId');
    if (!classroomId) {
      return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'Missing classroomId parameter');
    }

    const stats = getClassroomStats(classroomId);
    return apiSuccess({ stats });
  } catch (error) {
    log.error('Failed to get learning stats:', error);
    return apiError(API_ERROR_CODES.INTERNAL_ERROR, 500, 'Failed to get learning stats');
  }
}
