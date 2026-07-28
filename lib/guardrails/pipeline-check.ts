/**
 * Guardrails pipeline integration — post-generation content safety check.
 *
 * Connects the guardrails system (PII / toxicity / hallucination / misinformation
 * detection) to the course generation pipeline. Runs as a post-check after scene
 * content + actions are generated.
 *
 * By default the check is non-blocking: it logs warnings but does NOT modify or
 * reject the content. When a {@link GuardrailsBlockingConfig} is supplied with
 * `enabled: true`, any failed check at or above a listed severity causes a
 * {@link GuardrailBlockError} to be thrown, so the caller can skip the scene.
 */
import { runAllGuardrails } from './content-safety';
import { GuardrailBlockError } from './types';
import type { GuardrailReport, GuardrailsBlockingConfig, Severity } from './types';
import type { Action } from '@/lib/types/action';
import { createLogger } from '@/lib/logger';

const log = createLogger('GuardrailsPipeline');

const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

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
 * - Logs warnings for any failed checks.
 * - Does NOT modify the generated content.
 * - When `blocking` is enabled and a failed check's severity matches one of
 *   `blockSeverities`, throws {@link GuardrailBlockError} so the caller can
 *   skip the scene.
 * - Returns the report so the caller can optionally attach it to scene metadata.
 *
 * @param sceneTitle - for log attribution
 * @param actions - the generated actions array (speech text is extracted)
 * @param sourceContent - optional source material to check generated content
 *   against (enables the hallucination consistency check)
 * @param blocking - optional blocking configuration; when omitted the check
 *   is non-blocking (warning-only)
 * @returns the guardrail report, or null if there's no text to check
 * @throws {GuardrailBlockError} when blocking is enabled and a failed check
 *   reaches a configured severity
 */
export function checkGeneratedContent(
  sceneTitle: string,
  actions: Action[],
  sourceContent?: string,
  blocking?: GuardrailsBlockingConfig,
): GuardrailReport | null {
  const text = extractSpeechText(actions);
  if (!text.trim()) return null;

  const report = runAllGuardrails(text, sourceContent);

  if (!report.passed) {
    const failed = report.checks.filter((c) => !c.passed);
    log.warn(
      `Guardrail check flagged scene "${sceneTitle}": ${failed.length} issue(s) — ` +
        failed.map((c) => `${c.type}(${c.severity}): ${c.message}`).join('; '),
    );

    if (blocking?.enabled) {
      const threshold = SEVERITY_RANK[blocking.minBlockSeverity];
      const shouldBlock = failed.some(
        (c) => SEVERITY_RANK[c.severity] >= threshold,
      );
      if (shouldBlock) {
        log.warn(
          `Blocking scene "${sceneTitle}" — guardrail threshold reached ` +
            `(min severity: ${blocking.minBlockSeverity})`,
        );
        throw new GuardrailBlockError(report);
      }
    }
  } else {
    log.debug(`Guardrail check passed for scene "${sceneTitle}"`);
  }

  return report;
}
