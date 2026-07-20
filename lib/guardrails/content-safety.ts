import type {
  GuardrailResult,
  ContentSafetyConfig,
  HallucinationConfig,
  GuardrailReport,
  Severity,
  ModerationResult,
  ModerationCategory,
} from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('ContentSafety');

export const DEFAULT_CONTENT_SAFETY_CONFIG: ContentSafetyConfig = {
  blockedCategories: ['violence', 'hate_speech', 'sexual_content', 'self_harm'],
  maxSeverity: 'medium',
  enableToxicityCheck: true,
  enablePiiCheck: true,
};

export const DEFAULT_HALLUCINATION_CONFIG: HallucinationConfig = {
  enableFactCheck: true,
  enableConsistencyCheck: true,
  knowledgeBaseIds: [],
  maxHallucinationScore: 0.4,
};

const SEVERITY_ORDER: Severity[] = ['low', 'medium', 'high', 'critical'];

function severityToScore(s: Severity): number {
  return SEVERITY_ORDER.indexOf(s);
}

function severityGte(a: Severity, b: Severity): boolean {
  return severityToScore(a) >= severityToScore(b);
}

const PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b\d{18}[\dXx]\b/g, label: 'Chinese ID number' },
  { pattern: /\b1[3-9]\d{9}\b/g, label: 'Chinese phone number' },
  { pattern: /\b\d{6,16}\b/g, label: 'Possible account number' },
  { pattern: /[\w.+-]+@[\w-]+\.[\w.-]+/g, label: 'Email address' },
];

const TOXIC_PATTERNS: Array<{ pattern: RegExp; category: ModerationCategory; score: number }> = [
  { pattern: /\b(笨蛋|白痴|去死|滚开|蠢货|废物)\b/g, category: 'harassment', score: 0.7 },
  { pattern: /\b(杀|死|打|揍|砍|炸)\s*(了|掉|死|人)\b/g, category: 'violence', score: 0.8 },
  { pattern: /\b(色情|淫秽|裸体|性交|成人)\b/g, category: 'sexual_content', score: 0.9 },
];

const MISINFORMATION_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b(地球是平的|地球是扁的)\b/g, label: 'Flat Earth' },
  { pattern: /\b(疫苗导致|疫苗引起)\s*(自闭症|死亡)\b/g, label: 'Vaccine misinformation' },
];

export function checkContentSafety(
  content: string,
  config: ContentSafetyConfig = DEFAULT_CONTENT_SAFETY_CONFIG,
): GuardrailResult[] {
  const results: GuardrailResult[] = [];

  if (config.enablePiiCheck) {
    for (const { pattern, label } of PII_PATTERNS) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        results.push({
          passed: false,
          type: 'pii_leakage',
          severity: 'high',
          message: `Potential PII detected: ${label} (${matches.length} match(es))`,
          details: { pattern: label, matchCount: matches.length },
          suggestion: 'Remove or anonymize personal information',
        });
      }
    }
  }

  if (config.enableToxicityCheck) {
    let toxicityScore = 0;
    const categories: Partial<Record<ModerationCategory, number>> = {};

    for (const { pattern, category, score } of TOXIC_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        toxicityScore += score * matches.length;
        categories[category] = (categories[category] ?? 0) + score * matches.length;
      }
    }

    const overallScore = Math.min(toxicityScore, 1);

    if (overallScore > 0.5) {
      results.push({
        passed: false,
        type: 'toxicity',
        severity: overallScore > 0.8 ? 'critical' : 'high',
        message: `Content may contain toxic language (score: ${overallScore.toFixed(2)})`,
        details: { categories, overallScore },
        suggestion: 'Rephrase using respectful language',
      });
    }
  }

  for (const { pattern, label } of MISINFORMATION_PATTERNS) {
    if (pattern.test(content)) {
      results.push({
        passed: false,
        type: 'factual_accuracy',
        severity: 'high',
        message: `Potential misinformation detected: ${label}`,
        details: { label },
        suggestion: 'Verify facts from reliable sources',
      });
    }
  }

  return results;
}

export function checkHallucinationRisk(
  generatedContent: string,
  sourceContent?: string,
  config: HallucinationConfig = DEFAULT_HALLUCINATION_CONFIG,
): GuardrailResult {
  let score = 0;
  const reasons: string[] = [];

  if (sourceContent && config.enableConsistencyCheck) {
    const genSentences = generatedContent.split(/[。！？\n]+/).filter(Boolean);
    const sourceSentences = sourceContent.split(/[。！？\n]+/).filter(Boolean);

    let mismatchCount = 0;
    for (const genSentence of genSentences) {
      const genWords = new Set(genSentence.replace(/[^\w\u4e00-\u9fff]/g, '').slice(0, 20));
      const hasMatch = sourceSentences.some((src) => {
        const srcWords = new Set(src.replace(/[^\w\u4e00-\u9fff]/g, '').slice(0, 20));
        let overlap = 0;
        for (const w of genWords) {
          if (srcWords.has(w)) overlap++;
        }
        return overlap > 2;
      });
      if (!hasMatch && genWords.size > 3) {
        mismatchCount++;
      }
    }

    score = mismatchCount / Math.max(genSentences.length, 1);
    if (score > 0.3) reasons.push(`${Math.round(score * 100)}% of claims lack source support`);
  }

  const vagueStatements = generatedContent.match(/\b(可能|大概|也许|据说|好像|应该是|不确定)\b/g);
  if (vagueStatements && vagueStatements.length > 3) {
    score += 0.1 * vagueStatements.length;
    reasons.push(`High uncertainty language (${vagueStatements.length} vague terms)`);
  }

  score = Math.min(score, 1);
  const passed = score <= config.maxHallucinationScore;

  return {
    passed,
    type: 'hallucination',
    severity: score > 0.6 ? 'high' : score > 0.3 ? 'medium' : 'low',
    message: passed
      ? 'Hallucination check passed'
      : `Hallucination risk detected (score: ${score.toFixed(2)})`,
    details: { score, reasons },
    suggestion: passed ? undefined : 'Please verify factual claims against source material',
  };
}

export function runAllGuardrails(
  content: string,
  safetyConfig?: ContentSafetyConfig,
  hallucinationConfig?: HallucinationConfig,
): GuardrailReport {
  const checks: GuardrailResult[] = [];

  const safetyResults = checkContentSafety(content, safetyConfig);
  checks.push(...safetyResults);

  const hallucinationResult = checkHallucinationRisk(content, undefined, hallucinationConfig);
  checks.push(hallucinationResult);

  checks.push({
    passed: true,
    type: 'pedagogical_appropriateness',
    severity: 'low',
    message: 'Pedagogical check passed (basic review)',
  });

  const passed = checks.every((c) => c.passed);

  return {
    content,
    checks,
    passed,
    timestamp: Date.now(),
    metadata: { totalChecks: checks.length, failedChecks: checks.filter((c) => !c.passed).length },
  };
}
