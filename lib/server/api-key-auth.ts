/**
 * API Key 认证中间件 — 支持编程式访问。
 *
 * 流程：
 * 1. 从 Authorization: Bearer <key> 头提取 API key
 * 2. SHA-256 哈希后查 api_keys 表
 * 3. 校验未过期/未撤销
 * 4. 返回关联的 user session（注入 role/userId）
 *
 * 路由 handler 可通过 `authenticateWithApiKey()` 替代 `requireAuth()`，
 * 同时兼容 session 认证和 API key 认证。
 */
import { createHash } from 'node:crypto';
import { getDb } from '@/lib/db/client';
import { apiKeys, users } from '@/lib/db/schema';
import { eq, and, isNull, gt, or } from 'drizzle-orm';
import type { Session } from 'next-auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('ApiKeyAuth');

const KEY_PREFIX = 'nva_'; // Nova API key prefix

/** 生成新的 API key（明文仅返回一次） */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  const secret = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const plaintext = `${KEY_PREFIX}${secret}`;
  const hash = hashKey(plaintext);
  return { plaintext, hash, prefix: plaintext.slice(0, 12) };
}

/** SHA-256 哈希 API key，与 api_keys.keyHash 列对齐 */
export function hashKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

export interface ApiKeyValidationResult {
  valid: boolean;
  session?: Session;
  keyId?: string;
  scopes?: string[];
  reason?: string;
}

/**
 * 从 Authorization 头验证 API key，返回关联的 user session。
 *
 * 可在路由 handler 中替代 requireAuth()：
 * ```ts
 * const result = await authenticateWithApiKey(req);
 * if (!result.valid) return apiError('UNAUTHORIZED', 401);
 * // 使用 result.session
 * ```
 */
export async function authenticateWithApiKey(
  authHeader: string | null,
): Promise<ApiKeyValidationResult> {
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, reason: 'missing or invalid Authorization header' };
  }

  const plaintext = authHeader.slice(7);
  if (!plaintext.startsWith(KEY_PREFIX)) {
    return { valid: false, reason: 'invalid key format' };
  }

  const keyHash = hashKey(plaintext);

  try {
    const db = getDb();
    const rows = await db
      .select({
        key: apiKeys,
        user: users,
      })
      .from(apiKeys)
      .innerJoin(users, eq(apiKeys.ownerId, users.id))
      .where(
        and(
          eq(apiKeys.keyHash, keyHash),
          isNull(apiKeys.revokedAt),
          // 过期检查：expiresAt 为 null 表示永不过期
          or(
            isNull(apiKeys.expiresAt),
            gt(apiKeys.expiresAt, new Date().toISOString()),
          ),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      return { valid: false, reason: 'key not found, revoked, or expired' };
    }

    const { key, user } = rows[0];

    // 更新 lastUsedAt（非阻塞）
    db.update(apiKeys)
      .set({ lastUsedAt: new Date().toISOString() })
      .where(eq(apiKeys.id, key.id))
      .execute()
      .catch((err: unknown) => log.warn('Failed to update key lastUsedAt', err));

    const scopes = JSON.parse(key.scopes || '[]') as string[];

    const session: Session = {
      user: {
        id: user.id,
        name: user.name ?? undefined,
        email: user.email,
        role: user.role as 'user' | 'admin',
      },
      expires: key.expiresAt || new Date(Date.now() + 86400000).toISOString(),
    } as Session;

    log.debug('API key authenticated', { keyId: key.id, userId: user.id });

    return { valid: true, session, keyId: key.id, scopes };
  } catch (err) {
    log.error('API key validation failed', err);
    return { valid: false, reason: 'internal error' };
  }
}

/**
 * 检查 API key 是否具有所需 scope。
 * 空 scopes 列表表示拥有所有权限（向后兼容）。
 */
export function hasScope(scopes: string[] | undefined, required: string): boolean {
  if (!scopes || scopes.length === 0) return true;
  return scopes.includes(required) || scopes.includes('*');
}
