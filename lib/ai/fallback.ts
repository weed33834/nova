/**
 * Model Fallback Chain — provider/model failover resilience.
 *
 * When the primary (resolved) model fails with a *retryable* error (5xx,
 * timeout, network), the call is retried against an ordered list of fallback
 * models configured via the `FALLBACK_MODELS` env var. Non-retryable failures
 * (4xx: bad request, auth, model-not-found, …) are surfaced immediately —
 * falling over to another model would not help and could mask a genuine
 * configuration problem.
 *
 * This is a *different* layer from the AI SDK's built-in `maxRetries`, which
 * retries the SAME model with exponential backoff. By the time we reach the
 * fallback layer, the SDK has already exhausted its own same-model retries, so
 * switching to an alternative provider/model is the only remaining recourse.
 *
 * Each attempt goes through `callLLM`, so thinking-config injection, usage
 * recording, and validation retries are reused — no LLM-calling logic is
 * duplicated here.
 */

import { APICallError, RetryError } from 'ai';
import type { GenerateTextResult, LanguageModel, generateText } from 'ai';
import type { ThinkingConfig } from '@/lib/types/provider';
import { createLogger } from '@/lib/logger';
import { callLLM } from './llm';
import { getModel, parseModelString } from './providers';
import { resolveApiKey, resolveBaseUrl, resolveProxy } from '@/lib/server/provider-config';
import { upstreamStatusFromError } from '@/lib/server/llm-error-response';

/** Same param shape as `callLLM` / the AI SDK's `generateText`. */
type GenerateTextParams = Parameters<typeof generateText>[0];

const log = createLogger('LLMFallback');

// ---------------------------------------------------------------------------
// FALLBACK_MODELS env parsing
// ---------------------------------------------------------------------------

/** Parsed once per process (env is read at startup; tests reset via vi.resetModules). */
let _fallbackModels: string[] | null = null;

/**
 * Parse the `FALLBACK_MODELS` env var into an ordered list of model strings.
 *
 * Format: a comma-separated list of `provider:model` strings, e.g.
 *   `openai:gpt-5.4,anthropic:claude-sonnet-4,google:gemini-3-flash-preview`
 *
 * Returns an empty array when unset — i.e. no failover (today's behavior).
 */
