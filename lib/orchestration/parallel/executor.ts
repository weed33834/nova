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
      // Each agent promise must reject-or-resolve on its own so the losers
      // never become an unhandled rejection after `Promise.race` returns.
      // `.catch(() => undefined)` swallows the loser rejection while still
      // letting the winner surface through `Promise.race` below.
      const racePromises = config.agentIds.map(
        (agentId) =>
          this.executeSingle(agentId, config.timeout, input)
            .then((r) => ({ agentId, result: r }))
            .catch((error) => ({
              agentId,
              error: error instanceof Error ? error.message : String(error),
            })),
      );
      try {
        const winner = await Promise.race(racePromises);
        // If every agent rejected, `winner` carries an `error` field instead of
        // a `result` — surface a single error result instead of mistaking a
        // rejection for a success.
        if ('result' in winner && winner.result) {
          results.push(winner.result);
          log.info(`[ParallelExecutor] Race won by "${winner.agentId}"`);
        } else {
          results.push({
            agentId: winner.agentId,
            status: 'error',
            content: '',
            actions: [],
            duration: 0,
            error: (winner as { error?: string }).error ?? 'all agents failed in race',
          });
        }
        // Keep awaiting the remaining losers so their rejections are tracked
        // (now harmless because each has a `.catch` attached) — this avoids
        // orphaned in-flight agent calls and finishes the race deterministically.
        await Promise.allSettled(racePromises);
      } catch (error) {
        // Defensive: only reachable if Promise.race itself rejects (shouldn't,
        // since each branch has `.catch`). Keep the original behavior.
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
    let result: { content: string; actions: Array<{ actionName: string; params: Record<string, unknown> }> };
    if (timeout) {
      // Race the executor against a timer; clear the timer on settle so a
      // resolved/errored call doesn't leave a dangling `setTimeout` that keeps
      // the event loop alive for `timeout` ms after this function returns.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        result = await Promise.race([
          execPromise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error(`Timeout after ${timeout}ms`)), timeout);
          }),
        ]);
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    } else {
      result = await execPromise;
    }

    return {
      agentId,
      status: 'success',
      content: result.content,
      actions: result.actions,
      duration: Date.now() - startTime,
    };
  }
}
