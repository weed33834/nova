/**
 * OpenAPI / Swagger registry.
 *
 * Uses `@asteasolutions/zod-to-openapi` to convert existing Zod schemas into
 * an OpenAPI 3.1 document. Route definitions are registered here and served
 * at `/api/docs` (JSON) and `/api/docs-ui` (Scalar UI).
 *
 * Schemas are registered lazily — only routes that explicitly call
 * `registerRoute()` appear in the spec, so we can roll out documentation
 * incrementally without needing to cover all 50+ endpoints at once.
 */
import { z } from 'zod';
import {
  OpenAPIRegistry,
  OpenApiGeneratorV31,
  extendZodWithOpenApi,
} from '@asteasolutions/zod-to-openapi';

// Extend Zod with `.openapi()` metadata support (idempotent — safe to call
// even if the extension was already applied).
extendZodWithOpenApi(z);

export const registry = new OpenAPIRegistry();

// ── Common schemas ────────────────────────────────────────────────────────

export const errorResponseSchema = z
  .object({
    success: z.literal(false),
    errorCode: z.string(),
    error: z.string(),
    details: z.string().optional(),
    context: z.string().optional(),
  })
  .openapi('ErrorResponse');

export const paginationSchema = z
  .object({
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1).max(100),
    total: z.number().int(),
    totalPages: z.number().int(),
    hasMore: z.boolean(),
  })
  .openapi('Pagination');

// ── Security schemes ──────────────────────────────────────────────────────

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description: 'NextAuth session JWT or API key (`Bearer nva_...`)',
});

export interface RouteDef {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  tag: string;
  summary: string;
  description?: string;
  request?: {
    params?: Record<string, z.ZodType>;
    query?: z.ZodType;
    body?: { content: { 'application/json': { schema: z.ZodType } } };
  };
  responses: Record<
    number,
    {
      description: string;
      content?: {
        'application/json': { schema: z.ZodType };
        'text/plain'?: { schema: z.ZodType };
      };
    }
  >;
  secured?: boolean;
}

/** Register an API route. Call this at module scope in route files. */
export function registerRoute(def: RouteDef) {
  const responses: Record<string, unknown> = {};
  for (const [code, resp] of Object.entries(def.responses)) {
    if (resp.content) {
      const content: Record<string, unknown> = {};
      for (const [mediaType, mediaDef] of Object.entries(resp.content)) {
        content[mediaType] = { schema: mediaDef.schema };
      }
      responses[code] = { description: resp.description, content };
    } else {
      responses[code] = { description: resp.description };
    }
  }

  const operation: Record<string, unknown> = {
    tags: [def.tag],
    summary: def.summary,
    description: def.description,
    responses,
  };

  if (def.request?.params) {
    operation.parameters = Object.entries(def.request.params).map(([name, schema]) => ({
      name,
      in: 'path',
      required: true,
      schema,
    }));
  }

  if (def.request?.body) {
    operation.requestBody = {
      content: def.request.body.content,
    };
  }

  if (def.secured) {
    operation.security = [{ bearerAuth: [] }];
  }

  const pathItem: Record<string, unknown> = {};
  pathItem[def.method] = operation;
  registry.registerPath({ path: def.path, ...pathItem } as never);
}

/** Generate the final OpenAPI 3.1 document. */
export function getOpenApiDocument() {
  const generator = new OpenApiGeneratorV31(registry.definitions);
  return generator.generateDocument({
    openapi: '3.1.0',
    info: {
      title: 'Nova API',
      version: '1.0.0',
      description:
        'AI-powered interactive classroom platform API. ' +
        'Authentication via NextAuth session JWT or API key (`nva_...`).',
      license: { name: 'MIT', url: 'https://opensource.org/licenses/MIT' },
    },
    servers: [
      { url: '/api', description: 'Relative to deployment origin' },
    ],
  });
}
