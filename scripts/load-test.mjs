#!/usr/bin/env node
/**
 * Load testing script for Nova AI Classroom platform.
 *
 * Run with: node scripts/load-test.mjs [options]
 *
 * Tests:
 * 1. Health endpoint under sustained load
 * 2. Rate limiting behavior under burst traffic
 * 3. Concurrent generation request handling
 * 4. API response time percentiles
 *
 * Options (environment variables):
 *   BASE_URL     — target URL (default: http://localhost:3000)
 *   DURATION     — test duration in seconds (default: 30)
 *   CONCURRENCY  — concurrent connections (default: 10)
 *   ACCESS_CODE  — access code if protected (optional)
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DURATION_S = parseInt(process.env.DURATION || '30', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);
const ACCESS_CODE = process.env.ACCESS_CODE || '';

const url = new URL(BASE_URL);
const headers = {
  'Content-Type': 'application/json',
};
if (ACCESS_CODE) {
  headers['Cookie'] = `nova_access=${ACCESS_CODE}`;
}

import http from 'node:http';

// ── Stats ─────────────────────────────────────────────────────────────────

class Stats {
  constructor() {
    this.requests = 0;
    this.successes = 0;
    this.errors = 0;
    this.statusCodes = {};
    this.latencies = [];
  }

  record(status, latencyMs) {
    this.requests++;
    this.statusCodes[status] = (this.statusCodes[status] || 0) + 1;
    if (status >= 200 && status < 400) {
      this.successes++;
    } else {
      this.errors++;
    }
    this.latencies.push(latencyMs);
  }

  percentile(p) {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  report() {
    const avg = this.latencies.reduce((a, b) => a + b, 0) / Math.max(this.latencies.length, 1);
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Load Test Results');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`  Target:       ${BASE_URL}`);
    console.log(`  Duration:     ${DURATION_S}s`);
    console.log(`  Concurrency:  ${CONCURRENCY}`);
    console.log(`  Total reqs:   ${this.requests}`);
    console.log(`  Successes:    ${this.successes}`);
    console.log(`  Errors:       ${this.errors} (${((this.errors / Math.max(this.requests, 1)) * 100).toFixed(1)}%)`);
    console.log(`  RPS:          ${(this.requests / DURATION_S).toFixed(1)}`);
    console.log(`  Avg latency:  ${avg.toFixed(0)}ms`);
    console.log(`  p50:          ${this.percentile(50).toFixed(0)}ms`);
    console.log(`  p95:          ${this.percentile(95).toFixed(0)}ms`);
    console.log(`  p99:          ${this.percentile(99).toFixed(0)}ms`);
    console.log(`  Status codes: ${JSON.stringify(this.statusCodes)}`);
    console.log('═══════════════════════════════════════════════════════\n');

    // Exit with error if error rate > 5%
    const errorRate = this.errors / Math.max(this.requests, 1);
    if (errorRate > 0.05) {
      console.error(`FAIL: Error rate ${(errorRate * 100).toFixed(1)}% exceeds 5% threshold`);
      process.exit(1);
    }
    // Fail if p95 > 2s
    if (this.percentile(95) > 2000) {
      console.error(`FAIL: p95 latency ${this.percentile(95).toFixed(0)}ms exceeds 2000ms threshold`);
      process.exit(1);
    }
    console.log('PASS: All thresholds met');
  }
}

// ── HTTP client ───────────────────────────────────────────────────────────

function fetchWithTiming(path, method = 'GET', body = null) {
  return new Promise((resolve) => {
    const start = Date.now();
    const req = http.request(
      {
        hostname: url.hostname,
        port: url.port || 80,
        path,
        method,
        headers: {
          ...headers,
          ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        },
      },
      (res) => {
        res.resume();
        res.on('end', () => {
          resolve({ status: res.statusCode || 0, latency: Date.now() - start });
        });
      },
    );
    req.on('error', () => {
      resolve({ status: 0, latency: Date.now() - start });
    });
    if (body) req.write(body);
    req.end();
  });
}

// ── Test scenarios ────────────────────────────────────────────────────────

async function healthCheckStats(stats) {
  const { status, latency } = await fetchWithTiming('/api/health');
  stats.record(status, latency);
}

async function rateLimitTest(stats) {
  // Burst requests to test rate limiting
  const body = JSON.stringify({ requirement: 'Load test topic' });
  const { status, latency } = await fetchWithTiming('/api/generate-classroom', 'POST', body);
  stats.record(status, latency);
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Starting load test: ${CONCURRENCY} concurrent requests for ${DURATION_S}s`);
  console.log(`Target: ${BASE_URL}`);

  // Verify server is up
  const check = await fetchWithTiming('/api/health');
  if (check.status === 0) {
    console.error('Server is not reachable. Start it with `pnpm start` first.');
    process.exit(1);
  }
  console.log(`Server reachable (HTTP ${check.status})`);

  const stats = new Stats();
  const endTime = Date.now() + DURATION_S * 1000;
  let scenario = 0;

  async function worker() {
    while (Date.now() < endTime) {
      // Alternate between scenarios
      if (scenario % 3 === 0) {
        await healthCheckStats(stats);
      } else {
        await rateLimitTest(stats);
      }
      scenario++;
    }
  }

  // Launch concurrent workers
  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  stats.report();
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
