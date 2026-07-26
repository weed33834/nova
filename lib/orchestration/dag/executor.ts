import type {
  TaskDAG,
  TaskNode,
  TaskEdge,
  DAGExecutionState,
  TaskStage,
} from './types';
import { buildExecutionPlan, getDependencies } from './scheduler';
import { createLogger } from '@/lib/logger';

const _log = createLogger('DAGExecutor');

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
      // Abort check at stage boundary: a long-running prior stage may have
      // completed after the user cancelled, so re-check before kicking off the
      // next stage to avoid wasted work and respect the signal promptly.
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

      // A node may have aborted mid-stage; stop the loop instead of pushing
      // partial results and continuing into dependent stages that would
      // dereference undefined inputs (the deadlock/hang path).
      if (this.options.signal?.aborted) {
        this.state.status = 'failed';
        break;
      }

      for (const [nodeId, result] of stageResults) {
        results.set(nodeId, result);
      }

      this.options.onStageComplete?.(stage);
    }

    if (this.state.status !== 'failed') {
      this.state.status = 'completed';
    }
    return results;
  }

  private async executeParallelStage(
    stage: TaskStage,
    results: Map<string, unknown>,
  ): Promise<Array<[string, unknown]>> {
    // Build the per-node promises once. We then attach a no-op `.catch` to
    // each individual promise BEFORE `Promise.all` so that when `Promise.all`
    // short-circuits on the first rejection, the remaining in-flight nodes'
    // eventual rejections are not reported as unhandled rejection events.
    // `Promise.all` (not `allSettled`) preserves the original fail-fast
    // semantics for the outer loop.
    const promises = stage.nodes.map((node) =>
      this.executeNodeWithTracking(node, results).then((r) => [node.id, r] as [string, unknown]),
    );
    for (const p of promises) p.catch(() => {});
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
      // Honor `node.timeout` (ms) — without it a misbehaving executeNode can
      // hang the whole DAG forever (one stalled node blocks its stage, which
      // blocks every dependent stage). Clear the timer on settle so a fast
      // node doesn't leave a dangling setTimeout keeping the loop alive.
      const execPromise = this.options.executeNode(node, depMap);
      let result: unknown;
      if (typeof node.timeout === 'number' && node.timeout > 0) {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          result = await Promise.race([
            execPromise,
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () => reject(new Error(`Node ${node.id} timed out after ${node.timeout}ms`)),
                node.timeout as number,
              );
            }),
          ]);
        } finally {
          if (timer !== undefined) clearTimeout(timer);
        }
      } else {
        result = await execPromise;
      }

      // If the user aborted while the node was running, don't pretend success —
      // surface as a failure so the outer loop stops.
      if (this.options.signal?.aborted) {
        throw new Error(`Aborted before node ${node.id} could complete`);
      }

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
