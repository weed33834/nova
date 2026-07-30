/**
 * RAG index endpoint.
 *
 * POST /api/rag/index  { documents: { id, content, metadata? }[] }
 *
 * Generates embeddings for the supplied documents and stores them in the
 * in-memory vector store. Re-indexing an existing id replaces the prior entry.
 */
import type { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { indexDocuments } from '@/lib/rag/retrieval';

// Batched embedding may take longer than a single query; allow a bit more room.
export const maxDuration = 60;

interface IndexBody {
  documents: {
    id: string;
    content: string;
    metadata?: Record<string, unknown>;
  }[];
}

export const POST = withApiHandler(async (req: NextRequest) => {
  let body: IndexBody;
  try {
    body = (await req.json()) as IndexBody;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  if (!Array.isArray(body.documents)) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'documents array is required');
  }
  if (body.documents.length === 0) {
    return apiError('INVALID_REQUEST', 400, 'documents array must not be empty');
  }

  // Validate up front so a malformed payload fails before any embedding cost.
  for (const doc of body.documents) {
    if (!doc || typeof doc.id !== 'string' || !doc.id) {
      return apiError('INVALID_REQUEST', 400, 'each document must have a non-empty id');
    }
    if (typeof doc.content !== 'string' || !doc.content.trim()) {
      return apiError(
        'INVALID_REQUEST',
        400,
        `document "${doc.id}" must have non-empty content`,
      );
    }
  }

  await indexDocuments(body.documents);

  return apiSuccess({ indexed: body.documents.length });
}, { rateLimit: 'moderate' });
