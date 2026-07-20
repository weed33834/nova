/**
 * Prompt Loader - Loads prompts from markdown files
 *
 * Supports:
 * - Loading prompts from templates/{promptId}/ directory
 * - Snippet inclusion via {{snippet:name}} syntax
 * - Conditional blocks via {{#if condition}}...{{/if}} syntax
 * - Variable interpolation via {{variable}} syntax
 */

import fs from 'fs';
import path from 'path';
import type { PromptId, LoadedPrompt, PromptConfig, SnippetId } from './types';
import { createLogger } from '@/lib/logger';
const log = createLogger('PromptLoader');

/** Default version applied when a prompt has no config.json sidecar. */
export const DEFAULT_PROMPT_VERSION = '1.0.0';

/**
 * Get the prompts directory path
 */
function getPromptsDir(): string {
  // In Next.js, use process.cwd() for the project root
  return path.join(process.cwd(), 'lib', 'prompts');
}

/**
 * Load a snippet by ID
 */
export function loadSnippet(snippetId: SnippetId): string {
  const snippetPath = path.join(getPromptsDir(), 'snippets', `${snippetId}.md`);

  try {
    return fs.readFileSync(snippetPath, 'utf-8').trim();
  } catch {
    // Fail loud rather than silently shipping `{{snippet:foo}}` to the LLM.
    // A missing snippet is always a config/typo bug — surface at load time.
    throw new Error(`Snippet not found: ${snippetId}`);
  }
}

/**
 * Process snippet includes in a template.
 * Replaces {{snippet:name}} with actual snippet content.
 */
export function processSnippets(template: string): string {
  return template.replace(/\{\{snippet:(\w[\w-]*)\}\}/g, (_, snippetId) => {
    return loadSnippet(snippetId as SnippetId);
  });
}

/**
 * Process conditional blocks in a template.
 * Replaces {{#if conditionName}}...{{/if}} with the inner content when the
 * named condition is truthy, or removes the entire block when it is falsy.
 *
 * Blocks do not nest — this is intentional to keep the prompt templating
 * language simple and reviewable.
 */
export function processConditionalBlocks(
  template: string,
  conditions: Record<string, unknown>,
): string {
  return template.replace(
    /\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g,
    (_, conditionName: string, content: string) => {
      return conditions[conditionName] ? content : '';
    },
  );
}

/**
 * Load the optional `config.json` sidecar for a prompt template.
 *
 * Returns `undefined` when no sidecar is present (the common case). Throws on
 * a malformed file so a typo in config.json fails loud at load time rather
 * than silently shipping default metadata — matching the snippet-not-found
 * behavior.
 */
export function loadPromptConfig(promptId: PromptId): PromptConfig | undefined {
  const configPath = path.join(getPromptsDir(), 'templates', promptId, 'config.json');
  let raw: string;
  try {
    raw = fs.readFileSync(configPath, 'utf-8');
  } catch {
    return undefined; // config.json is optional
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Prompt "${promptId}" config.json is not valid JSON: ${String(error)}`);
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`Prompt "${promptId}" config.json must be a JSON object`);
  }
  const obj = parsed as Record<string, unknown>;

  // Light validation — keep the schema permissive so adding fields is cheap.
  if (obj.version !== undefined && typeof obj.version !== 'string') {
    throw new Error(`Prompt "${promptId}" config.json "version" must be a string`);
  }
  if (obj.description !== undefined && typeof obj.description !== 'string') {
    throw new Error(`Prompt "${promptId}" config.json "description" must be a string`);
  }
  if (obj.displayName !== undefined && typeof obj.displayName !== 'string') {
    throw new Error(`Prompt "${promptId}" config.json "displayName" must be a string`);
  }
  if (obj.deprecated !== undefined && typeof obj.deprecated !== 'boolean') {
    throw new Error(`Prompt "${promptId}" config.json "deprecated" must be a boolean`);
  }
  if (obj.tags !== undefined) {
    if (!Array.isArray(obj.tags) || obj.tags.some((t) => typeof t !== 'string')) {
      throw new Error(`Prompt "${promptId}" config.json "tags" must be an array of strings`);
    }
  }

  return {
    version: typeof obj.version === 'string' ? obj.version : DEFAULT_PROMPT_VERSION,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    tags: Array.isArray(obj.tags) ? (obj.tags as string[]) : undefined,
    deprecated: obj.deprecated === true,
    displayName: typeof obj.displayName === 'string' ? obj.displayName : undefined,
  };
}

/**
 * Load a prompt by ID
 */
export function loadPrompt(promptId: PromptId): LoadedPrompt | null {
  const promptDir = path.join(getPromptsDir(), 'templates', promptId);

  try {
    // Load system.md
    const systemPath = path.join(promptDir, 'system.md');
    let systemPrompt = fs.readFileSync(systemPath, 'utf-8').trim();
    systemPrompt = processSnippets(systemPrompt);

    // Load user.md (optional, may not exist)
    const userPath = path.join(promptDir, 'user.md');
    let userPromptTemplate = '';
    try {
      userPromptTemplate = fs.readFileSync(userPath, 'utf-8').trim();
      userPromptTemplate = processSnippets(userPromptTemplate);
    } catch {
      // user.md is optional
    }

    // Load optional config.json sidecar (absent → defaults).
    const config = loadPromptConfig(promptId);

    return {
      id: promptId,
      systemPrompt,
      userPromptTemplate,
      config,
      version: config?.version ?? DEFAULT_PROMPT_VERSION,
      deprecated: config?.deprecated ?? false,
    };
  } catch (error) {
    log.error(`Failed to load prompt ${promptId}:`, error);
    return null;
  }
}

/**
 * Interpolate variables in a template
 * Replaces {{variable}} with values from the variables object
 */
export function interpolateVariables(template: string, variables: Record<string, unknown>): string {
  // `\w+` only matches [A-Za-z0-9_], so kebab-case placeholders like
  // `{{next-agent}}` pass through unchanged. Convention (per README) is
  // camelCase; tests in tests/prompts/templates.test.ts scan templates
  // for non-conforming placeholders.
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const value = variables[key];
    if (value === undefined) return match;
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  });
}

/**
 * Build a complete prompt with variables.
 *
 * Processing order:
 *   1. Snippet includes ({{snippet:name}}) — file content spliced in
 *   2. Conditional blocks ({{#if flag}}...{{/if}}) — gated on `variables`
 *   3. Variable interpolation ({{varName}}) — values substituted
 */
export function buildPrompt(
  promptId: PromptId,
  variables: Record<string, unknown>,
): { system: string; user: string } | null {
  const prompt = loadPrompt(promptId);
  if (!prompt) return null;

  return {
    system: interpolateVariables(
      processConditionalBlocks(prompt.systemPrompt, variables),
      variables,
    ),
    user: interpolateVariables(
      processConditionalBlocks(prompt.userPromptTemplate, variables),
      variables,
    ),
  };
}
