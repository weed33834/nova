# Translation Guide

## Adding a new language

1. Copy `locales/en-US.json` to `locales/<code>.json` (e.g. `ja-JP.json`)
2. Append an entry to the end of the `supportedLocales` array in `locales.ts` — do not reorder existing entries, as the first locale for each language prefix (e.g. `zh-CN` for `zh`) is used as the default when the browser sends a bare language code:
   ```ts
   { code: 'ja-JP', label: '日本語', shortLabel: 'JA' },
   ```
3. Translate all values in the new JSON file. Keys must remain identical.

## Interpolation

This project uses i18next with the default double-brace syntax: `{{variable}}`.

Example: `"Hi, {{name}}"` will render as `"Hi, Alice"` when called with `t('key', { name: 'Alice' })`.

Do NOT remove or rename interpolation variables — they are referenced in code.

## Keys with design intent

Not every key needs explanation, but the following have non-obvious UX context that affects how they should be translated.

| Key | Where it appears | Translation notes |
|-----|-----------------|-------------------|
| `home.greetingWithName` | Top-left of homepage, clickable pill that opens nickname editor | This is a **call-to-action** — the greeting doubles as an entry point for users to set their nickname. The translation must include `{{name}}` and read naturally with the default nickname (see `profile.defaultNickname`). Avoid generic greetings that hide the name (e.g. don't translate as just "Welcome"). |
| `profile.defaultNickname` | Pre-filled in the greeting and the nickname input field | Shown before the user sets a real name. Pick a warm, gender-neutral word that: (1) feels natural in the greeting, (2) clearly signals "this is a placeholder you should replace". Avoid cold terms like "User" or formal terms like "Student". Examples: EN "Learner", ZH "同学". |
| `profile.bioPlaceholder` | Textarea placeholder in the profile editor | The bio is fed to the AI teacher to personalize lessons. The placeholder should hint at this — tell users *why* filling it in helps. |
| `pbl.chat.issueCompleteMessage` | System message when a PBL issue is completed | Contains `{{completed}}` and `{{next}}`. Should feel like a natural progression, not a mechanical status update. |
| `generation.textTruncated` / `generation.imageTruncated` | Toast warnings during PDF-based course generation | These are technical warnings shown briefly. Keep them short and factual. `textTruncated` has `{{n}}` (character count), `imageTruncated` has `{{total}}` and `{{max}}`. |
| `agentBar.readyToLearn` | Classroom page, above the agent role list | Conversational prompt to set the mood before class starts. Should feel inviting, not instructional. |
| `settings.agentsCollaboratingCount` | Settings panel, multi-agent mode description | Contains `{{count}}`. This is a status label, not a button — keep it descriptive. |
| `courseFormatLabel` / `courseFormatHint` | Home toolbar, `CourseFormatSelector` trigger button + its tooltip | The label should match the existing toolbar toggle style (e.g. "Course Format" / "课程形式"). `courseFormatHint` is the `title` attribute — keep it short since it surfaces as a native tooltip. |
| `courseFormatVideo` / `courseFormatPptAudio` / `courseFormatTextOnly` | Dropdown option labels in `CourseFormatSelector`, and the badge on classroom cards when a non-default format is active | These are short labels shown inside a 44px-tall listbox option next to a longer description. Keep them to 1-3 words. The same strings double as the card badge, so avoid punctuation. The three keys form a set — keep their register consistent (e.g. EN "Video" / "PPT + Audio" / "Text Only"; ZH "视频课堂" / "PPT + 语音" / "纯文本"). |
| `courseFormatVideoDesc` / `courseFormatPptAudioDesc` / `courseFormatTextOnlyDesc` | Secondary line under each option in the dropdown | One sentence describing what media each mode generates. Mention what is *skipped* in the lower modes (e.g. "no video generation", "no images, video or TTS") so users can tell modes apart. |
| `classroom.loading` / `classroom.loadingAriaLabel` | Spinner label on the classroom route while the stage hydrates from IndexedDB | `loading` is the visible text next to a `Loader2` spinner; `loadingAriaLabel` is the `aria-label` on the spinner element itself. Keep `loadingAriaLabel` short and action-neutral (e.g. "Loading" / "加载中"). |
| `classroom.errorTitle` / `classroom.retryLabel` | Error fallback UI on the classroom route when stage load fails | `errorTitle` is the heading above the error details; `retryLabel` is the button text for the retry action. `retryLabel` is also used as the button's `aria-label`, so avoid adding `{{…}}` here. |
| `toolbar.notImplemented` | Toast shown for copy / cut / paste canvas operations (placeholders) | A short, neutral "not implemented yet" message. Avoid apologetic tone — keep it factual. |
| `toolbar.moveUp` / `toolbar.moveDown` / `toolbar.undo` / `toolbar.redo` | `aria-label` + `title` on the icon buttons inside `ClassmateCard` (agent roster reorder + history controls) | These are **screen-reader-only labels** — they back small icon buttons with no visible text. Keep them to a single verb so a screen reader announces a concise action (e.g. "Move up" / "上移", "Undo" / "撤销"). |
