import { after, type NextRequest } from 'next/server';
import { nanoid } from 'nanoid';
import { getServerSession } from 'next-auth';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { type GenerateClassroomInput } from '@/lib/server/classroom-generation';
import { runClassroomGenerationJob } from '@/lib/server/classroom-job-runner';
import { createClassroomGenerationJob } from '@/lib/server/classroom-job-store';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { createLogger } from '@/lib/logger';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { moderateContent } from '@/lib/server/content-moderation';
import { authOptions } from '@/lib/auth/config';

const log = createLogger('GenerateClassroom API');

export const maxDuration = 300;

export const POST = withApiHandler(async (req: NextRequest) => {
  let requirementSnippet: string | undefined;
  try {
    const rawBody = (await req.json()) as Partial<GenerateClassroomInput>;
    requirementSnippet = rawBody.requirement?.substring(0, 60);
    const body: GenerateClassroomInput = {
      requirement: rawBody.requirement || '',
      ...(rawBody.pdfContent ? { pdfContent: rawBody.pdfContent } : {}),

      ...(rawBody.enableWebSearch != null ? { enableWebSearch: rawBody.enableWebSearch } : {}),
      ...(rawBody.webSearchProviderId ? { webSearchProviderId: rawBody.webSearchProviderId } : {}),
      ...(rawBody.webSearchApiKey ? { webSearchApiKey: rawBody.webSearchApiKey } : {}),
      ...(rawBody.baiduSubSources ? { baiduSubSources: rawBody.baiduSubSources } : {}),
      ...(rawBody.enableImageGeneration != null
        ? { enableImageGeneration: rawBody.enableImageGeneration }
        : {}),
      ...(rawBody.enableVideoGeneration != null
        ? { enableVideoGeneration: rawBody.enableVideoGeneration }
        : {}),
      ...(rawBody.enableTTS != null ? { enableTTS: rawBody.enableTTS } : {}),
      ...(rawBody.agentMode ? { agentMode: rawBody.agentMode } : {}),
      ...(rawBody.guardrailsBlocking
        ? { guardrailsBlocking: rawBody.guardrailsBlocking }
        : {}),
    };
    const { requirement } = body;

    if (!requirement) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'Missing required field: requirement');
    }

    // ── Content moderation: reject unsafe input before generation ──────────
    const moderation = await moderateContent(requirement);
    if (moderation.flagged) {
      const flaggedCategories = Object.entries(moderation.categories)
        .filter(([, v]) => v)
        .map(([k]) => k)
        .join(', ');
      log.warn(`Content moderation blocked input [categories=${flaggedCategories}]`);
      return apiError(
        'INVALID_REQUEST',
        400,
        'Content moderation check failed',
        `Input flagged for: ${flaggedCategories}`,
      );
    }

    const baseUrl = buildRequestOrigin(req);

    // Record owner when user is authenticated (optional — no auth = anonymous)
    let ownerId: string | null = null;
    try {
      const session = await getServerSession(authOptions);
      ownerId = (session?.user as { id?: string } | undefined)?.id ?? null;
    } catch {
      // Auth not configured — generation is anonymous
    }

    const jobBody: GenerateClassroomInput = { ...body, ownerId };
    const jobId = nanoid(10);
    const job = await createClassroomGenerationJob(jobId, jobBody);
    const pollUrl = `${baseUrl}/api/generate-classroom/${jobId}`;

    after(() => runClassroomGenerationJob(jobId, jobBody, baseUrl));

    return apiSuccess(
      {
        jobId,
        status: job.status,
        step: job.step,
        message: job.message,
        pollUrl,
        pollIntervalMs: 5000,
      },
      202,
    );
  } catch (error) {
    log.error(
      `Classroom generation job creation failed [requirement="${requirementSnippet ?? 'unknown'}..."]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to create classroom generation job',
      sanitizedErrorDetails(error),
    );
  }
}, { rateLimit: 'generation' });
