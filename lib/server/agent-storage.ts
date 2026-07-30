/**
 * Server-side persistence for custom agents.
 *
 * DB-backed (Drizzle/SQLite) storage mirroring the `skill-storage` API surface
 * (listCustomAgents / createCustomAgent / readCustomAgent / updateCustomAgent /
 * deleteCustomAgent) but backed by the `agents` table in `lib/db/schema.ts`
 * rather than flat files.
 *
 * Custom agents (persona, role, system prompt, voice, avatar, allowed actions)
 * were previously held only in browser localStorage/IndexedDB; this module gives
 * them server-side persistence so they survive across devices and can be
 * queried/audited like skills. The `allowedActions` string array is serialized
 * to/from the `allowed_actions_json` TEXT column, mirroring how skills store
 * their `parameters` array.
 */
import { eq, isNull } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { agents } from '@/lib/db/schema';
import { createLogger } from '@/lib/logger';

const log = createLogger('AgentStorage');

export const CUSTOM_AGENT_ID_PATTERN = /^[a-z0-9_-]+$/;
export const CUSTOM_AGENT_ID_MAX_LEN = 64;
export const CUSTOM_AGENT_NAME_MAX_LEN = 120;
export const CUSTOM_AGENT_ROLE_MAX_LEN = 64;
export const CUSTOM_AGENT_SYSTEM_PROMPT_MAX_LEN = 16000;
export const CUSTOM_AGENT_ACTIONS_MAX = 64;

/** Reject ids that could be problematic or collide with built-in agent ids. */
export function isValidCustomAgentId(id: string): boolean {
  return CUSTOM_AGENT_ID_PATTERN.test(id) && id.length <= CUSTOM_AGENT_ID_MAX_LEN;
}

/**
 * Public, API-facing shape for a custom agent. The `allowedActions` array and
 * the `enabled` boolean are deserialized from the DB row; timestamps are epoch
 * milliseconds (matching the `usage_records` convention).
 */
