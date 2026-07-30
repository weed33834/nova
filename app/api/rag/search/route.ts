/**
 * RAG search endpoint.
 *
 * POST /api/rag/search  { query: string, topK?: number }
 *
 * Generates an embedding for the query and returns the top-K semantically
 * similar indexed documents. The embedding vectors themselves are never
 * returned — only id, content, score, and metadata.
 */
import type { NextRequest } from 'next/server';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { retrieve } from '@/lib/rag/retrieval';

// Embedding generation is a single upstream call; cap well under the platform
// default so an unreachable endpoint can't stall the route.
export const maxDuration = 30;

interface SearchBody {
  query: string;
  topK?: number;
}

export const POST = withApiHandler(async (req: NextRequest) => {
  let body: SearchBody;
  try {
    body = (await req.json()) as SearchBody;
  } catch {
    return apiError('INVALID_REQUEST', 400, 'Invalid JSON body');
  }

  if (!body.query || typeof body.query !== 'string' || !body.query.trim()) {
    return apiError('MISSING_REQUIRED_FIELD', 400, 'query is required');
  }

  const topK =
    typeof body.topK === 'number' && Number.isFinite(body.topK) && body.topK > 0
      ? Math.floor(body.topK)
      : undefined;

  const results = await retrieve(body.query, topK);

  return apiSuccess({ results, count: results.length });
}, { rateLimit: 'moderate' });
