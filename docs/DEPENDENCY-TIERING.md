# 分级安装与依赖治理（Dependency Tiering）

> 目标：克隆快、核心安装快、高级功能按需补齐，避免每次 `pnpm install` 等太久。

## 问题背景

Nova 单仓库有 **116 个生产依赖 + 33 个开发依赖 + 7 个 workspace 子包**（postinstall 会构建全部子包）。全量安装一次耗时数分钟，其中大部分依赖服务于**可延迟加载的高级功能**（图表、代码高亮、公式、富文本编辑器、流程图、智能体框架、文档解析……），并不在启动首屏与课程生成主链路上。

## 依赖分级

### Tier 1 — Core（启动必需，67 个）

框架、状态管理、UI 基础、认证、AI SDK、i18n、数据库、工具、workspace 子包。

```text
next react react-dom · zustand immer · motion lucide-react radix-ui sonner
next-auth bcryptjs · zod typebox · ai @ai-sdk/* · i18next react-i18next
better-sqlite3 drizzle-orm dexie · @sentry/nextjs pino opossum
@nova/dsl @nova/importer @nova/renderer @nova/storage pptxgenjs mathml2omml
```

**判定标准**：首页 / 课堂首屏渲染、课程生成主链路、多智能体运行时不依赖它 → 归 Core。

### Tier 2 — Extras（按需，45 个）

| 依赖 | 服务功能 | 缺失影响 |
|------|---------|---------|
| `echarts` | 数据图表可视化 | 图表场景降级为静态图 |
| `shiki` `@streamdown/code` `streamdown` | 代码高亮 | 代码块无高亮 |
| `katex` `temml` | 数学公式渲染 | 公式显示为纯文本 |
| `prosemirror-*`（12 个） | 富文本编辑器（Pro 模式） | Pro 编辑器不可用 |
| `@xyflow/react` | 流程图 / 节点画布 | 流程图场景不可用 |
| `@langchain/core` `@langchain/langgraph` | 智能体编排框架 | 高级编排降级 |
| `@assistant-ui/*` | 聊天 UI 组件 | 聊天面板降级 |
| `@modelcontextprotocol/sdk` | MCP 工具接入 | MCP 配置面板不可用 |
| `@alicloud/*`（4 个） | 阿里云文档解析 | 云文档解析不可用 |
| `@aws-sdk/client-s3` | S3 对象存储 | 云存储不可用 |
| `unpdf` `sharp` | PDF / 图片处理 | 文档解析降级 |
| `@fontsource/*`（9 个） | 多语言字体 | 部分字体缺失 |

**前端已具备懒加载基础**：`next.config.ts` 的 `experimental.optimizePackageImports` + 代码层动态 `import()`，Extras 包不会阻塞首屏渲染。

## 前端能力状态（用户可见的"哪些可用 / 哪些没装"）

前端通过能力检测机制，让"已安装 / 未安装"在界面上直观可见：

| 表现 | 位置 |
|------|------|
| **能力状态卡片**：每项功能显示 ✓ 已安装（绿色）或 ⚠ 未安装（灰色）+ 复制安装命令 | 设置面板顶部 |
| **功能入口降级**：已做动态加载改造的功能（如代码高亮），未安装时降级渲染（纯文本 `<pre>`），不报错 | 幻灯片 / 课堂内元素 |
| **安装引导**：灰色功能旁有"复制安装命令"按钮，或一键复制全部未安装命令 | 设置面板卡片 |

实现链路：

```text
lib/capabilities.ts            功能 → 依赖包 注册表（前后端共享）
lib/server/capabilities.ts     服务端 createRequire.resolve 探测（不加载包体）
app/api/capabilities/route.ts  GET /api/capabilities → { capabilities, missing, allInstalled }
lib/hooks/use-capabilities.ts  前端 Hook（fetch + 缓存 + isInstalled(id)）
components/settings/capability-status.tsx  设置面板能力状态卡片
```

### 降级改造清单（已完成 ✅ 2026-08-05 全部改造完毕）

注册表里所有 Extras 条目 `downgradeable: true` —— **未装包均可正常启动并降级**。

