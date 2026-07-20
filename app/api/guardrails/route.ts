import { NextRequest, NextResponse } from 'next/server';
import { runAllGuardrails } from '@/lib/guardrails/content-safety';
import type { ContentSafetyConfig, HallucinationConfig } from '@/lib/guardrails/types';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { z } from 'zod';
import { validateBody } from '@/lib/server/validate';

const RequestSchema = z.object({
  content: z.string().min(1),
  sourceContent: z.string().optional(),
  safetyConfig: z.unknown().optional(),
  hallucinationConfig: z.unknown().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validateBody(RequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const { content, sourceContent, safetyConfig, hallucinationConfig } = parsed.data as {
      content: string;
      sourceContent?: string;
      safetyConfig?: ContentSafetyConfig;
      hallucinationConfig?: HallucinationConfig;
    };

    if (!content) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required field: content',
      );
    }

    const report = runAllGuardrails(content, safetyConfig, hallucinationConfig);
    return NextResponse.json(report);
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
