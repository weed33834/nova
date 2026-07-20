# Interactive Knowledge Graph Generator

Generate a self-contained HTML knowledge graph visualization with concept nodes and semantic edges.

## Data Schema

Embed the graph data as JSON in `<script type="application/json" id="widget-config">`:

```json
{
  "type": "knowledge-graph",
  "subject": "Subject name",
  "description": "One-sentence description",
  "layout": "force",
  "nodes": [
    {
      "id": "n1",
      "label": "Concept Label",
      "description": "1-2 sentence explanation of this concept",
      "category": "prerequisite",
      "difficulty": 3,
      "keywords": ["keyword1", "keyword2"]
    }
  ],
  "edges": [
    {
      "source": "n1",
      "target": "n2",
      "relation": "requires",
      "weight": 0.8,
      "label": "prerequisite"
    }
  ]
}
```

### Node Categories (drive node color)

| Category | Color | Meaning |
|----------|-------|---------|
| `prerequisite` | Blue (`#3b82f6`) | Foundational knowledge needed before core concepts |
| `core` | Indigo (`#6366f1`) | Central concept of the subject |
| `advanced` | Purple (`#8b5cf6`) | Builds on core concepts |
| `application` | Teal (`#14b8a6`) | Real-world application of concepts |
| `assessment` | Amber (`#f59e0b`) | Checkpoint / evaluation concept |

### Edge Relations (drive edge label + style)

| Relation | Label | Style |
|----------|-------|-------|
| `requires` | → | Solid arrow, prerequisite flow |
| `enhances` | + | Dashed line, complementary |
| `is_a` | is-a | Solid line, taxonomy |
| `part_of` | ⊂ | Solid line, containment |
| `related_to` | ~ | Dotted line, general association |
| `assesses` | ✓ | Double arrow, evaluation |

## Core Requirements

1. **SVG-based** force-directed graph with embedded JSON config
2. **All nodes visible** on load (no hidden nodes initially)
3. **Force layout**: Nodes repel each other; edges act as springs. Use a simple Verlet/Euler integration loop with `requestAnimationFrame`. Stop simulation after ~3 seconds or when stable.
4. **Pan & zoom**: Mouse wheel zooms (zoom into cursor), drag on background pans. Touch pinch-to-zoom on mobile.
5. **Node interaction**: Click a node → highlight it + its connected edges, dim others, show details in `#info-panel`.
6. **Legend**: Color-coded legend in a corner showing each category.
7. **Reset button**: Resets view (zoom/pan) to fit all nodes.
8. **High contrast**: White/light node labels on colored nodes, visible edge labels.
9. **Mobile**: Graph fills the viewport, info panel slides in from bottom on mobile.
10. **Performance**: Cap at 20 nodes max. Use CSS transforms for pan/zoom (not SVG viewBox changes) for smoother rendering.

## CRITICAL: postMessage Listener for Widget Actions (REQUIRED)

The platform drives this widget by posting messages into the iframe
(`SET_WIDGET_STATE`, `HIGHLIGHT_ELEMENT`, `ANNOTATE_ELEMENT`, `REVEAL_ELEMENT`).
Your HTML MUST register this listener, or those actions silently do nothing:

```javascript
window.addEventListener('message', function(event) {
  const { type, target, state, content } = event.data;

  switch (type) {
    case 'SET_WIDGET_STATE':
      // state: { "n1": true, "n2": false, ... }
      // true = highlight node, false = dim node
      if (state) {
        Object.entries(state).forEach(([nodeId, active]) => {
          const node = document.querySelector('[data-node-id="' + nodeId + '"]');
          if (node) {
            node.classList.toggle('dimmed', !active);
            node.classList.toggle('highlighted', !!active);
          }
        });
      }
      break;

    case 'HIGHLIGHT_ELEMENT':
      // target is a CSS selector like [data-node-id="n3"]
      const highlightEl = document.querySelector(target);
      if (highlightEl) {
        // Remove previous highlights
        document.querySelectorAll('.teacher-highlight').forEach(el => {
          el.classList.remove('teacher-highlight');
        });
        highlightEl.classList.add('teacher-highlight');
        // Scroll node into view
        highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        // Also trigger node click handler to show details
        if (highlightEl.onclick) highlightEl.onclick();
      }
      break;

    case 'ANNOTATE_ELEMENT':
      // Show an annotation tooltip near the target node
      const annotateEl = document.querySelector(target);
      if (annotateEl && content) {
        const rect = annotateEl.getBoundingClientRect();
        const tooltip = document.createElement('div');
        tooltip.className = 'teacher-annotation';
        tooltip.style.cssText = 'position:fixed; top:' + (rect.top - 40) + 'px; left:' + rect.left + 'px; background:rgba(139,92,246,0.95); color:white; padding:8px 12px; border-radius:8px; font-size:14px; z-index:1000; animation:fadeIn 0.3s; max-width:250px; word-wrap:break-word;';
        tooltip.textContent = content;
        document.body.appendChild(tooltip);
        setTimeout(() => tooltip.remove(), 4000);
      }
      break;

    case 'REVEAL_ELEMENT':
      // Reveal a hidden node (if any nodes were initially hidden)
      const revealEl = document.querySelector(target);
      if (revealEl) {
        revealEl.style.display = '';
        revealEl.style.opacity = '1';
        revealEl.classList.remove('hidden-node');
      }
      break;
  }
});
```

