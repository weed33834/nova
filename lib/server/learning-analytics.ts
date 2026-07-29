/**
 * Learning Analytics — xAPI-inspired event tracking.
 *
 * Captures user learning behavior events (scene viewed, quiz answered,
 * TTS played, etc.) into the `learning_events` table for BI dashboards
 * and learning path optimization.
 *
 * Events are written fire-and-forget (like audit logs) so they never
 * block the user's request.
 *
 * @see https://github.com/adlnet/xAPI-Spec (xAPI specification)
 */
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { learningEvents, type LearningEvent } from '@/lib/db/schema';
import { createLogger } from '@/lib/logger';

const log = createLogger('LearningAnalytics');

export type LearningVerb =
  | 'viewed' // User viewed a scene/slide
  | 'completed' // User completed a scene/lesson
  | 'answered' // User answered a quiz question
  | 'played' // User played TTS/audio/video
  | 'interacted' // User interacted with an element
  | 'exported' // User exported a classroom
  | 'shared' // User shared a classroom
  | 'generated' // User generated new content
  | 'edited' // User edited content
  | 'started' // User started a session/classroom
  | 'left'; // User left a session/classroom

export type LearningObjectType =
  | 'scene'
  | 'slide'
  | 'quiz'
  | 'tts'
  | 'video'
  | 'image'
  | 'classroom'
  | 'element'
  | 'agent';

export interface LearningEventInput {
  userId?: string | null;
  classroomId?: string | null;
  sceneId?: string | null;
  sessionId?: string | null;
  verb: LearningVerb;
  objectType?: LearningObjectType | null;
  objectId?: string | null;
  result?: {
    score?: number;
    success?: boolean;
    completion?: boolean;
    duration?: number;
    response?: string;
  } | null;
  durationMs?: number | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Record a learning event. Fire-and-forget — never throws.
 */
export function recordLearningEvent(input: LearningEventInput): LearningEvent | null {
  try {
    const db = getDb();
    const row = db
      .insert(learningEvents)
      .values({
        createdAt: Date.now(),
        userId: input.userId ?? null,
        classroomId: input.classroomId ?? null,
        sceneId: input.sceneId ?? null,
        sessionId: input.sessionId ?? null,
        verb: input.verb,
        objectType: input.objectType ?? null,
        objectId: input.objectId ?? null,
        resultJson: input.result ? JSON.stringify(input.result) : null,
        durationMs: input.durationMs ?? null,
        metadataJson: input.metadata ? JSON.stringify(input.metadata) : null,
      })
      .returning()
      .get();
    return row ?? null;
  } catch (err) {
    log.warn('Failed to record learning event (ignored):', err);
    return null;
  }
}

/**
 * Get learning events for a specific user.
 */
export function getEventsByUser(
  userId: string,
  opts?: { limit?: number; offset?: number; verb?: LearningVerb },
): LearningEvent[] {
  try {
    const db = getDb();
    const limit = opts?.limit ?? 100;
    const offset = opts?.offset ?? 0;

    if (opts?.verb) {
      return db
        .select()
        .from(learningEvents)
        .where(eq(learningEvents.userId, userId))
        .limit(limit)
        .offset(offset)
        .all() as LearningEvent[];
    }

    return db
      .select()
      .from(learningEvents)
      .limit(limit)
      .offset(offset)
      .all() as LearningEvent[];
  } catch {
    return [];
  }
}

/**
 * Get aggregated learning stats for a classroom.
 */
export function getClassroomStats(classroomId: string): {
  totalViews: number;
  uniqueViewers: number;
  completions: number;
  quizAnswers: number;
  averageScore: number | null;
} {
  try {
    const db = getDb();
    const events = db
      .select()
      .from(learningEvents)
      .all() as LearningEvent[];

    const classroomEvents = events.filter((e) => e.classroomId === classroomId);
    const views = classroomEvents.filter((e) => e.verb === 'viewed');
    const uniqueUsers = new Set(views.map((e) => e.userId).filter(Boolean));
    const completions = classroomEvents.filter((e) => e.verb === 'completed');
    const quizEvents = classroomEvents.filter((e) => e.verb === 'answered');

    let totalScore = 0;
    let scoreCount = 0;
    for (const e of quizEvents) {
      if (e.resultJson) {
        try {
          const result = JSON.parse(e.resultJson) as { score?: number };
          if (typeof result.score === 'number') {
            totalScore += result.score;
            scoreCount++;
          }
        } catch {
          // skip
        }
      }
    }

    return {
      totalViews: views.length,
      uniqueViewers: uniqueUsers.size,
      completions: completions.length,
      quizAnswers: quizEvents.length,
      averageScore: scoreCount > 0 ? totalScore / scoreCount : null,
    };
  } catch {
    return {
      totalViews: 0,
      uniqueViewers: 0,
      completions: 0,
      quizAnswers: 0,
      averageScore: null,
    };
  }
}

