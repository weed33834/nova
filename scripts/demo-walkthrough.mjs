// 演示课程完整交互录制脚本
// 用「秒开缓存演示课程」加载完整课程（AI导论，12+场景含3个quiz、3个interactive），
// 录制：课堂播放 → 侧边栏浏览 → 随堂测验作答+AI批改+成绩单 → 圆桌AI对话 →
// 右上角设置面板逐个tab测试 → 顶部工具栏小按钮点击。
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import { mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3100';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, '..', 'assets', 'walkthrough-demo');
const VIDEO_DIR = path.join(OUT, 'video');
const RUN_ID = 'run-' + Date.now();
const RUN_DIR = path.join(VIDEO_DIR, RUN_ID);
const SHOT_DIR = path.join(RUN_DIR, 'shots');
mkdirSync(VIDEO_DIR, { recursive: true });
mkdirSync(RUN_DIR, { recursive: true });
mkdirSync(SHOT_DIR, { recursive: true });

const log = (...a) => console.log('[demo-walk]', ...a);
let currentStep = 'init';
const STATUS_FILE = path.join(OUT, 'status.txt');
const writeStatus = (extra = '') => {
  try {
    writeFileSync(STATUS_FILE, `${new Date().toISOString()} | step=${currentStep} | ${extra}\n`);
  } catch {}
};
const step = (s) => {
  currentStep = s;
  writeStatus('started');
  console.log('\n========== ' + s + ' ==========');
};

const shotCount = { n: 0 };
async function shot(page, name) {
  shotCount.n += 1;
  const file = path.join(SHOT_DIR, String(shotCount.n).padStart(2, '0') + '-' + name + '.png');
  await page.screenshot({ path: file });
  log('截图:', path.basename(file));
  return file;
}

async function humanClick(page, locator, label) {
  const box = await locator.first().boundingBox();
  if (!box) throw new Error('找不到元素: ' + label);
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx - 40, cy - 30, { steps: 6 });
  await page.mouse.move(cx, cy, { steps: 8 });
  await page.waitForTimeout(150);
  await page.mouse.click(cx, cy);
  log('点击:', label);
}