### Element Naming Convention (STABLE SELECTORS — REQUIRED)

So highlight/annotate/reveal/setState can target nodes, give each node a stable attribute:

- **Nodes**: `data-node-id="n1"` (matching the JSON `id`), e.g. `<g data-node-id="n1">...</g>` or `<circle data-node-id="n1">`.
- **Edges**: `data-edge-id="n1-n2"` (source-target), e.g. `<g data-edge-id="n1-n2">...</g>`.
- **Info panel**: `id="info-panel"` — container for selected node details.
- **Legend**: `id="legend"` — color-coded category legend.
- **Reset button**: `id="reset-btn"` — resets zoom/pan.
- **Graph canvas**: `id="graph-canvas"` — the SVG element.

### CSS for Animations

```css
@keyframes pulse-highlight {
  0%, 100% { stroke-width: 3; opacity: 1; }
  50% { stroke-width: 5; opacity: 0.7; }
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
.node { cursor: pointer; transition: opacity 0.3s, transform 0.2s; }
.node:hover { transform: scale(1.1); }
.node.dimmed { opacity: 0.3; }
.node.highlighted { stroke: #f59e0b; stroke-width: 3; }
.teacher-highlight { animation: pulse-highlight 2s infinite; }
.edge { transition: opacity 0.3s; }
.edge.dimmed { opacity: 0.15; }
.edge.highlighted { stroke-width: 3; }
```

## Force Layout Implementation (Minimal)

```javascript
// Simple force-directed layout (Verlet integration)
function initForceLayout(nodes, edges, width, height) {
  // Initialize node positions in a circle
  nodes.forEach((node, i) => {
    const angle = (i / nodes.length) * Math.PI * 2;
    node.x = width / 2 + Math.cos(angle) * 150;
    node.y = height / 2 + Math.sin(angle) * 150;
    node.vx = 0;
    node.vy = 0;
  });

  let alpha = 1;
  const REPULSION = 8000;
  const SPRING = 0.05;
  const SPRING_LENGTH = 120;
  const DAMPING = 0.85;

  function tick() {
    // Repulsion (all pairs)
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[j].x - nodes[i].x;
        const dy = nodes[j].y - nodes[i].y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        const force = (REPULSION * alpha) / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx -= fx; nodes[i].vy -= fy;
        nodes[j].vx += fx; nodes[j].vy += fy;
      }
    }
    // Spring (edges)
    edges.forEach(edge => {
      const s = nodes.find(n => n.id === edge.source);
      const t = nodes.find(n => n.id === edge.target);
      if (!s || !t) return;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = (dist - SPRING_LENGTH) * SPRING * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.vx += fx; s.vy += fy;
      t.vx -= fx; t.vy -= fy;
    });
    // Apply velocity
    nodes.forEach(node => {
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
      // Keep within bounds
      node.x = Math.max(50, Math.min(width - 50, node.x));
      node.y = Math.max(50, Math.min(height - 50, node.y));
    });
    alpha *= 0.99;
    if (alpha > 0.01) requestAnimationFrame(tick);
    else renderGraph(nodes, edges); // Final render
  }
  tick();
}
```

## Output

Return exactly ONE complete HTML document. No markdown fences, no duplication.
