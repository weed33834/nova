// 真实课程完整流程录制脚本（教材示例）
// - 全程录屏 (Playwright recordVideo)
// - 每个关键界面截图
// - 拟人化鼠标移动 + 逐字输入
//
// 流程：首页输入主题 → 进入课堂 → 生成加载 → 课堂播放(交互视频) →
//       多智能体讨论(AI 课堂对话) → 切换场景 → 测验作答 → 提交 →
//       AI 批改 → 答题报告/成绩单
//
// 所有 LLM 调用走 .env.local 里配置的阿里云百炼密钥。

import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readdirSync, renameSync, statSync, writeFileSync, createWriteStream } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const DEV_PORT = new URL(BASE).port || '3100';
// dev server 由脚本自启（本机 run_in_background 后台进程会随会话回收/静默死亡，
// 只有脚本自身 spawn 才能把 dev 生命周期绑定到脚本：脚本活着 dev 就活着，脚本结束自动 kill）
let devProc = null;

async function startDev() {
  if (process.env.BASE_URL) {
    log('外部 BASE_URL 已指定，跳过自启 dev');
    return;
  }
  const nextBin = path.join(__dirname, '..', 'node_modules', 'next', 'dist', 'bin', 'next');
  const devLogPath = path.join(__dirname, '..', 'dev-walkthrough.log');
  // 生产模式（NOVA_PRODUCTION=true）：用预构建产物 next start，无按需编译、
  // 无 HMR websocket、无 ChunkLoadError，浏览器 manifest 恒定，是录屏的最稳路径。
  // 需先跑 `NOVA_DIST_DIR=.next-prod-xxx SKIP_TS_CHECK=true next build` 生成产物，
  // 再以相同 NOVA_DIST_DIR 启动本脚本。
  const prod = process.env.NOVA_PRODUCTION === 'true';
  if (prod) {
    const prodDist = process.env.NOVA_DIST_DIR || '.next';
    log(`生产模式: next start -p ${DEV_PORT} (distDir=${prodDist})`);
    devProc = spawn(
      process.execPath,
      [nextBin, 'start', '-p', DEV_PORT],
      {
        cwd: path.join(__dirname, '..'),
        env: {
          ...process.env,
          NODE_OPTIONS: '--max-old-space-size=8192',
          NEXT_TELEMETRY_DISABLED: '1',
          NOVA_DIST_DIR: prodDist,
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      },
    );
    const devLog = createWriteStream(devLogPath, { flags: 'a' });
    devProc.stdout.pipe(devLog);
    devProc.stderr.pipe(devLog);
    const deadline = Date.now() + 60000;
    while (Date.now() < deadline) {
      try {
        const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(5000) });
        if (r.ok) {
          log(`生产 server ready @ ${BASE}（PID ${devProc.pid}）`);
          return;
        }
      } catch {}
      await new Promise((res) => setTimeout(res, 2000));
    }
    throw new Error(`生产 server 启动超时（${BASE}），日志见 dev-walkthrough.log`);
  }
  // 每次运行用全新 distDir（NOVA_DIST_DIR 覆盖 next.config.ts 的默认 .next2）：
  // 旧 .next2 缓存目录会被历史会话锁死（webpack 写缓存 rename 时报 EPERM），
  // 缓存写失败 → 每次全量重编译 → chunk hash 漂移 → 浏览器加载 layout chunk
  // 失败（ChunkLoadError / Invalid or unexpected token）→ RootLayout 挂不上 →
  // ServerProvidersInit 不执行 → fetchServerProviders 不跑 → "进入课堂" disabled。
  // 全新目录绕开文件锁，编译产物与浏览器 manifest 保持一致。
  const freshDist = '.next-run-' + Date.now();
  log(`distDir: ${freshDist}（绕开被锁定的 .next2 缓存）`);
  // 编译模式：Turbopack 对 Tailwind v4 特殊类名（:has() 等）转译不稳定，
  // 实测在编译 /classroom/[id] 路由时 PostCSS 转换器报特殊字符解析错误，
  // 导致 GET / 返回 500、dev server 进程静默消失。webpack 模式可正常 Ready。
  // 默认走 webpack；Turbopack 仅在显式 NOVA_DEV_MODE=turbopack 时启用（用于对比验证）。
  const devMode = process.env.NOVA_DEV_MODE === 'turbopack' ? '--turbopack' : '--webpack';
  log(`dev 编译模式: ${devMode}`);
  devProc = spawn(
    process.execPath,
    [nextBin, 'dev', devMode, '-p', DEV_PORT],
    {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        NODE_OPTIONS: '--max-old-space-size=8192',
        NEXT_TELEMETRY_DISABLED: '1',
        NOVA_DIST_DIR: freshDist,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  const devLog = createWriteStream(devLogPath, { flags: 'a' });
  devProc.stdout.pipe(devLog);
  devProc.stderr.pipe(devLog);
  const deadline = Date.now() + 180000;
  while (Date.now() < deadline) {
    try {
      // 探测 /api/health（轻量路由，避免首页首编慢导致误判）；超时放宽到 8s
      const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        log(`dev server ready @ ${BASE}（自启 PID ${devProc.pid}）`);
        return;
      }
    } catch {}
    await new Promise((res) => setTimeout(res, 2000));
  }
  throw new Error(`dev server 自启超时（${BASE}），日志见 dev-walkthrough.log`);
}

