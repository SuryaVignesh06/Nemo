/**
 * NEMO — semantic action executor.
 *
 * This is the layer the build spec calls "your code decides what DRAW_CIRCLE
 * actually means". Every capability with `implemented: true` in the registry
 * has a case here that turns the model's semantic instruction into scene state
 * and an animation description. Nothing the model wrote is ever executed.
 */

import type { InkStroke, Priority, SceneNode, VisualAction, Vec2 } from '../../shared/contracts.ts';
import { worldBounds } from '../../shared/contracts.ts';
import { SceneStore, cameraForBounds, type Camera, type LayoutReport } from './store.ts';
import {
  arcStrokes,
  arrowStrokes,
  braceStrokes,
  circleStrokes,
  ellipseStrokes,
  highlightStrokes,
  lineStrokes,
  measureText,
  normaliseToOrigin,
  polylineStrokes,
  rectStrokes,
  textToStrokes,
  translateStrokes,
  type StrokeStyle,
} from '../handwriting/strokes.ts';
import type { Pt } from '../handwriting/glyphs.ts';

export const INK = {
  chalk: '#f4f1e8',
  dim: '#8d8b84',
  blue: '#79b8ff',
  amber: '#ffc861',
  green: '#8ce39b',
  red: '#ff8f8f',
  violet: '#b9a2ff',
  cyan: '#6fe3e1',
};

const COLOR_WORDS: Record<string, string> = {
  white: INK.chalk,
  chalk: INK.chalk,
  blue: INK.blue,
  amber: INK.amber,
  yellow: INK.amber,
  orange: INK.amber,
  green: INK.green,
  red: INK.red,
  pink: INK.red,
  purple: INK.violet,
  violet: INK.violet,
  cyan: INK.cyan,
  teal: INK.cyan,
  gray: INK.dim,
  grey: INK.dim,
};

export type OutcomeKind =
  | 'draw'
  | 'fade'
  | 'move'
  | 'scale'
  | 'rotate'
  | 'emphasis'
  | 'camera'
  | 'dim'
  | 'wait'
  | 'instant';

export interface ActionOutcome {
  kind: OutcomeKind;
  nodeIds: string[];
  duration: number;
  /** Target opacity for `fade`. */
  opacity?: number;
  /** Target transform for `move` / `scale` / `rotate`. */
  to?: { x?: number; y?: number; scale?: number; rotation?: number };
  camera?: Camera;
  emphasis?: 'pulse' | 'flash' | 'glow' | 'highlight';
  layout?: LayoutReport;
  /** Human-readable note surfaced in the developer status strip. */
  note?: string;
}

export interface ExecContext {
  lessonId: string;
  viewport: { width: number; height: number };
}

/* ------------------------------------------------------------- parameters */

type Params = Record<string, unknown>;

function str(p: Params, keys: string[], fallback = ''): string {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number') return String(v);
  }
  return fallback;
}

function num(p: Params, keys: string[], fallback: number): number {
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return fallback;
}

function list(p: Params, keys: string[]): unknown[] {
  for (const k of keys) {
    const v = p[k];
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.includes(',')) {
      return v.split(',').map((s) => s.trim());
    }
  }
  return [];
}

function colorOf(p: Params, fallback: string): string {
  const raw = str(p, ['color', 'colour', 'style', 'emphasis']).toLowerCase();
  return COLOR_WORDS[raw] ?? fallback;
}

/* ------------------------------------------------------------- node build */

/**
 * Build a scene node from an action's strokes.
 *
 * The id rule matters for a plan's later beats to work: `target` names a NEW
 * node when nothing by that name exists yet, and refers to an EXISTING node
 * otherwise. So `HIGHLIGHT target="formula"` emphasises the formula and gets a
 * derived id for its band, while `DRAW_ARRAY target="array"` claims the name.
 */
function makeNode(
  action: VisualAction,
  type: SceneNode['type'],
  strokes: InkStroke[],
  color: string,
  store: SceneStore
): SceneNode {
  const normalised = normaliseToOrigin(strokes);
  const wanted = action.target?.trim();
  let id = wanted && !store.get(wanted) ? wanted : `${action.actionId || 'node'}-${type}`;
  // Derived ids must stay deterministic across replays of the same lesson, so
  // disambiguate by probing rather than with a global counter.
  if (id !== wanted && store.get(id)) {
    let n = 2;
    while (store.get(`${id}-${n}`)) n++;
    id = `${id}-${n}`;
  }
  return {
    id,
    type,
    semanticRole: action.semanticRole || type,
    priority: (action.priority ?? 'SECONDARY') as Priority,
    visible: true,
    strokes: normalised.strokes,
    localBounds: { w: normalised.w, h: normalised.h },
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    opacity: 1,
    drawProgress: 0,
    color,
    actionId: action.actionId,
  };
}

function pace(action: VisualAction, base: number): number {
  const explicit = action.timing?.duration;
  if (explicit && explicit > 0) return explicit;
  switch (action.timing?.pace) {
    case 'fast':
      return base * 0.6;
    case 'deliberate':
      return base * 1.55;
    default:
      return base;
  }
}

/** Targets an action refers to, resolved against the scene. */
function targets(store: SceneStore, action: VisualAction): SceneNode[] {
  const refs: string[] = [];
  if (action.target) refs.push(action.target);
  for (const key of ['targets', 'nodes', 'ids']) {
    for (const v of list(action.parameters, [key])) {
      if (typeof v === 'string') refs.push(v);
    }
  }
  for (const r of action.relations ?? []) refs.push(r.target);
  const seen = new Set<string>();
  const out: SceneNode[] = [];
  for (const ref of refs) {
    const n = store.resolve(ref);
    if (n && !seen.has(n.id)) {
      seen.add(n.id);
      out.push(n);
    }
  }
  return out;
}

/* ----------------------------------------------------------- text builders */

const FONT = {
  title: 46,
  subtitle: 27,
  equation: 42,
  formula: 40,
  text: 26,
  label: 21,
  cell: 26,
};

function buildText(
  store: SceneStore,
  action: VisualAction,
  ctx: ExecContext,
  text: string,
  fontSize: number,
  color: string,
  type: SceneNode['type'] = 'text'
): ActionOutcome {
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const maxWidth = 760;
  // Wrap long text rather than letting it run off the board (WRAP_TEXT).
  const lines = wrapText(text, fontSize, maxWidth);
  const strokes: InkStroke[] = [];
  let y = 0;
  const lineHeight = fontSize * 1.55;
  for (const [i, line] of lines.entries()) {
    const built = textToStrokes(line, fontSize, `${seed}:l${i}`, { color, width: fontSize * 0.075 });
    strokes.push(...translateStrokes(built.strokes, 0, y));
    y += lineHeight;
  }
  const node = makeNode(action, type, strokes, color, store);
  const layout = store.add(node, action.relations);
  return {
    kind: 'draw',
    nodeIds: [node.id],
    duration: pace(action, Math.min(3.4, 0.42 + text.length * 0.045)),
    layout,
    note: `wrote "${text.slice(0, 40)}"`,
  };
}

