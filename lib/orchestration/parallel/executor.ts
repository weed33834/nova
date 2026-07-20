import type {
  ParallelAgentConfig,
  ParallelExecutionResult,
  ParallelAggregation,
  ParallelExecutionGroup,
  ParallelExecutionPlan,
} from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('ParallelExecutor');

export type AgentExecutor = (
  agentId: string,
  input?: Record<string, unknown>,
) => Promise<{
  content: string;
  actions: Array<{ actionName: string; params: Record<string, unknown> }>;
}>;

export class ParallelExecutor {
  private executor: AgentExecutor;

  constructor(executor: AgentExecutor) {
    this.executor = executor;
  }

  async executeGroup(
    config: ParallelAgentConfig,
    input?: Record<string, unknown>,
  ): Promise<ParallelExecutionResult[]> {
    const results: ParallelExecutionResult[] = [];
    const errors: Error[] = [];

    if (config.execution === 'ordered') {
      for (const agentId of config.agentIds) {
        try {
          const result = await this.executeSingle(agentId, config.timeout, input);
          results.push(result);
        } catch (error) {
          errors.push(error instanceof Error ? error : new Error(String(error)));
          results.push({
            agentId,
            status: 'error',
            content: '',
            actions: [],
            duration: 0,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } else if (config.execution === 'race') {
      const racePromises = config.agentIds.map((agentId) =>
        this.executeSingle(agentId, config.timeout, input).then((r) => ({ agentId, result: r })),
      );
      try {
        const winner = await Promise.race(racePromises);
        results.push(winner.result);
        log.info(`[ParallelExecutor] Race won by "${winner.agentId}"`);
      } catch (error) {
        results.push({
          agentId: config.agentIds[0],
          status: 'error',
          content: '',
          actions: [],
          duration: 0,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    } else {
      // concurrent
      const promises = config.agentIds.map((agentId) =>
        this.executeSingle(agentId, config.timeout, input).catch((error) => ({
          agentId,
          status: 'error' as const,
          content: '',
          actions: [],
          duration: 0,
          error: error instanceof Error ? error.message : String(error),
        })),
      );
      const settled = await Promise.all(promises);
      results.push(...settled);
    }

    return results;
  }

  async executePlan(plan: ParallelExecutionPlan): Promise<Map<string, ParallelExecutionResult[]>> {
    const groupResults = new Map<string, ParallelExecutionResult[]>();

    for (const group of plan.groups) {
      log.info(`[ParallelExecutor] Executing group "${group.label}"`);
      const results = await this.executeGroup(group.agents, group.input);
      groupResults.set(group.id, results);
    }

    return groupResults;
  }

  aggregateResults(
    results: ParallelExecutionResult[],
    strategy: ParallelAggregation,
  ): { content: string; actions: Array<{ actionName: string; params: Record<string, unknown> }> } {
    const successful = results.filter((r) => r.status === 'success');

    if (successful.length === 0) {
      return { content: '', actions: [] };
    }

    switch (strategy) {
      case 'pick_best': {
        const best = successful.reduce((a, b) => (a.content.length >= b.content.length ? a : b));
        return { content: best.content, actions: best.actions };
      }
      case 'concatenate':
        return {
          content: successful.map((r) => r.content).join('\n\n'),
          actions: successful.flatMap((r) => r.actions),
        };
      case 'merge':
        return {
          content: successful.map((r) => r.content).join('\n\n'),
          actions: successful.flatMap((r) => r.actions),
        };
      case 'vote': {
        const top = successful[0];
        return { content: top.content, actions: top.actions };
      }
      default:
        return { content: successful[0]?.content ?? '', actions: successful[0]?.actions ?? [] };
    }
  }

  private async executeSingle(
    agentId: string,
    timeout?: number,
    input?: Record<string, unknown>,
  ): Promise<ParallelExecutionResult> {
    const startTime = Date.now();

    const execPromise = this.executor(agentId, input);
    const result = timeout
      ? await Promise.race([
          execPromise,
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout),
          ),
        ])
      : await execPromise;

    return {
      agentId,
      status: 'success',
      content: result.content,
      actions: result.actions,
      duration: Date.now() - startTime,
    };
  }
}
