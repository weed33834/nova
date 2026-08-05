// 诊断：打开已持久化的课堂，检查圆桌讨论区真实渲染的 locale / 按钮 / textarea
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const BASE = 'http://localhost:3100';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLASSROOM = process.argv[2] || 'AHLiBcooBx';
const log = (...a) => console.log('[diag]', ...a);

(async () => {
  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-dev-shm-usage', '--disable-gpu', '--no-sandbox', '--disable-extensions'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem(
        'nova-onboarding',
        JSON.stringify({ state: { hasSeenIntro: true, tourCompleted: true }, version: 0 }),
      );
      const KEY = 'sk-6ac634ab55454b88a25699c57c48ca4a';
      const B = 'https://ws-gh1gl5ceg4m5je4d.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';
      localStorage.setItem(
        'settings-storage',
        JSON.stringify({
          state: {
            providersConfig: {
              openai: {
                id: 'openai', name: 'OpenAI 兼容 (阿里云百炼)', type: 'openai',
                baseUrl: B, apiKey: KEY,
                models: ['qwen3.7-flash', 'qwen3.8-max', 'deepseek-v4-flash-0731'],
                isServerConfigured: true, providerType: 'openai',
              },
            },
            providerId: 'openai', modelId: 'qwen3.7-flash', apiKey: KEY, baseUrl: B,
          },
          version: 4,
        }),
      );
    } catch (e) {
      console.log('[diag] addInitScript error', e.message);
    }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60000);

  log('goto /classroom/' + CLASSROOM);
  await page.goto(`${BASE}/classroom/${CLASSROOM}`, { waitUntil: 'domcontentloaded' });
  let ready = false;
  for (let i = 0; i < 60; i++) {
    const n = await page.locator('[data-testid="scene-item"]').count();
    if (n >= 3) { ready = true; break; }
    await page.waitForTimeout(2000);
  }
  log('SCENE_READY=', ready, 'sceneItems=', await page.locator('[data-testid="scene-item"]').count());

  const diag = await page.evaluate(() => {
    const ls = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      ls[k] = (localStorage.getItem(k) || '').slice(0, 120);
    }
    return { lang: document.documentElement.lang, ls };
  });
  log('HTML_LANG=', diag.lang);
  log('LOCALSTORAGE_KEYS=', Object.keys(diag.ls).join(' | '));

  const btns = await page.evaluate(() =>
    Array.from(document.querySelectorAll('button')).map((b) => ({
      aria: b.getAttribute('aria-label') || '',
      text: (b.textContent || '').trim().slice(0, 40),
      cls: (b.className || '').slice(0, 60),
    })),
  );
  log('BUTTONS total=' + btns.length);
  for (const b of btns) {
    if (b.aria || b.text) log(`[btn] aria="${b.aria}" text="${b.text}" cls="${b.cls}"`);
  }

  const tas = await page.evaluate(() =>
    Array.from(document.querySelectorAll('textarea')).map((t) => t.placeholder || ''),
  );
  log('TEXTAREA_PLACEHOLDERS=' + JSON.stringify(tas));

  await page.mouse.move(640, 770, { steps: 5 });
  await page.waitForTimeout(2000);
  const dockAfter = await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('button')).filter((b) => {
      const a = (b.getAttribute('aria-label') || '').toLowerCase();
      const t = (b.textContent || '').toLowerCase();
      return /text|输入|文字|input|you|轮到|turn|message/i.test(a + ' ' + t);
    });
    return cands.map((b) => ({
      aria: b.getAttribute('aria-label') || '',
      text: (b.textContent || '').trim().slice(0, 40),
      box: (() => { const r = b.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), vis: r.width > 0 && r.height > 0 }; })(),
    }));
  });
  log('DOCK CANDIDATES AFTER MOUSEMOVE=' + JSON.stringify(dockAfter, null, 2));

  await context.close();
  await browser.close();
  log('DONE');
})().catch((e) => {
  console.error('[diag] FATAL', e && e.stack ? e.stack : e);
  process.exit(1);
});
