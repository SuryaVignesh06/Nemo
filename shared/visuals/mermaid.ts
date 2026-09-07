import { z } from 'zod';

export const VisualRendererSchema = z.enum(['auto', 'mermaid', 'manim', 'manimgl']);
export type VisualRenderer = z.infer<typeof VisualRendererSchema>;

export const MermaidDiagramTypeSchema = z.enum([
  'flowchart', 'sequence', 'state', 'class', 'architecture', 'mindmap', 'timeline', 'er', 'block',
]);
export type MermaidDiagramType = z.infer<typeof MermaidDiagramTypeSchema>;

const SemanticIdSchema = z
  .string()
  .min(1)
  .max(64)
  .transform((value) => value.trim().replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/^_+|_+$/g, ''))
  .refine(Boolean, 'semantic id must contain a letter or number');

export const MermaidSemanticNodeSchema = z.object({
  id: SemanticIdSchema,
  label: z.string().min(1).max(100),
  kind: z.string().max(40).optional(),
});

export const MermaidSemanticEdgeSchema = z.object({
  from: SemanticIdSchema,
  to: SemanticIdSchema,
  label: z.string().max(80).optional(),
  relation: z.enum(['directed', 'association', 'inheritance', 'composition', 'aggregation']).default('directed'),
});

export function normalizeMermaidDirection(value: unknown): 'TB' | 'TD' | 'BT' | 'LR' | 'RL' {
  if (typeof value !== 'string') return 'TB';
  const clean = value.trim().toUpperCase();
  if (clean === 'TB' || clean === 'TD' || clean === 'BT' || clean === 'LR' || clean === 'RL') return clean;
  if (clean.includes('LR') || clean.includes('HORIZ') || clean.includes('RIGHT') || clean.includes('ROW')) return 'LR';
  if (clean.includes('RL') || clean.includes('LEFT')) return 'RL';
  if (clean.includes('BT') || clean.includes('UP') || clean.includes('BOTTOM')) return 'BT';
  return 'TB';
}

export const MermaidSemanticDiagramSchema = z.object({
  type: MermaidDiagramTypeSchema,
  direction: z
    .preprocess(normalizeMermaidDirection, z.enum(['TB', 'TD', 'BT', 'LR', 'RL']))
    .default('TB'),
  title: z.string().max(100).optional(),
  nodes: z.array(MermaidSemanticNodeSchema).min(1).max(40),
  edges: z.array(MermaidSemanticEdgeSchema).max(80).default([]),
});

export type MermaidSemanticNode = z.infer<typeof MermaidSemanticNodeSchema>;
export type MermaidSemanticDiagram = z.infer<typeof MermaidSemanticDiagramSchema>;

export interface MermaidRenderPayload {
  renderer: 'mermaid';
  visualType: MermaidDiagramType;
  source: string;
  semanticObjects: MermaidSemanticNode[];
}

const ACTION_DIAGRAM_TYPES: Readonly<Record<string, MermaidDiagramType>> = Object.freeze({
  CREATE_FLOWCHART: 'flowchart',
  CREATE_SEQUENCE_DIAGRAM: 'sequence',
  CREATE_STATE_DIAGRAM: 'state',
  CREATE_CLASS_DIAGRAM: 'class',
  CREATE_ARCHITECTURE_DIAGRAM: 'architecture',
  CREATE_MINDMAP: 'mindmap',
  CREATE_TIMELINE: 'timeline',
  CREATE_ER_DIAGRAM: 'er',
  CREATE_BLOCK_DIAGRAM: 'block',
});

export function mermaidTypeForAction(actionType: string): MermaidDiagramType | null {
  return ACTION_DIAGRAM_TYPES[actionType] ?? null;
}

