import { NextRequest, NextResponse } from 'next/server';
import { RecommenderEngine } from '@/lib/adaptive/recommender/engine';
import { AdaptiveScheduler } from '@/lib/adaptive/scheduler/engine';
import type { KnowledgeGraph, KnowledgeState } from '@/lib/adaptive/knowledge-graph/types';
import type { StudentProfile } from '@/lib/profile/schema';
import type { RecommendationStrategy } from '@/lib/adaptive/recommender/types';
import type { SchedulingStrategy } from '@/lib/adaptive/scheduler/types';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { z } from 'zod';
import { validateBody } from '@/lib/server/validate';

const RequestSchema = z.object({
  action: z.enum(['recommend', 'schedule', 'both']),
  graph: z.unknown(),
  knowledgeState: z.unknown().optional(),
  profile: z.unknown(),
  config: z.unknown().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validateBody(RequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const { action, graph, profile, knowledgeState, config } = parsed.data as {
      action: 'recommend' | 'schedule' | 'both';
      graph: KnowledgeGraph;
      knowledgeState?: KnowledgeState;
      profile: StudentProfile;
      config?: {
        strategy?: RecommendationStrategy;
        schedulingStrategy?: SchedulingStrategy;
        targetConceptIds?: string[];
      };
    };

    if (!graph || !profile) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required fields: graph, profile',
      );
    }

    const profileWithDefaults: StudentProfile = {
      id: profile.id,
      version: profile.version ?? 1,
      createdAt: profile.createdAt ?? Date.now(),
      updatedAt: profile.updatedAt ?? Date.now(),
      knowledgeFoundation: profile.knowledgeFoundation ?? [],
      learningGoals: profile.learningGoals ?? [],
      learningHistory: profile.learningHistory ?? [],
      totalStudyTime: profile.totalStudyTime ?? 0,
      streakDays: profile.streakDays ?? 0,
      errorPatterns: profile.errorPatterns ?? [],
      specialNeeds: profile.specialNeeds ?? ['none'],
      metadata: profile.metadata ?? {},
    };

    const state: KnowledgeState = knowledgeState ?? {
      graphId: graph.id,
      masteryLevels: new Map(),
      visitedConcepts: [],
      attemptedAssessments: [],
      lastActivity: Date.now(),
    };

    const results: Record<string, unknown> = {};

    if (action === 'recommend' || action === 'both') {
      const recommender = new RecommenderEngine();
      const recommendationResult = recommender.recommend(graph, profileWithDefaults, state);
      results.recommendations = recommendationResult;
    }

    if (action === 'schedule' || action === 'both') {
      const scheduler = new AdaptiveScheduler();
      const scheduleResult = scheduler.generateSchedule(
        graph,
        profileWithDefaults,
        state,
        config?.targetConceptIds,
        config?.schedulingStrategy,
      );
      results.schedule = scheduleResult;
    }

    return NextResponse.json(results);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
