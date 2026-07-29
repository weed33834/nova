/**
 * Skill import API.
 *
 * POST /api/skills/import  { skills: CustomSkill[] | CustomSkill, overwrite?: boolean }
 *
 * Bulk-imports custom skills from a JSON payload (single object or array).
 * Useful for transferring a skill pack between deployments. Each spec is
 * validated and timestamped. By default existing ids are skipped (reported as
 * `skipped`); pass `overwrite: true` to replace them.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { CustomSkill, validateCustomSkill } from '@/lib/agent/tools/custom-skill';
import {
  readCustomSkill,
  createCustomSkill,
  updateCustomSkill,
  isValidCustomSkillId,
} from '@/lib/server/skill-storage';
import { createLogger } from '@/lib/logger';

const log = createLogger('SkillImportAPI');

interface ImportBody {
  skills?: unknown;
  overwrite?: unknown;
}

export const POST = withApiHandler(async (req: NextRequest) => {
  try {
    const body = (await req.json()) as ImportBody;
    const overwrite = body.overwrite === true;

    const input = Array.isArray(body.skills)
      ? body.skills
      : body.skills && typeof body.skills === 'object'
        ? [body.skills]
        : null;
    if (!input) {
      return apiError('INVALID_REQUEST', 400, '`skills` (object or array) is required');
    }

    const created: string[] = [];
    const updated: string[] = [];
    const skipped: Array<{ id: string; reason: string }> = [];

    for (const raw of input) {
      const id =
        raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string'
          ? (raw as { id: string }).id
          : '';
      if (!id || !isValidCustomSkillId(id)) {
        skipped.push({ id: id || '<missing>', reason: 'invalid id' });
        continue;
      }
      const now = new Date().toISOString();
      const skill: CustomSkill = {
        ...(raw as CustomSkill),
        id,
        createdAt: (raw as { createdAt?: string }).createdAt ?? now,
        updatedAt: now,
      } as CustomSkill;

      const errors = validateCustomSkill(skill, { isNew: true });
      if (errors.length > 0) {
        skipped.push({ id, reason: errors[0] });
        continue;
      }

      const existing = await readCustomSkill(id);
      if (existing && !overwrite) {
        skipped.push({ id, reason: 'already exists (pass overwrite:true to replace)' });
        continue;
      }
      if (existing) {
        await updateCustomSkill({ ...skill, createdAt: existing.createdAt });
        updated.push(id);
      } else {
        await createCustomSkill(skill);
        created.push(id);
      }
    }

    log.info(`import: ${created.length} created, ${updated.length} updated, ${skipped.length} skipped`);
    return apiSuccess({ created, updated, skipped });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Skill import failed', {
      cause: error,
      label: 'SkillImportAPI',
    });
  }
}, { rateLimit: 'moderate' });
