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
import { withApiHandler } from '@/lib/server/api-handler';
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';

export const GET = withApiHandler(async (
  _req: NextRequest,
  ctx,
  { params }: { params: Promise<{ id: string }> },
) => {
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
    const message = sanitizedErrorDetails(error);
    ctx.log.error('Failed to load prompt:', message);
    return apiError('INTERNAL_ERROR', 500, 'Failed to load prompt');
  }
}, { rateLimit: 'light' });
