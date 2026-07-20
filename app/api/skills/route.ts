/**
 * Skills Management API — read-only catalog endpoint.
 *
 * Returns the v0 skill catalog (5 built-in skills across read/regenerate/edit
 * categories) with display names and summaries. This lets the Settings UI and
 * external tools enumerate available skills via HTTP without MCP.
 *
 * Skills are currently static (v0) — the allowlist and catalog are defined in
 * lib/agent/tools/registry.ts. A future version may support dynamic
 * registration via plugins.
 */
import { apiSuccess, apiError } from '@/lib/server/api-response';
import { SKILL_CATALOG, V0_ALLOWLIST, getSkillCatalogEntry } from '@/lib/agent/tools/registry';
import { createLogger } from '@/lib/logger';

const log = createLogger('SkillsAPI');

export async function GET() {
  try {
    const skills = SKILL_CATALOG.map((entry) => ({
      ...entry,
      enabled: V0_ALLOWLIST.has(entry.id),
    }));

    return apiSuccess({
      skills,
      total: skills.length,
      enabledCount: skills.filter((s) => s.enabled).length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Failed to list skills:', message);
    return apiError('INTERNAL_ERROR', 500, 'Failed to list skills');
  }
}
