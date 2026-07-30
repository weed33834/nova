/**
 * In-Memory Vector Store for RAG
 *
 * A lightweight, dependency-free vector store that holds document embeddings
 * in process memory and performs brute-force cosine-similarity search. It is
 * intentionally simple — no external database, no persistence — and is intended
 * for development, prototyping, and moderate-scale in-process RAG.
 *
 * The store is a process-wide singleton (via `globalThis`, mirroring the MCP
 * client manager pattern) so indexed documents survive across requests in
 * standalone Next.js and are not lost on dev hot-reloads.
 *
 * Server-only: embeddings are large float vectors and must never ship to the
 * browser.
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('RAGVectorStore');

/** A single indexed document with its embedding vector. */
export interface VectorEntry {
  id: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

/** A search hit returned by `search()`. */
export interface SearchResult {
  id: string;
  content: string;
  /** Cosine similarity in [-1, 1]; higher is more similar. */
  score: number;
  metadata?: Record<string, unknown>;
}

/** Default number of results to return when `topK` is omitted. */
const DEFAULT_TOP_K = 5;

/**
 * Compute the cosine similarity between two vectors.
 *
 * Returns 0 for zero-length or zero-norm vectors (instead of NaN) so degenerate
 * inputs never pollute search rankings. Vectors of differing lengths are
 * compared over their common prefix.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < len; i++) {
    const ai = a[i];
    const bi = b[i];
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

/**
 * In-memory vector store supporting add/search/clear/size.
 *
 * Entries are keyed by `id` so re-indexing the same id replaces the prior
 * entry, keeping the store free of stale duplicates.
 */
export class InMemoryVectorStore {
  private entries = new Map<string, VectorEntry>();

  /**
   * Add (or replace) entries. An entry whose id already exists overwrites the
   * previous one. Invalid entries (missing id or non-array embedding) are
   * skipped with a warning rather than throwing.
   */
  add(entries: VectorEntry[]): void {
    for (const entry of entries) {
      if (!entry?.id || !Array.isArray(entry.embedding)) {
        log.warn('Skipping invalid vector entry (missing id or embedding)');
        continue;
      }
      this.entries.set(entry.id, entry);
    }
  }

  /**
   * Return the top-K entries most similar to `query` (cosine similarity),
   * sorted by descending score. Returns `[]` when the store is empty or the
   * query is empty.
   */
  search(query: number[], topK: number = DEFAULT_TOP_K): SearchResult[] {
    if (this.entries.size === 0 || !Array.isArray(query) || query.length === 0) {
      return [];
    }

    const k = Math.max(1, Math.floor(topK));

    const scored: SearchResult[] = [];
    for (const entry of this.entries.values()) {
      scored.push({
        id: entry.id,
        content: entry.content,
        score: cosineSimilarity(query, entry.embedding),
        metadata: entry.metadata,
      });
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  /** Remove all entries. */
  clear(): void {
    this.entries.clear();
  }

  /** Current number of stored entries. */
  size(): number {
    return this.entries.size;
  }

  /** Retrieve a single entry by id (returns undefined if not present). */
  get(id: string): VectorEntry | undefined {
    return this.entries.get(id);
  }
}

// ─── Process-wide singleton ───────────────────────────────────────────────────
//
// `globalThis` guard: in dev, hot reload re-evaluates this module; without the
// guard each reload would create a fresh (empty) store and silently lose all
// indexed documents. In standalone Next.js, a single instance survives across
// requests.

const GLOBAL_KEY = '__NOVA_RAG_VECTOR_STORE__';

function getGlobal(): typeof globalThis & Record<string, unknown> {
  return globalThis as typeof globalThis & Record<string, unknown>;
}

/** Access the process-wide singleton vector store. */
export function getVectorStore(): InMemoryVectorStore {
  const g = getGlobal();
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new InMemoryVectorStore();
  }
  return g[GLOBAL_KEY] as InMemoryVectorStore;
}
