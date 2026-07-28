import { apiSuccess } from '@/lib/server/api-response';

/**
 * Liveness probe.
 *
 * Returns 200 as long as the Node.js process is alive and serving requests.
 * Intentionally cheap (no provider config reads, no I/O) so it can be hit
 * frequently by container orchestrators (Docker HEALTHCHECK, k8s liveness)
 * without adding load or failing on transient upstream issues.
 */
export async function GET() {
  return apiSuccess({ status: 'ok' });
}
