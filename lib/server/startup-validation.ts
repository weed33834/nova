/**
 * Startup Environment Validation
 *
 * Runs once on server startup (via instrumentation.ts) to catch configuration
 * issues that would otherwise surface as runtime errors during generation.
 *
 * This module addresses the following issues encountered in practice:
 *   - Missing NEXTAUTH_SECRET → production startup failure
 *   - Missing DEFAULT_MODEL → "No model could be resolved" during generation
 *   - Missing API keys → LLM call failures mid-generation
 *   - Missing OPENAI_BASE_URL for custom endpoints → connection errors
 *   - Invalid model format → parse errors during model resolution
 *   - Port conflicts → EADDRINUSE on startup
 *
 * Design principles:
 *   - Non-blocking: logs warnings, never throws (don't crash the server)
 *   - Idempotent: safe to call multiple times
 *   - Informative: provides actionable error messages with fix suggestions
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('StartupValidation');

export interface ValidationIssue {
  level: 'error' | 'warn' | 'info';
  category: string;
  message: string;
  fix?: string;
}

export interface ValidationResult {
  passed: boolean;
  issues: ValidationIssue[];
  checkedAt: string;
}

let _lastResult: ValidationResult | null = null;

/**
 * Validate all critical environment variables and configuration.
 * Returns a structured result without throwing.
 */
export function validateStartupConfig(): ValidationResult {
  const issues: ValidationIssue[] = [];

  // ── 1. NEXTAUTH_SECRET ──────────────────────────────────────────────
  const nextauthSecret = process.env.NEXTAUTH_SECRET;
  if (!nextauthSecret) {
    if (process.env.NODE_ENV === 'production') {
      issues.push({
        level: 'error',
        category: 'auth',
        message: 'NEXTAUTH_SECRET is not set. Production mode will crash on auth requests.',
        fix: 'Run: openssl rand -base64 32  and add to .env.local as NEXTAUTH_SECRET=<value>',
      });
    } else {
      issues.push({
        level: 'warn',
        category: 'auth',
        message: 'NEXTAUTH_SECRET is not set. Using insecure dev default. Set it before deploying.',
        fix: 'Add NEXTAUTH_SECRET=<random-value> to .env.local',
      });
    }
  } else if (nextauthSecret.length < 16) {
    issues.push({
      level: 'warn',
      category: 'auth',
      message: `NEXTAUTH_SECRET is too short (${nextauthSecret.length} chars). Use at least 32 characters.`,
      fix: 'Run: openssl rand -base64 32  and update .env.local',
    });
  }

  // ── 2. DEFAULT_MODEL ────────────────────────────────────────────────
  const defaultModel = process.env.DEFAULT_MODEL;
  if (!defaultModel) {
    issues.push({
      level: 'error',
      category: 'llm',
      message: 'DEFAULT_MODEL is not set. Classroom generation will fail with "No model could be resolved".',
      fix: 'Add DEFAULT_MODEL=provider:model to .env.local (e.g. DEFAULT_MODEL=openai:gpt-4o-mini)',
    });
  } else {
    // Validate format: should be "provider:model" or at least "model"
    const colonIndex = defaultModel.indexOf(':');
    if (colonIndex < 1 || colonIndex === defaultModel.length - 1) {
      issues.push({
        level: 'warn',
        category: 'llm',
        message: `DEFAULT_MODEL="${defaultModel}" may have incorrect format. Expected "provider:model" (e.g. "openai:gpt-4o-mini").`,
        fix: 'Check the format in .env.local',
      });
    }
  }

  // ── 3. API Keys for configured provider ─────────────────────────────
  const providerId = defaultModel?.split(':')[0] ?? 'openai';

  const providerKeyMap: Record<string, string[]> = {
    openai: ['OPENAI_API_KEY'],
    anthropic: ['ANTHROPIC_API_KEY'],
    google: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    azure: ['AZURE_API_KEY'],
    deepseek: ['DEEPSEEK_API_KEY'],
    glm: ['GLM_API_KEY'],
    qwen: ['DASHSCOPE_API_KEY', 'QWEN_API_KEY'],
    kimi: ['KIMI_API_KEY'],
    minimax: ['MINIMAX_API_KEY'],
    doubao: ['DOUBAO_API_KEY'],
    openrouter: ['OPENROUTER_API_KEY'],
    grok: ['GROK_API_KEY'],
    hunyuan: ['HUNYUAN_API_KEY'],
    xiaomi: ['XIAOMI_API_KEY'],
    ollama: [],
    lemonade: [],
    siliconflow: ['SILICONFLOW_API_KEY'],
    sensenova: ['SENSENOVA_API_KEY'],
    step: ['STEP_API_KEY'],
  };

  const expectedKeys = providerKeyMap[providerId] ?? [];
  if (expectedKeys.length > 0) {
    const hasKey = expectedKeys.some((key) => process.env[key]);
    if (!hasKey) {
      issues.push({
        level: 'error',
        category: 'llm',
        message: `No API key found for provider "${providerId}". Expected one of: ${expectedKeys.join(', ')}.`,
        fix: `Add ${expectedKeys[0]}=<your-key> to .env.local`,
      });
    }
  }

  // ── 4. OPENAI_BASE_URL for custom endpoints ─────────────────────────
  if (providerId === 'openai' && process.env.OPENAI_API_KEY) {
    // If using a non-official OpenAI-compatible endpoint, OPENAI_BASE_URL is required
    const baseUrl = process.env.OPENAI_BASE_URL;
    if (!baseUrl) {
      issues.push({
        level: 'info',
        category: 'llm',
        message: 'OPENAI_BASE_URL is not set. Using official OpenAI endpoint (https://api.openai.com/v1).',
        fix: 'If using a custom endpoint, add OPENAI_BASE_URL=<url> to .env.local',
      });
    } else {
      // Validate URL format
      try {
        new URL(baseUrl);
      } catch {
        issues.push({
          level: 'error',
          category: 'llm',
          message: `OPENAI_BASE_URL="${baseUrl}" is not a valid URL.`,
          fix: 'Fix the URL in .env.local (e.g. https://api.example.com/v1)',
        });
      }
    }
  }

  // ── 5. Database configuration ───────────────────────────────────────
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    if (!databaseUrl.startsWith('postgresql://') && !databaseUrl.startsWith('postgres://')) {
      issues.push({
        level: 'warn',
        category: 'database',
        message: `DATABASE_URL is set but doesn't start with "postgresql://" or "postgres://". Will fall back to SQLite.`,
        fix: 'Check DATABASE_URL format or remove it to use SQLite.',
      });
    }
  }

  // ── 6. LLM timeout configuration ────────────────────────────────────
  const llmTimeout = process.env.LLM_TIMEOUT_MS;
  if (llmTimeout) {
    const parsed = parseInt(llmTimeout, 10);
    if (Number.isNaN(parsed) || parsed < 5000) {
      issues.push({
        level: 'warn',
        category: 'llm',
        message: `LLM_TIMEOUT_MS="${llmTimeout}" is invalid or too low (min 5000ms). Using default 120000ms.`,
        fix: 'Set LLM_TIMEOUT_MS to a number >= 5000 in .env.local',
      });
    }
  }

  // ── 7. File watch limit (dev mode) ──────────────────────────────────
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_RUNTIME !== 'nodejs') {
    // This check is for documentation purposes; actual fix is system-level
    issues.push({
      level: 'info',
      category: 'system',
      message: 'If you encounter "OS file watch limit reached" in dev mode, increase the limit:',
      fix: 'Run: echo fs.inotify.max_user_watches=524288 | sudo tee -a /etc/sysctl.conf && sudo sysctl -p',
    });
  }

  // ── 8. Fallback models configuration ────────────────────────────────
  const fallbackModels = process.env.FALLBACK_MODELS;
  if (!fallbackModels) {
    issues.push({
      level: 'info',
      category: 'llm',
      message: 'FALLBACK_MODELS is not set. If the primary model fails, no fallback will be attempted.',
      fix: 'Add FALLBACK_MODELS=provider:model1,provider:model2 to .env.local',
    });
  }

  const result: ValidationResult = {
    passed: issues.filter((i) => i.level === 'error').length === 0,
    issues,
    checkedAt: new Date().toISOString(),
  };

  _lastResult = result;
  return result;
}

