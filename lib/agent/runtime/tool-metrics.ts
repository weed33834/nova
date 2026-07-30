/**
 * Tool execution metrics wrapper.
 *
 * Mirrors the `recordHttpRequest` pattern from `lib/server/metrics.ts`: for
 * every tool execution we increment `nova_tool_invocations_total` (labelled by
 * tool name + outcome) and observe `nova_tool_duration_seconds` (labelled by
 * tool name). The counter's `status` label is what powers success/error-rate
 * calculations; the histogram captures the latency distribution.
 *
 * Outcome resolution:
 *  - rejects with `ToolTimeoutError` → `'timeout'`
 *  - rejects with anything else     → `'error'`
 *  - resolves                       → `'success'`
 *
 * The wrapper is non-throwing with respect to metrics: recording failures are
 * logged and swallowed so they never break a tool call. The wrapped promise's
 * own resolution/rejection is always preserved.
 */
import { recordToolInvocation } from '@/lib/server/metrics';
import { createLogger } from '@/lib/logger';
import { ToolTimeoutError } from './tool-timeout';

const log = createLogger('ToolMetrics');

/** Outcome label recorded against `nova_tool_invocations_total`. */
type ToolStatus = 'success' | 'error' | 'timeout';

/**
 * Wrap a tool execution promise with Prometheus metrics.
 *
 * Records invocation count (by tool + status), latency, and — via the counter's
 * `status` label — success/error rate. The wrapped promise is returned
 * untouched apart from the observation: resolved values pass through and
 * rejections are re-thrown after recording.
 *
 * @param toolName The name of the tool being executed.
 * @param promise  The tool execution promise (already running).
 */
export function withMetrics<T>(toolName: string, promise: Promise<T>): Promise<T> {
  const start = Date.now();
  return promise.then(
    (value) => {
      record(toolName, 'success', start);
      return value;
    },
    (error: unknown) => {
      const status: ToolStatus = error instanceof ToolTimeoutError ? 'timeout' : 'error';
      record(toolName, status, start);
      throw error;
    },
  );
}

/** Record a tool invocation, swallowing metrics errors (fail-open). */
function record(toolName: string, status: ToolStatus, start: number): void {
  try {
    recordToolInvocation(toolName, status, Date.now() - start);
  } catch (err) {
    // Metrics must never break a tool call.
    log.warn('Failed to record tool metrics', { toolName, status, err });
  }
}
