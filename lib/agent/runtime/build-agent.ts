/**
 * Nova Agent — agent runtime construction.
 *
 * Stands up a pi `Agent` with:
 * - injected StreamFn (-> Nova connector),
 * - request-scoped tools supplied by the route,
 * - a `beforeToolCall` allowlist gate (v0 capability restriction = tool allowlist,
 *   NOT a hardcoded workflow). Adding capability later = widening this set.
 * - a `afterToolCall` quota hook (v0 stub: unlimited).
 * - each tool's `execute` wrapped with a hard timeout + Prometheus metrics
 *   (see `wrapToolExecute`), so a hung tool call can never block the request.
 */
import {
  Agent,
  type AgentMessage,
  type AgentTool,
  type StreamFn,
} from '@earendil-works/pi-agent-core';
import type { Api, Model } from '@earendil-works/pi-ai';
import { makeAllowlistGate } from './allowlist';
import { makeQuotaHook } from './quota';
import { withTimeout, DEFAULT_TOOL_TIMEOUT_MS } from './tool-timeout';
import { withMetrics } from './tool-metrics';
import { V0_ALLOWLIST } from '../tools/registry';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { createLogger } from '@/lib/logger';

const log = createLogger('BuildAgent');

// pi needs *a* model object on state; the injected StreamFn ignores it and uses
// Nova's resolved model, so this is a metadata stub (high contextWindow so
// the harness never tries to compact).
const STUB_MODEL = {
  id: 'nova-connector',
  name: 'nova-connector',
  api: 'unknown',
  provider: 'unknown',
  baseUrl: '',
  reasoning: false,
  input: [],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 8192,
} as unknown as Model<Api>;

export interface BuildAgentOptions {
  streamFn: StreamFn;
  systemPrompt: string;
  tools: AgentTool<never, never>[];
  /** Prior conversation turns to seed the agent with, so it has multi-turn memory. */
  history?: AgentMessage[];
  /**
   * Override the v0 tool allowlist (defaults to `V0_ALLOWLIST`). Pass a
   * combined set of built-in tool ids plus MCP-discovered tool names so the
   * `beforeToolCall` gate admits MCP tools. The gate is defense-in-depth —
   * tool capability is also bounded by what `tools` actually contains.
   */
  allowlist?: ReadonlySet<string>;
  /**
   * The user ID for quota enforcement. When omitted, the quota hook is
   * a no-op (anonymous/demo mode — no usage tracking).
   */
  userId?: string | null;
  /** The user's role (admins bypass quota). */
  userRole?: string;
  /**
   * Per-tool execution timeout in milliseconds. A tool whose `execute` promise
   * does not settle within this window is aborted (cooperatively, via its
   * abort signal) and rejected with a `ToolTimeoutError` so a hung tool can
   * never block the whole request. Defaults to {@link DEFAULT_TOOL_TIMEOUT_MS}
   * (30s); override per-request or globally via the `TOOL_TIMEOUT_MS` env var.
   */
  toolTimeoutMs?: number;
}

/**
 * A tool with fully-erased generic parameters — the shape `wrapToolExecute`
 * operates on. `AgentTool<any, any>` is assignable both from the
 * `AgentTool<never, never>[]` the registry produces and to the
 * `AgentTool<any>[]` the pi `Agent` accepts.
 */
type AnyAgentTool = AgentTool<any, any>;

/**
 * Wrap a tool's `execute` with a hard timeout and Prometheus metrics.
 *
 * The pi `Agent` (see `AgentOptions`) exposes no `toolExecute` / `wrapTool`
 * hook — only `beforeToolCall` / `afterToolCall` — so each tool's `execute`
 * is wrapped before being handed to `buildAgent`. The wrapper:
 *  - creates a per-invocation `AbortController` linked to the agent's run
 *    signal (so an aborted run propagates into the tool);
 *  - passes the controller's signal into `execute`;
 *  - races the result against `withTimeout`, which aborts the controller on
 *    timeout so cooperative tools (those that honor their signal) stop early;
 *  - records invocation / latency / outcome via `withMetrics`.
 *
 * `execute` is invoked as `tool.execute(...)` (not extracted) so any `this`
 * binding the tool relies on is preserved. Every tool in this codebase is a
 * plain object literal (built-in factories, the MCP adapter, and the
 * custom-skill adapter all return object literals), so a shallow spread is a
 * safe, non-mutating way to override `execute`.
 */
function wrapToolExecute(tool: AnyAgentTool, timeoutMs: number): AnyAgentTool {
  const wrappedExecute: AnyAgentTool['execute'] = async (
    toolCallId,
    params,
    signal,
    onUpdate,
  ) => {
    // Per-invocation controller linked to the agent's run signal, so an
    // aborted run cancels the tool and a timeout can abort it cooperatively.
    const controller = new AbortController();
    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason);
      } else {
        signal.addEventListener(
          'abort',
          () => controller.abort(signal.reason),
          { once: true },
        );
      }
    }

    // Invoke as a method to preserve `this`; pass our linked signal so the
    // tool can observe both run-aborts and timeout-aborts.
    const execPromise = tool.execute(toolCallId, params, controller.signal, onUpdate);
    const timed = withTimeout(execPromise, timeoutMs, tool.name, controller);
    return withMetrics(tool.name, timed);
  };

  return { ...tool, execute: wrappedExecute };
}

export function buildAgent(opts: BuildAgentOptions): Agent {
  const toolTimeoutMs = opts.toolTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const tools = opts.tools.map((tool) => wrapToolExecute(tool, toolTimeoutMs));

  return new Agent({
    streamFn: opts.streamFn,
    toolExecution: 'sequential',
    initialState: {
      systemPrompt: opts.systemPrompt,
      model: STUB_MODEL,
      tools,
      // Seed prior turns so `agent.prompt(newMessage)` runs with the full
      // conversation in context — without this the agent is stateless per turn.
      ...(opts.history && opts.history.length > 0 ? { messages: opts.history } : {}),
    },
    beforeToolCall: makeAllowlistGate(opts.allowlist ?? V0_ALLOWLIST),
    afterToolCall: makeQuotaHook({
      userId: opts.userId ?? null,
      userRole: opts.userRole,
    }),
  });
}

/**
 * Build the editor agent system prompt from the `editor-agent` template.
 *
 * The template lives at `lib/prompts/templates/editor-agent/system.md` (migrated
 * from a hardcoded TS string array in this file). `sceneLine` is computed here
 * with the same defensive encoding the inline version used: `scene.id` /
 * `scene.title` originate from the untrusted client POST body, so they are
 * `JSON.stringify`-quoted and length-capped before interpolation. The tool
 * allowlist already enforces capabilities server-side; this is defense-in-depth
 * for the prompt text.
 */
export function buildSystemPrompt(scene?: { id: string; title: string }): string {
  const sceneLine = scene
    ? `The current slide is id=${JSON.stringify(String(scene.id).slice(0, 200))} with title ${JSON.stringify(String(scene.title).slice(0, 300))}.`
    : 'There is no active slide.';

  const built = buildPrompt(PROMPT_IDS.EDITOR_AGENT, { sceneLine });
  if (!built) {
    // Should be unreachable — the editor-agent template ships with the repo.
    // Fall back to an inline minimal prompt and log loudly so a missing
    // template never silently degrades the editor agent.
    log.error('editor-agent template failed to load; falling back to inline prompt');
    return [
      'You are the Nova Editor assistant, embedded in the slide editor sidebar.',
      sceneLine,
      "Keep replies to one or two sentences. Reply in the user's language.",
    ].join(' ');
  }
  return built.system;
}
