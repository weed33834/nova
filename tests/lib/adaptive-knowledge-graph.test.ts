import { describe, expect, it } from 'vitest';
import {
  createKnowledgeGraph,
  addNode,
  addEdge,
  findShortestPath,
  getConnectedComponent,
  getLearningPath,
} from '@/lib/adaptive/knowledge-graph/graph';
import type { ConceptNode, ConceptEdge } from '@/lib/adaptive/knowledge-graph/types';

function node(id: string, difficulty = 1): ConceptNode {
  return {
    id,
    label: id,
    description: '',
    category: 'core',
    difficulty,
    keywords: [],
    estimatedMinutes: 10,
    metadata: {},
  };
}

function edge(source: string, target: string, relation: ConceptEdge['relation'] = 'requires'): ConceptEdge {
  return { source, target, relation, weight: 1 } as ConceptEdge;
}

describe('createKnowledgeGraph', () => {
  it('builds a graph with metadata', () => {
    const g = createKnowledgeGraph('g1', 'Algebra', 'math', [node('a')], []);
    expect(g.id).toBe('g1');
    expect(g.name).toBe('Algebra');
    expect(g.subject).toBe('math');
    expect(g.nodes).toHaveLength(1);
    expect(g.metadata?.created).toBeGreaterThan(0);
  });
});

describe('addNode', () => {
  it('appends a new node', () => {
    const g = createKnowledgeGraph('g1', 'n', 's', [], []);
    const g2 = addNode(g, node('a'));
    expect(g2.nodes).toHaveLength(1);
    expect(g2.metadata!.updated).toBeGreaterThanOrEqual(g.metadata!.created);
  });

  it('is a no-op for a duplicate id', () => {
    const g = createKnowledgeGraph('g1', 'n', 's', [node('a')], []);
    const g2 = addNode(g, node('a'));
    expect(g2.nodes).toHaveLength(1);
  });
});

describe('addEdge', () => {
  it('appends a new edge', () => {
    const g = createKnowledgeGraph('g1', 'n', 's', [node('a'), node('b')], []);
    const g2 = addEdge(g, edge('a', 'b'));
    expect(g2.edges).toHaveLength(1);
  });

  it('is a no-op for a duplicate (source,target)', () => {
    const g = createKnowledgeGraph('g1', 'n', 's', [node('a'), node('b')], [edge('a', 'b')]);
    const g2 = addEdge(g, edge('a', 'b'));
    expect(g2.edges).toHaveLength(1);
  });
});

describe('findShortestPath', () => {
  it('returns the direct path when nodes are adjacent', () => {
    const g = createKnowledgeGraph('g1', 'n', 's', [node('a'), node('b')], [edge('a', 'b')]);
    const path = findShortestPath(g, 'a', 'b');
    expect(path.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('traverses a multi-hop prerequisite chain', () => {
    const g = createKnowledgeGraph(
      'g1',
      'n',
      's',
      [node('a'), node('b'), node('c')],
      [edge('a', 'b'), edge('b', 'c')],
    );
    const path = findShortestPath(g, 'a', 'c');
    expect(path.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty path when no route exists', () => {
    const g = createKnowledgeGraph('g1', 'n', 's', [node('a'), node('b')], []);
    expect(findShortestPath(g, 'a', 'b')).toEqual([]);
  });

  it('returns an empty path when the start node does not exist', () => {
    const g = createKnowledgeGraph('g1', 'n', 's', [node('a')], []);
    expect(findShortestPath(g, 'missing', 'a')).toEqual([]);
  });

  it('only follows "requires" edges', () => {
    const g = createKnowledgeGraph(
      'g1',
      'n',
      's',
      [node('a'), node('b')],
      [edge('a', 'b', 'related_to')],
    );
    expect(findShortestPath(g, 'a', 'b')).toEqual([]);
  });
});

describe('getConnectedComponent', () => {
  it('collects all nodes reachable via any edge direction', () => {
    const g = createKnowledgeGraph(
      'g1',
      'n',
      's',
      [node('a'), node('b'), node('c'), node('d')],
      [edge('a', 'b'), edge('b', 'c')],
    );
    const comp = getConnectedComponent(g, 'a').map((n) => n.id).sort();
    expect(comp).toEqual(['a', 'b', 'c']);
    expect(getConnectedComponent(g, 'd').map((n) => n.id)).toEqual(['d']);
  });
});

describe('getLearningPath', () => {
  it('returns prerequisites sorted by difficulty', () => {
    const g = createKnowledgeGraph(
      'g1',
      'n',
      's',
      [node('a', 1), node('b', 2), node('c', 3)],
      [edge('a', 'b'), edge('b', 'c')],
    );
    const path = getLearningPath(g, 'c', []).map((n) => n.id);
    expect(path).toEqual(['a', 'b', 'c']);
  });

  it('excludes already-known concepts', () => {
    const g = createKnowledgeGraph(
      'g1',
      'n',
      's',
      [node('a', 1), node('b', 2), node('c', 3)],
      [edge('a', 'b'), edge('b', 'c')],
    );
    const path = getLearningPath(g, 'c', ['a', 'b']).map((n) => n.id);
    expect(path).toEqual(['c']);
  });

  it('returns an empty path when the target is already known', () => {
    const g = createKnowledgeGraph('g1', 'n', 's', [node('a')], []);
    expect(getLearningPath(g, 'a', ['a'])).toEqual([]);
  });
});
