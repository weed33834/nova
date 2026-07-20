// Mobile-view duplication detector for Nova.
// Fetches the rendered HTML at a mobile viewport and flags visible duplicate
// content (duplicate logos, repeated headings, double-rendered nav bars, etc.)
// that a human would notice as "something is duplicated".
import { JSDOM } from 'jsdom';

const ROUTES = [
  { name: 'home', url: 'http://localhost:3001/' },
  { name: 'classroom', url: 'http://localhost:3001/classroom/demo' },
  { name: 'generation-preview', url: 'http://localhost:3001/generation-preview' },
  { name: 'eval-whiteboard', url: 'http://localhost:3001/eval/whiteboard' },
];

const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

function isHidden(el) {
  if (!el) return true;
  const cs = el.getAttribute('class') || '';
  if (/\bhidden\b/.test(cs)) return true;
  const style = el.getAttribute('style') || '';
  if (/display:\s*none/.test(style)) return true;
  return false;
}

async function auditRoute(name, url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': MOBILE_UA, Accept: 'text/html' },
  });
  const html = await res.text();
  if (!res.ok) {
    return { route: name, url, status: res.status, error: 'HTTP error' };
  }
  const dom = new JSDOM(html, { url });
  const doc = dom.window.document;
  const findings = [];

  // 1) Duplicate visible <h1>
  const h1s = Array.from(doc.querySelectorAll('h1')).filter((h) => !isHidden(h));
  findings.push({
    type: 'h1-count',
    count: h1s.length,
    texts: h1s.map((h) => (h.textContent || '').trim().slice(0, 60)),
  });

  // 2) Duplicate logo/visible images (same src > 1)
  const imgs = Array.from(doc.querySelectorAll('img'));
  const srcCounts = {};
  for (const img of imgs) {
    if (isHidden(img)) continue;
    const src = img.getAttribute('src') || '';
    if (!src) continue;
    const norm = src.replace(/&?w=\d+/, '').replace(/&?q=\d+/, '');
    srcCounts[norm] = (srcCounts[norm] || 0) + 1;
  }
  const dupImgs = Object.entries(srcCounts).filter(([, c]) => c > 1);
  if (dupImgs.length) {
    findings.push({
      type: 'duplicate-img',
      items: dupImgs.map(([s, c]) => ({ src: s, count: c })),
    });
  }

  // 3) Duplicate visible section-level text blocks (fingerprint = first 80 chars)
  const blocks = Array.from(doc.querySelectorAll('header, nav, section, main, footer, h1, h2, h3'));
  const textMap = {};
  for (const b of blocks) {
    if (isHidden(b)) continue;
    const t = (b.textContent || '').trim().replace(/\s+/g, ' ');
    if (t.length < 15) continue;
    const fp = t.slice(0, 80);
    (textMap[fp] = textMap[fp] || []).push({
      tag: b.tagName.toLowerCase(),
      cls: (b.getAttribute('class') || '').slice(0, 80),
      id: b.id || '',
    });
  }
  const dupTexts = Object.entries(textMap).filter(([, arr]) => arr.length > 1);
  if (dupTexts.length) {
    findings.push({
      type: 'duplicate-text-blocks',
      items: dupTexts.map(([t, arr]) => ({ text: t, count: arr.length, locations: arr })),
    });
  }

  // 4) Responsive pairs: count of desktop-only vs mobile-only elements
  const desktopOnly = Array.from(
    doc.querySelectorAll('[class*="hidden md:"], [class*="hidden lg:"]'),
  );
  const mobileOnly = Array.from(doc.querySelectorAll('[class*="md:hidden"], [class*="lg:hidden"]'));
  findings.push({
    type: 'responsive-pairs',
    desktopOnlyCount: desktopOnly.length,
    mobileOnlyCount: mobileOnly.length,
  });

  // 5) Duplicate heading texts (h2/h3/h4) - duplicated cards/sections
  const headings = Array.from(doc.querySelectorAll('h2, h3, h4'));
  const hTextMap = {};
  for (const h of headings) {
    if (isHidden(h)) continue;
    const t = (h.textContent || '').trim();
    if (t.length < 3) continue;
    (hTextMap[t] = hTextMap[t] || []).push(h.tagName.toLowerCase());
  }
  const dupHeadings = Object.entries(hTextMap).filter(([, arr]) => arr.length > 1);
  if (dupHeadings.length) {
    findings.push({
      type: 'duplicate-headings',
      items: dupHeadings
        .slice(0, 15)
        .map(([t, arr]) => ({ text: t, count: arr.length, tags: arr })),
    });
  }

  return { route: name, url, status: res.status, findings };
}

(async () => {
  const results = [];
  for (const r of ROUTES) {
    try {
      results.push(await auditRoute(r.name, r.url));
    } catch (e) {
      results.push({ route: r.name, url: r.url, error: String(e) });
    }
  }
  console.log(JSON.stringify(results, null, 2));
})();
