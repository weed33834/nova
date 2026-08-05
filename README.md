<div align="center">
  <img src="assets/banner.svg" alt="Nova Banner" width="800" />
</div>

<p align="center">
  <strong>An AI-powered multi-agent classroom that turns any topic into an interactive lesson.</strong>
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./README-zh.md">中文</a>
</p>

<p align="center">
  <a href="https://nextjs.org"><img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs" alt="Next.js" /></a>
  <a href="https://react.dev"><img src="https://img.shields.io/badge/React-19-149eca?logo=react" alt="React" /></a>
  <a href="https://www.typescriptlang.org"><img src="https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript" alt="TypeScript" /></a>
  <a href="https://tailwindcss.com"><img src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss" alt="Tailwind" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-MIT-green" alt="License" /></a>
  <a href="#testing"><img src="https://img.shields.io/badge/Tests-3160%20passed-success" alt="Tests" /></a>
  <a href="#features"><img src="https://img.shields.io/badge/LLM-17%20providers-8b5cf6" alt="LLM Providers" /></a>
  <a href="#features"><img src="https://img.shields.io/badge/i18n-8%20languages-pink" alt="i18n" /></a>
</p>

---

## What is this?

Nova is a multi-agent teaching platform. Type a topic on the home page, and AI breaks it into a structured course outline, builds slides, writes narration, and delivers the lesson in a virtual classroom where multiple AI agents work together: a lead teacher, a teaching assistant, and a class clown who keeps the mood light.

It is not just a slide generator. It is a full teaching system with role separation, safety guardrails, and knowledge tracing.

<div align="center">
  <img src="assets/screenshots/home-hero.png" alt="Nova home page" width="900" />
  <p><em>Home page: enter any topic, or open the cached demo to try a full classroom instantly</em></p>
</div>

## Demo Video

> ~10 min walkthrough: **real LLM generation flow** (topic → outline → agents → slides → classroom) + **full classroom interaction** (playback / 24-scene browse / 14 settings tabs).

<p align="center">
  <video src="assets/Nova-完整演示-最终版.mp4" controls width="900" poster="docs/screenshots/04-classroom-playback.png">
    Your browser does not support the video tag. <a href="assets/Nova-完整演示-最终版.mp4">Download the video</a>.
  </video>
</p>

### Screenshots

| Home & topic input | LLM generation | Classroom playback |
|:---:|:---:|:---:|
| ![Home](docs/screenshots/01-home.png) | ![Generating](docs/screenshots/03-llm-generating.png) | ![Classroom](docs/screenshots/04-classroom-playback.png) |

| Scene sidebar | Interactive lab | Quiz scene |
|:---:|:---:|:---:|
| ![Sidebar](docs/screenshots/05-sidebar-scenes.png) | ![Lab](docs/screenshots/09-interactive-lab.png) | ![Quiz](docs/screenshots/10-quiz-scene.png) |

| Settings panel | Token usage | Model config |
|:---:|:---:|:---:|
| ![Settings](docs/screenshots/06-settings-panel.png) | ![Token](docs/screenshots/07-settings-token.png) | ![Models](docs/screenshots/08-settings-models.png) |

## Quick Start

### Prerequisites

- Node.js 22+
- pnpm 10+

### Install

```bash
git clone https://gitcode.com/badhope/nova.git
cd nova
pnpm install
```

> **Slow install?** See [docs/DEPENDENCY-TIERING.md](docs/DEPENDENCY-TIERING.md) for tiered installs:
> - Just want to run it fast: `pnpm install --prod` (skips dev toolchain, ~1–2 min)
> - Maintainers, install extras on demand: `node scripts/install-tiers.mjs core|extras|all`
>
> Missing optional features (charts, math, code highlight, MCP, document parsing, …) **never block startup** — they degrade gracefully (plain text / placeholder / guided error). Open **Settings → Capability Status** to see what's installed vs. missing and copy the install command in one click.

### Configure

Create a `.env.local` with at least one LLM provider:

```bash
# Option A: direct API key
OPENAI_API_KEY=your-key
OPENAI_BASE_URL=https://api.openai.com/v1

# Option B: server-side managed config (recommended — keys stay server-side)
cp server-providers.yml.example server-providers.yml
# Edit server-providers.yml with your credentials
```

Optional environment variables:

