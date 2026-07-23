<div align="center">
  <img src="assets/banner.svg" alt="Nova Banner" width="800" />
</div>

[English](README.md) | [中文](README.zh.md) | [日本語](README.ja.md)

<p align="center">
  <strong>多智能体 AI 课堂 · 将任意主题转化为互动学习体验</strong>
</p>

<p align="center">
  <a href="#"><img src="https://img.shields.io/badge/Next.js-16-black?logo=nextdotjs" alt="Next.js" /></a>
  <a href="#"><img src="https://img.shields.io/badge/React-19-149eca?logo=react" alt="React" /></a>
  <a href="#"><img src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript" alt="TypeScript" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Tailwind-4-38bdf8?logo=tailwindcss" alt="Tailwind" /></a>
  <a href="#"><img src="https://img.shields.io/badge/License-MIT-green" alt="License" /></a>
  <a href="#"><img src="https://img.shields.io/badge/Tests-2768%20passed-success" alt="Tests" /></a>
  <a href="#"><img src="https://img.shields.io/badge/LLM-20%2B%20providers-8b5cf6" alt="LLM Providers" /></a>
  <a href="#"><img src="https://img.shields.io/badge/i18n-8%20languages-pink" alt="i18n" /></a>
</p>

<p align="center">
  <a href="#功能">功能</a> ·
  <a href="#快速开始">快速开始</a> ·
  <a href="#架构">架构</a> ·
  <a href="#测试">测试</a> ·
  <a href="#项目结构">项目结构</a> ·
  <a href="#贡献">贡献</a>
</p>

---

## 概述

Nova 是一个多智能体教学平台。输入任意主题，AI 教师会生成结构化课程大纲、制作幻灯片、编写讲解词，并在虚拟课堂中完成授课。多个 AI 智能体各司其职——教师主导讲解，助教补充答疑，活跃者调节气氛。

它的定位不是又一个幻灯片生成器，而是一套具备角色分工、安全护栏与知识追踪的完整教学系统。

## 功能

### 课程生成

- **AI 大纲生成** — 将主题拆解为按知识依赖排序的递进式场景
- **幻灯片制作** — 每个场景自动生成包含标题、要点与流程图的幻灯片
- **语音讲解** — AI 教师以多引擎 TTS 自然语音逐场景讲解
- **互动测验** — 自动生成选择题与填空题，实时评分
- **知识图谱** — 可视化概念关联，串联课程中的关键知识点
- **PBL 模式** — 项目式学习，生成可交互的实践任务

### 多智能体课堂

| 智能体 | 职责 | 权限 |
|--------|------|------|
| AI 教师 | 主导教学，讲解核心概念 | 发言、幻灯片控制、聚光灯、白板 |
| AI 助教 | 辅助教学，回答问题 | 发言、白板、幻灯片控制 |
| 课堂活跃者 | 调节气氛 | 发言、白板 |

- **角色持久化** — 可自定义 10 种内置角色的名称、描述与权限，修改跨会话保留
- **运行时约束** — 每个角色的 `max_actions` 与 `max_turns` 在运行时强制执行
- **讨论编排** — Director Graph 管理智能体间的发言顺序与讨论流程

### 提示词工程与治理

- **24 个模板** — 覆盖大纲生成、内容创作、动作编排与测验生成
- **Snippet 系统** — 角色指南与动作类型以 Markdown 片段管理，无需重新编译即可编辑
- **安全护栏** — 对每个生成场景执行 PII 检测、毒性过滤与幻觉扫描
- **Skill 目录** — 5 个已注册技能，受白名单门控
- **REST API** — `GET /api/prompts` 查询模板，`GET /api/skills` 查询技能

### 基础设施

<details>
<summary><strong>LLM 提供商</strong></summary>

