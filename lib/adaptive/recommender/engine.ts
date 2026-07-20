import type {
  Recommendation,
  RecommendationResult,
  RecommenderConfig,
  RecommendationReason,
} from './types';
import type {
  KnowledgeGraph,
  ConceptNode,
  KnowledgeState,
} from '@/lib/adaptive/knowledge-graph/types';
import type { StudentProfile } from '@/lib/profile/schema';
import { getPrerequisites, getDependents } from '@/lib/adaptive/knowledge-graph/types';
import { getLearningPath } from '@/lib/adaptive/knowledge-graph/graph';
import { createLogger } from '@/lib/logger';

const log = createLogger('Recommender');

export const DEFAULT_RECOMMENDER_CONFIG: RecommenderConfig = {
  strategy: 'gap_filling',
  maxRecommendations: 5,
  minMasteryThreshold: 0.7,
  noveltyPreference: 0.3,
};

export class RecommenderEngine {
  private config: RecommenderConfig;

  constructor(config: Partial<RecommenderConfig> = {}) {
    this.config = { ...DEFAULT_RECOMMENDER_CONFIG, ...config };
  }

  recommend(
    graph: KnowledgeGraph,
    profile: StudentProfile,
    knowledgeState: KnowledgeState,
  ): RecommendationResult {
    const allRecommendations = this.generateCandidates(graph, profile, knowledgeState);
    const scored = this.scoreRecommendations(allRecommendations, profile, knowledgeState);
    const top = this.diversify(scored).slice(0, this.config.maxRecommendations);

    log.info(`[Recommender] Generated ${top.length} recommendations for profile ${profile.id}`);

    return {
      recommendations: top,
      profile,
      knowledgeState,
      generatedAt: Date.now(),
    };
  }

  private generateCandidates(
    graph: KnowledgeGraph,
    profile: StudentProfile,
    state: KnowledgeState,
  ): Recommendation[] {
    const candidates: Recommendation[] = [];
    const masteredConcepts = this.getMasteredConcepts(graph, state);
    const knownIds = masteredConcepts.map((c) => c.id);

    for (const concept of graph.nodes) {
      if (knownIds.includes(concept.id)) continue;

      const mastery = state.masteryLevels.get(concept.id) ?? 0;
      const isVisited = state.visitedConcepts.includes(concept.id);

      if (mastery >= this.config.minMasteryThreshold && isVisited) continue;

      const prerequisites = getPrerequisites(graph, concept.id);
      const prereqsMet = prerequisites.every(
        (p) => (state.masteryLevels.get(p.id) ?? 0) >= this.config.minMasteryThreshold,
      );

      let reason: RecommendationReason = 'knowledge_gap';
      let explanation = '';

      if (!prereqsMet) {
        const missing = prerequisites.filter(
          (p) => (state.masteryLevels.get(p.id) ?? 0) < this.config.minMasteryThreshold,
        );
        reason = 'prerequisite';
        explanation = `Need to learn prerequisite: ${missing.map((m) => m.label).join(', ')}`;
        candidates.push({
          conceptId: concept.id,
          concept,
          score: 0,
          reason,
          explanation,
          estimatedMinutes: concept.estimatedMinutes,
        });
      }

      if (isVisited && mastery < this.config.minMasteryThreshold) {
        reason = 'reinforcement';
        explanation = `Reinforce understanding of "${concept.label}" (mastery: ${Math.round(mastery * 100)}%)`;
        candidates.push({
          conceptId: concept.id,
          concept,
          score: 0,
          reason,
          explanation,
          estimatedMinutes: concept.estimatedMinutes,
        });
      }

      if (prereqsMet && !isVisited) {
        reason = 'knowledge_gap';
        explanation = `New concept to learn: "${concept.label}"`;
        candidates.push({
          conceptId: concept.id,
          concept,
          score: 0,
          reason,
          explanation,
          estimatedMinutes: concept.estimatedMinutes,
        });
      }

      if (profile.learningGoals?.length > 0) {
        for (const goal of profile.learningGoals) {
          if (
            concept.keywords.some((kw) => goal.description.includes(kw)) ||
            goal.description.includes(concept.label)
          ) {
            reason = 'interest_match';
            explanation = `Matches your learning goal: "${goal.description.slice(0, 60)}"`;
            candidates.push({
              conceptId: concept.id,
              concept,
              score: 0,
              reason,
              explanation,
              estimatedMinutes: concept.estimatedMinutes,
            });
          }
        }
      }
    }

    return candidates;
  }

  private scoreRecommendations(
    candidates: Recommendation[],
    profile: StudentProfile,
    state: KnowledgeState,
  ): Recommendation[] {
    return candidates.map((rec) => {
      let score = 0;

      const missingPrereqs = getPrerequisites(
        { id: '', name: '', subject: '', nodes: [rec.concept], edges: [] },
        rec.concept.id,
      );
      const prereqRatio =
        missingPrereqs.length > 0
          ? missingPrereqs.filter((p) => (state.masteryLevels.get(p.id) ?? 0) >= 0.5).length /
            missingPrereqs.length
          : 1;
      score += prereqRatio * 0.3;

      if (rec.reason === 'interest_match') score += 0.25;
      if (rec.reason === 'knowledge_gap') score += 0.2;
      if (rec.reason === 'reinforcement') score += 0.1;
      if (rec.reason === 'prerequisite') score += 0.15;

      const difficultyGap = Math.abs(
        rec.concept.difficulty -
          (profile.knowledgeFoundation?.reduce((sum, kf) => {
            const levelMap: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3 };
            return sum + (levelMap[kf.level] ?? 1);
          }, 0) ?? 1) /
            Math.max(profile.knowledgeFoundation?.length ?? 1, 1),
      );
      score += Math.max(0, 1 - difficultyGap * 0.1) * 0.15;

      score += (1 - (state.masteryLevels.get(rec.concept.id) ?? 0)) * 0.2;

      return { ...rec, score: Math.round(score * 100) / 100 };
    });
  }

  private diversify(ranked: Recommendation[]): Recommendation[] {
    const seenCategories = new Set<string>();
    const diversified: Recommendation[] = [];

    for (const rec of ranked) {
      const category = rec.concept.category;
      if (!seenCategories.has(category) || diversified.length < 3) {
        diversified.push(rec);
        seenCategories.add(category);
      } else if (rec.score > 0.5) {
        diversified.push(rec);
      }
    }

    return diversified.sort((a, b) => b.score - a.score);
  }

  private getMasteredConcepts(graph: KnowledgeGraph, state: KnowledgeState): ConceptNode[] {
    return graph.nodes.filter(
      (n) => (state.masteryLevels.get(n.id) ?? 0) >= this.config.minMasteryThreshold,
    );
  }
}