function wrapText(text: string, fontSize: number, maxWidth: number): string[] {
  if (measureText(text, fontSize) <= maxWidth) return [text];
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const candidate = current ? `${current} ${w}` : w;
    if (measureText(candidate, fontSize) > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/* ------------------------------------------------------------ the executor */

export function applyAction(
  store: SceneStore,
  action: VisualAction,
  ctx: ExecContext
): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const style = (color: string, width = 2.6): StrokeStyle => ({ color, width });

  switch (action.type) {
    /* ---------------------------------------------------------- text */
    case 'DRAW_TEXT':
    case 'WRITE_HANDWRITING':
      return buildText(
        store,
        action,
        ctx,
        str(p, ['text', 'content', 'value', 'label'], action.semanticRole),
        num(p, ['fontSize', 'size'], FONT.text),
        colorOf(p, INK.chalk)
      );

    case 'WRITE_TITLE':
      return buildText(
        store,
        action,
        ctx,
        str(p, ['text', 'title', 'content'], 'Lesson'),
        num(p, ['fontSize', 'size'], FONT.title),
        colorOf(p, INK.chalk)
      );

    case 'WRITE_SUBTITLE':
      return buildText(
        store,
        action,
        ctx,
        str(p, ['text', 'subtitle', 'content'], ''),
        num(p, ['fontSize', 'size'], FONT.subtitle),
        colorOf(p, INK.dim)
      );

    case 'WRITE_LABEL':
      return buildText(
        store,
        action,
        ctx,
        str(p, ['text', 'label', 'content', 'value'], action.semanticRole),
        num(p, ['fontSize', 'size'], FONT.label),
        colorOf(p, INK.amber)
      );

    case 'WRITE_BULLET':
      return buildText(
        store,
        action,
        ctx,
        `• ${str(p, ['text', 'content'], '')}`,
        num(p, ['fontSize', 'size'], FONT.text),
        colorOf(p, INK.chalk)
      );

    case 'WRITE_NUMBERED_STEP':
      return buildText(
        store,
        action,
        ctx,
        `${num(p, ['number', 'index', 'step'], 1)}. ${str(p, ['text', 'content'], '')}`,
        num(p, ['fontSize', 'size'], FONT.text),
        colorOf(p, INK.chalk)
      );

    case 'WRITE_EQUATION':
    case 'TRANSFORM_EQUATION':
    case 'SIMPLIFY_EXPRESSION':
      return buildText(
        store,
        action,
        ctx,
        str(p, ['expression', 'equation', 'text', 'after', 'result', 'content'], ''),
        num(p, ['fontSize', 'size'], FONT.equation),
        colorOf(p, INK.chalk),
        'equation'
      );

    case 'WRITE_FORMULA':
      return buildText(
        store,
        action,
        ctx,
        str(p, ['expression', 'formula', 'text', 'content'], ''),
        num(p, ['fontSize', 'size'], FONT.formula),
        colorOf(p, INK.green),
        'equation'
      );

    case 'SHOW_FINAL_ANSWER':
      return buildText(
        store,
        action,
        ctx,
        str(p, ['answer', 'text', 'expression', 'content'], ''),
        num(p, ['fontSize', 'size'], FONT.equation),
        colorOf(p, INK.green),
        'equation'
      );

    case 'SUMMARIZE':
      return buildText(
        store,
        action,
        ctx,
        str(p, ['text', 'summary', 'content', 'keyIdeas'], ''),
        num(p, ['fontSize', 'size'], FONT.text),
        colorOf(p, INK.chalk)
      );

    case 'WRITE_FRACTION': {
      const numerator = str(p, ['numerator', 'top'], '1');
      const denominator = str(p, ['denominator', 'bottom'], '2');
      const fs = num(p, ['fontSize', 'size'], FONT.equation);
      const wN = measureText(numerator, fs);
      const wD = measureText(denominator, fs);
      const w = Math.max(wN, wD);
      const strokes: InkStroke[] = [];
      strokes.push(
        ...translateStrokes(
          textToStrokes(numerator, fs, `${seed}:n`, style(colorOf(p, INK.chalk))).strokes,
          (w - wN) / 2,
          0
        )
      );
      strokes.push(...lineStrokes(0, fs * 1.5, w, fs * 1.5, `${seed}:bar`, style(colorOf(p, INK.chalk))));
      strokes.push(
        ...translateStrokes(
          textToStrokes(denominator, fs, `${seed}:d`, style(colorOf(p, INK.chalk))).strokes,
          (w - wD) / 2,
          fs * 1.75
        )
      );
      const node = makeNode(action, 'equation', strokes, colorOf(p, INK.chalk), store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.2), layout };
    }

    /* ------------------------------------------------------ geometry */
    case 'DRAW_POINT': {
      const color = colorOf(p, INK.amber);
      const r = num(p, ['radius', 'size'], 5);
      const node = makeNode(action, 'circle', circleStrokes(r, r, r, seed, style(color, 3.4)), color, store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.35), layout };
    }

    case 'DRAW_CIRCLE': {
      const color = colorOf(p, INK.chalk);
      const r = num(p, ['radius', 'r', 'size'], 90);
      const node = makeNode(action, 'circle', circleStrokes(r, r, r, seed, style(color)), color, store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.9), layout };
    }

    case 'DRAW_ELLIPSE': {
      const color = colorOf(p, INK.chalk);
      const rx = num(p, ['rx', 'radiusX', 'width'], 110) / (p.width ? 2 : 1);
      const ry = num(p, ['ry', 'radiusY', 'height'], 70) / (p.height ? 2 : 1);
      const node = makeNode(action, 'circle', ellipseStrokes(rx, ry, rx, ry, seed, style(color)), color, store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.9), layout };
    }

    case 'DRAW_RECTANGLE':
    case 'DRAW_SQUARE': {
      const color = colorOf(p, INK.chalk);
      const w = num(p, ['width', 'w', 'side'], 180);
      const h = action.type === 'DRAW_SQUARE' ? w : num(p, ['height', 'h'], 110);
      const node = makeNode(action, 'rectangle', rectStrokes(0, 0, w, h, seed, style(color)), color, store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.0), layout };
    }

    case 'DRAW_TRIANGLE': {
      const color = colorOf(p, INK.chalk);
      const base = num(p, ['base', 'width'], 300);
      const height = num(p, ['height', 'h'], 200);
      // Apex offset lets the model ask for a scalene triangle without giving
      // coordinates: 0.5 is isosceles, 0 puts the apex over the left vertex.
      const apex = Math.min(1, Math.max(0, num(p, ['apex', 'apexRatio'], 0.38)));
      const pts: Pt[] = [
        [0, height],
        [base, height],
        [base * apex, 0],
      ];
      const node = makeNode(action, 'triangle', polylineStrokes(pts, seed, style(color), true), color, store);
      node.anchors = {
        baseLeft: { x: 0, y: height },
        baseRight: { x: base, y: height },
        baseMid: { x: base / 2, y: height },
        apex: { x: base * apex, y: 0 },
        footOfHeight: { x: base * apex, y: height },
      };
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.5), layout };
    }

    case 'DRAW_POLYGON':
    case 'DRAW_REGULAR_POLYGON': {
      const color = colorOf(p, INK.chalk);
      const sides = Math.max(3, Math.min(16, num(p, ['sides', 'n'], 5)));
      const r = num(p, ['radius', 'circumradius', 'size'], 100);
      const pts: Pt[] = [];
      for (let i = 0; i < sides; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / sides;
        pts.push([r + Math.cos(a) * r, r + Math.sin(a) * r]);
      }
      const node = makeNode(action, 'polygon', polylineStrokes(pts, seed, style(color), true), color, store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.3), layout };
    }

    case 'DRAW_ARC': {
      const color = colorOf(p, INK.chalk);
      const r = num(p, ['radius', 'r'], 90);
      const a0 = (num(p, ['startAngle', 'from'], 0) * Math.PI) / 180;
      const a1 = (num(p, ['endAngle', 'to'], 180) * Math.PI) / 180;
      const node = makeNode(action, 'circle', arcStrokes(r, r, r, a0, a1, seed, style(color)), color, store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.7), layout };
    }

    case 'DRAW_ANGLE':
    case 'DRAW_RIGHT_ANGLE': {
      const color = colorOf(p, INK.amber);
      const size = num(p, ['size', 'radius'], action.type === 'DRAW_RIGHT_ANGLE' ? 22 : 40);
      const strokes =
        action.type === 'DRAW_RIGHT_ANGLE'
          ? polylineStrokes(
              [
                [0, size],
                [size, size],
                [size, 0],
              ],
              seed,
              style(color, 2.2)
            )
          : arcStrokes(0, size, size, -Math.PI / 2, 0, seed, style(color, 2.2));
      const node = makeNode(action, 'marker', strokes, color, store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.45), layout };
    }

    case 'DRAW_TICK_MARK': {
      const color = colorOf(p, INK.amber);
      const node = makeNode(action, 'marker', lineStrokes(0, 0, 0, 16, seed, style(color, 2.4)), color, store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.25), layout };
    }

    case 'DRAW_GRID': {
      const color = colorOf(p, INK.dim);
      const w = num(p, ['width'], 400);
      const h = num(p, ['height'], 300);
      const step = num(p, ['spacing', 'step'], 50);
      const strokes: InkStroke[] = [];
      for (let x = 0; x <= w; x += step) {
        strokes.push(...lineStrokes(x, 0, x, h, `${seed}:v${x}`, { color, width: 1, wobble: 0.2 }));
      }
      for (let y = 0; y <= h; y += step) {
        strokes.push(...lineStrokes(0, y, w, y, `${seed}:h${y}`, { color, width: 1, wobble: 0.2 }));
      }
      const node = makeNode(action, 'group', strokes, color, store);
      node.priority = 'BACKGROUND';
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.1), layout };
    }

    /* -------------------------------------------------------- lines */
    case 'DRAW_LINE':
    case 'DRAW_RAY':
    case 'DRAW_SEGMENT': {
      const color = colorOf(p, INK.chalk);

      // A line drawn against a shape is a construction, not a floating stroke:
      // resolve it between two of that shape's named anchors so "the height of
      // this triangle" lands on the actual altitude.
      const host = (action.relations ?? [])
        .map((r) => store.resolve(r.target))
        .find((n): n is SceneNode => Boolean(n?.anchors));
      if (host?.anchors) {
        const role = `${action.semanticRole} ${str(p, ['role', 'kind', 'construction'])}`.toLowerCase();
        let a = host.anchors[str(p, ['from', 'fromAnchor', 'start'])];
        let b = host.anchors[str(p, ['to', 'toAnchor', 'end'])];
        if ((!a || !b) && /height|altitude|perpendicular/.test(role)) {
          a = host.anchors.apex;
          b = host.anchors.footOfHeight;
        }
        if (a && b) {
          const ax = host.transform.x + a.x;
          const ay = host.transform.y + a.y;
          const bx = host.transform.x + b.x;
          const by = host.transform.y + b.y;
          const minX = Math.min(ax, bx);
          const minY = Math.min(ay, by);
          const node = makeNode(
            action,
            'line',
            lineStrokes(ax - minX, ay - minY, bx - minX, by - minY, seed, style(color)),
            color,
            store
          );
          node.anchors = {
            start: { x: ax - minX, y: ay - minY },
            end: { x: bx - minX, y: by - minY },
          };
          node.attachedTo = host.id;
          const layout = store.addAt(node, minX, minY);
          return {
            kind: 'draw',
            nodeIds: [node.id],
            duration: pace(action, 0.7),
            layout,
            note: `construction line on ${host.id}`,
          };
        }
      }

      const len = num(p, ['length', 'size'], 220);
      const angle = (num(p, ['angle', 'rotation'], 0) * Math.PI) / 180;
      const orientation = str(p, ['orientation', 'direction']).toLowerCase();
      const a = orientation === 'vertical' ? Math.PI / 2 : angle;
      const node = makeNode(
        action,
        'line',
        lineStrokes(0, 0, Math.cos(a) * len, Math.sin(a) * len, seed, style(color)),
        color
      , store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.7), layout };
    }

    case 'DRAW_ARROW':
    case 'DRAW_DOUBLE_ARROW':
    case 'DRAW_CALLOUT': {
      const color = colorOf(p, INK.chalk);
      const fromNode = store.resolve(str(p, ['from', 'source', 'start']));
      const toNode = store.resolve(str(p, ['to', 'target', 'end']));
      let from: Vec2;
      let to: Vec2;
      if (fromNode && toNode && fromNode.id !== toNode.id) {
        // Anchor the arrow between two real nodes, edge to edge.
        const a = worldBounds(fromNode);
        const b = worldBounds(toNode);
        from = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
        to = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
        const shrink = (pt: Vec2, other: Vec2, box: { w: number; h: number }) => {
          const dx = other.x - pt.x;
          const dy = other.y - pt.y;
          const d = Math.hypot(dx, dy) || 1;
          const r = Math.min(box.w, box.h) / 2 + 8;
          return { x: pt.x + (dx / d) * r, y: pt.y + (dy / d) * r };
        };
        const f2 = shrink(from, to, a);
        const t2 = shrink(to, from, b);
        const strokes = arrowStrokes(
          { x: f2.x - Math.min(f2.x, t2.x), y: f2.y - Math.min(f2.y, t2.y) },
          { x: t2.x - Math.min(f2.x, t2.x), y: t2.y - Math.min(f2.y, t2.y) },
          seed,
          style(color),
          13,
          action.type === 'DRAW_DOUBLE_ARROW'
        );
        const node = makeNode(action, 'arrow', strokes, color, store);
        const layout = store.addAt(node, Math.min(f2.x, t2.x), Math.min(f2.y, t2.y));
        return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.6), layout };
      }
      const len = num(p, ['length', 'magnitude', 'size'], 130);
      const angle = (num(p, ['angle', 'direction'], 0) * Math.PI) / 180;
      const strokes = arrowStrokes(
        { x: 0, y: 0 },
        { x: Math.cos(angle) * len, y: Math.sin(angle) * len },
        seed,
        style(color),
        13,
        action.type === 'DRAW_DOUBLE_ARROW'
      );
      const node = makeNode(action, 'arrow', strokes, color, store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.6), layout };
    }

    case 'DRAW_BRACE': {
      const color = colorOf(p, INK.dim);
      const target = targets(store, action)[0];
      const length = num(p, ['length', 'span'], target ? worldBounds(target).w : 200);
      const side = (str(p, ['side'], 'bottom') as 'top' | 'bottom' | 'left' | 'right') ?? 'bottom';
      const node = makeNode(action, 'marker', braceStrokes(0, 0, length, seed, style(color, 2), side), color, store);
      if (target) node.attachedTo = target.id;
      const layout = target
        ? store.addAt(
            node,
            worldBounds(target).x,
            worldBounds(target).y + worldBounds(target).h + 14
          )
        : store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.8), layout };
    }

    case 'DRAW_DIMENSION': {
      const color = colorOf(p, INK.amber);
      const length = num(p, ['length', 'span'], 200);
      const label = str(p, ['label', 'value', 'text'], '');
      const strokes = arrowStrokes({ x: 0, y: 0 }, { x: length, y: 0 }, seed, style(color, 2), 10, true);
      if (label) {
        const t = textToStrokes(label, FONT.label, `${seed}:lab`, { color, width: 1.8 });
        strokes.push(...translateStrokes(t.strokes, (length - t.width) / 2, -FONT.label * 1.6));
      }
      const node = makeNode(action, 'marker', strokes, color, store);
      const layout = store.add(node, action.relations);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.8), layout };
    }

    /* --------------------------------------------------- data structures */
    case 'DRAW_ARRAY':
      return buildArray(store, action, ctx);

    case 'MARK_LOW':
    case 'MARK_HIGH':
    case 'MARK_MIDPOINT':
    case 'SHOW_ALGORITHM_STEP':
      return buildPointer(store, action, ctx);

    case 'HIGHLIGHT_ARRAY_RANGE':
      return buildRangeHighlight(store, action, ctx);

    case 'CREATE_AXES':
      return buildAxes(store, action, ctx);

    case 'PLOT_FUNCTION':
      return buildPlot(store, action, ctx);

    case 'DRAW_NUMBER_LINE':
      return buildNumberLine(store, action, ctx);

    /* ---------------------------------------------------- domain executors */
    case 'CREATE_VECTOR':
    case 'DRAW_VECTOR':
      return buildVector(store, action, ctx);

    case 'DRAW_TRAJECTORY':
      return buildTrajectory(store, action, ctx);

    case 'SHOW_COMPONENTS':
    case 'DECOMPOSE_VECTOR':
      return buildVectorComponents(store, action, ctx);

    case 'CREATE_FORCE_DIAGRAM':
      return buildForceDiagram(store, action, ctx);

    case 'DRAW_TREE':
      return buildTree(store, action, ctx);

    case 'DRAW_LINKED_LIST':
      return buildLinkedList(store, action, ctx);

    case 'DRAW_STACK':
      return buildStack(store, action, ctx);

    case 'DRAW_QUEUE':
      return buildQueue(store, action, ctx);

    case 'DRAW_POINTER':
      return buildPointer(store, action, ctx);

    case 'CREATE_ATOM':
      return buildAtom(store, action, ctx);

    case 'CREATE_BOND':
    case 'CREATE_REACTION_ARROW':
      return buildReactionArrow(store, action, ctx);

    case 'CREATE_MOLECULE':
      return buildMolecule(store, action, ctx);

    case 'PLOT_POINTS':
      return buildPlotPoints(store, action, ctx);

    case 'SHOW_TANGENT':
      return buildTangent(store, action, ctx);

    case 'SHADE_AREA':
      return buildShadeArea(store, action, ctx);

    /* ------------------------------------------------------- emphasis */
    case 'HIGHLIGHT':
    case 'HIGHLIGHT_TEXT':
    case 'HIGHLIGHT_REGION': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to highlight');
      const color = colorOf(p, INK.amber);
      const created: string[] = [];
      for (const t of marks) {
        const b = worldBounds(t);
        const node = makeNode(
          action,
          'highlight',
          highlightStrokes(0, 0, b.w, b.h, `${seed}:${t.id}`, hexWithAlpha(color, 0.12)),
          color
        , store);
        node.priority = 'BACKGROUND';
        node.attachedTo = t.id;
        store.addAt(node, b.x - 5, b.y - 5);
        created.push(node.id);
      }
      return {
        kind: 'emphasis',
        nodeIds: [...created, ...marks.map((m) => m.id)],
        duration: pace(action, 0.7),
        emphasis: 'highlight',
        note: `highlighted ${marks.map((m) => m.id).join(', ')}`,
      };
    }

    case 'CIRCLE_TERM': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to circle');
      const t = marks[0];
      const b = worldBounds(t);
      const color = colorOf(p, INK.amber);
      const rx = b.w / 2 + 16;
      const ry = b.h / 2 + 14;
      const node = makeNode(
        action,
        'marker',
        ellipseStrokes(rx, ry, rx, ry, seed, style(color, 2.6)),
        color
      , store);
      node.attachedTo = t.id;
      const layout = store.addAt(node, b.x + b.w / 2 - rx, b.y + b.h / 2 - ry);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.85), layout };
    }

    case 'UNDERLINE_TEXT': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to underline');
      const b = worldBounds(marks[0]);
      const color = colorOf(p, INK.blue);
      const node = makeNode(
        action,
        'marker',
        lineStrokes(0, 0, b.w, 0, seed, style(color, 2.6)),
        color
      , store);
      node.attachedTo = marks[0].id;
      const layout = store.addAt(node, b.x, b.y + b.h + 8);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.45), layout };
    }

    case 'STRIKE_TEXT': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to strike');
      const b = worldBounds(marks[0]);
      const color = colorOf(p, INK.red);
      const node = makeNode(
        action,
        'marker',
        lineStrokes(0, 0, b.w + 10, -6, seed, style(color, 2.8)),
        color
      , store);
      node.attachedTo = marks[0].id;
      const layout = store.addAt(node, b.x - 5, b.y + b.h * 0.55);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.4), layout };
    }

    case 'BRACKET_TERM': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to bracket');
      const b = worldBounds(marks[0]);
      const color = colorOf(p, INK.dim);
      const node = makeNode(
        action,
        'marker',
        braceStrokes(0, 0, b.w, seed, style(color, 2), 'bottom'),
        color
      , store);
      node.attachedTo = marks[0].id;
      const layout = store.addAt(node, b.x, b.y + b.h + 10);
      return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.6), layout };
    }

    case 'PULSE':
    case 'FLASH':
    case 'GLOW_EMPHASIS': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to emphasise');
      return {
        kind: 'emphasis',
        nodeIds: marks.map((m) => m.id),
        duration: pace(action, action.type === 'FLASH' ? 0.45 : 0.8),
        emphasis: action.type === 'PULSE' ? 'pulse' : action.type === 'FLASH' ? 'flash' : 'glow',
      };
    }

    case 'DIM_OTHERS': {
      const keep = new Set(targets(store, action).map((t) => t.id));
      const dim = store
        .list()
        .filter((n) => !keep.has(n.id) && n.type !== 'highlight')
        .map((n) => n.id);
      store.setDimmed(dim);
      return { kind: 'dim', nodeIds: dim, duration: pace(action, 0.5), note: `dimmed ${dim.length} node(s)` };
    }

    case 'RESTORE_EMPHASIS':
      store.clearDimmed();
      return { kind: 'dim', nodeIds: [], duration: pace(action, 0.4), note: 'restored emphasis' };

    /* ------------------------------------------------------ visibility */
    case 'FADE_IN':
    case 'REVEAL': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to reveal');
      for (const m of marks) {
        m.visible = true;
        m.drawProgress = 1;
      }
      store.touch();
      return { kind: 'fade', nodeIds: marks.map((m) => m.id), duration: pace(action, 0.6), opacity: 1 };
    }

    case 'FADE_OUT': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to fade');
      return {
        kind: 'fade',
        nodeIds: marks.map((m) => m.id),
        duration: pace(action, 0.6),
        opacity: num(p, ['opacity', 'to'], 0.22),
      };
    }

    case 'HIDE':
    case 'ERASE': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to erase');
      return { kind: 'fade', nodeIds: marks.map((m) => m.id), duration: pace(action, 0.5), opacity: 0 };
    }

    /* ---------------------------------------------------------- motion */
    case 'MOVE_TO':
    case 'MOVE_BY': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to move');
      const node = marks[0];
      let tx = node.transform.x;
      let ty = node.transform.y;
      if (action.type === 'MOVE_BY') {
        tx += num(p, ['dx', 'deltaX'], 0);
        ty += num(p, ['dy', 'deltaY'], 0);
      } else {
        const rel = (action.relations ?? []).find((r) => store.resolve(r.target) && r.target !== node.id);
        const dest = rel ? store.resolve(rel.target) : marks[1];
        if (dest) {
          const b = worldBounds(dest);
          tx = b.x + (b.w - node.localBounds.w) / 2;
          ty = b.y + b.h + 34;
        }
      }
      return {
        kind: 'move',
        nodeIds: [node.id],
        duration: pace(action, 0.8),
        to: { x: tx, y: ty },
      };
    }

    case 'SCALE_TO': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to scale');
      return {
        kind: 'scale',
        nodeIds: marks.map((m) => m.id),
        duration: pace(action, 0.7),
        to: { scale: Math.max(0.1, Math.min(4, num(p, ['scale', 'factor', 'to'], 1.2))) },
      };
    }

    case 'ROTATE_TO':
    case 'ROTATE_BY': {
      const marks = targets(store, action);
      if (marks.length === 0) return miss(action, 'no target to rotate');
      const deg = num(p, ['angle', 'degrees', 'delta'], 90);
      const base = action.type === 'ROTATE_BY' ? (marks[0].transform.rotation * 180) / Math.PI : 0;
      return {
        kind: 'rotate',
        nodeIds: marks.map((m) => m.id),
        duration: pace(action, 0.8),
        to: { rotation: ((base + deg) * Math.PI) / 180 },
      };
    }

    case 'TRANSFORM':
    case 'MORPH': {
      // A validated transform: fade the source out where it stands and write
      // the replacement below it, so the learner sees the derivation, not a
      // teleport.
      const marks = targets(store, action);
      const text = str(p, ['to', 'after', 'target', 'expression', 'result', 'text'], '');
      if (!text) {
        if (marks.length === 0) return miss(action, 'nothing to transform');
        return { kind: 'fade', nodeIds: [marks[0].id], duration: pace(action, 0.5), opacity: 0.3 };
      }
      const relations = marks.length
        ? [{ type: 'BELOW', target: marks[0].id, gap: 'normal' as const }]
        : action.relations;
      const built = buildText(
        store,
        { ...action, relations },
        ctx,
        text,
        num(p, ['fontSize'], FONT.equation),
        colorOf(p, INK.chalk),
        'equation'
      );
      return { ...built, note: `transformed into "${text}"` };
    }

    /* ---------------------------------------------------------- camera */
    case 'CAMERA_ESTABLISH':
    case 'CAMERA_FIT': {
      const marks = targets(store, action);
      const b = store.contentBounds(marks.length ? marks.map((m) => m.id) : undefined);
      if (!b) return { kind: 'wait', nodeIds: [], duration: 0 };
      return {
        kind: 'camera',
        nodeIds: [],
        duration: pace(action, 1.0),
        camera: cameraForBounds(b, ctx.viewport, 110, 1.25),
      };
    }

    case 'CAMERA_FOCUS':
    case 'CAMERA_DETAIL':
    case 'CAMERA_FOLLOW':
    case 'CAMERA_REVEAL':
    case 'CAMERA_COMPARE': {
      const marks = targets(store, action);
      if (marks.length === 0) return { kind: 'wait', nodeIds: [], duration: 0.2 };
      const b = store.contentBounds(marks.map((m) => m.id));
      if (!b) return { kind: 'wait', nodeIds: [], duration: 0.2 };
      const maxZoom = action.type === 'CAMERA_DETAIL' ? 2.2 : 1.35;
      return {
        kind: 'camera',
        nodeIds: [],
        duration: pace(action, 0.9),
        camera: cameraForBounds(b, ctx.viewport, action.type === 'CAMERA_DETAIL' ? 60 : 150, maxZoom),
      };
    }

    case 'CAMERA_PAN': {
      const marks = targets(store, action);
      const b = marks.length ? store.contentBounds(marks.map((m) => m.id)) : null;
      const cam: Camera = b
        ? { x: b.x + b.w / 2, y: b.y + b.h / 2, zoom: store.camera.zoom }
        : {
            x: store.camera.x + num(p, ['offsetX', 'dx'], 250),
            y: store.camera.y + num(p, ['offsetY', 'dy'], 0),
            zoom: store.camera.zoom,
          };
      return { kind: 'camera', nodeIds: [], duration: pace(action, 0.9), camera: cam };
    }

    case 'CAMERA_ZOOM': {
      const factor = num(p, ['factor', 'zoom', 'level'], 1.3);
      return {
        kind: 'camera',
        nodeIds: [],
        duration: pace(action, 0.8),
        camera: {
          x: store.camera.x,
          y: store.camera.y,
          zoom: Math.max(0.25, Math.min(3, factor > 0 ? factor : 1)),
        },
      };
    }

    case 'CAMERA_RESET': {
      const b = store.contentBounds();
      return {
        kind: 'camera',
        nodeIds: [],
        duration: pace(action, 0.9),
        camera: b ? cameraForBounds(b, ctx.viewport, 120, 1.1) : { x: 800, y: 450, zoom: 1 },
      };
    }

    /* -------------------------------------------------------- timeline */
    case 'WAIT':
      return { kind: 'wait', nodeIds: [], duration: pace(action, num(p, ['duration', 'seconds'], 0.7)) };

    case 'SECTION_START':
    case 'SECTION_END':
      return { kind: 'instant', nodeIds: [], duration: 0, note: `${action.type} ${str(p, ['sectionId'], '')}` };

    case 'CREATE_BENZENE':
      return buildBenzene(store, action, ctx);
    case 'SHOW_PI_CLOUD':
    case 'ANIMATE_ELECTRON_DELOCALIZATION':
      return buildPiCloud(store, action, ctx);
    case 'SHOW_RESONANCE': {
      const marks = targets(store, action);
      if (marks.length === 0) return buildBenzene(store, action, ctx);
      return { kind: 'emphasis', nodeIds: marks.map((m) => m.id), duration: pace(action, 0.8), emphasis: 'pulse' };
    }
    case 'SUBSTITUTE_GROUP':
      return buildSubstituteGroup(store, action, ctx);

    case 'CREATE_BLOCK':
      return buildPhysicsBlock(store, action, ctx);
    case 'SHOW_FORCE':
      return buildPhysicsForce(store, action, ctx);
    case 'CALCULATE_NORMAL_FORCE':
    case 'CALCULATE_FRICTION':
    case 'CALCULATE_NET_FORCE':
    case 'APPLY_NEWTON_SECOND_LAW':
      return buildPhysicsEquation(store, action, ctx);
    case 'ANIMATE_ACCELERATION':
      return buildPhysicsAcceleration(store, action, ctx);

    case 'CREATE_RIEMANN_SUM':
      return buildRiemannSum(store, action, ctx);
    case 'REFINE_PARTITIONS':
      return buildRefinedPartitions(store, action, ctx);
    case 'SHOW_AREA':
      return buildCalculusArea(store, action, ctx);
    case 'SHOW_ANTIDERIVATIVE':
      return buildAntiderivative(store, action, ctx);
    case 'EVALUATE_BOUNDS':
      return buildEvaluateBounds(store, action, ctx);

    default:
      // Unreachable for validated actions; kept so a registry change surfaces
      // as an explicit failure rather than a silent no-op.
      return miss(action, `no executor for ${action.type}`);
  }
}

