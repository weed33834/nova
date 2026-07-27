# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Fixed

- **PPTX export crash** — `lib/export/use-export-pptx.ts` clip block had a broken brace
  structure (missing `}` for the `else` and `if (el.clip)` scopes) that produced malformed
  JS; rewrote the block with proper nesting. Gradient background `colors[0]`/`colors[length-1]`
  accessed `.color` without a length check (crashed on empty/single-color arrays); added
  `length >= 2` guard. Table cell `fontsize` parsed via `parseInt` without NaN guard (CSS
  keywords like `"large"` produced NaN that flowed into the PPTX as the cell font size).
- **Canvas `addElement` referenced before declaration** — `components/slide-renderer/Editor/
  Canvas/index.tsx` called `addElement` in `handleTextDrop` / `handleDblClick` but
  `useCanvasOperations()` was destructured after those callbacks; moved the destructure
  above the callbacks and removed the duplicate later declaration.
- **ImageClipHandler NaN propagation** — `parseInt(topImgPositionStyle.left/top/width/height)`
  returned NaN when the CSS value was `"auto"`, corrupting `currentRange` to
  `[[NaN,NaN],[NaN,NaN]]` and producing Infinity/NaN clip dimensions downstream. Added
  radix-10 parse with NaN→0 fallback and a `width/height <= 0` early return to avoid
  divide-by-zero.
- **Disk JSON shape validation** — `lib/server/classroom-storage.ts` and
  `lib/server/classroom-job-store.ts` cast `JSON.parse(content) as PersistedClassroomData`
  / `as ClassroomGenerationJob` with no runtime validation; a partially-written or
  hand-edited file would crash downstream code on `classroom.scenes` / `job.status`
  access. Added `isValidClassroomData` / `isValidJob` type guards; invalid files return
  `null` (same semantics as "not found", which callers already map to 404).
- **Unhandled promise rejections** — `lib/store/stage.ts` had two fire-and-forget IndexedDB
  persistence chains (`setOutlines`, `setGenerationComplete`) with no `.catch()`; a quota-
  exceeded or storage-blocked write produced an unhandled rejection and silently lost the
  `generationComplete` flag. `lib/agent/client/use-agent-runtime.ts` `saveSession` chain
  had the same issue. Both now attach `.catch()` with warn-level logging.
- **parseInt NaN in user-input fields** — `components/settings/model-edit-dialog.tsx`
  `contextWindow` / `outputWindow` inputs used `parseInt(e.target.value)` without radix or
  NaN guard; pasted non-numeric text propagated NaN into the model config and out to LLM
  API requests. Added radix 10 + `Number.isFinite` check, falling back to `undefined`.
- **prosemirror textIndent NaN** — `lib/prosemirror/schema/nodes.ts` parsed DOM `textIndent`
  style with `parseInt` (no radix, no NaN guard); non-numeric values polluted the paragraph
  node's `textIndent` attribute. Extracted a `parseIndent` helper with NaN→0 fallback.
- **Copy/cut/paste, shape/line creation, dblclick-to-create-text** — these editor
  interactions were TODO placeholders (`toast.warning("暂未实现")` or empty handlers);
  implemented via the Clipboard API (with a textarea fallback for non-HTTPS environments)
  and real `PPTShapeElement` / `PPTLineElement` / `PPTTextElement` construction.
- **Scene-generator retry abort** — `lib/hooks/use-scene-generator.ts` created an
  `AbortController` per retry but never stored it on the shared `fetchAbortRef`, so `stop()`
  could not interrupt in-flight retry fetches. The controller is now assigned to
  `fetchAbortRef.current` so `stop()` reaches every retry attempt.
- **LLM JSON parse robustness** — `lib/server/classroom-generation.ts` and related call
  sites used `JSON.parse` directly on LLM output with no error handling; switched to
  `parseJsonResponse` (which uses `jsonrepair` for non-standard JSON) and added field
  validation with descriptive error messages.
- **URL parse crashes** — `lib/ai/azure.ts`, `lib/mcp/client-manager.ts`,
  `lib/audio/asr-providers.ts` called `new URL(value)` on user input that could be a bare
  hostname or typo, throwing `TypeError` and crashing the model-creation flow. Added
  try/catch with a `https://` prefix retry for bare hostnames.
