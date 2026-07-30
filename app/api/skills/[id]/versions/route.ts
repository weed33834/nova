/**
 * Skill Version History API
 *
 * GET /api/skills/[id]/versions — list all versions of a skill (newest first)
 *
 * Returns the version history for a custom skill, including version numbers,
 * timestamps, and changelog entries.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { BUILT_IN_SKILL_IDS } from '@/lib/agent/tools/registry';
import { listSkillVersions, isValidCustomSkillId } from '@/lib/server/skill-storage';

export const GET = withApiHandler(async (
  _req: NextRequest,
  _ctx,
  { params }: { params: Promise<{ id: string }> },
) => {
  try {
    const { id } = await params;

    if (BUILT_IN_SKILL_IDS.has(id)) {
      return apiError('INVALID_REQUEST', 403, 'Built-in skills do not have version history');
    }
    if (!isValidCustomSkillId(id)) {
      return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);
    }

    const versions = await listSkillVersions(id);
    return apiSuccess({ versions });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Failed to list skill versions', {
      cause: error,
      label: 'SkillVersionsAPI',
    });
  }
}, { rateLimit: 'light' });
