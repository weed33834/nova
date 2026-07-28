/**
 * Feature flags. Public flags come from `NEXT_PUBLIC_*` env vars, which
 * Next.js inlines at build time so they are safe to read from client
 * components. Server-only flags must not use the `NEXT_PUBLIC_` prefix.
 *
 * Truthy values: `'true'` or `'1'`. Anything else (including unset) is
 * treated as disabled.
 *
 * Naming convention: all nova-owned flags use the `NOVA_` prefix. Two flags
 * previously shipped with mixed-case names (`NEXT_PUBLIC_Nova_EDITOR_ENABLED`
 * and `OPENNova_ENABLE_VOCATIONAL`); those are still accepted as legacy
 * aliases (with a one-shot deprecation warning) so existing deployments keep
 * working, but new deployments should use the canonical names below.
 */

function readBoolean(envValue: string | undefined): boolean {
  return envValue === 'true' || envValue === '1';
}

/** Tracks which legacy aliases have already warned, to avoid log spam. */
const warnedLegacyFlags = new Set<string>();

/**
 * Read a boolean flag, preferring the canonical name and falling back to a
 * legacy alias. Emits a one-shot deprecation warning when only the legacy
 * alias is set, so operators know to rename their env var.
 */
function readFlagWithLegacyAlias(canonical: string, legacy: string): boolean {
  if (process.env[canonical] !== undefined) {
    return readBoolean(process.env[canonical]);
  }
  if (process.env[legacy] !== undefined) {
    if (!warnedLegacyFlags.has(legacy) && typeof console !== 'undefined' && console.warn) {
      warnedLegacyFlags.add(legacy);
      console.warn(
        `[nova] env var "${legacy}" is deprecated; rename it to "${canonical}".`,
      );
    }
    return readBoolean(process.env[legacy]);
  }
  return false;
}

/**
 * Nova Editor (Pro mode) gate. Default OFF — gates only the Pro toggle
 * affordance in `Header`. The `StageMode` type union is unaffected so
 * existing code paths typecheck identically with the flag in either
 * state.
 *
 * Canonical env var: `NEXT_PUBLIC_NOVA_EDITOR_ENABLED`
 * Legacy alias (deprecated): `NEXT_PUBLIC_Nova_EDITOR_ENABLED`
 */
export function isNovaEditorEnabled(): boolean {
  return readFlagWithLegacyAlias(
    'NEXT_PUBLIC_NOVA_EDITOR_ENABLED',
    'NEXT_PUBLIC_Nova_EDITOR_ENABLED',
  );
}

/**
 * Server-authoritative gate for the vocational task-engine generation path.
 * Default OFF. When disabled, requests that include taskEngineMode must
 * silently fall back to the ordinary standard / interactive generation paths.
 *
 * Canonical env var: `NOVA_ENABLE_VOCATIONAL`
 * Legacy alias (deprecated): `OPENNova_ENABLE_VOCATIONAL`
 */
export function isVocationalTaskEngineEnabled(): boolean {
  return readFlagWithLegacyAlias('NOVA_ENABLE_VOCATIONAL', 'OPENNova_ENABLE_VOCATIONAL');
}

export function resolveVocationalActive(
  requirements?: { taskEngineMode?: boolean } | null,
): boolean {
  return Boolean(requirements?.taskEngineMode) && isVocationalTaskEngineEnabled();
}

/**
 * Optional client-only affordance for exposing the experimental vocational
 * test toggle. This is not a security or routing gate.
 */
export function shouldShowVocationalTestUi(): boolean {
  return readBoolean(process.env.NEXT_PUBLIC_SHOW_VOCATIONAL_TEST_UI);
}
