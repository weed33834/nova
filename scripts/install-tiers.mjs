#!/usr/bin/env node
/**
 * Nova 分级安装工具 —— 解决"克隆快但依赖安装慢"的问题。
 *
 * 设计原则：
 *  - Core（启动必需）：只装运行主界面 + 课程生成 + 多智能体课堂的最小依赖，
 *    让 `pnpm install` 在 1~2 分钟内完成（本机二次安装秒级）。
 *  - Extras（按需）：图表/代码高亮/公式/富文本编辑器/流程图/智能体框架/文档解析
 *    等高级功能依赖。想用时 `pnpm run install:extras` 一键补齐。
 *  - workspace 包（@nova/*、pptxgenjs、mathml2omml）是运行必需，始终安装，
 *    无法降级。
 *
 * 用法：
 *  node scripts/install-tiers.mjs core     # 只装核心（推荐首次 clone 用）
 *  node scripts/install-tiers.mjs extras   # 补齐高级功能依赖
 *  node scripts/install-tiers.mjs all      # 一次性装全（等价 pnpm install）
 */
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PKG = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf-8'));
const ALL_DEPS = Object.keys(PKG.dependencies || {});

// ── 分级清单 ──────────────────────────────────────────────────────────────
// Core：框架 / 状态 / UI / 认证 / AI SDK / i18n / 数据库 / 工具 / workspace 包
// 判断标准：首页与课堂首屏渲染、课程生成主链路、多智能体运行时不依赖它。
const CORE_FORCE = new Set([
  // 框架
  'next', 'react', 'react-dom',
  // 状态管理
  'zustand', 'immer',
  // UI 基础
  'motion', 'lucide-react', 'radix-ui', 'sonner', 'cmdk',
  '@radix-ui/react-checkbox', '@radix-ui/react-popover', '@radix-ui/react-slider',
  '@radix-ui/react-switch', '@radix-ui/react-use-controllable-state',
  'next-themes', 'embla-carousel-react',
  // 样式
  'clsx', 'tailwind-merge', 'class-variance-authority', 'tw-animate-css', 'tailwindcss',
  // 认证与安全
  'next-auth', 'bcryptjs', 'sanitize-html',
  // 校验
  'zod', 'typebox',
  // AI SDK（多提供商）
  'ai', '@ai-sdk/anthropic', '@ai-sdk/azure', '@ai-sdk/google', '@ai-sdk/openai',
  '@earendil-works/pi-ai', '@earendil-works/pi-agent-core',
  // 核心交互（必装，不参与降级——砍掉等于砍掉产品核心能力）
  '@assistant-ui/react', '@assistant-ui/react-streamdown',
  '@streamdown/code', 'streamdown', // 流式 Markdown / 代码渲染（聊天显示核心）
  '@xyflow/react',
  'prosemirror-commands', 'prosemirror-dropcursor', 'prosemirror-gapcursor',
  'prosemirror-history', 'prosemirror-inputrules', 'prosemirror-keymap',
  'prosemirror-model', 'prosemirror-schema-basic', 'prosemirror-schema-list',
  'prosemirror-state', 'prosemirror-view',
  // i18n
  'i18next', 'react-i18next', 'i18next-resources-to-backend',
  'geist', '@fontsource-variable/inter', '@fontsource/noto-sans-sc', '@fontsource/noto-serif-sc',
  // 数据库
  'better-sqlite3', 'drizzle-orm', '@auth/drizzle-adapter', 'dexie',
  // 工具
  'nanoid', 'mitt', 'lodash', 'js-yaml', 'pino', 'pino-pretty', 'opossum',
  'jsonrepair', 'partial-json', 'file-saver',
  // 可观测
  '@sentry/nextjs', '@opentelemetry/api', '@vercel/otel', 'prom-client',
  // workspace 包（运行必需，不可降级）
  '@nova/dsl', '@nova/importer', '@nova/renderer', '@nova/storage',
  'pptxgenjs', 'mathml2omml', 'pptxtojson',
  'sharp', // 图片处理，Next Image 依赖
  'undici',
]);

// Extras：按需安装的高级功能依赖（全部已/可完成动态加载降级，未装不影响启动）
const EXTRAS_FORCE = new Set([
  'echarts',                       // 数据图表可视化
  'shiki',                         // 代码高亮（已降级改造）
  'katex', 'temml',                // 公式渲染
  '@langchain/core', '@langchain/langgraph',     // 智能体编排框架
  '@modelcontextprotocol/sdk',     // MCP 工具接入
  '@alicloud/credentials', '@alicloud/docmind-api20220711',
  '@alicloud/openapi-client', '@alicloud/tea-util', // 阿里云文档解析
  '@aws-sdk/client-s3',            // 对象存储
  'unpdf',                         // PDF 解析
  'jszip',                         // 压缩导出
  'react-colorful',                // 颜色选择器
  '@asteasolutions/zod-to-openapi', // API 文档
  'tokenlens',
  'svg-arc-to-cubic-bezier', 'svg-pathdata', 'tinycolor2',
  '@fontsource/jetbrains-mono', '@fontsource/literata', '@fontsource/lxgw-wenkai',
  '@fontsource/merriweather', '@fontsource/montserrat', '@fontsource/open-sans',
  '@fontsource/roboto', '@fontsource/source-sans-3', '@fontsource/source-serif-4',
  '@fontsource/zcool-kuaile',
]);

// 计算
const tier = process.argv[2];
if (!['core', 'extras', 'all'].includes(tier)) {
  console.error('用法: node scripts/install-tiers.mjs <core|extras|all>');
  process.exit(1);
}

const coreDeps = ALL_DEPS.filter((d) => CORE_FORCE.has(d));
const extrasDeps = ALL_DEPS.filter((d) => EXTRAS_FORCE.has(d));
const both = ALL_DEPS.filter((d) => CORE_FORCE.has(d) && EXTRAS_FORCE.has(d));
const untagged = ALL_DEPS.filter((d) => !CORE_FORCE.has(d) && !EXTRAS_FORCE.has(d));

let targets;
if (tier === 'core') targets = coreDeps;
else if (tier === 'extras') targets = extrasDeps;
else targets = ALL_DEPS;

console.log(`\n=== Nova 分级安装: ${tier} ===`);
console.log(`全部依赖: ${ALL_DEPS.length} 个`);
console.log(`  Core: ${coreDeps.length} 个（启动必需）`);
console.log(`  Extras: ${extrasDeps.length} 个（按需高级功能）`);
console.log(`  重叠(双标): ${both.length} 个`);
if (untagged.length) console.log(`  未分类: ${untagged.join(', ')}`);
console.log(`\n本次将安装 ${targets.length} 个: ${targets.slice(0, 15).join(', ')}${targets.length > 15 ? '...' : ''}`);

// 用 pnpm add 安装（-E 锁定精确版本，保持 lockfile 一致；-w 声明 workspace root）
const versionOf = (name) => PKG.dependencies[name] || '';
const specs = targets.map((n) => (versionOf(n) && !versionOf(n).startsWith('workspace:') ? `${n}@${versionOf(n)}` : n));
const pnpmCmd = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
console.log('\n执行: pnpm add -w ' + specs.slice(0, 10).join(' ') + (specs.length > 10 ? ' ...' : ''));
const r = spawnSync(pnpmCmd, ['add', '-w', ...specs], {
  cwd: ROOT,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(r.status ?? 1);
