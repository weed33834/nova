/**
 * Circuit Breaker — protects external API calls from cascading failures.
 *
 * Uses `opossum` (Netflix Hystrix pattern for Node.js) to wrap external
 * service calls with automatic failure detection, circuit opening, and
 * fallback responses.
 *
 * When the circuit is open, requests fail fast instead of timing out,
 * preventing resource exhaustion under upstream outages.
 *
 * @see https://github.com/nodeshift/opossum
 */
import CircuitBreaker from 'opossum';
import { createLogger } from '@/lib/logger';

const log = createLogger('CircuitBreaker');

// ── Pre-configured breaker factories ───────────────────────────────────────

interface BreakerOptions {
  timeout?: number; // ms before a call is considered failed
  errorThresholdPercentage?: number; // % of failures to open the circuit
  resetTimeout?: number; // ms before trying again after opening
  volumeThreshold?: number; // minimum calls before evaluating
}

const DEFAULT_OPTIONS: BreakerOptions = {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 10000,
  volumeThreshold: 10,
};

/**
 * Wrap an async function with a circuit breaker.
 *
 * Usage:
 * ```ts
 * const breaker = createBreaker('openai-chat', async (prompt: string) => {
 *   return await callLLM({ prompt });
 * });
 * const result = await breaker.fire(prompt);
 * ```
 */
export function createBreaker<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>,
  options?: BreakerOptions,
): CircuitBreaker<TArgs, TResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const breaker = new CircuitBreaker(fn, {
    name,
    timeout: opts.timeout,
    errorThresholdPercentage: opts.errorThresholdPercentage,
    resetTimeout: opts.resetTimeout,
    volumeThreshold: opts.volumeThreshold,
    enabled: true,
    allowWarmUp: true,
  });

  breaker.on('open', () => {
    log.warn(`Circuit opened: ${name}`);
  });

  breaker.on('close', () => {
    log.info(`Circuit closed (recovered): ${name}`);
  });

  breaker.on('halfOpen', () => {
    log.info(`Circuit half-open (testing): ${name}`);
  });

  breaker.on('fallback', () => {
    log.warn(`Circuit fallback triggered: ${name}`);
  });

  breaker.on('timeout', () => {
    log.warn(`Circuit timeout: ${name}`);
  });

  breaker.on('failure', (err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    log.warn(`Circuit failure [${name}]:`, msg);
  });

  return breaker;
}

/**
 * Execute a function with circuit breaker protection.
 * Creates a transient breaker — use `createBreaker` for a persistent one.
 *
 * Usage:
 * ```ts
 * const result = await withCircuitBreaker('fetch-model', async () => {
 *   return await fetch('https://api.example.com/models');
 * });
 * ```
 */
export async function withCircuitBreaker<T>(
  name: string,
  fn: () => Promise<T>,
  options?: BreakerOptions,
): Promise<T> {
  const breaker = createBreaker(name, fn, options);
  return breaker.fire();
}

// ── Breaker registry (for metrics/monitoring) ─────────────────────────────

const breakers = new Map<string, CircuitBreaker>();

/**
 * Get an existing registered breaker by name, or undefined if not registered.
 */
export function getBreaker(name: string): CircuitBreaker | undefined {
  return breakers.get(name);
}

/**
 * Get or create a persistent breaker for a named service.
 *
 * The breaker wraps a generic executor: callers pass their function as the
 * argument to `.fire()`. This allows a single breaker instance to protect
 * many different calls to the same external service (e.g. all OpenAI API
 * calls share one 'llm:openai' breaker).
 *
 * Usage:
 * ```ts
 * const breaker = getOrCreateBreaker('llm:openai', {
 *   timeout: 30000,
 *   errorThresholdPercentage: 50,
 * });
 * const result = await breaker.fire(async () => {
 *   return await generateText({ model: openai('gpt-4'), prompt: '...' });
 * });
 * ```
 */
export function getOrCreateBreaker(
  name: string,
  options?: BreakerOptions,
): CircuitBreaker<[() => Promise<unknown>], unknown> {
  let breaker = breakers.get(name) as CircuitBreaker<[() => Promise<unknown>], unknown> | undefined;
  if (!breaker) {
    breaker = createBreaker(name, async (fn: () => Promise<unknown>) => fn(), options);
    breakers.set(name, breaker as unknown as CircuitBreaker);
  }
  return breaker;
}

/**
 * Get the status of all registered breakers.
 * Useful for health checks and metrics.
 */
export function getBreakerStatuses(): Record<string, {
  name: string;
  state: string;
  closed: boolean;
  opened: boolean;
  halfOpen: boolean;
  stats: Record<string, unknown>;
}> {
  const statuses: Record<string, {
    name: string;
    state: string;
    closed: boolean;
    opened: boolean;
    halfOpen: boolean;
    stats: Record<string, unknown>;
  }> = {};

  for (const [name, breaker] of breakers) {
    const stats = breaker.stats;
    statuses[name] = {
      name,
      state: breaker.closed ? 'closed' : breaker.opened ? 'open' : 'half-open',
      closed: breaker.closed,
      opened: breaker.opened,
      halfOpen: breaker.halfOpen,
      stats: {
        fires: stats.fires,
        successes: stats.successes,
        failures: stats.failures,
        fallbacks: stats.fallbacks,
        rejects: stats.rejects,
        timeouts: stats.timeouts,
        cacheHits: stats.cacheHits,
        cacheMisses: stats.cacheMisses,
        failureRate: `${((stats.failures / Math.max(stats.fires, 1)) * 100).toFixed(1)}%`,
      },
    };
  }

  return statuses;
}
