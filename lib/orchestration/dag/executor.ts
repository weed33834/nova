import type {
  TaskDAG,
  TaskNode,
  TaskEdge,
  TaskNodeState,
  DAGExecutionState,
  TaskStage,
} from './types';
import { buildExecutionPlan, getDependencies } from './scheduler';
import { createLogger } from '@/lib/logger';

const log = createLogger('DAGExecutor');

export interface DAGExecutorOptions {
  onNodeStart?: (node: TaskNode) => void;
  onNodeComplete?: (node: TaskNode, result: unknown) => void;
  onNodeError?: (node: TaskNode, error: Error) => void;
  onStageStart?: (stage: TaskStage) => void;
  onStageComplete?: (stage: TaskStage) => void;
  executeNode: (node: TaskNode, dependencies: Map<string, unknown>) => Promise<unknown>;
  signal?: AbortSignal;
}

export class DAGExecutor {
  private state: DAGExecutionState;
  private options: DAGExecutorOptions;
  private edges: TaskEdge[];

  constructor(dag: TaskDAG, options: DAGExecutorOptions) {
    const plan = buildExecutionPlan(dag);
    this.edges = dag.edges;
    this.state = {
      dagId: dag.id,
      plan,
      nodeStates: new Map(),
      currentStage: 0,
      startedAt: Date.now(),
      status: 'running',
    };
    this.options = options;

    for (const node of dag.nodes) {
      this.state.nodeStates.set(node.id, {
        nodeId: node.id,
        status: 'pending',
        attempts: 0,
      });
    }
  }

  getState(): DAGExecutionState {
    return this.state;
  }

  async execute(): Promise<Map<string, unknown>> {
    const results = new Map<string, unknown>();

    for (let i = 0; i < this.state.plan.stages.length; i++) {
      if (this.options.signal?.aborted) {
        this.state.status = 'failed';
        break;
      }

      const stage = this.state.plan.stages[i];
      this.state.currentStage = i;
      this.options.onStageStart?.(stage);

      const stageResults = stage.parallel
        ? await this.executeParallelStage(stage, results)
        : [await this.executeSequentialStage(stage, results)];

      for (const [nodeId, result] of stageResults) {
        results.set(nodeId, result);
      }

      this.options.onStageComplete?.(stage);
    }

    this.state.status = 'completed';
    return results;
  }

  private async executeParallelStage(
    stage: TaskStage,
    results: Map<string, unknown>,
  ): Promise<Array<[string, unknown]>> {
    const promises = stage.nodes.map((node) =>
      this.executeNodeWithTracking(node, results).then((r) => [node.id, r] as [string, unknown]),
    );
    return Promise.all(promises);
  }

  private async executeSequentialStage(
    stage: TaskStage,
    results: Map<string, unknown>,
  ): Promise<[string, unknown]> {
    for (const node of stage.nodes) {
      const result = await this.executeNodeWithTracking(node, results);
      return [node.id, result];
    }
    throw new Error('Empty sequential stage');
  }

  private async executeNodeWithTracking(
    node: TaskNode,
    results: Map<string, unknown>,
  ): Promise<unknown> {
    const nodeState = this.state.nodeStates.get(node.id);
    if (!nodeState) throw new Error(`Unknown node: ${node.id}`);

    nodeState.status = 'running';
    nodeState.startedAt = Date.now();
    nodeState.attempts++;
    this.options.onNodeStart?.(node);

    const depMap = new Map<string, unknown>();
    for (const depId of getDependencies(node.id, this.getEdges())) {
      if (results.has(depId)) {
        depMap.set(depId, results.get(depId)!);
      }
    }

    try {
      const result = await this.options.executeNode(node, depMap);
      nodeState.status = 'completed';
      nodeState.completedAt = Date.now();
      nodeState.result = result;
      this.options.onNodeComplete?.(node, result);
      return result;
    } catch (error) {
      nodeState.status = 'failed';
      nodeState.error = error instanceof Error ? error.message : String(error);
      this.options.onNodeError?.(node, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private getEdges(): TaskEdge[] {
    return this.edges;
  }
}
