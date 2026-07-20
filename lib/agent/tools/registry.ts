import type { AgentTool } from '@earendil-works/pi-agent-core';
import {
  makeRegenerateSceneActionsTool,
  type RegenerateActionsDeps,
} from './regenerate-scene-actions';
import { makeReadSceneContentTool } from './read-scene-content';
import { makeRegenerateSceneTool } from './regenerate-scene';
import { makeEditInteractiveHtmlTool } from './edit-interactive-html';
import { makeEditElementsTool } from './edit-elements';

/**
 * Deps needed to build the v0 toolset.
 * - `aiCall`: request-scoped LLM text call (resolved model injected by route)
 * - `getSceneContext`: returns trusted scene/stage context from the client POST body;
 *   the model supplies only a sceneId, and the route fulfils the heavy data.
 * - `getSelection`: optional canvas selection ids (shown by read_scene_content).
 *
 * Tools share the regenerate deps shape; the read tool only uses `getSceneContext`.
 */
export type ToolsetDeps = RegenerateActionsDeps & {
  activeSceneId?: string;
  getSelection?: () => readonly string[];
};

/**
 * Build the v0 toolset:
 * - `read_scene_content` — read the slide to reason / craft instructions (read-then-act)
 * - `regenerate_scene` — instruction-driven whole-slide regeneration (content + actions)
 * - `regenerate_scene_actions` — narration/actions only
 * - `edit_interactive_html` — surgical str_replace edits for an interactive scene's HTML
 * - `edit_elements` — guarded JSON Patch per-element edits → EditIntent
 */
export function buildToolset(deps: ToolsetDeps): AgentTool<never, never>[] {
  return [
    makeReadSceneContentTool(deps) as never,
    makeRegenerateSceneTool(deps) as never,
    makeRegenerateSceneActionsTool(deps) as never,
    makeEditInteractiveHtmlTool(deps) as never,
    makeEditElementsTool(deps) as never,
  ];
}

/** v0 allowlist — the enabled subset. Widen here to grant capability. */
export const V0_ALLOWLIST: ReadonlySet<string> = new Set([
  'read_scene_content',
  'regenerate_scene',
  'regenerate_scene_actions',
  'edit_interactive_html',
  'edit_elements',
]);

// ─── Skill catalog (static management metadata) ─────────────────────────────
//
// The entries above (`buildToolset`) instantiate `AgentTool` objects that
// already carry `name`, `label`, `description`, and the TypeBox `parameters`
// schema. But instantiation requires request-scoped `deps`, so any caller that
// cannot supply them — a client-side Settings panel, an MCP `tools/list`
// responder without a request, an audit/manifest tool — cannot enumerate
// skills by calling `buildToolset`.
//
// `SKILL_CATALOG` is the static, dependency-free display layer: it lists every
// skill id with a stable display name, a category, and a one-line summary. The
// full tool description and input schema stay on the `AgentTool` for runtime
// use; this catalog intentionally does NOT duplicate them. Keep the ids in sync
// with `V0_ALLOWLIST` — the parity test in tests/agent/skill-catalog.test.ts
// enforces it.

export type SkillCategory = 'read' | 'regenerate' | 'edit';

export interface SkillCatalogEntry {
  /** Tool name — must match the `name` field on the `AgentTool` and V0_ALLOWLIST. */
  id: string;
  /** Human-readable display name (independent of the tool's internal `label`). */
  displayName: string;
  /** Coarse grouping for the Settings UI / MCP tool listing. */
  category: SkillCategory;
  /** One-line summary; the full description lives on the AgentTool at runtime. */
  summary: string;
}

export const SKILL_CATALOG: readonly SkillCatalogEntry[] = [
  {
    id: 'read_scene_content',
    displayName: 'Read Scene Content',
    category: 'read',
    summary: 'Read the current scene (outline + content) before answering or regenerating.',
  },
  {
    id: 'regenerate_scene',
    displayName: 'Regenerate Scene',
    category: 'regenerate',
    summary: 'Whole-slide regeneration driven by a natural-language instruction.',
  },
  {
    id: 'regenerate_scene_actions',
    displayName: 'Regenerate Scene Actions',
    category: 'regenerate',
    summary: 'Regenerate only narration and playback actions for a scene.',
  },
  {
    id: 'edit_interactive_html',
    displayName: 'Edit Interactive HTML',
    category: 'edit',
    summary: "Surgical string-replace edits for an interactive scene's HTML.",
  },
  {
    id: 'edit_elements',
    displayName: 'Edit Elements',
    category: 'edit',
    summary: 'Guarded JSON Patch per-element edits (geometry, styles, text, labels).',
  },
];

/** Look up a skill catalog entry by tool id. */
export function getSkillCatalogEntry(id: string): SkillCatalogEntry | undefined {
  return SKILL_CATALOG.find((s) => s.id === id);
}
