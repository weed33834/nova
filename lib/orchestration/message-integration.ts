/**
 * Message bus → prompt-building integration helper.
 *
 * This module bridges the explicit inter-agent messaging layer
 * (`agent-messaging.ts` / `message-bus-manager.ts`) with the existing
 * prompt-building pipeline (`prompt-builder.ts`). It lets an agent's system
 * prompt be augmented with unread peer messages right before the agent is
 * invoked, so the agent is aware of what other agents have told it.
 *
 * Usage (inside the prompt-building path, e.g. before calling the LLM):
 * ```ts
 * systemPrompt = injectPeerMessages(systemPrompt, agentConfig.id, sessionId);
 * ```
 *
 * `injectPeerMessages` calls `bus.receive(agentId)`, which both fetches and
 * *marks as read* the pending messages — so each peer message is injected
 * exactly once. Messages the agent sent itself are never injected (the bus
 * already excludes self-messages in `receive()`).
 */
import { createLogger } from '@/lib/logger';
import { getMessageBus } from './message-bus-manager';
import type { AgentMessage } from './agent-messaging';

const log = createLogger('MessageIntegration');

// ─── Formatting ─────────────────────────────────────────────────────────────

/**
 * Human-readable label for a message type, used in the injected prompt text.
 */
function messageTypeLabel(message: AgentMessage): string {
  switch (message.messageType) {
    case 'broadcast':
      return 'Broadcast';
    case 'handoff':
      return 'Handoff';
    case 'direct':
    default:
      return 'Direct';
  }
}

/**
 * Format a list of messages as readable text suitable for injection into an
 * agent's system prompt.
 *
 * Each message is rendered as a block showing the type, sender, recipient,
 * timestamp, content, and (when present) a compact representation of the
 * metadata. An empty list yields an empty string (so the caller can blindly
 * append the result).
 *
 * @param messages - The messages to format (typically the unread set for an
 *                   agent, but any subset works — e.g. for a history preview).
 * @returns A formatted string, or `''` if `messages` is empty.
 */
export function formatMessagesForPrompt(messages: AgentMessage[]): string {
  if (!messages || messages.length === 0) return '';

  const blocks = messages.map((m) => {
    const recipient =
      m.toAgentId === 'broadcast' ? 'all agents' : m.toAgentId;
    const time = new Date(m.timestamp).toISOString();

    const lines: string[] = [
      `--- [${messageTypeLabel(m)}] from ${m.fromAgentId} → ${recipient} (${time}) ---`,
      m.content,
    ];

    if (m.metadata && Object.keys(m.metadata).length > 0) {
      // Compact, single-line JSON keeps the prompt token footprint small while
      // still conveying structured context (e.g. handoff payloads).
      try {
        lines.push(`metadata: ${JSON.stringify(m.metadata)}`);
      } catch {
        // Metadata contained a non-serialisable value — skip it rather than
        // crashing the prompt build.
      }
    }

    return lines.join('\n');
  });

  return blocks.join('\n\n');
}

// ─── Prompt injection ───────────────────────────────────────────────────────

/** The header that introduces the injected peer-message section. */
const PEER_MESSAGES_HEADER = `# Peer Agent Messages (CRITICAL — READ BEFORE RESPONDING)
The following messages were sent to you by other agents. Acknowledge and act
on them as appropriate. Do not repeat their content verbatim — build on it.`;

/**
 * Inject unread peer messages into an agent's system prompt.
 *
 * This is the primary integration point between the message bus and the
 * prompt-building pipeline. It:
 *  1. Looks up the per-session message bus for `sessionId`.
 *  2. Calls `bus.receive(agentId)` to fetch all unread messages addressed to
 *     the agent (and marks them as read, so they are injected only once).
 *  3. Formats the messages and appends them to `systemPrompt` under a clear
 *     section header.
 *
 * If there are no unread messages, the original `systemPrompt` is returned
 * unchanged (no trailing whitespace or empty sections added).
 *
 * @param systemPrompt - The agent's current system prompt.
 * @param agentId      - The ID of the agent whose prompt is being built.
 * @param sessionId    - The classroom session ID (used to locate the bus).
 * @returns The system prompt with unread peer messages appended, or the
 *          original prompt if there were none.
 */
export function injectPeerMessages(
  systemPrompt: string,
  agentId: string,
  sessionId: string,
): string {
  const bus = getMessageBus(sessionId);
  const unread = bus.receive(agentId);

  if (unread.length === 0) return systemPrompt;

  const formatted = formatMessagesForPrompt(unread);
  if (!formatted) return systemPrompt;

  log.debug('Injected peer messages into prompt', {
    sessionId,
    agentId,
    count: unread.length,
  });

  const section = `\n\n${PEER_MESSAGES_HEADER}\n${formatted}\n`;

  return systemPrompt + section;
}