async function stopDev() {
  if (!devProc) return;
  try { devProc.kill(); } catch {}
  devProc = null;
}

// dev 存活探测：dev 崩溃时页面会一直挂在加载态，脚本若只轮询页面会傻等 10 分钟。
// 探测失败立即抛错中止，避免"卡死无感知"。
// 注意：Turbopack 编译课堂路由时单次 GET / 可能 >3s，故超时放宽到 15s，
// 且需连续 2 次失败才判定失联（避免编译高峰误杀本可成功的录制）。
let devMisses = 0;
async function assertDevAlive(step) {
  try {
    // 探测 /api/health（轻量路由，不受首页首编影响）
    const r = await fetch(`${BASE}/api/health`, { signal: AbortSignal.timeout(15000) });
    if (r.ok) { devMisses = 0; return; }
    throw new Error('bad status ' + r.status);
  } catch {
    devMisses += 1;
    if (devMisses >= 2) {
      devMisses = 0;
      throw new Error(`dev server 已失联（步骤「${step}」期间连续探测失败，疑编译课堂路由 OOM），中止录制。日志见 dev-walkthrough.log`);
    }
  }
}
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets', 'walkthrough');
const VIDEO_DIR = path.join(OUT, 'video');
// 每次运行用独立子目录，避免与历史残留的 .webm 混淆（重命名只扫描本 run 目录）
const RUN_ID = 'run-' + Date.now();
const RUN_DIR = path.join(VIDEO_DIR, RUN_ID);
// 截图也写入本 run 目录：跨 run 共享 shots/ 会被后续运行覆盖，导致交付物截图来自不同课程
const SHOT_DIR = path.join(RUN_DIR, 'shots');
mkdirSync(VIDEO_DIR, { recursive: true });
mkdirSync(RUN_DIR, { recursive: true });
mkdirSync(SHOT_DIR, { recursive: true });

// 主题：明确要求课程包含「圆桌讨论」互动场景（AI 对话）+「随堂测验」场景（AI 批改+成绩单），
// 否则模型可能只生成极简课程（无圆桌、无测验），导致 chat/quiz 步骤无法录制。
// 已通过 outline API 实测：该主题会稳定生成「光合作用圆桌讨论」(interactive→圆桌) 与「随堂测验」(quiz) 场景。
// 主题设计要点（踩坑记录）：
// 1) 不要要求「圆桌讨论互动场景」——课堂圆桌区在 playback 模式下恒常渲染，与场景类型无关；
//    强行索要会让模型给 interactive 场景编造出枚举外的 widgetType（实测 "discussion"），
//    触发 scene-content 500，整门课程塌缩成 1 个场景。
// 2) quiz 是合法场景类型，可以且应当显式要求，否则模型常只产出纯幻灯片。
// 3) 互动环节用「可视化/模拟」措辞引导，落到 simulation/diagram 等受支持的 widget 类型上。
const TOPIC = [
  '光合作用：植物如何利用阳光、水和二氧化碳制造有机物并释放氧气？',
  '请讲清场所（叶绿体）、原料、产物、能量变化，以及它对地球生命与碳氧平衡的意义。',
  '',
  '课程要求：',
  '1. 用幻灯片循序讲清核心概念（原料、场所、光反应与暗反应、产物、能量流动）。',
  '2. 安排一个可交互的模拟或示意图环节，让学生调节光照强度等变量观察产氧速率变化。',
  '3. 必须包含一个「随堂测验」场景：若干道单选题，学生作答后自动批改并给出得分与解析。',
].join('\n');

const log = (...a) => console.log('[walkthrough]', ...a);
let currentStepVar = 'init';
const STATUS_FILE = path.join(OUT, 'status.txt');
const writeStatus = (extra = '') => {
  try {
    const m = process.memoryUsage();
    const mb = (m.heapUsed / 1024 / 1024).toFixed(0);
    writeFileSync(
      STATUS_FILE,
      `${new Date().toISOString()} | step=${currentStepVar} | heap=${mb}MB | ${extra}\n`,
    );
  } catch {}
};
const step = (s) => {
  currentStepVar = s;
  writeStatus('started');
  console.log('\n========== ' + s + ' ==========');
};

// 拟人化移动 + 点击
async function humanClick(page, locator, label) {
  const box = await locator.first().boundingBox();
  if (!box) throw new Error('找不到元素: ' + label);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 40, cy - 30, { steps: 8 });
  await page.mouse.move(cx, cy, { steps: 10 });
  await page.waitForTimeout(180);
  await page.mouse.click(cx, cy);
  log('点击:', label);
}

async function humanType(page, locator, text, label) {
  await locator.first().click();
  await page.keyboard.type(text, { delay: 28 });
  log('输入:', label, '->', text.slice(0, 24) + (text.length > 24 ? '…' : ''));
}

const shotCount = { n: 0 };
async function shot(page, name) {
  shotCount.n += 1;
  const file = path.join(SHOT_DIR, String(shotCount.n).padStart(2, '0') + '-' + name + '.png');
  await page.screenshot({ path: file });
  log('截图:', path.basename(file));
  return file;
}

