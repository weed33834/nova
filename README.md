# Nova

A personalized multi-agent learning platform that turns any topic into an interactive classroom experience.

## Features

### Course Generation

- **AI-driven outline** — enter a topic, get a structured multi-scene course outline
- **Slide generation** — each scene gets auto-generated slides with titles, bullets, and layout hints
- **Speech synthesis** — AI teacher narrates each scene with natural-sounding TTS
- **Knowledge graph** — visual concept map connecting key topics across the course
- **Interactive quizzes** — auto-generated quiz questions to check understanding
- **Multi-format support** — Video, Interactive, and PBL (Project-Based Learning) modes

### Multi-Agent Classroom

- **AI Teacher** — leads the lesson, controls slides, explains concepts
- **AI Assistant** — supports the teacher, answers questions, provides supplementary material
- **Class Clown** — keeps the mood light with occasional humor
- **Role persistence** — customize agent display names, descriptions, and permissions; changes persist across sessions
- **Runtime constraints** — `max_actions` and `max_turns` enforced at runtime per role

### Prompt Engineering & Governance

- **34 prompt templates** with versioned `config.json` metadata sidecars
- **Snippet system** — reusable markdown blocks for role guidelines, editable without recompiling
- **Guardrails pipeline** — PII, toxicity, and hallucination scanning on every generated scene
- **Skill catalog** — 5 registered skills with allowlist gating, inspectable via REST API
- **Prompt management API** — `GET /api/prompts` lists all templates with metadata

### Infrastructure

- **20+ LLM providers** — OpenAI, Claude, Gemini, DeepSeek, Qwen, GLM, Kimi, MiniMax, SiliconFlow, Doubao, Ollama, and more
- **Server-managed providers** — configure providers via `server-providers.yml` without exposing keys to the client
- **TTS providers** — OpenAI, SiliconFlow, Doubao, Minimax, Volcano
- **Image generation** — SiliconFlow, Minimax, ComfyUI
- **Web search** — Tavily, SearXNG
- **Document parsing** — AliDocMind, MinerU
- **MCP tool integration** — connect external tools via Model Context Protocol
- **Internationalization** — 8 languages (en, zh-CN, zh-TW, ja, ko, ar, pt-BR, ru)
- **Dark mode**

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 10+

### Install

```bash
git clone https://gitcode.com/badhope/nova.git
cd nova
pnpm install
```

### Configure

Create a `.env.local` file with at least one LLM provider:

```bash
# Example: SiliconFlow
SILICONFLOW_API_KEY=your-key-here
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
```

Or use the server-managed provider config:

```bash
cp server-providers.example.yml server-providers.yml
# Edit server-providers.yml with your provider credentials
```

### Run

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

### Quick Demo (No API Key Needed)

Click **"秒开缓存演示课程"** on the home page to load a pre-built course instantly.

## Testing

```bash
pnpm test          # Unit & component tests (312 files, ~2700 tests)
pnpm test:e2e      # End-to-end tests (Playwright)
pnpm test:e2e:ui   # E2E with interactive UI
pnpm lint          # ESLint
pnpm typecheck     # TypeScript checking
```

## Project Structure

```
nova/
├── app/                  # Next.js App Router (pages, API routes)
├── lib/                  # Core business logic
│   ├── ai/               # LLM provider integration
│   ├── agent/            # Multi-agent runtime
│   ├── choreography/     # Slide animation & effects
│   ├── guardrails/       # Content safety pipeline
│   ├── i18n/             # Internationalization
│   ├── orchestration/    # Director graph & role management
│   ├── prompts/          # Prompt templates & snippets
│   └── server/           # Server-side generation logic
├── components/           # React UI components
├── packages/             # Workspace packages (@nova/dsl, renderer, importer, storage)
├── e2e/                  # Playwright E2E tests
├── configs/              # Shared constants
└── public/               # Static assets
```

## Tech Stack

- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5.8
- **UI**: React 19, Tailwind CSS, Radix UI
- **State**: Zustand
- **AI**: Vercel AI SDK, multi-provider
- **Testing**: Vitest, Playwright
- **Package Manager**: pnpm workspaces

## License

MIT