| 功能 | 依赖 | 降级表现 |
|------|------|---------|
| 代码高亮 | `shiki` | 纯文本 `<pre>`（type-only import + 动态 import） |
| 数据图表 | `echarts` | 图表占位提示（core+charts+components+renderers 动态注册） |
| 数学公式 | `katex` `temml` | 原样 LaTeX 文本（`lib/math-loader.ts` 懒加载 + 同步缓存） |
| 智能体编排 | `@langchain/*` | 单 agent 直通生成（director-graph 动态化 + stateless-generate fallback） |
| MCP 工具 | `@modelcontextprotocol/sdk` | API 返回 501 + 安装指引（client/server 均动态加载） |
| 文档解析 | `@alicloud/*` `unpdf` | 抛出带安装指引的错误（SDK 动态加载） |
| 对象存储 | `@aws-sdk/client-s3` | 懒加载报错指引（S3Client 动态 import） |
| 压缩导出 | `jszip` | 返回提示信息（动态 import） |
| 扩展字体 | `@fontsource/*` | 浏览器回退默认字体 |

**Core 必装（不降级）**：`@assistant-ui/*`（聊天）、`streamdown`（流式 Markdown 渲染）、`@xyflow/react`（画布）、`prosemirror-*`（编辑器）—— 产品核心交互，砍掉等于砍掉产品。

> **改造原则**（新增可选依赖时遵守）：
> 1. **type-only import** 保留类型（编译期擦除），运行时 `await import()` 加载。
> 2. 同步渲染路径用「fire-and-forget 预取 + 缓存」（见 `lib/math-loader.ts`）。
> 3. 未安装必须返回**可读的降级结果**（占位 UI / 原样文本 / 指引错误），不得静默失败。
> 4. 改完在 `lib/capabilities.ts` 标记 `downgradeable: true`。

## 安装方式

### 方式一：完整安装（默认，推荐首次运行）

```bash
pnpm install          # 全部依赖 + workspace 子包构建
pnpm dev              # 启动开发服务器
```

### 方式二：快速启动（跳过开发工具链）

跳过 33 个 devDependencies（测试 / 构建 / 格式化工具）：

```bash
pnpm install --prod
NODE_ENV=production pnpm start   # 或 pnpm dev
```

> 注意：`--prod` 会跳过 ESLint / Vitest / Playwright / TypeScript 等，适合只运行不开发的场景。

### 方式三：分级安装（维护者 / 深度定制）

```bash
node scripts/install-tiers.mjs core     # 仅 Core 83 个（含核心交互，可正常启动）
node scripts/install-tiers.mjs extras   # 补齐 Extras 30 个（全部可降级，按需安装）
node scripts/install-tiers.mjs all      # 全量（等价 pnpm install）
```

> ⚠️ 分级安装依赖代码层的动态 `import()`：**未安装 Extras 包时，对应功能必须走降级路径**，否则编译/运行会报 Module not found。当前版本以"完整安装"为主路径，分级工具供深度定制者评估。

## 治理规则（防止依赖膨胀回归）

1. **新增依赖前自问**：它服务核心主链路还是高级功能？高级功能 → 标注为 Extras。
2. **优先动态 import**：首屏不需要的模块用 `await import()` 懒加载（配合 `optimizePackageImports`）。
3. **不引入重复方案**：已存在的（如 `jsonrepair` / `partial-json`）先复用，不另起炉灶。
4. **锁定版本**：使用 `pnpm-lock.yaml`，依赖升级走 PR 单独评审。
5. **监控安装体积**：`pnpm install --reporter=append-only` 观察耗时，超过 3 分钟需触发评估。

## 已治理的历史（2026-08-05）

| 问题 | 治理措施 |
|------|---------|
| webpack 缓存 EPERM 导致每次全量重编译 | 每次运行使用全新 `NOVA_DIST_DIR` 绕开被沙箱锁定的 `.next2` |
| Turbopack 对 Tailwind v4 特殊选择器编译崩溃 | 默认使用 webpack 编译模式（`NOVA_DEV_MODE` 可切回 Turbopack 对比） |
| `@upstash/*` 动态 import 编译期 Module not found | `next.config.ts` `serverExternalPackages` 声明为外部依赖 |
| scene-content 收到空 outline 导致 500 | route.ts 增加 title / type 兜底（undefined → slide） |
| deepseek-v4-flash-0731 免费额度耗尽 | `.env.local` 全量切换至 qwen3.8-max（实测 7.8s/300字，快 3 倍） |
| LLM 生成复杂场景 120s 超时 | `LLM_TIMEOUT_MS=300000` |
| Chrome 加载 layout chunk 超时（ChunkLoadError） | 生产模式 `next build + next start`，全路由预编译 |
| onboarding 遮罩反复出现 | 注入格式修正（`nova-onboarding` version=2 + 完整 state） |
