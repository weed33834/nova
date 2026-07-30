/**
 * Model Pre-flight Check
 *
 * Before starting a classroom generation, verify that the configured model
 * is actually available on the API endpoint. This prevents mid-generation
 * failures caused by:
 *   - Model name typos (e.g. "gpt-4o-mini" vs "gpt-4o_min")
 *   - Model not deployed on custom OpenAI-compatible endpoints
 *   - API key lacking access to a specific model
 *   - Endpoint returning a different model list than expected
 *
 * The check is:
 *   - Non-blocking: failures are logged as warnings, not thrown
 *   - Cached: model list is cached for 5 minutes to avoid repeated API calls
 *   - Optional: if the /models endpoint is unavailable, generation proceeds
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('ModelPreflight');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface ModelCache {
  models: Set<string>;
  fetchedAt: number;
  endpoint: string;
}

let _cache: ModelCache | null = null;

/**
 * Fetch the list of available models from an OpenAI-compatible /models endpoint.
 * Returns a Set of model IDs, or null if the request fails.
 */
async function fetchAvailableModels(
  baseUrl: string,
  apiKey: string,
): Promise<Set<string> | null> {
  try {
    // Normalize base URL: ensure it doesn't end with /models or /
    let url = baseUrl.replace(/\/+$/, '');
    if (url.endsWith('/models')) {
      url = url.slice(0, -'/models'.length);
    }
    // Ensure /v1 path if not present (common for OpenAI-compatible endpoints)
    if (!url.endsWith('/v1') && !url.includes('/v1/')) {
      // Only add /v1 if the URL looks like a base endpoint
      // (not already containing a version path segment)
      if (!url.match(/\/v\d+\/?$/)) {
        url = `${url}/v1`;
      }
    }
    const modelsUrl = `${url}/models`;

    const response = await fetch(modelsUrl, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(10_000), // 10s timeout for pre-flight
    });

    if (!response.ok) {
      log.warn(`Model list endpoint returned ${response.status} ${response.statusText}`);
      return null;
    }

    const data = await response.json();
    const models = (data?.data ?? data?.models ?? []) as Array<{ id?: string }>;
    const modelIds = new Set<string>();
    for (const model of models) {
      if (model?.id) {
        modelIds.add(model.id);
      }
    }
    return modelIds;
  } catch (err) {
    log.warn('Failed to fetch model list for pre-flight check:', err);
    return null;
  }
}

/**
 * Check if the configured model is available on the API endpoint.
 *
 * @param modelId - The model ID (without provider prefix, e.g. "Qwen3.6-35B-A3B")
 * @param providerId - The provider ID (e.g. "openai")
 * @param apiKey - The API key for the provider
 * @param baseUrl - The base URL for the API endpoint (optional, defaults to official endpoint)
 * @returns true if the model is available or check was skipped, false if definitely unavailable
 */
export async function checkModelAvailability(
  modelId: string,
  providerId: string,
  apiKey: string,
  baseUrl?: string,
): Promise<{ available: boolean; message: string; availableModels?: string[] }> {
  // Only check OpenAI-compatible providers that have a /models endpoint
  const compatibleProviders = [
    'openai', 'deepseek', 'glm', 'qwen', 'kimi', 'minimax',
    'doubao', 'openrouter', 'grok', 'hunyuan', 'xiaomi',
    'siliconflow', 'sensenova', 'step',
  ];

  if (!compatibleProviders.includes(providerId)) {
    // For native providers (Anthropic, Google, Azure), skip the check
    return {
      available: true,
      message: `Pre-flight check skipped for provider "${providerId}" (native SDK handles model validation).`,
    };
  }

  if (!apiKey) {
    return {
      available: true, // Don't block; the key check is handled elsewhere
      message: 'Pre-flight check skipped: no API key provided.',
    };
  }

  // Determine the base URL
  const effectiveBaseUrl =
    baseUrl ??
    (providerId === 'openai' ? process.env.OPENAI_BASE_URL : undefined) ??
    'https://api.openai.com/v1';

  // Check cache
  const now = Date.now();
  if (_cache && now - _cache.fetchedAt < CACHE_TTL_MS && _cache.endpoint === effectiveBaseUrl) {
    if (_cache.models.has(modelId)) {
      return {
        available: true,
        message: `Model "${modelId}" is available (cached).`,
      };
    } else {
      return {
        available: false,
        message: `Model "${modelId}" was NOT found in the available models list (cached).`,
        availableModels: Array.from(_cache.models).sort(),
      };
    }
  }

  // Fetch fresh model list
  const models = await fetchAvailableModels(effectiveBaseUrl, apiKey);
  if (models === null) {
    // Couldn't fetch — don't block generation, just warn
    return {
      available: true,
      message: `Pre-flight check skipped: could not fetch model list from ${effectiveBaseUrl}/models.`,
    };
  }

  // Update cache
  _cache = {
    models,
    fetchedAt: now,
    endpoint: effectiveBaseUrl,
  };

  if (models.has(modelId)) {
    return {
      available: true,
      message: `Model "${modelId}" is available (${models.size} models found).`,
    };
  } else {
    // Try case-insensitive match as some APIs are inconsistent
    const lowerMatch = Array.from(models).find((m) => m.toLowerCase() === modelId.toLowerCase());
    if (lowerMatch) {
      log.warn(
        `Model "${modelId}" not found exactly, but case-insensitive match "${lowerMatch}" exists. ` +
          `Consider updating DEFAULT_MODEL to use the exact ID.`,
      );
      return {
        available: true,
        message: `Model "${modelId}" matched case-insensitively as "${lowerMatch}".`,
      };
    }

    const availableList = Array.from(models).sort();
    log.warn(
      `Model "${modelId}" NOT found in available models (${models.size} available). ` +
        `Available models: ${availableList.slice(0, 20).join(', ')}${availableList.length > 20 ? '...' : ''}`,
    );
    return {
      available: false,
      message: `Model "${modelId}" is NOT in the available models list.`,
      availableModels: availableList,
    };
  }
}

/**
 * Clear the model cache. Useful for testing or when the API endpoint changes.
 */
export function clearModelCache(): void {
  _cache = null;
}
