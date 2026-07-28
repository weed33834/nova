/**
 * Auth layer barrel.
 *
 * Re-exports NextAuth config, RBAC helpers, and password utilities so the rest
 * of the app imports from `@/lib/auth`.
 */
export { authOptions, createUserWithCredentials, findUserByOAuthAccount } from './config';
export {
  hasPermission,
  authorize,
  requireAuth,
  requirePermission,
  AuthRequiredError,
  ForbiddenError,
  type Role,
  type Permission,
} from './rbac';
export { hashPassword, verifyPassword } from './password';
