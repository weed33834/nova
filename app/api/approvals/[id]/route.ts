/**
 * Approval request detail and resolution API.
 *
 * GET  /api/approvals/[id]         — Get a specific approval request
 * POST /api/approvals/[id]/resolve — Resolve (approve/reject) an approval request
 */
import type { NextRequest } from 'next/server';
import { apiSuccess, apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { withApiHandler } from '@/lib/server/api-handler';
import { getApprovalRequest, processApproval } from '@/lib/guardrails/approval-workflow';

export const GET = withApiHandler(async (
  _req: NextRequest,
  _ctx,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid approval id');
  }

  const request = getApprovalRequest(id);
  if (!request) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 404, 'Approval request not found');
  }

  return apiSuccess({ request });
}, { rateLimit: 'light' });

export const POST = withApiHandler(async (
  req: NextRequest,
  ctx,
  { params }: { params: Promise<{ id: string }> },
) => {
  const { id } = await params;

  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid approval id');
  }

  let body: { decision?: string; reviewNote?: string };
  try {
    body = await req.json();
  } catch {
    return apiError(API_ERROR_CODES.INVALID_REQUEST, 400, 'Invalid JSON body');
  }

  const decision = body.decision;
  if (decision !== 'approved' && decision !== 'rejected') {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      400,
      'decision must be "approved" or "rejected"',
    );
  }

  const resolved = processApproval(id, decision, body.reviewNote);
  if (!resolved) {
    return apiError(
      API_ERROR_CODES.INVALID_REQUEST,
      404,
      'Approval request not found or already resolved',
    );
  }

  ctx.log.info('Approval resolved', { id, decision });

  return apiSuccess({ request: resolved });
}, { rateLimit: 'moderate' });
