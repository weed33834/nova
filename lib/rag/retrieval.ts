/**
 * RAG Retrieval Pipeline
 *
 * Bridges the embedding provider and the in-memory vector store, exposing a
 * high-level index/retrieve API:
 *  - `indexDocument` / `indexDocuments` — generate embeddings and store them
 *  - `retrieve` — run a semantic search against the store
 *  - `retrieveContext` — return a ready-to-inject context string for prompt
 *    augmentation
 *
 * Server-only.
 */
import { generateEmbedding, generateEmbeddings } from './embeddings';
import { getVectorStore, type SearchResult, type VectorEntry } from './vector-store';
import { createLogger } from '@/lib/logger';

const log = createLogger('RAGRetrieval');

/** Document accepted by the indexing helpers. */
export interface IndexableDocument {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
}

/** Default number of chunks to retrieve when `topK` is omitted. */
const DEFAULT_TOP_K = 5;

/**
 * Index a single document: generate its embedding and store it. Re-indexing an
 * existing id replaces the prior entry.
 *
 * @throws if `id` is empty, `content` is empty, or embedding generation fails.
 */
export async function indexDocument(
  id: string,
  content: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  if (!id) {
    throw new Error('indexDocument: id is required');
  }
  if (!content || !content.trim()) {
    throw new Error('indexDocument: content is required');
  }

  const embedding = await generateEmbedding(content);
  const entry: VectorEntry = { id, content, embedding, metadata };
  getVectorStore().add([entry]);
  log.debug(`indexed document "${id}"`);
}

/**
 * Index many documents in a single batched embedding call. Re-indexing an
 * existing id replaces the prior entry. Documents with empty content (or no id)
 * are skipped with a warning rather than aborting the whole batch.
 */
export async function indexDocuments(docs: IndexableDocument[]): Promise<void> {
  if (!docs || docs.length === 0) return;

  const valid = docs.filter((d) => {
    if (!d?.id) {
      log.warn('indexDocuments: skipping document without id');
      return false;
    }
    if (!d.content || !d.content.trim()) {
      log.warn(`indexDocuments: skipping document "${d.id}" with empty content`);
      return false;
    }
    return true;
  });

  if (valid.length === 0) return;

  const embeddings = await generateEmbeddings(valid.map((d) => d.content));

  const entries: VectorEntry[] = valid.map((d, i) => ({
    id: d.id,
    content: d.content,
    embedding: embeddings[i],
    metadata: d.metadata,
  }));

  getVectorStore().add(entries);
  log.debug(`indexed ${entries.length} document(s)`);
}

/**
 * Retrieve the top-K documents semantically similar to `query`. Returns `[]`
 * for an empty query.
 */
export async function retrieve(
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<SearchResult[]> {
  if (!query || !query.trim()) {
    return [];
  }

  const queryEmbedding = await generateEmbedding(query);
  return getVectorStore().search(queryEmbedding, topK);
}

/**
 * Retrieve relevant context and return it as a single concatenated string
 * suitable for injection into an LLM prompt.
 *
 * Each hit is rendered as a numbered block; entries whose metadata contains a
 * `source` string are annotated with it. Returns an empty string when nothing
 * is found so the caller can safely concatenate it into a prompt template.
 */
export async function retrieveContext(
  query: string,
  topK: number = DEFAULT_TOP_K,
): Promise<string> {
  const results = await retrieve(query, topK);
  if (results.length === 0) return '';

  const blocks = results.map((r, i) => {
    const source =
      r.metadata && typeof r.metadata.source === 'string'
        ? ` (source: ${r.metadata.source})`
        : '';
    return `[${i + 1}]${source}\n${r.content}`;
  });

  return blocks.join('\n\n');
}
