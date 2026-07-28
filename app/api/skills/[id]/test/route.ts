/**
 * Skill invoke-test API.
 *
 * POST /api/skills/[id]/test  { args: Record<string, unknown> }
 *
 * Runs a custom skill's prompt template with the supplied args against the
 * resolved LLM and returns the model's text — so the management UI can show
 * the user what their skill actually does before enabling it. Built-in skills
 * are not testable here (they require request-scoped scene deps); they return
 * 403 with an actionable message.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { BUILT_IN_SKILL_IDS } from '@/lib/agent/tools/registry';
import {
  buildCustomSkillTool,
  type CustomSkillCallFn,
} from '@/lib/agent/tools/custom-skill';
import { readCustomSkill, isValidCustomSkillId } from '@/lib/server/skill-storage';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';

const log = createLogger('SkillTestAPI');

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    if (BUILT_IN_SKILL_IDS.has(id)) {
      return apiError(
        'INVALID_REQUEST',
        403,
        'Built-in skills cannot be tested here (they require live scene context). Test them from the editor sidebar.',
      );
    }
    if (!isValidCustomSkillId(id)) {
      return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);
    }

    const skill = await readCustomSkill(id);
    if (!skill) return apiError('INVALID_REQUEST', 404, `Skill "${id}" not found`);

    const body = (await req.json().catch(() => ({}))) as { args?: unknown };
    const args =
      body.args && typeof body.args === 'object' ? (body.args as Record<string, unknown>) : {};

    const resolved = await resolveModelFromRequest(req, body, 'nova-agent');

    const callFn: CustomSkillCallFn = (system, prompt, signal) =>
      callLLM(
        {
          model: resolved.model,
          system,
          prompt,
          maxOutputTokens: resolved.modelInfo?.outputWindow,
          abortSignal: signal,
        },
        'nova-skill-test',
        undefined,
        resolved.thinkingConfig,
      ).then((r) => r.text);

    const tool = buildCustomSkillTool(skill, callFn);
    // execute(toolCallId, params) — invoke directly with the user's args.
    // The tool's params type is `never` at the type level (matching the
    // built-in tool factory pattern), so the runtime-checked args must be
    // cast through `never` to satisfy execute's signature.
    const result = await tool.execute('skill-test', args as never);
    const text = result.content
      .map((c) => (c.type === 'text' ? c.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim();

    log.info(`tested custom skill "${id}" (${text.length} chars output)`);
    return apiSuccess({ output: text, args });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Skill test failed', {
      cause: error,
      label: 'SkillTestAPI',
    });
  }
}
