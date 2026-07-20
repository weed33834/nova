import { APICallError, RetryError } from 'ai';
import { apiError } from '@/lib/server/api-response';

const HTTP_ERROR_MIN = 400;
const HTTP_ERROR_MAX = 599;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function toHttpErrorStatus(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseInt(value, 10)
        : Number.NaN;

  return Number.isInteger(parsed) && parsed >= HTTP_ERROR_MIN && parsed <= HTTP_ERROR_MAX
    ? parsed
    : undefined;
}

function statusFromError(error: unknown, seen = new Set<unknown>()): number | undefined {
  if (!error || seen.has(error)) return undefined;
  seen.add(error);

  if (APICallError.isInstance(error)) {
    return toHttpErrorStatus(error.statusCode);
  }

  if (RetryError.isInstance(error)) {
    return (
      statusFromError(error.lastError, seen) ??
      error.errors
        .map((nested) => statusFromError(nested, seen))
        .find((status): status is number => status !== undefined)
    );
  }

  if (!isRecord(error)) return undefined;

  const status = toHttpErrorStatus(error.statusCode ?? error.status ?? error.status_code);
  if (status !== undefined) return status;

  return statusFromError(error.cause, seen) ?? statusFromError(error.lastError, seen);
}

function messageForStatus(status: number): string {
  if (status === 401) {
    return 'Authentication failed. Please verify your API key for the model provider.';
  }
  if (status === 403) {
    return 'Access denied. Your API key or account does not have permission to use this model.';
  }
  if (status === 404) {
    return 'Model not found. The requested model does not exist or is unavailable for your account.';
  }
  if (status === 429) return 'Upstream rate limit reached. Please try again shortly.';
  if (status >= 500) return 'Upstream model provider is temporarily unavailable. Please try again.';
  return 'Upstream provider rejected the request.';
}

/**
 * Preserve a provider's HTTP semantics for client retry classification without
 * exposing provider response bodies, URLs, or credential-adjacent details.
 *
 * Status → error-code mapping:
 *   401          → INVALID_CREDENTIALS  (HTTP 401)
 *   403          → MODEL_ACCESS_DENIED  (HTTP 403)
 *   404          → MODEL_NOT_FOUND      (HTTP 404)
 *   429          → RATE_LIMITED         (HTTP 429)
 *   5xx / 4xx    → UPSTREAM_ERROR       (HTTP 502 Bad Gateway — never mirror the
 *                                        upstream status, which can leak provider
 *                                        topology and confuse clients)
 *   no status    → INTERNAL_ERROR       (HTTP 500)
 *
 * @param error   - The caught error (AI SDK `APICallError`/`RetryError`, or a
 *                  plain Error carrying `statusCode`/`status`/`status_code`).
 * @param context - Optional human-readable context of what operation failed
 *                  (e.g. `TTS provider=minimax, voice=Cherry, audioId=tts_s1_a1`).
 *                  Safe to surface to the client; never include credentials or
 *                  raw upstream URLs/bodies.
 */
export function llmApiError(error: unknown, context?: string) {
  const status = statusFromError(error);
  if (status === undefined) {
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Scene generation failed. Please try again.',
      undefined,
      context,
    );
  }

  if (status === 401) {
    return apiError('INVALID_CREDENTIALS', 401, messageForStatus(status), undefined, context);
  }
  if (status === 403) {
    return apiError('MODEL_ACCESS_DENIED', 403, messageForStatus(status), undefined, context);
  }
  if (status === 404) {
    return apiError('MODEL_NOT_FOUND', 404, messageForStatus(status), undefined, context);
  }
  if (status === 429) {
    return apiError('RATE_LIMITED', 429, messageForStatus(status), undefined, context);
  }

  // 5xx and other 4xx upstream failures → 502 Bad Gateway (do not mirror the
  // upstream status, which can leak provider topology to the client).
  return apiError('UPSTREAM_ERROR', 502, messageForStatus(status), undefined, context);
}

/**
 * Returns the upstream HTTP status code embedded in an error (AI SDK
 * `APICallError`, `RetryError`, or a plain Error carrying
 * `statusCode`/`status`/`status_code`), or `undefined` when the error did not
 * originate from an upstream HTTP call. Lets callers branch between
 * `llmApiError` (upstream) and a route-specific generic error (e.g. filesystem,
 * config) without re-implementing status extraction.
 */
export function upstreamStatusFromError(error: unknown): number | undefined {
  return statusFromError(error);
}

/**
 * Returns a client-safe string suitable for the `details` field of an
 * `apiError` response. Upstream provider errors are collapsed to a generic
 * per-status message (no raw response bodies, URLs, or credentials); errors
 * thrown by our own code surface their message as-is (assumed safe).
 */
export function sanitizedErrorDetails(error: unknown): string {
  const status = statusFromError(error);
  if (status !== undefined) return messageForStatus(status);
  if (error instanceof Error) return error.message;
  return String(error);
}
