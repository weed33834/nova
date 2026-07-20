export type ParallelExecutionMode = 'concurrent' | 'ordered' | 'race';
export type ParallelAggregation = 'merge' | 'pick_best' | 'vote' | 'concatenate';

export interface ParallelAgentConfig {
  agentIds: string[];
  execution: ParallelExecutionMode;
  aggregation?: ParallelAggregation;
  timeout?: number;
}

export interface ParallelExecutionResult {
  agentId: string;
  status: 'success' | 'timeout' | 'error';
  content: string;
  actions: Array<{ actionName: string; params: Record<string, unknown> }>;
  duration: number;
  error?: string;
}

export interface ParallelExecutionGroup {
  id: string;
  label: string;
  agents: ParallelAgentConfig;
  input?: Record<string, unknown>;
  dependsOn?: string[];
}

export interface ParallelExecutionPlan {
  groups: ParallelExecutionGroup[];
  totalAgents: number;
  estimatedDuration: number;
}
