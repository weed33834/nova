/**
 * Prompt Registry — single inventory across both prompt systems.
 *
 * Enumerates:
 *   - `main` prompts from `lib/prompts/templates/<id>/` (typed `PromptId` union)
 *   - `pbl-v2` prompts from `lib/pbl/v2/prompts/*.md` (flat, string-keyed)
 *
 * Each entry carries uniform metadata (version, description, tags, deprecated)
 * resolved from an optional `config.json` sidecar (main) or defaults (pbl-v2).
 *
 * This is the read surface used by the Settings UI, the MCP exposure layer
 * (Phase E lists prompts as MCP resources), and any audit/diff tooling. It does
 * NOT merge the two loaders — PBL v2's runtime loader stays separate to keep
 * its isolation from the shared `PromptId` union (see `lib/pbl/v2/prompts/
 * loader.ts`). The registry is a read-only catalog layered on top.
 *
 * Discovery is filesystem-based rather than union-based: the `PromptId` union is
 * the compile-time constraint, the registry is the runtime inventory that
 * reflects disk state. A template directory that is not in the union still
 * appears here (surfacing drift) — the templates test suite enforces parity
 * separately.
 */

import fs from 'fs';
import path from 'path';
import type { PromptId } from './types';
import { loadPromptConfig, DEFAULT_PROMPT_VERSION } from './loader';

export type PromptSource = 'main' | 'pbl-v2';

export interface PromptRegistryEntry {
  /** Stable identifier — the directory name (main) or file stem (pbl-v2). */
  id: string;
  /** Which prompt system this entry belongs to. */
  source: PromptSource;
  /** Display name (config.json `displayName` or derived from id). */
  displayName: string;
  /** Semantic version (config.json `version` or DEFAULT_PROMPT_VERSION). */
  version: string;
  /** Short description (config.json `description` or undefined). */
  description?: string;
  /** Free-form tags for filtering (config.json `tags` or undefined). */
  tags?: string[];
  /** Whether the prompt is deprecated (config.json `deprecated` or false). */
  deprecated: boolean;
  /**
   * Whether a user.md template exists alongside system.md. Always false for
   * pbl-v2 (flat single-file prompts).
   */
  hasUserTemplate: boolean;
  /** Project-root-relative path to the template file or directory. */
  path: string;
}

function deriveDisplayName(id: string): string {
  // kebab-case → "Kebab Case" for a human-friendly default.
  return id
    .split('-')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function mainPromptDirs(): string[] {
  const dir = path.join(process.cwd(), 'lib', 'prompts', 'templates');
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return entries
    .map((name) => ({ name, full: path.join(dir, name) }))
    .filter((e) => fs.statSync(e.full).isDirectory())
    .map((e) => e.name);
}

function pblV2PromptStems(): string[] {
  const dir = path.join(process.cwd(), 'lib', 'pbl', 'v2', 'prompts');
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return []; // PBL v2 not present in this build
  }
  return files.filter((f) => f.endsWith('.md')).map((f) => f.slice(0, -'.md'.length));
}

/**
 * Build the full prompt registry by scanning both prompt systems. Reads config
 * sidecars from disk on every call (no cache) — consistent with `loadPrompt`'s
 * no-cache contract. Callers that need to bound disk I/O should cache the result
 * at their layer.
 *
 * Entries are sorted by (source, id) so the output is stable across runs.
 */
export function getPromptRegistry(): PromptRegistryEntry[] {
  const entries: PromptRegistryEntry[] = [];

  // ─── Main prompt system ───
  for (const id of mainPromptDirs()) {
    const dir = path.join(process.cwd(), 'lib', 'prompts', 'templates', id);
    // `loadPromptConfig` is typed to `PromptId`; a directory discovered on disk
    // that is not in the union still loads (the path is the same). Cast keeps
    // the call honest — the union remains the compile-time gate.
    const config = loadPromptConfig(id as PromptId);
    const hasUserTemplate = fs.existsSync(path.join(dir, 'user.md'));
    entries.push({
      id,
      source: 'main',
      displayName: config?.displayName ?? deriveDisplayName(id),
      version: config?.version ?? DEFAULT_PROMPT_VERSION,
      description: config?.description,
      tags: config?.tags,
      deprecated: config?.deprecated ?? false,
      hasUserTemplate,
      path: `lib/prompts/templates/${id}`,
    });
  }

  // ─── PBL v2 prompt system ───
  for (const id of pblV2PromptStems()) {
    // PBL v2 prompts are flat single-file markdown; no config.json sidecar
    // support today. If/when one is needed, mirror the main loader's
    // `loadPromptConfig` against a `<name>.config.json` sibling.
    entries.push({
      id,
      source: 'pbl-v2',
      displayName: deriveDisplayName(id),
      version: DEFAULT_PROMPT_VERSION,
      deprecated: false,
      hasUserTemplate: false,
      path: `lib/pbl/v2/prompts/${id}.md`,
    });
  }

  entries.sort((a, b) =>
    a.source === b.source ? a.id.localeCompare(b.id) : a.source.localeCompare(b.source),
  );
  return entries;
}

/** Convenience: flat list of `{ id, source, displayName, deprecated }` for quick displays. */
export function listAllPrompts(): Array<{
  id: string;
  source: PromptSource;
  displayName: string;
  deprecated: boolean;
}> {
  return getPromptRegistry().map((e) => ({
    id: e.id,
    source: e.source,
    displayName: e.displayName,
    deprecated: e.deprecated,
  }));
}
