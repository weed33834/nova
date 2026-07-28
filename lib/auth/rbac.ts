/**
 * Role-Based Access Control (RBAC) helpers.
 *
 * Nova has two roles:
 *  - `user`: default; can create/manage their own classrooms, skills, and usage
 *  - `admin`: can manage all users, all classrooms, system settings, and audit logs
 *
 * Permission checks are centralized here so route handlers and server actions
 * call a single `can()` / `requirePermission()` instead of scattering role
 * comparisons across the codebase.
 */
import { getServerSession } from 'next-auth';
import { authOptions } from './config';
import type { Session } from 'next-auth';

export type Role = 'user' | 'admin';

export type Permission =
  | 'classroom:create'
  | 'classroom:read'
  | 'classroom:read:any' // read classrooms owned by others
  | 'classroom:update'
  | 'classroom:delete'
  | 'skill:create'
  | 'skill:read'
  | 'skill:update'
  | 'skill:delete'
  | 'usage:read'
  | 'usage:read:any'
  | 'user:read'
  | 'user:manage' // create/disable/delete users, change roles
  | 'audit:read'
  | 'apikey:manage'
  | 'settings:manage';

const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  user: [
    'classroom:create',
    'classroom:read',
    'classroom:update',
    'classroom:delete',
    'skill:create',
    'skill:read',
    'skill:update',
    'skill:delete',
    'usage:read',
    'apikey:manage',
  ],
  admin: [
    'classroom:create',
    'classroom:read',
    'classroom:read:any',
    'classroom:update',
    'classroom:delete',
    'skill:create',
    'skill:read',
    'skill:update',
    'skill:delete',
    'usage:read',
    'usage:read:any',
    'user:read',
    'user:manage',
    'audit:read',
    'apikey:manage',
    'settings:manage',
  ],
};

export function hasPermission(role: Role | undefined, permission: Permission): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

/**
 * Server-side: get the current session and check a permission.
 * Returns the session if allowed, or null if not authenticated/authorized.
 */
export async function authorize(permission: Permission): Promise<Session | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const role = (session.user as { role?: Role }).role ?? 'user';
  if (!hasPermission(role, permission)) return null;
  return session;
}

/**
 * Server-side: get the current session (any authenticated user).
 */
export async function requireAuth(): Promise<Session> {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    throw new AuthRequiredError();
  }
  return session;
}

/**
 * Server-side: require a specific permission. Throws if not authorized.
 */
export async function requirePermission(permission: Permission): Promise<Session> {
  const session = await requireAuth();
  const role = (session.user as { role?: Role }).role ?? 'user';
  if (!hasPermission(role, permission)) {
    throw new ForbiddenError(permission);
  }
  return session;
}

export class AuthRequiredError extends Error {
  constructor() {
    super('Authentication required');
    this.name = 'AuthRequiredError';
  }
}

export class ForbiddenError extends Error {
  readonly permission: Permission;
  constructor(permission: Permission) {
    super(`Forbidden: missing permission "${permission}"`);
    this.name = 'ForbiddenError';
    this.permission = permission;
  }
}