export interface CustomAgent {
  id: string;
  ownerId: string | null;
  name: string;
  role: string;
  systemPrompt: string;
  voice: string | null;
  avatar: string | null;
  allowedActions: string[];
  enabled: boolean;
  category: string | null;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

/**
 * Input accepted by create/update. `id` is required for create (and validated);
 * for update the URL id is used and fields are merged over the existing row, so
 * every field here is optional.
 */
export interface CustomAgentInput {
  id?: string;
  ownerId?: string | null;
  name?: string;
  role?: string;
  systemPrompt?: string;
  voice?: string | null;
  avatar?: string | null;
  allowedActions?: string[];
  enabled?: boolean;
  category?: string | null;
}

/** Validate a custom agent spec, returning a list of human-readable errors. */
export function validateCustomAgent(agent: unknown, opts?: { isNew?: boolean }): string[] {
  const errors: string[] = [];
  if (!agent || typeof agent !== 'object') return ['Agent must be an object.'];
  const a = agent as Record<string, unknown>;

  if (opts?.isNew) {
    const id = a.id;
    if (typeof id !== 'string' || !CUSTOM_AGENT_ID_PATTERN.test(id)) {
      errors.push('id must match /^[a-z0-9_-]+$/');
    } else if (id.length > CUSTOM_AGENT_ID_MAX_LEN) {
      errors.push(`id must be at most ${CUSTOM_AGENT_ID_MAX_LEN} chars`);
    }
  }

  if (typeof a.name !== 'string' || a.name.trim().length === 0) {
    errors.push('name is required');
  } else if (a.name.length > CUSTOM_AGENT_NAME_MAX_LEN) {
    errors.push(`name must be at most ${CUSTOM_AGENT_NAME_MAX_LEN} chars`);
  }

  if (typeof a.role !== 'string' || a.role.trim().length === 0) {
    errors.push('role is required');
  } else if (a.role.length > CUSTOM_AGENT_ROLE_MAX_LEN) {
    errors.push(`role must be at most ${CUSTOM_AGENT_ROLE_MAX_LEN} chars`);
  }

  if (typeof a.systemPrompt !== 'string' || a.systemPrompt.trim().length === 0) {
    errors.push('systemPrompt is required');
  } else if (a.systemPrompt.length > CUSTOM_AGENT_SYSTEM_PROMPT_MAX_LEN) {
    errors.push(`systemPrompt must be at most ${CUSTOM_AGENT_SYSTEM_PROMPT_MAX_LEN} chars`);
  }

  if (a.voice !== undefined && a.voice !== null && typeof a.voice !== 'string') {
    errors.push('voice must be a string or null');
  }
  if (a.avatar !== undefined && a.avatar !== null && typeof a.avatar !== 'string') {
    errors.push('avatar must be a string or null');
  }
  if (a.category !== undefined && a.category !== null && typeof a.category !== 'string') {
    errors.push('category must be a string or null');
  }

  const actions = a.allowedActions;
  if (actions !== undefined) {
    if (!Array.isArray(actions)) {
      errors.push('allowedActions must be an array');
    } else {
      if (actions.length > CUSTOM_AGENT_ACTIONS_MAX) {
        errors.push(`allowedActions must have at most ${CUSTOM_AGENT_ACTIONS_MAX} entries`);
      }
      for (let i = 0; i < actions.length; i++) {
        if (typeof actions[i] !== 'string') {
          errors.push(`allowedActions[${i}] must be a string`);
        }
      }
    }
  }

  if (a.enabled !== undefined && typeof a.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  return errors;
}

/** Coerce an arbitrary value into a clean `string[]` for storage. */
function cleanActions(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === 'string');
}

/** Map a raw DB row to the public CustomAgent shape (parse JSON, etc.). */
function rowToAgent(row: typeof agents.$inferSelect): CustomAgent {
  return {
    id: row.id,
    ownerId: row.ownerId,
    name: row.name,
    role: row.role,
    systemPrompt: row.systemPrompt,
    voice: row.voice,
    avatar: row.avatar,
    allowedActions: cleanActions(safeParseJson(row.allowedActionsJson)),
    enabled: row.enabled,
    category: row.category,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Parse JSON defensively so a corrupt column degrades to [] instead of throwing. */
function safeParseJson(value: string | null): unknown {
  if (!value) return [];
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
}

/**
 * List custom agents, optionally filtered by owner.
 *
 * - `ownerId === undefined` → list all agents
 * - `ownerId` is a string   → only agents owned by that user
 * - `ownerId === null`      → only agents with no owner (shared/legacy)
 *
 * Results are sorted by name for stable UI rendering.
 */
export async function listCustomAgents(ownerId?: string | null): Promise<CustomAgent[]> {
  try {
    const db = getDb();
    let rows: (typeof agents.$inferSelect)[];
    if (ownerId === undefined) {
      rows = db.select().from(agents).all();
    } else if (ownerId === null) {
      rows = db.select().from(agents).where(isNull(agents.ownerId)).all();
    } else {
      rows = db.select().from(agents).where(eq(agents.ownerId, ownerId)).all();
    }
    const mapped = rows.map(rowToAgent);
    mapped.sort((a, b) => a.name.localeCompare(b.name));
    return mapped;
  } catch (error) {
    log.error('Failed to list custom agents:', error);
    throw error;
  }
}

/** Read a single custom agent by id. Returns null if missing or id is invalid. */
export async function readCustomAgent(id: string): Promise<CustomAgent | null> {
  if (!isValidCustomAgentId(id)) return null;
  try {
    const db = getDb();
    const row = db.select().from(agents).where(eq(agents.id, id)).get();
    return row ? rowToAgent(row) : null;
  } catch (error) {
    log.error(`Failed to read custom agent "${id}":`, error);
    throw error;
  }
}

/** Create a new custom agent. Throws on id collision or validation failure. */
export async function createCustomAgent(data: CustomAgentInput): Promise<CustomAgent> {
  const errors = validateCustomAgent(data, { isNew: true });
  if (errors.length > 0) {
    throw new Error(`Invalid custom agent: ${errors.join('; ')}`);
  }
  const id = data.id!;
  const existing = await readCustomAgent(id);
  if (existing) {
    throw new Error(`Custom agent "${id}" already exists`);
  }
  const now = Date.now();
  const allowedActions = cleanActions(data.allowedActions);
  const row = {
    id,
    ownerId: data.ownerId ?? null,
    name: data.name!,
    role: data.role!,
    systemPrompt: data.systemPrompt!,
    voice: data.voice ?? null,
    avatar: data.avatar ?? null,
    allowedActionsJson: JSON.stringify(allowedActions),
    enabled: data.enabled ?? true,
    category: data.category ?? null,
    createdAt: now,
    updatedAt: now,
  };
  try {
    const db = getDb();
    db.insert(agents).values(row).run();
    log.info(`created custom agent "${id}"`);
    return {
      id: row.id,
      ownerId: row.ownerId,
      name: row.name,
      role: row.role,
      systemPrompt: row.systemPrompt,
      voice: row.voice,
      avatar: row.avatar,
      allowedActions,
      enabled: row.enabled,
      category: row.category,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  } catch (error) {
    log.error(`Failed to create custom agent "${id}":`, error);
    throw error;
  }
}

/**
 * Replace fields of an existing custom agent. `data` is merged over the current
 * row (only provided fields are changed), then the full result is validated.
 * Throws if the agent is missing or invalid.
 */
export async function updateCustomAgent(
  id: string,
  data: CustomAgentInput,
): Promise<CustomAgent> {
  if (!isValidCustomAgentId(id)) {
    throw new Error(`Custom agent "${id}" not found`);
  }
  const existing = await readCustomAgent(id);
  if (!existing) {
    throw new Error(`Custom agent "${id}" not found`);
  }

  const merged: CustomAgentInput = {
    id,
    ownerId: data.ownerId !== undefined ? data.ownerId : existing.ownerId,
    name: data.name !== undefined ? data.name : existing.name,
    role: data.role !== undefined ? data.role : existing.role,
    systemPrompt: data.systemPrompt !== undefined ? data.systemPrompt : existing.systemPrompt,
    voice: data.voice !== undefined ? data.voice : existing.voice,
    avatar: data.avatar !== undefined ? data.avatar : existing.avatar,
    allowedActions:
      data.allowedActions !== undefined ? data.allowedActions : existing.allowedActions,
    enabled: data.enabled !== undefined ? data.enabled : existing.enabled,
    category: data.category !== undefined ? data.category : existing.category,
  };

  const errors = validateCustomAgent(merged, { isNew: true });
  if (errors.length > 0) {
    throw new Error(`Invalid custom agent: ${errors.join('; ')}`);
  }

  const allowedActions = cleanActions(merged.allowedActions);
  const patch = {
    ownerId: merged.ownerId ?? null,
    name: merged.name!,
    role: merged.role!,
    systemPrompt: merged.systemPrompt!,
    voice: merged.voice ?? null,
    avatar: merged.avatar ?? null,
    allowedActionsJson: JSON.stringify(allowedActions),
    enabled: merged.enabled ?? true,
    category: merged.category ?? null,
    updatedAt: Date.now(),
  };
  try {
    const db = getDb();
    const updated = db.update(agents).set(patch).where(eq(agents.id, id)).returning().get();
    log.info(`updated custom agent "${id}"`);
    if (updated) return rowToAgent(updated);
    // Defensive: row existed moments ago; reconstruct from existing + patch.
    return {
      ...existing,
      ownerId: patch.ownerId,
      name: patch.name,
      role: patch.role,
      systemPrompt: patch.systemPrompt,
      voice: patch.voice,
      avatar: patch.avatar,
      allowedActions,
      enabled: patch.enabled,
      category: patch.category,
      updatedAt: patch.updatedAt,
    };
  } catch (error) {
    log.error(`Failed to update custom agent "${id}":`, error);
    throw error;
  }
}

/** Delete a custom agent. Returns false if it did not exist (or id is invalid). */
export async function deleteCustomAgent(id: string): Promise<boolean> {
  if (!isValidCustomAgentId(id)) return false;
  try {
    const db = getDb();
    const result = db.delete(agents).where(eq(agents.id, id)).run();
    const deleted = result.changes > 0;
    if (deleted) log.info(`deleted custom agent "${id}"`);
    return deleted;
  } catch (error) {
    log.error(`Failed to delete custom agent "${id}":`, error);
    throw error;
  }
}
