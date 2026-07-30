/**
 * RAG Embedding Provider
 *
 * Generates text embeddings via the Vercel AI SDK (`embed` / `embedMany`) using
 * an OpenAI-compatible embedding model. Mirrors the provider configuration
 * pattern from `lib/ai/providers.ts` — `createOpenAI({ apiKey, baseURL })` —
 * but is purpose-built for embeddings and driven by dedicated env vars so the
 * embedding endpoint can target a separate account/key from the chat models.
 *
 * Server-only: embedding generation performs outbound network calls and reads
 * a secret API key.
 */
import { embed, embedMany } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import type { EmbeddingModel } from 'ai';
import { createLogger } from '@/lib/logger';

const log = createLogger('RAGEmbeddings');

/** Default embedding model id (OpenAI's small, cost-effective model). */
const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Default OpenAI embeddings base URL. */
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export interface EmbeddingProviderConfig {
  model: string;
  apiKey: string;
  baseURL: string | undefined;
}

/**
 * Resolve the embedding provider configuration from environment variables.
 *
 * Env vars (all optional, with sensible fallbacks):
 *  - EMBEDDING_MODEL    — embedding model id (default: text-embedding-3-small)
 *  - EMBEDDING_API_KEY  — API key for the embedding endpoint. Falls back to
 *                         OPENAI_API_KEY so a single key works out of the box.
 *  - EMBEDDING_BASE_URL — OpenAI-compatible base URL. Falls back to
 *                         OPENAI_BASE_URL, then the OpenAI default.
 */
export function resolveEmbeddingConfig(): EmbeddingProviderConfig {
  return {
    model: process.env.EMBEDDING_MODEL || DEFAULT_EMBEDDING_MODEL,
    apiKey: process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '',
    baseURL:
      process.env.EMBEDDING_BASE_URL || process.env.OPENAI_BASE_URL || DEFAULT_OPENAI_BASE_URL,
  };
}

// Memoized provider: recreated only when credentials/model change so repeated
// embedding calls don't re-instantiate the OpenAI client.
let cachedModel: EmbeddingModel | null = null;
let cachedKey = '';

/**
 * Build (and memoize) an embedding model instance from the resolved config.
 *
 * @throws if no API key is configured.
 */
function getEmbeddingModel(): EmbeddingModel {
  const config = resolveEmbeddingConfig();
  if (!config.apiKey) {
    throw new Error(
      'No embedding API key configured. Set EMBEDDING_API_KEY (or OPENAI_API_KEY) to enable RAG embeddings.',
    );
  }

  const cacheKey = `${config.apiKey}:${config.baseURL ?? ''}:${config.model}`;
  if (cachedModel && cachedKey === cacheKey) {
    return cachedModel;
  }

  const openai = createOpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseURL,
  });
  cachedModel = openai.embedding(config.model);
  cachedKey = cacheKey;
  log.debug(`initialized embedding model "${config.model}"`);
  return cachedModel;
}

/**
 * Normalize an AI SDK `Embedding` (which may be a `number[]` or a
 * `Float32Array` depending on the provider) into a plain `number[]` for
 * storage and similarity math.
 */
function toNumberArray(embedding: ArrayLike<number> | readonly number[]): number[] {
  return Array.from(embedding);
}

/**
 * Generate an embedding vector for a single text input.
 *
 * @throws if `text` is empty/whitespace or no API key is configured.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const trimmed = (text ?? '').trim();
  if (!trimmed) {
    throw new Error('Cannot generate embedding for empty text');
  }

  const model = getEmbeddingModel();
  const { embedding } = await embed({ model, value: trimmed });
  return toNumberArray(embedding);
}

/**
 * Generate embedding vectors for a batch of text inputs in a single
 * `embedMany` call. Result order matches the input order.
 *
 * An empty input array returns `[]`. Like `generateEmbedding`, any empty /
 * whitespace-only input is rejected (fail-fast) rather than silently dropped,
 * so callers always know exactly which texts were embedded.
 *
 * @throws if any input is empty or no API key is configured.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const values = texts.map((t) => (t ?? '').trim());
  if (values.some((t) => t.length === 0)) {
    throw new Error('Cannot generate embeddings: input contains empty text');
  }

  const model = getEmbeddingModel();
  const { embeddings } = await embedMany({ model, values });
  return embeddings.map((e) => toNumberArray(e));
}

/** Reset the memoized provider — exposed for tests that swap env vars. */
export function _resetEmbeddingModelCache(): void {
  cachedModel = null;
  cachedKey = '';
}
