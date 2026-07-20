export interface KnowledgeTrace {
  studentId: string;
  conceptId: string;
  mastery: number;
  confidence: number;
  attempts: number;
  successes: number;
  lastPracticed: number;
  history: TraceEntry[];
}

export interface TraceEntry {
  timestamp: number;
  type: 'quiz' | 'practice' | 'explanation' | 'hint' | 'observation';
  outcome: 'correct' | 'incorrect' | 'partial' | 'viewed';
  score: number;
  duration: number;
}

export interface TracingConfig {
  forgettingRate: number;
  learningRate: number;
  priorMastery: number;
  responseTimeWeight: number;
  minObservations: number;
}

export type MasteryLevel = 'novice' | 'developing' | 'proficient' | 'advanced' | 'mastered';

export interface SkillModel {
  conceptId: string;
  prerequisites: string[];
  skills: string[];
  difficulty: number;
  estimatedPractices: number;
}

export interface TracingSnapshot {
  studentId: string;
  traces: KnowledgeTrace[];
  overallMastery: number;
  totalConcepts: number;
  masteredConcepts: number;
  weakConcepts: string[];
  recommendedReview: string[];
  generatedAt: number;
}

export interface PredictionResult {
  conceptId: string;
  predictedCorrectness: number;
  confidence: number;
  nextReviewInterval: number;
  forgettingCurve: number[];
}
