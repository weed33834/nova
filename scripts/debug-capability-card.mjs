// 验证设置面板能力状态卡片
import { chromium } from 'playwright';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('nova-onboarding', JSON.stringify({
        state: { hasSeenIntro: true, hasSeenWelcome: true, hasCompletedTour: true, currentTourStep: 0, isTourActive: false, dismissedHints: {} }, version: 2,
      }));
    } catch {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(60000);
  await page.goto('http://localhost:3100/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('textarea', { timeout: 60000 });
  await page.evaluate(() => {
    document.querySelectorAll('div').forEach((el) => {
      const c = el.className || '';
      if (c.includes('z-[300]')) el.remove();
    });
  });
  await page.waitForTimeout(1500);
  // 移除所有可能的 onboarding 遮罩（含 z-[300] 与 style z-index）
  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => {
      document.querySelectorAll('div').forEach((el) => {
        const c = el.className || '';
        const s = el.getAttribute('style') || '';
        if (c.includes('z-[300]') || c.includes('z-[400]') || /z-index\s*:\s*(300|400)/.test(s)) {
          el.remove();
        }
      });
    });
    await page.waitForTimeout(400);
  }
  // 打开设置面板
  await page.locator('[data-tour="settings"] button').first().click({ timeout: 10000 });
  await page.waitForTimeout(2500);
  const card = await page.getByText('功能能力状态').first().isVisible().catch(() => false);
  console.log('能力状态卡片可见:', card);
  if (card) {
    const text = await page.getByText('功能能力状态').first().locator('xpath=../..').innerText().catch(() => '');
    console.log('卡片内容片段:', text.slice(0, 300));
    await page.screenshot({ path: 'docs/screenshots/11-capability-status.png' });
    console.log('截图已保存: docs/screenshots/11-capability-status.png');
  }
  await browser.close();
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
