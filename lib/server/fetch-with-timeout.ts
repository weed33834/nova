/**
 * `fetch` with an abort-based timeout. Aborts the request after `timeoutMs`
 * and always clears the timer (even on throw). Returns the raw `Response` so
 * callers can branch on status codes.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortFromCaller = () => controller.abort(init.signal?.reason);

  if (init.signal?.aborted) {
    abortFromCaller();
  } else {
    init.signal?.addEventListener('abort', abortFromCaller, { once: true });
  }

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener('abort', abortFromCaller);
  }
}
