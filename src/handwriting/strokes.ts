/**
 * NEMO — ink stroke generation.
 *
 * The model asks for "write 2x + 5 = 17"; this module produces the actual pen
 * path. Imperfection is deliberate but never random: every wobble is derived
 * from a seed built out of lessonId + nodeId + strokeIndex, so replaying a
 * lesson draws exactly the same ink (registry section 24).
 */

import type { InkStroke, Vec2 } from '../../shared/contracts.ts';
import { glyphFor, measureEm, type Pt } from './glyphs.ts';

/* ------------------------------------------------------- deterministic RNG */

/** FNV-1a over the seed string, then mulberry32. Same seed, same ink. */
export function seededRandom(seed: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* --------------------------------------------------------------- geometry */

/** Catmull-Rom resampling: turns sparse control points into a smooth path. */
export function smoothPath(points: Pt[], subdivisions = 6): Pt[] {
  if (points.length < 3) return points.map((p) => [p[0], p[1]] as Pt);
  const out: Pt[] = [];
  const pts: Pt[] = [points[0], ...points, points[points.length - 1]];
  for (let i = 1; i < pts.length - 2; i++) {
    const [p0, p1, p2, p3] = [pts[i - 1], pts[i], pts[i + 1], pts[i + 2]];
    for (let s = 0; s < subdivisions; s++) {
      const t = s / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;
      out.push([
        0.5 *
          (2 * p1[0] +
            (-p0[0] + p2[0]) * t +
            (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
            (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        0.5 *
          (2 * p1[1] +
            (-p0[1] + p2[1]) * t +
            (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
            (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  out.push([points[points.length - 1][0], points[points.length - 1][1]]);
  return out;
}

/** Total path length, used for progress-based drawing and pen speed. */
export function pathLength(points: Array<{ x: number; y: number }>): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
  }
  return len;
}

/**
 * Apply low-frequency wobble so a line looks drawn rather than plotted.
 * `amount` is in the same units as the points.
 */
function humanise(points: Pt[], rand: () => number, amount: number): Pt[] {
  if (amount <= 0) return points;
  // Two slow sine components with seeded phase keeps the wobble organic but
  // stable, rather than per-point noise which reads as a jagged mess.
  const phase1 = rand() * Math.PI * 2;
  const phase2 = rand() * Math.PI * 2;
  const freq1 = 1.4 + rand() * 1.6;
  const freq2 = 3.5 + rand() * 3.0;
  const n = Math.max(1, points.length - 1);
  return points.map(([x, y], i) => {
    const t = i / n;
    const w =
      Math.sin(t * Math.PI * 2 * freq1 + phase1) * 0.7 +
      Math.sin(t * Math.PI * 2 * freq2 + phase2) * 0.3;
    // Taper the wobble at the ends so strokes still meet where they should.
    const taper = Math.sin(Math.PI * Math.min(1, Math.max(0, t))) ** 0.5;
    return [x + w * amount * taper, y + w * amount * 0.8 * taper] as Pt;
  });
}

const toPoints = (pts: Pt[]) => pts.map(([x, y]) => ({ x, y }));

export interface StrokeStyle {
  /** Ink colour; defaults to chalk white. */
  color?: string;
  width?: number;
  /** 0 = ruler-straight, 1 = normal hand, 2 = loose. */
  wobble?: number;
  opacity?: number;
}

let strokeCounter = 0;
const nextStrokeId = () => `s${(strokeCounter = (strokeCounter + 1) % 1e9)}`;

/** Build one ink stroke from control points. */
export function makeStroke(
  points: Pt[],
  seed: string,
  style: StrokeStyle = {},
  opts: { smooth?: boolean; wobbleScale?: number } = {}
): InkStroke {
  const rand = seededRandom(seed);
  const smoothed = opts.smooth === false ? points : smoothPath(points);
  const wobble = (style.wobble ?? 1) * (opts.wobbleScale ?? 1);
  const jittered = humanise(smoothed, rand, wobble);
  return {
    id: nextStrokeId(),
    points: toPoints(jittered),
    width: style.width ?? 2.4,
    opacity: style.opacity ?? 1,
    semanticRole: 'ink',
    color: style.color,
  };
}

/* ------------------------------------------------------------------ text */

export interface TextStrokesResult {
  strokes: InkStroke[];
  width: number;
  height: number;
  /** Baseline offset from the top of the bounding box. */
  baseline: number;
}

const LETTER_SPACING = 0.045;

/**
 * Convert a string into handwriting strokes.
 * Origin is the top-left of the cap-height box; descenders extend below.
 */
export function textToStrokes(
  text: string,
  fontSize: number,
  seed: string,
  style: StrokeStyle = {}
): TextStrokesResult {
  const strokes: InkStroke[] = [];
  let penX = 0;
  let i = 0;
  // Slight baseline drift across a line, the way handwriting sits unevenly.
  const drift = seededRandom(`${seed}:drift`);
  const driftPhase = drift() * Math.PI * 2;
  const driftAmp = fontSize * 0.012;

  for (const ch of text) {
    const glyph = glyphFor(ch);
    const dy = Math.sin(i * 0.7 + driftPhase) * driftAmp;
    glyph.strokes.forEach((path, si) => {
      const scaled: Pt[] = path.map(([gx, gy]) => [
        (penX + gx) * fontSize,
        gy * fontSize + dy,
      ]);
      const s = makeStroke(scaled, `${seed}:${i}:${si}`, style, {
        wobbleScale: fontSize * 0.014,
      });
      s.semanticRole = 'handwriting';
      strokes.push(s);
    });
    penX += glyph.w + LETTER_SPACING;
    i++;
  }

  const width = Math.max(0, (penX - LETTER_SPACING) * fontSize);
  return {
    strokes,
    width,
    height: fontSize * 1.3,
    baseline: fontSize,
  };
}

/** Measured width of handwriting text without building the strokes. */
export function measureText(text: string, fontSize: number): number {
  return measureEm(text, LETTER_SPACING) * fontSize;
}

/* ---------------------------------------------------------------- shapes */

const TAU = Math.PI * 2;

export function circleStrokes(
  cx: number,
  cy: number,
  r: number,
  seed: string,
  style: StrokeStyle = {}
): InkStroke[] {
  const rand = seededRandom(`${seed}:start`);
  const start = rand() * TAU;
  // Overshoot slightly so the ends cross, the way a hand-drawn circle closes.
  const sweep = TAU + 0.18 + rand() * 0.14;
  const pts: Pt[] = [];
  const steps = 40;
  for (let i = 0; i <= steps; i++) {
    const a = start + (sweep * i) / steps;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return [makeStroke(pts, seed, style, { wobbleScale: r * 0.03 })];
}

export function ellipseStrokes(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: string,
  style: StrokeStyle = {}
): InkStroke[] {
  const rand = seededRandom(`${seed}:start`);
  const start = rand() * TAU;
  const sweep = TAU + 0.16;
  const pts: Pt[] = [];
  const steps = 44;
  for (let i = 0; i <= steps; i++) {
    const a = start + (sweep * i) / steps;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return [makeStroke(pts, seed, style, { wobbleScale: Math.min(rx, ry) * 0.03 })];
}

export function arcStrokes(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  seed: string,
  style: StrokeStyle = {}
): InkStroke[] {
  const pts: Pt[] = [];
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return [makeStroke(pts, seed, style, { wobbleScale: r * 0.025 })];
}

export function lineStrokes(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  seed: string,
  style: StrokeStyle = {}
): InkStroke[] {
  const len = Math.hypot(x1 - x0, y1 - y0);
  // Sample the line so the wobble has somewhere to live.
  const pts: Pt[] = [];
  const steps = Math.max(2, Math.round(len / 24));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push([x0 + (x1 - x0) * t, y0 + (y1 - y0) * t]);
  }
  return [makeStroke(pts, seed, style, { wobbleScale: Math.min(3, len * 0.006) })];
}

export function polylineStrokes(
  points: Pt[],
  seed: string,
  style: StrokeStyle = {},
  close = false
): InkStroke[] {
  const pts = close ? [...points, points[0]] : points;
  // Corners must stay sharp, so each edge is its own smoothed segment.
  const strokes: InkStroke[] = [];
  for (let i = 1; i < pts.length; i++) {
    strokes.push(...lineStrokes(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], `${seed}:${i}`, style));
  }
  return strokes;
}

export function rectStrokes(
  x: number,
  y: number,
  w: number,
  h: number,
  seed: string,
  style: StrokeStyle = {}
): InkStroke[] {
  return polylineStrokes(
    [
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ],
    seed,
    style,
    true
  );
}

/** Arrow shaft plus head. `headSize` is in pixels. */
export function arrowStrokes(
  from: Vec2,
  to: Vec2,
  seed: string,
  style: StrokeStyle = {},
  headSize = 13,
  doubleEnded = false
): InkStroke[] {
  const strokes = lineStrokes(from.x, from.y, to.x, to.y, `${seed}:shaft`, style);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = (tip: Vec2, dir: number, tag: string): InkStroke[] => [
    makeStroke(
      [
        [tip.x - Math.cos(dir - 0.4) * headSize, tip.y - Math.sin(dir - 0.4) * headSize],
        [tip.x, tip.y],
        [tip.x - Math.cos(dir + 0.4) * headSize, tip.y - Math.sin(dir + 0.4) * headSize],
      ],
      `${seed}:${tag}`,
      style,
      { smooth: false, wobbleScale: 0.6 }
    ),
  ];
  strokes.push(...head(to, angle, 'head'));
  if (doubleEnded) strokes.push(...head(from, angle + Math.PI, 'head2'));
  return strokes;
}

/** A curly brace spanning a region, opening toward `side`. */
export function braceStrokes(
  x: number,
  y: number,
  length: number,
  seed: string,
  style: StrokeStyle = {},
  side: 'top' | 'bottom' | 'left' | 'right' = 'bottom'
): InkStroke[] {
  const d = 12;
  const half = length / 2;
  // Built horizontally, then rotated into place.
  const raw: Pt[] = [
    [0, 0],
    [d * 0.35, d * 0.5],
    [half - d * 0.5, d * 0.62],
    [half, d * 1.25],
    [half + d * 0.5, d * 0.62],
    [length - d * 0.35, d * 0.5],
    [length, 0],
  ];
  const rot = side === 'bottom' ? 0 : side === 'top' ? Math.PI : side === 'right' ? -Math.PI / 2 : Math.PI / 2;
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const pts: Pt[] = raw.map(([px, py]) => [x + px * cos - py * sin, y + px * sin + py * cos]);
  return [makeStroke(pts, seed, style, { wobbleScale: 0.8 })];
}

/** Translucent marker-pen band used for highlights with tapered ends. */
export function highlightStrokes(
  x: number,
  y: number,
  w: number,
  h: number,
  seed: string,
  color: string
): InkStroke[] {
  const rand = seededRandom(seed);
  const padX = 6;
  const jig = () => (rand() - 0.5) * 2;
  // Marker pen covers the x-height band (vertical center strip) rather than full box height
  const topY = y + h * 0.15 + jig();
  const botY = y + h * 0.85 + jig();
  const midY = (topY + botY) / 2;

  // 6-vertex polygon with soft tapered leading/trailing tips
  const pts: [number, number][] = [
    [x - padX + jig(), midY],
    [x + jig(), topY],
    [x + w + jig(), topY],
    [x + w + padX + jig(), midY],
    [x + w + jig(), botY],
    [x + jig(), botY],
  ];

  const stroke = makeStroke(
    pts,
    seed,
    { wobble: 0 },
    { smooth: true }
  );
  stroke.fill = color;
  stroke.opacity = 0.34;
  stroke.closed = true;
  stroke.semanticRole = 'highlight';
  stroke.width = 0;
  return [stroke];
}

/** Translate every point of a stroke set. */
export function translateStrokes(strokes: InkStroke[], dx: number, dy: number): InkStroke[] {
  return strokes.map((s) => ({
    ...s,
    points: s.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })),
  }));
}

/** Bounding box of a stroke set. */
export function strokesBounds(strokes: InkStroke[]): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const s of strokes) {
    for (const p of s.points) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Normalise a stroke set so its top-left sits at (0,0), returning the local
 * bounds. Layout then places the node as a whole.
 */
export function normaliseToOrigin(strokes: InkStroke[]): {
  strokes: InkStroke[];
  w: number;
  h: number;
} {
  const b = strokesBounds(strokes);
  return {
    strokes: translateStrokes(strokes, -b.x, -b.y),
    w: b.w,
    h: b.h,
  };
}
