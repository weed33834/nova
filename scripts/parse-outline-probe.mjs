// 解析 outline 流式响应，列出每个场景的 type / widgetType / title
import { readFileSync } from 'node:fs';

const file = process.argv[2] || './outline_probe2.txt';
const raw = readFileSync(file, 'utf8');
const seen = new Map();

for (const line of raw.split(/\r?\n/)) {
  let s = line.trim();
  if (s.startsWith('data:')) s = s.slice(5).trim();
  if (!s || s === '[DONE]') continue;
  let o;
  try {
    o = JSON.parse(s);
  } catch {
    continue;
  }
  const arr = [];
  if (o.outline) arr.push(o.outline);
  if (Array.isArray(o.outlines)) arr.push(...o.outlines);
  if (Array.isArray(o.scenes)) arr.push(...o.scenes);
  for (const it of arr) {
    if (!it || !it.title) continue;
    seen.set(it.title, it);
  }
}

let i = 0;
for (const [title, it] of seen) {
  i++;
  console.log(
    String(i).padStart(2),
    '|',
    String(it.type || '?').padEnd(12),
    '|',
    String(it.widgetType || '-').padEnd(15),
    '|',
    title,
  );
}
console.log('total scenes:', seen.size);
const types = {};
for (const [, it] of seen) types[it.type || '?'] = (types[it.type || '?'] || 0) + 1;
console.log('type breakdown:', JSON.stringify(types));
