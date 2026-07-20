/**
 * Simplified prompt system type definitions
 */

/**
 * Prompt template identifier
 */
export type PromptId =
  | 'requirements-to-outlines'
  | 'interactive-outlines'
  | 'task-engine-outlines'
  | 'web-search-query-rewrite'
  | 'slide-content'
  | 'quiz-content'
  | 'slide-actions'
  | 'quiz-actions'
  | 'interactive-actions'
  | 'simulation-content'
  | 'diagram-content'
  | 'code-content'
  | 'game-content'
  | 'visualization3d-content'
  | 'procedural-skill-content'
  | 'knowledge-graph-content'
  | 'pbl-actions'
  | 'agent-system'
  | 'agent-system-wb-teacher'
  | 'agent-system-wb-assistant'
  | 'agent-system-wb-student'
  | 'director'
  | 'pbl-design'
  | 'editor-agent';

/**
 * Snippet identifier
 */
export type SnippetId =
  | 'json-output-rules'
  | 'element-types'
  | 'action-types'
  | 'image-instructions'
  | 'video-instructions'
  | 'media-safety-guidelines'
  | 'slide-image-instructions'
  | 'slide-generated-image-instructions'
  | 'slide-video-instructions'
  | 'speech-guidelines'
  | 'whiteboard-reference'
  | 'role-guidelines-teacher'
  | 'role-guidelines-assistant'
  | 'role-guidelines-student';

/**
 * Metadata declared in an optional `config.json` sidecar next to a prompt
 * template (`templates/<id>/config.json`). All fields are optional; the
 * loader applies defaults when the file is absent.
 *
 * Purpose: give the prompt inventory (registry, Settings UI, MCP resource
 * listing, eval) a uniform metadata shape without forcing every prompt to
 * declare it — prompts without a config.json still load with default
 * version "1.0.0".
 */
export interface PromptConfig {
  /** Semantic version of this prompt's content (semver-ish, e.g. "1.2.0"). */
  version: string;
  /** Short human-readable summary of what this prompt produces. */
  description?: string;
  /** Free-form labels for grouping/filtering in the registry (e.g. "generation", "orchestration"). */
  tags?: string[];
  /** When true, the prompt is kept for compatibility but should not be used for new work. */
  deprecated?: boolean;
  /** Optional display name override; defaults to the directory name. */
  displayName?: string;
}

/**
 * Loaded prompt template + metadata.
 *
 * `config` carries the parsed sidecar (absent when no config.json exists);
 * `version` / `deprecated` are convenience projections so consumers can read a
 * single field rather than optional-chaining through `config` every time.
 */
export interface LoadedPrompt {
  id: PromptId;
  systemPrompt: string;
  userPromptTemplate: string;
  /** Parsed `config.json` sidecar (undefined when no sidecar is present). */
  config?: PromptConfig;
  /** Convenience projection of `config?.version` (defaults to "1.0.0"). */
  version: string;
  /** Convenience projection of `config?.deprecated` (defaults to false). */
  deprecated: boolean;
}
