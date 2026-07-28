import { apiSuccess } from '@/lib/server/api-response';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

/**
 * Legacy health endpoint.
 *
 * Retained for backward compatibility with existing monitors / load balancers
 * that hit `/api/health`. It behaves identically to the readiness probe at
 * `/api/health/ready`. New code should prefer:
 *   - `/api/health/live`  — cheap liveness (process up)
 *   - `/api/health/ready` — readiness (capabilities configured)
 */
export async function GET() {
  return apiSuccess({
    status: 'ok',
    version,
    capabilities: {
      webSearch: Object.keys(getServerWebSearchProviders()).length > 0,
      imageGeneration: Object.keys(getServerImageProviders()).length > 0,
      videoGeneration: Object.keys(getServerVideoProviders()).length > 0,
      tts: Object.values(getServerTTSProviders()).some((info) => !info.disabled),
    },
  });
}