function miss(action: VisualAction, note: string): ActionOutcome {
  return { kind: 'instant', nodeIds: [], duration: 0, note: `${action.type}: ${note}` };
}

function hexWithAlpha(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/* --------------------------------------------------- composite builders */

const CELL = { w: 78, h: 78, gap: 8 };

function buildArray(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const raw = list(p, ['values', 'items', 'array', 'elements', 'data']);
  const values = (raw.length ? raw : [3, 7, 10, 14, 18, 21, 27]).map((v) => String(v));
  const color = colorOf(p, INK.chalk);
  const showIndices = p.showIndices !== false;

  const strokes: InkStroke[] = [];
  const anchors: Record<string, Vec2> = {};
  values.forEach((v, i) => {
    const x = i * (CELL.w + CELL.gap);
    strokes.push(...rectStrokes(x, 0, CELL.w, CELL.h, `${seed}:c${i}`, { color, width: 2.2 }));
    const t = textToStrokes(v, FONT.cell, `${seed}:v${i}`, { color, width: 2.4 });
    strokes.push(
      ...translateStrokes(t.strokes, x + (CELL.w - t.width) / 2, (CELL.h - FONT.cell) / 2 - 2)
    );
    if (showIndices) {
      const idx = textToStrokes(String(i), 15, `${seed}:i${i}`, { color: INK.dim, width: 1.5 });
      strokes.push(
        ...translateStrokes(idx.strokes, x + (CELL.w - idx.width) / 2, CELL.h + 10)
      );
    }
    anchors[`cell${i}`] = { x: x + CELL.w / 2, y: CELL.h / 2 };
    anchors[`cell${i}.top`] = { x: x + CELL.w / 2, y: 0 };
    anchors[`cell${i}.bottom`] = { x: x + CELL.w / 2, y: CELL.h };
  });

  const node = makeNode(action, 'array', strokes, color, store);
  node.priority = action.priority ?? 'PRIMARY';
  node.anchors = anchors;
  // The array joins the writing flow like everything else, so a lesson reads as
  // one column rather than text on the left and a diagram floating right. It
  // needs headroom, though: low/high pointers and a target label live above it.
  if (!action.relations?.length) store.reserveFlow(120);
  const layout = store.add(node, action.relations);
  return {
    kind: 'draw',
    nodeIds: [node.id],
    duration: pace(action, Math.min(4, 0.5 + values.length * 0.28)),
    layout,
    note: `array [${values.join(', ')}]`,
  };
}

/** Pointer + label under or over an array cell (MARK_LOW/HIGH/MIDPOINT). */
function buildPointer(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const arrayNode =
    store.resolve(str(p, ['array', 'arrayId', 'target'])) ??
    store.list().find((n) => n.type === 'array');
  const index = Math.max(0, num(p, ['index', 'i', 'position', 'cell'], 0));

  const defaults: Record<string, { label: string; color: string; above: boolean }> = {
    MARK_LOW: { label: 'low', color: INK.blue, above: true },
    MARK_HIGH: { label: 'high', color: INK.violet, above: true },
    MARK_MIDPOINT: { label: 'mid', color: INK.amber, above: false },
    SHOW_ALGORITHM_STEP: { label: 'step', color: INK.green, above: false },
  };
  const d = defaults[action.type] ?? defaults.SHOW_ALGORITHM_STEP;
  const label = str(p, ['label', 'text', 'name'], d.label);
  const color = colorOf(p, d.color);
  const above = p.above !== undefined ? Boolean(p.above) : d.above;

  if (!arrayNode) {
    // No array on the board: still say something rather than dropping silently.
    return buildText(store, action, ctx, `${label} = ${index}`, FONT.label, color);
  }

  const anchorKey = above ? `cell${index}.top` : `cell${index}.bottom`;
  const anchor = arrayNode.anchors?.[anchorKey];
  if (!anchor) return miss(action, `array has no cell ${index}`);
  const world = {
    x: arrayNode.transform.x + anchor.x,
    y: arrayNode.transform.y + anchor.y,
  };

  const shaft = 40;
  const strokes: InkStroke[] = [];
  const t = textToStrokes(label, FONT.label, `${seed}:lab`, { color, width: 2 });
  if (above) {
    // Arrow points down at the cell, label sits above the arrow.
    strokes.push(
      ...arrowStrokes({ x: 0, y: 0 }, { x: 0, y: shaft }, `${seed}:arr`, { color, width: 2.4 }, 10)
    );
    strokes.push(...translateStrokes(t.strokes, -t.width / 2, -FONT.label * 1.5));
  } else {
    strokes.push(
      ...arrowStrokes({ x: 0, y: shaft }, { x: 0, y: 0 }, `${seed}:arr`, { color, width: 2.4 }, 10)
    );
    strokes.push(...translateStrokes(t.strokes, -t.width / 2, shaft + 8));
  }

  const node = makeNode(action, 'marker', strokes, color, store);
  node.priority = action.priority ?? 'SECONDARY';
  node.attachedTo = arrayNode.id;
  const built = normaliseToOrigin(strokes);
  const layout = store.addAt(
    node,
    world.x - built.w / 2,
    above ? world.y - built.h - 10 : world.y + 10
  );
  return {
    kind: 'draw',
    nodeIds: [node.id],
    duration: pace(action, 0.6),
    layout,
    note: `${label} -> index ${index}`,
  };
}

function buildRangeHighlight(
  store: SceneStore,
  action: VisualAction,
  ctx: ExecContext
): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const arrayNode =
    store.resolve(str(p, ['array', 'arrayId', 'target'])) ??
    store.list().find((n) => n.type === 'array');
  if (!arrayNode) return miss(action, 'no array to highlight');
  const low = Math.max(0, num(p, ['low', 'from', 'start'], 0));
  const high = Math.max(low, num(p, ['high', 'to', 'end'], low));
  const a = arrayNode.anchors?.[`cell${low}.top`];
  const b = arrayNode.anchors?.[`cell${high}.bottom`];
  if (!a || !b) return miss(action, `array has no range ${low}..${high}`);

  const mode = str(p, ['mode', 'style'], 'keep').toLowerCase();
  const color = colorOf(p, mode === 'discard' || mode === 'eliminate' ? INK.red : INK.green);
  const x = arrayNode.transform.x + a.x - CELL.w / 2 - 4;
  const y = arrayNode.transform.y + a.y - 4;
  const w = b.x - a.x + CELL.w + 8;
  const h = CELL.h + 8;

  const node = makeNode(
    action,
    'highlight',
    highlightStrokes(0, 0, w, h, seed, hexWithAlpha(color, mode === 'discard' ? 0.13 : 0.2)),
    color
  , store);
  node.priority = 'BACKGROUND';
  node.attachedTo = arrayNode.id;
  const layout = store.addAt(node, x, y);
  return {
    kind: 'emphasis',
    nodeIds: [node.id],
    duration: pace(action, 0.65),
    emphasis: 'highlight',
    layout,
    note: `range ${low}..${high} (${mode})`,
  };
}

