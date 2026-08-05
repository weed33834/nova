// 检查 demo 课堂所有可见按钮 + 环境变量
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('nova-onboarding', JSON.stringify({ state: { hasSeenIntro: true, hasSeenWelcome: true, hasCompletedTour: true, currentTourStep: 0, isTourActive: false, dismissedHints: {} }, version: 2 }));
    } catch {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto('http://localhost:3100/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('textarea', { timeout: 60000 });
  await page.waitForTimeout(2000);
  // 强制移除所有 z-[300] 遮罩
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach((el) => {
      const s = el.getAttribute('style') || '';
      const cls = el.className || '';
      if (cls.includes('z-[300]') || cls.includes('z-[400]')) el.remove();
      if (s.includes('z-index: 300') || s.includes('z-index: 400')) el.remove();
    });
  });
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /秒开缓存演示课程/ }).click();
  await page.waitForURL('**/classroom/**', { timeout: 30000 });
  await page.waitForTimeout(5000);
  const allBtns = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    return btns.map((b) => ({
      aria: b.getAttribute('aria-label') || '',
      text: (b.textContent || '').trim().slice(0, 15),
      visible: b.offsetParent !== null,
    })).filter((b) => b.aria || b.text);
  });
  console.log('ALL VISIBLE BUTTONS:');
  for (const b of allBtns) console.log(JSON.stringify(b));
  const env = await page.evaluate(() => process.env.NEXT_PUBLIC_NOVA_EDITOR_ENABLED);
  console.log('---ENV in browser:', env);
  // 检查 webpack env stub
  const stub = await page.evaluate(() => {
    // 找 webpack 加载过的 chunk 里 env 对象
    const chunks = (window).__webpack_require__ ? (window).__webpack_require__.c : null;
    if (!chunks) return 'no webpack';
    let envStub = null;
    for (const id in chunks) {
      const m = chunks[id];
      const src = m && m.toString ? m.toString() : '';
      const match = src.match(/env\s*=\s*\{[^}]+\}/);
      if (match && src.includes('NEXT_PUBLIC')) { envStub = match[0]; break; }
    }
    return envStub;
  });
  console.log('STUB:', stub);
  await browser.close();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });