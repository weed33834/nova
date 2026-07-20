# Nova

个性化多智能体学习平台 —— 将任意主题转化为互动课堂体验。

## 功能特性

### 课程生成

- **AI 大纲生成** — 输入主题，自动生成结构化多场景课程大纲
- **幻灯片生成** — 每个场景自动生成幻灯片（标题、要点、布局提示）
- **语音合成** — AI 教师用自然语音讲解每个场景
- **知识图谱** — 可视化概念关联图，连接课程关键知识点
- **互动测验** — 自动生成测验题目，检查学习效果
- **多格式支持** — 视频、互动、PBL（项目式学习）三种模式

### 多智能体课堂

- **AI 教师** — 主导教学，控制幻灯片，讲解概念
- **AI 助教** — 辅助教师，回答问题，提供补充材料
- **课堂活跃者** — 适时调节气氛
- **角色持久化** — 可自定义智能体显示名称、描述、权限，修改跨会话保留
- **运行时约束** — 每个角色的 `max_actions` 和 `max_turns` 在运行时强制执行

### 提示词工程与治理

- **34 个提示词模板**，每个附带版本化 `config.json` 元数据
- **Snippet 系统** — 可复用 Markdown 代码块，角色指南无需重新编译即可编辑
- **安全护栏管线** — 每个生成场景经过 PII、毒性、幻觉扫描
- **Skill 目录** — 5 个已注册技能，受白名单门控，可通过 REST API 查询
- **提示词管理 API** — `GET /api/prompts` 列出所有模板及元数据

### 基础设施

- **20+ LLM 提供商** — OpenAI、Claude、Gemini、DeepSeek、Qwen、GLM、Kimi、MiniMax、硅基流动、豆包、Ollama 等
- **服务端托管提供商** — 通过 `server-providers.yml` 配置，密钥不暴露给客户端
- **TTS 提供商** — OpenAI、硅基流动、豆包、Minimax、火山引擎
- **图片生成** — 硅基流动、Minimax、ComfyUI
- **网页搜索** — Tavily、SearXNG
- **文档解析** — AliDocMind、MinerU
- **MCP 工具集成** — 通过 Model Context Protocol 连接外部工具
- **国际化** — 8 种语言（en、zh-CN、zh-TW、ja、ko、ar、pt-BR、ru）
- **暗色模式**

## 快速开始

### 前置要求

- Node.js 20+
- pnpm 10+

### 安装

```bash
git clone https://gitcode.com/badhope/nova.git
cd nova
pnpm install
```

### 配置

创建 `.env.local` 文件，至少配置一个 LLM 提供商：

```bash
# 示例：硅基流动
SILICONFLOW_API_KEY=你的密钥
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
```

或使用服务端托管配置：

```bash
cp server-providers.example.yml server-providers.yml
# 编辑 server-providers.yml 填入你的提供商凭证
```

### 运行

```bash
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000)。

### 快速体验（无需 API 密钥）

点击首页的 **"秒开缓存演示课程"** 按钮，即可加载预置课程。

## 测试

```bash
pnpm test          # 单元和组件测试（312 个文件，约 2700 个测试）
pnpm test:e2e      # 端到端测试（Playwright）
pnpm test:e2e:ui   # 带交互式 UI 的端到端测试
pnpm lint          # ESLint 代码检查
pnpm typecheck     # TypeScript 类型检查
```

## 项目结构

```
nova/
├── app/                  # Next.js App Router（页面、API 路由）
├── lib/                  # 核心业务逻辑
│   ├── ai/               # LLM 提供商集成
│   ├── agent/            # 多智能体运行时
│   ├── choreography/     # 幻灯片动画与特效
│   ├── guardrails/       # 内容安全管线
│   ├── i18n/             # 国际化
│   ├── orchestration/    # Director graph 与角色管理
│   ├── prompts/          # 提示词模板与代码片段
│   └── server/           # 服务端生成逻辑
├── components/           # React UI 组件
├── packages/             # 工作区子包（@nova/dsl、renderer、importer、storage）
├── e2e/                  # Playwright E2E 测试
├── configs/              # 共享常量
└── public/               # 静态资源
```

## 技术栈

- **框架**：Next.js 16（App Router, Turbopack）
- **语言**：TypeScript 5.8
- **UI**：React 19, Tailwind CSS, Radix UI
- **状态管理**：Zustand
- **AI**：Vercel AI SDK，多提供商
- **测试**：Vitest, Playwright
- **包管理**：pnpm workspaces

## 许可证

MIT
