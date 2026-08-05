// 调试脚本：诊断"点击进入课堂无反应"问题
// 打开首页 → 注入 provider → 输入主题 → dump 按钮状态/form 值/错误信息 → 点击 → dump 结果
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3100';
const TOPIC = '光合作用：植物如何利用阳光、水和二氧化碳制造有机物并释放氧气？请包含随堂测验场景。';

const KEY = 'sk-6ac634ab55454b88a25699c57c48ca4a';
const BASE_API = 'https://ws-gh1gl5ceg4m5je4d.cn-beijing.maas.aliyuncs.com/compatible-mode/v1';

const log = (...a) => console.log('[debug]', ...a);

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'zh-CN' });
  // 不注入 settings-storage！服务端 server-providers.yml 已配置 openai(deepseek-v4-flash-0731, glm-5.2)，
  // fetchServerProviders 拉取后 hasUsableProvider 应为 true。注入反而可能破坏 persist rehydrate。
  await context.addInitScript(() => {
    try {
      localStorage.setItem('nova-onboarding', JSON.stringify({ state: { hasSeenIntro: true, tourCompleted: true }, version: 0 }));
    } catch {}
  });

  const page = await context.newPage();
  page.setDefaultTimeout(60000);
  page.on('console', (m) => { if (/error|fail|exception/i.test(m.text())) log('CONSOLE:', m.text().slice(0, 150)); });
  page.on('pageerror', (e) => log('PAGEERROR:', e.message.slice(0, 200)));

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
  await page.waitForSelector('textarea', { state: 'visible', timeout: 60000 });
  // 等编译完成
  for (let i = 0; i < 60; i++) {
    const c = await page.locator(':text("Compiling")').first().isVisible().catch(() => false);
    if (!c) break;
    await page.waitForTimeout(1000);
  }
  log('页面已就绪, URL:', page.url());

  // 移除引导遮罩（直接 DOM 移除，调试用）
  await page.evaluate(() => document.querySelectorAll('div.fixed.inset-0.z-\\[300\\]').forEach((el) => el.remove()));

  // dump 初始按钮状态
  const dump = async (tag) => {
    const st = await page.evaluate(() => {
      const ta = document.querySelector('textarea[data-tour="hero-input"]');
      const btns = Array.from(document.querySelectorAll('button'));
      const genBtn = btns.find((b) => /进入课堂|生成|开始/.test(b.textContent || ''));
      const errEl = document.querySelector('[role="alert"], [data-tour="status-message"]');
      const settings = localStorage.getItem('settings-storage');
      return {
        textareaValue: ta ? ta.value.slice(0, 60) : 'NO-TEXTAREA',
        textareaCount: document.querySelectorAll('textarea').length,
        genBtnText: genBtn ? genBtn.textContent.trim().slice(0, 20) : 'NO-BTN',
        genBtnDisabled: genBtn ? genBtn.disabled : null,
        allBtnTexts: btns.map((b) => b.textContent.trim().slice(0, 12)).filter(Boolean).slice(0, 8),
        errorText: errEl ? errEl.textContent.slice(0, 80) : 'NONE',
        settingsHasOpenai: settings ? settings.includes('openai') : false,
      };
    });
    log(`[${tag}]`, JSON.stringify(st));
  };

  await dump('初始');

  // 输入主题
  const ta = page.locator('textarea[data-tour="hero-input"]');
  await ta.click();
  await page.keyboard.type(TOPIC, { delay: 10 });
  await page.waitForTimeout(800);
  await dump('输入后');

  // 移除遮罩再点击（模拟 walkthrough 的 dismissIntro 兜底）
  await page.evaluate(() => document.querySelectorAll('div.fixed.inset-0.z-\\[300\\]').forEach((el) => el.remove()));
  await page.waitForTimeout(500);

  // 点击"进入课堂"
  const genBtn = page.getByRole('button', { name: /进入课堂/ });
  await genBtn.waitFor({ state: 'visible', timeout: 15000 });
  const box = await genBtn.boundingBox().catch(() => null);
  log('按钮位置:', JSON.stringify(box), 'disabled:', await genBtn.isDisabled().catch(() => 'unknown'));
  try {
    await genBtn.click({ timeout: 10000 });
    log('点击成功');
  } catch (e) {
    log('点击失败:', e.message.slice(0, 120));
  }
  await page.waitForTimeout(3000);
  await dump('点击3s后');
  log('点击后 URL:', page.url());
  // 检查 sessionStorage
  const sess = await page.evaluate(() => {
    const s = sessionStorage.getItem('generationSession');
    return s ? JSON.parse(s).currentStep + ' | req=' + (JSON.parse(s).requirements?.requirement || '').slice(0, 30) : 'NO-SESSION';
  });
  log('sessionStorage generationSession:', sess);

  await page.waitForTimeout(5000);
  await dump('点击8s后');
  log('最终 URL:', page.url());

  await browser.close();
  log('调试结束');
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