| 提供商 | 代表模型 |
|--------|---------|
| OpenAI | GPT-5.6, GPT-5.5, GPT-5.4 |
| Anthropic | Claude Opus 4.7, Claude Sonnet 4.5, Claude Haiku 4.5 |
| Google | Gemini 3.5 Flash, Gemini 3 Pro, Gemini 2.5 Pro |
| DeepSeek | DeepSeek-V4-Pro, DeepSeek-V4-Flash |
| 通义千问 | Qwen3.7-Max, Qwen3.6-Plus, Qwen3.5-Flash |
| 智谱 GLM | GLM-5.2, GLM-5.1 |
| Kimi | Kimi-K2.7, Kimi-K2.6 |
| MiniMax | MiniMax-M3, MiniMax-M2.7 |
| Grok | Grok-4.20 |
| 腾讯混元 | Hunyuan-3（预览版） |
| 小米 | MiMo v2.5 |
| OpenRouter | 多提供商聚合 |
| 硅基流动 | 全系列模型聚合 |
| 豆包 | Doubao Seed 2.x 系列 |
| Ollama | 本地模型 |
| Lemonade | 本地 AMD 模型 |

</details>

- **TTS** — OpenAI、硅基流动、豆包、Minimax、火山引擎
- **图片生成** — 硅基流动、Minimax、ComfyUI
- **网页搜索** — Tavily、SearXNG
- **文档解析** — AliDocMind、MinerU
- **MCP 工具** — 通过 Model Context Protocol 接入外部工具
- **国际化** — 英语、简体中文、繁体中文、日语、韩语、阿拉伯语、葡萄牙语、俄语（客户端 i18next 实现）
- **暗色模式** — 全站支持

## 架构

<div align="center">
  <img src="assets/architecture.svg" alt="Nova 架构图" width="800" />
</div>

数据流向：用户输入主题 → 提示词引擎组装 Prompt → LLM 生成内容 → 安全护栏扫描 → 多智能体编排 → 交互式课堂渲染。状态通过 Zustand 持久化到浏览器本地存储。

## 快速开始

### 前置要求

- Node.js 22+
- pnpm 10+

### 安装

```bash
git clone https://github.com/weed33834/nova.git
cd nova
pnpm install
```

### 配置

创建 `.env.local` 文件，至少配置一个 LLM 提供商：

```bash
# 方式一：直接配置 API 密钥
SILICONFLOW_API_KEY=your-key
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1

# 方式二：服务端托管配置（推荐）
cp server-providers.example.yml server-providers.yml
# 编辑 server-providers.yml 填入凭证，密钥仅保留在服务端
```

### 运行

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)，输入主题即可开始。

### 无密钥体验

点击首页的 **"Open Cached Demo Course"** 按钮，无需 API 密钥即可加载预置的「人工智能导论」课程。

## 测试

```bash
pnpm test          # 单元与组件测试（312 个文件 / 2768 个用例）
pnpm test:e2e      # 端到端测试（Playwright）
pnpm test:e2e:ui   # 带交互界面的端到端测试
pnpm lint          # ESLint 代码检查
pnpm typecheck     # TypeScript 类型检查
```

E2E 测试覆盖完整流程：首页 → 生成 → 课堂导航 → 测验交互。全部使用 Mock API，无需 LLM 密钥。

## 项目结构

```
nova/
├── app/                  # Next.js App Router
│   ├── api/              # API 路由（prompts, skills, generate/*）
│   ├── classroom/        # 课堂回放路由
│   └── generation-preview/
├── lib/                  # 核心逻辑
│   ├── ai/               # 多 LLM 提供商集成
│   ├── agent/            # 多智能体运行时
│   ├── choreography/     # 动画与特效
│   ├── guardrails/       # 安全护栏管线
│   ├── i18n/             # 客户端 i18next 语言资源
│   ├── orchestration/    # 角色管理与约束
│   └── prompts/          # 提示词模板与片段
├── components/           # React 组件
├── packages/             # 工作区子包
│   └── @nova/
│       ├── dsl/          # 领域类型定义
│       ├── renderer/     # 幻灯片渲染引擎
│       ├── importer/     # 文档导入
│       └── storage/      # 持久化层
├── e2e/                  # Playwright 测试
├── configs/              # 共享常量
└── assets/               # 静态资源与 Logo
```

## 技术栈

| 层面 | 技术 |
|------|------|
| 框架 | Next.js 16（App Router, Turbopack） |
| 语言 | TypeScript 5.8 |
| UI | React 19, Tailwind CSS 4, Radix UI |
| 状态 | Zustand（持久化） |
| AI | Vercel AI SDK，多提供商 |
| 测试 | Vitest, Playwright |
| 包管理 | pnpm Workspaces |

## 贡献

欢迎提交 Issue 和 Pull Request。提交前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

[MIT](LICENSE)
