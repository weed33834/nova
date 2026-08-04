// 一键截取 Nova 关键界面，用于 README 配图。
// 用法：node scripts/capture-screenshots.mjs
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://localhost:3100';
const OUT = fileURLToPath(new URL('../assets/screenshots/', import.meta.url));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 2,
});
// 跳过首次启动的开屏引导与产品巡览，避免遮挡截图
await ctx.addInitScript(() => {
  localStorage.setItem(
    'nova-onboarding',
    JSON.stringify({
      state: { hasSeenIntro: true, hasSeenWelcome: true, hasCompletedTour: true },
      version: 0,
    }),
  );
});
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

async function shot(name, opts = {}) {
  const path = OUT + name;
  await page.screenshot({ path, ...opts });
  console.log('saved', path);
}

async function dismissIntro() {
  const overlay = page.locator('div.z-\\[300\\]').first();
  if (!(await overlay.count())) return;
  const startBtn = page.getByRole('button', { name: /开始体验|Get Started/i });
  if (await startBtn.count()) {
    await startBtn.first().click();
    await page.waitForTimeout(600);
  }
  const enterBtn = page.getByRole('button', { name: /进入 Nova|Enter Nova/i });
  if (await enterBtn.count()) {
    await enterBtn.first().click();
  }
  try {
    await overlay.waitFor({ state: 'detached', timeout: 8000 });
  } catch {}
  await page.waitForTimeout(500);
}

try {
  // 1) 首页
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('textarea', { state: 'visible' });
  await dismissIntro();
  await page.waitForSelector('textarea', { state: 'visible' });
  await page.waitForTimeout(800);
  await shot('home.png', { fullPage: true });

  // 2) 课堂：点击「秒开缓存演示课程」进入预置课程（带 Database 图标）
  const cachedBtn = page.locator('button:has(.lucide-database)').first();
  await cachedBtn.waitFor({ state: 'visible', timeout: 15000 });
  await cachedBtn.click();

  await page.waitForURL('**/classroom/**', { timeout: 20000 });
  await page.waitForTimeout(2500);
  // 移开鼠标、点击画布取消 tooltip 焦点，再切到内容更丰富的第二张幻灯片
  await page.mouse.move(0, 0);
  await page.locator('body').click({ position: { x: 400, y: 300 } });
  await page.waitForTimeout(600);
  const nextBtn = page.locator('button:has(.lucide-chevron-right)').first();
  if (await nextBtn.count()) {
    try {
      await nextBtn.click({ timeout: 3000 });
      await page.waitForTimeout(1500);
    } catch {}
  }
  await shot('classroom.png');

  // 3) 首页 hero 局部小图
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForSelector('textarea', { state: 'visible' });
  await dismissIntro();
  await page.waitForTimeout(600);
  await shot('home-hero.png');
} catch (err) {
  console.error('capture failed:', err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
