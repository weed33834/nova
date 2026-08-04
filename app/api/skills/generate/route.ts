/**
 * Skill AI-generation API.
 *
 * POST /api/skills/generate  { description: string }
 *
 * Asks the resolved LLM to draft a custom-skill spec (id, displayName,
 * category, summary, description, promptTemplate, parameters) from a plain
 * natural-language description. The generated spec is NOT persisted — it is
 * returned to the UI for review, then the user saves it via POST /api/skills.
 *
 * This implements the "AI auto-generate a skill" affordance: the user describes
 * a capability ("summarise the current scene for a 10-year-old"), the model
 * produces a structured tool definition, and the user approves/tweaks it.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { requireAuth } from '@/lib/auth/rbac';
import { validateCustomSkill } from '@/lib/agent/tools/custom-skill';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { callLLM } from '@/lib/ai/llm';
import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';

const log = createLogger('SkillGenAPI');

const SYSTEM_PROMPT = [
  'You design reusable agent skills for Nova, an AI classroom platform.',
  'A "skill" is a prompt-based tool that the classroom agent can invoke: it has a name, a description (telling the agent WHEN to call it), a prompt template with {{param}} placeholders, and a parameter list.',
  'Given a natural-language capability description, produce ONE skill spec as strict JSON (no markdown fences, no commentary) with this exact shape:',
  '{',
  '  "id": "lowercase_slug_with_underscores_or_hyphens",',
  '  "displayName": "Human-readable name",',
  '  "category": "read" | "regenerate" | "edit" | "custom",',
  '  "summary": "One-line summary (<=200 chars)",',
  '  "description": "2-4 sentences telling the agent when and how to call this tool",',
  '  "promptTemplate": "The prompt body. Reference parameters as {{paramName}}. Be specific about the desired output format.",',
  '  "parameters": [ { "name": "paramName", "type": "string"|"number"|"boolean", "description": "...", "required": true } ],',
  '  "enabled": true,',
  '}',
  'Rules:',
  '- id must match /^[a-z0-9_-]+$/ and not be a reserved id (read_scene_content, regenerate_scene, regenerate_scene_actions, edit_interactive_html, edit_elements).',
  '- Use 0-6 parameters; every {{param}} in the template must be declared.',
  '- The promptTemplate must be self-contained (the agent has no other context).',
  '- Output ONLY the JSON object.',
].join('\n');

interface GenerateBody {
  description?: unknown;
}

export const POST = withApiHandler(async (req: NextRequest) => {
  // AI 生成消耗 LLM 额度，必须登录
  await requireAuth();
  try {
    const body = (await req.json().catch(() => ({}))) as GenerateBody;
    const description =
      typeof body.description === 'string' ? body.description.trim() : '';
    if (!description) {
      return apiError('INVALID_REQUEST', 400, '`description` is required');
    }
    if (description.length > 1000) {
      return apiError('INVALID_REQUEST', 400, 'description must be <= 1000 chars');
    }

    const resolved = await resolveModelFromRequest(req, body, 'nova-agent');
    const result = await callLLM(
      {
        model: resolved.model,
        system: SYSTEM_PROMPT,
        prompt: description,
        maxOutputTokens: 2048,
      },
      'nova-skill-gen',
      undefined,
      resolved.thinkingConfig,
    );
    const raw = result.text.trim();

    // The model is asked for bare JSON, but be lenient: strip a single markdown
    // fence if present, then jsonrepair handles trailing commas / truncated output.
    const stripped = raw
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(stripped);
    } catch {
      parsed = JSON.parse(jsonrepair(stripped));
    }

    // Validate structure (without requiring createdAt/updatedAt — those are
    // stamped on create). Surface validation errors so the UI can show why a
    // generated spec was rejected.
    const stampable =
      parsed && typeof parsed === 'object'
        ? { enabled: true, ...parsed, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }
        : parsed;
    const errors = validateCustomSkill(stampable, { isNew: true });
    if (errors.length > 0) {
      log.warn(`generated skill failed validation: ${errors.join('; ')}`);
      return apiError('GENERATION_FAILED', 422, 'Generated skill spec is invalid', errors.join('; '));
    }

    // Return without timestamps so the UI sends a clean spec to POST /api/skills.
    const skill = parsed as Record<string, unknown>;
    delete skill.createdAt;
    delete skill.updatedAt;
    return apiSuccess({ skill: parsed });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Skill generation failed', {
      cause: error,
      label: 'SkillGenAPI',
    });
  }
}, { rateLimit: 'generation' });
