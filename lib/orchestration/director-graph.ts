/**
 * Director Graph — LangGraph StateGraph for Multi-Agent Orchestration
 *
 * Unified single-round graph topology:
 *
 *   START → director ──(end)──→ END
 *              │
 *              └─(next)→ agent_generate ──→ END
 *
 * Each request runs at most one director→agent cycle. The client serializes
 * multiple requests to drive multi-agent discussions. There is no maxTurns
 * cap — the topology is the bound.
 *
 * The director node adapts its strategy based on agent count:
 *   - Single agent: pure code logic (no LLM). Dispatches the agent on
 *     turn 0, then cues the user on subsequent turns.
 *   - Multi agent: LLM-based decision (with code fast-path for turn 0
 *     trigger agent).
 *
 * Uses LangGraph's custom stream mode: each node pushes StatelessEvent
 * chunks via config.writer() for real-time SSE delivery.
 */

// LangGraph / LangChain 为可选依赖（agentFramework 能力）：
// 全部改为运行时动态加载（loadLangGraph / loadLangChainMessages），
// 未安装时 createOrchestrationGraph 抛错，由 stateless-generate 捕获走直通降级。
// 注意：勿恢复静态 import —— 否则 core-only 安装会在构建期解析失败。
import type { LanguageModel } from 'ai';

import { AISdkLangGraphAdapter } from './ai-sdk-adapter';
import type { StatelessEvent } from '@/lib/types/chat';
import type { StatelessChatRequest } from '@/lib/types/chat';
import type { ThinkingConfig } from '@/lib/types/provider';
import type { AgentConfig } from '@/lib/orchestration/registry/types';
import { useAgentRegistry } from '@/lib/orchestration/registry/store';
import { buildStructuredPrompt } from './prompt-builder';
import { summarizeConversation } from './summarizers/conversation-summary';
import { convertMessagesToOpenAI } from './summarizers/message-converter';
import { buildDirectorPrompt, parseDirectorDecision } from './director-prompt';
import { getEffectiveActions } from './tool-schemas';
import { injectPeerMessages } from './message-integration';
import { getMaxActions, hasExceededMaxTurns, isInCooldown, requiresApproval } from './role-constraints';
import type { AgentTurnSummary, WhiteboardActionRecord } from './types';
import { parseStructuredChunk, createParserState, finalizeParser } from './stateless-generate';
import { getCheckpointer, isCheckpointingEnabled } from './checkpointer';
import { createLogger } from '@/lib/logger';

const log = createLogger('DirectorGraph');

// ==================== 可选依赖懒加载 ====================

/** LangGraph 模块缓存（可选依赖 @langchain/langgraph） */
let langGraphMod: typeof import('@langchain/langgraph') | null = null;
async function loadLangGraph(): Promise<typeof import('@langchain/langgraph')> {
  if (!langGraphMod) {
    langGraphMod = await import('@langchain/langgraph').catch(() => null);
    if (!langGraphMod) {
      throw new Error(
        '多智能体编排需要可选依赖 @langchain/langgraph，请执行 pnpm add @langchain/langgraph 后重试。',
      );
    }
  }
  return langGraphMod;
}

/** LangChain 消息类缓存（可选依赖 @langchain/core/messages） */
let lcMsgMod: typeof import('@langchain/core/messages') | null = null;
async function loadLangChainMessages(): Promise<typeof import('@langchain/core/messages')> {
  if (!lcMsgMod) {
    lcMsgMod = await import('@langchain/core/messages').catch(() => null);
    if (!lcMsgMod) {
      throw new Error(
        '多智能体编排需要可选依赖 @langchain/core，请执行 pnpm add @langchain/core 后重试。',
      );
    }
  }
  return lcMsgMod;
}

/** LangGraph RunnableConfig 的本地最小类型（避免 type import 可选包） */
type LangGraphRunnableConfig = {
  writer?: unknown;
  signal?: AbortSignal;
};

// ==================== State Definition ====================

