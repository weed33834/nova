import { NextRequest } from 'next/server';
import { getDb } from '@/lib/db/client';
import { apiKeys } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import { requirePermission } from '@/lib/auth/rbac';
import { apiError, apiSuccess } from '@/lib/server/api-response';
import { generateApiKey } from '@/lib/server/api-key-auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('ApiKeysRoute');

/** GET /api/api-keys — 列出当前用户的 API keys */
export async function GET() {
  try {
    const session = await requirePermission('apikey:manage');
    const userId = (session.user as { id: string }).id;
    const db = getDb();

    const keys = await db
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

    return apiSuccess({ keys });
  } catch (error) {
    log.error('Failed to list API keys:', error);
    return apiError('INTERNAL_ERROR', 500, 'Failed to list API keys');
  }
}

/** POST /api/api-keys — 创建新 API key（明文仅返回一次） */
export async function POST(req: NextRequest) {
  try {
    const session = await requirePermission('apikey:manage');
    const userId = (session.user as { id: string }).id;
    const db = getDb();

    const body = await req.json();
    const label = body.label as string;
    const scopes = body.scopes as string[] | undefined;
    const expiresAt = body.expiresAt as string | undefined;

    if (!label || label.length < 1 || label.length > 100) {
      return apiError('VALIDATION_ERROR', 400, 'Label is required (1-100 chars)');
    }

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
}