// 等待 Next.js dev 编译完成：Next 16 dev 模式会在左下角显示橙色"Compiling"圆角胶囊，
// 编译结束后才消失。点击按钮前如果还在 Compiling，浏览器内的 JS 绑定的是旧 chunk URL，
// 后续 ChunkLoadError 会导致按钮无响应。整个会话总共等待到 timeout 为止，超时则
// 视为仍在编译中（实际页面可能已可用），继续往下走。
async function waitForCompileDone(page, timeoutMs = 120000) {
  const start = Date.now();
  let lastSeen = null;
  while (Date.now() - start < timeoutMs) {
    // 2026-08-05 实际产物：fixed left bottom 的按钮含文字 "Compiling" 与闪烁圆点
    const compiling = await page
      .locator('button:has-text("Compiling"), :text("Compiling")')
      .first()
      .isVisible()
      .catch(() => false);
    if (!compiling) {
      // 再多观察 1.5s 确认不会又冒出来（webpack 可能在编译途中再次触发）
      await page.waitForTimeout(1500);
      const stillCompiling = await page
        .locator(':text("Compiling")')
        .first()
        .isVisible()
        .catch(() => false);
      if (!stillCompiling) {
        log('编译指示已消失（耗时 ' + ((Date.now() - start) / 1000).toFixed(1) + 's）');
        return;
      }
    }
    lastSeen = compiling;
    await page.waitForTimeout(1500);
  }
  log('⚠ 等待编译完成超时（' + timeoutMs + 'ms），继续执行');
}

// 预热会"按需编译"的 API 路由 + 页面路由：webpack dev 模式下，首次访问某路由才触发
// 编译，而编译会让既有 chunk 失效 → 浏览器 SPA 内加载旧 chunk URL → ChunkLoadError。
// 解决：正式走流程前，先用 Node fetch 把关键路由全部编译掉。
// - /api/generate/scene-outlines-stream：POST 触发编译（错误状态码无关紧要）
// - /generation-preview：GET 触发该页 chunk 编译（router.push 时不再触发编译）
// - /classroom/prewarm：GET 触发动态路由 /classroom/[id] chunk 编译
async function prewarmRoutes() {
  for (const [path, body] of [
    ['/api/generate/scene-outlines-stream', JSON.stringify({ requirements: { requirement: 'prewarm' } })],
    ['/api/health', null],
    ['/generation-preview', null],
    ['/classroom/prewarm', null],
  ]) {
    try {
      const r = await fetch(BASE + path, {
        method: body ? 'POST' : 'GET',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: AbortSignal.timeout(120000),
      });
      log(`预热 ${path} → HTTP ${r.status}（编译已完成，状态码无关紧要）`);
    } catch (e) {
      log(`预热 ${path} 失败: ${e.message}`);
    }
  }
}

async function waitSceneReady(page, timeoutMs = 360000) {
  // 等待课堂生成完成：侧边栏出现若干场景，且状态不再显示“生成中”
  const start = Date.now();
  let lastCount = -1;
  let stable = 0;
  while (Date.now() - start < timeoutMs) {
    const items = await page.locator('[data-testid="scene-item"]').count();
    const status = await page.locator('[data-tour="status-message"]').first().textContent().catch(() => '');
    const generating = /生成中|Generating|加载中|Loading|正在生成|正在处理/i.test(status || '');
    log(`场景项=${items} 状态="${status?.slice(0, 30) || '无'}" 生成中=${generating}`);
    writeStatus(`场景项=${items} 生成中=${generating}`);
    // 阈值设为 >=3：多数课程有 5+ 场景；若模型只生成 2-3 个也不至于卡 6 分钟
    // 阈值设为 >=1：某些情况下（outline 前端传递丢失）课堂只生成了 1-2 个场景，
    // 卡在 >=3 会等到 8min 超时退出。>=1 确保至少一个场景就可以继续录制后续步骤。
    if (items >= 1 && !generating) {
      stable += 1;
      if (stable >= 2) return items;
    } else {
      stable = 0;
    }
    lastCount = items;
    await page.waitForTimeout(3500);
  }
  return lastCount;
}

async function dismissIntro(page) {
  // 新手引导遮罩（z-[300]）会拦截首页交互，需先点掉。
  // 三层兜底：1) 点名"开始体验/进入 Nova"；2) 遮罩内任意按钮；
  // 3) 直接移除遮罩 DOM（录屏目标是课程流程，遮罩挡住一切交互，移除不影响真实流程录制）。
  for (const label of ['开始体验', '进入 Nova']) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.count()) {
      try {
        await humanClick(page, btn, label);
        await page.waitForTimeout(1200);
      } catch {}
    }
  }
  // 多等一会儿确保遮罩卸载
  await page.waitForTimeout(1000);
  let stillThere = await page
    .locator('div.fixed.inset-0.z-\\[300\\]')
    .count()
    .catch(() => 0);
  // 第二层：扫描遮罩内部所有按钮（文案可能是"开始使用/立即体验"等），点最后一个
  if (stillThere > 0) {
    const overlay = page.locator('div.fixed.inset-0.z-\\[300\\]').first();
    const btns = overlay.locator('button');
    const n = await btns.count().catch(() => 0);
    if (n > 0) {
      try {
        await humanClick(page, btns.last(), '引导遮罩内按钮');
        await page.waitForTimeout(1200);
      } catch {}
    }
    stillThere = await page
      .locator('div.fixed.inset-0.z-\\[300\\]')
      .count()
      .catch(() => 0);
  }
  // 第三层：直接移除遮罩 DOM（兜底，避免卡在遮罩上反复点击）
  if (stillThere > 0) {
    await page
      .evaluate(() => {
        document.querySelectorAll('div.fixed.inset-0.z-\\[300\\]').forEach((el) => el.remove());
      })
      .catch(() => {});
    log('引导遮罩未通过按钮关闭，已强制移除 DOM');
    await page.waitForTimeout(500);
  }
  const finalCheck = await page
    .locator('div.fixed.inset-0.z-\\[300\\]')
    .count()
    .catch(() => 0);
  log('引导遮罩是否已移除:', finalCheck === 0 ? '是' : '否');
}