- **Upstream error text truncation** — 14 `throw new Error(\`... ${errorText}\`)` sites
  across TTS / ASR / web-search / ComfyUI / agent-loop providers interpolated the raw
  upstream response body (frequently a multi-KB HTML error page on gateway 5xx) into
  `Error.message`. Added a `truncateErrorText` helper (300-char cap) to each affected
  file and wrapped every throw.
- **proxy-media timeout** — `app/api/proxy-media/route.ts` had no per-hop timeout on the
  upstream `fetch`, so a slow CDN host could hold the request open up to the 60 s
  `maxDuration`. Added a 15 s `AbortSignal.timeout` per hop; `TimeoutError` is mapped to
  504 `CONNECTION_TIMEOUT` (vs the previous 500) so callers can distinguish a slow upstream
  from a server failure.

### Changed

- **Deep-clone hot path** — `lib/store/snapshot.ts` (2 sites) and
  `lib/store/whiteboard-history.ts` (1 site) used the `JSON.parse(JSON.stringify(...))`
  anti-pattern for undo/redo snapshots; switched to `structuredClone` (faster, preserves
  `Date` / `Map` / `Set`).
- **Log level downgrades** — `lib/orchestration/director-graph.ts` logged the full director
  LLM response at `info` level (could be multi-KB and echo user content); downgraded to
  `debug` + truncated to 200 chars. `lib/generation/json-repair.ts` logged 1000 chars of
  raw LLM output at `error` level on every parse failure; downgraded to `warn` + 200 chars.
- **`mapWithConcurrency` deduplication** — the helper was copy-pasted in
  `lib/pdf/pdf-providers.ts` and `lib/export/inline-assets.ts`; both now import the single
  canonical version from `lib/utils/concurrency.ts`.

### Removed

- **26 unused exports** across 10 files: `getRectRotatedOffset`, `getLineElementLength`,
  `createSlideIdMap`, `isElementInViewport` (`lib/utils/element.ts`); `findNearestCorner`
  (`lib/utils/geometry.ts`); `cacheDelete`, `cacheClear` (`lib/utils/cache.ts`);
  `preloadComponent`, `onIdle`, `flushIdle` (`lib/utils/preloader.ts`); `translate`,
  `getClientTranslation` (`lib/i18n/index.ts`); `CHROME_TRANSITION`
  (`lib/edit/transitions.ts`); `DialogForExportTypes` (`lib/types/export.ts` — file deleted
  as it became empty); `ParsePdfRequest`, `ParsePdfResponse` (`lib/types/pdf.ts`);
  `Message`, `MessageAction` (`lib/types/roundtable.ts`); `SessionEvent`,
  `CreateSessionRequest`, `SendMessageRequest`, `ToolResultsRequest`, `toSessionListItem`,
  `ParsedToolCall` (`lib/types/chat.ts`); `parseSvgPath`, `SvgPath`
  (`lib/export/svg-path-parser.ts`); `selectProfileCompleteness`
  (`lib/store/profile.ts`); the `export` keyword on 4 internal-only functions in
  `lib/edit/html-edit.ts` (`detectLineEnding`, `normalizeToLF`, `normalizeForFuzzyMatch`,
  `fuzzyFindText`); the `export` keyword on `sanitizeProceduralSkillOutline`
  (`lib/generation/outline-generator.ts`), `DEFAULT_CONTENT_SAFETY_CONFIG` and
  `DEFAULT_HALLUCINATION_CONFIG` (`lib/guardrails/content-safety.ts`).
- **Stale commented-out code** — 5-line ECharts workaround block in
  `components/slide-renderer/components/element/ChartElement/chartOption.ts`.
- **Dead local variable** — `isValue` in `lib/generation/json-repair.ts` (assigned but
  never read).

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

### Security

- **iframe sandbox hardening** — `components/ai-elements/web-preview.tsx` removed
  `allow-same-origin` from the sandbox token list (it coexisted with `allow-scripts`, which
  lets sandboxed content reach parent cookies/storage and escape the sandbox).
- **Upload size limits** — `app/api/parse-pdf/route.ts` (50 MiB) and
  `app/api/transcription/route.ts` (25 MiB) now reject oversized uploads before reading the
  body into memory, preventing OOM from malicious or accidental large files.
- **Proxy-media upstream cancellation** — `app/api/proxy-media/route.ts` now calls
  `reader.cancel()` when the streamed body exceeds `MAX_PROXY_BYTES` and propagates
  downstream `cancel` to the upstream fetch, so client disconnects don't leave the upstream
  connection hanging.

### Performance & Reliability

