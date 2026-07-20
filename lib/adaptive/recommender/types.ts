import type {
  KnowledgeGraph,
  ConceptNode,
  KnowledgeState,
} from '@/lib/adaptive/knowledge-graph/types';
import type { StudentProfile } from '@/lib/profile/schema';

export type RecommendationReason =
  | 'knowledge_gap'
  | 'prerequisite'
  | 'reinforcement'
  | 'challenge'
  | 'interest_match';

export interface Recommendation {
  conceptId: string;
  concept: ConceptNode;
  score: number;
  reason: RecommendationReason;
  explanation: string;
  estimatedMinutes: number;
}

export interface RecommendationResult {
  recommendations: Recommendation[];
  profile: StudentProfile;
  knowledgeState: KnowledgeState;
  generatedAt: number;
}

export type RecommendationStrategy =
  | 'gap_filling'
  | 'prerequisite_first'
  | 'spaced_repetition'
  | 'interest_based';

export interface RecommenderConfig {
  strategy: RecommendationStrategy;
  maxRecommendations: number;
  minMasteryThreshold: number;
  noveltyPreference: number;
}