async function dismissIntro(page) {
  for (const label of ['开始体验', '进入 Nova']) {
    const btn = page.getByRole('button', { name: label });
    if (await btn.count()) {
      try { await humanClick(page, btn, label); await page.waitForTimeout(1000); } catch {}
    }
  }
  await page.waitForTimeout(800);
  let stillThere = await page.locator('div.fixed.inset-0.z-\\[300\\]').count().catch(() => 0);
  if (stillThere > 0) {
    const overlay = page.locator('div.fixed.inset-0.z-\\[300\\]').first();
    const btns = overlay.locator('button');
    if ((await btns.count()) > 0) {
      try { await humanClick(page, btns.last(), '遮罩内按钮'); await page.waitForTimeout(1000); } catch {}
    }
    stillThere = await page.locator('div.fixed.inset-0.z-\\[300\\]').count().catch(() => 0);
  }
  if (stillThere > 0) {
    await page.evaluate(() => document.querySelectorAll('div.fixed.inset-0.z-\\[300\\]').forEach((el) => el.remove())).catch(() => {});
    await page.waitForTimeout(400);
  }
  const finalCheck = await page.locator('div.fixed.inset-0.z-\\[300\\]').count().catch(() => 0);
  log('引导遮罩是否已移除:', finalCheck === 0 ? '是' : '否');
}

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox', '--disable-extensions'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
    locale: 'zh-CN',
    recordVideo: { dir: RUN_DIR, size: { width: 1280, height: 800 } },
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('nova-onboarding', JSON.stringify({
        state: { hasSeenIntro: true, hasSeenWelcome: true, hasCompletedTour: true, currentTourStep: 0, isTourActive: false, dismissedHints: {} },
        version: 2,
      }));
    } catch {}
  });

  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  const heartbeat = setInterval(() => writeStatus('alive'), 15000);
  page.on('console', (m) => {
    const t = m.text();
    if (/error|fail|exception|401|403|429/i.test(t)) log('CONSOLE:', t.slice(0, 160));
  });

  try {
    // 1) 打开首页
    step('1) 打开首页');
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
    await page.waitForSelector('textarea', { state: 'visible', timeout: 60000 }).catch(() => {});
    await dismissIntro(page);
    await page.waitForTimeout(1000);
    await shot(page, 'home');

    // 2) 首页功能按钮点击（右上角小按钮）
    step('2) 首页顶部工具栏按钮');
    // 深度交互模式开关
    const imToggle = page.locator('[data-tour="interactive-mode"]');
    if (await imToggle.count()) {
      try { await humanClick(page, imToggle, '深度交互模式开关'); await page.waitForTimeout(600); await shot(page, 'interactive-toggle'); await humanClick(page, imToggle, '深度交互模式恢复'); } catch {}
    }
    // 课程格式选择器
    const fmtBtn = page.getByRole('button', { name: /视频课堂|演示模式|PPT|文本|格式/ });
    if (await fmtBtn.count()) {
      try { await humanClick(page, fmtBtn, '课程格式选择器'); await page.waitForTimeout(800); await shot(page, 'course-format'); await page.keyboard.press('Escape'); } catch {}
    }
    // 右上角设置按钮（data-tour=settings）
    const settingsBtn = page.locator('[data-tour="settings"] button');
    if (await settingsBtn.count()) {
      try { await humanClick(page, settingsBtn, '右上角设置'); await page.waitForTimeout(1500); await shot(page, 'settings-panel-open'); } catch { log('未找到设置按钮'); }
    }

    // 3) 设置面板：逐个 tab 打开测试（17 个 section）
    step('3) 设置面板逐个tab测试');
    const sectionLabels = [
      'Token 用量', '语言模型', '智能体设置', '知识图谱', 'DAG', '护栏', '追踪',
      '图像生成', '视频生成', '语音合成', '语音识别', '文档解析', '网络搜索',
      'MCP', '技能', '提示词', '通用',
    ];
    for (const label of sectionLabels) {
      try {
        const tab = page.locator('[role="dialog"] button', { hasText: label }).first();
        if (await tab.count()) {
          await humanClick(page, tab, '设置tab:' + label);
          await page.waitForTimeout(900);
          await shot(page, 'settings-' + label.replace(/\s/g, ''));
        }
      } catch (e) {
        log('设置tab', label, '打开失败:', e.message.slice(0, 80));
      }
    }
    // 关闭设置面板
    try { await page.keyboard.press('Escape'); await page.waitForTimeout(600); } catch {}

    // 4) 加载缓存演示课程
    step('4) 加载缓存演示课程（AI导论，12+场景）');
    const cachedBtn = page.getByRole('button', { name: /秒开缓存演示课程/ });
    if (await cachedBtn.count()) {
      await humanClick(page, cachedBtn, '秒开缓存演示课程');
    } else {
      // 回首页找 demo 入口
      await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await dismissIntro(page);
      const btn2 = page.getByRole('button', { name: /秒开缓存演示课程/ });
      await btn2.waitFor({ state: 'visible', timeout: 15000 });
      await humanClick(page, btn2, '秒开缓存演示课程');
    }
    await page.waitForURL('**/classroom/**', { timeout: 30000 }).catch(() => {});
    log('课堂URL:', page.url());
    await page.waitForTimeout(5000);
    await shot(page, 'classroom-loaded');

    // 5) 课堂播放（交互视频效果）
    step('5) 课堂播放');
    await page.waitForTimeout(6000);
    await shot(page, 'playback-1');
    await page.waitForTimeout(6000);
    await shot(page, 'playback-2');

    // 6) 顶部工具栏小按钮（播放/暂停、静音、全屏、返回等）
    step('6) 课堂顶部工具栏按钮');
    // 尝试点击顶栏常见按钮并截图（跳过会导航离开课堂的按钮）
    const toolbarBtns = page.locator('header button, [data-tour="topbar"] button, [data-tour="toolbar"] button');
    const btnCount = await toolbarBtns.count().catch(() => 0);
    log('顶栏按钮数量:', btnCount);
    const skipLabels = /返回|首页|home|back|exit|退出|leave/i;
    for (let i = 0; i < Math.min(btnCount, 8); i++) {
      try {
        const b = toolbarBtns.nth(i);
        const label = (await b.getAttribute('aria-label').catch(() => '')) || (await b.textContent().catch(() => '')).slice(0, 10) || ('btn-' + i);
        if (!label || skipLabels.test(label)) { log('跳过导航按钮:', label); continue; }
        await b.click({ timeout: 3000 });
        await page.waitForTimeout(800);
        await shot(page, 'toolbar-' + i + '-' + label.slice(0, 8));
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(400);
      } catch (e) { log('按钮', i, '点击失败:', e.message.slice(0, 60)); }
    }

    // 7) 展开侧边栏浏览场景
    step('7) 展开侧边栏浏览场景');
    const sidebarToggle = page.getByRole('button', { name: 'Toggle sidebar' });
    if (await sidebarToggle.count()) {
      await humanClick(page, sidebarToggle, '展开侧边栏');
      await page.waitForTimeout(1500);
    }
    await shot(page, 'sidebar-open');
    const sceneItems = page.locator('[data-testid="scene-item"]');
    const sceneTotal = await sceneItems.count();
    log('场景总数:', sceneTotal);
    for (let i = 0; i < sceneTotal; i++) {
      const t = await sceneItems.nth(i).innerText().catch(() => '');
      log('  场景[' + i + ']:', t.replace(/\n/g, ' ').slice(0, 40));
    }
    // 浏览：幻灯片 → 交互 → 测验 各点一个
    for (const idx of [0, 4, 2]) {
      if (idx >= sceneTotal) continue;
      try {
        await sceneItems.nth(idx).click({ timeout: 6000 });
        await page.waitForTimeout(2500);
        await shot(page, 'browse-scene-' + (idx + 1));
      } catch {}
    }

    // 8) 点击 Pro Switch 进入编辑模式（quiz 答题/成绩单只在编辑模式可见）
    step('8) Pro Switch → 进入编辑模式');
    const proSwitch = page.getByRole('button', { name: /编辑课程|完成编辑/ });
    if (await proSwitch.count()) {
      await humanClick(page, proSwitch, 'Pro Switch 编辑课程');
      await page.waitForTimeout(2000);
      await shot(page, 'edit-mode-entered');
    } else {
      log('未找到 Pro Switch（可能 NEXT_PUBLIC_NOVA_EDITOR_ENABLED 未生效）');
    }

    // 8.5) 圆桌AI对话（编辑模式下 dock 显示）
    step('8.5) 圆桌AI对话');
    const RT_QUESTION = '请解释一下什么是机器学习，和深度学习有什么区别？';
    let chatDone = false;
    for (let probe = 0; probe < 15 && !chatDone; probe++) {
      await page.mouse.move(640, 770, { steps: 3 });
      await page.mouse.move(660, 560, { steps: 3 });
      await page.waitForTimeout(700);
      const inputBtn = page.getByRole('button', { name: /文字输入|text input/i }).first();
      const youBtn = page.getByRole('button', { name: /^(你|You)$/i }).first();
      const cue = page.getByText(/轮到你发言了|your turn/i).first();
      if (await inputBtn.count()) {
        try {
          await humanClick(page, inputBtn, '打开圆桌文字输入');
          await page.waitForTimeout(1200);
          const panel = page.locator('[data-testid="roundtable-non-presentation-input-panel"]');
          if (await panel.count()) {
            const ta = panel.locator('textarea').first();
            await ta.click({ timeout: 4000 });
            await page.keyboard.type(RT_QUESTION, { delay: 25 });
            await page.waitForTimeout(500);
            await shot(page, 'chat-question');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(15000);
            await shot(page, 'chat-answer');
            chatDone = true;
            break;
          }
        } catch (e) { log('圆桌输入失败:', e.message.slice(0, 80)); }
      } else if (await youBtn.count()) {
        try {
          await humanClick(page, youBtn, '「你」头像');
          await page.waitForTimeout(1200);
          const panel = page.locator('[data-testid="roundtable-non-presentation-input-panel"]');
          if (await panel.count()) {
            const ta = panel.locator('textarea').first();
            await ta.click({ timeout: 4000 });
            await page.keyboard.type(RT_QUESTION, { delay: 25 });
            await page.waitForTimeout(500);
            await shot(page, 'chat-question');
            await page.keyboard.press('Enter');
            await page.waitForTimeout(15000);
            await shot(page, 'chat-answer');
            chatDone = true;
            break;
          }
        } catch {}
      } else if (await cue.count()) {
        try { await humanClick(page, cue, '轮到你发言了'); await page.waitForTimeout(1000); } catch {}
      }
      if (probe === 7) { try { await page.mouse.click(640, 400); } catch {} }
    }
    if (!chatDone) log('未找到圆桌输入入口，跳过AI对话');

    // 9) 随堂测验：定位 quiz 场景 → 作答 → 提交 → AI 批改 → 成绩单
    step('9) 随堂测验作答与AI批改');
    let quizDone = false;
    const ensureSidebar = async () => {
      const tog = page.getByRole('button', { name: 'Toggle sidebar' });
      if (await tog.count()) {
        const collapsed = await page.locator('[data-tour="sidebar"]').evaluate((el) => getComputedStyle(el).width === '0px').catch(() => false);
        if (collapsed) {
          try { await humanClick(page, tog, '展开侧边栏'); await page.waitForTimeout(1200); } catch {}
        }
      }
    };
    await ensureSidebar();
    const quizItems = page.locator('[data-testid="scene-item"]');
    const quizTotal = await quizItems.count();
    for (let i = 0; i < quizTotal; i++) {
      try {
        await quizItems.nth(i).click({ timeout: 6000 });
        await page.waitForTimeout(2500);
        const startBtn = page.getByRole('button', { name: /开始答题/ });
        if (await startBtn.count()) {
          log('找到测验场景，索引', i + 1);
          await shot(page, 'quiz-found');
          await humanClick(page, startBtn, '开始答题');
          await page.waitForTimeout(1500);
          await shot(page, 'quiz-answering');
          // 作答：每个选项组点第一个
          const optionGroups = page.locator('.grid.gap-2');
          const groups = await optionGroups.count();
          log('选项组数量:', groups);
          for (let k = 0; k < groups; k++) {
            try {
              const opt = optionGroups.nth(k).locator('> button').first();
              await opt.click({ timeout: 3000 });
              await page.waitForTimeout(250);
            } catch {}
          }
          // 简答题
          const tas = await page.locator('textarea').all();
          for (const ta of tas) {
            try {
              await ta.click({ timeout: 3000 });
              await page.keyboard.type('机器学习是让计算机从数据中学习规律并做出预测的技术；深度学习是机器学习的一个分支，使用多层神经网络自动学习特征表示。', { delay: 15 });
              await page.waitForTimeout(300);
            } catch {}
          }
          await shot(page, 'quiz-filled');
          // 提交
          await page.waitForFunction(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const b = btns.find((el) => /提交答案/.test(el.textContent || ''));
            return !!b && !b.disabled;
          }, { timeout: 20000 }).catch(() => {});
          const submitBtn = page.getByRole('button', { name: /提交答案/ });
          if (await submitBtn.count()) {
            await humanClick(page, submitBtn, '提交答案');
            log('已提交测验，等待AI批改...');
          }
          // 等批改完成（真实调用 qwen，最多 3 分钟）
          let reviewed = false;
          try {
            await page.getByText('答题报告').first().waitFor({ timeout: 180000 });
            reviewed = true;
          } catch (e) {
            log('未等到答题报告:', e.message.slice(0, 80));
          }
          if (reviewed) {
            await page.waitForTimeout(5000);
            await shot(page, 'quiz-report');
            await page.waitForTimeout(2000);
            await shot(page, 'quiz-report-detail');
          } else {
            await page.waitForTimeout(2000);
            await shot(page, 'quiz-report-fallback');
          }
          quizDone = true;
          break;
        }
      } catch (e) {
        log('检查场景', i + 1, '时出错:', e.message.slice(0, 80));
      }
    }
    if (!quizDone) log('未找到测验场景');

    // 10) 完成编辑（Pro Switch 切回 playback）+ 收尾
    step('10) 完成编辑 + 收尾');
    const doneSwitch = page.getByRole('button', { name: /完成编辑/ });
    if (await doneSwitch.count()) {
      try { await humanClick(page, doneSwitch, '完成编辑'); await page.waitForTimeout(1500); await shot(page, 'back-to-playback'); } catch {}
    }
    await page.waitForTimeout(1000);
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
  }

  // 重命名视频
  try {
    const files = readdirSync(RUN_DIR).filter((f) => f.endsWith('.webm'));
    if (files.length) {
      const src = path.join(RUN_DIR, files[0]);
      const dst = path.join(RUN_DIR, 'nova-demo-course.webm');
      if (src !== dst) renameSync(src, dst);
      log('视频已保存:', dst, ((statSync(dst).size) / 1024 / 1024).toFixed(1) + 'MB');
    }
  } catch (e) { log('视频重命名失败:', e.message); }
  log('截图数量:', shotCount.n, '目录:', SHOT_DIR);
  writeStatus('DONE 截图=' + shotCount.n);
})();
