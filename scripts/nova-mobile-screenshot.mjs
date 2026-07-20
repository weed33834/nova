// Mobile + desktop screenshot generator for Nova.
// Takes full-page screenshots at multiple viewport widths to verify the
// AgentBar overlap fix and check for any other visual duplication.
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const OUT_DIR = '/workspace/nova/screenshots/mobile-check';
mkdirSync(OUT_DIR, { recursive: true });

const TARGETS = [
  { name: 'home', url: 'http://localhost:3001/' },
  { name: 'classroom', url: 'http://localhost:3001/classroom/demo' },
  { name: 'generation-preview', url: 'http://localhost:3001/generation-preview' },
  { name: 'eval-whiteboard', url: 'http://localhost:3001/eval/whiteboard' },
];

// iPhone SE (375px), iPhone 12 Pro (390px), small tablet (768px), desktop (1280px)
const VIEWPORTS = [
  { label: '375-se', width: 375, height: 667 },
  { label: '390-iphone12', width: 390, height: 844 },
  { label: '768-tablet', width: 768, height: 1024 },
  { label: '1280-desktop', width: 1280, height: 800 },
];

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    console.log('browser launched');

    for (const vp of VIEWPORTS) {
      const ctx = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        deviceScaleFactor: 2,
        isMobile: vp.width < 768,
        hasTouch: vp.width < 768,
      });
      const page = await ctx.newPage();
      const consoleErrors = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') consoleErrors.push(msg.text());
      });

      for (const t of TARGETS) {
        try {
          await page.goto(t.url, { waitUntil: 'networkidle', timeout: 30000 });
          // Wait a bit more for client hydration + animations
          await page.waitForTimeout(2500);
          await page.screenshot({
            path: `${OUT_DIR}/${t.name}-${vp.label}.png`,
            fullPage: true,
          });
          console.log(`✓ ${t.name} @ ${vp.label} (${vp.width}x${vp.height})`);
        } catch (e) {
          console.log(`✗ ${t.name} @ ${vp.label}: ${String(e).slice(0, 120)}`);
        }
      }
      if (consoleErrors.length) {
        console.log(`  console errors @ ${vp.label}: ${consoleErrors.length}`);
      }
      await ctx.close();
    }
  } finally {
    if (browser) await browser.close();
    console.log('done');
  }
})();