/**
 * LangGraph state annotation for the orchestration graph
 * （惰性构建：由 createOrchestrationGraph 首次调用时初始化）
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let OrchestratorState: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type OrchestratorStateType = any;

async function initOrchestratorState() {
  if (OrchestratorState) return;
  const { Annotation } = await loadLangGraph();
  OrchestratorState = Annotation.Root({
    // Input (set once at graph entry)
    messages: Annotation<StatelessChatRequest['messages']>,
    storeState: Annotation<StatelessChatRequest['storeState']>,
    availableAgentIds: Annotation<string[]>,
    languageModel: Annotation<LanguageModel>,
    thinkingConfig: Annotation<ThinkingConfig | null>,
    discussionContext: Annotation<{ topic: string; prompt?: string } | null>,
    triggerAgentId: Annotation<string | null>,
    userProfile: Annotation<{ nickname?: string; bio?: string } | null>,
    /** Session ID for inter-agent messaging (optional — enables peer-message injection) */
    sessionId: Annotation<string | null>,
    /** Request-scoped agent configs for generated agents (not in the default registry) */
    agentConfigOverrides: Annotation<Record<string, AgentConfig>>,

  // Mutable (updated by nodes)
  currentAgentId: Annotation<string | null>,
  turnCount: Annotation<number>,
  agentResponses: Annotation<AgentTurnSummary[]>({
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),
  whiteboardLedger: Annotation<WhiteboardActionRecord[]>({
    reducer: (prev, update) => [...prev, ...update],
    default: () => [],
  }),
  shouldEnd: Annotation<boolean>,
  totalActions: Annotation<number>,
});
}

/**
 * Look up an agent config: request-scoped overrides first, then global registry.
 * This keeps the server stateless — generated agent configs travel with the request.
 */
function resolveAgent(state: OrchestratorStateType, agentId: string): AgentConfig | undefined {
  return state.agentConfigOverrides[agentId] ?? useAgentRegistry.getState().getAgent(agentId);
}

// ==================== Director Node ====================

/**
 * Unified director: decides which agent speaks next.
 *
 * Strategy varies by agent count:
 *   Single agent — pure code logic, zero LLM calls:
 *     turn 0: dispatch the sole agent
 *     turn 1+: cue user to speak (keeps session active for follow-ups)
 *
 *   Multi agent — LLM-based with code fast-paths:
 *     turn 0 + triggerAgentId: dispatch trigger agent (skip LLM)
 *     otherwise: LLM decides next agent / USER / END
 */
