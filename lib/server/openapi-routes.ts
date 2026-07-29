/**
 * Centralized OpenAPI route registrations.
 *
 * Imported by the docs route so all registrations happen in one place.
 * This avoids circular imports (route files importing the registry
 * while the registry imports route files).
 */
import { z } from 'zod';
import { registerRoute, errorResponseSchema, paginationSchema } from './openapi-registry';

// ── Auth ──────────────────────────────────────────────────────────────────

registerRoute({
  method: 'post',
  path: '/api/auth/signup',
  tag: 'Auth',
  summary: 'Create a new user account (email + password)',
  description: 'Creates a user with the `user` role. Rate-limited.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            email: z.string().email(),
            password: z.string().min(8).max(128),
            name: z.string().min(1).max(100).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'User created',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            id: z.string(),
            email: z.string(),
            role: z.string(),
          }),
        },
      },
    },
    409: { description: 'Email already taken' },
    429: { description: 'Rate limited' },
  },
});

// ── API Keys ──────────────────────────────────────────────────────────────

registerRoute({
  method: 'get',
  path: '/api/api-keys',
  tag: 'API Keys',
  summary: 'List current user API keys (paginated)',
  secured: true,
  responses: {
    200: {
      description: 'List of API keys',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            keys: z.array(
              z.object({
                id: z.string(),
                label: z.string(),
                keyPrefix: z.string(),
                scopes: z.string(),
                lastUsedAt: z.string().nullable(),
                expiresAt: z.string().nullable(),
                createdAt: z.string(),
                revokedAt: z.string().nullable(),
              }),
            ),
            pagination: paginationSchema,
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
    403: { description: 'Forbidden — missing apikey:manage permission' },
  },
});

registerRoute({
  method: 'post',
  path: '/api/api-keys',
  tag: 'API Keys',
  summary: 'Create a new API key (plaintext returned once)',
  secured: true,
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            label: z.string().min(1).max(100),
            scopes: z.array(z.string()).optional(),
            expiresAt: z.string().datetime().optional().nullable(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'API key created',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            key: z.string(),
            label: z.string(),
            prefix: z.string(),
            scopes: z.array(z.string()),
            expiresAt: z.string().nullable(),
          }),
        },
      },
    },
    401: { description: 'Unauthorized' },
  },
});

registerRoute({
  method: 'delete',
  path: '/api/api-keys/{id}',
  tag: 'API Keys',
  summary: 'Revoke an API key',
  secured: true,
  request: {
    params: { id: z.string() },
  },
  responses: {
    200: {
      description: 'Key revoked',
      content: {
        'application/json': { schema: z.object({ success: z.literal(true), revoked: z.boolean() }) },
      },
    },
    404: { description: 'Key not found' },
  },
});

// ── Classroom ─────────────────────────────────────────────────────────────

registerRoute({
  method: 'post',
  path: '/api/classroom',
  tag: 'Classroom',
  summary: 'Persist a classroom (stage + scenes) to storage',
  description: 'Creates or updates a classroom JSON file. Anonymous if no auth.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            stage: z.object({ id: z.string().optional() }).passthrough(),
            scenes: z.array(z.object({}).passthrough()),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Classroom persisted',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), id: z.string(), url: z.string() }),
        },
      },
    },
    400: { description: 'Invalid request body' },
  },
});

registerRoute({
  method: 'get',
  path: '/api/classroom',
  tag: 'Classroom',
  summary: 'Retrieve a classroom by ID',
  responses: {
    200: {
      description: 'Classroom data',
      content: {
        'application/json': {
          schema: z.object({ success: z.literal(true), classroom: z.unknown() }),
        },
      },
    },
    404: { description: 'Classroom not found' },
  },
});

// ── Health ────────────────────────────────────────────────────────────────

registerRoute({
  method: 'get',
  path: '/api/health',
  tag: 'Health',
  summary: 'Liveness + readiness probe (enterprise health check)',
  responses: {
    200: {
      description: 'Service healthy',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            status: z.string(),
            uptime: z.number(),
            timestamp: z.string(),
            services: z.record(z.string(), z.object({ status: z.string(), latencyMs: z.number().optional() })),
          }),
        },
      },
    },
    503: { description: 'Service unhealthy' },
  },
});

registerRoute({
  method: 'get',
  path: '/api/health/live',
  tag: 'Health',
  summary: 'Liveness probe (process alive)',
  responses: { 200: { description: 'Alive' } },
});

registerRoute({
  method: 'get',
  path: '/api/health/ready',
  tag: 'Health',
  summary: 'Readiness probe (dependencies ready)',
  responses: {
    200: { description: 'Ready' },
    503: { description: 'Not ready' },
  },
});

// ── Quota ─────────────────────────────────────────────────────────────────

registerRoute({
  method: 'get',
  path: '/api/quota',
  tag: 'Quota',
  summary: 'Get current user quota usage',
  secured: true,
  responses: {
    200: {
      description: 'Quota info',
      content: { 'application/json': { schema: z.object({ success: z.literal(true) }).passthrough() } },
    },
    401: { description: 'Unauthorized' },
  },
});

// ── Metrics ───────────────────────────────────────────────────────────────

registerRoute({
  method: 'get',
  path: '/api/metrics',
  tag: 'Metrics',
  summary: 'Prometheus metrics endpoint',
  description: 'Exposes Prometheus-format metrics for scraping. Protected by ACCESS_CODE or metrics token.',
  responses: {
    200: { description: 'Prometheus metrics' },
    403: { description: 'Forbidden' },
  },
});

// ── Learning Events ───────────────────────────────────────────────────────

registerRoute({
  method: 'post',
  path: '/api/learning-events',
  tag: 'Learning Analytics',
  summary: 'Record a learning event (xAPI-inspired)',
  description: 'Records user learning behavior for analytics dashboards. Anonymous events are allowed.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({
            classroomId: z.string().optional(),
            sceneId: z.string().optional(),
            sessionId: z.string().optional(),
            verb: z.string(),
            objectType: z.string().optional(),
            objectId: z.string().optional(),
            result: z.object({
              score: z.number().optional(),
              success: z.boolean().optional(),
              completion: z.boolean().optional(),
              duration: z.number().optional(),
            }).optional(),
            durationMs: z.number().optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: {
      description: 'Event recorded',
      content: {
        'application/json': { schema: z.object({ success: z.literal(true), recorded: z.boolean() }) },
      },
    },
  },
});

registerRoute({
  method: 'get',
  path: '/api/learning-events',
  tag: 'Learning Analytics',
  summary: 'Get classroom learning statistics',
  responses: {
    200: {
      description: 'Learning stats',
      content: {
        'application/json': {
          schema: z.object({
            success: z.literal(true),
            stats: z.object({
              totalViews: z.number(),
              uniqueViewers: z.number(),
              completions: z.number(),
              quizAnswers: z.number(),
              averageScore: z.number().nullable(),
            }),
          }),
        },
      },
    },
  },
});

// ── Docs ──────────────────────────────────────────────────────────────────

registerRoute({
  method: 'get',
  path: '/api/docs',
  tag: 'Docs',
  summary: 'OpenAPI 3.1 JSON specification',
  responses: {
    200: { description: 'OpenAPI JSON document' },
  },
});

// Ensure error response schema is referenced
void errorResponseSchema;
