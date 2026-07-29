import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

/**
 * Build the readiness response payload shared by `/api/health` (legacy) and
 * `/api/health/ready`. Extracted so the two endpoints stay in lockstep without
 * copy-pasted construction logic.
 */
export function buildReadinessPayload() {
  return {
    status: 'ok' as const,
    version,
    capabilities: {
      webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
      imageGeneration: Object.keys(getServerImageProviders()).length > 0,
      videoGeneration: Object.keys(getServerVideoProviders()).length > 0,
      tts: Object.values(getServerTTSProviders()).some((info) => !info.disabled),
    },
  };
}
