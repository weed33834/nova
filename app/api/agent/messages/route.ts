/**
 * Inter-agent messaging API.
 *
 * GET  /api/agent/messages?sessionId=xxx          — list message history for a session
 * GET  /api/agent/messages?sessionId=xxx&agentId=yyy — list messages involving an agent
 * POST /api/agent/messages                          — send a message through the bus
 *
 * The GET endpoint is a non-destructive read (uses `getHistory`, does NOT mark
 * messages as read). Actual message consumption — which marks messages as read
 * — happens server-side via `message-integration.injectPeerMessages` during
 * prompt building, not through this API.
 *
 * The POST endpoint accepts a raw `SendableMessage` payload and delegates to
 * the per-session `AgentMessageBus.send()`. The `sessionId` may be supplied
 * as a query param (consistent with GET) or inside the JSON body.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { getMessageBus } from '@/lib/orchestration/message-bus-manager';
import type { MessageType } from '@/lib/orchestration/agent-messaging';

// ─── GET: list messages ─────────────────────────────────────────────────────

export const GET = withApiHandler(async (req: NextRequest) => {
  const sessionId = req.nextUrl.searchParams.get('sessionId');
  const agentId = req.nextUrl.searchParams.get('agentId') ?? undefined;

  if (!sessionId) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'sessionId query parameter is required',
    );
  }

  const bus = getMessageBus(sessionId);
  const messages = bus.getHistory(agentId);

  return apiSuccess({ messages, total: messages.length });
}, { rateLimit: 'light' });

// ─── POST: send a message ───────────────────────────────────────────────────

interface SendMessageBody {
  sessionId?: unknown;
  fromAgentId?: unknown;
  toAgentId?: unknown;
  content?: unknown;
  messageType?: unknown;
  metadata?: unknown;
}

const VALID_MESSAGE_TYPES: readonly MessageType[] = ['direct', 'broadcast', 'handoff'];

export const POST = withApiHandler(async (req: NextRequest) => {
  // sessionId may be supplied as a query param (consistent with GET) or inside
  // the JSON body. The query param takes precedence.
  const querySessionId = req.nextUrl.searchParams.get('sessionId');

  let body: SendMessageBody;
  try {
    body = (await req.json()) as SendMessageBody;
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const sessionId = querySessionId ?? (typeof body.sessionId === 'string' ? body.sessionId : '');
  const fromAgentId = typeof body.fromAgentId === 'string' ? body.fromAgentId : '';
  const toAgentId = typeof body.toAgentId === 'string' ? body.toAgentId : '';
  const content = typeof body.content === 'string' ? body.content : '';

  if (!sessionId) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'sessionId is required');
  }
  if (!fromAgentId) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'fromAgentId is required');
  }
  if (!toAgentId) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'toAgentId is required');
  }
  if (!content) {
    return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'content is required');
  }

  // Validate messageType — default to 'direct' when omitted.
  const messageType: MessageType =
    typeof body.messageType === 'string' && VALID_MESSAGE_TYPES.includes(body.messageType as MessageType)
      ? (body.messageType as MessageType)
      : 'direct';

  // Validate metadata — must be a plain object if present.
  const metadata =
    body.metadata !== undefined && body.metadata !== null && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : undefined;

  // Consistency: a broadcast messageType should carry a 'broadcast' recipient,
  // and vice-versa. We normalise rather than reject so callers can rely on
  // either field to indicate a broadcast.
  const resolvedToAgentId =
    messageType === 'broadcast' ? 'broadcast' : toAgentId;
  const resolvedMessageType: MessageType =
    resolvedToAgentId === 'broadcast' ? 'broadcast' : messageType;

  const bus = getMessageBus(sessionId);
  const message = bus.send({
    fromAgentId,
    toAgentId: resolvedToAgentId,
    content,
    messageType: resolvedMessageType,
    metadata,
  });

  return apiSuccess({ message }, 201);
}, { rateLimit: 'moderate' });
