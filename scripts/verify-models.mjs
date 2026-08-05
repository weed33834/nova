#!/usr/bin/env node
/**
 * 模型可用性探活工具 —— 防止使用额度耗尽/未激活的模型导致生成失败。
 *
 * 用法：
 *  node scripts/verify-models.mjs                    # 探活 .env.local 配置的所有模型
 *  node scripts/verify-models.mjs openai:qwen3.8-max # 只探活指定模型
 *
 * 输出：每个模型 "✓ 可用 (X.Xs)" 或 "✗ 不可用 (<原因>)"，退出码 0=全部可用，1=有不可用。
 */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.local');

// 简易 .env 解析（支持引号与注释）
function loadEnv(file) {
  const env = {};
  if (!existsSync(file)) return env;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[m[1]] = val;
  }
  return env;
}

const env = loadEnv(ENV_FILE);
const KEY = env.OPENAI_API_KEY || env.ALI_KEY;
const BASE = env.OPENAI_BASE_URL || env.ALI_BASE || 'https://api.openai.com/v1';

function modelSpecs() {
  const specs = [];
  const defaultModel = env.DEFAULT_MODEL || 'openai:';
  const fallbacks = (env.LLM_FALLBACK_MODELS || '').split(',').filter(Boolean);
  // DEFAULT_MODEL 形如 provider:model
  const [defProvider, defModel] = defaultModel.split(':');
  if (defModel) specs.push(`${defProvider}:${defModel}`);
  for (const fb of fallbacks) specs.push(fb.trim());
  // 各 provider 的 *_MODELS
  const envModels = Object.entries(env).filter(([k]) => /_(MODELS|MODEL)$/.test(k));
  for (const [, v] of envModels) {
    for (const model of v.split(',').filter(Boolean)) {
      const provider = model.split(':')[0] === model ? 'openai' : model.split(':')[0];
      specs.push(model.includes(':') ? model : `${provider}:${model}`);
    }
  }
  return [...new Set(specs)];
}

async function probe(spec) {
  const [provider, model] = spec.includes(':') ? spec.split(':') : ['openai', spec];
  const t0 = Date.now();
  try {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${KEY || ''}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: '回复OK' }], max_tokens: 100 }),
      signal: AbortSignal.timeout(60000),
    });
    const data = await r.json();
    const dt = ((Date.now() - t0) / 1000).toFixed(1);
    if (!r.ok) {
      const code = data?.error?.code || data?.error?.type || r.status;
      const msg = data?.error?.message || '';
      return { spec: `${provider}:${model}`, ok: false, detail: `${code} ${msg.slice(0, 80)}` };
    }
    const content = data?.choices?.[0]?.message?.content || '';
    return { spec: `${provider}:${model}`, ok: !!content, detail: content ? `content=${content.length}字 ${dt}s` : 'empty content' };
  } catch (e) {
    return { spec: `${provider}:${model}`, ok: false, detail: `${e.name} ${e.message.slice(0, 60)}` };
  }
}

const only = process.argv[2];
const specs = only ? [only] : modelSpecs();
if (!KEY) {
  console.error('未找到 OPENAI_API_KEY / ALI_KEY（检查 .env.local）');
  process.exit(1);
}
console.log(`模型探活（baseUrl=${BASE}）\n`);
let allOk = true;
for (const s of specs) {
  const r = await probe(s);
  console.log(`  ${r.ok ? '✓' : '✗'} ${r.spec.padEnd(30)} ${r.detail}`);
  if (!r.ok) allOk = false;
}
console.log(`\n${allOk ? '全部模型可用' : '存在不可用模型（请调整 DEFAULT_MODEL / LLM_FALLBACK_MODELS）'}`);
process.exit(allOk ? 0 : 1);
