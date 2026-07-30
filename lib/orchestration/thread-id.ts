/**
 * Thread ID management for LangGraph checkpointing.
 *
 * A LangGraph `thread_id` — passed at invocation as
 * `config.configurable.thread_id` — is the key under which a checkpointer
 * stores state. Two usage modes are supported:
 *
 *   - {@link createThreadId} — a fresh random thread_id per request. This is
 *     what the orchestration graph currently uses: each run is independent, so
 *     the checkpointer snapshots in-flight state without interfering with the
 *     client-driven, stateless request model.
 *   - {@link getThreadId} — a deterministic thread_id derived from a session
 *     id, intended for per-session *resumption* (reloading a checkpoint across
 *     requests of one conversation). NOT used at the invocation site today:
 *     nova's client re-sends the full accumulated `directorState` every
 *     request while `agentResponses` / `whiteboardLedger` use append reducers,
 *     so reusing a thread_id would double-accumulate against the prior
 *     checkpoint. It becomes safe once state moves server-side and the client
 *     sends only incremental updates.
 */

import { randomUUID } from 'node:crypto';

const THREAD_PREFIX = 'nova-session';

/**
 * FNV-1a (32-bit) over `input`, seeded with `seed`.
 *
 * Pure JS — no `node:crypto` dependency — so it is safe in any runtime. Used
 * only to fold a session id down into a fixed-width, URL-safe thread id.
 */
function fnv1a32(input: string, seed: number): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Derive a deterministic thread_id from a session id.
 *
 * The same session id always maps to the same thread_id, so callers can
 * recompute it on every request (e.g. from the first message id) without
 * storing it. Two independent FNV-1a passes — the second folds in the input
 * length — widen the output to ~64 bits, making collisions negligible for
 * practical session counts.
 *
 * Reserved for per-session resumption; see the module doc for why the
 * invocation site currently uses {@link createThreadId} instead. Returns a
 * random thread_id (via {@link createThreadId}) when `sessionId` is empty, so
 * empty sessions do not all collapse onto one shared checkpoint.
 */
export function getThreadId(sessionId: string): string {
  if (!sessionId) return createThreadId();
  const a = fnv1a32(sessionId, 0x811c9dc5).toString(36).padStart(7, '0');
  const b = fnv1a32(`${sessionId}:${sessionId.length}`, 0x84222325)
    .toString(36)
    .padStart(7, '0');
  return `${THREAD_PREFIX}-${a}${b}`;
}

/**
 * Mint a new random thread_id for a one-off run.
 *
 * Uses `node:crypto.randomUUID()` for a collision-resistant id (this module is
 * server-side only — the orchestration layer never runs in the browser).
 */
export function createThreadId(): string {
  return `${THREAD_PREFIX}-${randomUUID()}`;
}
