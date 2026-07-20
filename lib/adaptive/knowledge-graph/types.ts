export type ConceptCategory = 'prerequisite' | 'core' | 'advanced' | 'application' | 'assessment';

export interface ConceptNode {
  id: string;
  label: string;
  description: string;
  category: ConceptCategory;
  difficulty: number;
  keywords: string[];
  estimatedMinutes: number;
  metadata?: Record<string, unknown>;
}

export type RelationType = 'requires' | 'enhances' | 'is_a' | 'part_of' | 'related_to' | 'assesses';

export interface ConceptEdge {
  source: string;
  target: string;
  relation: RelationType;
  weight: number;
}

export interface KnowledgeGraph {
  id: string;
  name: string;
  subject: string;
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  metadata?: {
    created: number;
    updated: number;
    version: string;
  };
}

export interface KnowledgeState {
  graphId: string;
  masteryLevels: Map<string, number>;
  visitedConcepts: string[];
  attemptedAssessments: string[];
  lastActivity: number;
}

export interface ConceptPath {
  nodes: ConceptNode[];
  totalEstimatedMinutes: number;
  difficulty: 'beginner' | 'intermediate' | 'advanced';
}

export function createEmptyKnowledgeState(graphId: string): KnowledgeState {
  return {
    graphId,
    masteryLevels: new Map(),
    visitedConcepts: [],
    attemptedAssessments: [],
    lastActivity: Date.now(),
  };
}

export function getConceptById(graph: KnowledgeGraph, id: string): ConceptNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function getPrerequisites(graph: KnowledgeGraph, conceptId: string): ConceptNode[] {
  const prereqIds = graph.edges
    .filter((e) => e.target === conceptId && e.relation === 'requires')
    .map((e) => e.source);
  return graph.nodes.filter((n) => prereqIds.includes(n.id));
}

export function getDependents(graph: KnowledgeGraph, conceptId: string): ConceptNode[] {
  const depIds = graph.edges
    .filter((e) => e.source === conceptId && e.relation === 'requires')
    .map((e) => e.target);
  return graph.nodes.filter((n) => depIds.includes(n.id));
}
