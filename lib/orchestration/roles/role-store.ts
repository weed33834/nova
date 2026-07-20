/**
 * Role Definition Override Store
 *
 * Persists user edits to role definitions (displayName, description,
 * permissions, interactionPattern, priority) to localStorage so they
 * survive page refresh. The canonical `ROLE_DEFINITIONS` in types.ts
 * remains the source of truth for structural fields (constraints,
 * capabilities) that the runtime enforces — this store only tracks
 * display-level overrides.
 *
 * Usage:
 *   const { overrides, updateRole, resetRole, resetAll } = useRoleStore();
 *   const role = getEffectiveRole('teacher'); // merge of base + override
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ROLE_DEFINITIONS, type AgentRole, type RoleDefinition } from './types';

/**
 * Fields a user can override through the AgentRoleManager UI.
 * Structural fields (constraints, capabilities) are intentionally
 * excluded — they are enforced by the runtime and should not be
 * silently changed through the UI.
 */
export type RoleOverride = Pick<
  RoleDefinition,
  'displayName' | 'description' | 'permissions' | 'interactionPattern' | 'priority'
>;

interface RoleStoreState {
  /** Per-role overrides. Keys are AgentRole strings. */
  overrides: Record<string, RoleOverride>;
  /** Update a single role's override fields. */
  updateRole: (role: string, patch: Partial<RoleOverride>) => void;
  /** Reset a single role to its canonical definition. */
  resetRole: (role: string) => void;
  /** Reset all roles to canonical definitions. */
  resetAll: () => void;
}

export const useRoleStore = create<RoleStoreState>()(
  persist(
    (set) => ({
      overrides: {},
      updateRole: (role, patch) =>
        set((state) => ({
          overrides: {
            ...state.overrides,
            [role]: { ...state.overrides[role], ...patch },
          },
        })),
      resetRole: (role) =>
        set((state) => {
          const next = { ...state.overrides };
          delete next[role];
          return { overrides: next };
        }),
      resetAll: () => set({ overrides: {} }),
    }),
    {
      name: 'role-overrides-storage',
      version: 1,
    },
  ),
);

/**
 * Merge a canonical role definition with any persisted user override.
 * Falls back to the base definition when no override exists.
 */
export function getEffectiveRole(role: string): RoleDefinition | undefined {
  const base = ROLE_DEFINITIONS[role as AgentRole];
  if (!base) return undefined;
  const override = useRoleStore.getState().overrides[role];
  if (!override) return base;
  return { ...base, ...override };
}

/**
 * Get all effective role definitions (base + overrides), as an array.
 */
export function getEffectiveRoles(): RoleDefinition[] {
  return Object.keys(ROLE_DEFINITIONS).map((role) =>
    getEffectiveRole(role)!,
  );
}
