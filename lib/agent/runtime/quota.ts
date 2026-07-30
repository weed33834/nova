/**
 * Quota enforcement hook for the pi agent runtime.
 *
 * Wraps the existing `checkQuota` / `recordUsage` system from
 * `lib/server/quota.ts` into an `afterToolCall` hook that:
 *  1. Records tool invocations as `llm` usage (each tool call consumes one LLM credit)
 *  2. Terminates the agent loop when the monthly quota is exhausted
 *
 * The hook is async-safe and degrades gracefully — if the quota system is
 * unavailable (e.g., DB not configured), it logs a warning and allows the
 * call to proceed (fail-open), matching the existing quota check behavior
 * in the API routes.
 */
import type { AfterToolCallContext, AfterToolCallResult } from '@earendil-works/pi-agent-core';
import { checkQuota, recordUsage, type QuotaKind } from '@/lib/server/quota';
import { createLogger } from '@/lib/logger';

const log = createLogger('QuotaHook');

export interface QuotaHookConfig {
  /** The user ID whose quota should be checked. */
  userId: string | null;
  /** The user's role (admins bypass quota). */
  userRole?: string;
  /**
   * Which quota kind to consume. Defaults to `'llm'` since tool calls
   * are LLM-adjacent operations. Override for specialized tools
   * (e.g., image generation → `'image'`).
   */
  quotaKind?: QuotaKind;
  /**
   * The provider/model identifiers to record against. Defaults to
   * `'nova'` / `'agent-tool'` for built-in tools.
   */
  providerId?: string;
  modelId?: string;
}

/**
 * Create an `afterToolCall` hook that enforces per-user monthly quota.
 *
 * Usage in `buildAgent`:
 * ```ts
 * const quotaHook = makeQuotaHook({
 *   userId: ctx.userId,
 *   userRole: ctx.userRole,
 *   quotaKind: 'llm',
 * });
 * agent.hooks.afterToolCall = quotaHook;
 * ```
 *
 * The hook:
 * - Records each tool invocation as one usage unit
 * - Checks remaining quota after recording
 * - Returns `{ terminate: true }` when quota is exhausted, causing the
 *   agent loop to stop gracefully
 */
export function makeQuotaHook(config: QuotaHookConfig) {
  const {
    userId,
    userRole,
    quotaKind = 'llm',
    providerId = 'nova',
    modelId = 'agent-tool',
  } = config;

  return async (ctx: AfterToolCallContext): Promise<AfterToolCallResult | undefined> => {
    // No user → no quota tracking (anonymous/demo mode)
    if (!userId) return undefined;

    try {
      // Record this tool invocation
      await recordUsage(userId, quotaKind, providerId, modelId, 1);

      // Check remaining quota
      const status = await checkQuota(userId, quotaKind, userRole);
      if (status.exceeded) {
        log.warn('Quota exceeded, terminating agent loop', {
          userId,
          kind: quotaKind,
          used: status.used,
          limit: status.limit,
        });
        return { terminate: true };
      }
    } catch (err) {
      // Fail-open: log and continue if the quota system is unavailable
      log.warn('Quota check failed, allowing tool call', { userId, err });
    }

    return undefined;
  };
}
