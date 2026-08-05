/**
 * LangGraph Checkpointer — persistence layer for the orchestration graph.
 *
 * Background: the StateGraph in `director-graph.ts` was originally compiled
 * without a checkpointer, making every run fully stateless. A dropped
 * connection (network blip, server restart, client abort) therefore lost all
 * in-flight state. Attaching a checkpointer lets LangGraph snapshot state
 * after every node, keyed by a `thread_id`, so a run can be resumed or
 * inspected instead of being lost.
 *
 * Development: `MemorySaver` — an in-process, in-memory saver. Cheap to
 *   construct and sufficient for local dev / tests, but state is lost when
 *   the process exits.
 *
 * Production: replace the saver returned by {@link getCheckpointer} with a
 *   durable backend. The drop-in options from `@langchain/langgraph` are:
 *     - `SqliteSaver`   — file-backed; only safe for a single instance.
 *     - `PostgresSaver` — shared across replicas (use when scaling out).
 *   See: https://langchain-ai.github.io/langgraphjs/concepts/persistence/
 *
 * The saver is instantiated as a process-wide singleton via `globalThis`
 * (mirroring the MCP client manager in `lib/mcp/client-manager.ts`) so a
 * single instance survives across requests in standalone Next.js and is not
 * orphaned by dev hot-reloads.
 */

import { createLogger } from '@/lib/logger';
// 注意：@langchain/langgraph 为可选依赖，getCheckpointer 运行时动态加载（勿恢复静态 import）

const log = createLogger('Checkpointer');

// ─── Process-wide singleton ───────────────────────────────────────────────────
//
// `globalThis` guard: in dev, hot reload re-evaluates this module; without the
// guard each reload would create a fresh MemorySaver and discard the
// checkpointed state accumulated for in-flight threads. In standalone Next.js,
// a single instance survives across requests.

const GLOBAL_KEY = '__NOVA_LANGGRAPH_CHECKPOINTER__';

function getGlobal(): typeof globalThis & Record<string, unknown> {
  return globalThis as typeof globalThis & Record<string, unknown>;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MemorySaverLike = any;

/**
 * Returns the process-wide `MemorySaver` singleton.
 *
 * Always returns the same instance within a process (lazily created on first
 * call). Callers that only need to know *whether* checkpointing is active
 * should prefer {@link isCheckpointingEnabled} rather than calling this.
 */
export async function getCheckpointer(): Promise<MemorySaverLike> {
  const g = getGlobal();
  if (!g[GLOBAL_KEY]) {
    const mod = await import('@langchain/langgraph').catch(() => null);
    if (!mod?.MemorySaver) {
      throw new Error(
        '检查点（checkpointing）需要可选依赖 @langchain/langgraph，请执行 pnpm add @langchain/langgraph 后重试。',
      );
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    g[GLOBAL_KEY] = new mod.MemorySaver() as any;
    log.info('LangGraph MemorySaver initialized (in-memory checkpointing)');
  }
  return g[GLOBAL_KEY] as MemorySaverLike;
}

/**
 * Whether the orchestration graph should be compiled with a checkpointer.
 *
 * Checkpointing is enabled when ANY of the following holds:
 *   - `LANGGRAPH_CHECKPOINTING_ENABLED=true`  — explicit opt-in (any env), or
 *   - `NODE_ENV=development`                   — on by default for dev,
 *     unless explicitly disabled with `LANGGRAPH_CHECKPOINTING_ENABLED=false`.
 *
 * Production (non-dev, flag unset) defaults to OFF, preserving the original
 * stateless behaviour until a durable saver (SqliteSaver / PostgresSaver) is
 * wired in. Both the graph compilation and the invocation site consult this so
 * the `thread_id` config is only required — and supplied — when a checkpointer
 * is actually attached (LangGraph throws if a checkpointer is present but no
 * `configurable.thread_id` is passed at invocation).
 */
export function isCheckpointingEnabled(): boolean {
  const flag = process.env.LANGGRAPH_CHECKPOINTING_ENABLED;
  if (flag === 'true') return true;
  if (flag === 'false') return false;
  return process.env.NODE_ENV === 'development';
}
