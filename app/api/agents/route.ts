/**
 * Agents Management API.
 *
 * GET  — list every custom agent persisted server-side (DB-backed), tagged with
 *        `source: 'custom'`. Unlike skills, agents have no built-in catalog, so
 *        this returns only user-defined agents.
 * POST — create a new custom agent (validated, persisted to the `agents` table
 *        via `lib/server/agent-storage.ts`).
 *
 * Custom agents were previously stored only in browser localStorage/IndexedDB;
 * this route is the server-side counterpart, mirroring the skills API so agents
 * survive across devices and sessions.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import {
  CustomAgentInput,
  CUSTOM_AGENT_ID_PATTERN,
  isValidCustomAgentId,
  listCustomAgents,
  createCustomAgent,
} from '@/lib/server/agent-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('AgentsAPI');

export async function GET(req: NextRequest) {
  try {
    // Optional owner filter via ?ownerId=. When omitted, all agents are listed.
    const ownerId = req.nextUrl?.searchParams?.get('ownerId') ?? undefined;
    const agents = await listCustomAgents(
      ownerId === undefined ? undefined : ownerId === '' ? null : ownerId,
    );
    const mapped = agents.map((a) => ({ ...a, source: 'custom' as const }));
    return apiSuccess({
      agents: mapped,
      total: mapped.length,
      enabledCount: mapped.filter((a) => a.enabled).length,
    });
  } catch (error) {
    const message = sanitizedErrorDetails(error);
    log.error('Failed to list agents:', message);
    return apiError('INTERNAL_ERROR', 500, 'Failed to list agents');
  }
}

interface CreateAgentBody {
  id?: unknown;
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

export const POST = withApiHandler(async (req: NextRequest) => {
  try {
    const body = (await req.json()) as CreateAgentBody;

    const id = typeof body.id === 'string' ? body.id : '';
    // Fast-fail on id format before hitting the store, so an invalid id gives a
    // 400 with an actionable message instead of a generic validation error.
    if (!id || !CUSTOM_AGENT_ID_PATTERN.test(id) || !isValidCustomAgentId(id)) {
      return apiError(
        'INVALID_REQUEST',
        400,
        'id is required and must match /^[a-z0-9_-]+$/ (max 64 chars)',
      );
    }

    const data: CustomAgentInput = {
      id,
      ownerId: typeof body.ownerId === 'string' ? body.ownerId : null,
      name: typeof body.name === 'string' ? body.name : '',
      role: typeof body.role === 'string' ? body.role : '',
      systemPrompt: typeof body.systemPrompt === 'string' ? body.systemPrompt : '',
      voice: typeof body.voice === 'string' ? body.voice : null,
      avatar: typeof body.avatar === 'string' ? body.avatar : null,
      allowedActions: Array.isArray(body.allowedActions)
        ? (body.allowedActions as unknown[]).filter((v): v is string => typeof v === 'string')
        : [],
      enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
      category: typeof body.category === 'string' ? body.category : null,
    };

    const created = await createCustomAgent(data);
    log.info(`created custom agent "${created.id}"`);
    return apiSuccess({ agent: { ...created, source: 'custom' } }, 201);
  } catch (error) {
    const message = sanitizedErrorDetails(error);
    if (message.includes('already exists')) {
      return apiError('INVALID_REQUEST', 409, message);
    }
    if (message.startsWith('Invalid custom agent')) {
      return apiError('INVALID_REQUEST', 400, message);
    }
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Failed to create agent', {
      cause: error,
      label: 'AgentsAPI',
    });
  }
}, { rateLimit: 'moderate' });
