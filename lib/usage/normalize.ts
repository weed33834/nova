import type { LanguageModelUsage } from 'ai';

/**
 * Normalized token usage in the four billable classes plus reasoning tokens.
 *
 * `reasoningTokens` is carried for display/diagnostics; it is part of output
 * tokens for billing.
 */
export interface NormalizedUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  reasoningTokens: number;
}

function num(value: number | undefined | null): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * Extracts the four-class token shape from an AI SDK v6 `LanguageModelUsage`.
 *
 * Prefers the nested `inputTokenDetails` / `outputTokenDetails` fields and
 * falls back to the deprecated flat `cachedInputTokens` / `reasoningTokens`
 * for providers that only populate those. Any missing field becomes 0, so a
 * partial or absent usage object yields an all-zero record rather than NaN.
 */
export function normalizeUsage(usage: LanguageModelUsage | undefined | null): NormalizedUsage {
  if (!usage) {
    return {
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      reasoningTokens: 0,
    };
  }

  // Prefer the nested v6 detail fields; fall back to the deprecated flat
  // fields ONLY when the detail field is absent. Using `||` after `num()`
  // would treat a legitimate 0 as "missing" and wrongly use the fallback.
  const cacheRead =
    usage.inputTokenDetails?.cacheReadTokens != null
      ? num(usage.inputTokenDetails.cacheReadTokens)
      : num(usage.cachedInputTokens);
  const cacheCreation = num(usage.inputTokenDetails?.cacheWriteTokens);
  const reasoning =
    usage.outputTokenDetails?.reasoningTokens != null
      ? num(usage.outputTokenDetails.reasoningTokens)
      : num(usage.reasoningTokens);

  return {
    inputTokens: num(usage.inputTokens),
    outputTokens: num(usage.outputTokens),
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreation,
    reasoningTokens: reasoning,
  };
}

/**
 * Whether the usage has any billable tokens. Used to skip writing empty rows
 * when an OpenAI-compatible upstream omits usage on a streamed response.
 */
export function hasBillableTokens(usage: NormalizedUsage): boolean {
  return (
    usage.inputTokens > 0 ||
    usage.outputTokens > 0 ||
    usage.cacheReadTokens > 0 ||
    usage.cacheCreationTokens > 0
  );
}