function buildAxes(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.dim);
  const w = num(p, ['width'], 380);
  const h = num(p, ['height'], 300);
  const strokes: InkStroke[] = [];
  strokes.push(...arrowStrokes({ x: 0, y: h / 2 }, { x: w, y: h / 2 }, `${seed}:x`, { color, width: 2 }, 10));
  strokes.push(...arrowStrokes({ x: w / 2, y: h }, { x: w / 2, y: 0 }, `${seed}:y`, { color, width: 2 }, 10));
  const node = makeNode(action, 'axes', strokes, color, store);
  node.anchors = { origin: { x: w / 2, y: h / 2 } };
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.0), layout };
}

/**
 * Plot a function. Only a fixed, safe set of shapes is supported — the model
 * names one, it never supplies an expression we evaluate.
 */
function buildPlot(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.blue);
  const expr = str(p, ['expression', 'function', 'fn', 'shape'], 'linear').toLowerCase();
  const w = num(p, ['width'], 360);
  const h = num(p, ['height'], 240);

  const shape = (t: number): number => {
    // t in 0..1 across the plot, returns 0..1 from the bottom.
    if (expr.includes('log')) return Math.log(1 + t * 9) / Math.log(10);
    if (expr.includes('x^2') || expr.includes('quad') || expr.includes('square')) return t * t;
    if (expr.includes('x^3') || expr.includes('cubic')) return t * t * t;
    if (expr.includes('sin')) return 0.5 + 0.45 * Math.sin(t * Math.PI * 2);
    if (expr.includes('cos')) return 0.5 + 0.45 * Math.cos(t * Math.PI * 2);
    if (expr.includes('exp') || expr.includes('2^')) return (Math.pow(2, t * 4) - 1) / 15;
    if (expr.includes('sqrt')) return Math.sqrt(t);
    if (expr.includes('1/') || expr.includes('inverse')) return 1 / (1 + t * 6);
    return t; // linear
  };

  const pts: Pt[] = [];
  const steps = 48;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([t * w, h - Math.max(0, Math.min(1, shape(t))) * h]);
  }
  const node = makeNode(action, 'group', polylineStrokes(pts, seed, { color, width: 2.8 }), color, store);
  const layout = store.add(node, action.relations);
  return {
    kind: 'draw',
    nodeIds: [node.id],
    duration: pace(action, 1.4),
    layout,
    note: `plotted ${expr}`,
  };
}

