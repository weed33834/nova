# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Multi-mode course design (`CourseFormat`)** — per-course macro override for media
  generation. Three modes: `video` (default, full media), `ppt-audio` (images + TTS, no
  video), `text-only` (no media). Selector lives on the home toolbar; the chosen format is
  persisted on the `Stage` and gates image / video / TTS across the outline, scene-content,
  and TTS stages via the shared `getEffectiveMediaFlags` helper.
- **Knowledge graph interactive widget** — new `knowledge-graph` `WidgetType` subtype of
  `interactive` scenes. Renders an SVG force-directed graph of concepts, prerequisites, and
  relationships; supports `SET_WIDGET_STATE` / `HIGHLIGHT_ELEMENT` / `ANNOTATE_ELEMENT` /
  `REVEAL_ELEMENT` postMessage interactions. Stable DOM selectors (`data-node-id`,
  `data-edge-id`) feed `extractInteractiveElements`.
- **Unified API error mechanism** — `apiError` / `apiSuccess` response envelope, `llmApiError`
  for sanitized upstream LLM error mapping (401→INVALID_CREDENTIALS, 403→MODEL_ACCESS_DENIED,
  429→RATE_LIMITED, …), `notifyApiError` unified frontend notification helper.
- **Route-level error boundaries** — `app/global-error.tsx`, `app/not-found.tsx`,
  `app/classroom/[id]/error.tsx`, `app/generation-preview/error.tsx`.
- **81 new tests** — `course-format` (23), `api-response` (11), `llm-error-response` (18),
  `notify` (15), `course-format-selector` (9), `error-boundary` (5), `knowledge-graph-routing`
  (4). Component tests use React 19 `act` with `globalThis.IS_REACT_ACT_ENVIRONMENT`.
- **Agent role persistence (`AgentRoleManager` v2)** — `lib/orchestration/roles/role-store.ts`
  Zustand store with `persist` middleware; role display-name / description / permissions /
  interaction-pattern / priority overrides survive page reloads in `localStorage`. UI shows
  a "已修改" badge and per-role / global "reset to default" buttons when overrides exist.
- **Prompt template metadata sidecars** — every template directory under
  `lib/prompts/templates/<id>/` now ships a `config.json` (version, description, tags,
  `deprecated` flag). Consumed by the new `PromptRegistry` and surfaced through the
  `/api/prompts` API for at-a-glance inventory.
- **Prompt management API** — `GET /api/prompts` lists all 34 templates with metadata;
  `GET /api/prompts/[id]` returns a single template's full rendered content + config.
- **Skill management API** — `GET /api/skills` returns the `SKILL_CATALOG` with per-skill
  `enabled` status (gated by `V0_ALLOWLIST`), enabling runtime skill inventory inspection.
- **Role guidelines migrated to snippets** — the hardcoded `ROLE_GUIDELINES` constant in
  `prompt-builder.ts` has been replaced by three snippet files
  (`role-guidelines-teacher.md`, `role-guidelines-assistant.md`, `role-guidelines-student.md`)
  loaded at runtime via `loadSnippet()`, so role text is now editable without touching TS.
- **Guardrails pipeline integration** — `lib/guardrails/pipeline-check.ts` runs
  `runAllGuardrails` (PII / toxicity / hallucination) on every generated scene's speech text
  in `classroom-generation.ts`. Non-blocking: logs WARN on failure, never rejects content.
- **Runtime role-constraint enforcement** — `lib/orchestration/role-constraints.ts` exposes
  `getMaxActions(role)` / `getMaxTurns(role)` / `hasExceededMaxTurns(...)`. `director-graph.ts`
  now skips excess actions beyond `max_actions` and ends discussion when an agent exceeds
  `max_turns`, honouring the constraints defined in `ROLE_DEFINITIONS`.

### Changed

- `Stage` interface (`@nova/dsl`) gained an optional `courseFormat` field; persisted through
  `StageRecord` / `StageListItem` and `saveStageData`.
- `media-orchestrator.generateMediaForOutlines` now takes a `courseFormat` parameter and derives
  effective image / video / TTS flags via `getEffectiveMediaFlags` instead of reading settings
  directly.
- `use-scene-generator` TTS triggers now gate on `isTTSEnabledForFormat(stage.courseFormat, settings)`.
- `scene-outlines-stream` route derives effective image/video flags from `requirements.courseFormat`
  + header flags.
- `retryMediaTask` and `regenerateSpeechAudio` now honour `courseFormat` gating (previously
  always triggered regardless of the chosen media mode).
- z-index hierarchy normalized: choreography effects `spotlight` (100→90) and `laser` (101→91)
  now sit below modal overlays (z-100+) and the AccessCodeModal (z-200).
- `useStageStore()` calls in `stage.tsx`, `scene-sidebar.tsx`, `PlaybackChromeRoot.tsx` switched
  to `useShallow` selectors (critical performance hotspot).
- 8 Context provider values memoized via `useMemo` / `useCallback` (`use-i18n`, `use-theme`,
  `web-preview`, `plan`, `code-block`, `open-in-chat`, `confirmation`, `reasoning`).
- 44 `<img>` tags across 22 files gained `loading="lazy"` + `decoding="async"`; 3 first-screen
  logos use `loading="eager"` + `decoding="async"`.
- `AgentRoleManager` heading now uses `t('settings.agentRoles.title')` (was
  `t('settings.agentRoles')` which returned an object). The `title` sub-key was added to all
  8 locale files.
- `DAGWorkflowBuilder` (`dag-builder.tsx`) now shows a deprecation banner — the editor is a
  design preview and not yet wired into the runtime orchestration engine.

### Removed

- Dead code: `components/scene-renderers/quiz-renderer.tsx` (Submit button had no `onClick`,
  entire file lacked i18n) and `components/agent/agent-config-panel.tsx` (used `confirm()`
  native dialog, hardcoded Chinese). Both had zero imports.
- Dead `graphDepth` field removed from `lib/types/generation.ts`.
- Hardcoded `ROLE_GUIDELINES` constant removed from `lib/orchestration/prompt-builder.ts`
  (replaced by snippet files — see Added).

### Fixed

- Hardcoded Chinese `aria-label`s ("上移" / "下移" / "撤销" / "重做" / "Not implemented") in
  `AgentRosterPanel.tsx` and `use-canvas-operations.ts` replaced with `t()` calls.
- `app/classroom/[id]/page.tsx` loading and error states now render a spinner + i18n text
  (`classroom.loading`, `classroom.errorTitle`) with `role="status"` / `role="alert"`.
- `ttsResult.errorCode` reference at `use-scene-generator.ts:849` (TTS result type has no
  `errorCode` field) replaced with `undefined`.
- **`tool_choice` without `tools`** — the `compatFetch` wrapper in `lib/ai/providers.ts`
  now strips `tool_choice` from the request body when the `tools` array is empty or missing.
  Some OpenAI-compatible proxies (e.g. SiliconFlow relay) reject such requests with
  `400 Validation: When using tool_choice, tools must be set`.
- **mcp-test DNS failure** — `tests/api/mcp-test.test.ts` now mocks `validateUrlForSSRF`
  (which performs a real DNS lookup that fails in the test environment). SSRF guard has its
  own dedicated test suite; the route test now focuses on route logic only.

## [0.1.0] - Initial Release

- Initial release of Nova - AI-powered interactive classroom platform
