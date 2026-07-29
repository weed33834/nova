/**
 * Feature Flags — environment-variable-driven feature toggling.
 *
 * Allows gradual rollout and A/B testing of features without code changes.
 * Flags are read from environment variables with the `FEATURE_` prefix.
 *
 * Usage:
 * ```ts
 * import { isFeatureEnabled, getFeatureConfig } from '@/lib/server/feature-flags';
 *
 * if (isFeatureEnabled('VIDEO_EXPORT')) {
 *   // show video export UI
 * }
 *
 * const quotaLimit = getFeatureConfig('QUOTA_LIMIT', '1000');
 * ```
 *
 * Environment variables:
 *   FEATURE_VIDEO_EXPORT=true
 *   FEATURE_QUOTA_LIMIT=1000
 *   FEATURE_EXPERIMENTAL_MODEL_ROUTING=false
 */
import { createLogger } from '@/lib/logger';

const log = createLogger('FeatureFlags');

/** Cache of parsed flag values (re-read on first access per cold start). */
let flagCache: Record<string, string | boolean> | null = null;

/**
 * Parse all FEATURE_* environment variables into a cache.
 * Called once on first access; subsequent calls use the cache.
 */
function loadFlags(): Record<string, string | boolean> {
  if (flagCache) return flagCache;

  const flags: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('FEATURE_')) {
      const flagName = key.slice('FEATURE_'.length);
      // Parse boolean values
      if (value === 'true' || value === '1' || value === 'yes') {
        flags[flagName] = true;
      } else if (value === 'false' || value === '0' || value === 'no') {
        flags[flagName] = false;
      } else if (value !== undefined && value !== '') {
        flags[flagName] = value;
      }
    }
  }

  flagCache = flags;
  log.debug(`Loaded ${Object.keys(flags).length} feature flags`);
  return flags;
}

/**
 * Check if a boolean feature flag is enabled.
 * Returns false for unset flags (safe default — features are opt-in).
 */
export function isFeatureEnabled(flagName: string): boolean {
  const flags = loadFlags();
  const value = flags[flagName.toUpperCase()];
  return value === true;
}

/**
 * Get a feature flag's configured value (string or boolean).
 * Returns the provided default if the flag is not set.
 */
export function getFeatureConfig(flagName: string, defaultValue: string): string {
  const flags = loadFlags();
  const value = flags[flagName.toUpperCase()];
  if (value === undefined || value === false) return defaultValue;
  if (value === true) return 'true';
  return String(value);
}

/**
 * Get a numeric feature flag value.
 * Returns the default if the flag is not set or invalid.
 */
export function getFeatureNumber(flagName: string, defaultValue: number): number {
  const strValue = getFeatureConfig(flagName, String(defaultValue));
  const parsed = parseInt(strValue, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/**
 * Clear the flag cache (useful for testing).
 */
export function resetFeatureFlags(): void {
  flagCache = null;
}

/**
 * Get all feature flags as a read-only object (for debugging/admin UI).
 */
export function getAllFeatureFlags(): Record<string, string | boolean> {
  return { ...loadFlags() };
}
