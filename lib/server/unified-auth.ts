/**
 * 统一认证助手 — 路由 handler 入口同时兼容 session 和 API key。
 *
 * 优先级：Authorization: Bearer header → NextAuth session
 *
 * 用法：
 * ```ts
 * const auth = await authenticateRequest(request, 'classroom:read');
 * if (!auth.ok) return auth.error;
 * // auth.session 可用
 * ```
 */
import { headers } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth/config';
import { authenticateWithApiKey } from './api-key-auth';
import { hasPermission, type Permission, type Role } from '@/lib/auth/rbac';
import type { Session } from 'next-auth';
import { NextResponse } from 'next/server';

export interface AuthResult {
  ok: boolean;
  session?: Session;
  viaApiKey?: boolean;
  error?: NextResponse;
}

/**
 * 统一认证入口：先检查 API key，再回退到 session。
 * 如果指定了 permission，同时执行权限检查。
 */
export async function authenticateRequest(
  request: Request,
  permission?: Permission,
): Promise<AuthResult> {
  const hdrs = await headers();
  const authHeader = hdrs.get('authorization');

  // 尝试 API key 认证
  if (authHeader?.startsWith('Bearer ')) {
    const result = await authenticateWithApiKey(authHeader);
    if (result.valid && result.session) {
      if (permission) {
        const role = (result.session.user as { role?: Role }).role ?? 'user';
        if (!hasPermission(role, permission)) {
          return {
            ok: false,
            error: NextResponse.json(
              { success: false, errorCode: 'FORBIDDEN', error: 'Insufficient permissions' },
              { status: 403 },
            ),
          };
        }
      }
      return { ok: true, session: result.session, viaApiKey: true };
    }
    // API key 无效时返回 401（不回退到 session，因为带了 Authorization 头说明是 API 调用）
    return {
      ok: false,
      error: NextResponse.json(
        { success: false, errorCode: 'UNAUTHORIZED', error: result.reason || 'Invalid API key' },
        { status: 401 },
      ),
    };
  }

  // 回退到 NextAuth session
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return {
      ok: false,
      error: NextResponse.json(
        { success: false, errorCode: 'UNAUTHORIZED', error: 'Authentication required' },
        { status: 401 },
      ),
    };
  }

  if (permission) {
    const role = (session.user as { role?: Role }).role ?? 'user';
    if (!hasPermission(role, permission)) {
      return {
        ok: false,
        error: NextResponse.json(
          { success: false, errorCode: 'FORBIDDEN', error: 'Insufficient permissions' },
          { status: 403 },
        ),
      };
    }
  }

  return { ok: true, session };
}
