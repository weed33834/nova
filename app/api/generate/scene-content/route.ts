/**
 * Scene Content Generation API
 *
 * Generates scene content (slides/quiz/interactive/pbl) from an outline.
 * This is the first half of the two-step scene generation pipeline.
 * Does NOT generate actions — use /api/generate/scene-actions for that.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import {
  applyOutlineFallbacks,
  generateSceneContent,
  buildVisionUserContent,
} from '@/lib/generation/generation-pipeline';
import type { AgentInfo } from '@/lib/generation/generation-pipeline';
import type {
  SceneOutline,
  PdfImage,
  ImageMapping,
  UserRequirements,
} from '@/lib/types/generation';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { llmApiError } from '@/lib/server/llm-error-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { resolveVocationalActive } from '@/lib/config/feature-flags';
import { sortDocumentImagesForVision } from '@/lib/document/bundle';
import { checkGeneratedText } from '@/lib/guardrails/pipeline-check';
import { GuardrailBlockError } from '@/lib/guardrails/types';
import { withApiHandler } from '@/lib/server/api-handler';

const log = createLogger('Scene Content API');

export const maxDuration = 300;

export const POST = withApiHandler(async (req: NextRequest) => {
  let outlineTitle: string | undefined;
  let resolvedModelString: string | undefined;
  try {
    const body = await req.json();
    const {
      outline: rawOutline,
      allOutlines,
      pdfImages,
      imageMapping,
      stageInfo: _stageInfo,
      stageId,
      agents,
      languageDirective,
      requirements,
    } = body as {
      outline: SceneOutline;
      allOutlines: SceneOutline[];
      pdfImages?: PdfImage[];
      imageMapping?: ImageMapping;
      stageInfo: {
        name: string;
        description?: string;
        style?: string;
      };
      stageId: string;
      agents?: AgentInfo[];
      languageDirective?: string;
      requirements?: UserRequirements;
    };

    // Validate required fields
    if (!rawOutline) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'outline is required');
    }
    if (!allOutlines || allOutlines.length === 0) {
      return apiError(
        'MISSING_REQUIRED_FIELD',
        400,
        'allOutlines is required and must not be empty',
      );
    }
    if (!stageId) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'stageId is required');
    }

    const outline: SceneOutline = { ...rawOutline };

    // ── Model resolution from request headers/body ──
    // Route per scene-content type (e.g. `scene-content:quiz`); getStageModel
    // falls back to the base `scene-content` route when the type is unrouted.
    const stage = outline.type ? (`scene-content:${outline.type}` as const) : 'scene-content';
    const {
      model: languageModel,
      modelInfo,
      modelString,
      thinkingConfig,
    } = await resolveModelFromRequest(req, body, stage);
    outlineTitle = rawOutline?.title;
    resolvedModelString = modelString;

    // Detect vision capability
    const hasVision = !!modelInfo?.capabilities?.vision;

    // Vision-aware AI call function
    const aiCall = async (
      systemPrompt: string,
      userPrompt: string,
      images?: Array<{ id: string; src: string }>,
    ): Promise<string> => {
      if (images?.length && hasVision) {
        const result = await callLLM(
          {
            model: languageModel,
            system: systemPrompt,
            messages: [
              {
                role: 'user' as const,
                content: buildVisionUserContent(userPrompt, images),
              },
            ],
            maxOutputTokens: modelInfo?.outputWindow,
            maxRetries: 0,
          },
          'scene-content',
          undefined,
          thinkingConfig,
        );
        return result.text;
      }
      const result = await callLLM(
        {
          model: languageModel,
          system: systemPrompt,
          prompt: userPrompt,
          maxOutputTokens: modelInfo?.outputWindow,
          maxRetries: 0,
        },
        'scene-content',
        undefined,
        thinkingConfig,
      );
      return result.text;
    };

    // ── Apply fallbacks ──
    const vocationalActive = resolveVocationalActive(requirements);
    const effectiveOutline = applyOutlineFallbacks(outline, !!languageModel, {
      allowProceduralSkill: vocationalActive,
    });
    // title 兜底：模型产出的部分 outline 可能缺 title（实测 scene-content 收到
    // undefined 标题直接 500，整门课程生成中断）。用 type/stageId 兜底，至少
    // 保证生成不因缺标题而中断。
    if (!effectiveOutline.title) {
      effectiveOutline.title =
        (effectiveOutline.type ? `场景-${effectiveOutline.type}` : '场景') + `-${stageId.slice(0, 6)}`;
    }
    // type 同样兜底：如果 type 缺失，生成逻辑无法选择正确的 prompt/fallback，
    // 统一降级为 slide（幻灯片场景是最基础的生成类型，容错性最高）。
    if (!effectiveOutline.type) {
      effectiveOutline.type = 'slide';
    }
    // image 类型兜底：image 场景需要图片生成 provider（server-providers.yml 需配置 image），
    // 若未配置或 LLM 不支持图片生成，降级为 slide 避免硬失败。
    // 用 (as string) 绕过 TS 收窄（SceneOutline.type 字面量不含 'image'，但运行时可能收到）。
    if ((effectiveOutline.type as string) === 'image') {
      effectiveOutline.type = 'slide';
    }

    // ── Filter images assigned to this outline ──
    let assignedImages: PdfImage[] | undefined;
    if (
      pdfImages &&
      pdfImages.length > 0 &&
      effectiveOutline.suggestedImageIds &&
      effectiveOutline.suggestedImageIds.length > 0
    ) {
      const suggestedIds = new Set(effectiveOutline.suggestedImageIds);
      assignedImages = sortDocumentImagesForVision(
        pdfImages.filter((img) => suggestedIds.has(img.id)),
      );
    }

    // ── Media generation is handled client-side in parallel (media-orchestrator.ts) ──
    // The content generator receives placeholder IDs (gen_img_1, gen_vid_1) as-is.
    // resolveImageIds() in generation-pipeline.ts will keep these placeholders in elements.
    const generatedMediaMapping: ImageMapping = {};

    // ── Generate content ──
    log.info(
      `Generating content: "${effectiveOutline.title}" (${effectiveOutline.type}) [model=${modelString}]`,
    );

    const userLocale = req.headers?.get('x-user-locale') ?? '';

    const content = await generateSceneContent(effectiveOutline, aiCall, {
      assignedImages,
      imageMapping,
      languageModel: effectiveOutline.type === 'pbl' ? languageModel : undefined,
      visionEnabled: hasVision,
      generatedMediaMapping,
      agents,
      languageDirective,
      thinkingConfig,
      targetLanguage: userLocale || undefined,
      userRequirements: requirements,
      allowProceduralSkill: vocationalActive,
    });

    if (!content) {
      log.error(`Failed to generate content for: "${effectiveOutline.title}"`);

      return apiError(
        'GENERATION_FAILED',
        500,
        `Failed to generate content: ${effectiveOutline.title}`,
      );
    }

    // ── Guardrails: post-generation content safety check ──
    try {
      checkGeneratedText(
        effectiveOutline.title,
        content,
        undefined,
        { enabled: true, minBlockSeverity: 'high' },
      );
    } catch (error) {
      if (error instanceof GuardrailBlockError) {
        log.error(`Content blocked by guardrails: "${effectiveOutline.title}"`);
        return apiError(
          'CONTENT_SENSITIVE',
          422,
          `Content blocked by safety guardrails: ${effectiveOutline.title}`,
        );
      }
      throw error;
    }

    log.info(`Content generated successfully: "${effectiveOutline.title}"`);

    return apiSuccess({ content, effectiveOutline });
  } catch (error) {
    log.error(
      `Scene content generation failed [scene="${outlineTitle ?? 'unknown'}", model=${resolvedModelString ?? 'unknown'}]:`,
      error,
    );
    return llmApiError(error);
  }
}, { rateLimit: 'generation' });
