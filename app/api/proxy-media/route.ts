/**
 * Media Proxy API
 *
 * Server-side proxy for fetching remote media URLs (images/videos).
 * Required because browser fetch() to remote CDN URLs fails with CORS errors.
 * The media orchestrator uses this to download generated media as blobs
 * for IndexedDB persistence.
 *
 * POST /api/proxy-media
 * Body: { url: string }
 * Response: Binary blob with appropriate Content-Type
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
import { apiError } from '@/lib/server/api-response';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('ProxyMedia');

export const maxDuration = 60;

// Per-hop timeout for upstream CDN fetches. Without this, a slow remote host
// can hold the request open up to the full maxDuration (60s), tying up a
// serverless instance. 15s is generous for a single CDN hop while still
// leaving headroom for the redirect chain.
const UPSTREAM_HOP_TIMEOUT_MS = 15_000;

export async function POST(request: NextRequest) {
  let url: string | undefined;
  try {
    ({ url } = await request.json());

    if (!url || typeof url !== 'string') {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing or invalid url');
    }

    // Initial SSRF validation
    const ssrfError = await validateUrlForSSRF(url);
    if (ssrfError) {
      return apiError('INVALID_URL', 403, ssrfError);
    }

    const MAX_REDIRECTS = 5;
    let currentUrl = url;
    let response: Response;
    for (let hop = 0; ; hop++) {
      response = await fetch(currentUrl, {
        redirect: 'manual',
        signal: AbortSignal.timeout(UPSTREAM_HOP_TIMEOUT_MS),
      });
      if (response.status < 300 || response.status >= 400) break; // not a redirect
      const location = response.headers.get('location');
      if (!location)
        return apiError('UPSTREAM_ERROR', 502, 'Redirect response without Location header');
      if (hop >= MAX_REDIRECTS) return apiError('TOO_MANY_REDIRECTS', 502, 'Too many redirects');
      let nextUrl: string;
      try {
        nextUrl = new URL(location, currentUrl).href; // resolve relative redirects
      } catch {
        return apiError('INVALID_URL', 502, 'Invalid redirect Location');
      }
      // Re-validate each redirect hop to prevent redirect-to-internal SSRF (#398)
      const hopError = await validateUrlForSSRF(nextUrl);
      if (hopError) return apiError('INVALID_URL', 403, hopError);
      currentUrl = nextUrl;
    }

    if (!response!.ok) {
      // Forward client (4xx) errors as-is so the caller treats them as permanent
      // (no retry); collapse upstream server (5xx) errors to 502.
      const status = response!.status >= 400 && response!.status < 500 ? response!.status : 502;
      return apiError('UPSTREAM_ERROR', status, `Upstream returned ${response!.status}`);
    }

    const MAX_PROXY_BYTES = 25 * 1024 * 1024; // 25 MiB
    const contentLength = Number(response!.headers.get('content-length') ?? '');
    if (Number.isFinite(contentLength) && contentLength > MAX_PROXY_BYTES) {
      return apiError('UPSTREAM_ERROR', 502, `Upstream asset too large (${contentLength} bytes)`);
    }
    const contentType = response!.headers.get('content-type') || 'application/octet-stream';
    const upstream = response!.body;
    if (!upstream) {
      return apiError('UPSTREAM_ERROR', 502, 'Upstream returned no body');
    }

    // 直接 stream-pipe 上游响应体到下游，避免整文件载入内存造成 OOM。
    // content-length 前置校验作为主守卫；stream-time 计数作为兜底，应对
    // content-length 缺失/撒谎的场景——超限即 error 流并 abort 上游。
    let received = 0;
    // 共享 reader 引用：start 中获取，cancel 中复用，避免在已锁定的流上
    // 再次 getReader() 抛错。下游 cancel（客户端断连）时复用它取消上游。
    let activeReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
    const limited = new ReadableStream<Uint8Array>({
      async start(controller) {
        const reader = upstream.getReader();
        activeReader = reader;
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            received += value.byteLength;
            if (received > MAX_PROXY_BYTES) {
              controller.error(new Error(`Upstream asset too large (>${MAX_PROXY_BYTES} bytes)`));
              // 取消上游 reader 以释放底层 fetch 连接；仅 releaseLock 不会
              // 中断上游，会继续占用带宽直到远端写完。
              await reader.cancel().catch(() => {});
              return;
            }
            controller.enqueue(value);
          }
          controller.close();
        } catch (e) {
          controller.error(e);
        } finally {
          reader.releaseLock();
          activeReader = null;
        }
      },
      async cancel(reason) {
        // 下游 cancel（如客户端断连）时，把取消信号传给上游，避免上游
        // fetch 连接悬挂至远端写完。
        const reader = activeReader;
        if (reader) {
          await reader.cancel(reason).catch(() => {});
        } else {
          await upstream.cancel(reason).catch(() => {});
        }
      },
    });

    return new NextResponse(limited, {
      headers: {
        'Content-Type': contentType,
        ...(Number.isFinite(contentLength) ? { 'Content-Length': String(contentLength) } : {}),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    // AbortSignal.timeout throws a DOMException with name 'TimeoutError';
    // surface it as 504 Gateway Timeout so callers can distinguish a slow
    // upstream from a genuine server-side failure.
    const isTimeout =
      error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (isTimeout) {
      log.warn(
        `Proxy media timed out [url="${url?.substring(0, 100) ?? 'unknown'}"] after ${UPSTREAM_HOP_TIMEOUT_MS}ms`,
      );
      return apiError('CONNECTION_TIMEOUT', 504, 'Upstream request timed out');
    }
    log.error(`Proxy media failed [url="${url?.substring(0, 100) ?? 'unknown'}"]:`, error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to proxy media. Please try again.',
      sanitizedErrorDetails(error),
    );
  }
}
