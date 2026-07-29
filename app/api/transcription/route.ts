import { NextRequest } from 'next/server';
import { transcribeAudio } from '@/lib/audio/asr-providers';
import {
  isServerConfiguredProvider,
  resolveASRApiKey,
  resolveASRBaseUrl,
} from '@/lib/server/provider-config';
import type { ASRProviderId } from '@/lib/audio/types';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import { validateUrlForSSRF } from '@/lib/server/ssrf-guard';
const log = createLogger('Transcription');

export const maxDuration = 60;

// OpenAI Whisper (and most OpenAI-compatible ASR endpoints) reject uploads
// larger than 25MB. Cap here so a huge recording fails fast at the route
// boundary instead of being forwarded upstream and rejected (or stalling
// the multipart forward on a slow link).
const MAX_AUDIO_FILE_SIZE_BYTES = 25 * 1024 * 1024;

export async function POST(req: NextRequest) {
  let resolvedProviderId: string | undefined;
  let resolvedModelId: string | undefined;
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;
    const providerId = formData.get('providerId') as ASRProviderId | null;
    const modelId = formData.get('modelId') as string | null;
    const language = formData.get('language') as string | null;
    const apiKey = formData.get('apiKey') as string | null;
    const baseUrl = formData.get('baseUrl') as string | null;

    if (!audioFile) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Audio file is required');
    }

    // providerId is required from the client — no server-side store to fall back to
    const effectiveProviderId = providerId || ('openai-whisper' as ASRProviderId);
    resolvedProviderId = effectiveProviderId;
    resolvedModelId = modelId ?? undefined;

    // Reject oversized recordings before forwarding to the ASR provider —
    // Whisper-compatible endpoints reject >25MB anyway, and a huge upload
    // would waste upstream bandwidth + tie up the request.
    if (audioFile.size > MAX_AUDIO_FILE_SIZE_BYTES) {
      return apiError(
        'INVALID_REQUEST',
        413,
        `Audio file is too large. Maximum size is ${Math.floor(
          MAX_AUDIO_FILE_SIZE_BYTES / 1024 / 1024,
        )}MB.`,
      );
    }

    // Managed providers are admin-owned: ignore any client-sent key/baseUrl.
    const managed = isServerConfiguredProvider('asr', effectiveProviderId);
    const clientBaseUrl = managed ? undefined : baseUrl || undefined;
    if (clientBaseUrl) {
      const ssrfError = await validateUrlForSSRF(clientBaseUrl);
      if (ssrfError) {
        return apiError('INVALID_URL', 403, ssrfError);
      }
    }

    const config = {
      providerId: effectiveProviderId,
      modelId: modelId || undefined,
      language: language || 'auto',
      apiKey: resolveASRApiKey(effectiveProviderId, managed ? undefined : apiKey || undefined),
      baseUrl: resolveASRBaseUrl(effectiveProviderId, clientBaseUrl),
    };

    // Transcribe using the provider system
    const result = await transcribeAudio(config, audioFile);

    return apiSuccess({ text: result.text });
  } catch (error) {
    log.error(
      `Transcription failed [provider=${resolvedProviderId ?? 'unknown'}, model=${resolvedModelId ?? 'default'}]:`,
      error,
    );
    return apiError(
      'TRANSCRIPTION_FAILED',
      500,
      'Transcription failed',
      sanitizedErrorDetails(error),
    );
  }
}
