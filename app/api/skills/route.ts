/**
 * Skills Management API.
 *
 * GET  — list every skill: built-in (read-only) + custom (user-defined), each
 *        tagged with `source` so the UI can render built-ins as immutable.
 * POST — create a new custom skill (validated, persisted to data/skills/).
 *
 * Built-in skills come from `lib/agent/tools/registry.ts` and cannot be
 * modified through this API. Custom skills are prompt-based tools persisted
 * via `lib/server/skill-storage.ts`.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { sanitizedErrorDetails } from '@/lib/server/llm-error-response';
import { SKILL_CATALOG, V0_ALLOWLIST } from '@/lib/agent/tools/registry';
import {
  CustomSkill,
  validateCustomSkill,
  CUSTOM_SKILL_ID_PATTERN,
} from '@/lib/agent/tools/custom-skill';
import {
  listCustomSkills,
  createCustomSkill,
  isValidCustomSkillId,
} from '@/lib/server/skill-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('SkillsAPI');

export async function GET() {
  try {
    const custom = await listCustomSkills();
    const builtin = SKILL_CATALOG.map((entry) => ({
      ...entry,
      source: 'builtin' as const,
      enabled: V0_ALLOWLIST.has(entry.id),
    }));
    const customMapped = custom.map((s) => ({
      id: s.id,
      displayName: s.displayName,
      category: s.category,
      summary: s.summary,
      source: 'custom' as const,
      enabled: s.enabled,
      description: s.description,
      promptTemplate: s.promptTemplate,
      parameters: s.parameters,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));
    const skills = [...builtin, ...customMapped];
    return apiSuccess({
      skills,
      total: skills.length,
      enabledCount: skills.filter((s) => s.enabled).length,
    });
  } catch (error) {
    const message = sanitizedErrorDetails(error);
    log.error('Failed to list skills:', message);
    return apiError('INTERNAL_ERROR', 500, 'Failed to list skills');
  }
}

interface CreateSkillBody {
  id?: unknown;
  displayName?: unknown;
  category?: unknown;
  summary?: unknown;
  description?: unknown;
  promptTemplate?: unknown;
  parameters?: unknown;
  enabled?: unknown;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreateSkillBody;
    const now = new Date().toISOString();

    const skill: CustomSkill = {
      id: typeof body.id === 'string' ? body.id : '',
      displayName: typeof body.displayName === 'string' ? body.displayName : '',
      category: (body.category as CustomSkill['category']) ?? 'custom',
      summary: typeof body.summary === 'string' ? body.summary : '',
      description: typeof body.description === 'string' ? body.description : '',
      promptTemplate: typeof body.promptTemplate === 'string' ? body.promptTemplate : '',
      parameters: Array.isArray(body.parameters) ? (body.parameters as CustomSkill['parameters']) : [],
      enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
      createdAt: now,
      updatedAt: now,
    };

    // Fast-fail on id format before hitting the store, so an invalid id gives a
    // 400 with an actionable message instead of a generic validation error.
    if (!skill.id || !CUSTOM_SKILL_ID_PATTERN.test(skill.id) || !isValidCustomSkillId(skill.id)) {
      return apiError(
        'INVALID_REQUEST',
        400,
        'id is required and must match /^[a-z0-9_-]+$/ (max 64 chars, not a reserved built-in id)',
      );
    }

    const errors = validateCustomSkill(skill, { isNew: true });
    if (errors.length > 0) {
      return apiError('INVALID_REQUEST', 400, 'Invalid skill spec', errors.join('; '));
    }

    const created = await createCustomSkill(skill);
    log.info(`created custom skill "${created.id}"`);
    return apiSuccess({ skill: created }, 201);
  } catch (error) {
    const message = sanitizedErrorDetails(error);
    if (message.includes('already exists')) {
      return apiError('INVALID_REQUEST', 409, message);
    }
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Failed to create skill', {
      cause: error,
      label: 'SkillsAPI',
    });
  }
}
