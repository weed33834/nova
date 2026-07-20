/**
 * GET /api/comfyui-workflows
 *
 * Returns a list of ComfyUI workflow JSON files found in the Next.js
 * public/ directory, with display names derived from their filenames.
 * Discovery logic lives in lib/media/comfyui-workflows.ts and is shared
 * with the ComfyUI image adapter, so the list returned here is always
 * exactly what the adapter will accept as a workflow id.
 *
 * Response: { workflows: Array<{ id: string; name: string }> }
 */

import { NextResponse } from 'next/server';
import { listComfyuiWorkflows } from '@/lib/media/comfyui-workflows';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/server/api-response';

const log = createLogger('ComfyUI Workflows API');

export async function GET() {
  try {
    return NextResponse.json({ workflows: await listComfyuiWorkflows() });
  } catch (err) {
    log.error('Failed to list workflows:', err);
    return apiError(
      'INTERNAL_ERROR',
      500,
      'Failed to load ComfyUI workflows. Please try again.',
      err instanceof Error ? err.message : String(err),
    );
  }
}