function buildNumberLine(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.chalk);
  const from = num(p, ['from', 'min', 'start'], 0);
  const to = num(p, ['to', 'max', 'end'], 10);
  const stepCount = Math.max(1, Math.min(24, Math.round(to - from)));
  const w = num(p, ['width'], 480);
  const strokes: InkStroke[] = [];
  strokes.push(...arrowStrokes({ x: 0, y: 0 }, { x: w, y: 0 }, `${seed}:line`, { color, width: 2.2 }, 10, true));
  for (let i = 0; i <= stepCount; i++) {
    const x = (i / stepCount) * w;
    strokes.push(...lineStrokes(x, -7, x, 7, `${seed}:t${i}`, { color, width: 1.8 }));
    const label = String(Math.round(from + (i / stepCount) * (to - from)));
    const t = textToStrokes(label, 16, `${seed}:l${i}`, { color: INK.dim, width: 1.5 });
    strokes.push(...translateStrokes(t.strokes, x - t.width / 2, 14));
  }
  const node = makeNode(action, 'group', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.6), layout };
}

/* ---------------------------------------------------- domain builders */

function buildVector(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.amber);
  const label = str(p, ['label', 'name', 'text'], 'v');
  const mag = num(p, ['magnitude', 'length', 'size'], 130);
  const angleDeg = num(p, ['angle', 'direction'], 30);
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * mag;
  const dy = -Math.sin(rad) * mag;

  const strokes: InkStroke[] = [];
  strokes.push(...arrowStrokes({ x: 0, y: 0 }, { x: dx, y: dy }, `${seed}:v`, { color, width: 2.8 }, 12));
  if (label) {
    const t = textToStrokes(label, 20, `${seed}:lbl`, { color, width: 2 });
    strokes.push(...translateStrokes(t.strokes, dx / 2 - t.width / 2, dy / 2 - 20));
  }

  const node = makeNode(action, 'vector', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.8), layout, note: `vector ${label}` };
}