export function getFallbackModels(): string[] {
  if (_fallbackModels !== null) return _fallbackModels;

  const raw = process.env.FALLBACK_MODELS?.trim();
  _fallbackModels = raw
    ? raw
        .split(',')
        .map((m) => m.trim())
        .filter(Boolean)
    : [];
  return _fallbackModels;
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Classify whether an error is worth retrying on the NEXT fallback model.
 *
 * Retryable (fall over to another model/provider):
 *   - HTTP 5xx (upstream server error)
 *   - Timeouts / aborts (no response reached)
 *   - Network errors (DNS, connection refused/reset, fetch failure)
 *
 * NOT retryable (surface immediately — another model won't help):
 *   - 4xx (bad request, 401 auth, 403 forbidden, 404 model-not-found, 429 …)
 *   - Non-HTTP programming errors
 *
 * This is intentionally narrower than the AI SDK's own retryable set (which
 * also retries 408/409/429 on the SAME model). The SDK has already exhausted
 * those same-model retries by the time we get here; for cross-model failover
 * we only switch on genuinely transient upstream failures.
 */
function isRetryableForFallback(error: unknown): boolean {
  // Unwrap RetryError (SDK exhausted its same-model retries). The underlying
  // lastError — or any nested error — determines retryability.
  if (RetryError.isInstance(error)) {
    return (
      isRetryableForFallback(error.lastError) ||
      error.errors.some((nested) => isRetryableForFallback(nested))
    );
  }

  const status = upstreamStatusFromError(error);
  if (status !== undefined) {
    // 5xx → retryable; any 4xx → NOT retryable (per spec).
    return status >= 500;
  }

  // No HTTP status → either a network/timeout error (retryable) or a genuine
  // internal error (not). The AI SDK's own `isRetryable` flag (set true for
  // fetch failures / aborts) and well-known transient error names are strong
  // signals; everything else is treated as non-retryable.
  if (APICallError.isInstance(error)) {
    return error.isRetryable;
  }

  const name = (error as { name?: string } | null)?.name;
  if (name === 'AbortError' || name === 'TypeError') return true;

  return false;
}

// ---------------------------------------------------------------------------
// Fallback model resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a `provider:model` string into a runnable LanguageModel, resolving
 * credentials the same way `resolveModel` does: managed providers use the
 * operator's server key; unmanaged providers use the supplied client key.
 *
 * Throws when the provider/model cannot be resolved (e.g. unmanaged provider
 * with no key) — callers catch this and skip to the next fallback rather than
 * aborting the whole chain.
 */
function resolveFallbackModel(modelString: string, clientApiKey: string): LanguageModel {
  const { providerId, modelId } = parseModelString(modelString);
  const apiKey = resolveApiKey(providerId, clientApiKey);
  const baseUrl = resolveBaseUrl(providerId);
  const proxy = resolveProxy(providerId);
  const { model } = getModel({ providerId, modelId, apiKey, baseUrl, proxy });
  return model;
}

// ---------------------------------------------------------------------------
// Fallback orchestration
// ---------------------------------------------------------------------------

/**
 * Call an LLM with automatic provider/model failover.
 *
 * Resolution order:
 *   1. The primary model in `params.model` (already resolved by the caller).
 *   2. Each model in `fallbackModels` (defaults to `getFallbackModels()`), in
 *      declared order, tried only when the previous attempt failed with a
 *      retryable error.
 *
 * Behavior:
 *   - The primary model is attempted first via `callLLM`.
 *   - On a retryable error (5xx/timeout/network), the next fallback is tried.
 *   - On a NON-retryable error (4xx, programming error), the error is thrown
 *     immediately — the chain is aborted.
 *   - A fallback model that cannot be resolved (e.g. unmanaged provider with
 *     no key) is skipped with a warning, and the next fallback is tried.
 *   - If all fallbacks are exhausted, the last error is thrown.
 *   - Usage is recorded for each attempt by `callLLM` (on success).
 *
 * @param params         - Same parameters as `callLLM` (must include `model`).
 * @param stage          - A short label for log grouping (a `callLLM` source).
 * @param apiKey         - Client API key, used to resolve unmanaged fallback
 *                         providers (managed providers always use the server key).
 * @param thinkingConfig - Optional per-call thinking config.
 * @param fallbackModels - Explicit fallback list; defaults to `getFallbackModels()`.
 */
export async function callLLMWithFallback<T extends GenerateTextParams>(
  params: T,
  stage: string,
  apiKey: string,
  thinkingConfig?: ThinkingConfig,
  fallbackModels?: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<GenerateTextResult<any, any>> {
  const models = fallbackModels ?? getFallbackModels();

  // 1. Primary model (already resolved in params.model).
  let lastError: unknown;
  try {
    return await callLLM(params, stage, undefined, thinkingConfig);
  } catch (error) {
    lastError = error;
    if (models.length === 0 || !isRetryableForFallback(error)) {
      throw error;
    }
    log.warn(
      `[${stage}] Primary model failed with a retryable error; ` +
        `trying ${models.length} fallback model(s)...`,
      error,
    );
  }

  // 2. Fallback models, in declared order.
  for (const modelString of models) {
    // Resolve the fallback model to a LanguageModel. A model that can't be
    // resolved (e.g. unconfigured provider) is skipped, not fatal — the next
    // fallback may still succeed.
    let model: LanguageModel;
    try {
      model = resolveFallbackModel(modelString, apiKey);
    } catch (resolveError) {
      log.warn(
        `[${stage}] Could not resolve fallback model "${modelString}", skipping.`,
        resolveError,
      );
      continue;
    }

    try {
      log.info(`[${stage}] Fallback attempt → ${modelString}`);
      // callLLM records usage for this attempt on success.
      const result = await callLLM({ ...params, model } as T, stage, undefined, thinkingConfig);
      log.info(`[${stage}] Fallback succeeded with "${modelString}".`);
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryableForFallback(error)) {
        log.warn(
          `[${stage}] Fallback "${modelString}" failed with a non-retryable error; ` +
            `aborting fallback chain.`,
          error,
        );
        throw error;
      }
      log.warn(
        `[${stage}] Fallback "${modelString}" failed with a retryable error; trying next fallback...`,
        error,
      );
    }
  }

  log.error(`[${stage}] All ${models.length} fallback model(s) exhausted.`);
  throw lastError;
}
