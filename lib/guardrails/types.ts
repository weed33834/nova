export type Severity = 'low' | 'medium' | 'high' | 'critical';

export type GuardrailType =
  | 'content_safety'
  | 'hallucination'
  | 'toxicity'
  | 'pii_leakage'
  | 'off_topic'
  | 'factual_accuracy'
  | 'pedagogical_appropriateness';

export interface GuardrailResult {
  passed: boolean;
  type: GuardrailType;
  severity: Severity;
  message: string;
  details?: Record<string, unknown>;
  suggestion?: string;
}

export interface ContentSafetyConfig {
  blockedCategories: string[];
  maxSeverity: Severity;
  enableToxicityCheck: boolean;
  enablePiiCheck: boolean;
}

export interface HallucinationConfig {
  enableFactCheck: boolean;
  enableConsistencyCheck: boolean;
  knowledgeBaseIds: string[];
  maxHallucinationScore: number;
}

export type ModerationCategory =
  | 'hate_speech'
  | 'violence'
  | 'self_harm'
  | 'sexual_content'
  | 'harassment'
  | 'misinformation'
  | 'academic_dishonesty';

export interface ModerationResult {
  flagged: boolean;
  categories: Partial<Record<ModerationCategory, number>>;
  overallScore: number;
}

export interface GuardrailReport {
  content: string;
  checks: GuardrailResult[];
  passed: boolean;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
