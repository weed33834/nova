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
  enableConsistencyCheck: boolean;
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

/**
 * Configuration for guardrails blocking mode.
 * When enabled, content generation that triggers a failed check at or above
 * `minBlockSeverity` will be blocked (the scene is skipped).
 */
export interface GuardrailsBlockingConfig {
  enabled: boolean;
  minBlockSeverity: Severity;
}

/**
 * Error thrown when guardrails blocking is active and a generated scene's
 * content fails a check at or above the configured severity threshold.
 * Carries the full {@link GuardrailReport} so callers can surface details.
 */
export class GuardrailBlockError extends Error {
  readonly report: GuardrailReport;

  constructor(report: GuardrailReport) {
    const failedTypes = report.checks
      .filter((c) => !c.passed)
      .map((c) => c.type)
      .join(', ');
    super(`Content blocked by guardrails: ${failedTypes}`);
    this.name = 'GuardrailBlockError';
    this.report = report;
  }
}
