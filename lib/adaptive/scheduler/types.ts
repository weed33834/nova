import type {
  KnowledgeGraph,
  ConceptNode,
  KnowledgeState,
  ConceptPath,
} from '@/lib/adaptive/knowledge-graph/types';
import type { StudentProfile } from '@/lib/profile/schema';

export interface ScheduledItem {
  conceptId: string;
  concept: ConceptNode;
  order: number;
  estimatedMinutes: number;
  depth: 'surface' | 'normal' | 'deep';
  adaptiveReason: string;
}

export interface LearningSchedule {
  profileId: string;
  items: ScheduledItem[];
  totalEstimatedMinutes: number;
  totalItems: number;
  generatedAt: number;
  strategy: SchedulingStrategy;
}

export interface SchedulingConfig {
  maxSessionMinutes: number;
  maxItemsPerSession: number;
  preferShallowFirst: boolean;
  interleaveTopics: boolean;
}

export type SchedulingStrategy = 'depth_first' | 'breadth_first' | 'prerequisite_first' | 'mixed';

export interface AdaptivePathResult {
  schedule: LearningSchedule;
  knowledgeState: KnowledgeState;
  path: ConceptPath;
}