```bash
DEFAULT_MODEL=openai:your-model        # Default model (provider:model format)
LLM_TIMEOUT_MS=300000                  # LLM request timeout in milliseconds
FALLBACK_MODELS=openai:m2,openai:m3    # Comma-separated fallback models
LLM_THINKING_DISABLED=true             # Disable thinking/reasoning tokens
SKIP_TS_CHECK=true                     # Skip TypeScript checking during build
```

### Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) and enter a topic to start.

### No API key? Try the demo

Click **"Open Cached Demo Course"** on the home page to load a pre-built Introduction to AI course — no API key required.

## Features

### Course Generation

- **AI Outline Generation** — Breaks a topic into progressive scenes ordered by knowledge dependencies
- **Slide Production** — Each scene ships with titles, bullet points, and flow diagrams
- **Voice Narration** — The AI teacher narrates each scene with natural TTS across multiple engines
- **Interactive Quizzes** — Auto-generated multiple-choice and fill-in-the-blank questions with real-time scoring
- **Knowledge Graph** — Visual concept maps that connect key ideas across the course
- **PBL Mode** — Project-based learning with interactive practice tasks

### Multi-Agent Classroom

<div align="center">
  <img src="assets/screenshots/classroom.png" alt="Nova classroom" width="900" />
  <p><em>Classroom: a virtual room where AI teacher, assistant, and class clown co-teach</em></p>
</div>

| Agent | Role | Permissions |
|-------|------|-------------|
| AI Teacher | Leads the lesson and explains core concepts | Speak, slide control, spotlight, whiteboard |
| AI Assistant | Supports the teacher and answers questions | Speak, whiteboard, slide control |
| Class Clown | Lightens the mood | Speak |

- **Role Persistence** — Customize names, descriptions, and permissions for 10 built-in roles; changes persist across sessions
- **Runtime Constraints** — Per-role `max_actions` and `max_turns` enforced at runtime
- **Discussion Orchestration** — A Director Graph manages turn-taking and discussion flow

### Prompt Engineering & Governance

- **34 Templates** — Covering outline generation, content creation, action sequencing, and quiz generation
- **Snippet System** — Role guidelines and action types stored as Markdown snippets, editable without recompiling
- **Guardrails** — PII detection, toxicity filtering, and hallucination scanning on every generated scene
- **Skill Registry** — 5 registered skills gated by a whitelist
- **REST API** — `GET /api/prompts` to list templates, `GET /api/skills` to list skills

### Infrastructure

<details>
<summary><strong>17 LLM Providers</strong></summary>

| Provider | Example Models |
|----------|---------------|
| OpenAI | GPT-5.6, GPT-5.4 |
| Azure OpenAI | User-defined deployments |
| Anthropic | Claude Opus 4.8, Claude Sonnet 4.6 |
| Google | Gemini 3.5 Flash, Gemini 2.5 Pro |
| DeepSeek | DeepSeek-V4-Pro, DeepSeek-V4-Flash |
| Qwen | Qwen3.7 Plus, Qwen3.6 Flash |
| GLM | GLM-5.2, GLM-4.6 |
| Kimi | Kimi-K2.7, Kimi-K2.6 |
| MiniMax | MiniMax-M3 |
| SiliconFlow | Full model aggregation |
| Doubao | Doubao Seed series |
| OpenRouter | DeepSeek, and more |
| Grok | Grok 4.20, Grok 4.1 |
| Tencent Hunyuan | Hy3 Preview |
| Xiaomi MiMo | MiMo V2.5 Pro, MiMo V2 |
| Ollama | Local models |
| Lemonade | Local AMD models |

</details>

- **TTS** — OpenAI, SiliconFlow, Doubao, Minimax, Volcano
- **Image Generation** — SiliconFlow, Minimax, ComfyUI
- **Web Search** — Tavily, SearXNG
- **Document Parsing** — AliDocMind, MinerU
- **MCP Tools** — Connect external tools via Model Context Protocol
- **i18n** — English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Arabic, Portuguese, Russian
- **Dark Mode** — Site-wide support

### Enterprise Features