- **Stream backpressure & OOM** — `lib/export/inline-assets.ts` `createAssetFetcher` now
  streams the upstream asset through `getReader()` with a running byte counter instead of
  buffering the whole body via `arrayBuffer()` before the size check. Adds a 30 s
  `AbortController` timeout so a stalled asset server can no longer hang the export.
- **DAG executor** — `lib/orchestration/dag/executor.ts` nodes now honor `node.timeout`
  (was unbounded → single stuck node deadlocked the whole stage and dependents); parallel
  stages attach a no-op `.catch()` to every in-flight node promise so `Promise.all` no
  longer turns sibling rejections into unhandled rejections; stage boundaries check
  `signal?.aborted` so user cancel actually stops the pipeline.
- **Parallel executor** — `lib/orchestration/parallel/executor.ts` race mode now uses
  `Promise.allSettled` for loser promises (was unhandled rejection) and clears the timeout
  timer in a `finally` block (was leaking timers).
- **DAG scheduler cycle guard** — `lib/orchestration/dag/scheduler.ts`
  `getDependencyLevels` now tracks a `visiting` set so a cyclic graph degrades gracefully
  instead of blowing the stack.
- **`maxDuration` on long routes** — added to `parse-pdf` (120 s), `extract-document`
  (120 s), `pbl/chat` (60 s), `quiz-grade` (60 s), `provider/probe-models` (30 s),
  `verify-model` (30 s), `verify-video-provider` (30 s), `web-search` (60 s),
  `mcp/test` (30 s) so Vercel doesn't kill them at the default 10 s limit.
- **media-orchestrator cancellation** — `lib/media/media-orchestrator.ts` `fetchAsBlob`
  now threads the caller's `abortSignal` into the blob download fetches (was ignored, so
  user cancel kept burning bandwidth/quota).

### Memory Leaks (P0)

- **`lib/utils/cache.ts`** — module-level `Map` had no size cap; now bounded to
  `MAX_CACHE_ENTRIES = 500` with FIFO eviction.
- **`lib/utils/stage-storage.ts`** — `deleteStageData` now cascades to `stageOutlines`,
  `mediaFiles`, `generatedAgents`, `agentEditSessions` (was leaving orphan blobs in
  IndexedDB, diverging from `database.ts` `deleteStageWithRelatedData`).
- **`lib/hooks/use-audio-recorder.ts`** — unmount now stops `MediaRecorder`,
  `MediaStream` tracks, `SpeechRecognition`, and clears the timer interval (was leaving
  the mic indicator on and calling `setState` after unmount).
- **`components/agent/agent-reveal-modal.tsx`** — `setInterval` cleanup was returned from
  a `setTimeout` callback (ignored by `setTimeout`), so the interval kept running after
  unmount; cleanup is now attached to the effect's real return.

### Correctness

- **`lib/usage/normalize.ts`** — `num(x) || num(y)` treated a legitimate `0` as missing
  and fell back to deprecated flat fields; now checks `!= null` first.
- **`lib/profile/extractor.ts`** — `confidence || 0.5` turned a legitimate `0` confidence
  into `0.5`; now uses `?? 0.5` (two sites).
- **`lib/adaptive/recommender/engine.ts`** — `scoreRecommendations` was computing
  prerequisites on a synthetic single-node graph (always `[]`), so every candidate scored
  full 0.3 for prerequisites and students got pushed to advanced concepts they lacked the
  prerequisites for; now uses the real `graph` argument.
- **`tests/runtime/stage-delete-wiring.test.ts`** — mock now covers the four cascade
  tables added to `deleteStageData` (was reporting `Cannot read properties of undefined`).

### Dependencies

- Conservative `pnpm update -r` — patch/minor bumps across ~40 packages
  (`next` 16.2.10 → 16.2.12, `react`/`react-dom` 19.2.3 → 19.2.8,
  `@modelcontextprotocol/sdk` 1.27.1 → 1.29.0, `vitest` 4.1.8 → 4.1.10,
  `@radix-ui/*`, `@fontsource/*`, `i18next`, `lodash`, `motion`, etc.).
  `react`/`react-dom` pinned to `19.2.8` in both root and `packages/docs` to satisfy
  `motion@12.42.2`'s peer dep and avoid a hooks-version-mismatch crash in
  `renderToStaticMarkup` during renderer tests.

## [0.1.0] - Initial Release

- Initial release of Nova - AI-powered interactive classroom platform
