/**
 * Prometheus metrics collection.
 *
 * Uses `prom-client` to collect default Node.js metrics (GC, event loop,
 * memory, CPU) plus custom Nova business metrics. Exposed at `/api/metrics`.
 *
 * Metrics are collected lazily — the registry is a singleton, so the same
 * metric instances are reused across requests.
 */
import { Registry, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// ── Singleton registry ────────────────────────────────────────────────────

const register = new Registry();
collectDefaultMetrics({ register, prefix: 'nova_' });

// ── Custom metrics ────────────────────────────────────────────────────────

/** HTTP request count by method, route, and status code. */
export const httpRequestCounter = new Counter({
  name: 'nova_http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [register],
});

/** HTTP request duration histogram. */
export const httpRequestDuration = new Histogram({
  name: 'nova_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status'] as const,
  buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30],
  registers: [register],
});

/** AI generation counter by type and provider. */
export const aiGenerationCounter = new Counter({
  name: 'nova_ai_generations_total',
  help: 'Total AI generation requests',
  labelNames: ['type', 'provider', 'status'] as const,
  registers: [register],
});

/** AI generation duration histogram. */
export const aiGenerationDuration = new Histogram({
  name: 'nova_ai_generation_duration_seconds',
  help: 'AI generation duration in seconds',
  labelNames: ['type', 'provider'] as const,
  buckets: [0.5, 1, 2, 5, 10, 20, 30, 60, 120],
  registers: [register],
});

/** Active classroom generation jobs gauge. */
export const activeJobsGauge = new Gauge({
  name: 'nova_active_generation_jobs',
  help: 'Number of active classroom generation jobs',
  registers: [register],
});

/** Database query duration histogram. */
export const dbQueryDuration = new Histogram({
  name: 'nova_db_query_duration_seconds',
  help: 'Database query duration in seconds',
  labelNames: ['operation'] as const,
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register],
});

/** Rate-limited request counter. */
export const rateLimitedCounter = new Counter({
  name: 'nova_rate_limited_total',
  help: 'Requests that were rate-limited',
  labelNames: ['preset', 'identifier'] as const,
  registers: [register],
});

/** TTS generation counter. */
export const ttsGenerationCounter = new Counter({
  name: 'nova_tts_generations_total',
  help: 'Total TTS generations',
  labelNames: ['provider', 'status'] as const,
  registers: [register],
});

/** Media (image/video) generation counter. */
export const mediaGenerationCounter = new Counter({
  name: 'nova_media_generations_total',
  help: 'Total media (image/video) generations',
  labelNames: ['type', 'provider', 'status'] as const,
  registers: [register],
});

/** Current process memory gauge (supplements default metrics). */
export const processMemoryGauge = new Gauge({
  name: 'nova_process_memory_heap_used_bytes',
  help: 'Process heap memory used (bytes)',
  registers: [register],
  collect() {
    const mem = process.memoryUsage();
    this.set(mem.heapUsed);
  },
});

/** Active WebSocket connections (future use). */
export const activeConnectionsGauge = new Gauge({
  name: 'nova_active_connections',
  help: 'Active WebSocket/SSE connections',
  registers: [register],
});

// ── Helper to record HTTP metrics ─────────────────────────────────────────

/**
 * Record an HTTP request in Prometheus metrics.
 * Call from the edge proxy or route handlers.
 */
export function recordHttpRequest(
  method: string,
  route: string,
  status: number,
  durationMs: number,
) {
  const labels = { method, route, status: String(status) };
  httpRequestCounter.inc(labels);
  httpRequestDuration.observe(labels, durationMs / 1000);
}

/** Get the Prometheus-format metrics string. */
export async function getMetrics(): Promise<string> {
  return register.metrics();
}

/** Get the content type for the metrics response. */
export function getMetricsContentType(): string {
  return register.contentType;
}

/** Get the underlying registry (for testing). */
export function getRegistry(): Registry {
  return register;
}