- **Quota Management** — Per-user generation quotas with `QUOTA_EXCEEDED` (402) responses
- **Input Validation** — All generation API routes validate input length, topic, and requirements
- **Audit Logging** — All API actions logged with retention policies (90-day default)
- **Rate Limiting** — Configurable per-endpoint rate limits
- **SSRF Protection** — URL allowlist/denylist for outbound requests
- **Content Moderation** — PII detection, toxicity filtering, and hallucination scanning
- **Role-Based Access** — 10 configurable agent roles with fine-grained permissions
- **Knowledge Tracing** — Bayesian knowledge tracing for student progress tracking

## Architecture

<div align="center">
  <img src="assets/architecture.svg" alt="Nova Architecture" width="800" />
</div>

Data flow: user enters a topic → the prompt engine assembles the prompt → LLM generates content → guardrails scan for safety → multi-agent orchestration → interactive classroom rendering. State is persisted to browser-local storage via Zustand.

## Testing

```bash
pnpm test          # Unit & component tests (340 files / 3155 cases)
pnpm test:e2e      # End-to-end tests (Playwright)
pnpm test:e2e:ui   # E2E with interactive UI
pnpm lint          # ESLint
pnpm typecheck     # TypeScript type checking
```

E2E tests cover the full flow: home → generation → classroom navigation → quiz interaction. All tests use mock APIs — no LLM key needed.

## Project Structure

```
nova/
├── app/                  # Next.js App Router
│   ├── api/              # API routes (prompts, skills, generate/*)
│   └── [locale]/         # i18n routing
├── lib/                  # Core logic
│   ├── ai/               # Multi-LLM provider integration
│   ├── agent/            # Multi-agent runtime
│   ├── choreography/     # Animations & effects
│   ├── guardrails/       # Safety pipeline
│   ├── orchestration/    # Role management & constraints
│   └── prompts/          # Prompt templates & snippets
├── components/           # React components
├── packages/             # Workspace sub-packages
│   └── @nova/
│       ├── dsl/          # Domain type definitions
│       ├── renderer/     # Slide rendering engine
│       ├── importer/     # Document import
│       └── storage/      # Persistence layer
├── e2e/                  # Playwright tests
├── configs/              # Shared constants
└── assets/               # Static assets & screenshots
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router, Turbopack) |
| Language | TypeScript 5.9 |
| UI | React 19, Tailwind CSS 4, Radix UI |
| State | Zustand (persisted) |
| AI | Vercel AI SDK, multi-provider |
| Testing | Vitest, Playwright |
| Package Manager | pnpm Workspaces |

## Mirrors

| Platform | URL | Role |
|----------|-----|------|
| **GitCode (primary)** | https://gitcode.com/badhope/nova | Canonical source, issues & PRs |
| GitHub (mirror) | https://github.com/weed33834/nova | Read-only mirror |
| Gitee (mirror) | https://gitee.com/badhope/nova | Read-only mirror |

> GitCode is the primary development platform. Please open issues and pull requests on GitCode. The three mirrors are kept in sync on every push.

## FAQ

**Q: The "Start" button on the home page is disabled (grey)?**
A: No usable LLM provider is configured. Check `OPENAI_API_KEY` in `.env.local`, or configure server-side credentials in `server-providers.yml` (recommended — keys stay server-side).

**Q: Generation fails with "model returned no valid scene content"?**
A: Usually the model's quota is exhausted or temporarily unavailable. Run `node scripts/verify-models.mjs` to probe availability, then set a working model in `DEFAULT_MODEL` / `LLM_FALLBACK_MODELS`. Verified working: `qwen3.8-max` (fast) and `glm-5.2` (stable).

**Q: `pnpm dev` is slow on classroom routes / ChunkLoadError?**
A: Dev mode compiles routes on demand (tens of seconds on first visit). For demos/recordings, use `pnpm build && pnpm start` (production mode — all routes precompiled).

**Q: How do I enable the "Edit Course" (Pro mode) button?**
A: Set `NEXT_PUBLIC_NOVA_EDITOR_ENABLED=true` in `.env.local` and rebuild. This variable is inlined into client bundles at build time — runtime-only changes won't take effect.

**Q: Other startup issues?**
A: See [docs/OPERATIONS-HANDBOOK.md](docs/OPERATIONS-HANDBOOK.md) — a troubleshooting handbook with 17 historical issues (symptom → root cause → fix → prevention) and a pre-flight checklist.

## Contributing

Issues and pull requests are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting.

## License

[MIT](LICENSE)
