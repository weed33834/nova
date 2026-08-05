// 快速诊断：在浏览器里看 demo 课堂是否有 Pro Switch
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('nova-onboarding', JSON.stringify({
        state: { hasSeenIntro: true, hasSeenWelcome: true, hasCompletedTour: true, currentTourStep: 0, isTourActive: false, dismissedHints: {} }, version: 2,
      }));
    } catch {}
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  await page.goto('http://localhost:3100/', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('textarea', { state: 'visible', timeout: 60000 }).catch(() => {});
  await page.evaluate(() => document.querySelectorAll('div.fixed.inset-0.z-\\[300\\]').forEach((el) => el.remove()));
  await page.waitForTimeout(1500);
  const cachedBtn = page.getByRole('button', { name: /秒开缓存演示课程/ });
  await cachedBtn.click();
  await page.waitForURL('**/classroom/**', { timeout: 30000 });
  await page.waitForTimeout(5000);
  // dump 所有头部 button
  const headerBtns = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('header button, [data-tour="topbar"] button, [data-tour="toolbar"] button, [role="banner"] button'));
    return btns.map((b) => ({ aria: b.getAttribute('aria-label') || '', text: (b.textContent || '').trim().slice(0, 15), title: b.getAttribute('title') || '' }));
  });
  console.log('HEADER BUTTONS:', JSON.stringify(headerBtns, null, 2));
  // 检查 env var 是否嵌入
  const env = await page.evaluate(() => process.env.NEXT_PUBLIC_NOVA_EDITOR_ENABLED);
  console.log('CLIENT ENV:', env);
  await browser.close();
})();