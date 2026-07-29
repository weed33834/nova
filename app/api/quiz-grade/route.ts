/**
 * Quiz Grading API
 *
 * POST: Receives a text question + user answer, calls LLM for scoring and feedback.
 * Used for short-answer (text) questions that cannot be graded locally.
 */

import { NextRequest } from 'next/server';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { withApiHandler } from '@/lib/server/api-handler';
const log = createLogger('Quiz Grade');

// Single LLM grading turn — pin an explicit ceiling so a slow model isn't
// killed by the platform default on Vercel.
export const maxDuration = 60;

interface GradeRequest {
  question: string;
  userAnswer: string;
  points: number;
  commentPrompt?: string;
  language?: string;
}

interface GradeResponse {
  score: number;
  comment: string;
}

export const POST = withApiHandler(async (req: NextRequest) => {
  let questionSnippet: string | undefined;
  let resolvedPoints: number | undefined;
  try {
    const body = (await req.json()) as GradeRequest;
    const { question, userAnswer, points, commentPrompt, language } = body;
    questionSnippet = question?.substring(0, 60);
    resolvedPoints = points;

    if (!question || !userAnswer) {
      return apiError('MISSING_REQUIRED_FIELD', 400, 'question and userAnswer are required');
    }

    // Validate points is a positive finite number
    if (!points || !Number.isFinite(points) || points <= 0) {
      return apiError('INVALID_REQUEST', 400, 'points must be a positive number');
    }

    // Resolve model from request headers/body
    const { model: languageModel, thinkingConfig } = await resolveModelFromRequest(
      req,
      body,
      'quiz-grade',
    );

    const isZh = language === 'zh-CN';

    const systemPrompt = isZh
      ? `你是一位专业的教育评估专家。请根据题目和学生答案进行评分并给出简短评语。
必须以如下 JSON 格式回复（不要包含其他内容）：
{"score": <0到${points}的整数>, "comment": "<一两句评语>"}`
      : `You are a professional educational assessor. Grade the student's answer and provide brief feedback.
You must reply in the following JSON format only (no other content):
{"score": <integer from 0 to ${points}>, "comment": "<one or two sentences of feedback>"}`;

    const userPrompt = isZh
      ? `题目：${question}
满分：${points}分
${commentPrompt ? `评分要点：${commentPrompt}\n` : ''}学生答案：${userAnswer}`
      : `Question: ${question}
Full marks: ${points} points
${commentPrompt ? `Grading guidance: ${commentPrompt}\n` : ''}Student answer: ${userAnswer}`;

    const result = await callLLM(
      {
        model: languageModel,
        system: systemPrompt,
        prompt: userPrompt,
      },
      'quiz-grade',
      undefined,
      thinkingConfig,
    );

    // Parse the LLM response as JSON
    const text = result.text.trim();
    let gradeResult: GradeResponse;

    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      const parsed = JSON.parse(jsonMatch[0]);
      const parsedScore = Number(parsed.score);
      gradeResult = {
        score: Number.isFinite(parsedScore)
          ? Math.max(0, Math.min(points, Math.round(parsedScore)))
          : 0,
        comment: String(parsed.comment || ''),
      };
    } catch {
      // Fallback: give 0 points — do NOT inflate scores with partial credit
      gradeResult = {
        score: 0,
        comment: isZh
          ? '答案解析失败，请重新作答。'
          : 'Answer parsing failed. Please try again.',
      };
    }

    return apiSuccess({ ...gradeResult });
  } catch (error) {
    log.error(
      `Quiz grading failed [question="${questionSnippet ?? 'unknown'}...", points=${resolvedPoints ?? 'unknown'}]:`,
      error,
    );
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to grade the answer. Please try again.',
      sanitizedErrorDetails(error),
    );
  }
}, { rateLimit: 'moderate' });
