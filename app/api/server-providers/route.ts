import {
  getServerProviders,
  getServerTTSProviders,
  getServerASRProviders,
  getServerPDFProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerWebSearchProviders,
  getParallelSceneConcurrency,
} from '@/lib/server/provider-config';
import { withApiHandler } from '@/lib/server/api-handler';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import type { NextRequest } from 'next/server';

export const GET = withApiHandler(async (_req: NextRequest, ctx) => {
  try {
    return apiSuccess({
      providers: getServerProviders(),
      tts: getServerTTSProviders(),
      asr: getServerASRProviders(),
      pdf: getServerPDFProviders(),
      image: getServerImageProviders(),
      video: getServerVideoProviders(),
      webSearch: getServerWebSearchProviders(),
      generation: {
        parallelSceneConcurrency: getParallelSceneConcurrency(),
      },
    });
  } catch (error) {
    ctx.log.error('Error fetching server providers:', error);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to load server providers.',
      sanitizedErrorDetails(error),
    );
  }
}, { rateLimit: 'light' });
