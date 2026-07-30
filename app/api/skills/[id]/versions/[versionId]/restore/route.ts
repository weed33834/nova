/**
 * Skill Version Restore API
 *
 * POST /api/skills/[id]/versions/[versionId]/restore
 *
 * Restores a skill to a previous version. The current version is
 * automatically snapshotted into the version history before restoring.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { BUILT_IN_SKILL_IDS } from '@/lib/agent/tools/registry';
import { restoreSkillVersion, isValidCustomSkillId } from '@/lib/server/skill-storage';

export const POST = withApiHandler(async (
  _req: NextRequest,
  _ctx,
  { params }: { params: Promise<{ id: string; versionId: string }> },
) => {
  try {
    const { id, versionId } = await params;

    if (BUILT_IN_SKILL_IDS.has(id)) {
      return apiError('INVALID_REQUEST', 403, 'Built-in skills cannot be version-controlled');
    }
    if (!isValidCustomSkillId(id)) {
      return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);
    }

    const restored = await restoreSkillVersion(id, versionId);
    if (!restored) {
      return apiError('INVALID_REQUEST', 404, `Version "${versionId}" of skill "${id}" not found`);
    }

    return apiSuccess({ skill: { ...restored, source: 'custom' as const } });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Failed to restore skill version', {
      cause: error,
      label: 'SkillVersionRestoreAPI',
    });
  }
}, { rateLimit: 'moderate' });
