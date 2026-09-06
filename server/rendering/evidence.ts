/**
 * NEMO — render evidence.
 *
 * What the Visual Critic is allowed to look at: captured frames, plus geometry
 * that was MEASURED rather than judged.
 *
 * The split matters. Vision models are good at "the arrow points at the wrong
 * atom" and bad at "these overlap by 40px". So overlap, clipping and off-screen
 * detection are computed here from real bounds, and handed to the critic as
 * fact. The model then spends its judgement on correctness and pedagogy, where
 * it is actually strong.
 *
 * A consequence worth stating: the deterministic half of the critic works even
 * when frame capture fails or no vision model is configured. The loop degrades,
 * it does not stop.
 */

import { boundsOverlap, overlapArea, worldBounds, type Bounds, type SceneNode } from '../../shared/contracts.ts';

export interface Viewport {
  width: number;
  height: number;
}

export interface OverlapFinding {
  a: string;
  b: string;
  /** Fraction of the smaller node's area that is covered. */
  coverage: number;
}

export interface ClipFinding {
  id: string;
  /** Which edges the node crosses. */
  edges: string[];
  /** Fraction of the node outside the viewport. */
  outsideFraction: number;
}

export interface SceneMeasurements {
  nodeCount: number;
  visibleCount: number;
  viewport: Viewport;
  overlaps: OverlapFinding[];
  clipped: ClipFinding[];
  offScreen: string[];
  /** Nodes smaller than the minimum readable size. */
  tooSmall: string[];
  /** 0..1 share of the viewport covered by content. */
  fillRatio: number;
  /** True when the board is empty — a render that taught nothing. */
  blank: boolean;
}

export interface RenderEvidence {
  measurements: SceneMeasurements;
  /** Base64 PNG frames, empty when capture was unavailable. */
  frames: string[];
  /** Set when capture failed, so the critic is told rather than misled. */
  captureError?: string;
}

/** Below this, text and labels stop being readable on a projected board. */
export const MIN_READABLE_PX = 12;

/** Overlap below this fraction is incidental, not a defect. */
const OVERLAP_THRESHOLD = 0.08;

function area(b: Bounds): number {
  return Math.max(0, b.w) * Math.max(0, b.h);
}

function insideViewport(b: Bounds, vp: Viewport): number {
  const w = Math.min(b.x + b.w, vp.width) - Math.max(b.x, 0);
  const h = Math.min(b.y + b.h, vp.height) - Math.max(b.y, 0);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * A measured rectangle from whichever renderer produced the scene.
 *
 * ManimGL reports these from real mobject geometry after layout; the browser
 * board derives them from placed SceneNodes. Measuring both through one type
 * means an overlap means the same thing wherever it came from.
 */
export interface MeasuredRect extends Bounds {
  id: string;
  /** Overlap with this node is intended (INSIDE, ATTACHED_TO, CENTERED_ON). */
  attachedTo?: string;
}

/** Measure a laid-out scene expressed as SceneNodes (the browser board). */
export function measureScene(nodes: readonly SceneNode[], viewport: Viewport): SceneMeasurements {
  const rects: MeasuredRect[] = nodes
    .filter((n) => n.visible)
    .map((n) => ({ id: n.id, ...worldBounds(n), attachedTo: n.attachedTo }));
  return measureRects(rects, viewport, nodes.length);
}

/**
 * Measure raw geometry. Pure: the same rects and viewport always produce the
 * same measurements, so a critic verdict is reproducible.
 */
export function measureRects(
  visible: readonly MeasuredRect[],
  viewport: Viewport,
  nodeCount = visible.length
): SceneMeasurements {
  const overlaps: OverlapFinding[] = [];
  const clipped: ClipFinding[] = [];
  const offScreen: string[] = [];
  const tooSmall: string[] = [];

  for (const b of visible) {
    if (b.w < MIN_READABLE_PX || b.h < MIN_READABLE_PX) tooSmall.push(b.id);

    const inside = insideViewport(b, viewport);
    const total = area(b);
    if (total <= 0) continue;

    if (inside <= 0) {
      offScreen.push(b.id);
      continue;
    }
    if (inside < total) {
      const edges: string[] = [];
      if (b.x < 0) edges.push('left');
      if (b.y < 0) edges.push('top');
      if (b.x + b.w > viewport.width) edges.push('right');
      if (b.y + b.h > viewport.height) edges.push('bottom');
      clipped.push({ id: b.id, edges, outsideFraction: 1 - inside / total });
    }
  }

  for (let i = 0; i < visible.length; i++) {
    for (let j = i + 1; j < visible.length; j++) {
      const ba = visible[i];
      const bc = visible[j];

      // Deliberate placement (INSIDE, ATTACHED_TO, CENTERED_ON) is not a defect.
      if (ba.attachedTo === bc.id || bc.attachedTo === ba.id) continue;
      if (!boundsOverlap(ba, bc)) continue;

      const smaller = Math.min(area(ba), area(bc));
      if (smaller <= 0) continue;
      const coverage = overlapArea(ba, bc) / smaller;
      if (coverage >= OVERLAP_THRESHOLD) {
        overlaps.push({ a: ba.id, b: bc.id, coverage: Number(coverage.toFixed(3)) });
      }
    }
  }

  const covered = visible.reduce((sum, b) => sum + insideViewport(b, viewport), 0);
  const vpArea = viewport.width * viewport.height;

  return {
    nodeCount,
    visibleCount: visible.length,
    viewport,
    // Worst first, so a truncated prompt still carries the important findings.
    overlaps: overlaps.sort((x, y) => y.coverage - x.coverage).slice(0, 20),
    clipped: clipped.sort((x, y) => y.outsideFraction - x.outsideFraction).slice(0, 20),
    offScreen,
    tooSmall,
    fillRatio: vpArea > 0 ? Number(Math.min(1, covered / vpArea).toFixed(3)) : 0,
    blank: visible.length === 0,
  };
}

/**
 * Verdict the measurements alone can justify, with no model involved.
 *
 * This is the floor under the critic: these defects are facts, so they fail the
 * scene whatever a vision model thinks of it, and they still fail it when no
 * vision model is available at all.
 */
export function deterministicFailures(m: SceneMeasurements): string[] {
  const out: string[] = [];
  if (m.blank) out.push('The board is empty — nothing was rendered.');
  if (m.offScreen.length) {
    out.push(`Entirely off-screen: ${m.offScreen.join(', ')}.`);
  }
  for (const c of m.clipped) {
    if (c.outsideFraction > 0.25) {
      out.push(
        `${c.id} is ${Math.round(c.outsideFraction * 100)}% outside the viewport (${c.edges.join('/')} edge).`
      );
    }
  }
  for (const o of m.overlaps) {
    if (o.coverage > 0.35) {
      out.push(`${o.a} and ${o.b} overlap by ${Math.round(o.coverage * 100)}%.`);
    }
  }
  if (m.tooSmall.length) {
    out.push(`Below the ${MIN_READABLE_PX}px readable minimum: ${m.tooSmall.join(', ')}.`);
  }
  return out;
}
