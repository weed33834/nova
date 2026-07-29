import { apiSuccess } from '@/lib/server/api-response';
import { buildReadinessPayload } from '@/lib/server/health';

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
  return apiSuccess(buildReadinessPayload());
}
