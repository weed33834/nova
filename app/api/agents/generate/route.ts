/**
 * Agent AI-generation API.
 *
 * POST /api/agents/generate  { description: string }
 *
 * Asks the resolved LLM to draft a custom-agent profile (id, name, role,
 * systemPrompt, voice, avatar, category, allowedActions) from a plain
 * natural-language description. The generated profile is NOT persisted — it is
 * returned to the UI for review, then the user saves it via POST /api/agents.
 *
 * This mirrors the "AI auto-generate a skill" affordance so users can describe a
 * classroom participant ("a patient biology tutor who asks checking-for-
 * understanding questions") and get a structured agent config back.
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, apiErrorLogged } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { requireAuth } from '@/lib/auth/rbac';
import { validateCustomAgent } from '@/lib/server/agent-storage';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';
import { callLLM } from '@/lib/ai/llm';
import { jsonrepair } from 'jsonrepair';
import { createLogger } from '@/lib/logger';

const log = createLogger('AgentGenAPI');

const SYSTEM_PROMPT = [
  'You design custom AI agents for Nova, an AI classroom platform.',
  'An "agent" is a classroom participant with a persona: it has a name, a role, a system prompt that defines its personality and behaviour, an optional voice and avatar, a category, and a list of allowed classroom actions.',
  'Given a natural-language description, produce ONE agent profile as strict JSON (no markdown fences, no commentary) with this exact shape:',
  '{',
  '  "id": "lowercase_slug_with_underscores_or_hyphens",',
  '  "name": "Human-readable display name",',
  '  "role": "teacher" | "assistant" | "student",',
  '  "systemPrompt": "The full persona system prompt. 2-6 sentences describing personality, teaching style, tone, and how the agent should behave. Be specific and vivid.",',
  '  "voice": "optional voice identifier or null",',
  '  "avatar": "optional avatar path or null",',
  '  "category": "optional grouping label or null",',
  '  "allowedActions": ["wb_draw_text", "spotlight", ...]',
  '}',
  'Rules:',
  '- id must match /^[a-z0-9_-]+$/ and not start with "default-".',
  '- role must be one of teacher/assistant/student.',
  '- systemPrompt is the most important field: make it rich, specific, and self-contained.',
  '- allowedActions is an array of action strings. Common actions include: "spotlight", "laser", "play_video", "wb_open", "wb_close", "wb_draw_text", "wb_draw_shape", "wb_draw_chart", "wb_draw_latex", "wb_draw_table", "wb_draw_line", "wb_draw_code", "wb_edit_code", "wb_clear", "wb_delete". Pick actions appropriate to the role (teachers get slide + whiteboard actions; students typically get whiteboard only).',
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
      'nova-agent-gen',
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

    // Validate structure (without requiring timestamps — those are stamped on
    // create). Surface validation errors so the UI can show why a generated
    // profile was rejected.
    const stampable =
      parsed && typeof parsed === 'object'
        ? {
            ...parsed,
            enabled: true,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }
        : parsed;
    const errors = validateCustomAgent(stampable, { isNew: true });
    if (errors.length > 0) {
      log.warn(`generated agent failed validation: ${errors.join('; ')}`);
      return apiError(
        'GENERATION_FAILED',
        422,
        'Generated agent profile is invalid',
        errors.join('; '),
      );
    }

    // Return without server-stamped fields so the UI sends a clean spec to
    // POST /api/agents.
    const agent = parsed as Record<string, unknown>;
    delete agent.createdAt;
    delete agent.updatedAt;
    delete agent.enabled;
    return apiSuccess({ agent: parsed });
  } catch (error) {
    return apiErrorLogged('INTERNAL_ERROR', 500, 'Agent generation failed', {
      cause: error,
      label: 'AgentGenAPI',
    });
  }
}, { rateLimit: 'generation' });
