/**
 * Prompt Detail API — returns the full rendered content of a single prompt.
 *
 * Returns the system prompt template and optional user prompt template,
 * along with config metadata (version, tags, deprecated). Variables are
 * NOT interpolated — the raw template is returned so the caller can inspect
 * placeholder syntax.
 */
import type { NextRequest } from 'next/server';
import { loadPrompt } from '@/lib/prompts';
import type { PromptId } from '@/lib/prompts';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';

const log = createLogger('PromptDetailAPI');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const prompt = loadPrompt(id as PromptId);
    if (!prompt) {
      return apiError('INVALID_REQUEST', 404, `Prompt "${id}" not found`);
    }
    return apiSuccess({
      prompt: {
        id: prompt.id,
        systemPrompt: prompt.systemPrompt,
        userPromptTemplate: prompt.userPromptTemplate,
        version: prompt.version,
        deprecated: prompt.deprecated,
        config: prompt.config,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Failed to load prompt:', message);
    return apiError('INTERNAL_ERROR', 500, 'Failed to load prompt');
  }
}