async function openAgentBar(page) {
  const bar = page.locator('[data-tour="agent-bar"]').first();
  if (await bar.count()) {
    const box = await bar.boundingBox().catch(() => null);
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1200);
      return true;
    }
  }
  return false;
}

(async () => {
  await startDev();
  // 预热 API 路由，避免点击"进入课堂"时 webpack 按需编译导致 ChunkLoadError。
  // 生产模式所有路由已预编译，无需预热。
  if (process.env.NOVA_PRODUCTION !== 'true') {
    await prewarmRoutes();
  }
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox', '--disable-extensions'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    // 强制中文 UI：圆桌 dock/提示等走 i18n，默认 en-US 会导致 aria-label 为
    // "Text input"/"Your turn"，与中文选择器不匹配。强制 zh-CN 使整段录制语言一致。
    locale: 'zh-CN',
    recordVideo: { dir: RUN_DIR, size: { width: 1280, height: 800 } },
  });
  // 跳过新手引导遮罩。注意：绝不注入 settings-storage！
  // 服务端 server-providers.yml 已配置 openai(qwen3.8-max, glm-5.2)，
  // 页面 fetchServerProviders 会自动启用 provider，无需也不应注入客户端配置——
  // 注入的格式与 zustand persist(v4) schema 不一致时会破坏 rehydrate，
  // 导致 providersConfig 缺失 → hasUsableProvider=false → "进入课堂"按钮永久 disabled。
  // 2026-08-05 实测：去掉注入后按钮立即可用（红色渐变 enabled 态）。
  //
  // nova-onboarding 格式：store version=2，migrate 在 version<2 时重置 hasSeenIntro=false。
  // 错误注入 version:0 会导致遮罩反复出现（migrate 把 hasSeenIntro 打回 false）。
  // 正确注入：version:2 + 完整 state 字段。
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        'nova-onboarding',
        JSON.stringify({
          state: {
            hasSeenIntro: true,
            hasSeenWelcome: true,
            hasCompletedTour: true,
            currentTourStep: 0,
            isTourActive: false,
            dismissedHints: {},
          },
          version: 2,
        }),
      );
    } catch {}
  });

  const page = await context.newPage();
  // 首屏 GET / 用 webpack 模式首次编译可达 60+ s（route / 编译 + Sentry instrumentation
  // + proxy middleware + nextauth），page.goto 默认 30s 必超时。提到 180s 留余量。
  page.setDefaultTimeout(180000);
  // 绕过「访问码」误报：/api/access-code/status 在本机偶发 404（路由未生效），
  // 触发 AccessCodeGuard 的 catch 默认判定为「需要访问码」而弹出模态框挡住首页。
  // 实际 ACCESS_CODE 未设置，直接拦截返回 enabled:false，避免误弹窗。
  await page.route('**/api/access-code/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: false, authenticated: false }),
    }),
  );
  // 心跳：每 15s 写入 status.txt，便于外部确认进程存活
  const heartbeat = setInterval(() => writeStatus('alive'), 15000);
  page.on('console', (m) => {
    const t = m.text();
    if (/error|fail|exception|unauthorized|401|403|429/i.test(t)) log('CONSOLE:', t.slice(0, 200));
  });

  try {
    // 1) 首页
    step('1) 打开首页');
    // dev server 首次编译 GET / 通常 60s+，用 domcontentloaded 而不是 networkidle
    // （webpack HMR 持续 ws 连接，networkidle 永远达不到）。
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForSelector('textarea', { state: 'visible', timeout: 60000 });
    // 等待 Next.js dev 编译彻底完成（"Compiling"角标消失）。如果不等待，浏览器内
    // 加载的 JS 引用的是旧 chunk hash，点击"进入课堂"时按钮 handler 尚未绑定，
    // 表现为 click 没反映到页面（URL 不变、API 不调用）。
    await waitForCompileDone(page, 180000);
    await page.waitForTimeout(1500);
    await shot(page, 'home');

    // 1.5) 点掉新手引导遮罩
    step('1.5) 关闭新手引导遮罩');
    await dismissIntro(page);

    // 2) 输入主题并提交生成（可重试：失败回首页重填+重进）
    const submitTopic = async () => {
      const url = page.url();
      if (!url.endsWith('/') && !url.endsWith('/#')) {
        // 失败页 /generation-preview 或 /classroom 都需回首页才能拿到主题文本框
        await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
        await page.waitForSelector('textarea', { state: 'visible', timeout: 60000 });
        await waitForCompileDone(page, 120000);
      }
      await dismissIntro(page);
      const textarea = page.locator('textarea').first();
      await textarea.click();
      await page.mouse.move(0, 0, { steps: 5 });
      await humanType(page, textarea, TOPIC, '课程主题');
      await page.waitForTimeout(600);
      // 输入主题会触发 form 状态变化，实测会重新挂载 onboarding 遮罩（z-[300]），
      // 再次 dismissIntro（含 DOM 移除兜底）确保点击"进入课堂"前无遮挡。
      await dismissIntro(page);
      // 「深度交互」模式（data-tour=interactive-mode，aria-pressed 反映状态）。
      // 保持【关闭】：开启时走 interactive-outlines 模板，强制 70% interactive +
      // "NO BORING QUIZZES"，"随堂测验"会被做成 interactive+game，没有 AI 批改与成绩单。
      // 关闭时走 requirements-to-outlines 模板，quiz 是一等场景类型（带 quizConfig），
      // 产出真正的随堂测验（作答→自动批改→得分/解析），圆桌面板在播放模式恒定渲染、
      // 只依赖 controlsVisible，不受此开关影响。
      const imToggle = page.locator('[data-tour="interactive-mode"]');
      if (await imToggle.count()) {
        const pressed = await imToggle.getAttribute('aria-pressed').catch(() => 'false');
        if (pressed === 'true') {
          try {
            await humanClick(page, imToggle, '关闭深度交互模式');
            await page.waitForTimeout(500);
            log('已关闭深度交互模式（确保生成 quiz 类型随堂测验场景）');
          } catch {}
        } else {
          log('深度交互模式已处于关闭态');
        }
      } else {
        log('未找到深度交互模式开关（data-tour=interactive-mode）');
      }
      const genBtn = page.getByRole('button', { name: /进入课堂/ });
      await genBtn.waitFor({ state: 'visible', timeout: 15000 });
      await page
        .waitForFunction(
          () => {
            const b = Array.from(document.querySelectorAll('button')).find((el) => /进入课堂/.test(el.textContent || ''));
            return !!b && !b.disabled;
          },
          { timeout: 30000 },
        )
        .catch(() => {});
      await humanClick(page, genBtn, '进入课堂');
      await page.waitForURL('**/generation-preview**', { timeout: 20000 }).catch(() => {});
      if (!page.url().includes('/generation-preview')) {
        // 点击未生效（ChunkLoadError 或 handler 未绑定）：reload 拿最新 chunk 后重试。
        // 仅在失败路径 reload——无条件 reload 会把已输入的主题清掉、甚至退回 intro 页。
        log('首次点击未跳转，reload 刷新 chunk 后重试');
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {});
        await page.waitForSelector('textarea', { state: 'visible', timeout: 30000 }).catch(() => {});
        await waitForCompileDone(page, 60000);
        await dismissIntro(page);
        const textarea2 = page.locator('textarea').first();
        if (await textarea2.count()) {
          // reload 后主题被清空，需重新输入
          await textarea2.click();
          await humanType(page, textarea2, TOPIC, '课程主题(重输)');
          await page.waitForTimeout(600);
        }
        const genBtn2 = page.getByRole('button', { name: /进入课堂/ });
        await humanClick(page, genBtn2, '进入课堂(重试)').catch(() => {});
        await page.waitForURL('**/generation-preview**', { timeout: 20000 }).catch(() => {});
      }
      await page.waitForTimeout(1500);
    };

    step('2-3) 输入主题并提交生成（真实阿里云调用）');
    await submitTopic();
    await shot(page, 'topic-typed');
    await shot(page, 'generation-started');

    // 4) 生成加载页
    step('4) 等待生成加载（真实调用阿里云模型）');
    await page.waitForURL('**/generation-preview**', { timeout: 20000 }).catch(() => {});
    // 多截几张加载过程
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(6000);
      await shot(page, 'generation-loading-' + (i + 1));
      const url = page.url();
      if (url.includes('/classroom/')) break;
    }

    // 5) 进入课堂（轮询等待；生成失败则回首页重提交，最多 3 次）
    step('5) 等待进入课堂（真实生成可能耗时较久）');
    const deadline = Date.now() + 600000;
    let reached = false;
    let loadShot = 0;
    let genAttempts = 0;
    while (Date.now() < deadline) {
      await assertDevAlive('等待进入课堂');
      const url = page.url();
      if (url.includes('/classroom/')) {
        reached = true;
        break;
      }
      loadShot += 1;
      if (loadShot <= 6) await shot(page, 'generation-wait-' + loadShot);
      const errTxt = await page
        .locator('[data-tour="status-message"], [role="alert"]')
        .first()
        .textContent()
        .catch(() => '');
      const bodyTxt = await page.locator('body').innerText().catch(() => '');
      const failed = /生成失败|LLM returned empty response|返回重试|重试|失败/.test(errTxt + ' ' + bodyTxt);
      if (failed) {
        genAttempts += 1;
        if (genAttempts <= 3) {
          log(`检测到生成失败（${errTxt || 'empty response'}），第 ${genAttempts} 次回首页重新提交生成`);
          await shot(page, 'generation-failed');
          await submitTopic(); // 回首页重填主题 + 重新进入课堂
          loadShot = 0;
          await page.waitForTimeout(2000);
          continue;
        }
        log('已达最大重提交次数，停止');
        break;
      }
      log('等待课堂... url=' + url.slice(0, 50) + ' 状态=' + (errTxt || '').slice(0, 50));
      await page.waitForTimeout(8000);
    }
    if (!reached) {
      const bodyText = await page.locator('body').innerText().catch(() => '');
      log('未进入课堂！页面文本片段:', bodyText.slice(0, 300));
      await shot(page, 'generation-failed');
      throw new Error('生成未在限定次数内成功（可能阿里云持续报错）');
    }
    log('已进入课堂:', page.url());
    // 进入课堂路由后 Next.js 会再次按需编译 /classroom/[id] 相关 chunk，
    // 此时底部出现"Compiling"角标 + 左下角 N 圆形 logo，必须等编译完再交互，
    // 否则点击场景项/bubble 会撞上 ChunkLoadError。
    await page.waitForTimeout(2000);
    await waitForCompileDone(page, 180000);
    await page.waitForTimeout(3000);
    await shot(page, 'classroom-arrived');

    // 6) 等待课堂生成——不阻塞：即使场景还没全部生成完，先开始录制。
    // 场景在后台继续生成，侧边栏会逐步出现更多项目。
    step('6) 等待课堂初始化');
    // 简单等待 15s 让页面 settle（不用 waitSceneReady，它可能在 page.locator 调用中挂死）
    await page.waitForTimeout(15000);
    const sceneCount = await page.locator('[data-testid="scene-item"]').count().catch(() => 0);
    log('场景数量约:', sceneCount);
    await shot(page, 'classroom-ready');

    // 7) 课堂播放（交互视频效果）—— 停留在场景，播放引擎自动讲解
    step('7) 课堂播放：多智能体自主讲解/讨论（交互视频）');
    await page.waitForTimeout(6000); // 让播放引擎推进若干 action
    await shot(page, 'playback-discussion-1');
    await page.waitForTimeout(7000);
    await shot(page, 'playback-discussion-2');

    // 8) 展开侧边栏并浏览课堂场景（幻灯片/互动/PBL/测验）
    step('8) 展开侧边栏，浏览各场景（交互视频/幻灯片/测验）');
    const sidebarToggle = page.getByRole('button', { name: 'Toggle sidebar' });
    if (await sidebarToggle.count()) {
      await humanClick(page, sidebarToggle, '展开侧边栏');
      await page.waitForTimeout(1500);
      await shot(page, 'sidebar-open');
    } else {
      log('未找到侧边栏开关，尝试直接点击场景项');
    }
    const sidebarItems = page.locator('[data-testid="scene-item"]');
    const itemCount = await sidebarItems.count();
    log('侧边栏场景项:', itemCount);
    // 记录每个场景的标题，便于确认是否含「圆桌讨论」与「随堂测验」场景
    for (let i = 0; i < itemCount; i++) {
      const t = await sidebarItems.nth(i).innerText().catch(() => '');
      log('  场景[' + i + ']:', t.replace(/\n/g, ' ').slice(0, 40));
    }
    const browseMax = Math.min(itemCount, 3);
    for (let i = 0; i < browseMax; i++) {
      try {
        await sidebarItems.nth(i).click({ timeout: 6000 });
        await page.waitForTimeout(2500);
        await shot(page, 'scene-' + (i + 1));
      } catch (e) {
        log('浏览场景', i + 1, '失败:', e.message);
      }
    }

    // 9) 课堂 AI 对话：在圆桌讨论区向 AI 智能体提问
    // 圆桌输入有两种入口：
    //   a) 底部 dock 的「文字输入」按钮（aria-label=文字输入），仅在 controlsVisible 时渲染。
    //      controlsVisible 会在鼠标静止 3s 后被隐藏（视频播放态自动隐藏控件）。
    //   b) 「轮到你发言了」提示按钮（用户被邀请发言时），渲染与 controlsVisible 无关。
    // 策略：轮询最多 ~150s，期间持续移动鼠标以保持控件可见；命中任一入口即打开输入框。
    step('9) 课堂 AI 对话：在圆桌讨论区向 AI 提问');
    let chatDone = false;
    const RT_QUESTION =
      '光合作用中光反应和暗反应的主要区别是什么？它们分别发生在叶绿体的哪个部位？';

    // 圆桌「文字输入」dock 仅在【当前场景是圆桌讨论场景】且 controlsVisible 时渲染。
    // 因此先定位圆桌场景：扫描侧边栏场景项，逐个点击检测 dock 是否出现。
    const keepAlive = async () => {
      // 周期性移动鼠标，重置 controlsVisible 的 3s 隐藏计时器
      await page.mouse.move(640, 770, { steps: 3 });
      await page.mouse.move(660, 560, { steps: 3 });
    };
    // 圆桌输入容器（仅 isInputOpen 时挂载），用它判定输入框是否真正打开
    const rtPanel = () =>
      page.locator('[data-testid="roundtable-non-presentation-input-panel"]').first();
    const rtTextarea = () => rtPanel().locator('textarea').first();
    // 触发按钮：dock「文字输入」为主（精确匹配，避免 /你|you/ 这类宽松正则误中其它按钮）；
    // 「你/You」头像按钮为备选，同样调用 handleToggleInput 打开输入面板。
    const rtTriggerPrimary = () =>
      page.getByRole('button', { name: /文字输入|text input/i }).first();
    const rtTriggerAvatar = () => page.getByRole('button', { name: /^(你|You)$/i }).first();
    const rtTrigger = () => rtTriggerPrimary();
    const cueText = () => page.getByText(/轮到你发言了|your turn/i).first();

    // 保持侧边栏展开：Toggle sidebar 是开关按钮，step8 已展开，这里仅当检测到
    // 已折叠(width:0)时才点击，绝不再无条件点一次（否则会折叠 → 场景项不可见）。
    const ensureSidebarOpen = async () => {
      const tog = page.getByRole('button', { name: 'Toggle sidebar' });
      if (await tog.count()) {
        const collapsed = await page
          .locator('[data-tour="sidebar"]')
          .evaluate((el) => getComputedStyle(el).width === '0px')
          .catch(() => false);
        if (collapsed) {
          try {
            await humanClick(page, tog, '展开侧边栏');
            await page.waitForTimeout(1200);
          } catch {}
        } else {
          log('侧边栏已展开，跳过重复点击（避免折叠）');
        }
      }
    };

    const openRoundtableInput = async () => {
      // 优先 dock「文字输入」按钮（直接打开文本输入面板）
      if (await rtTriggerPrimary().count()) {
        try {
          await humanClick(page, rtTriggerPrimary(), '打开圆桌文字输入');
          await page.waitForTimeout(1200);
          if (await rtPanel().count()) return true;
        } catch {}
      }
      // 次选：「你/You」头像按钮
      if (await rtTriggerAvatar().count()) {
        try {
          await humanClick(page, rtTriggerAvatar(), '点击「你」头像打开输入');
          await page.waitForTimeout(1200);
          if (await rtPanel().count()) return true;
        } catch {}
      }
      // 回退：轮到你发言了 / Your turn 提示（点击通常直接打开输入面板）
      if (await cueText().count()) {
        try {
          await humanClick(page, cueText(), '点击「轮到你发言了」');
          await page.waitForTimeout(1200);
          if (await rtPanel().count()) return true;
        } catch {}
        // cue 可能先开语音：再补一次 dock
        if (await rtTrigger().count()) {
          try {
            await humanClick(page, rtTrigger(), 'dock 补开文本输入');
            await page.waitForTimeout(1200);
            if (await rtPanel().count()) return true;
          } catch {}
        }
      }
      return false;
    };

    // 关键认知修正：圆桌区在 PlaybackChromeRoot 中由 `mode === 'playback'` 恒常渲染，
    // 与当前场景类型无关。dock「文字输入」按钮只受 showPresentationDock 控制，
    // 而 showPresentationDock = controlsVisible || ... ，controlsVisible 在鼠标静止 3s 后转 false。
    // 因此不需要「寻找圆桌场景」，只需持续制造鼠标活动让控件保持可见，再点开输入面板。
    await ensureSidebarOpen();
    let opened = false;
    for (let probe = 0; probe < 20 && !opened; probe++) {
      await keepAlive();
      await page.waitForTimeout(700);
      const hasTrigger = (await rtTrigger().count()) > 0;
      const hasCue = (await cueText().count()) > 0;
      if (hasTrigger || hasCue) {
        log('检测到圆桌输入入口（probe=' + probe + ', trigger=' + hasTrigger + ', cue=' + hasCue + '）');
        opened = await openRoundtableInput();
      }
      if (!opened && probe === 9) {
        // 中途兜底：某些播放态下控件挂在画布内，先点一下画布空白区唤醒控件
        try {
          await page.mouse.click(640, 400);
          log('点击画布唤醒控件');
        } catch {}
      }
    }
    await shot(page, 'roundtable-dock');

    if (opened) {
      try {
        const rtTa = rtTextarea();
        await rtTa.click({ timeout: 4000 });
        await page.keyboard.type(RT_QUESTION, { delay: 32 });
        await page.waitForTimeout(600);
        await shot(page, 'ai-chat-question');
        let sent = false;
        // 发送：优先回车（输入框 onKeyDown 绑定 Enter->handleSendMessage）
        try {
          await page.keyboard.press('Enter');
          sent = true;
        } catch {}
        // 回退：点击输入框内的发送按钮（粉色 Send 图标按钮）
        if (!sent) {
          try {
            const sendBtn = rtPanel().locator('button').last();
            if (await sendBtn.count()) {
              await humanClick(page, sendBtn, '发送');
              sent = true;
            }
          } catch {}
        }
        if (sent) {
          await page.waitForTimeout(20000); // AI 智能体思考+回复
          await shot(page, 'ai-chat-answer');
          chatDone = true;
          log('已与 AI 智能体对话（用户提问并获取回答）');
        }
      } catch (e) {
        log('AI 对话输入失败:', e.message);
      }
    } else {
      log('未在限定时间内找到圆桌输入入口（本课程可能未包含可输入的圆桌讨论场景）');
    }

    // 10) 找到测验场景并作答、提交
    step('10) 定位测验场景并作答提交');
    // 确保侧边栏展开
    const sidebarToggle2 = page.getByRole('button', { name: 'Toggle sidebar' });
    if (await sidebarToggle2.count()) {
      const sbCollapsed = await page
        .locator('[data-tour="sidebar"]')
        .evaluate((el) => getComputedStyle(el).width === '0px')
        .catch(() => false);
      if (sbCollapsed) {
        try {
          await humanClick(page, sidebarToggle2, '展开侧边栏');
          await page.waitForTimeout(1200);
        } catch {}
      }
    }
    let quizFound = false;
    const itemsForQuiz = page.locator('[data-testid="scene-item"]');
    // 扫描全部场景（测验场景通常在课程靠后位置，不能只查前 6 个）
    const quizScan = await itemsForQuiz.count();
    for (let i = 0; i < quizScan; i++) {
      try {
        await itemsForQuiz.nth(i).click({ timeout: 6000 });
        await page.waitForTimeout(2000);
        const startBtn = page.getByRole('button', { name: /开始答题/ });
        if (await startBtn.count()) {
          quizFound = true;
          log('找到测验场景，索引', i + 1);
          await shot(page, 'quiz-found');
          await humanClick(page, startBtn, '开始答题');
          await page.waitForTimeout(1800);
          await shot(page, 'quiz-answering');
          // 作答：单选/多选选项是 .grid.gap-2 > button（内嵌 A/B/C/D 选项字母）。
          // 为每道题点击第一个选项（选项 A），即可满足 allAnswered 让提交按钮启用。
          const optionGroups = page.locator('.grid.gap-2');
          const groupCount = await optionGroups.count();
          log('测验选项组数量:', groupCount);
          for (let k = 0; k < groupCount; k++) {
            try {
              const optBtn = optionGroups.nth(k).locator('> button').first();
              await optBtn.click({ timeout: 3000 });
              await page.waitForTimeout(250);
            } catch {}
          }
          // 简答题/填空题
          const tas = await page.locator('textarea').all();
          for (const ta of tas) {
            try {
              await ta.click({ timeout: 3000 });
              await page.keyboard.type(
                '光合作用在叶绿体中进行，利用光能把二氧化碳和水合成有机物（葡萄糖），并释放氧气。',
                { delay: 25 },
              );
              await page.waitForTimeout(400);
            } catch {}
          }
          await shot(page, 'quiz-filled');
          // 等提交按钮可用（所有题已作答 allAnswered=true）后再点击
          try {
            await page
              .waitForFunction(
                () => {
                  const btns = Array.from(document.querySelectorAll('button'));
                  const b = btns.find((el) => /提交答案/.test(el.textContent || ''));
                  return !!b && !b.disabled;
                },
                { timeout: 15000 },
              )
              .catch(() => {});
          } catch {}
          const submitBtn = page.getByRole('button', { name: /提交答案/ });
          if (await submitBtn.count()) {
            await humanClick(page, submitBtn, '提交答案');
            log('已提交测验');
          }
          break;
        }
      } catch (e) {
        log('检查场景', i + 1, '时出错:', e.message);
      }
    }
    if (!quizFound) log('未找到测验场景（本课程可能未生成测验）');

    // 11) AI 批改 + 答题报告/成绩单
    step('11) 等待 AI 批改并查看答题报告/成绩单');
    if (quizFound) {
      // 批改分 grading（AI 正在批改中...）和 reviewing（答题报告）两个阶段。
      // 只有进入 reviewing 后 ScoreBanner 和逐题解析才真正渲染。
      let reviewed = false;
      try {
        await page.getByText('答题报告').first().waitFor({ timeout: 90000 });
        reviewed = true;
      } catch (e) {
        log('未等到答题报告（可能 AI 批改超时或失败）:', e.message);
      }
      if (reviewed) {
        // 多等一会儿让 ScoreBanner 动画和逐题解析渲染完整
        await page.waitForTimeout(5000);
        await shot(page, 'quiz-report'); // 成绩单 + 逐题解析
        await page.waitForTimeout(2000);
        await shot(page, 'quiz-report-detail');
      } else {
        // 兜底：至少截一张当前态
        await page.waitForTimeout(2000);
        await shot(page, 'quiz-report-fallback');
      }
    }

    // 12) 收尾截图
    step('12) 收尾');
    await page.waitForTimeout(2000);
    await shot(page, 'final');
    log('全部步骤完成');
  } catch (err) {
    log('流程异常:', err.message);
    await shot(page, 'error-state').catch(() => {});
    writeStatus('ERROR: ' + err.message);
  } finally {
    clearInterval(heartbeat);
    await context.close();
    await browser.close();
    await stopDev();
  }

  // 重命名视频文件为固定名称（仅扫描本 run 子目录）
  try {
    const files = readdirSync(RUN_DIR).filter((f) => f.endsWith('.webm'));
    if (files.length) {
      const src = path.join(RUN_DIR, files[0]);
      const dst = path.join(RUN_DIR, 'nova-real-course.webm');
      if (src !== dst) renameSync(src, dst);
      const sizeMB = (statSync(dst).size / 1024 / 1024).toFixed(1);
      log('视频已保存:', dst, sizeMB + 'MB');
    } else {
      log('未找到视频文件');
    }
  } catch (e) {
    log('视频重命名失败:', e.message);
  }
  log('截图数量:', shotCount.n, '目录:', SHOT_DIR);
  writeStatus('DONE 截图=' + shotCount.n);
})();