function buildVectorComponents(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.blue);
  const mag = num(p, ['magnitude', 'length'], 130);
  const angleDeg = num(p, ['angle'], 35);
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * mag;
  const dy = -Math.sin(rad) * mag;

  const strokes: InkStroke[] = [];
  strokes.push(...arrowStrokes({ x: 0, y: 0 }, { x: dx, y: dy }, `${seed}:main`, { color: INK.amber, width: 2.8 }, 12));
  strokes.push(...lineStrokes(0, 0, dx, 0, `${seed}:vx`, { color: INK.blue, width: 2 }));
  const tVx = textToStrokes('Vx', 18, `${seed}:lblVx`, { color: INK.blue, width: 1.8 });
  strokes.push(...translateStrokes(tVx.strokes, dx / 2 - tVx.width / 2, 12));
  strokes.push(...lineStrokes(dx, 0, dx, dy, `${seed}:vy`, { color: INK.cyan, width: 2 }));
  const tVy = textToStrokes('Vy', 18, `${seed}:lblVy`, { color: INK.cyan, width: 1.8 });
  strokes.push(...translateStrokes(tVy.strokes, dx + 8, dy / 2 - 9));

  const node = makeNode(action, 'vector', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.1), layout, note: 'decomposed vector components' };
}

function buildTrajectory(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.cyan);
  const w = num(p, ['width', 'range'], 340);
  const h = num(p, ['height', 'apex'], 140);
  const pts: Pt[] = [];
  const steps = 30;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * w;
    const y = 4 * h * t * (1 - t);
    pts.push([x, -y]);
  }
  const strokes: InkStroke[] = [];
  strokes.push(...polylineStrokes(pts, `${seed}:t`, { color, width: 2.4 }));
  const pLast = pts[steps];
  const pPrev = pts[steps - 2];
  strokes.push(...arrowStrokes({ x: pPrev[0], y: pPrev[1] }, { x: pLast[0], y: pLast[1] }, `${seed}:head`, { color, width: 2.4 }, 8));

  const node = makeNode(action, 'path', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.2), layout, note: 'trajectory arc' };
}

function buildForceDiagram(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.chalk);
  const boxW = 80;
  const boxH = 80;
  const strokes: InkStroke[] = [];
  strokes.push(...rectStrokes(0, 0, boxW, boxH, `${seed}:box`, { color, width: 2.4 }));

  const forces = [
    { label: 'Fg', dx: 0, dy: 75, color: INK.red },
    { label: 'Fn', dx: 0, dy: -75, color: INK.blue },
    { label: 'Fa', dx: 85, dy: 0, color: INK.amber },
    { label: 'Ff', dx: -85, dy: 0, color: INK.violet },
  ];
  forces.forEach((f, i) => {
    const start = { x: boxW / 2, y: boxH / 2 };
    const end = { x: start.x + f.dx, y: start.y + f.dy };
    strokes.push(...arrowStrokes(start, end, `${seed}:f${i}`, { color: f.color, width: 2.4 }, 10));
    const t = textToStrokes(f.label, 18, `${seed}:fl${i}`, { color: f.color, width: 1.8 });
    strokes.push(...translateStrokes(t.strokes, end.x + (f.dx > 0 ? 8 : f.dx < 0 ? -t.width - 8 : -t.width / 2), end.y + (f.dy > 0 ? 12 : f.dy < 0 ? -24 : -8)));
  });

  const node = makeNode(action, 'diagram', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.5), layout, note: 'force diagram' };
}

function buildTree(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.chalk);
  const rawNodes = list(p, ['nodes', 'tree', 'values', 'data']);
  const values = (rawNodes.length ? rawNodes : [10, 5, 15, 2, 7]).map(String);

  const strokes: InkStroke[] = [];
  const radius = 22;
  const positions: Array<{ x: number; y: number; val: string }> = [];

  if (values[0]) positions.push({ x: 120, y: 30, val: values[0] });
  if (values[1]) positions.push({ x: 50, y: 110, val: values[1] });
  if (values[2]) positions.push({ x: 190, y: 110, val: values[2] });
  if (values[3]) positions.push({ x: 20, y: 190, val: values[3] });
  if (values[4]) positions.push({ x: 80, y: 190, val: values[4] });

  const edges = [[0, 1], [0, 2], [1, 3], [1, 4]];
  edges.forEach(([pIdx, cIdx], i) => {
    if (positions[pIdx] && positions[cIdx]) {
      const p1 = positions[pIdx];
      const p2 = positions[cIdx];
      strokes.push(...lineStrokes(p1.x, p1.y, p2.x, p2.y, `${seed}:e${i}`, { color: INK.dim, width: 1.8 }));
    }
  });

  positions.forEach((pos, i) => {
    strokes.push(...circleStrokes(pos.x, pos.y, radius, `${seed}:n${i}`, { color, width: 2.2 }));
    const t = textToStrokes(pos.val, 18, `${seed}:tv${i}`, { color: INK.amber, width: 1.8 });
    strokes.push(...translateStrokes(t.strokes, pos.x - t.width / 2, pos.y - 9));
  });

  const node = makeNode(action, 'tree', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.4), layout, note: 'binary tree' };
}

