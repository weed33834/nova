import type { KnowledgeGraph, ConceptNode, KnowledgeState } from './types';
import { createLogger } from '@/lib/logger';

const log = createLogger('KGExtractor');

export interface ExtractionResult {
  concepts: Array<{
    id: string;
    label: string;
    confidence: number;
  }>;
  relations: Array<{
    source: string;
    target: string;
    relation: 'requires' | 'enhances' | 'related_to';
    confidence: number;
  }>;
}

export function extractFromSceneContent(
  sceneId: string,
  content: string,
  existingGraph: KnowledgeGraph,
): ExtractionResult {
  const result: ExtractionResult = { concepts: [], relations: [] };
  const seenConcepts = new Set<string>();

  const topicPatterns = [
    /\b(概念|定义|原理|理论|定律|公式)\b[：:]\s*([^，。\n]{2,50})/g,
    /\b(什么是|什么是|什么是)\s*([^？?]{2,30})/g,
    /\b(学习|掌握|理解)\s*([^，。\n]{2,30})/g,
  ];

  for (const pattern of topicPatterns) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const label = (match[2] || match[1]).trim();
      if (label.length >= 2 && label.length <= 50 && !seenConcepts.has(label)) {
        seenConcepts.add(label);
        const conceptId = `extracted-${sceneId}-${seenConcepts.size}`;
        result.concepts.push({ id: conceptId, label, confidence: 0.5 });

        const existing = existingGraph.nodes.find(
          (n) => n.label.includes(label) || label.includes(n.label),
        );
        if (existing) {
          result.relations.push({
            source: existing.id,
            target: conceptId,
            relation: 'related_to',
            confidence: 0.4,
          });
        }
      }
    }
  }

  return result;
}

export function extractFromConversation(
  messages: Array<{ role: string; content: string }>,
  graph: KnowledgeGraph,
): ExtractionResult {
  const result: ExtractionResult = { concepts: [], relations: [] };
  const mentionedConceptIds = new Set<string>();
  const userMessages = messages.filter((m) => m.role === 'user');

  for (const msg of userMessages) {
    for (const node of graph.nodes) {
      const matched =
        node.keywords.some((kw) => msg.content.includes(kw)) || msg.content.includes(node.label);

      if (matched) {
        mentionedConceptIds.add(node.id);
        result.concepts.push({ id: node.id, label: node.label, confidence: 0.6 });
      }
    }
  }

  for (const edge of graph.edges) {
    if (mentionedConceptIds.has(edge.source) && mentionedConceptIds.has(edge.target)) {
      result.relations.push({
        source: edge.source,
        target: edge.target,
        relation: edge.relation as 'requires' | 'enhances' | 'related_to',
        confidence: 0.7,
      });
    }
  }

  return result;
}

export function mergeExtractionResults(results: ExtractionResult[]): ExtractionResult {
  const merged: ExtractionResult = { concepts: [], relations: [] };
  const seenConcepts = new Map<string, number>();
  const seenRelations = new Set<string>();

  for (const result of results) {
    for (const concept of result.concepts) {
      const key = concept.label;
      const existing = seenConcepts.get(key) ?? 0;
      if (existing > 0) {
        const existingConcept = merged.concepts.find((c) => c.label === key);
        if (existingConcept) {
          existingConcept.confidence = Math.max(existingConcept.confidence, concept.confidence);
        }
      } else {
        merged.concepts.push({ ...concept });
        seenConcepts.set(key, 1);
      }
    }

    for (const rel of result.relations) {
      const key = `${rel.source}-${rel.relation}-${rel.target}`;
      if (!seenRelations.has(key)) {
        merged.relations.push(rel);
        seenRelations.add(key);
      }
    }
  }

  return merged;
}
