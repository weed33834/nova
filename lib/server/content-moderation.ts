/**
 * AI Content Moderation Service.
 *
 * Uses OpenAI's Moderation API (when an OpenAI key is configured) to
 * classify text content for safety. Falls back to the existing rule-based
 * guardrails in `lib/guardrails/content-safety.ts` when no external API
 * is available.
 *
 * This is the P0 implementation of the "AI 内容安全过滤" gap identified in
 * the enterprise analysis. It wraps both input (user prompt) and output
 * (LLM response) moderation.
 */
import { createLogger } from '@/lib/logger';
import { checkContentSafety } from '@/lib/guardrails/content-safety';
import type { GuardrailResult } from '@/lib/guardrails/types';

const log = createLogger('ContentModeration');

export interface ModerationResult {
  flagged: boolean;
  categories: Record<string, boolean>;
  categoryScores: Record<string, number>;
  source: 'openai' | 'rule-based';
  results: GuardrailResult[];
}

/** Rule-based fallback when no external moderation API is available. */
function ruleBasedModeration(content: string): ModerationResult {
  const results = checkContentSafety(content);
  const flagged = results.some((r) => !r.passed);
  const categories: Record<string, boolean> = {};
  const categoryScores: Record<string, number> = {};
  for (const r of results) {
    if (!r.passed) {
      categories[r.type] = true;
      categoryScores[r.type] = r.severity === 'critical' ? 1 : r.severity === 'high' ? 0.8 : 0.5;
    }
  }
  return { flagged, categories, categoryScores, source: 'rule-based', results };
}

/**
 * Moderate text content using OpenAI Moderation API.
 *
 * Returns a rule-based result when:
 *  - No OpenAI API key is configured
 *  - The API call fails (graceful degradation)
 *  - The content is empty
 */
export async function moderateContent(content: string): Promise<ModerationResult> {
  if (!content || content.trim().length === 0) {
    return {
      flagged: false,
      categories: {},
      categoryScores: {},
      source: 'rule-based',
      results: [],
    };
  }

  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return ruleBasedModeration(content);
  }

  try {
    // Use the OpenAI Moderation API directly via fetch for Edge compatibility.
    // `omni-moderation-latest` is the current model.
    const response = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'omni-moderation-latest',
        input: content.slice(0, 10000), // Truncate to API limit
      }),
    });

    if (!response.ok) {
      log.warn(`OpenAI Moderation API returned ${response.status}, falling back to rule-based`);
      return ruleBasedModeration(content);
    }

    const data = (await response.json()) as {
      results: Array<{
        flagged: boolean;
        categories: Record<string, boolean>;
        category_scores: Record<string, number>;
      }>;
    };

    const result = data.results[0];
    if (!result) {
      return ruleBasedModeration(content);
    }

    // Map to GuardrailResult[] for compatibility
    const results: GuardrailResult[] = [];
    for (const [category, flagged] of Object.entries(result.categories)) {
      if (flagged) {
        results.push({
          passed: false,
          type: category as GuardrailResult['type'],
          severity: result.category_scores[category] > 0.7 ? 'critical' : 'high',
          message: `Content flagged for ${category} (score: ${result.category_scores[category].toFixed(2)})`,
          details: { category, score: result.category_scores[category] },
          suggestion: 'Review and revise content to comply with safety guidelines',
        });
      }
    }

    return {
      flagged: result.flagged,
      categories: result.categories,
      categoryScores: result.category_scores,
      source: 'openai',
      results,
    };
  } catch (error) {
    log.warn('OpenAI Moderation API call failed, falling back to rule-based:', error);
    return ruleBasedModeration(content);
  }
}

/**
 * Check if content should be blocked. Returns true if any category is flagged.
 */
export async function isContentSafe(content: string): Promise<boolean> {
  const result = await moderateContent(content);
  return !result.flagged;
}

/**
 * Moderate both input (user prompt) and output (LLM response).
 * Returns combined results for logging / rejection.
 */
export async function moderateInputOutput(
  input: string,
  output: string,
): Promise<{ input: ModerationResult; output: ModerationResult; safe: boolean }> {
  const [inputResult, outputResult] = await Promise.all([
    moderateContent(input),
    moderateContent(output),
  ]);
  return {
    input: inputResult,
    output: outputResult,
    safe: !inputResult.flagged && !outputResult.flagged,
  };
}
