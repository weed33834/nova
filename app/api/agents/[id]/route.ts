/**
 * Single-agent API — read / update / delete one custom agent by id.
 *
 * Agents have no built-in catalog (unlike skills), so every id here resolves to
 * a custom, DB-backed agent via `lib/server/agent-storage.ts`. Full CRUD is
 * supported; unknown ids return 404.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import {
  CustomAgentInput,
  isValidCustomAgentId,
  readCustomAgent,
  updateCustomAgent,
  deleteCustomAgent,
} from '@/lib/server/agent-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('AgentDetailAPI');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!isValidCustomAgentId(id)) {
      return apiError('INVALID_REQUEST', 404, `Agent "${id}" not found`);
    }
    const agent = await readCustomAgent(id);
    if (!agent) return apiError('INVALID_REQUEST', 404, `Agent "${id}" not found`);
    return apiSuccess({ agent: { ...agent, source: 'custom' } });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Failed to load agent', {
      cause: error,
      label: 'AgentDetailAPI',
    });
  }
}

interface UpdateAgentBody {
  ownerId?: unknown;
  name?: unknown;
  role?: unknown;
  systemPrompt?: unknown;
  voice?: unknown;
  avatar?: unknown;
  allowedActions?: unknown;
  enabled?: unknown;
  category?: unknown;
}

export const PUT = withApiHandler(async (
  req: NextRequest,
  _ctx,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    if (!isValidCustomAgentId(id)) {
      return apiError('INVALID_REQUEST', 404, `Agent "${id}" not found`);
    }

    const existing = await readCustomAgent(id);
    if (!existing) return apiError('INVALID_REQUEST', 404, `Agent "${id}" not found`);

    const body = (await req.json()) as UpdateAgentBody;
    const data: CustomAgentInput = {};
    if (typeof body.ownerId === 'string' || body.ownerId === null) data.ownerId = body.ownerId;
    if (typeof body.name === 'string') data.name = body.name;
    if (typeof body.role === 'string') data.role = body.role;
    if (typeof body.systemPrompt === 'string') data.systemPrompt = body.systemPrompt;
    if (typeof body.voice === 'string' || body.voice === null) data.voice = body.voice;
    if (typeof body.avatar === 'string' || body.avatar === null) data.avatar = body.avatar;
    if (Array.isArray(body.allowedActions)) {
      data.allowedActions = (body.allowedActions as unknown[]).filter(
        (v): v is string => typeof v === 'string',
      );
    }
    if (typeof body.enabled === 'boolean') data.enabled = body.enabled;
    if (typeof body.category === 'string' || body.category === null) data.category = body.category;

    const saved = await updateCustomAgent(id, data);
    log.info(`updated custom agent "${saved.id}"`);
    return apiSuccess({ agent: { ...saved, source: 'custom' as const } });
  } catch (error) {
    const message = sanitizedErrorDetails(error);
    if (message.startsWith('Invalid custom agent')) {
      return apiError('INVALID_REQUEST', 400, message);
    }
    if (message.includes('not found')) {
      return apiError('INVALID_REQUEST', 404, message);
    }
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Failed to update agent', {
      cause: error,
      label: 'AgentDetailAPI',
    });
  }
}, { rateLimit: 'moderate' });

// PATCH is treated as an alias of PUT (partial update) for client convenience.
export const PATCH = PUT;

export const DELETE = withApiHandler(async (
  _req: NextRequest,
  _ctx,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;
    if (!isValidCustomAgentId(id)) {
      return apiError('INVALID_REQUEST', 404, `Agent "${id}" not found`);
    }
    const deleted = await deleteCustomAgent(id);
    if (!deleted) return apiError('INVALID_REQUEST', 404, `Agent "${id}" not found`);
    log.info(`deleted custom agent "${id}"`);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Failed to delete agent', {
      cause: error,
      label: 'AgentDetailAPI',
    });
  }
}, { rateLimit: 'moderate' });
