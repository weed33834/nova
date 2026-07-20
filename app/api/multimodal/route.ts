import { NextRequest, NextResponse } from 'next/server';
import { MultimodalTutor } from '@/lib/multimodal/tutor';
import type { MultimodalRequest } from '@/lib/multimodal/types';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { z } from 'zod';
import { validateBody } from '@/lib/server/validate';

const tutor = new MultimodalTutor();

const RequestSchema = z.object({
  action: z.enum(['generate', 'next_response', 'create_session']),
  request: z.unknown().optional(),
  sessionId: z.string().optional(),
  understanding: z.number().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validateBody(RequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const {
      action,
      request: multimodalRequest,
      sessionId,
      understanding,
    } = parsed.data as {
      action: 'generate' | 'next_response' | 'create_session';
      request?: MultimodalRequest;
      sessionId?: string;
      understanding?: number;
    };

    switch (action) {
      case 'create_session': {
        if (!multimodalRequest) {
          return apiError(
            API_ERROR_CODES.MISSING_REQUIRED_FIELD,
            400,
            'create_session requires request',
          );
        }
        const session = tutor.createSession(
          multimodalRequest.conceptId,
          multimodalRequest.preferredModalities,
        );
        return NextResponse.json({ session });
      }
      case 'generate': {
        if (!multimodalRequest) {
          return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'generate requires request');
        }
        const content = tutor.generateAdaptiveContent(multimodalRequest);
        return NextResponse.json({ content });
      }
      case 'next_response': {
        if (!sessionId) {
          return apiError(
            API_ERROR_CODES.MISSING_REQUIRED_FIELD,
            400,
            'next_response requires sessionId',
          );
        }
        const response = tutor.getNextTutorResponse(sessionId, understanding);
        if (!response) {
          return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Session not found');
        }
        return NextResponse.json({ response });
      }
      default:
        return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, `Unknown action: ${action}`);
    }
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
