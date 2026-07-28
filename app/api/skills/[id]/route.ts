/**
 * Single-skill API — read / update / delete one skill by id.
 *
 * Built-in skills are read-only here: GET returns the catalog entry, PUT/DELETE
 * return 403. Custom skills support full CRUD via `lib/server/skill-storage.ts`.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { getSkillCatalogEntry, BUILT_IN_SKILL_IDS } from '@/lib/agent/tools/registry';
import { CustomSkill, validateCustomSkill } from '@/lib/agent/tools/custom-skill';
import {
  readCustomSkill,
  updateCustomSkill,
  deleteCustomSkill,
  isValidCustomSkillId,
} from '@/lib/server/skill-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('SkillDetailAPI');

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (BUILT_IN_SKILL_IDS.has(id)) {
      const entry = getSkillCatalogEntry(id);
      if (!entry) return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);
      return apiSuccess({ skill: { ...entry, source: 'builtin', enabled: true } });
    }

    if (!isValidCustomSkillId(id)) {
      return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);
    }
    const skill = await readCustomSkill(id);
    if (!skill) return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);
    return apiSuccess({ skill: { ...skill, source: 'custom' } });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Failed to load skill', {
      cause: error,
      label: 'SkillDetailAPI',
    });
  }
}

interface UpdateSkillBody {
  displayName?: unknown;
  category?: unknown;
  summary?: unknown;
  description?: unknown;
  promptTemplate?: unknown;
  parameters?: unknown;
  enabled?: unknown;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (BUILT_IN_SKILL_IDS.has(id)) {
      return apiError('INVALID_REQUEST', 403, 'Built-in skills cannot be modified');
    }
    if (!isValidCustomSkillId(id)) {
      return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);
    }

    const existing = await readCustomSkill(id);
    if (!existing) return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);

    const body = (await req.json()) as UpdateSkillBody;
    const updated: CustomSkill = {
      ...existing,
      displayName: typeof body.displayName === 'string' ? body.displayName : existing.displayName,
      category: (body.category as CustomSkill['category']) ?? existing.category,
      summary: typeof body.summary === 'string' ? body.summary : existing.summary,
      description: typeof body.description === 'string' ? body.description : existing.description,
      promptTemplate:
        typeof body.promptTemplate === 'string' ? body.promptTemplate : existing.promptTemplate,
      parameters: Array.isArray(body.parameters)
        ? (body.parameters as CustomSkill['parameters'])
        : existing.parameters,
      enabled: typeof body.enabled === 'boolean' ? body.enabled : existing.enabled,
      updatedAt: new Date().toISOString(),
    };

    const errors = validateCustomSkill(updated, { isNew: true });
    if (errors.length > 0) {
      return apiError('INVALID_REQUEST', 400, 'Invalid skill spec', errors.join('; '));
    }

    const saved = await updateCustomSkill(updated);
    log.info(`updated custom skill "${saved.id}"`);
    return apiSuccess({ skill: { ...saved, source: 'custom' as const } });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Failed to update skill', {
      cause: error,
      label: 'SkillDetailAPI',
    });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (BUILT_IN_SKILL_IDS.has(id)) {
      return apiError('INVALID_REQUEST', 403, 'Built-in skills cannot be deleted');
    }
    if (!isValidCustomSkillId(id)) {
      return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);
    }

    const deleted = await deleteCustomSkill(id);
    if (!deleted) return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);
    log.info(`deleted custom skill "${id}"`);
    return apiSuccess({ deleted: true });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Failed to delete skill', {
      cause: error,
      label: 'SkillDetailAPI',
    });
  }
}
