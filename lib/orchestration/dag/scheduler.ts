import type { TaskDAG, TaskNode, TaskEdge, TaskStage, TaskExecutionPlan } from './types';

export interface TopologicalSortResult {
  sorted: TaskNode[];
  cycle: boolean;
}

export function topologicalSort(nodes: TaskNode[], edges: TaskEdge[]): TopologicalSortResult {
  const adjacency = new Map<string, string[]>();
  const inDegree = new Map<string, number>();

  for (const node of nodes) {
    adjacency.set(node.id, []);
    inDegree.set(node.id, 0);
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  const sorted: TaskNode[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = nodes.find((n) => n.id === id);
    if (node) sorted.push(node);
    for (const neighbor of adjacency.get(id) || []) {
      const newDeg = (inDegree.get(neighbor) || 0) - 1;
      inDegree.set(neighbor, newDeg);
      if (newDeg === 0) queue.push(neighbor);
    }
  }

  return {
    sorted,
    cycle: sorted.length !== nodes.length,
  };
}

export function getDependencyLevels(nodes: TaskNode[], edges: TaskEdge[]): Map<string, number> {
  const levels = new Map<string, number>();
  const reverseAdj = new Map<string, string[]>();

  for (const node of nodes) {
    reverseAdj.set(node.id, []);
    levels.set(node.id, 0);
  }
  for (const edge of edges) {
    reverseAdj.get(edge.to)?.push(edge.from);
  }

  const getLevel = (nodeId: string): number => {
    const cached = levels.get(nodeId);
    if (cached !== undefined && cached > 0) return cached;
    const deps = reverseAdj.get(nodeId) || [];
    if (deps.length === 0) {
      levels.set(nodeId, 0);
      return 0;
    }
    const maxDepLevel = Math.max(...deps.map(getLevel));
    const level = maxDepLevel + 1;
    levels.set(nodeId, level);
    return level;
  };

  for (const node of nodes) {
    getLevel(node.id);
  }

  return levels;
}

export function buildExecutionPlan(dag: TaskDAG): TaskExecutionPlan {
  const { sorted, cycle } = topologicalSort(dag.nodes, dag.edges);

  if (cycle) {
    throw new Error(`DAG ${dag.id} contains a cycle`);
  }

  const levels = getDependencyLevels(dag.nodes, dag.edges);
  const maxLevel = Math.max(...Array.from(levels.values()), 0);

  const stages: TaskStage[] = [];
  for (let level = 0; level <= maxLevel; level++) {
    const levelNodes = dag.nodes.filter((n) => levels.get(n.id) === level);
    const hasMultiple = levelNodes.length > 1;

    const deps: number[] = [];
    for (const node of levelNodes) {
      for (const edge of dag.edges) {
        if (edge.to === node.id) {
          const depNode = dag.nodes.find((n) => n.id === edge.from);
          if (depNode) {
            const depLevel = levels.get(depNode.id) ?? 0;
            const depStage = stages.findIndex((s) => s.nodes.some((n) => n.id === depNode.id));
            if (depStage >= 0 && !deps.includes(depStage)) {
              deps.push(depStage);
            }
          }
        }
      }
    }

    stages.push({
      id: level,
      label: hasMultiple ? `Stage ${level + 1} (parallel)` : `Stage ${level + 1}`,
      nodes: levelNodes,
      parallel: hasMultiple,
      dependencies: [...new Set(deps)],
    });
  }

  const criticalPath = findCriticalPath(dag, levels);

  return {
    stages,
    totalNodes: dag.nodes.length,
    criticalPath,
    estimatedDuration: criticalPath.length * 5000,
  };
}

function findCriticalPath(dag: TaskDAG, levels: Map<string, number>): string[] {
  const maxLevel = Math.max(...Array.from(levels.values()), 0);
  const path: string[] = [];

  const findPath = (level: number): string | null => {
    const candidates = dag.nodes.filter((n) => levels.get(n.id) === level);
    for (const candidate of candidates) {
      const hasDependent = dag.edges.some(
        (e) => e.from === candidate.id && (levels.get(e.to) ?? 0) > level,
      );
      if (hasDependent || level === maxLevel) {
        return candidate.id;
      }
    }
    return candidates[0]?.id ?? null;
  };

  for (let l = 0; l <= maxLevel; l++) {
    const id = findPath(l);
    if (id) path.push(id);
  }

  return path;
}

export function getDependencies(nodeId: string, edges: TaskEdge[]): string[] {
  return edges.filter((e) => e.to === nodeId).map((e) => e.from);
}

export function getDependents(nodeId: string, edges: TaskEdge[]): string[] {
  return edges.filter((e) => e.from === nodeId).map((e) => e.to);
}
