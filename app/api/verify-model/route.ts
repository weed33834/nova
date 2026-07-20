import { NextRequest } from 'next/server';
import { APICallError, RetryError } from 'ai';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess, type ApiErrorCode } from '@/lib/server/api-response';
import { resolveModel } from '@/lib/server/resolve-model';
import { callLLM } from '@/lib/ai/llm';
const log = createLogger('VerifyModel');

/**
 * Extract upstream HTTP status from an AI SDK error.
 * Handles APICallError, RetryError, and generic errors with statusCode/status.
 */
function extractUpstreamStatus(error: unknown, seen = new Set<unknown>()): number | undefined {
  if (!error || seen.has(error)) return undefined;
  seen.add(error);

  if (APICallError.isInstance(error)) {
    const s = typeof error.statusCode === 'number' ? error.statusCode : undefined;
    if (s !== undefined) return s;
  }

  if (RetryError.isInstance(error)) {
    return (
      extractUpstreamStatus(error.lastError, seen) ??
      error.errors
        .map((nested) => extractUpstreamStatus(nested, seen))
        .find((status): status is number => status !== undefined)
    );
  }

  if (typeof error === 'object' && error !== null) {
    const raw = (error as Record<string, unknown>)['statusCode'] ??
      (error as Record<string, unknown>)['status'] ??
      (error as Record<string, unknown>)['status_code'];
    const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
    if (Number.isInteger(parsed) && parsed >= 400 && parsed <= 599) return parsed;
  }

  return undefined;
}

/**
 * Detect network-level errors (DNS failure, connection refused, timeout).
 */
function detectNetworkError(error: unknown): ApiErrorCode | null {
  const msg = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (msg.includes('enotfound') || msg.includes('econnrefused') || msg.includes('econnreset')) {
    return 'CONNECTION_ERROR';
  }
  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
    return 'CONNECTION_TIMEOUT';
  }
  if (msg.includes('fetch failed') || msg.includes('network')) {
    return 'CONNECTION_ERROR';
  }
  return null;
}

/**
 * Map an upstream HTTP status to (errorCode, httpStatus, userMessage).
 */
function statusToError(
  status: number,
): { code: ApiErrorCode; httpStatus: number; message: string } {
  if (status === 401) {
    return {
      code: 'INVALID_CREDENTIALS',
      httpStatus: 401,
      message: 'API key is invalid or expired. Please check your API key in Settings.',
    };
  }
  if (status === 403) {
    return {
      code: 'MODEL_ACCESS_DENIED',
      httpStatus: 403,
      message: 'Access denied. Your API key may not have permission for this model.',
    };
  }
  if (status === 404) {
    return {
      code: 'MODEL_NOT_FOUND',
      httpStatus: 404,
      message: 'Model not found. Please check the model name or API endpoint URL.',
    };
  }
  if (status === 429) {
    return {
      code: 'RATE_LIMITED',
      httpStatus: 429,
      message: 'Rate limit exceeded. Please wait a moment and try again.',
    };
  }
  if (status >= 500) {
    return {
      code: 'UPSTREAM_ERROR',
      httpStatus: 502,
      message: 'The model provider is temporarily unavailable. Please try again later.',
    };
  }
  return {
    code: 'UPSTREAM_ERROR',
    httpStatus: 502,
    message: 'The model provider rejected the request.',
  };
}

export async function POST(req: NextRequest) {
  let model: string | undefined;
  let apiKey: string | undefined;
  try {
    const body = await req.json();
    apiKey = body.apiKey;
    const { baseUrl, providerType } = body;
    model = body.model;

    if (!model) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Model name is required');
    }

    // P1-1: Explicitly check for empty API key before attempting connection.
    // Previously, an empty key would be passed to resolveModel → callLLM,
    // which would fail with a 401 upstream, but the error was mapped to
    // INTERNAL_ERROR (500). Now we give a clear, actionable message.
    if (!apiKey || !apiKey.trim()) {
      return apiError(
        'MISSING_API_KEY',
        400,
        'API key is required. Please configure it in Settings.',
        undefined,
        'Model verification',
      );
    }

    // Parse model string and resolve server-side fallback
    let languageModel;
    try {
      const result = await resolveModel({
        modelString: model,
        apiKey,
        baseUrl: baseUrl || undefined,
        providerType,
      });
      languageModel = result.model;
    } catch (error) {
      // resolveModel can fail if the model string is malformed or provider
      // type is unsupported. This is a client configuration error, not a
      // server error — use 400 instead of 401.
      log.warn(`Model resolution failed [model="${model}"]:` + (error as Error).message);
      return apiError(
        'INVALID_REQUEST',
        400,
        error instanceof Error
          ? `Invalid model configuration: ${error.message}`
          : 'Invalid model configuration.',
        undefined,
        'Model verification',
      );
    }

    // Send a minimal test message.
    const { text } = await callLLM(
      {
        model: languageModel,
        prompt: 'Say "OK" if you can hear me.',
        maxOutputTokens: 64,
      },
      'verify-model',
      undefined,
      { mode: 'disabled', enabled: false },
    );

    return apiSuccess({
      message: 'Connection successful',
      response: text,
    });
  } catch (error) {
    const modelLabel = model ?? 'unknown';
    log.error(`Model verification failed [model="${modelLabel}"]:` + (error as Error)?.message);

    // 1. Try to extract upstream HTTP status code from AI SDK error
    const upstreamStatus = extractUpstreamStatus(error);
    if (upstreamStatus) {
      const { code, httpStatus, message } = statusToError(upstreamStatus);
      return apiError(code, httpStatus, message, undefined, `Model verification: ${modelLabel}`);
    }

    // 2. Check for network-level errors (DNS, connection refused, timeout)
    const networkCode = detectNetworkError(error);
    if (networkCode) {
      const httpStatus = networkCode === 'CONNECTION_TIMEOUT' ? 504 : 502;
      const message =
        networkCode === 'CONNECTION_TIMEOUT'
          ? 'Connection timed out. Please check your network or try a different Base URL.'
          : 'Cannot connect to the API server. Please check the Base URL and your network.';
      return apiError(networkCode, httpStatus, message, undefined, `Model verification: ${modelLabel}`);
    }

    // 3. Fallback: unknown error — log full detail server-side, send generic message
    log.error('Unhandled verification error:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'An unexpected error occurred during model verification. Please try again.',
      error instanceof Error ? error.message : String(error),
      `Model verification: ${modelLabel}`,
    );
  }
}
