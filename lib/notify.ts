'use client';

import { toast } from 'sonner';
import i18n from '@/lib/i18n/config';
import type { ApiErrorCode, ApiErrorBody } from '@/lib/server/api-response';

/**
 * Map API error codes (defined in `lib/server/api-response.ts` as
 * `API_ERROR_CODES`) to i18n keys under the `errors.*` namespace in
 * `lib/i18n/locales/*.json`.
 *
 * A few codes deliberately share a key when the user-facing message is
 * identical — e.g. the redirect-related codes (`INVALID_URL`,
 * `REDIRECT_NOT_ALLOWED`, `TOO_MANY_REDIRECTS`) all surface as
 * "invalid URL", and `VOXCPM_AUTO_VOICE_REQUIRES_CONTEXT` reuses the generic
 * `errors.invalidRequest` message.
 */
const ERROR_CODE_TO_I18N_KEY: Record<ApiErrorCode, string> = {
  MISSING_REQUIRED_FIELD: 'errors.missingRequiredField',
  MISSING_API_KEY: 'errors.missingApiKey',
  INVALID_CREDENTIALS: 'errors.invalidCredentials',
  INVALID_REQUEST: 'errors.invalidRequest',
  PROVIDER_DISABLED: 'errors.providerDisabled',
  VOXCPM_AUTO_VOICE_REQUIRES_CONTEXT: 'errors.invalidRequest',
  INVALID_URL: 'errors.invalidUrl',
  REDIRECT_NOT_ALLOWED: 'errors.invalidUrl',
  TOO_MANY_REDIRECTS: 'errors.invalidUrl',
  CONTENT_SENSITIVE: 'errors.contentSensitive',
  UPSTREAM_ERROR: 'errors.upstreamError',
  RATE_LIMITED: 'errors.rateLimited',
  CONNECTION_ERROR: 'errors.connectionError',
  CONNECTION_TIMEOUT: 'errors.connectionTimeout',
  MODEL_NOT_FOUND: 'errors.modelNotFound',
  MODEL_ACCESS_DENIED: 'errors.modelAccessDenied',
  GENERATION_FAILED: 'errors.generationFailed',
  GENERATION_EMPTY_RESPONSE: 'errors.generationEmptyResponse',
  SCENE_ASSEMBLY_FAILED: 'errors.sceneAssemblyFailed',
  TRANSCRIPTION_FAILED: 'errors.transcriptionFailed',
  PARSE_FAILED: 'errors.parseFailed',
  INTERNAL_ERROR: 'errors.internalError',
};

/**
 * Translate an i18n key using the shared i18n instance.
 *
 * This works outside React components (unlike `useI18n`'s `t`) because it
 * reads directly from the i18n store initialized in `lib/i18n/config.ts`.
 * The optional `options` object supplies interpolation variables for
 * templates such as `errors.withContext` (`{{message}} ({{context}})`).
 */
function t(key: string, options?: Record<string, unknown>): string {
  return i18n.t(key, options ?? {}) as string;
}

/**
 * Show an error toast for a structured API error response.
 *
 * Parses the fetch `Response` body (expected shape: `{ success: false,
 * errorCode, error, details?, context? }` from `apiError()` /
 * `apiErrorLogged()` in `lib/server/api-response.ts`), maps `errorCode` to a
 * localized message via {@link ERROR_CODE_TO_I18N_KEY}, and shows a
 * `toast.error`.
 *
 * - If `context` is provided (either via the function arg or the response
 *   body's `context` field), it is appended using the `errors.withContext`
 *   template. The function-arg `context` takes precedence over the body's.
 * - If `details` is present on the response body, it is appended using the
 *   `errors.withDetails` template.
 * - If the body cannot be parsed as JSON or lacks an `errorCode`, a generic
 *   `errors.unknown` toast is shown.
 *
 * @param response - The fetch `Response` returned by an API route.
 * @param context  - Optional human-readable context to append (overrides the
 *                   response body's `context` field when both are present).
 */
export async function notifyApiError(response: Response, context?: string): Promise<void> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await response.json()) as ApiErrorBody;
  } catch {
    toast.error(t('errors.unknown'));
    return;
  }

  if (!body || typeof body.errorCode !== 'string') {
    toast.error(t('errors.unknown'));
    return;
  }

  const i18nKey = ERROR_CODE_TO_I18N_KEY[body.errorCode] ?? 'errors.unknown';
  let message = t(i18nKey);

  const effectiveContext = context ?? body.context;
  if (effectiveContext) {
    message = t('errors.withContext', { message, context: effectiveContext });
  }

  if (body.details) {
    message = t('errors.withDetails', { message, details: body.details });
  }

  toast.error(message);
}

/**
 * Show an error toast for an unknown/caught error.
 *
 * Resolution order:
 * 1. If the error has an `.errorCode` property (e.g. from `createHttpError`
 *    or a server-thrown object), map it via {@link ERROR_CODE_TO_I18N_KEY}
 *    and show the localized message.
 * 2. If `fallbackKey` is provided, show its translation. This takes
 *    precedence over raw message extraction so callers can force a
 *    contextual message.
 * 3. If the error is an `Error` instance, show `error.message`.
 * 4. If the error is a string, show it directly.
 * 5. Otherwise, show the generic `errors.unknown` message.
 *
 * @param error       - The caught error value (typed `unknown`).
 * @param fallbackKey - Optional i18n key used when the error has no
 *                      `.errorCode` (takes precedence over message extraction).
 */
export function notifyError(error: unknown, fallbackKey?: string): void {
  // 1. Structured API error with `.errorCode`
  if (error && typeof error === 'object' && 'errorCode' in error) {
    const code = (error as { errorCode: ApiErrorCode }).errorCode;
    const key = ERROR_CODE_TO_I18N_KEY[code] ?? 'errors.unknown';
    toast.error(t(key));
    return;
  }

  // 2. Explicit fallback key
  if (fallbackKey) {
    toast.error(t(fallbackKey));
    return;
  }

  // 3. Error instance — surface its message
  if (error instanceof Error) {
    toast.error(error.message);
    return;
  }

  // 4. Raw string — show it directly
  if (typeof error === 'string') {
    toast.error(error);
    return;
  }

  // 5. Give up gracefully
  toast.error(t('errors.unknown'));
}

/**
 * Show a success toast. Thin wrapper around `toast.success` so call sites can
 * import all notifications from a single module.
 */
export function notifySuccess(message: string): void {
  toast.success(message);
}

/**
 * Show an info toast. Thin wrapper around `toast.info`.
 */
export function notifyInfo(message: string): void {
  toast.info(message);
}
