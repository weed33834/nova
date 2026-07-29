/**
 * OpenTelemetry instrumentation for Next.js.
 *
 * Uses `@vercel/otel` (the official Vercel OTel package for Next.js) to
 * automatically instrument:
 * - HTTP requests (incoming + outgoing fetch)
 * - Next.js App Router spans
 * - Node.js runtime metrics (via @opentelemetry/sdk-node)
 *
 * Exporters:
 * - When `OTEL_EXPORTER_OTLP_ENDPOINT` is set, traces are exported via OTLP
 *   (works with Jaeger, Tempo, Honeycomb, Datadog, etc.).
 * - When unset, traces go to the console (dev) or are discarded (prod).
 *
 * This file is imported by `instrumentation.ts` via `registerOTel()`.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/open-telemetry
 */
import { registerOTel } from '@vercel/otel';

/**
 * Register OpenTelemetry instrumentation.
 * Called from instrumentation.ts on server startup.
 *
 * No-op if @vercel/otel is not available (shouldn't happen, but defensive).
 */
export function registerOpenTelemetry(): void {
  const serviceName = process.env.OTEL_SERVICE_NAME || 'nova';

  try {
    registerOTel({
      serviceName,
      // When OTEL_EXPORTER_OTLP_ENDPOINT is set, @vercel/otel automatically
      // configures the OTLP exporter. When unset, it uses a no-op exporter.
      attributes: {
        'deployment.environment': process.env.NODE_ENV || 'development',
        'service.version': process.env.npm_package_version || '0.1.0',
      },
    });
  } catch {
    // Silently fail — OTel is observability, not critical path
    console.warn('[OTel] Failed to register OpenTelemetry instrumentation');
  }
}
