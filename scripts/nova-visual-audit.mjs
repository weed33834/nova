// Nova 视觉/品牌/布局审计（jsdom 版本，无浏览器依赖）
// 检测：HTML 结构、品牌一致性、404 链接、文案残留、颜色类名残留、meta 标签、a11y 基础
import { JSDOM } from 'jsdom';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'screenshots');
const REPORT = join(OUT_DIR, 'audit-report.json');
const BASE = 'http://localhost:3000';
mkdirSync(OUT_DIR, { recursive: true });

const ROUTES = [
  { name: 'home', path: '/' },
  { name: 'classroom', path: '/classroom/demo' },
  { name: 'generation-preview', path: '/generation-preview' },
  { name: 'eval-whiteboard', path: '/eval/whiteboard' },
];

// 品牌残留检测关键词（不应出现在渲染后的页面文本里）
const BRAND_RESIDUE = [];
// 颜色类名残留（不应出现在 className 里）
const COLOR_RESIDUE = ['violet-', 'purple-', '#5b1fa8', '#722ed1'];

async function fetchPage(path) {
  const res = await fetch(BASE + path, { headers: { 'User-Agent': 'Nova-Audit/1.0' } });
  const html = await res.text();
  return { status: res.status, html };
}

async function checkAsset(url) {
  try {
    const r = await fetch(BASE + url, { method: 'HEAD' });
    return r.status;
  } catch {
    return 0;
  }
}

const report = { startedAt: new Date().toISOString(), pages: [], assets: [], summary: {} };
let totalResidue = 0,
  totalColorResidue = 0,
  totalBrokenLinks = 0;

for (const route of ROUTES) {
  const pageResult = { route: route.name, path: route.path };
  try {
    const { status, html } = await fetchPage(route.path);
    pageResult.status = status;
    pageResult.htmlSize = html.length;
    if (status !== 200) {
      pageResult.error = `HTTP ${status}`;
      report.pages.push(pageResult);
      continue;
    }

    const dom = new JSDOM(html, { url: BASE + route.path });
    const doc = dom.window.document;

    // 1. <title>
    pageResult.title = doc.querySelector('title')?.textContent || null;

    // 2. meta description
    pageResult.metaDescription =
      doc.querySelector('meta[name="description"]')?.getAttribute('content') || null;

    // 3. icon 链接
    pageResult.icons = Array.from(doc.querySelectorAll('link[rel*="icon"]')).map((l) => ({
      rel: l.getAttribute('rel'),
      href: l.getAttribute('href'),
    }));

    // 4. 品牌残留检测（在可见文本里）
    const bodyText = doc.body ? doc.body.textContent : '';
    const foundResidue = BRAND_RESIDUE.filter((k) => bodyText.includes(k));
    pageResult.brandResidue = foundResidue;
    totalResidue += foundResidue.length;

    // 5. 颜色类名残留
    const allClassAttr = Array.from(doc.querySelectorAll('[class]'))
      .map((e) => e.getAttribute('class'))
      .join(' ');
    const foundColorResidue = COLOR_RESIDUE.filter((k) => allClassAttr.includes(k));
    pageResult.colorResidue = foundColorResidue;
    totalColorResidue += foundColorResidue.length;

    // 6. 品牌正向检测：Nova 是否出现
    pageResult.hasNova = bodyText.includes('Nova') || (pageResult.title || '').includes('Nova');

    // 7. 内部链接 404 检测（仅 / 开头的 href，且非 api/）
    const internalLinks = Array.from(doc.querySelectorAll('a[href]'))
      .map((a) => a.getAttribute('href'))
      .filter((h) => h && h.startsWith('/') && !h.startsWith('/api/') && !h.startsWith('//'));
    const uniqueLinks = [...new Set(internalLinks)];
    const broken = [];
    for (const link of uniqueLinks.slice(0, 30)) {
      const r = await fetch(BASE + link, { method: 'HEAD' });
      if (r.status >= 400) broken.push({ link, status: r.status });
    }
    pageResult.brokenLinks = broken;
    totalBrokenLinks += broken.length;

    // 8. 图片 alt 检查（a11y）
    const imgs = Array.from(doc.querySelectorAll('img'));
    const imgWithoutAlt = imgs.filter((img) => !img.getAttribute('alt')).length;
    pageResult.images = { total: imgs.length, withoutAlt: imgWithoutAlt };

    // 9. H1 检查（SEO/a11y）
    const h1s = doc.querySelectorAll('h1');
    pageResult.h1Count = h1s.length;
    pageResult.h1Text = Array.from(h1s)
      .map((h) => h.textContent.trim())
      .filter(Boolean);

    // 10. 响应式 meta viewport
    pageResult.viewport =
      doc.querySelector('meta[name="viewport"]')?.getAttribute('content') || null;

    // 11. lang 属性
    pageResult.htmlLang = doc.documentElement.getAttribute('lang') || null;

    // 12. 主题色（应为品红 #DB2777 系）
    pageResult.themeColor =
      doc.querySelector('meta[name="theme-color"]')?.getAttribute('content') || null;

    // 13. og:image / og:title（社交分享品牌）
    pageResult.ogTitle =
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content') || null;
    pageResult.ogImage =
      doc.querySelector('meta[property="og:image"]')?.getAttribute('content') || null;
  } catch (e) {
    pageResult.error = e.message;
  }
  report.pages.push(pageResult);
}

// 全局资源检测
const ASSETS = [
  '/icon.svg',
  '/apple-icon.png',
  '/logo-horizontal.svg',
  '/nova-mark.svg',
  '/nova-mark.png',
  '/banner.svg',
  '/favicon.ico',
];
for (const a of ASSETS) {
  report.assets.push({ url: a, status: await checkAsset(a) });
}

report.summary = {
  totalPages: report.pages.length,
  pagesOk: report.pages.filter((p) => p.status === 200).length,
  brandResidueCount: totalResidue,
  colorResidueCount: totalColorResidue,
  brokenLinksCount: totalBrokenLinks,
  finishedAt: new Date().toISOString(),
};
writeFileSync(REPORT, JSON.stringify(report, null, 2));
console.log('Audit done →', REPORT);
console.log(JSON.stringify(report.summary, null, 2));
