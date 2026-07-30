#!/usr/bin/env node
/**
 * Pre-build Safety Check
 *
 * Runs before `next build` to catch issues that would cause build failures:
 *   1. Required dependencies are installed
 *   2. No browser-incompatible Node.js built-in imports in client code
 *   3. .env.local has critical variables (warn only)
 *   4. TypeScript compiles without errors
 *   5. ESLint passes without errors
 *
 * Usage: node scripts/pre-build-check.mjs [--skip-lint] [--skip-typecheck]
 *
 * Exit codes:
 *   0 = all checks passed (warnings are OK)
 *   1 = one or more checks failed
 */

import { execSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

const args = process.argv.slice(2);
const skipLint = args.includes('--skip-lint');
const skipTypecheck = args.includes('--skip-typecheck');

let hasErrors = false;
const warnings = [];

function log(level, message) {
  const color = { error: COLORS.red, warn: COLORS.yellow, info: COLORS.blue, success: COLORS.green }[level] || '';
  const prefix = { error: '✗ ERROR', warn: '⚠ WARN', info: 'ℹ INFO', success: '✓ PASS' }[level] || '';
  console.log(`${color}${prefix}${COLORS.reset} ${message}`);
}

function fail(message) {
  log('error', message);
  hasErrors = true;
}

// ── 1. Check required dependencies ────────────────────────────────────
console.log(`\n${COLORS.bold}1. Checking dependencies...${COLORS.reset}`);

const requiredDeps = [
  'next',
  'react',
  'react-dom',
  'ai',
  'drizzle-orm',
  'better-sqlite3',
  'nanoid',
  'pino',
];

const nodeModulesPath = join(process.cwd(), 'node_modules');
let missingDeps = [];

for (const dep of requiredDeps) {
  if (!existsSync(join(nodeModulesPath, dep))) {
    missingDeps.push(dep);
  }
}

// postgres is required for build (was previously optional)
if (!existsSync(join(nodeModulesPath, 'postgres'))) {
  missingDeps.push('postgres (was optionalDependencies, now required for build)');
}

if (missingDeps.length > 0) {
  fail(`Missing required dependencies: ${missingDeps.join(', ')}`);
  console.log(`       ${COLORS.gray}Run: pnpm install${COLORS.reset}`);
} else {
  log('success', 'All required dependencies are installed.');
}

// ── 2. Check for browser-incompatible imports in client code ──────────
console.log(`\n${COLORS.bold}2. Checking for browser-incompatible imports...${COLORS.reset}`);

const nodeBuiltins = ['async_hooks', 'child_process', 'cluster', 'crypto', 'dgram', 'dns', 'fs', 'http', 'http2', 'https', 'net', 'os', 'path', 'perf_hooks', 'process', 'readline', 'repl', 'stream', 'tls', 'tty', 'url', 'util', 'v8', 'vm', 'worker_threads', 'zlib'];

// Only scan files that have 'use client' directive
function findClientFiles(dir, results = []) {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    // Skip node_modules, .next, .git, etc.
    if (entry === 'node_modules' || entry === '.next' || entry === '.git' || entry === 'dist' || entry === 'build') {
      continue;
    }

    if (stat.isDirectory()) {
      findClientFiles(fullPath, results);
    } else if (stat.isFile() && (extname(entry) === '.ts' || extname(entry) === '.tsx')) {
      const content = readFileSync(fullPath, 'utf-8');
      if (content.includes("'use client'") || content.includes('"use client"')) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

const clientFiles = findClientFiles(join(process.cwd(), 'lib'))
  .concat(findClientFiles(join(process.cwd(), 'components')))
  .concat(findClientFiles(join(process.cwd(), 'app')));

let browserCompatIssues = [];
for (const file of clientFiles) {
  const content = readFileSync(file, 'utf-8');
  // Check for direct imports of Node.js builtins (not via require() with typeof window guard)
  for (const builtin of nodeBuiltins) {
    // Check for import statements (not require() with guards)
    const importRegex = new RegExp(`^(?!.*typeof window)(?!.*require)import\\s+.*from\\s+['"](?:node:)?${builtin}['"]`, 'm');
    if (importRegex.test(content)) {
      // Check if there's a typeof window guard in the file
      if (!content.includes('typeof window') || !content.includes(`require('${builtin}')`) && !content.includes(`require("${builtin}")`)) {
        browserCompatIssues.push(`${file}: imports "${builtin}" without typeof window guard`);
      }
    }
  }
}

if (browserCompatIssues.length > 0) {
  for (const issue of browserCompatIssues) {
    fail(issue);
  }
  console.log(`       ${COLORS.gray}Use conditional require with typeof window check for client components.${COLORS.reset}`);
} else {
  log('success', 'No browser-incompatible imports found in client code.');
}

// ── 3. Check .env.local for critical variables ────────────────────────
console.log(`\n${COLORS.bold}3. Checking .env.local configuration...${COLORS.reset}`);

const envLocalPath = join(process.cwd(), '.env.local');
if (existsSync(envLocalPath)) {
  const envContent = readFileSync(envLocalPath, 'utf-8');

  const criticalVars = {
    NEXTAUTH_SECRET: { required: true, message: 'Authentication will fail in production' },
    DEFAULT_MODEL: { required: true, message: 'Classroom generation will fail' },
  };

  for (const [varName, config] of Object.entries(criticalVars)) {
    const regex = new RegExp(`^${varName}=(.+)$`, 'm');
    const match = envContent.match(regex);
    if (!match) {
      warnings.push(`${varName} is not set in .env.local — ${config.message}`);
    } else if (match[1].trim() === '' || match[1].trim() === '""') {
      warnings.push(`${varName} is empty in .env.local — ${config.message}`);
    }
  }

  if (warnings.length > 0) {
    for (const w of warnings) {
      log('warn', w);
    }
  } else {
    log('success', 'Critical environment variables are set.');
  }
} else {
  log('warn', '.env.local not found. Create it with NEXTAUTH_SECRET and DEFAULT_MODEL.');
}

// ── 4. TypeScript check ───────────────────────────────────────────────
if (!skipTypecheck) {
  console.log(`\n${COLORS.bold}4. Running TypeScript check...${COLORS.reset}`);
  try {
    execSync('npx tsc --noEmit', { stdio: 'pipe', cwd: process.cwd() });
    log('success', 'TypeScript check passed.');
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
    fail('TypeScript check failed:');
    console.log(COLORS.gray + output.split('\n').slice(0, 30).join('\n') + COLORS.reset);
  }
} else {
  console.log(`\n${COLORS.bold}4. TypeScript check skipped.${COLORS.reset}`);
}

// ── 5. ESLint check ───────────────────────────────────────────────────
if (!skipLint) {
  console.log(`\n${COLORS.bold}5. Running ESLint check...${COLORS.reset}`);
  try {
    execSync('npx eslint', { stdio: 'pipe', cwd: process.cwd() });
    log('success', 'ESLint check passed.');
  } catch (err) {
    const output = err.stdout?.toString() || err.stderr?.toString() || err.message;
    // Distinguish errors from warnings
    if (output.includes('error')) {
      fail('ESLint check found errors:');
      console.log(COLORS.gray + output.split('\n').slice(0, 30).join('\n') + COLORS.reset);
    } else {
      log('warn', 'ESLint check found warnings (non-blocking).');
    }
  }
} else {
  console.log(`\n${COLORS.bold}5. ESLint check skipped.${COLORS.reset}`);
}

// ── Summary ───────────────────────────────────────────────────────────
console.log(`\n${COLORS.bold}═══ Pre-build Check Summary ═══${COLORS.reset}`);
if (hasErrors) {
  log('error', 'Build should not proceed. Fix the errors above first.');
  process.exit(1);
} else {
  log('success', 'All critical checks passed. Safe to build.');
  if (warnings.length > 0) {
    console.log(`${COLORS.yellow}  ${warnings.length} warning(s) — non-blocking but should be addressed.${COLORS.reset}`);
  }
  process.exit(0);
}
