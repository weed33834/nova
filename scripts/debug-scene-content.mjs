// 调试：在浏览器真实环境复现 scene-content 请求，dump outline 完整性
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3100';
const TOPIC = '光合作用：植物如何利用阳光、水和二氧化碳制造有机物并释放氧气？请包含随堂测验场景（单选题，自动批改）。';

const log = (...a) => console.log('[dbg]', ...a);

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' });
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
  page.on('console', (m) => { const t = m.text(); if (/error|fail|exception/i.test(t) && !/preload/i.test(t)) log('CONSOLE:', t.slice(0, 120)); });

  // 拦截 scene-content 请求，dump body 关键字段
  const badRequests = [];
  await page.route('**/api/generate/scene-content', async (route) => {
    const req = route.request();
    const post = req.postData() || '';
    try {
      const body = JSON.parse(post);
      const o = body.outline || {};
      const ok = !!(o.title && o.type);
      const brief = { title: o.title, type: o.type, id: o.id, keys: Object.keys(o).length };
      log('scene-content 请求:', ok ? 'OK' : 'BAD', JSON.stringify(brief));
      if (!ok) badRequests.push(post.slice(0, 500));
    } catch (e) { log('scene-content postData 解析失败'); }
    await route.continue();
  });
  // 拦截 outlines-stream，dump done 事件的 outlines 数量
  await page.route('**/api/generate/scene-outlines-stream', async (route) => {
    const req = route.request();
    const post = req.postData() || '';
    const resp = await route.fetch();
    const text = await resp.text();
    const dataLines = text.split('\n').filter((l) => l.startsWith('data: '));
    let finalCount = -1;
    for (const line of dataLines) {
      try {
        const evt = JSON.parse(line.slice(6));
        if (evt.type === 'done') finalCount = (evt.outlines || []).length;
        if (evt.type === 'outline') {
          const o = evt.data || {};
          if (!o.title || !o.type) log('SSE outline 事件缺字段:', JSON.stringify(o).slice(0, 150));
        }
      } catch {}
    }
    log('outlines-stream: data行数=' + dataLines.length + ' done.outlines=' + finalCount);
    await route.fulfill({ response: resp, body: text });
  });

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('textarea', { state: 'visible', timeout: 60000 });
  for (let i = 0; i < 60; i++) {
    const c = await page.locator(':text("Compiling")').first().isVisible().catch(() => false);
    if (!c) break;
    await page.waitForTimeout(1000);
  }
  await page.evaluate(() => document.querySelectorAll('div.fixed.inset-0.z-\\[300\\]').forEach((el) => el.remove()));

  const ta = page.locator('textarea').first();
  await ta.click();
  await page.keyboard.type(TOPIC, { delay: 5 });
  await page.waitForTimeout(500);
  await page.evaluate(() => document.querySelectorAll('div.fixed.inset-0.z-\\[300\\]').forEach((el) => el.remove()));

  const genBtn = page.getByRole('button', { name: /进入课堂/ });
  await genBtn.waitFor({ state: 'visible', timeout: 15000 });
  await genBtn.click({ timeout: 10000 }).catch((e) => log('点击失败:', e.message.slice(0, 100)));
  await page.waitForURL('**/generation-preview**', { timeout: 30000 }).catch(() => {});

  log('已进入 generation-preview, 等待 outlines 生成...');
  // 等待 90s 让 outlines + 部分内容生成
  await page.waitForTimeout(240000);
  log('等待结束, badRequests:', badRequests.length);
  if (badRequests.length) log('BAD request sample:', badRequests[0].slice(0, 400));
  await browser.close();
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
