/**
 * Ambient type declarations for optional Upstash rate-limiting dependencies.
 *
 * These packages (@upstash/ratelimit, @upstash/redis) are optional — only
 * needed when UPSTASH_REDIS_REST_URL is set for distributed rate limiting.
 * They are not installed by default, so TypeScript needs these minimal
 * declarations to compile the dynamic import in lib/server/rate-limit.ts.
 *
 * When the packages ARE installed, their real type declarations take
 * precedence over these ambient stubs.
 */

declare module '@upstash/ratelimit' {
  export class Ratelimit {
    constructor(opts: {
      redis: unknown;
      limiter: unknown;
      analytics?: boolean;
    });
    static slidingWindow(limit: number, window: string): unknown;
    limit(
      key: string,
    ): Promise<{ success: boolean; remaining: number; reset: number }>;
  }
}

declare module '@upstash/redis' {
  export class Redis {
    constructor(opts: { url: string; token: string });
  }
}
