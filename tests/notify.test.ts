import { describe, test, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be defined before importing `@/lib/notify`.
// ---------------------------------------------------------------------------

const toastMock = vi.hoisted(() => ({
  error: vi.fn(),
  success: vi.fn(),
  info: vi.fn(),
}));

const i18nMock = vi.hoisted(() => ({
  // Return the i18n key as-is so tests can assert which key was looked up.
  t: vi.fn((key: string) => key),
}));

vi.mock('sonner', () => ({
  toast: {
    error: toastMock.error,
    success: toastMock.success,
    info: toastMock.info,
  },
}));

vi.mock('@/lib/i18n/config', () => ({
  default: {
    t: i18nMock.t,
  },
}));

import { notifyApiError, notifyError, notifySuccess, notifyInfo } from '@/lib/notify';
import { API_ERROR_CODES } from '@/lib/server/api-response';
import type { ApiErrorCode } from '@/lib/server/api-response';

// ---------------------------------------------------------------------------
// Helpers — build a Response-like object with a controllable `.json()` step.
// ---------------------------------------------------------------------------

function makeJsonResponse(body: unknown): Response {
  return {
    json: () => Promise.resolve(body),
  } as Response;
}

function makeFailingJsonResponse(): Response {
  return {
    json: () => Promise.reject(new Error('invalid json')),
  } as Response;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ERROR_CODE_TO_I18N_KEY coverage', () => {
  beforeEach(() => {
    toastMock.error.mockClear();
    i18nMock.t.mockClear();
  });

  test('every API_ERROR_CODES value maps to a non-fallback i18n key', () => {
    const codes = Object.values(API_ERROR_CODES);
    expect(codes.length).toBeGreaterThan(0);

    for (const code of codes) {
      toastMock.error.mockClear();
      notifyError({ errorCode: code });

      expect(toastMock.error).toHaveBeenCalledTimes(1);
      const key = toastMock.error.mock.calls[0][0] as string;
      // Must be a mapped errors.* key, not the `errors.unknown` fallback.
      expect(key).not.toBe('errors.unknown');
      expect(key).toMatch(/^errors\./);
    }
  });
});

describe('notifyApiError', () => {
  beforeEach(() => {
    toastMock.error.mockClear();
    i18nMock.t.mockClear();
  });

  test('parses Response body errorCode and calls toast.error with the mapped key', async () => {
    const response = makeJsonResponse({
      success: false,
      errorCode: 'INVALID_CREDENTIALS',
      error: 'Auth failed',
    });
    await notifyApiError(response);

    expect(toastMock.error).toHaveBeenCalledTimes(1);
    expect(toastMock.error).toHaveBeenCalledWith('errors.invalidCredentials');
  });

  test('uses errors.unknown fallback when body has no errorCode', async () => {
    const response = makeJsonResponse({ success: false, error: 'something broke' });
    await notifyApiError(response);

    expect(toastMock.error).toHaveBeenCalledWith('errors.unknown');
  });

  test('uses errors.unknown fallback when Response.json() fails', async () => {
    const response = makeFailingJsonResponse();
    await notifyApiError(response);

    expect(toastMock.error).toHaveBeenCalledWith('errors.unknown');
  });

  test('wraps the message with errors.withContext when context is provided', async () => {
    const response = makeJsonResponse({
      success: false,
      errorCode: 'UPSTREAM_ERROR',
      error: 'Failed',
    });
    await notifyApiError(response, 'Generating scene 3');

    // With context, the final message is the `errors.withContext` template.
    expect(toastMock.error).toHaveBeenCalledWith('errors.withContext');
  });

  test('wraps the message with errors.withDetails when body.details is present', async () => {
    const response = makeJsonResponse({
      success: false,
      errorCode: 'RATE_LIMITED',
      error: 'Limited',
      details: 'retry after 60s',
    });
    await notifyApiError(response);

    expect(toastMock.error).toHaveBeenCalledWith('errors.withDetails');
  });
});

describe('notifyError', () => {
  beforeEach(() => {
    toastMock.error.mockClear();
    i18nMock.t.mockClear();
  });

  test('uses the mapped key for an error object with .errorCode', () => {
    notifyError({ errorCode: 'MODEL_NOT_FOUND' });
    expect(toastMock.error).toHaveBeenCalledWith('errors.modelNotFound');
  });

  test('uses the mapped key for every ApiErrorCode', () => {
    notifyError({ errorCode: 'RATE_LIMITED' });
    expect(toastMock.error).toHaveBeenCalledWith('errors.rateLimited');

    toastMock.error.mockClear();
    notifyError({ errorCode: 'GENERATION_FAILED' });
    expect(toastMock.error).toHaveBeenCalledWith('errors.generationFailed');
  });

  test('uses fallbackKey for a plain Error when fallbackKey is provided', () => {
    notifyError(new Error('boom'), 'errors.generationFailed');
    expect(toastMock.error).toHaveBeenCalledWith('errors.generationFailed');
  });

  test('surfaces Error.message when no errorCode and no fallbackKey', () => {
    notifyError(new Error('boom'));
    expect(toastMock.error).toHaveBeenCalledWith('boom');
  });

  test('surfaces a string error directly', () => {
    notifyError('something went wrong');
    expect(toastMock.error).toHaveBeenCalledWith('something went wrong');
  });

  test('uses errors.unknown for unrecognized error shapes', () => {
    notifyError(42);
    expect(toastMock.error).toHaveBeenCalledWith('errors.unknown');
  });

  test('uses errors.unknown fallback when errorCode is not in the map', () => {
    notifyError({ errorCode: 'NONEXISTENT_CODE' as ApiErrorCode });
    expect(toastMock.error).toHaveBeenCalledWith('errors.unknown');
  });
});

describe('notifySuccess', () => {
  beforeEach(() => {
    toastMock.success.mockClear();
  });

  test('calls toast.success with the message', () => {
    notifySuccess('Saved successfully');
    expect(toastMock.success).toHaveBeenCalledWith('Saved successfully');
  });
});

describe('notifyInfo', () => {
  beforeEach(() => {
    toastMock.info.mockClear();
  });

  test('calls toast.info with the message', () => {
    notifyInfo('Heads up');
    expect(toastMock.info).toHaveBeenCalledWith('Heads up');
  });
});
