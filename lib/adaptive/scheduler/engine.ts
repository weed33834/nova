import type {
  LearningSchedule,
  ScheduledItem,
  SchedulingConfig,
  SchedulingStrategy,
  AdaptivePathResult,
} from './types';
import type {
  KnowledgeGraph,
  ConceptNode,
  KnowledgeState,
  ConceptPath,
} from '@/lib/adaptive/knowledge-graph/types';
import type { StudentProfile } from '@/lib/profile/schema';
import { getPrerequisites } from '@/lib/adaptive/knowledge-graph/types';
import { getLearningPath } from '@/lib/adaptive/knowledge-graph/graph';
import { createLogger } from '@/lib/logger';

const log = createLogger('Scheduler');

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  maxSessionMinutes: 120,
  maxItemsPerSession: 8,
  preferShallowFirst: true,
  interleaveTopics: true,
};

export class AdaptiveScheduler {
  private config: SchedulingConfig;

  constructor(config: Partial<SchedulingConfig> = {}) {
    this.config = { ...DEFAULT_SCHEDULING_CONFIG, ...config };
  }

  generateSchedule(
    graph: KnowledgeGraph,
    profile: StudentProfile,
    knowledgeState: KnowledgeState,
    targetConceptIds?: string[],
    strategy: SchedulingStrategy = 'prerequisite_first',
  ): AdaptivePathResult {
    const targets = targetConceptIds ?? this.selectTargets(graph, profile, knowledgeState);
    const path = this.buildPath(graph, targets, strategy);

    const knownIds = this.getKnownConceptIds(knowledgeState);
    const filteredPath: ConceptNode[] = path.nodes.filter(
      (n) => !knownIds.has(n.id) || (knowledgeState.masteryLevels.get(n.id) ?? 0) < 0.5,
    );

    const scheduled = this.scheduleItems(filteredPath, graph, knowledgeState, strategy);
    const totalMinutes = scheduled.reduce((sum, item) => sum + item.estimatedMinutes, 0);

    const schedule: LearningSchedule = {
      profileId: profile.id,
      items: scheduled,
      totalEstimatedMinutes: totalMinutes,
      totalItems: scheduled.length,
      generatedAt: Date.now(),
      strategy,
    };

    log.info(
      `[Scheduler] Generated schedule with ${scheduled.length} items (~${totalMinutes}min) for profile ${profile.id}`,
    );

    return { schedule, knowledgeState, path };
  }

  private selectTargets(
    graph: KnowledgeGraph,
    profile: StudentProfile,
    state: KnowledgeState,
  ): string[] {
    const unmastered = graph.nodes.filter(
      (n) => (state.masteryLevels.get(n.id) ?? 0) < 0.4 && !state.visitedConcepts.includes(n.id),
    );

    if (unmastered.length === 0) {
      const advanced = graph.nodes.filter(
        (n) => n.category === 'advanced' || n.category === 'application',
      );
      return advanced.slice(0, 3).map((n) => n.id);
    }

    if (profile.learningGoals?.length > 0) {
      const goalRelated = unmastered.filter((n) =>
        profile.learningGoals!.some(
          (g) =>
            n.keywords.some((kw) => g.description.includes(kw)) || g.description.includes(n.label),
        ),
      );
      if (goalRelated.length > 0) {
        return goalRelated.slice(0, 3).map((n) => n.id);
      }
    }

    return unmastered.slice(0, 3).map((n) => n.id);
  }

  private buildPath(
    graph: KnowledgeGraph,
    targetIds: string[],
    strategy: SchedulingStrategy,
  ): ConceptPath {
    const allNodes: ConceptNode[] = [];
    const seen = new Set<string>();

    for (const targetId of targetIds) {
      const targetNode = graph.nodes.find((n) => n.id === targetId);
      if (!targetNode) continue;

      const path = getLearningPath(graph, targetId, []);
      for (const node of path) {
        if (!seen.has(node.id)) {
          allNodes.push(node);
          seen.add(node.id);
        }
      }
    }

    const firstTarget = graph.nodes.find((n) => n.id === targetIds[0]);
    const nodes =
      allNodes.length > 0 ? allNodes : firstTarget ? [firstTarget] : graph.nodes.slice(0, 5);

    const avgDifficulty = nodes.reduce((s, n) => s + n.difficulty, 0) / nodes.length;
    const difficulty: ConceptPath['difficulty'] =
      avgDifficulty < 3 ? 'beginner' : avgDifficulty < 6 ? 'intermediate' : 'advanced';

    return {
      nodes:
        strategy === 'depth_first'
          ? nodes.sort((a, b) => b.difficulty - a.difficulty)
          : nodes.sort((a, b) => a.difficulty - b.difficulty),
      totalEstimatedMinutes: nodes.reduce((s, n) => s + n.estimatedMinutes, 0),
      difficulty,
    };
  }

  private scheduleItems(
    nodes: ConceptNode[],
    graph: KnowledgeGraph,
    state: KnowledgeState,
    strategy: SchedulingStrategy,
  ): ScheduledItem[] {
    if (strategy === 'breadth_first') {
      const byCategory: Record<string, ConceptNode[]> = {};
      for (const node of nodes) {
        (byCategory[node.category] ??= []).push(node);
      }
      const interleaved: ConceptNode[] = [];
      const maxLen = Math.max(...Object.values(byCategory).map((a) => a.length));
      for (let i = 0; i < maxLen; i++) {
        for (const cat of Object.keys(byCategory)) {
          if (byCategory[cat][i]) interleaved.push(byCategory[cat][i]);
        }
      }
      nodes = interleaved;
    }

    const limited = nodes.slice(0, this.config.maxItemsPerSession);
    const scheduled: ScheduledItem[] = [];
    let runningTotal = 0;

    for (let i = 0; i < limited.length; i++) {
      const node = limited[i];
      if (runningTotal + node.estimatedMinutes > this.config.maxSessionMinutes) break;
      runningTotal += node.estimatedMinutes;

      const mastered = (state.masteryLevels.get(node.id) ?? 0) >= 0.7;
      const prereqsUnmet = getPrerequisites(graph, node.id).some(
        (p) => (state.masteryLevels.get(p.id) ?? 0) < 0.4,
      );

      let depth: ScheduledItem['depth'] = 'normal';
      let adaptiveReason = 'Standard learning pace';

      if (mastered) {
        depth = 'surface';
        adaptiveReason = 'Already partially mastered, review only';
      } else if (prereqsUnmet) {
        depth = 'surface';
        adaptiveReason = 'Prerequisites not yet met, introductory coverage';
      } else if (node.difficulty > 6) {
        depth = 'deep';
        adaptiveReason = 'Advanced concept requiring deeper study';
      }

      scheduled.push({
        conceptId: node.id,
        concept: node,
        order: i + 1,
        estimatedMinutes: node.estimatedMinutes,
        depth,
        adaptiveReason,
      });
    }

    return scheduled;
  }

  private getKnownConceptIds(state: KnowledgeState): Set<string> {
    const known = new Set(state.visitedConcepts);
    for (const [id, mastery] of state.masteryLevels) {
      if (mastery >= 0.7) known.add(id);
    }
    return known;
  }
}
