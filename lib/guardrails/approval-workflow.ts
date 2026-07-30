/**
 * Human-in-the-loop (HITL) approval workflow for agent actions.
 *
 * When an agent's role has the `require_approval` constraint, actions
 * emitted by that agent are not executed directly. Instead, they are
 * queued as `ApprovalRequest` entries, and the frontend surfaces an
 * approval UI. The action is only applied after explicit user
 * confirmation (approve) or discarded (reject).
 *
 * This module provides:
 * - `ApprovalRequest` type and `ApprovalStore` in-memory queue
 * - `createApprovalRequest` — called by the agent pipeline to intercept
 *   actions from approval-required roles
 * - `processApproval` — called by the API endpoint when the user
 *   approves or rejects
 * - `getPendingApprovals` — called by the frontend to list pending items
 *
 * Persistence: v1 uses an in-memory `Map` scoped to a classroom session.
 * For multi-instance deployments, this should be backed by Redis or the
 * database. The interface is designed to make that swap straightforward.
 */
import { createLogger } from '@/lib/logger';
import type { Action } from '@/lib/types/action';

const log = createLogger('ApprovalWorkflow');

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  /** Unique ID for this approval request. */
  id: string;
  /** The classroom/session ID this request belongs to. */
  sessionId: string;
  /** The agent ID that emitted the action. */
  agentId: string;
  /** The agent's role (for display/context). */
  agentRole: string;
  /** The action that requires approval. */
  action: Action;
  /** Current status of the request. */
  status: ApprovalStatus;
  /** When the request was created (epoch ms). */
  createdAt: number;
  /** When the request was resolved (epoch ms), or null if pending. */
  resolvedAt: number | null;
  /** Optional reason provided by the reviewer. */
  reviewNote?: string;
}

/** Auto-expire pending requests after 5 minutes. */
const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

/** In-memory store keyed by request ID. */
const store = new Map<string, ApprovalRequest>();

/** Generate a unique approval request ID. */
function generateId(): string {
  return `apr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Create a new approval request for an agent action.
 *
 * Called by the agent pipeline when `requiresApproval(role)` returns `true`.
 * The action is NOT executed — it waits in the queue until the user
 * approves or rejects it (or it auto-expires).
 *
 * @returns the created `ApprovalRequest` (status: 'pending')
 */
export function createApprovalRequest(params: {
  sessionId: string;
  agentId: string;
  agentRole: string;
  action: Action;
}): ApprovalRequest {
  const request: ApprovalRequest = {
    id: generateId(),
    sessionId: params.sessionId,
    agentId: params.agentId,
    agentRole: params.agentRole,
    action: params.action,
    status: 'pending',
    createdAt: Date.now(),
    resolvedAt: null,
  };

  store.set(request.id, request);
  log.info('Approval request created', {
    id: request.id,
    sessionId: params.sessionId,
    agentId: params.agentId,
    actionType: params.action.type,
  });

  return request;
}

/**
 * Get all pending approval requests for a session.
 * Auto-expires requests that have exceeded the timeout.
 */
export function getPendingApprovals(sessionId: string): ApprovalRequest[] {
  const now = Date.now();
  const result: ApprovalRequest[] = [];

  for (const req of store.values()) {
    if (req.sessionId !== sessionId) continue;

    // Auto-expire old pending requests
    if (req.status === 'pending' && now - req.createdAt > APPROVAL_TIMEOUT_MS) {
      req.status = 'expired';
      req.resolvedAt = now;
      log.info('Approval request expired', { id: req.id, sessionId });
      continue;
    }

    if (req.status === 'pending') {
      result.push(req);
    }
  }

  return result.sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Get a single approval request by ID.
 */
export function getApprovalRequest(id: string): ApprovalRequest | undefined {
  return store.get(id);
}

/**
 * Process an approval decision (approve or reject).
 *
 * @returns the updated request, or `undefined` if not found / already resolved.
 */
export function processApproval(
  id: string,
  decision: 'approved' | 'rejected',
  reviewNote?: string,
): ApprovalRequest | undefined {
  const req = store.get(id);
  if (!req) return undefined;
  if (req.status !== 'pending') return undefined;

  req.status = decision;
  req.resolvedAt = Date.now();
  if (reviewNote) req.reviewNote = reviewNote;

  log.info('Approval request resolved', {
    id,
    decision,
    sessionId: req.sessionId,
    agentId: req.agentId,
  });

  return req;
}

/**
 * Remove resolved/expired requests older than the retention period.
 * Called periodically to prevent unbounded memory growth.
 */
export function cleanupApprovalStore(): void {
  const now = Date.now();
  const retentionMs = 30 * 60 * 1000; // Keep resolved items for 30 min

  for (const [id, req] of store.entries()) {
    if (req.status === 'pending') continue;
    if (req.resolvedAt && now - req.resolvedAt > retentionMs) {
      store.delete(id);
    }
  }
}

/**
 * Check if a session has any pending approval requests.
 * Useful for the frontend to show an approval badge.
 */
export function hasPendingApprovals(sessionId: string): boolean {
  return getPendingApprovals(sessionId).length > 0;
}
