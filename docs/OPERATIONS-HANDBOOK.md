# 故障排查与防御手册（Operations Handbook）

> 本文档汇总 2026-08-05 深度排障期间修复的 17 个问题，按"症状 → 根因 → 修复 → 防范"记录，
> 供后续开发与运维直接对照，**防止同类问题再次出现**。

---

## 一、问题分类总览

| 类别 | 数量 | 代表问题 |
|------|------|---------|
| 编译 / 构建环境 | 4 | Turbopack 崩溃、webpack 缓存 EPERM、@upstash 缺失、TS 类型错误 |
| LLM / 模型配置 | 3 | deepseek 额度耗尽、scene-content 空 outline、LLM 超时 |
| 前端交互 / 状态 | 4 | 引导遮罩拦截、进入课堂按钮 disabled、ChunkLoadError、onboarding 注入 |
| 录屏脚本 / 进程 | 4 | 后台任务被杀、waitSceneReady 挂死、SSE 解析丢字段、导航按钮误点 |
| 沙箱 / 环境误判 | 2 | "写保护"误判、next.config distDir 默认值 |

---

## 二、逐项故障记录

### 2.1 Turbopack 对 Tailwind v4 特殊选择器编译崩溃

- **症状**：dev server 启动后首页 200，访问 `/classroom/[id]` 时返回 500，进程静默消失（无 OOM 日志）。
- **根因**：Turbopack 的 PostCSS 转换器无法解析 Tailwind v4 生成的含特殊 Unicode 字符的选择器（如 `:has()`）。
- **修复**：默认改用 webpack 编译模式（`--webpack`）；保留 `NOVA_DEV_MODE=turbopack` 用于对比验证。
- **防范**：生产构建（`next build`）不受影响；本地开发遇到课堂路由 500 时先检查编译模式。

### 2.2 webpack 缓存目录 EPERM（致命）

- **症状**：dev 日志反复出现 `EPERM: rename ...pack.gz_ -> ...pack.gz`；每次访问新路由全量重编译（42~89s）；浏览器加载 layout chunk 超时（ChunkLoadError）。
- **根因**：`.next2` 缓存目录被历史会话的文件句柄锁死，webpack 磁盘缓存写入失败 → 缓存失效 → 全量重编译 → chunk hash 漂移。
- **修复**：每次运行使用全新 `NOVA_DIST_DIR=.next-run-<ts>`，绕开被锁目录。
- **防范**：见 2.6 的"锁文件"检查；CI/容器中构建产物目录应每次全新。

### 2.3 `@upstash/*` 未安装导致编译期 Module not found

- **症状**：`/api/generate/scene-outlines-stream` 返回 400，日志 `Module not found: Can't resolve '@upstash/redis'`。
- **根因**：`lib/server/rate-limit.ts` 中 `await import('@upstash/redis')` 是可选依赖（未安装），但 webpack 编译期仍会解析。
- **修复**：`next.config.ts` 的 `serverExternalPackages` 声明 `@upstash/redis` 与 `@upstash/ratelimit`，编译期跳过解析，运行时无 `UPSTASH_REDIS_REST_URL` 时走内存回退。
- **防范**：任何"可选依赖"必须同时加 `serverExternalPackages` 或在运行时动态解析；新增可选包时检查 `types/*.d.ts` 是否存在。

### 2.4 LLM 模型额度耗尽 / 不可用

- **症状**：`deepseek-v4-flash-0731` 返回 `insufficient_quota`（免费额度耗尽）；`kimi/kimi-k3`、`MiniMax/MiniMax-M3` 返回 `invalid_parameter_error`（产品未激活）。
- **根因**：模型服务商侧配额/产品开通状态，非代码问题。
- **修复**：实测可用模型 `glm-5.2`、`qwen3.8-max`（300 字段落 7.8s vs 23.2s）；`.env.local` 全量指向 qwen3.8-max。
- **防范**：上线前用 `scripts/verify-models.mjs` 批量探活；`LLM_FALLBACK_MODELS` 只填已探活模型；模型可用性变更需走变更单。

### 2.5 scene-content 收到空 outline（产品级 bug）

- **症状**：`Scene Content API` 日志 `Generating content: "undefined" (undefined)` → 500 → 整门课程生成中断。
- **根因**：前端 SSE 解析 outlines 后，部分 outline 在传递至 scene-content 时字段丢失（title/type 为 undefined）。
- **修复**：`scene-content/route.ts` 增加 title 兜底（`场景-<type>-<stageId 前缀>`）与 type 兜底（undefined → slide；image → slide 因无图片 provider）。
- **防范**：所有生成类 API 对必填字段做兜底；前端传递对象前做 schema 校验（zod）。

### 2.6 引导遮罩（z-[300]）反复出现拦截交互

