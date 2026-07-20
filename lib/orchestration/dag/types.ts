export type TaskStatus = 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped';
export type TaskType =
  | 'agent_response'
  | 'llm_call'
  | 'tool_execution'
  | 'parallel_group'
  | 'condition';

export interface TaskNode {
  id: string;
  type: TaskType;
  label: string;
  agentId?: string;
  config?: Record<string, unknown>;
  input?: Record<string, unknown>;
  timeout?: number;
  retry?: number;
}

export interface TaskEdge {
  from: string;
  to: string;
  condition?: string;
}

export interface TaskDAG {
  id: string;
  nodes: TaskNode[];
  edges: TaskEdge[];
  metadata?: {
    name: string;
    description?: string;
    created: number;
  };
}

export interface TaskExecutionPlan {
  stages: TaskStage[];
  totalNodes: number;
  criticalPath: string[];
  estimatedDuration: number;
}

export interface TaskStage {
  id: number;
  label: string;
  nodes: TaskNode[];
  parallel: boolean;
  dependencies: number[];
}

export interface TaskNodeState {
  nodeId: string;
  status: TaskStatus;
  result?: unknown;
  error?: string;
  startedAt?: number;
  completedAt?: number;
  attempts: number;
}

export interface DAGExecutionState {
  dagId: string;
  plan: TaskExecutionPlan;
  nodeStates: Map<string, TaskNodeState>;
  currentStage: number;
  startedAt: number;
  status: 'running' | 'completed' | 'failed';
}

export function createTaskDAG(
  id: string,
  nodes: TaskNode[],
  edges: TaskEdge[],
  metadata?: Partial<TaskDAG['metadata']>,
): TaskDAG {
  return {
    id,
    nodes,
    edges,
    metadata: {
      name: metadata?.name ?? 'Untitled DAG',
      description: metadata?.description,
      created: Date.now(),
    },
  };
}
