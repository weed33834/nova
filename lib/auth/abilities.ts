/**
 * CASL (Code Access Security Layer) ability definitions.
 *
 * Replaces the hard-coded `ROLE_PERMISSIONS` map in `rbac.ts` with a
 * fine-grained, composable permission system that supports:
 *  - Resource-level checks (can I read classroom X?)
 *  - Field-level checks (can I see the ownerId field?)
 *  - Condition-based checks (can I update MY classroom but not others'?)
 *
 * CASL is isomorphic — the same ability definitions work on both server
 * and client. The `AppAbility` type is shared for type-safe `can()` calls.
 *
 * @see https://casl.js.org/
 */
import {
  AbilityBuilder,
  createMongoAbility,
  type MongoAbility,
} from '@casl/ability';
import type { Role } from './rbac';

// ── Subject definitions ───────────────────────────────────────────────────

export type Subject =
  | 'Classroom'
  | 'Scene'
  | 'Skill'
  | 'ApiKey'
  | 'User'
  | 'AuditLog'
  | 'Usage'
  | 'Settings'
  | 'Prompt'
  | 'Webhook'
  | 'Quota'
  | 'all';

export type Action = 'manage' | 'create' | 'read' | 'update' | 'delete';

// CASL's MongoAbility without generic parameters accepts any subject/action.
// This avoids the need for class-based subjects while still providing
// runtime condition matching (ownerId, isPublic, etc.).
export type AppAbility = MongoAbility;

// ── Resource shape for ownership checks ────────────────────────────────────

export interface OwnershipContext {
  /** The user ID of the resource owner. */
  ownerId?: string | null;
  /** Whether the resource is public/shared. */
  isPublic?: boolean;
}

// ── Ability factory ────────────────────────────────────────────────────────

// Use `any` for the builder to bypass CASL's strict generic typing.
// The runtime behavior is identical — conditions are matched via MongoDB
// query semantics regardless of TypeScript types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyBuilder = AbilityBuilder<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAbility = any;

/**
 * Build an ability instance for a given user role and ID.
 *
 * Usage:
 * ```ts
 * const ability = buildAbilityFor('admin', userId);
 * if (ability.can('read', 'Classroom')) { ... }
 * if (ability.can('update', { subject: 'Classroom', ownerId: otherUserId })) { ... }
 * ```
 */
export function buildAbilityFor(role: Role | undefined, userId?: string): AppAbility {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { can, cannot, build } = new AbilityBuilder<any>(createMongoAbility) as AnyBuilder;

  switch (role) {
    case 'admin':
      // Admins can manage everything
      can('manage', 'all');
      break;

    case 'user':
      // Classrooms: users can CRUD their own, read public ones
      can('create', 'Classroom');
      can('read', 'Classroom');
      can('update', 'Classroom', { ownerId: userId });
      can('delete', 'Classroom', { ownerId: userId });

      // Skills: users can CRUD their own
      can('create', 'Skill');
      can('read', 'Skill');
      can('update', 'Skill', { ownerId: userId });
      can('delete', 'Skill', { ownerId: userId });

      // API Keys: users can manage their own
      can('manage', 'ApiKey', { ownerId: userId });

      // Usage: users can read their own
      can('read', 'Usage', { ownerId: userId });

      // Quota: users can read their own
      can('read', 'Quota', { ownerId: userId });

      // Prompts: users can read all, manage their own
      can('read', 'Prompt');
      can('create', 'Prompt');
      can('update', 'Prompt', { ownerId: userId });
      can('delete', 'Prompt', { ownerId: userId });

      // Cannot read other users' data
      cannot('read', 'User');
      cannot('read', 'AuditLog');
      cannot('manage', 'Settings');
      break;

    default:
      // Anonymous: can only read public classrooms
      can('read', 'Classroom', { isPublic: true });
      break;
  }

  return build() as AnyAbility as AppAbility;
}

// ── Helper: check ownership ────────────────────────────────────────────────

/**
 * Check if a user can perform an action on a specific resource instance.
 *
 * Usage:
 * ```ts
 * const ability = buildAbilityFor(user.role, user.id);
 * if (canAccess(ability, 'update', 'Classroom', { ownerId: classroom.ownerId })) {
 *   // allow
 * }
 * ```
 */
export function canAccess(
  ability: AppAbility,
  action: Action,
  subject: Subject,
  context?: OwnershipContext,
): boolean {
  if (!context) {
    return ability.can(action, subject);
  }
  return ability.can(action, { subject, ...context });
}

// ── Helper: get subjects for a role ────────────────────────────────────────

/**
 * Get all subjects a role can access (for UI rendering / navigation filtering).
 */
export function getAccessibleSubjects(role: Role | undefined): Subject[] {
  const ability = buildAbilityFor(role);
  const allSubjects: Subject[] = [
    'Classroom',
    'Scene',
    'Skill',
    'ApiKey',
    'User',
    'AuditLog',
    'Usage',
    'Settings',
    'Prompt',
    'Webhook',
    'Quota',
  ];
  return allSubjects.filter((s) => ability.can('read', s));
}

// ── Migration bridge: map old Permission strings to CASL ───────────────────

/**
 * Bridge function: check an old-style permission string using CASL.
 * This lets existing route handlers that call `requirePermission('classroom:read')`
 * continue working while we migrate to CASL.
 */
export function checkPermissionViaCasl(
  role: Role | undefined,
  userId: string | undefined,
  permission: string,
): boolean {
  const ability = buildAbilityFor(role, userId);

  const [resource, action] = permission.split(':') as [string, string];
  const subjectMap: Record<string, Subject> = {
    classroom: 'Classroom',
    skill: 'Skill',
    apikey: 'ApiKey',
    usage: 'Usage',
    user: 'User',
    audit: 'AuditLog',
    settings: 'Settings',
  };

  const subject = subjectMap[resource];
  if (!subject) return false;

  // Special cases for ':any' suffix (admin-level access)
  if (permission.endsWith(':any')) {
    return ability.can('read' as Action, subject) && role === 'admin';
  }

  // Map 'manage' to CASL 'manage'
  if (action === 'manage') {
    return ability.can('manage', subject);
  }

  return ability.can(action as Action, subject);
}
