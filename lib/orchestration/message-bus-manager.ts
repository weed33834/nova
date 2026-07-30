/**
 * Session-scoped message bus manager.
 *
 * Each classroom session gets its own `AgentMessageBus` instance. This module
 * owns the `Map<sessionId, AgentMessageBus>` and is responsible for:
 *  - Lazily creating a bus on first access for a session.
 *  - Removing a bus when the session ends (explicit teardown).
 *  - Periodically evicting stale sessions that were never torn down (safety
 *    net against leaked memory from abandoned sessions).
 *
 * The `Map` is stored on `globalThis` so it survives Next.js dev hot-reloads
 * (mirroring the pattern in `lib/orchestration/checkpointer.ts` and
 * `lib/mcp/client-manager.ts`). Without this guard, every hot reload would
 * create a fresh Map and orphan the buses accumulated for in-flight sessions.
 */
import { createLogger } from '@/lib/logger';
import { AgentMessageBus } from './agent-messaging';

const log = createLogger('MessageBusManager');

// ─── Process-wide singleton ─────────────────────────────────────────────────

const GLOBAL_KEY = '__NOVA_AGENT_MESSAGE_BUSES__';

/** A bus entry tracks the bus instance and the last time it was touched. */
interface BusEntry {
  bus: AgentMessageBus;
  /** Epoch ms of the most recent access (used by the stale-session sweep). */
  lastAccess: number;
}

function getGlobal(): typeof globalThis & Record<string, unknown> {
  return globalThis as typeof globalThis & Record<string, unknown>;
}

/**
 * The session→bus map, stored on `globalThis` for hot-reload survival.
 * Each value is a `BusEntry` wrapping the bus and its last-access timestamp.
 */
function getBusMap(): Map<string, BusEntry> {
  const g = getGlobal();
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new Map<string, BusEntry>();
  }
  return g[GLOBAL_KEY] as Map<string, BusEntry>;
}

// ─── Stale-session cleanup ──────────────────────────────────────────────────

/** A session is considered stale if its bus hasn't been touched this long. */
const STALE_SESSION_MS = 30 * 60 * 1000; // 30 minutes

/** How often the background sweep runs. */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/** Whether the periodic cleanup timer has been registered. */
let cleanupTimerRegistered = false;

/**
 * Remove bus entries whose `lastAccess` is older than `STALE_SESSION_MS`.
 *
 * This is both called lazily (on every `getMessageBus`) and by a background
 * interval. The lazy call keeps things tidy even if the interval hasn't fired
 * (e.g. in a serverless function where the interval may not persist), while
 * the interval handles the common long-running-server case.
 */
function sweepStaleSessions(): void {
  const map = getBusMap();
  const now = Date.now();
  let removed = 0;

  for (const [sessionId, entry] of map.entries()) {
    if (now - entry.lastAccess > STALE_SESSION_MS) {
      map.delete(sessionId);
      removed++;
    }
  }

  if (removed > 0) {
    log.info('Swept stale message buses', { removed, remaining: map.size });
  }
}

/**
 * Register the periodic cleanup interval (once per process).
 *
 * The interval is only set up the first time a bus is created; on a fresh
 * process there is nothing to clean. We guard with `cleanupTimerRegistered`
 * (module-level, not on globalThis) because registering two intervals on the
 * same process would be harmless but wasteful, and a hot reload produces a
 * fresh module scope anyway.
 */
function ensureCleanupInterval(): void {
  if (cleanupTimerRegistered) return;
  if (typeof setInterval === 'undefined') return; // edge runtime safety

  cleanupTimerRegistered = true;
  setInterval(() => {
    try {
      sweepStaleSessions();
    } catch (err) {
      log.error('Error during message-bus cleanup sweep', err);
    }
  }, CLEANUP_INTERVAL_MS).unref?.(); // don't keep the process alive for this

  log.debug('Registered periodic message-bus cleanup interval', {
    intervalMs: CLEANUP_INTERVAL_MS,
  });
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get (or lazily create) the `AgentMessageBus` for a session.
 *
 * Always returns the same bus instance for a given `sessionId` within a
 * process. Each access bumps the bus's `lastAccess` timestamp so it is not
 * swept by the stale-session cleanup.
 *
 * @param sessionId - The classroom session ID.
 * @returns the per-session `AgentMessageBus`.
 */
export function getMessageBus(sessionId: string): AgentMessageBus {
  const map = getBusMap();

  // Lazy cleanup: opportunistically sweep on each access. Cheap when the map
  // is small, and keeps stale sessions bounded even without the interval.
  sweepStaleSessions();

  let entry = map.get(sessionId);
  if (!entry) {
    entry = {
      bus: new AgentMessageBus(sessionId),
      lastAccess: Date.now(),
    };
    map.set(sessionId, entry);
    log.info('Created message bus for session', { sessionId, total: map.size });

    ensureCleanupInterval();
  } else {
    entry.lastAccess = Date.now();
  }

  return entry.bus;
}

/**
 * Remove the message bus for a session.
 *
 * Call this when a classroom session ends to free the bus and its message
 * history. Safe to call even if no bus exists for the session (no-op).
 *
 * @param sessionId - The classroom session ID.
 */
export function removeMessageBus(sessionId: string): void {
  const map = getBusMap();
  if (map.delete(sessionId)) {
    log.info('Removed message bus for session', { sessionId, total: map.size });
  }
}

/**
 * Get the number of active message buses (for diagnostics / health checks).
 */
export function getActiveBusCount(): number {
  return getBusMap().size;
}
