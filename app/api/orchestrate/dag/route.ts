import { NextRequest, NextResponse } from 'next/server';
import type { TaskDAG, TaskNode, TaskEdge } from '@/lib/orchestration/dag/types';
import { buildExecutionPlan } from '@/lib/orchestration/dag/scheduler';
import { apiError, API_ERROR_CODES } from '@/lib/server/api-response';
import { z } from 'zod';
import { validateBody } from '@/lib/server/validate';

const RequestSchema = z.object({
  dag: z.unknown().optional(),
  nodes: z.array(z.unknown()).optional(),
  edges: z.array(z.unknown()).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = validateBody(RequestSchema, body);
    if (!parsed.ok) return parsed.response;
    const { dag, nodes, edges } = parsed.data as {
      dag?: TaskDAG;
      nodes?: TaskNode[];
      edges?: TaskEdge[];
    };

    let taskDAG: TaskDAG;
    if (dag) {
      taskDAG = dag;
    } else if (nodes && edges) {
      taskDAG = {
        id: `dag-${Date.now()}`,
        nodes,
        edges,
        metadata: { name: 'Ad-hoc DAG', created: Date.now() },
      } as TaskDAG;
    } else {
      return apiError(
        API_ERROR_CODES.MISSING_REQUIRED_FIELD,
        400,
        'Provide either "dag" or "nodes"+"edges"',
      );
    }

    const plan = buildExecutionPlan(taskDAG);
    return NextResponse.json({ dag: taskDAG, plan });
  } catch (error) {
    return apiError(
      API_ERROR_CODES.INTERNAL_ERROR,
      500,
      error instanceof Error ? error.message : String(error),
    );
  }
}