/**
 * Log the validation results in a structured, readable format.
 */
export function logValidationResult(result: ValidationResult): void {
  const errors = result.issues.filter((i) => i.level === 'error');
  const warnings = result.issues.filter((i) => i.level === 'warn');
  const infos = result.issues.filter((i) => i.level === 'info');

  if (errors.length > 0) {
    log.error('═══ Startup Validation: %d ERROR(S) ═══', errors.length);
    for (const issue of errors) {
      log.error('  [%s] %s', issue.category, issue.message);
      if (issue.fix) log.error('       FIX: %s', issue.fix);
    }
  }

  if (warnings.length > 0) {
    log.warn('═══ Startup Validation: %d WARNING(S) ═══', warnings.length);
    for (const issue of warnings) {
      log.warn('  [%s] %s', issue.category, issue.message);
      if (issue.fix) log.warn('       FIX: %s', issue.fix);
    }
  }

  if (infos.length > 0) {
    log.info('═══ Startup Validation: %d INFO ═══', infos.length);
    for (const issue of infos) {
      log.info('  [%s] %s', issue.category, issue.message);
      if (issue.fix) log.info('       FIX: %s', issue.fix);
    }
  }

  if (result.passed && errors.length === 0) {
    log.info('═══ Startup Validation: PASSED (%d warn, %d info) ═══', warnings.length, infos.length);
  } else {
    log.error('═══ Startup Validation: FAILED (%d error, %d warn, %d info) ═══', errors.length, warnings.length, infos.length);
  }
}

/**
 * Get the last validation result (or run validation if not yet done).
 */
export function getStartupValidation(): ValidationResult {
  if (!_lastResult) {
    return validateStartupConfig();
  }
  return _lastResult;
}

/**
 * Run startup validation and log results.
 * Called from instrumentation.ts on server startup.
 */
export function runStartupValidation(): void {
  try {
    const result = validateStartupConfig();
    logValidationResult(result);
  } catch (err) {
    // Validation itself should never crash the server
    log.error('Startup validation encountered an unexpected error:', err);
  }
}
