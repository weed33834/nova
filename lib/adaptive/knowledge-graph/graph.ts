import type { KnowledgeGraph, ConceptNode, ConceptEdge, RelationType } from './types';

export function createKnowledgeGraph(
  id: string,
  name: string,
  subject: string,
  nodes: ConceptNode[],
  edges: ConceptEdge[],
): KnowledgeGraph {
  return {
    id,
    name,
    subject,
    nodes,
    edges,
    metadata: {
      created: Date.now(),
      updated: Date.now(),
      version: '1.0',
    },
  };
}

export function addNode(graph: KnowledgeGraph, node: ConceptNode): KnowledgeGraph {
  if (graph.nodes.some((n) => n.id === node.id)) {
    return graph;
  }
  return {
    ...graph,
    nodes: [...graph.nodes, node],
    metadata: { ...graph.metadata!, updated: Date.now() },
  };
}

export function addEdge(graph: KnowledgeGraph, edge: ConceptEdge): KnowledgeGraph {
  if (graph.edges.some((e) => e.source === edge.source && e.target === edge.target)) {
    return graph;
  }
  return {
    ...graph,
    edges: [...graph.edges, edge],
    metadata: { ...graph.metadata!, updated: Date.now() },
  };
}

export function findShortestPath(
  graph: KnowledgeGraph,
  fromId: string,
  toId: string,
): ConceptNode[] {
  const visited = new Set<string>();
  const queue: Array<{ nodeId: string; path: ConceptNode[] }> = [];
  const startNode = graph.nodes.find((n) => n.id === fromId);
  if (!startNode) return [];
  queue.push({ nodeId: fromId, path: [startNode] });

  while (queue.length > 0) {
    const { nodeId, path } = queue.shift()!;
    if (nodeId === toId) return path;

    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const neighbors = graph.edges
      .filter((e) => e.source === nodeId && e.relation === 'requires')
      .map((e) => e.target);

    for (const neighborId of neighbors) {
      if (!visited.has(neighborId)) {
        const neighborNode = graph.nodes.find((n) => n.id === neighborId);
        if (neighborNode) {
          queue.push({ nodeId: neighborId, path: [...path, neighborNode] });
        }
      }
    }
  }

  return [];
}

export function getConnectedComponent(graph: KnowledgeGraph, nodeId: string): ConceptNode[] {
  const visited = new Set<string>();
  const result: ConceptNode[] = [];
  const queue = [nodeId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const node = graph.nodes.find((n) => n.id === currentId);
    if (node) result.push(node);

    const connectedIds = graph.edges
      .filter((e) => e.source === currentId || e.target === currentId)
      .flatMap((e) => (e.source === currentId ? [e.target] : [e.source]));

    for (const connectedId of connectedIds) {
      if (!visited.has(connectedId)) {
        queue.push(connectedId);
      }
    }
  }

  return result;
}

export function getLearningPath(
  graph: KnowledgeGraph,
  targetConceptId: string,
  knownConcepts: string[],
): ConceptNode[] {
  const requiredConcepts = new Set<string>();
  const queue = [targetConceptId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (knownConcepts.includes(currentId)) continue;
    if (requiredConcepts.has(currentId)) continue;

    requiredConcepts.add(currentId);

    const prerequisites = graph.edges
      .filter((e) => e.target === currentId && e.relation === 'requires')
      .map((e) => e.source);

    for (const prereqId of prerequisites) {
      if (!knownConcepts.includes(prereqId)) {
        queue.push(prereqId);
      }
    }
  }

  return graph.nodes
    .filter((n) => requiredConcepts.has(n.id))
    .sort((a, b) => a.difficulty - b.difficulty);
}
