/**
 * Prompt Management API — read-only catalog endpoint.
 *
 * Returns the full prompt registry (all templates across main + PBL v2 sources),
 * including version, description, tags, and deprecated status. This lets the
 * Settings UI enumerate prompts without MCP, and gives external tools a simple
 * HTTP endpoint to inspect the prompt inventory.
 *
 * For the rendered content of a specific prompt, use GET /api/prompts/[id].
 */
import { getPromptRegistry } from '@/lib/prompts';
import { withApiHandler } from '@/lib/server/api-handler';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import type { NextRequest } from 'next/server';

export const GET = withApiHandler(async (_req: NextRequest, ctx) => {
  try {
    const registry = getPromptRegistry();
    return apiSuccess({
      prompts: registry,
      total: registry.length,
    });
  } catch (error) {
    const message = sanitizedErrorDetails(error);
    ctx.log.error('Failed to list prompts:', message);
    return apiError('INTERNAL_ERROR', 500, 'Failed to list prompts');
  }
}, { rateLimit: 'light' });