async function directorNode(
  state: OrchestratorStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<OrchestratorStateType>> {
  const rawWrite = config.writer as (chunk: StatelessEvent) => void;
  const write = (chunk: StatelessEvent) => {
    try {
      rawWrite(chunk);
    } catch {
      /* controller closed after abort */
    }
  };
  const isSingleAgent = state.availableAgentIds.length <= 1;

  // ── Single agent: code-only director ──
  if (isSingleAgent) {
    const agentId = state.availableAgentIds[0] || 'default-1';

    if (state.turnCount === 0) {
      // First turn: dispatch the agent
      log.info(`[Director] Single agent: dispatching "${agentId}"`);
      write({ type: 'thinking', data: { stage: 'agent_loading', agentId } });
      return { currentAgentId: agentId, shouldEnd: false };
    }

    // Agent already responded: cue user for follow-up
    log.info(`[Director] Single agent: cueing user after "${agentId}"`);
    write({ type: 'cue_user', data: { fromAgentId: agentId } });
    return { shouldEnd: true };
  }

  // ── Multi agent: fast-path for first turn with trigger ──
  if (state.turnCount === 0 && state.triggerAgentId) {
    const triggerId = state.triggerAgentId;
    if (state.availableAgentIds.includes(triggerId)) {
      log.info(`[Director] First turn: dispatching trigger agent "${triggerId}"`);
      write({
        type: 'thinking',
        data: { stage: 'agent_loading', agentId: triggerId },
      });
      return { currentAgentId: triggerId, shouldEnd: false };
    }
    log.warn(
      `[Director] Trigger agent "${triggerId}" not in available agents, falling through to LLM`,
    );
  }

  // ── Multi agent: LLM-based decision ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const agents: AgentConfig[] = (state.availableAgentIds as any[])
    .map((id: string) => resolveAgent(state, id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((a: AgentConfig | undefined): a is AgentConfig => a != null);

  if (agents.length === 0) {
    return { shouldEnd: true };
  }

  write({ type: 'thinking', data: { stage: 'director' } });

  const openaiMessages = convertMessagesToOpenAI(state.messages);
  const conversationSummary = summarizeConversation(openaiMessages);

  const prompt = buildDirectorPrompt(
    agents,
    conversationSummary,
    state.agentResponses,
    state.turnCount,
    state.discussionContext,
    state.triggerAgentId,
    state.whiteboardLedger,
    state.userProfile || undefined,
    state.storeState.whiteboardOpen,
  );

  const adapter = new AISdkLangGraphAdapter(state.languageModel, state.thinkingConfig ?? undefined);

  try {
    const { SystemMessage, HumanMessage } = await loadLangChainMessages();
    const result = await adapter._generate(
      [new SystemMessage(prompt), new HumanMessage('Decide which agent should speak next.')],
      { signal: config.signal } as Record<string, unknown>,
    );

    const content = result.generations[0]?.text || '';
    // The director response can be multi-KB JSON and may echo user-derived
    // content; log at debug level and truncate to avoid bloating logs.
    log.debug(`[Director] Raw decision: ${content.slice(0, 200)}`);

    const decision = parseDirectorDecision(content);

    if (decision.shouldEnd || !decision.nextAgentId) {
      log.info('[Director] Decision: END');
      return { shouldEnd: true };
    }

    if (decision.nextAgentId === 'USER') {
      log.info('[Director] Decision: cue USER to speak');
      write({
        type: 'cue_user',
        data: { fromAgentId: state.currentAgentId || undefined },
      });
      return { shouldEnd: true };
    }

    const agentExists = agents.some((a) => a.id === decision.nextAgentId);
    if (!agentExists) {
      log.warn(`[Director] Unknown agent "${decision.nextAgentId}", ending`);
      return { shouldEnd: true };
    }

    // Enforce per-role max_turns constraint (e.g. critic: max 3 turns).
    // If the selected agent has exhausted their turns, end the discussion
    // rather than dispatching them again.
    const selectedAgent = agents.find((a) => a.id === decision.nextAgentId);
    if (selectedAgent) {
      const turnsTaken = state.agentResponses.filter(
        (r: AgentTurnSummary) => r.agentId === decision.nextAgentId,
      ).length;
      if (hasExceededMaxTurns(selectedAgent.role, turnsTaken)) {
        log.info(
          `[Director] Agent "${selectedAgent.name}" (role: ${selectedAgent.role}) has exceeded max_turns (${turnsTaken} taken), ending discussion`,
        );
        return { shouldEnd: true };
      }

      // Enforce per-role cooldown constraint — skip agents still in their
      // cooldown window (e.g. evaluator: 30s between turns) by ending the
      // discussion rather than dispatching too soon.
      const lastTurnTimestamp = state.agentResponses
        .filter((r: AgentTurnSummary) => r.agentId === decision.nextAgentId)
        .map((r: AgentTurnSummary) => r.timestamp)
        .filter((t: number | undefined): t is number => t !== undefined)
        .sort((a: number, b: number) => b - a)[0];
      if (isInCooldown(selectedAgent.role, lastTurnTimestamp)) {
        log.info(
          `[Director] Agent "${selectedAgent.name}" (role: ${selectedAgent.role}) is in cooldown, ending discussion`,
        );
        return { shouldEnd: true };
      }
    }

    write({
      type: 'thinking',
      data: { stage: 'agent_loading', agentId: decision.nextAgentId },
    });

    log.info(`[Director] Decision: dispatch agent "${decision.nextAgentId}"`);
    return {
      currentAgentId: decision.nextAgentId,
      shouldEnd: false,
    };
  } catch (error) {
    // AbortError must propagate — the user explicitly cancelled.
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }

    log.error('[Director] LLM decision failed, attempting fallback:', error);

    // Fallback: instead of immediately ending the discussion on a transient
    // LLM error (network blip, rate limit, timeout), dispatch the first
    // eligible agent who hasn't exhausted their turn limit. This keeps the
    // conversation alive and gives the user a response rather than a dead
    // silence — critical for classroom scenarios where students are waiting.
    const eligibleAgents = agents.filter((a) => {
      const turnsTaken = state.agentResponses.filter(
        (r: AgentTurnSummary) => r.agentId === a.id,
      ).length;
      return !hasExceededMaxTurns(a.role, turnsTaken);
    });

    if (eligibleAgents.length > 0) {
      // Prefer the teacher, then the first eligible agent.
      const fallbackAgent =
        eligibleAgents.find((a) => a.role === 'teacher') ?? eligibleAgents[0];
      log.info(
        `[Director] Fallback: dispatching agent "${fallbackAgent.name}" (${fallbackAgent.id})`,
      );
      write({
        type: 'thinking',
        data: { stage: 'agent_loading', agentId: fallbackAgent.id },
      });
      return {
        currentAgentId: fallbackAgent.id,
        shouldEnd: false,
      };
    }

    // No eligible agents left — end gracefully.
    log.warn('[Director] No eligible agents for fallback, ending discussion');
    return { shouldEnd: true };
  }
}

function directorCondition(state: OrchestratorStateType): 'agent_generate' | string {
  // END 用字符串字面量（LangGraph 支持按名引用特殊节点，避免依赖动态导入的 END 常量）
  return state.shouldEnd ? '__end__' : 'agent_generate';
}

// ==================== Agent Generate Node ====================

/**
 * Run generation for one agent. Streams agent_start, text_delta,
 * action, and agent_end events via config.writer().
 */
async function runAgentGeneration(
  state: OrchestratorStateType,
  agentId: string,
  config: LangGraphRunnableConfig,
): Promise<{
  contentPreview: string;
  actionCount: number;
  whiteboardActions: WhiteboardActionRecord[];
}> {
  const agentConfig = resolveAgent(state, agentId);
  if (!agentConfig) {
    throw new Error(`Agent not found: ${agentId}`);
  }

  const rawWrite = config.writer as (chunk: StatelessEvent) => void;
  const write = (chunk: StatelessEvent) => {
    try {
      rawWrite(chunk);
    } catch (e) {
      log.warn(`[AgentGenerate] write failed for ${agentId}:`, e);
    }
  };
  const messageId = `assistant-${agentId}-${Date.now()}`;

  write({
    type: 'agent_start',
    data: {
      messageId,
      agentId,
      agentName: agentConfig.name,
      agentAvatar: agentConfig.avatar,
      agentColor: agentConfig.color,
    },
  });

  // Compute effective actions: filter by scene type for defense-in-depth
  // e.g. spotlight/laser stripped for non-slide scenes even if in static allowedActions
  const currentScene = state.storeState.currentSceneId
    ? state.storeState.scenes.find((s: { id: string }) => s.id === state.storeState.currentSceneId)
    : undefined;
  const sceneType = currentScene?.type;
  const effectiveActions = getEffectiveActions(agentConfig.allowedActions, sceneType);

  const discussionContext = state.discussionContext || undefined;
  const systemPrompt = buildStructuredPrompt(
    agentConfig,
    state.storeState,
    discussionContext,
    state.whiteboardLedger,
    state.userProfile || undefined,
    state.agentResponses,
  );

  // Inject unread peer messages from the inter-agent message bus (if a
  // sessionId is available). This lets agents see what other agents have
  // told them, enabling explicit handoffs and broadcasts.
  const effectiveSystemPrompt = state.sessionId
    ? injectPeerMessages(systemPrompt, agentConfig.id, state.sessionId)
    : systemPrompt;

  const openaiMessages = convertMessagesToOpenAI(state.messages, agentId);
  const adapter = new AISdkLangGraphAdapter(state.languageModel, state.thinkingConfig ?? undefined);

  const { SystemMessage, HumanMessage, AIMessage } = await loadLangChainMessages();
  const lcMessages = [
    new SystemMessage(effectiveSystemPrompt),
    ...openaiMessages.map((m) =>
      m.role === 'user' ? new HumanMessage(m.content) : new AIMessage(m.content),
    ),
  ];

  // Ensure the message list ends with a HumanMessage.
  // After agent-aware role mapping, other agents' messages become user role,
  // so trailing AIMessage is less likely. But guard against edge cases
  // (e.g. agent's own previous response is last in history).
  const lastMsg = lcMessages[lcMessages.length - 1];
  if (!lcMessages.some((m) => m instanceof HumanMessage)) {
    lcMessages.push(new HumanMessage('Please begin.'));
  } else if (lastMsg instanceof AIMessage) {
    lcMessages.push(new HumanMessage("It's your turn to speak. Respond from your perspective."));
  }

  const parserState = createParserState();
  let fullText = '';
  let actionCount = 0;
  const whiteboardActions: WhiteboardActionRecord[] = [];

  try {
    for await (const chunk of adapter.streamGenerate(lcMessages, {
      signal: config.signal,
    })) {
      if (chunk.type === 'delta') {
        const parseResult = parseStructuredChunk(chunk.content, parserState);

        // Emit events in original interleaved order via the `ordered` array.
        // The ordered array tracks complete items from Step 5 of the parser;
        // trailing partial text deltas (Step 6) are in textChunks but not in ordered.
        let emittedTextCount = 0;
        if (parseResult.ordered.length > 0 || parseResult.textChunks.length > 0) {
          log.debug(
            `[AgentGenerate] Parse: ordered=${parseResult.ordered.length} (${parseResult.ordered.map((e) => e.type).join(',')}), textChunks=${parseResult.textChunks.length}, actions=${parseResult.actions.length}, done=${parseResult.isDone}`,
          );
        }
        for (const entry of parseResult.ordered) {
          if (entry.type === 'text') {
            const rawText = parseResult.textChunks[entry.index];
            if (!rawText) {
              log.warn(
                `[AgentGenerate] Ordered text entry index=${entry.index} but textChunks[${entry.index}] is empty`,
              );
              continue;
            }
            const text = rawText.replace(/^>+\s?/gm, '');
            if (!text) continue;
            fullText += text;
            write({
              type: 'text_delta',
              data: { content: text, messageId },
            });
            emittedTextCount++;
          } else if (entry.type === 'action') {
            const ac = parseResult.actions[entry.index];
            if (!ac) continue;
            if (!effectiveActions.includes(ac.actionName)) {
              log.warn(
                `[AgentGenerate] Agent ${agentConfig.name} attempted disallowed action: ${ac.actionName}, skipping`,
              );
              continue;
            }
            // Enforce per-role max_actions constraint (e.g. student: 5 actions/turn).
            // Non-breaking: excess actions are silently skipped with a log.
            const maxActions = getMaxActions(agentConfig.role);
            if (maxActions !== undefined && actionCount >= maxActions) {
              log.info(
                `[AgentGenerate] Agent ${agentConfig.name} (role: ${agentConfig.role}) hit max_actions limit (${maxActions}), skipping remaining action: ${ac.actionName}`,
              );
              continue;
            }
            actionCount++;
            // Check if this agent's role requires approval before action execution
            const approvalRequired = requiresApproval(agentConfig.role);
            // Record whiteboard actions to the ledger
            if (ac.actionName.startsWith('wb_')) {
              whiteboardActions.push({
                actionName: ac.actionName as WhiteboardActionRecord['actionName'],
                agentId,
                agentName: agentConfig.name,
                params: ac.params,
              });
            }
            write({
              type: 'action',
              data: {
                actionId: ac.actionId,
                actionName: ac.actionName,
                params: ac.params,
                agentId,
                messageId,
                ...(approvalRequired ? { approvalRequired: true } : {}),
              },
            });
          }
        }

        // Emit trailing partial text deltas not covered by ordered
        for (let i = emittedTextCount; i < parseResult.textChunks.length; i++) {
          const rawText = parseResult.textChunks[i];
          if (!rawText) continue;
          const text = rawText.replace(/^>+\s?/gm, '');
          if (!text) continue;
          fullText += text;
          write({
            type: 'text_delta',
            data: { content: text, messageId },
          });
        }
      }
    }

    // Finalize: emit any remaining content if the model didn't produce valid JSON
    const finalResult = finalizeParser(parserState);
    for (const entry of finalResult.ordered) {
      if (entry.type === 'text') {
        const rawText = finalResult.textChunks[entry.index];
        if (!rawText) continue;
        const text = rawText.replace(/^>+\s?/gm, '');
        if (!text) continue;
        fullText += text;
        write({
          type: 'text_delta',
          data: { content: text, messageId },
        });
      }
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw error;
    }
    log.error(`[AgentGenerate] Error for ${agentConfig.name}:`, error);
    write({
      type: 'error',
      data: { message: error instanceof Error ? error.message : String(error) },
    });
  }

  write({
    type: 'agent_end',
    data: { messageId, agentId },
  });

  return {
    contentPreview: fullText.slice(0, 300),
    actionCount,
    whiteboardActions,
  };
}

/**
 * Agent generate node — runs one agent, then loops back to director.
 */
async function agentGenerateNode(
  state: OrchestratorStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<OrchestratorStateType>> {
  const agentId = state.currentAgentId;
  if (!agentId) {
    return { shouldEnd: true };
  }

  const agentConfig = resolveAgent(state, agentId);
  const result = await runAgentGeneration(state, agentId, config);

  if (!result.contentPreview && result.actionCount === 0) {
    log.warn(
      `[AgentGenerate] Agent "${agentConfig?.name || agentId}" produced empty response (no text, no actions)`,
    );
  }

  return {
    turnCount: state.turnCount + 1,
    totalActions: state.totalActions + result.actionCount,
    agentResponses: [
      {
        agentId,
        agentName: agentConfig?.name || agentId,
        contentPreview: result.contentPreview,
        actionCount: result.actionCount,
        whiteboardActions: result.whiteboardActions,
        timestamp: Date.now(),
      },
    ],
    whiteboardLedger: result.whiteboardActions,
    currentAgentId: null,
  };
}

// ==================== Graph Construction ====================

/**
 * Create the orchestration LangGraph StateGraph.
 *
 * Topology:
 *   START → director ──(end)──→ END
 *              │
 *              └─(next)→ agent_generate ──→ END
 *
 * Single-round contract: each request runs at most one director→agent cycle.
 * Multi-agent discussions arise from the client serializing requests; the
 * server graph does not loop. There is no `maxTurns` — the topology itself
 * is the bound.
 */
export async function createOrchestrationGraph() {
  await initOrchestratorState();
  const { StateGraph, START, END } = await loadLangGraph();
  const graph = new StateGraph(OrchestratorState)
    .addNode('director', directorNode)
    .addNode('agent_generate', agentGenerateNode)
    .addEdge(START, 'director')
    .addConditionalEdges('director', directorCondition, {
      agent_generate: 'agent_generate',
      [END]: END,
    })
    .addEdge('agent_generate', END);

  // Attach a checkpointer so in-flight state survives a dropped connection
  // and can be resumed/inspected by `thread_id`. Conditional: off in
  // production until a durable saver (SqliteSaver / PostgresSaver) is wired
  // in — see ./checkpointer.ts. When a checkpointer is attached, every
  // invocation MUST pass `config.configurable.thread_id` (handled in
  // stateless-generate.ts); otherwise LangGraph throws.
  if (isCheckpointingEnabled()) {
    log.info('[DirectorGraph] Compiling graph with MemorySaver checkpointer');
    return graph.compile({ checkpointer: await getCheckpointer() });
  }
  return graph.compile();
}

/**
 * Build initial state for the orchestration graph from a StatelessChatRequest
 * and a pre-created LanguageModel instance.
 */
export function buildInitialState(
  request: StatelessChatRequest,
  languageModel: LanguageModel,
  thinkingConfig?: ThinkingConfig,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  // Build request-scoped agent config overrides for generated agents.
  // These travel with each request — no server-side persistence needed.
  const agentConfigOverrides: Record<string, AgentConfig> = {};
  if (request.config.agentConfigs?.length) {
    for (const cfg of request.config.agentConfigs) {
      agentConfigOverrides[cfg.id] = {
        ...cfg,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
  }

  const discussionContext = request.config.discussionTopic
    ? {
        topic: request.config.discussionTopic,
        prompt: request.config.discussionPrompt,
      }
    : null;

  const incoming = request.directorState;
  const turnCount = incoming?.turnCount ?? 0;

  return {
    messages: request.messages,
    storeState: request.storeState,
    availableAgentIds: request.config.agentIds,
    languageModel,
    thinkingConfig: thinkingConfig ?? null,
    discussionContext,
    triggerAgentId: request.config.triggerAgentId || null,
    userProfile: request.userProfile || null,
    sessionId: request.config.sessionId || null,
    agentConfigOverrides,
    currentAgentId: null,
    turnCount,
    agentResponses: incoming?.agentResponses ?? [],
    whiteboardLedger: incoming?.whiteboardLedger ?? [],
    shouldEnd: false,
    totalActions: 0,
  };
}
