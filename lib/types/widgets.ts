/**
 * Widget Configuration Types for Ultra Interaction Mode
 */

// ==================== Base Types ====================

export type WidgetType =
  | 'simulation'
  | 'diagram'
  | 'code'
  | 'game'
  | 'visualization3d'
  | 'procedural-skill'
  | 'knowledge-graph';

// ==================== Simulation Widget ====================

export interface SimulationVariable {
  name: string;
  label: string;
  min: number;
  max: number;
  default: number;
  unit?: string;
  step?: number;
}

export interface SimulationConfig {
  type: 'simulation';
  concept: string;
  description: string;
  variables: SimulationVariable[];
  presets?: Array<{
    name: string;
    variables: Record<string, number>;
  }>;
}

// ==================== Diagram Widget ====================

export interface DiagramNode {
  id: string;
  label: string;
  position?: { x: number; y: number };
  details?: string;
  type?: 'default' | 'decision' | 'start' | 'end';
}

export interface DiagramEdge {
  id: string;
  from: string;
  to: string;
  label?: string;
}

export interface DiagramConfig {
  type: 'diagram';
  diagramType: 'flowchart' | 'mindmap' | 'hierarchy' | 'system';
  description: string;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  revealOrder?: string[]; // Node IDs in reveal sequence
}

// ==================== Code Widget ====================

export interface CodeTestCase {
  id: string;
  input: string;
  expected: string;
  description?: string;
  isHidden?: boolean;
}

export interface CodeConfig {
  type: 'code';
  language: 'python' | 'javascript' | 'typescript' | 'java' | 'cpp';
  description: string;
  starterCode: string;
  testCases: CodeTestCase[];
  hints: string[];
  solution: string;
}

// ==================== Game Widget ====================

export interface GameQuestion {
  id: string;
  question: string;
  type: 'single' | 'multiple';
  options: string[];
  correct: number | number[];
  explanation?: string;
  points?: number;
}

export interface GameConfig {
  type: 'game';
  gameType: 'quiz' | 'puzzle' | 'strategy' | 'card';
  description: string;
  questions?: GameQuestion[];
  scoring: {
    correctPoints: number;
    speedBonus?: number;
    comboMultiplier?: number;
    penalty?: number;
  };
  achievements?: Array<{
    id: string;
    name: string;
    description: string;
    icon: string;
    condition: string;
  }>;
}

// ==================== 3D Visualization Widget ====================

export interface Visualization3DObject {
  id: string;
  type: 'sphere' | 'box' | 'cylinder' | 'cone' | 'torus' | 'plane' | 'custom';
  name?: string;
  position?: { x: number; y: number; z: number };
  rotation?: { x: number; y: number; z: number };
  scale?: number | { x: number; y: number; z: number };
  material?: {
    type: 'basic' | 'lambert' | 'phong' | 'standard' | 'emissive';
    color?: string;
    emissive?: string;
    wireframe?: boolean;
    transparent?: boolean;
    opacity?: number;
  };
  // For animated objects
  animation?: {
    type: 'orbit' | 'rotate' | 'bounce' | 'pulse';
    speed?: number;
    axis?: 'x' | 'y' | 'z';
  };
  // For hierarchical objects
  children?: Visualization3DObject[];
}

export interface Visualization3DInteraction {
  type: 'orbit' | 'zoom' | 'pan' | 'slider' | 'button' | 'toggle';
  target?: string; // Object ID or 'camera'
  label?: string;
  param?: string;
  min?: number;
  max?: number;
  default?: number;
  step?: number;
}

export interface Visualization3DConfig {
  type: 'visualization3d';
  visualizationType: 'molecular' | 'solar' | 'anatomy' | 'geometry' | 'physics' | 'custom';
  description: string;
  objects: Visualization3DObject[];
  interactions?: Visualization3DInteraction[];
  camera?: {
    position?: { x: number; y: number; z: number };
    target?: { x: number; y: number; z: number };
    fov?: number;
  };
  lighting?: {
    ambient?: { color?: string; intensity?: number };
    directional?: Array<{
      color?: string;
      intensity?: number;
      position?: { x: number; y: number; z: number };
    }>;
    point?: Array<{
      color?: string;
      intensity?: number;
      position?: { x: number; y: number; z: number };
    }>;
  };
  presets?: Array<{
    name: string;
    description?: string;
    state: Record<string, unknown>;
  }>;
}

// ==================== Procedural Skill Widget ====================

export interface ProceduralSkillStep {
  id: string;
  title: string;
  description: string;
  tools?: string[];
  successCriteria?: string[];
}

export interface ProceduralSkillConfig {
  type: 'procedural-skill';
  task: string;
  description: string;
  tools?: string[];
  steps: ProceduralSkillStep[];
  successCriteria?: string[];
}

// ==================== Knowledge Graph Widget ====================

/**
 * A node in the knowledge graph widget.
 * Reuses the JSON-safe fields from `ConceptNode` in `lib/adaptive/knowledge-graph/types.ts`
 * (without the `Map`-based `KnowledgeState` that is not serializable).
 */
export interface KnowledgeGraphNode {
  id: string;
  label: string;
  description: string;
  /** Concept category drives node color in the visualization. */
  category: 'prerequisite' | 'core' | 'advanced' | 'application' | 'assessment';
  /** Difficulty 1-10. */
  difficulty: number;
  keywords?: string[];
}

export interface KnowledgeGraphEdge {
  source: string;
  target: string;
  /** Semantic relationship between two concepts. */
  relation: 'requires' | 'enhances' | 'is_a' | 'part_of' | 'related_to' | 'assesses';
  /** Edge weight 0-1; influences layout attraction. */
  weight?: number;
  /** Optional human-readable label rendered on the edge. */
  label?: string;
}

export interface KnowledgeGraphWidgetConfig {
  type: 'knowledge-graph';
  subject: string;
  description: string;
  layout: 'force' | 'hierarchy' | 'radial';
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
}

// ==================== Union Types ====================

export type WidgetConfig =
  | SimulationConfig
  | DiagramConfig
  | CodeConfig
  | GameConfig
  | Visualization3DConfig
  | ProceduralSkillConfig
  | KnowledgeGraphWidgetConfig;
