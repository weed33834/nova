/**
 * Guardrails pipeline integration — post-generation content safety check.
 *
 * Connects the guardrails system (PII / toxicity / hallucination / misinformation
 * detection) to the course generation pipeline. Runs as a non-blocking post-check
 * after scene content + actions are generated: logs warnings but does NOT modify
 * or reject the content. The report is returned so callers can optionally surface
 * it to the UI.
 */
import { runAllGuardrails } from './content-safety';
import type { GuardrailReport } from './types';
import type { Action } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';

const log = createLogger('GuardrailsPipeline');

/**
 * Extract spoken/narration text from generated actions.
 * Speech actions carry the text that will be TTS'd and shown to students —
 * the highest-value content for safety checking.
 */
function extractSpeechText(actions: Action[]): string {
  return actions
    .filter((a) => a.type === 'speech')
    .map((a) => (a as { text?: string }).text)
    .filter((t): t is string => !!t && t.trim().length > 0)
    .join('\n');
}

/**
 * Run guardrails on generated scene content as a post-generation check.
 *
 * Non-blocking by design:
 * - Logs warnings for any failed checks
 * - Does NOT modify the generated content
 * - Does NOT throw or reject the scene
 * - Returns the report so the caller can attach it to the scene metadata
 *
 * @param sceneTitle - for log attribution
 * @param actions - the generated actions array (speech text is extracted)
 * @returns the guardrail report, or null if there's no text to check
 */
export function checkGeneratedContent(
  sceneTitle: string,
  actions: Action[],
): GuardrailReport | null {
  const text = extractSpeechText(actions);
  if (!text.trim()) return null;

  const report = runAllGuardrails(text);

  if (!report.passed) {
    const failed = report.checks.filter((c) => !c.passed);
    log.warn(
      `Guardrail check flagged scene "${sceneTitle}": ${failed.length} issue(s) — ` +
        failed
          .map((c) => `${c.type}(${c.severity}): ${c.message}`)
          .join('; '),
    );
  } else {
    log.debug(`Guardrail check passed for scene "${sceneTitle}"`);
  }

  return report;
}