function label(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/["<>`]/g, '').trim().slice(0, 100) || 'Item';
}

function edgeLabel(value?: string): string {
  const safe = value ? label(value).replace(/[|{}]/g, '') : '';
  return safe ? `|${safe}|` : '';
}

/** Converts validated semantic intent into Mermaid source; model-authored source is never executed. */
export function semanticToMermaid(input: MermaidSemanticDiagram): string {
  const plan = MermaidSemanticDiagramSchema.parse(input);
  const nodes = new Map(plan.nodes.map((node) => [node.id, node]));
  const validEdges = plan.edges.filter((edge) => nodes.has(edge.from) && nodes.has(edge.to));

  if (plan.type === 'sequence') {
    const lines = ['sequenceDiagram'];
    for (const node of plan.nodes) lines.push(`  participant ${node.id} as ${label(node.label)}`);
    for (const edge of validEdges) lines.push(`  ${edge.from}->>${edge.to}: ${label(edge.label || 'next')}`);
    return lines.join('\n');
  }
  if (plan.type === 'state') {
    const lines = ['stateDiagram-v2'];
    for (const node of plan.nodes) lines.push(`  state "${label(node.label)}" as ${node.id}`);
    for (const edge of validEdges) lines.push(`  ${edge.from} --> ${edge.to}${edge.label ? `: ${label(edge.label)}` : ''}`);
    return lines.join('\n');
  }
  if (plan.type === 'class') {
    const lines = ['classDiagram'];
    for (const node of plan.nodes) lines.push(`  class ${node.id}["${label(node.label)}"]`);
    for (const edge of validEdges) {
      const arrow = edge.relation === 'inheritance' ? '<|--' : edge.relation === 'composition' ? '*--' : edge.relation === 'aggregation' ? 'o--' : '-->';
      lines.push(`  ${edge.from} ${arrow} ${edge.to}${edge.label ? ` : ${label(edge.label)}` : ''}`);
    }
    return lines.join('\n');
  }
  if (plan.type === 'er') {
    const lines = ['erDiagram'];
    for (const node of plan.nodes) lines.push(`  ${node.id} { string ${node.id}_id }`);
    for (const edge of validEdges) lines.push(`  ${edge.from} ||--o{ ${edge.to} : "${label(edge.label || 'relates')}"`);
    return lines.join('\n');
  }
  if (plan.type === 'timeline') {
    const lines = ['timeline', `  title ${label(plan.title || 'Timeline')}`];
    plan.nodes.forEach((node, index) => lines.push(`  ${index + 1} : ${label(node.label)}`));
    return lines.join('\n');
  }
  if (plan.type === 'mindmap') {
    const [root, ...rest] = plan.nodes;
    return ['mindmap', `  root((${label(root.label)}))`, ...rest.map((node) => `    ${node.id}[${label(node.label)}]`)].join('\n');
  }

  const lines = [`flowchart ${plan.direction}`];
  for (const node of plan.nodes) lines.push(`  ${node.id}["${label(node.label)}"]`);
  for (const edge of validEdges) lines.push(`  ${edge.from} -->${edgeLabel(edge.label)} ${edge.to}`);
  return lines.join('\n');
}

/** Accepts only semantic nodes/edges and returns a fully validated render payload. */
export function mermaidPayloadFromParameters(
  actionType: string,
  parameters: Record<string, unknown>
): MermaidRenderPayload {
  const type = mermaidTypeForAction(actionType) || 'flowchart';

  // Normalize direction
  const direction = normalizeMermaidDirection(parameters.direction);

  // Normalize nodes: models often emit objects, arrays of strings, or arrays of objects
  let rawNodes: any[] = [];
  if (Array.isArray(parameters.nodes)) {
    rawNodes = parameters.nodes;
  } else if (parameters.nodes && typeof parameters.nodes === 'object') {
    rawNodes = Object.entries(parameters.nodes).map(([k, v]) => {
      if (typeof v === 'string') return { id: k, label: v };
      if (v && typeof v === 'object') return { id: (v as any).id || k, label: (v as any).label || (v as any).name || k };
      return { id: k, label: String(v) };
    });
  } else if (Array.isArray(parameters.steps)) {
    rawNodes = parameters.steps;
  } else if (Array.isArray(parameters.items)) {
    rawNodes = parameters.items;
  }

  const nodes: MermaidSemanticNode[] = [];
  for (let i = 0; i < rawNodes.length; i++) {
    const item = rawNodes[i];
    if (typeof item === 'string') {
      const id = `node_${i + 1}`;
      nodes.push({ id, label: item.trim() || `Step ${i + 1}` });
    } else if (item && typeof item === 'object') {
      const id = String(item.id || item.name || `node_${i + 1}`).trim().replace(/[^a-zA-Z0-9_-]+/g, '_') || `node_${i + 1}`;
      const labelStr = String(item.label || item.title || item.name || item.text || id).trim();
      nodes.push({ id, label: labelStr || `Node ${i + 1}`, kind: typeof item.kind === 'string' ? item.kind : undefined });
    }
  }

  if (nodes.length === 0) {
    nodes.push({ id: 'start', label: typeof parameters.title === 'string' ? parameters.title : 'Overview' });
  }

  // Normalize edges
  let rawEdges: any[] = [];
  if (Array.isArray(parameters.edges)) {
    rawEdges = parameters.edges;
  } else if (Array.isArray(parameters.links)) {
    rawEdges = parameters.links;
  } else if (Array.isArray(parameters.connections)) {
    rawEdges = parameters.connections;
  }

  const nodeIds = new Set(nodes.map((n) => n.id));
  const edges: z.infer<typeof MermaidSemanticEdgeSchema>[] = [];
  for (const edge of rawEdges) {
    if (edge && typeof edge === 'object') {
      const from = String(edge.from || edge.source || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
      const to = String(edge.to || edge.target || '').trim().replace(/[^a-zA-Z0-9_-]+/g, '_');
      if (from && to) {
        if (!nodeIds.has(from)) {
          nodes.push({ id: from, label: from });
          nodeIds.add(from);
        }
        if (!nodeIds.has(to)) {
          nodes.push({ id: to, label: to });
          nodeIds.add(to);
        }
        edges.push({
          from,
          to,
          label: typeof edge.label === 'string' ? edge.label : undefined,
          relation: 'directed',
        });
      }
    }
  }

  // If no edges were specified for a multi-step flowchart or process, chain them in sequence
  if (edges.length === 0 && nodes.length > 1 && (type === 'flowchart' || type === 'sequence' || type === 'state')) {
    for (let i = 0; i < nodes.length - 1; i++) {
      edges.push({ from: nodes[i].id, to: nodes[i + 1].id, relation: 'directed' });
    }
  }

  const parsed = MermaidSemanticDiagramSchema.parse({
    type,
    direction,
    title: typeof parameters.title === 'string' ? parameters.title : undefined,
    nodes,
    edges,
  });

  return {
    renderer: 'mermaid',
    visualType: parsed.type,
    source: semanticToMermaid(parsed),
    semanticObjects: parsed.nodes,
  };
}
