import { apiSuccess } from '@/lib/server/api-response';
import {
  getServerWebSearchProviders,
  getServerImageProviders,
  getServerVideoProviders,
  getServerTTSProviders,
} from '@/lib/server/provider-config';

const version = process.env.npm_package_version || '0.1.0';

/**
 * Readiness probe.
 *
 * Reports whether the service is fully configured to serve user traffic:
 * which optional modalities (web search / image / video / TTS) are backed by
 * a configured provider. A 200 here means "ready"; callers that need a
 * specific modality should inspect `capabilities`.
 *
 * This is the richer of the two health checks; liveness is at
 * `/api/health/live`. The legacy `/api/health` endpoint delegates here for
 * backward compatibility with existing monitors.
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
