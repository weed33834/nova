import { NextResponse } from 'next/server';
import { getOpenApiDocument } from '@/lib/server/openapi-registry';
// Import route registrations — this registers all documented routes
// with the OpenAPI registry as a side effect.
import '@/lib/server/openapi-routes';

/** GET /api/docs — OpenAPI 3.1 JSON spec */
export async function GET() {
  const doc = getOpenApiDocument();
  return NextResponse.json(doc, {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=300, must-revalidate',
    },
  });
}
