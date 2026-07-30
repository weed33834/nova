/**
 * Tool execution timeout wrapper.
 *
 * A hung tool call would otherwise block the entire agent request, because the
 * pi `Agent` loop `await`s each tool's `execute` promise in-process. This
 * module wraps that promise with a hard timeout: when the timer fires we abort
 * a linked `AbortController` (so tools that honor their signal can stop early)
 * and reject with a `ToolTimeoutError`.
 *
 * Default timeout: 30s, overridable via the `TOOL_TIMEOUT_MS` env var.
 *
 * Cancellation model:
 * - JS promises cannot be forcefully cancelled. `withTimeout` races the tool
 *   promise against a timer; on timeout it rejects the wrapper so the agent
 *   loop is unblocked, and aborts the controller so cooperative tools stop.
 * - For tools that ignore their abort signal (e.g. the MCP adapter, which does
 *   not thread the signal into `client.callTool`), the underlying work may
 *   continue in the background, but the request is no longer blocked.
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('ToolTimeout');

/** Default per-tool execution timeout in milliseconds (30 seconds). */
export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/**
 * Resolve the configured tool timeout from the environment.
 *
 * Reads `TOOL_TIMEOUT_MS` and falls back to {@link DEFAULT_TOOL_TIMEOUT_MS}
 * when unset or invalid. Non-numeric / non-positive values are logged and
 * ignored rather than crashing the process.
 */
export function getToolTimeoutMs(): number {
  const raw = process.env.TOOL_TIMEOUT_MS;
  if (raw === undefined || raw === '') return DEFAULT_TOOL_TIMEOUT_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    log.warn('Invalid TOOL_TIMEOUT_MS value, using default', {
      value: raw,
      default: DEFAULT_TOOL_TIMEOUT_MS,
    });
    return DEFAULT_TOOL_TIMEOUT_MS;
  }
  return parsed;
}

/**
 * Error thrown when a tool execution exceeds its timeout.
 *
 * Carries the tool name and configured duration so callers (metrics, logs, the
 * agent loop) can distinguish a timeout from a generic tool failure.
 */
export class ToolTimeoutError extends Error {
  /** Name of the tool that timed out. */
  readonly toolName: string;
  /** Configured timeout duration in milliseconds. */
  readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(`Tool "${toolName}" timed out after ${timeoutMs}ms`);
    this.name = 'ToolTimeoutError';
    this.toolName = toolName;
    this.timeoutMs = timeoutMs;
    // Restore the prototype chain so `instanceof ToolTimeoutError` works
    // reliably across runtimes / transpilation targets.
    Object.setPrototypeOf(this, ToolTimeoutError.prototype);
  }
}

/**
 * Wrap a promise with a hard timeout.
 *
 * If `controller` is provided, it is aborted when the timeout fires so that
 * underlying work which honors the abort signal can stop early. The wrapper
 * cannot forcefully cancel a promise that ignores its signal — the timeout
 * still rejects so the agent loop is never blocked indefinitely.
 *
 * The original promise always has success/error handlers attached, so a late
 * settlement after a timeout never surfaces as an unhandled rejection.
 *
 * @param promise    The tool execution promise to race against the timer.
 * @param ms         Timeout duration in milliseconds.
 * @param toolName   Tool name, used for the thrown error and log line.
 * @param controller Optional `AbortController` linked to the tool's execute
 *                   signal; aborted on timeout for cooperative cancellation.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  toolName: string,
  controller?: AbortController,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Cooperatively cancel underlying work where the tool honors its signal.
      if (controller && !controller.signal.aborted) {
        controller.abort(new ToolTimeoutError(toolName, ms));
      }
      log.warn('Tool execution timed out', { toolName, timeoutMs: ms });
      reject(new ToolTimeoutError(toolName, ms));
    }, ms);

    // Attach handlers up front so a late settlement is never unhandled.
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
