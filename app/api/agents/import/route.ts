/**
 * Agent import API.
 *
 * POST /api/agents/import  { agents: CustomAgentInput | CustomAgentInput[], overwrite?: boolean }
 *
 * Bulk-imports custom agents from a JSON payload (single object or array).
 * Useful for transferring an agent pack between deployments. Each spec is
 * validated and timestamped. By default existing ids are skipped (reported as
 * `skipped`); pass `overwrite: true` to replace them.
 *
 * Mirrors the skills import API so the same UX (export → import) works for
 * agents as for skills.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import {
  CustomAgentInput,
  validateCustomAgent,
  isValidCustomAgentId,
  readCustomAgent,
  createCustomAgent,
  updateCustomAgent,
} from '@/lib/server/agent-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('AgentImportAPI');

interface ImportBody {
  agents?: unknown;
  overwrite?: unknown;
}

export const POST = withApiHandler(async (req: NextRequest) => {
  try {
    const body = (await req.json()) as ImportBody;
    const overwrite = body.overwrite === true;

    const input = Array.isArray(body.agents)
      ? body.agents
      : body.agents && typeof body.agents === 'object'
        ? [body.agents]
        : null;
    if (!input) {
      return apiError('INVALID_REQUEST', 400, '`agents` (object or array) is required');
    }

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const raw of input) {
      const id =
        raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string'
          ? (raw as { id: string }).id
          : '';
      if (!id || !isValidCustomAgentId(id)) {
        skipped.push({ id: id || '<missing>', reason: 'invalid id' });
        continue;
      }

      const r = raw as Record<string, unknown>;
      const data: CustomAgentInput = {
        id,
        ownerId: typeof r.ownerId === 'string' ? r.ownerId : r.ownerId === null ? null : undefined,
        name: typeof r.name === 'string' ? r.name : undefined,
        role: typeof r.role === 'string' ? r.role : undefined,
        systemPrompt: typeof r.systemPrompt === 'string' ? r.systemPrompt : undefined,
        voice:
          typeof r.voice === 'string' ? r.voice : r.voice === null ? null : undefined,
        avatar:
          typeof r.avatar === 'string' ? r.avatar : r.avatar === null ? null : undefined,
        allowedActions: Array.isArray(r.allowedActions)
          ? (r.allowedActions as unknown[]).filter((v): v is string => typeof v === 'string')
          : undefined,
        enabled: typeof r.enabled === 'boolean' ? r.enabled : undefined,
        category:
          typeof r.category === 'string' ? r.category : r.category === null ? null : undefined,
      };

      const errors = validateCustomAgent({ ...data, id }, { isNew: true });
      if (errors.length > 0) {
        skipped.push({ id, reason: errors[0] });
        continue;
      }

      const existing = await readCustomAgent(id);
      if (existing && !overwrite) {
        skipped.push({ id, reason: 'already exists (pass overwrite:true to replace)' });
        continue;
      }
      if (existing) {
        await updateCustomAgent(id, data);
        updated.push(id);
      } else {
        await createCustomAgent(data);
        created.push(id);
      }
    }

    log.info(
      `import: ${created.length} created, ${updated.length} updated, ${skipped.length} skipped`,
    );
    return apiSuccess({ created, updated, skipped });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Agent import failed', {
      cause: error,
      label: 'AgentImportAPI',
    });
  }
}, { rateLimit: 'moderate' });
