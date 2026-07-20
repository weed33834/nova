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
import { NextResponse } from 'next/server';
import { getPromptRegistry } from '@/lib/prompts';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('PromptsAPI');

export async function GET() {
  try {
    const registry = getPromptRegistry();
    return apiSuccess({
      prompts: registry,
      total: registry.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Failed to list prompts:', message);
    return apiError('INTERNAL_ERROR', 500, 'Failed to list prompts');
  }
}
