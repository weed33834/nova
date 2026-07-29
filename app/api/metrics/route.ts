import { type NextRequest, NextResponse } from 'next/server';
import { getMetrics, getMetricsContentType } from '@/lib/server/metrics';

/**
 * GET /api/metrics — Prometheus metrics endpoint.
 *
 * Protected by either:
 *  - A `METRICS_TOKEN` env var (checked via Authorization header)
 *  - The `ACCESS_CODE` env var (checked via query param)
 *  - No protection if neither is set (development mode)
 */
export async function GET(req: NextRequest) {
  // Determine auth method
  const metricsToken = process.env.METRICS_TOKEN;
  const accessCode = process.env.ACCESS_CODE;

  if (metricsToken) {
    const auth = req.headers.get('authorization') || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    if (token !== metricsToken) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
  } else if (accessCode) {
    const queryToken = req.nextUrl.searchParams.get('token');
    if (queryToken !== accessCode) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
  }

  const metrics = await getMetrics();
  return new NextResponse(metrics, {
    headers: {
      'Content-Type': getMetricsContentType(),
      'Cache-Control': 'no-store',
    },
  });
}
