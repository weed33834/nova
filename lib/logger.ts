/**
 * Structured logging powered by pino.
 *
 * Replaces the previous hand-rolled logger with a production-grade solution
 * that supports:
 *  - Structured JSON output (machine-parseable for log aggregators)
 *  - Pretty-printed output in development (via pino-pretty)
 *  - Per-module tag namespacing via child loggers
 *  - Request ID correlation via AsyncLocalStorage (see `runWithRequestId`)
 *  - Log level configuration via LOG_LEVEL env var
 *  - Zero breaking changes to the existing `createLogger(tag)` API
 *
 * In production (NODE_ENV=production), logs are emitted as newline-delimited
 * JSON. In development, pino-pretty provides colorized, readable output.
 */
import pino from 'pino';
import { AsyncLocalStorage } from 'async_hooks';

// ── Request ID correlation ─────────────────────────────────────────────────

const requestIdStorage = new AsyncLocalStorage<string>();

/**
 * Run a callback within a request context so all log lines emitted inside it
 * automatically include the `requestId` field. Used by the API middleware
 * to correlate logs across a single request lifecycle.
 *
 * Usage:
 * ```ts
 * await runWithRequestId(crypto.randomUUID(), async () => {
 *   log.info('Processing request'); // → { requestId: '...', msg: 'Processing request' }
 * });
 * ```
 */
export function runWithRequestId<T>(id: string, fn: () => T): T {
  return requestIdStorage.run(id, fn);
}

/**
 * Get the current request ID from the async context, if any.
 */
export function getRequestId(): string | undefined {
  return requestIdStorage.getStore();
}

// ── pino instance configuration ────────────────────────────────────────────

function createPinoInstance(): pino.Logger {
  const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'production' ? 'info' : 'debug');
  const isDev = process.env.NODE_ENV !== 'production' && process.env.LOG_FORMAT !== 'json';

  const baseConfig: pino.LoggerOptions = {
    level,
    // Base fields added to every log line
    base: {
      service: 'nova',
      version: process.env.npm_package_version ?? '0.0.0',
    },
    // Timestamp as ISO string for readability
    timestamp: pino.stdTimeFunctions.isoTime,
    // Custom log serializer for Error objects
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
    },
    // Redact sensitive fields from logs
    redact: {
      paths: [
        'req.headers.authorization',
        'req.headers.cookie',
        'req.headers["x-api-key"]',
        '*.apiKey',
        '*.api_key',
        '*.password',
        '*.passwordHash',
        '*.token',
        '*.accessToken',
        '*.refreshToken',
        '*.secret',
        '*.key_hash',
      ],
      censor: '[REDACTED]',
    },
  };

  if (isDev) {
    // Pretty-printed output for development
    return pino(baseConfig, pino.transport({
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss.l',
        ignore: 'pid,hostname,service,version',
        messageFormat: '{tag} | {msg}',
        singleLine: false,
      },
    }));
  }

  return pino(baseConfig);
}

const rootLogger = createPinoInstance();

// ── Public API (backward-compatible) ───────────────────────────────────────

export interface Logger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  /** Create a child logger with additional bound context. */
  child: (bindings: Record<string, unknown>) => Logger;
  /** Get the underlying pino instance for advanced use cases. */
  raw: () => pino.Logger;
}

/**
 * Convert variadic args into pino's log payload.
 *
 * The existing API passes `...args: unknown[]` where args can be:
 *  - Strings (concatenated as the message)
 *  - Error objects (serialized as `err`)
 *  - Plain objects (merged as context)
 *  - Anything else (stringified into the message)
 */
function argsToPayload(args: unknown[]): { msg: string; data: Record<string, unknown> } {
  const msgParts: string[] = [];
  const data: Record<string, unknown> = {};

  for (const arg of args) {
    if (arg === undefined || arg === null) continue;

    if (arg instanceof Error) {
      data.err = arg;
      msgParts.push(arg.message);
    } else if (typeof arg === 'string') {
      msgParts.push(arg);
    } else if (typeof arg === 'object' && !Array.isArray(arg)) {
      Object.assign(data, arg);
    } else {
      msgParts.push(String(arg));
    }
  }

  return { msg: msgParts.join(' ') || '(empty)', data };
}

/**
 * Create a logger with a module tag.
 *
 * @example
 * const log = createLogger('SceneGenerator');
 * log.info('Generating scene', { sceneId: 'abc123', type: 'slide' });
 * // → { tag: 'SceneGenerator', sceneId: 'abc123', type: 'slide', msg: 'Generating scene', ... }
 *
 * @example
 * log.error('Failed to generate', new Error('API timeout'));
 * // → { tag: 'SceneGenerator', err: { message: 'API timeout', stack: '...' }, msg: 'Failed to generate API timeout', ... }
 */
export function createLogger(tag: string): Logger {
  const childLogger = rootLogger.child({ tag });

  const wrap = (level: 'debug' | 'info' | 'warn' | 'error') =>
    (...args: unknown[]) => {
      const { msg, data } = argsToPayload(args);

      // Inject request ID from async context if available
      const requestId = getRequestId();
      const payload = requestId ? { requestId, ...data } : data;

      childLogger[level](payload, msg);
    };

  return {
    debug: wrap('debug'),
    info: wrap('info'),
    warn: wrap('warn'),
    error: wrap('error'),
    child: (bindings: Record<string, unknown>) => {
      const grandchild = childLogger.child(bindings);
      const wrapChild = (level: 'debug' | 'info' | 'warn' | 'error') =>
        (...args: unknown[]) => {
          const { msg, data } = argsToPayload(args);
          const requestId = getRequestId();
          const payload = requestId ? { requestId, ...data } : data;
          grandchild[level](payload, msg);
        };

      return {
        debug: wrapChild('debug'),
        info: wrapChild('info'),
        warn: wrapChild('warn'),
        error: wrapChild('error'),
        child: (b: Record<string, unknown>) => createLogger(tag).child(b),
        raw: () => grandchild,
      };
    },
    raw: () => childLogger,
  };
}

/**
 * Get the root pino logger for framework-level use (e.g., pino-http).
 */
export function getRootLogger(): pino.Logger {
  return rootLogger;
}
