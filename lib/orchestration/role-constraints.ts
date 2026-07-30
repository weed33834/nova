/**
 * Role constraint runtime enforcement.
 *
 * `RoleConstraint` is defined on each `RoleDefinition` in `roles/types.ts`
 * but was previously never read at runtime. This module bridges that gap by
 * providing lookup helpers that the director-graph and agent generation node
 * use to enforce constraints at their natural enforcement points:
 *
 * - `max_turns`        → director node: skip agents who have exhausted their turns
 * - `max_actions`       → agent generate node: cap actions emitted per agent turn
 * - `require_approval`  → agent generate node: emit an `approval_required` action
 *                         instead of executing directly when the flag is set
 * - `cooldown`          → director node: skip agents still in their cooldown window
 * - `require_context`   → director node: skip agents when required context is missing
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
export function hasExceededMaxTurns(role: string, turnsTaken: number): boolean {
  const max = getMaxTurns(role);
  return max !== undefined && turnsTaken >= max;
}

/**
 * Check whether a role has the `require_approval` constraint.
 *
 * When `true`, actions from agents with this role should be emitted as
 * `approval_required` events rather than executed directly. The frontend
 * can then surface an approval UI, and the action is only applied after
 * explicit user confirmation.
 *
 * @param role - the agent's role (free-form string; non-canonical roles are unconstrained)
 * @returns `true` if the role requires approval before action execution
 */
export function requiresApproval(role: string): boolean {
  const r = asAgentRole(role);
  if (!r) return false;
  const constraints = ROLE_DEFINITIONS[r].constraints;
  return constraints.some((c) => c.type === 'require_approval');
}

/**
 * Get the `cooldown` constraint for a role, in milliseconds.
 *
 * A cooldown prevents an agent from taking consecutive turns too quickly.
 * The constraint value is interpreted as seconds (matching the `value:
 * number | string` type in `RoleConstraint`); the returned value is in
 * milliseconds for direct comparison with `Date.now()` timestamps.
 *
 * @param role - the agent's role (free-form string; non-canonical roles are unconstrained)
 * @returns the cooldown duration in ms, or `undefined` if unconstrained
 */
export function getCooldownMs(role: string): number | undefined {
  const r = asAgentRole(role);
  if (!r) return undefined;
  const constraints = ROLE_DEFINITIONS[r].constraints;
  const c = constraints.find((c) => c.type === 'cooldown');
  if (c?.value === undefined) return undefined;
  const seconds = typeof c.value === 'number' ? c.value : Number(c.value);
  return Number.isFinite(seconds) ? seconds * 1000 : undefined;
}

/**
 * Check whether an agent is still in their cooldown window.
 *
 * @param role - the agent's role
 * @param lastTurnTimestamp - the epoch-ms timestamp of the agent's last turn,
 *   or `undefined` if the agent hasn't spoken yet
 * @returns `true` if the cooldown exists AND the agent is still within the window
 */
export function isInCooldown(
  role: string,
  lastTurnTimestamp: number | undefined,
): boolean {
  const cooldownMs = getCooldownMs(role);
  if (cooldownMs === undefined || lastTurnTimestamp === undefined) return false;
  return Date.now() - lastTurnTimestamp < cooldownMs;
}

/**
 * Get the `require_context` constraint for a role.
 *
 * When set, the value is a string identifying the required context key
 * (e.g., "whiteboard", "slides"). The director should check that the
 * required context is available before dispatching to this agent.
 *
 * @param role - the agent's role
 * @returns the required context key, or `undefined` if unconstrained
 */
export function getRequiredContext(role: string): string | undefined {
  const r = asAgentRole(role);
  if (!r) return undefined;
  const constraints = ROLE_DEFINITIONS[r].constraints;
  const c = constraints.find((c) => c.type === 'require_context');
  return typeof c?.value === 'string' ? c.value : undefined;
}
