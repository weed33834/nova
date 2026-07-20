import { NextResponse } from 'next/server';
import { createLogger } from '@/lib/logger';

const log = createLogger('ApiResponse');

export const API_ERROR_CODES = {
  // ── Input validation ───────────────────────────────────────────────────
  MISSING_REQUIRED_FIELD: 'MISSING_REQUIRED_FIELD',
  MISSING_API_KEY: 'MISSING_API_KEY',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  INVALID_REQUEST: 'INVALID_REQUEST',
  PROVIDER_DISABLED: 'PROVIDER_DISABLED',
  VOXCPM_AUTO_VOICE_REQUIRES_CONTEXT: 'VOXCPM_AUTO_VOICE_REQUIRES_CONTEXT',
  INVALID_URL: 'INVALID_URL',
  REDIRECT_NOT_ALLOWED: 'REDIRECT_NOT_ALLOWED',
  TOO_MANY_REDIRECTS: 'TOO_MANY_REDIRECTS',
  CONTENT_SENSITIVE: 'CONTENT_SENSITIVE',

  // ── Upstream / network ─────────────────────────────────────────────────
  UPSTREAM_ERROR: 'UPSTREAM_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  CONNECTION_ERROR: 'CONNECTION_ERROR',
  CONNECTION_TIMEOUT: 'CONNECTION_TIMEOUT',

  // ── Model / provider specific (new: fine-grained model errors) ─────────
  MODEL_NOT_FOUND: 'MODEL_NOT_FOUND',
  MODEL_ACCESS_DENIED: 'MODEL_ACCESS_DENIED',

  // ── Generation pipeline (split from GENERATION_FAILED for clarity) ─────
  GENERATION_FAILED: 'GENERATION_FAILED',
  GENERATION_EMPTY_RESPONSE: 'GENERATION_EMPTY_RESPONSE',
  SCENE_ASSEMBLY_FAILED: 'SCENE_ASSEMBLY_FAILED',

  // ── Other business failures ───────────────────────────────────────────
  TRANSCRIPTION_FAILED: 'TRANSCRIPTION_FAILED',
  PARSE_FAILED: 'PARSE_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

export interface ApiErrorBody {
  success: false;
  errorCode: ApiErrorCode;
  error: string;
  /** Optional: technical detail or sanitized upstream message for debugging. */
  details?: string;
  /** Optional: human-readable context of what was happening when the error occurred.
   *  e.g. "Generating scene 3: Photosynthesis — content step"
   *  This field is safe to show to users and helps them understand WHERE the error happened. */
  context?: string;
}

/**
 * Return a structured error response.
 *
 * @param code     - Machine-readable error code for client-side branching.
 * @param status   - HTTP status code (should match the error semantics).
 * @param error    - Short, user-facing error message.
 * @param details  - Optional technical detail (sanitized — no raw upstream URLs/credentials).
 * @param context  - Optional human-readable context of what operation failed
 *                   (e.g. "Scene 3: Photosynthesis — content generation").
 */
export function apiError(
  code: ApiErrorCode,
  status: number,
  error: string,
  details?: string,
  context?: string,
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    success: false as const,
    errorCode: code,
    error,
  };
  if (details) body.details = details;
  if (context) body.context = context;

  return NextResponse.json(body, { status });
}

/**
 * Like `apiError`, but also logs the error with context for server-side debugging.
 * Use this in catch blocks where you want both a log entry and a structured response.
 */
export function apiErrorLogged(
  code: ApiErrorCode,
  status: number,
  error: string,
  options?: {
    details?: string;
    context?: string;
    /** The caught error object — logged but NOT sent to client. */
    cause?: unknown;
    /** Logger label, e.g. 'VerifyModel', 'SceneContent'. */
    label?: string;
  },
): NextResponse<ApiErrorBody> {
  const label = options?.label ?? 'API';
  log.error(
    `[${label}] ${code} (${status}): ${error}`,
    options?.context ? `  context: ${options.context}` : '',
    options?.cause ?? '',
  );
  return apiError(code, status, error, options?.details, options?.context);
}

export function apiSuccess<T extends Record<string, unknown>>(data: T, status = 200): NextResponse {
  return NextResponse.json({ success: true, ...data }, { status });
}
