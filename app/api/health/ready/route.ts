import { apiSuccess } from '@/lib/server/api-response';
import { buildReadinessPayload } from '@/lib/server/health';

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
  return apiSuccess(buildReadinessPayload());
}
