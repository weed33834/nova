import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getDb } from '@/lib/db/client';
import { apiKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/rbac';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { generateApiKey } from '@/lib/server/api-key-auth';
import { validateBody } from '@/lib/server/validate';
import { recordAuditLog } from '@/lib/db/audit';
import { extractPagination, paginateArray } from '@/lib/server/pagination';
import { withApiHandler } from '@/lib/server/api-handler';
import { createLogger } from '@/lib/logger';

const log = createLogger('ApiKeysRoute');

// Zod schema for API key creation
const createApiKeySchema = z.object({
  label: z.string().min(1).max(100),
  scopes: z.array(z.string()).optional(),
  expiresAt: z.string().datetime().optional().nullable(),
});

/** GET /api/api-keys — 列出当前用户的 API keys（支持分页） */
export const GET = withApiHandler(async (req: NextRequest) => {
  try {
    const session = await requirePermission('apikey:manage');
    const userId = (session.user as { id: string }).id;
    const db = getDb();

    const allKeys = await db
      .select({
        id: apiKeys.id,
        label: apiKeys.label,
        keyPrefix: apiKeys.keyPrefix,
        scopes: apiKeys.scopes,
        lastUsedAt: apiKeys.lastUsedAt,
        expiresAt: apiKeys.expiresAt,
        createdAt: apiKeys.createdAt,
        revokedAt: apiKeys.revokedAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.ownerId, userId));

    // Apply pagination
    const params = extractPagination(req);
    const { items, pagination } = paginateArray(allKeys, params);

    return apiSuccess({ keys: items, pagination });
  } catch (error) {
    log.error('Failed to list API keys:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to list API keys');
  }
});

/** POST /api/api-keys — 创建新 API key（明文仅返回一次） */
export const POST = withApiHandler(async (req: NextRequest) => {
  try {
    const session = await requirePermission('apikey:manage');
    const userId = (session.user as { id: string }).id;
    const db = getDb();

    const body = await req.json();
    const validation = validateBody(createApiKeySchema, body);
    if (!validation.ok) return validation.response;

    const { label, scopes, expiresAt } = validation.data;

    const { plaintext, hash, prefix } = generateApiKey();

    await db.insert(apiKeys).values({
      ownerId: userId,
      label,
      keyHash: hash,
      keyPrefix: prefix,
      scopes: JSON.stringify(scopes || []),
      expiresAt: expiresAt || null,
    });

    log.info('API key created', { userId, label });

    // Audit log
    recordAuditLog({
      actorId: userId,
      actorRole: (session.user as { role?: string }).role,
      action: 'apikey.create',
      entityType: 'api_key',
      entityId: prefix,
      details: { label, scopes: scopes || [], expiresAt: expiresAt || null },
    });

    return apiSuccess({
      key: plaintext,
      label,
      prefix,
      scopes: scopes || [],
      expiresAt: expiresAt || null,
    }, 201);
  } catch (error) {
    log.error('Failed to create API key:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to create API key');
  }
}, { rateLimit: 'auth' });
