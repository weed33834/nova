// 诊断：打开指定课堂，确认圆桌「文字输入」dock 按钮在各场景下是否出现
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const classroomId = process.argv[2] || 'ZccbPoOqG_';

const log = (...a) => console.log('[diag]', ...a);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'zh-CN',
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (/生成|genie|error|Error|403|denied|模型|model/i.test(t)) log('PAGE>', t.slice(0, 160));
  });

  await page.goto(`${BASE}/classroom/${classroomId}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const lang = await page.evaluate(() => document.documentElement.lang);
  log('HTML_LANG=', lang);

  const checkDock = async (tag) => {
    const dock = page.getByRole('button', { name: /text input|文字输入/i });
    const dc = await dock.count();
    const ta = page.locator('textarea[placeholder*="message" i]');
    const tc = await ta.count();
    const cue = page.getByText(/your turn|轮到你发言了/i);
    const cc = await cue.count();
    log(`[${tag}] dockBtn=${dc} textarea=${tc} cue=${cc}`);
    return { dc, tc, cc };
  };

  // 不浏览，直接检查（模拟 step7 后立刻 step9）
  await page.mouse.move(640, 770, { steps: 5 });
  await page.waitForTimeout(1500);
  await checkDock('arrival-noBrowse');

  // 列出侧边栏场景项
  const items = page.locator('[data-testid="scene-item"]');
  const n = await items.count();
  log('scene-item count=', n);
  for (let i = 0; i < n; i++) {
    const txt = (await items.nth(i).innerText().catch(() => '')) || '';
    log(`  scene[${i}] text=${txt.replace(/\n/g, ' ').slice(0, 40)}`);
  }

  // 逐个点击场景项，检查圆桌 dock
  for (let i = 0; i < n; i++) {
    try {
      await items.nth(i).click({ timeout: 4000 });
    } catch (e) {
      log(`click scene[${i}] failed:`, e.message.slice(0, 60));
    }
    await page.mouse.move(640, 770, { steps: 3 });
    await page.waitForTimeout(2500);
    const r = await checkDock('after-click-' + i);
    if (r.dc > 0 || r.tc > 0) {
      log(`>>> 圆桌输入入口在 scene[${i}] 出现！`);
    }
  }

  await browser.close();
  log('DONE');
})().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