- **症状**：首页 textarea 可见但点击被 `div.fixed.inset-0.z-[300]` 拦截；遮罩移除后重新挂载。
- **根因 1**：注入 `nova-onboarding` 用 `version: 0`，而 store 版本为 2，migrate 将 `hasSeenIntro` 重置为 false。
- **修复 1**：注入 `version: 2` + 完整 state 字段。
- **根因 2**：遮罩内按钮文案与脚本选择器不匹配时无法点击关闭。
- **修复 2**：`dismissIntro` 三层兜底（点名按钮 → 遮罩内任意按钮 → 强制 DOM 移除）。
- **防范**：zustand persist 注入必须匹配 `version` 与完整 schema；UI 自动化脚本对遮罩做兜底处理。

### 2.7 "进入课堂"按钮永久 disabled

- **症状**：输入主题后按钮仍 disabled，页面显示"配置模型"（State A：无可用 provider）。
- **根因**：脚本向 `settings-storage` 注入 openai provider，但 schema 与 zustand persist(v4) 不匹配，merge 后 `providersConfig` 缺失 → `hasUsableProvider=false`。
- **修复**：去掉 settings-storage 注入，依赖 `server-providers.yml` 服务端配置（页面 `fetchServerProviders` 自动拉取）。
- **防范**：**绝不手工注入客户端 store 的持久化 key**；服务端配置优先。

### 2.8 ChunkLoadError（生产模式根治）

- **症状**：SPA 导航时 `Loading chunk app/layout failed`（webpack 按需编译导致 chunk hash 漂移，浏览器加载旧 URL）。
- **修复**：生产模式 `next build + next start`（全路由预编译，无按需编译、无 HMR、无 websocket）。
- **防范**：演示/录屏场景优先生产构建；dev 模式需配合路由预热（`prewarmRoutes`）与全新 distDir。

### 2.9 LLM 调用 120s 超时

- **症状**：`CircuitBreaker Timed out after 120000ms`，复杂场景内容生成失败。
- **根因**：glm-5.2 推理模型 thinking 占用大量 token 与时间。
- **修复**：`LLM_TIMEOUT_MS=300000`；默认模型换 qwen3.8-max（快 3 倍）。
- **防范**：推理模型场景必须调大超时；基准测试见 `docs/DEPENDENCY-TIERING.md`。

### 2.10 后台任务被会话回收（沙箱进程生命周期）

- **症状**：`run_in_background` 启动的 dev server 在 Agent 回合结束时被连带杀死。
- **修复**：脚本内 `spawn` dev server，进程生命周期绑定脚本（脚本退出自动清理）。
- **防范**：自动化脚本的长驻进程一律由脚本自身管理，不依赖外部后台任务。

### 2.11 录屏脚本 waitSceneReady 挂死

- **症状**：进入课堂后脚本停在"等待场景生成"，`page.locator` 永久挂起。
- **根因**：页面崩溃后 locator 等待永不返回。
- **修复**：简化为固定 15s 等待 + `.count().catch(() => 0)`。
- **防范**：所有页面轮询加超时与异常兜底，禁止无限等待。

### 2.12 "沙箱写保护"误判（认知纠正）

- **症状**：误认为沙箱禁止写已存在文件，为此启动 robocopy 复制方案耗时 30+ 分钟。
- **事实**：所有写测试 PASS；真正的限制是**旧会话创建的文件无法 rename/delete（EPERM）**，新文件可正常读写。
- **防范**：遇到 EPERM 先区分"写内容"与"重命名/删除"；写内容失败 ≠ 重命名失败。

---

## 三、启动前检查清单（Checklist）

每次在全新环境启动 Nova 前，按序检查：

```bash
# 1. 环境
node -v                    # 必须 >= 22 < 23
pnpm -v                    # 必须 10.x

# 2. 依赖
pnpm install               # 完整安装（或按 docs/DEPENDENCY-TIERING.md 分级）

# 3. 模型可用性（防 2.4）
node scripts/verify-models.mjs   # 探活默认模型

# 4. 配置
cat .env.local             # OPENAI_API_KEY / DEFAULT_MODEL / LLM_TIMEOUT_MS / NEXT_PUBLIC_NOVA_EDITOR_ENABLED

# 5. 启动（防 2.8，生产模式最稳）
pnpm build && pnpm start   # 或 pnpm dev（需接受按需编译延迟）

# 6. 冒烟
curl localhost:3000/api/health            # 200
curl localhost:3000/api/server-providers  # providers 非空
```

## 四、日志排查速查

| 日志特征 | 指向 |
|---------|------|
| `EPERM ...pack.gz_ -> .pack.gz` | 缓存目录被锁 → 换全新 `NOVA_DIST_DIR` |
| `Module not found: Can't resolve '@upstash'` | 可选依赖未加入 `serverExternalPackages` |
| `insufficient_quota` / `invalid_parameter_error` | 模型不可用 → 换可用模型 |
| `Generating content: "undefined"` | outline 缺字段 → route 兜底已修复，确认 build 版本 |
| `Timed out after 120000ms` | LLM 超时 → `LLM_TIMEOUT_MS` 调大 |
| `ChunkLoadError` | dev 按需编译 → 改用生产模式 |
| `Subtree intercepts pointer events` | 引导遮罩 → `dismissIntro` 三层兜底 |

---

*维护：本文档随每次排障更新。新增根因请补充到对应章节并登记日期。*