function buildLinkedList(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.chalk);
  const rawNodes = list(p, ['nodes', 'list', 'values', 'data']);
  const values = (rawNodes.length ? rawNodes : ['A', 'B', 'C', 'null']).map(String);

  const strokes: InkStroke[] = [];
  const w = 70;
  const h = 44;
  const gap = 45;

  values.forEach((v, i) => {
    const x = i * (w + gap);
    strokes.push(...rectStrokes(x, 0, w * 0.65, h, `${seed}:d${i}`, { color, width: 2 }));
    const t = textToStrokes(v, 20, `${seed}:tv${i}`, { color: INK.blue, width: 2 });
    strokes.push(...translateStrokes(t.strokes, x + (w * 0.65 - t.width) / 2, (h - 20) / 2));

    strokes.push(...rectStrokes(x + w * 0.65, 0, w * 0.35, h, `${seed}:nx${i}`, { color: INK.dim, width: 1.8 }));
    strokes.push(...circleStrokes(x + w * 0.82, h / 2, 4, `${seed}:dot${i}`, { color: INK.amber, width: 2 }));

    if (i < values.length - 1) {
      strokes.push(...arrowStrokes({ x: x + w * 0.82, y: h / 2 }, { x: x + w + gap - 4, y: h / 2 }, `${seed}:arr${i}`, { color: INK.amber, width: 2 }, 8));
    }
  });

  const node = makeNode(action, 'linked_list', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.4), layout, note: 'linked list' };
}

function buildStack(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.chalk);
  const rawNodes = list(p, ['items', 'values', 'stack']);
  const values = (rawNodes.length ? rawNodes : ['bottom', 'mid', 'top']).map(String);

  const strokes: InkStroke[] = [];
  const w = 120;
  const h = 40;

  values.forEach((v, i) => {
    const y = (values.length - 1 - i) * (h + 6);
    strokes.push(...rectStrokes(0, y, w, h, `${seed}:c${i}`, { color, width: 2 }));
    const t = textToStrokes(v, 18, `${seed}:tv${i}`, { color: INK.green, width: 1.8 });
    strokes.push(...translateStrokes(t.strokes, (w - t.width) / 2, y + (h - 18) / 2));
  });

  const node = makeNode(action, 'stack', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.2), layout, note: 'stack data structure' };
}

function buildQueue(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.chalk);
  const rawNodes = list(p, ['items', 'values', 'queue']);
  const values = (rawNodes.length ? rawNodes : ['head', '2', '3', 'tail']).map(String);

  const strokes: InkStroke[] = [];
  const w = 55;
  const h = 48;

  values.forEach((v, i) => {
    const x = i * (w + 4);
    strokes.push(...rectStrokes(x, 0, w, h, `${seed}:q${i}`, { color, width: 2 }));
    const t = textToStrokes(v, 18, `${seed}:tv${i}`, { color: INK.cyan, width: 1.8 });
    strokes.push(...translateStrokes(t.strokes, x + (w - t.width) / 2, (h - 18) / 2));
  });

  const node = makeNode(action, 'queue', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.2), layout, note: 'queue data structure' };
}

function buildAtom(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const symbol = str(p, ['symbol', 'element', 'name'], 'H');
  const color = colorOf(p, symbol === 'O' ? INK.red : symbol === 'N' ? INK.blue : INK.chalk);
  const radius = 28;

  const strokes: InkStroke[] = [];
  strokes.push(...circleStrokes(radius, radius, radius, `${seed}:c`, { color, width: 2.4 }));
  const t = textToStrokes(symbol, 24, `${seed}:sym`, { color, width: 2.2 });
  strokes.push(...translateStrokes(t.strokes, radius - t.width / 2, radius - 12));

  const node = makeNode(action, 'atom', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.6), layout, note: `atom ${symbol}` };
}

function buildMolecule(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const formula = str(p, ['formula', 'molecule', 'name'], 'H2O');
  const color = colorOf(p, INK.chalk);

  const strokes: InkStroke[] = [];
  const r = 24;
  strokes.push(...circleStrokes(80, 40, r, `${seed}:o`, { color: INK.red, width: 2.4 }));
  const tO = textToStrokes('O', 22, `${seed}:to`, { color: INK.red, width: 2.2 });
  strokes.push(...translateStrokes(tO.strokes, 80 - tO.width / 2, 40 - 11));

  strokes.push(...circleStrokes(20, 90, r * 0.75, `${seed}:h1`, { color: INK.chalk, width: 2.2 }));
  const tH1 = textToStrokes('H', 18, `${seed}:th1`, { color: INK.chalk, width: 1.8 });
  strokes.push(...translateStrokes(tH1.strokes, 20 - tH1.width / 2, 90 - 9));

  strokes.push(...circleStrokes(140, 90, r * 0.75, `${seed}:h2`, { color: INK.chalk, width: 2.2 }));
  const tH2 = textToStrokes('H', 18, `${seed}:th2`, { color: INK.chalk, width: 1.8 });
  strokes.push(...translateStrokes(tH2.strokes, 140 - tH2.width / 2, 90 - 9));

  strokes.push(...lineStrokes(62, 52, 34, 76, `${seed}:b1`, { color: INK.dim, width: 2 }));
  strokes.push(...lineStrokes(98, 52, 126, 76, `${seed}:b2`, { color: INK.dim, width: 2 }));

  const node = makeNode(action, 'molecule', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.2), layout, note: `molecule ${formula}` };
}

function buildReactionArrow(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.amber);
  const len = num(p, ['length', 'width'], 160);
  const label = str(p, ['label', 'text', 'catalyst'], '');

  const strokes: InkStroke[] = [];
  strokes.push(...arrowStrokes({ x: 0, y: 0 }, { x: len, y: 0 }, `${seed}:rxn`, { color, width: 2.4 }, 12));
  if (label) {
    const t = textToStrokes(label, 16, `${seed}:lbl`, { color, width: 1.5 });
    strokes.push(...translateStrokes(t.strokes, (len - t.width) / 2, -20));
  }

  const node = makeNode(action, 'reaction', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.7), layout, note: 'reaction arrow' };
}

function buildPlotPoints(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.amber);
  const rawPoints = list(p, ['points', 'data', 'pts']);
  const points = (rawPoints.length ? rawPoints : [[20, 180], [80, 140], [140, 100], [200, 60], [260, 20]]).map(
    (pt) => (Array.isArray(pt) ? [Number(pt[0]), Number(pt[1])] : [0, 0])
  );

  const strokes: InkStroke[] = [];
  points.forEach(([px, py], i) => {
    strokes.push(...circleStrokes(px, py, 4, `${seed}:pt${i}`, { color, width: 2 }));
  });

  const node = makeNode(action, 'points', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.9), layout, note: 'plotted points' };
}

function buildTangent(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.red);
  const len = num(p, ['length', 'span'], 180);
  const slope = num(p, ['slope', 'm'], -0.5);

  const dx = len / 2;
  const dy = dx * slope;
  const strokes: InkStroke[] = [];
  strokes.push(...lineStrokes(-dx, -dy, dx, dy, `${seed}:tangent`, { color, width: 2.4 }));

  const node = makeNode(action, 'marker', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.7), layout, note: 'tangent line' };
}

function buildShadeArea(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.blue);
  const w = num(p, ['width'], 200);
  const h = num(p, ['height'], 120);

  const stroke = highlightStrokes(0, 0, w, h, seed, hexWithAlpha(color, 0.15));
  const node = makeNode(action, 'highlight', stroke, color, store);
  node.priority = 'BACKGROUND';
  const layout = store.add(node, action.relations);
  return { kind: 'emphasis', nodeIds: [node.id], duration: pace(action, 0.8), emphasis: 'highlight', layout, note: 'shaded area' };
}

function buildBenzene(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const representation = str(p, ['representation', 'type', 'mode'], 'kekule');
  const color = colorOf(p, INK.chalk);
  const radius = 90;
  const cx = 130;
  const cy = 130;

  const strokes: InkStroke[] = [];
  const vertices: Array<[number, number]> = [];
  const angles = [30, 90, 150, 210, 270, 330];

  for (let i = 0; i < 6; i++) {
    const rad = (angles[i] * Math.PI) / 180;
    vertices.push([cx + radius * Math.cos(rad), cy - radius * Math.sin(rad)]);
  }

  // Hexagon carbon ring
  for (let i = 0; i < 6; i++) {
    const v1 = vertices[i];
    const v2 = vertices[(i + 1) % 6];
    strokes.push(...lineStrokes(v1[0], v1[1], v2[0], v2[1], `${seed}:e${i}`, { color, width: 2.6 }));
  }

  // Kekule double bonds or aromatic inner ring
  if (representation === 'kekule') {
    for (const i of [0, 2, 4]) {
      const v1 = vertices[i];
      const v2 = vertices[(i + 1) % 6];
      const dx = v2[0] - v1[0];
      const dy = v2[1] - v1[1];
      const len = Math.hypot(dx, dy) || 1;
      const nx = -(dy / len) * 10;
      const ny = (dx / len) * 10;
      strokes.push(
        ...lineStrokes(
          v1[0] + nx,
          v1[1] + ny,
          v2[0] + nx,
          v2[1] + ny,
          `${seed}:db${i}`,
          { color: INK.amber, width: 2.2 }
        )
      );
    }
  } else if (representation === 'aromatic' || representation === 'delocalized') {
    strokes.push(...circleStrokes(cx, cy, radius * 0.58, `${seed}:aromatic`, { color: INK.amber, width: 2.4 }));
  }

  // C and H labels
  for (let i = 0; i < 6; i++) {
    const [vx, vy] = vertices[i];
    const dx = vx - cx;
    const dy = vy - cy;
    const len = Math.hypot(dx, dy) || 1;
    const hx = vx + (dx / len) * 32;
    const hy = vy + (dy / len) * 32;

    strokes.push(...lineStrokes(vx, vy, hx, hy, `${seed}:hb${i}`, { color: INK.dim, width: 1.6 }));
    const tH = textToStrokes('H', 15, `${seed}:h${i}`, { color: INK.blue, width: 1.6 });
    strokes.push(...translateStrokes(tH.strokes, hx - tH.width / 2, hy - 7));
  }

  const node = makeNode(action, 'molecule', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.5), layout, note: 'benzene structure' };
}

