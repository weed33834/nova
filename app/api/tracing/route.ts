import { NextRequest, NextResponse } from 'next/server';
import { KnowledgeTracer } from '@/lib/tracing/engine';
import type { TraceEntry } from '@/lib/tracing/types';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { z } from 'zod';
import { validateBody } from '@/lib/server/validate';

const tracer = new KnowledgeTracer();

const RequestSchema = z.object({
  action: z.enum(['record', 'get', 'snapshot', 'predict']),
  studentId: z.string().min(1),
  conceptId: z.string().optional(),
  entry: z.unknown().optional(),
  allConceptIds: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validateBody(RequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const { action, studentId, conceptId, entry, allConceptIds } = parsed.data as {
      action: 'record' | 'get' | 'snapshot' | 'predict';
      studentId: string;
      conceptId?: string;
      entry?: TraceEntry;
      allConceptIds?: string[];
    };

    if (!studentId) {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Missing required field: studentId',
      );
    }

    switch (action) {
      case 'record': {
        if (!conceptId || !entry) {
          return apiError(
            API_ERROR_CODES.MISSING_REQUIRED_FIELD,
            400,
            'record requires conceptId and entry',
          );
        }
        const trace = tracer.recordObservation(studentId, conceptId, entry);
        return NextResponse.json({ trace });
      }
      case 'get': {
        if (!conceptId) {
          return apiError(API_ERROR_CODES.MISSING_REQUIRED_FIELD, 400, 'get requires conceptId');
        }
        const trace = tracer.getTrace(studentId, conceptId);
        return NextResponse.json({ trace });
      }
      case 'snapshot': {
        const snapshot = tracer.getSnapshot(studentId, allConceptIds ?? []);
        return NextResponse.json({ snapshot });
      }
      case 'predict': {
        if (!conceptId) {
          return apiError(
            API_ERROR_CODES.MISSING_REQUIRED_FIELD,
            400,
            'predict requires conceptId',
          );
        }
        const prediction = tracer.predictPerformance(studentId, conceptId);
        return NextResponse.json({ prediction });
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
