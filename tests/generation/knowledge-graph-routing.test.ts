import { describe, expect, test } from 'vitest';

import { generateWidgetContent, generateSceneContent } from '@/lib/generation/scene-generator';
import type { AICallFn } from '@/lib/generation/pipeline-types';
import type { GeneratedInteractiveContent, SceneOutline } from '@/lib/types/generation';

const DIRECTIVE = '<<KNOWLEDGE-GRAPH-LANGUAGE-DIRECTIVE>>';

describe('knowledge-graph widget content routing', () => {
  test('routes a knowledge-graph widget to knowledge-graph-content prompt (no feature flag needed)', async () => {
    const captured: Array<{ system: string; user: string }> = [];
    const aiCall: AICallFn = async (system, user) => {
      captured.push({ system, user });
      return `<!DOCTYPE html>
<html>
  <body>
    <script type="application/json" id="widget-config">
      {
        "type": "knowledge-graph",
        "subject": "Photosynthesis",
        "description": "Concept map of photosynthesis processes",
        "layout": "force",
        "nodes": [
          { "id": "n1", "label": "Chlorophyll", "description": "Green pigment", "category": "prerequisite", "difficulty": 2 },
          { "id": "n2", "label": "Light Reaction", "description": "Converts light to energy", "category": "core", "difficulty": 5 }
        ],
        "edges": [
          { "source": "n1", "target": "n2", "relation": "requires", "weight": 0.9 }
        ]
      }
    </script>
    <svg id="graph-canvas"><g data-node-id="n1"></g><g data-node-id="n2"></g></svg>
  </body>
</html>`;
    };

    const outline = createKnowledgeGraphOutline();

    // generateWidgetContent should work without any feature flag options
    const widgetContent = await generateWidgetContent(outline, aiCall, DIRECTIVE);
    expect(widgetContent).not.toBeNull();
    expect(widgetContent?.widgetType).toBe('knowledge-graph');
    expect(widgetContent?.widgetConfig?.type).toBe('knowledge-graph');

    // Verify prompt routing
    expect(captured).toHaveLength(1);
    const widgetPrompt = captured[0];
    expect(widgetPrompt.system).toContain('# Interactive Knowledge Graph Generator');
    expect(widgetPrompt.user).toContain('Photosynthesis');
    expect(widgetPrompt.user).toContain('force');
    expect(widgetPrompt.user).toContain(DIRECTIVE);
    expect(widgetPrompt.user).not.toContain('{{');
  });

  test('routes through generateSceneContent without feature flag', async () => {
    const captured: Array<{ system: string; user: string }> = [];
    const aiCall: AICallFn = async (system, user) => {
      captured.push({ system, user });
      return `<!DOCTYPE html>
<html>
  <body>
    <script type="application/json" id="widget-config">
      { "type": "knowledge-graph", "subject": "WWII", "description": "Events", "layout": "force", "nodes": [], "edges": [] }
    </script>
    <svg id="graph-canvas"></svg>
  </body>
</html>`;
    };

    const outline = createKnowledgeGraphOutline({ graphSubject: 'WWII', title: 'WWII Knowledge Map' });

    const content = (await generateSceneContent(outline, aiCall, {
      languageDirective: DIRECTIVE,
    })) as GeneratedInteractiveContent | null;

    expect(content).not.toBeNull();
    expect(content?.widgetType).toBe('knowledge-graph');
    expect(content?.widgetConfig?.type).toBe('knowledge-graph');
    expect(captured).toHaveLength(1);
    expect(captured[0].user).toContain('WWII');
  });

  test('falls back when widgetType is missing', async () => {
    const aiCall: AICallFn = async () => {
      throw new Error('should not be called for missing widget config');
    };

    const outline: SceneOutline = {
      id: 'scene-kg-no-widget',
      type: 'interactive',
      title: 'Missing Widget Config',
      description: 'Interactive without widgetType',
      keyPoints: ['point'],
      order: 1,
    };

    await expect(generateWidgetContent(outline, aiCall)).resolves.toBeNull();
  });

  test('extractInteractiveElements surfaces data-node-id selectors', async () => {
    // The extractInteractiveElements function should now collect data-node-id attributes
    // so the interactive-actions prompt can target them.
    const { extractInteractiveElements } = await import('@/lib/generation/scene-generator');
    const html = `
      <svg>
        <g data-node-id="n1"><circle r="20"/></g>
        <g data-node-id="n2"><circle r="20"/></g>
        <g data-edge-id="n1-n2"><line/></g>
      </svg>
      <div id="info-panel"></div>
      <div id="legend"></div>
      <button id="reset-btn">Reset</button>
    `;

    const inventory = extractInteractiveElements(html);
    expect(inventory).toContain('data-node-id="n1"');
    expect(inventory).toContain('data-node-id="n2"');
    expect(inventory).toContain('data-edge-id="n1-n2"');
    expect(inventory).toContain('#info-panel');
    expect(inventory).toContain('#legend');
    expect(inventory).toContain('#reset-btn');
  });
});

function createKnowledgeGraphOutline(
  overrides: { graphSubject?: string; title?: string } = {},
): SceneOutline {
  return {
    id: 'scene-knowledge-graph',
    type: 'interactive',
    title: overrides.title || 'Photosynthesis Knowledge Graph',
    description: 'Interactive concept map showing the relationships between photosynthesis concepts.',
    keyPoints: [
      'Light reaction and dark reaction relationship',
      'Chloroplast structure basics',
      'Comparison with cellular respiration',
    ],
    order: 1,
    widgetType: 'knowledge-graph',
    widgetOutline: {
      concept: 'photosynthesis',
      graphSubject: overrides.graphSubject || 'Photosynthesis',
      graphLayout: 'force',
    },
  };
}
