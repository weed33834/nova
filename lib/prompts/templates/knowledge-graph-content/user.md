Create an interactive knowledge graph for: {{title}}

## Subject Domain
{{graphSubject}}

## Description
{{description}}

## Key Points
{{keyPoints}}

## Layout Preference
{{graphLayout}}

## Language
{{languageDirective}}

---

Generate a complete HTML knowledge graph with:

1. **SVG-based force-directed graph** with concept nodes and semantic edges
2. **Nodes** with labels, colored by category (prerequisite/core/advanced/application/assessment)
3. **Edges** with relation types (requires/enhances/is_a/part_of/related_to/assesses) and labels
4. **Pan & zoom** (mouse wheel + drag), touch pinch on mobile
5. **Click node** → highlight node + connected edges, dim others, show details in `#info-panel`
6. **Legend** (`id="legend"`) showing category colors
7. **Reset button** (`id="reset-btn"`) to reset view
8. **High contrast** colors, readable labels
9. **Max 15-20 nodes**, keep it focused on the key concepts from the description
10. **Stable selectors**: every node has `data-node-id="n1"` etc., every edge has `data-edge-id="n1-n2"`

Identify concepts from the key points and description, then determine their relationships:
- Which concepts are **prerequisites** (must be understood first)
- Which are **core** concepts (central to the subject)
- Which are **advanced** (build on core)
- Which are **applications** (real-world use)
- Which are **assessments** (check understanding)

Embed config in `<script type="application/json" id="widget-config">`.
