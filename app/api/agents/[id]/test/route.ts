/**
 * Agent Testing API
 *
 * POST /api/agents/[id]/test  { message: string }
 *
 * Tests an agent's system prompt and configuration by sending a simulated
 * user message to the LLM and returning the response. This lets the
 * management UI show the user how their agent behaves before deploying it.
 *
 * The test uses the agent's stored systemPrompt as the system message and
 * the provided `message` as the user message. No tools are attached — this
 * is a pure prompt test, not a full agent runtime execution.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { readCustomAgent, isValidCustomAgentId } from '@/lib/server/agent-storage';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';

const log = createLogger('AgentTestAPI');

export const POST = withApiHandler(async (
  req: NextRequest,
  _ctx,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    if (!isValidCustomAgentId(id)) {
      return apiError('INVALID_REQUEST', 404, `Agent "${id}" not found`);
    }

    const agent = await readCustomAgent(id);
    if (!agent) return apiError('INVALID_REQUEST', 404, `Agent "${id}" not found`);

    const body = (await req.json().catch(() => ({}))) as { message?: unknown };
    const message =
      typeof body.message === 'string' ? body.message.trim() : '';

    if (!message) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'message is required');
    }

    const resolved = await resolveModelFromRequest(req, body, 'nova-agent');

    const result = await callLLM(
      {
        model: resolved.model,
        system: agent.systemPrompt,
        prompt: message,
        maxOutputTokens: resolved.modelInfo?.outputWindow,
      },
      'nova-agent-test',
      undefined,
      resolved.thinkingConfig,
    );

    log.info(`tested agent "${id}" (${result.text.length} chars output)`);
    return apiSuccess({
      output: result.text,
      agentId: id,
      agentName: agent.name,
      message,
    });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Agent test failed', {
      cause: error,
      label: 'AgentTestAPI',
    });
  }
}, { rateLimit: 'generation' });
