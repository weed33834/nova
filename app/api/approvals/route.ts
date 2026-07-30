/**
 * Approval workflow API endpoints.
 *
 * GET  /api/approvals?sessionId=xxx — List pending approval requests for a session
 * POST /api/approvals                — (internal) Create a new approval request
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { getPendingApprovals } from '@/lib/guardrails/approval-workflow';

export const GET = withApiHandler(async (req: NextRequest) => {
  const sessionId = req.nextUrl.searchParams.get('sessionId');

  if (!sessionId) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'sessionId query parameter is required');
  }

  const approvals = getPendingApprovals(sessionId);
  return apiSuccess({ approvals });
}, { rateLimit: 'light' });
