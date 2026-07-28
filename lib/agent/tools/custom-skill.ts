/**
 * Custom skills — user-defined, prompt-based agent tools.
 *
 * Built-in skills (`lib/agent/tools/registry.ts`) are TypeScript `AgentTool`
 * factories with request-scoped `execute` callbacks. Custom skills cannot
 * ship arbitrary code, so they are modelled as *prompt-based tools*: the user
 * supplies a name, description, a `{{param}}`-interpolated prompt template and
 * a parameter list; at runtime `execute` renders the template and calls the
 * LLM, returning the model's text as the tool result. This is the same pattern
 * the MCP adapter uses to surface external tools, and it composes with the
 * editor agent's allowlist gate the same way MCP tools do.
 *
 * Custom skills are persisted server-side (see `lib/server/skill-storage.ts`)
 * and dynamically registered into the agent at request time
 * (see `app/api/agent/edit/route.ts`).
 */
import { Type, type TSchema } from 'typebox';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import type { SkillCategory } from './registry';

export type CustomSkillParamType = 'string' | 'number' | 'boolean';

export interface CustomSkillParam {
  name: string;
  type: CustomSkillParamType;
  description: string;
  required: boolean;
}

export interface CustomSkill {
  /** Slug identifier; `^[a-z0-9_-]+$`, must not collide with built-in skill ids. */
  id: string;
  displayName: string;
  category: SkillCategory;
  /** One-line summary for the management UI. */
  summary: string;
  /** Full description shown to the agent so it knows when/how to call the tool. */
  description: string;
  /** Prompt template with `{{param}}` placeholders matching `parameters`. */
  promptTemplate: string;
  parameters: CustomSkillParam[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Function the adapter calls to execute a custom skill. Decoupled from the
 * route's stage-aware `aiCall` so this module does not depend on `LlmStage` —
 * the route wraps its `aiCall('nova-agent-custom', ...)` into this shape.
 */
export type CustomSkillCallFn = (
  system: string,
  prompt: string,
  signal?: AbortSignal,
) => Promise<string>;

/** IDs reserved for built-in skills — custom skills may not use these. */
const RESERVED_IDS = new Set<string>([
  'read_scene_content',
  'regenerate_scene',
  'regenerate_scene_actions',
  'edit_interactive_html',
  'edit_elements',
]);

export const CUSTOM_SKILL_ID_PATTERN = /^[a-z0-9_-]+$/;
export const CUSTOM_SKILL_ID_MAX_LEN = 64;
export const CUSTOM_SKILL_DESC_MAX_LEN = 2000;
export const CUSTOM_SKILL_PROMPT_MAX_LEN = 16000;
export const CUSTOM_SKILL_PARAMS_MAX = 12;

/** Validate a custom skill spec, returning a list of human-readable errors. */
export function validateCustomSkill(skill: unknown, opts?: { isNew?: boolean }): string[] {
  const errors: string[] = [];
  if (!skill || typeof skill !== 'object') return ['Skill must be an object.'];
  const s = skill as Record<string, unknown>;

  const id = s.id;
  if (typeof id !== 'string' || !CUSTOM_SKILL_ID_PATTERN.test(id)) {
    errors.push('id must match /^[a-z0-9_-]+$/');
  } else if (id.length > CUSTOM_SKILL_ID_MAX_LEN) {
    errors.push(`id must be at most ${CUSTOM_SKILL_ID_MAX_LEN} chars`);
  } else if (RESERVED_IDS.has(id)) {
    errors.push(`id "${id}" is reserved for a built-in skill`);
  }

  if (typeof s.displayName !== 'string' || s.displayName.trim().length === 0) {
    errors.push('displayName is required');
  } else if (s.displayName.length > 120) {
    errors.push('displayName must be at most 120 chars');
  }

  const validCategories: SkillCategory[] = ['read', 'regenerate', 'edit', 'custom'];
  if (!validCategories.includes(s.category as SkillCategory)) {
    errors.push('category must be one of read/regenerate/edit/custom');
  }

  if (typeof s.summary !== 'string' || s.summary.trim().length === 0) {
    errors.push('summary is required');
  } else if (s.summary.length > 200) {
    errors.push('summary must be at most 200 chars');
  }

  if (typeof s.description !== 'string' || s.description.trim().length === 0) {
    errors.push('description is required');
  } else if (s.description.length > CUSTOM_SKILL_DESC_MAX_LEN) {
    errors.push(`description must be at most ${CUSTOM_SKILL_DESC_MAX_LEN} chars`);
  }

  if (typeof s.promptTemplate !== 'string' || s.promptTemplate.trim().length === 0) {
    errors.push('promptTemplate is required');
  } else if (s.promptTemplate.length > CUSTOM_SKILL_PROMPT_MAX_LEN) {
    errors.push(`promptTemplate must be at most ${CUSTOM_SKILL_PROMPT_MAX_LEN} chars`);
  }

  const params = s.parameters;
  if (!Array.isArray(params)) {
    errors.push('parameters must be an array');
  } else {
    if (params.length > CUSTOM_SKILL_PARAMS_MAX) {
      errors.push(`parameters must have at most ${CUSTOM_SKILL_PARAMS_MAX} entries`);
    }
    const seenNames = new Set<string>();
    params.forEach((p, i) => {
      if (!p || typeof p !== 'object') {
        errors.push(`parameters[${i}] must be an object`);
        return;
      }
      const prm = p as Record<string, unknown>;
      if (typeof prm.name !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(prm.name)) {
        errors.push(`parameters[${i}].name must be a valid identifier`);
      } else if (seenNames.has(prm.name)) {
        errors.push(`parameters[${i}].name "${prm.name}" is duplicated`);
      } else {
        seenNames.add(prm.name);
      }
      if (!['string', 'number', 'boolean'].includes(prm.type as string)) {
        errors.push(`parameters[${i}].type must be string/number/boolean`);
      }
      if (typeof prm.description !== 'string') {
        errors.push(`parameters[${i}].description must be a string`);
      }
      if (typeof prm.required !== 'boolean') {
        errors.push(`parameters[${i}].required must be a boolean`);
      }
    });
  }

  if (typeof s.enabled !== 'boolean') {
    errors.push('enabled must be a boolean');
  }

  if (opts?.isNew) {
    if (typeof s.createdAt !== 'string') errors.push('createdAt is required');
    if (typeof s.updatedAt !== 'string') errors.push('updatedAt is required');
  }

  return errors;
}

/** Build a TypeBox schema from the parameter list, mirroring the MCP adapter. */
function buildParameterSchema(params: CustomSkillParam[]): TSchema {
  if (params.length === 0) return Type.Unsafe({ type: 'object', properties: {} }) as TSchema;
  const properties: Record<string, TSchema> = {};
  const required: string[] = [];
  for (const p of params) {
    const base =
      p.type === 'string' ? Type.String({ description: p.description }) :
      p.type === 'number' ? Type.Number({ description: p.description }) :
      Type.Boolean({ description: p.description });
    properties[p.name] = p.required ? base : Type.Optional(base);
    if (p.required) required.push(p.name);
  }
  return Type.Object(properties, { required: required.length > 0 ? required : undefined }) as TSchema;
}

/** Render a `{{param}}` template with validated, type-coerced arguments. */
export function renderSkillTemplate(
  template: string,
  params: CustomSkillParam[],
  args: Record<string, unknown>,
): string {
  const merged: Record<string, unknown> = {};
  for (const p of params) {
    const raw = args[p.name];
    if (raw === undefined || raw === null) continue;
    merged[p.name] =
      p.type === 'number' ? Number(raw) :
      p.type === 'boolean' ? Boolean(raw) :
      String(raw);
  }
  return template.replace(/{{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*}}/g, (_m, name: string) => {
    const v = merged[name];
    return v === undefined ? '' : String(v);
  });
}

/**
 * Build the pi `AgentTool` for a stored custom skill.
 *
 * `execute` renders the prompt template with the model-supplied arguments and
 * calls the LLM; the model's text is returned as the tool result so the agent
 * can reason over it. Failures are thrown — pi encodes thrown errors into the
 * tool-result surface itself, matching the built-in tool behaviour.
 */
export function buildCustomSkillTool(
  skill: CustomSkill,
  callFn: CustomSkillCallFn,
): AgentTool<never, never> {
  const systemPrompt =
    `You are executing the Nova custom skill "${skill.displayName}". ` +
    `Follow the skill's instructions precisely and return a concise, useful result.`;
  return {
    name: skill.id,
    label: skill.displayName,
    description: skill.description,
    parameters: buildParameterSchema(skill.parameters),
    async execute(_toolCallId, params) {
      const args = (params ?? {}) as Record<string, unknown>;
      const rendered = renderSkillTemplate(skill.promptTemplate, skill.parameters, args);
      const text = await callFn(systemPrompt, rendered);
      return {
        content: [{ type: 'text' as const, text: text || '(empty response)' }],
      };
    },
  } as AgentTool<never, never>;
}
