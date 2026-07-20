/**
 * Nova Agent — agent runtime construction.
 *
 * Stands up a pi `Agent` with:
 * - injected StreamFn (-> Nova connector),
 * - request-scoped tools supplied by the route,
 * - a `beforeToolCall` allowlist gate (v0 capability restriction = tool allowlist,
 *   NOT a hardcoded workflow). Adding capability later = widening this set.
 * - a `afterToolCall` quota hook (v0 stub: unlimited).
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
import { V0_ALLOWLIST } from '../tools/registry';
import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { createLogger } from '@/lib/logger';

const log = createLogger('BuildAgent');

// pi needs *a* model object on state; the injected StreamFn ignores it and uses
// Nova's resolved model, so this is a metadata stub (high contextWindow so
// the harness never tries to compact).
const STUB_MODEL = {
  id: 'maic-connector',
  name: 'maic-connector',
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
}

export function buildAgent(opts: BuildAgentOptions): Agent {
  return new Agent({
    streamFn: opts.streamFn,
    toolExecution: 'sequential',
    initialState: {
      systemPrompt: opts.systemPrompt,
      model: STUB_MODEL,
      tools: opts.tools,
      // Seed prior turns so `agent.prompt(newMessage)` runs with the full
      // conversation in context — without this the agent is stateless per turn.
      ...(opts.history && opts.history.length > 0 ? { messages: opts.history } : {}),
    },
    beforeToolCall: makeAllowlistGate(opts.allowlist ?? V0_ALLOWLIST),
    afterToolCall: makeQuotaHook({ remaining: () => Number.MAX_SAFE_INTEGER }),
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
