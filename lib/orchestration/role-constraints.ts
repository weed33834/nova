/**
 * Role constraint runtime enforcement.
 *
 * `RoleConstraint` is defined on each `RoleDefinition` in `roles/types.ts`
 * but was previously never read at runtime. This module bridges that gap by
 * providing lookup helpers that the director-graph and agent generation node
 * use to enforce constraints at their natural enforcement points:
 *
 * - `max_turns`   → director node: skip agents who have exhausted their turns
 * - `max_actions`  → agent generate node: cap actions emitted per agent turn
 *
 * All helpers are total (never throw) and return `undefined` when a constraint
 * is absent or the role is unrecognized, so callers can treat "no constraint"
 * as "unlimited".
 */
import { ROLE_DEFINITIONS, type AgentRole } from './roles/types';

/**
 * Safely narrow a `string` role to `AgentRole`.
 * Returns `undefined` if the role is not in the canonical `ROLE_DEFINITIONS`.
 */
function asAgentRole(role: string): AgentRole | undefined {
  if (role in ROLE_DEFINITIONS) {
    return role as AgentRole;
  }
  return undefined;
}

/**
 * Get the `max_actions` constraint for a role.
 * @returns the max actions per turn, or `undefined` if unconstrained.
 */
export function getMaxActions(role: string): number | undefined {
  const r = asAgentRole(role);
  if (!r) return undefined;
  const constraints = ROLE_DEFINITIONS[r].constraints;
  const c = constraints.find((c) => c.type === 'max_actions');
  return typeof c?.value === 'number' ? c.value : undefined;
}

/**
 * Get the `max_turns` constraint for a role.
 * @returns the max turns in a discussion, or `undefined` if unconstrained.
 */
export function getMaxTurns(role: string): number | undefined {
  const r = asAgentRole(role);
  if (!r) return undefined;
  const constraints = ROLE_DEFINITIONS[r].constraints;
  const c = constraints.find((c) => c.type === 'max_turns');
  return typeof c?.value === 'number' ? c.value : undefined;
}

/**
 * Check whether an agent has exceeded their `max_turns` constraint.
 *
 * @param role - the agent's role (free-form string; non-canonical roles are unconstrained)
 * @param turnsTaken - how many turns this agent has already taken in the
 *   current discussion (count of prior `AgentTurnSummary` entries for this agent)
 * @returns `true` if the constraint exists AND has been reached or exceeded
 */
export function hasExceededMaxTurns(
  role: string,
  turnsTaken: number,
): boolean {
  const max = getMaxTurns(role);
  return max !== undefined && turnsTaken >= max;
}