function buildPiCloud(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.amber);

  const strokes: InkStroke[] = [];
  strokes.push(...circleStrokes(110, 110, 100, `${seed}:outer`, { color: INK.cyan, width: 1.8 }));
  strokes.push(...circleStrokes(110, 110, 58, `${seed}:inner`, { color, width: 2.4 }));

  const node = makeNode(action, 'highlight', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.1), layout, note: 'pi electron cloud' };
}

function buildSubstituteGroup(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const substituent = str(p, ['with', 'substituent', 'group', 'label'], 'X');
  const color = colorOf(p, INK.amber);

  const strokes: InkStroke[] = [];
  strokes.push(...lineStrokes(50, 50, 50, 8, `${seed}:sb`, { color: INK.chalk, width: 2.4 }));
  const tSub = textToStrokes(substituent, 20, `${seed}:sub`, { color, width: 2.2 });
  strokes.push(...translateStrokes(tSub.strokes, 50 - tSub.width / 2, -12));

  const node = makeNode(action, 'atom', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 0.8), layout, note: `substituent ${substituent}` };
}

function buildPhysicsBlock(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.amber);
  const massLabel = str(p, ['label', 'mass', 'text'], '2 kg');

  const strokes: InkStroke[] = [];
  // Ground surface line
  strokes.push(...lineStrokes(-80, 110, 320, 110, `${seed}:ground`, { color: INK.dim, width: 3 }));
  // Square block (140x110)
  strokes.push(...rectStrokes(20, 0, 140, 110, `${seed}:blockRect`, { color, width: 2.8 }));
  // Block text (mass) inside block
  const t = textToStrokes(massLabel, 22, `${seed}:label`, { color: INK.chalk, width: 2.2 });
  strokes.push(...translateStrokes(t.strokes, 90 - t.width / 2, 42));

  const node = makeNode(action, 'rectangle', strokes, color, store);
  node.anchors = {
    center: { x: 90, y: 55 },
    top: { x: 90, y: 0 },
    bottom: { x: 90, y: 110 },
    left: { x: 20, y: 55 },
    right: { x: 160, y: 55 },
  };
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.2), layout, note: `physics block ${massLabel}` };
}

function buildPhysicsForce(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.cyan);
  const label = str(p, ['label', 'text', 'magnitude'], '10 N at 30°');

  const strokes: InkStroke[] = [];
  // Arrow angled at 30 degrees (dx = 160, dy = -92)
  strokes.push(...arrowStrokes({ x: 0, y: 0 }, { x: 160, y: -92 }, `${seed}:arrow`, { color, width: 2.8 }, 12));
  // Arc for 30 deg angle
  strokes.push(...arcStrokes(45, 45, 45, -Math.PI / 6, 0, `${seed}:arc`, { color: INK.amber, width: 1.8 }));
  // Angle text label
  const tAngle = textToStrokes('30°', 16, `${seed}:ang`, { color: INK.amber, width: 1.8 });
  strokes.push(...translateStrokes(tAngle.strokes, 54, -22));
  // Force label
  const tLbl = textToStrokes(label, 18, `${seed}:lbl`, { color, width: 2.0 });
  strokes.push(...translateStrokes(tLbl.strokes, 90, -110));

  const node = makeNode(action, 'vector', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.0), layout, note: `applied force ${label}` };
}

function buildPhysicsEquation(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const eq = str(p, ['equation', 'expression', 'text', 'result'], 'F = ma');
  const result = str(p, ['result', 'answer', 'value'], '');
  const display = result && !eq.includes(result) ? `${eq} = ${result}` : eq;
  const color = colorOf(p, INK.chalk);

  return buildText(store, action, ctx, display, FONT.equation, color, 'equation');
}

function buildPhysicsAcceleration(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const acc = str(p, ['acceleration', 'result', 'value'], 'a ≈ 2.87 m/s²');
  const color = colorOf(p, INK.green);

  const strokes: InkStroke[] = [];
  // Motion arrow pointing RIGHT
  strokes.push(...arrowStrokes({ x: 0, y: 0 }, { x: 180, y: 0 }, `${seed}:motion`, { color, width: 3.2 }, 14));
  // Acceleration text
  const tAcc = textToStrokes(`a ≈ 2.87 m/s² (Right)`, 20, `${seed}:acc`, { color, width: 2.2 });
  strokes.push(...translateStrokes(tAcc.strokes, 10, -28));

  const node = makeNode(action, 'vector', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.1), layout, note: `acceleration ${acc}` };
}

function buildRiemannSum(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const partitions = num(p, ['partitions', 'n', 'count'], 12);
  const color = colorOf(p, INK.amber);

  const strokes: InkStroke[] = [];
  const ox = 40;
  const oy = 200;
  const scaleX = 100;
  const scaleY = 40;

  const dx = 2 / partitions;
  for (let i = 0; i < partitions; i++) {
    const xLeft = i * dx;
    const height = xLeft * xLeft;
    const rx = ox + xLeft * scaleX;
    const rw = dx * scaleX;
    const rh = height * scaleY;
    const ry = oy - rh;

    if (rh > 1) {
      strokes.push(...rectStrokes(rx, ry, rw, rh, `${seed}:r${i}`, { color, width: 1.6 }));
    }
  }

  const node = makeNode(action, 'rectangle', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.4), layout, note: `riemann sum n=${partitions}` };
}

function buildRefinedPartitions(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const partitions = num(p, ['partitions', 'n', 'count'], 30);
  const color = colorOf(p, INK.cyan);

  const strokes: InkStroke[] = [];
  const ox = 40;
  const oy = 200;
  const scaleX = 100;
  const scaleY = 40;

  const dx = 2 / partitions;
  for (let i = 0; i < partitions; i++) {
    const xLeft = i * dx;
    const height = xLeft * xLeft;
    const rx = ox + xLeft * scaleX;
    const rw = dx * scaleX;
    const rh = height * scaleY;
    const ry = oy - rh;

    if (rh > 1) {
      strokes.push(...rectStrokes(rx, ry, rw, rh, `${seed}:fr${i}`, { color, width: 1.2 }));
    }
  }

  const node = makeNode(action, 'rectangle', strokes, color, store);
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.4), layout, note: `refined riemann sum n=${partitions}` };
}

function buildCalculusArea(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const seed = `${ctx.lessonId}:${action.actionId}`;
  const color = colorOf(p, INK.blue);

  const strokes: InkStroke[] = [];
  const ox = 40;
  const oy = 200;
  const scaleX = 100;
  const scaleY = 40;

  const pts: Pt[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * 2;
    const y = x * x;
    pts.push([ox + x * scaleX, oy - y * scaleY]);
  }
  pts.push([ox + 2 * scaleX, oy]);
  pts.push([ox, oy]);

  strokes.push(...polylineStrokes(pts, `${seed}:shadeArea`, { color, width: 2.2 }, true));
  strokes.push(...highlightStrokes(ox, oy - 160, 200, 160, `${seed}:areaFill`, hexWithAlpha(color, 0.18)));

  const node = makeNode(action, 'highlight', strokes, color, store);
  node.priority = 'BACKGROUND';
  const layout = store.add(node, action.relations);
  return { kind: 'draw', nodeIds: [node.id], duration: pace(action, 1.2), layout, note: 'exact calculus area' };
}

function buildAntiderivative(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const expr = str(p, ['expression', 'antiderivative', 'text'], '\\int x^2 dx = \\frac{x^3}{3} + C');
  const color = colorOf(p, INK.chalk);

  return buildText(store, action, ctx, expr, FONT.equation, color, 'equation');
}

function buildEvaluateBounds(store: SceneStore, action: VisualAction, ctx: ExecContext): ActionOutcome {
  const p = action.parameters ?? {};
  const expr = str(p, ['expression', 'equation', 'text'], `\\left[\\frac{x^3}{3}\\right]_0^2 = \\frac{8}{3}`);
  const color = colorOf(p, INK.amber);

  return buildText(store, action, ctx, expr, FONT.equation, color, 'equation');
}
