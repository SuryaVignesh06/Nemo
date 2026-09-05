/**
 * NEMO — authoritative scene state.
 *
 * The scene store is the single source of truth for what exists on the board.
 * The canvas renderer reads from it and never writes back; the model never
 * writes to it directly either — only validated actions do, through the
 * builders. Placement is resolved here, from semantic relations, so the model
 * never owns a coordinate (registry sections 20, 30).
 */

import type { Bounds, Priority, SceneNode, Vec2 } from '../../shared/contracts.ts';
import { GAP_PIXELS, PRIORITY_RANK, boundsOverlap, worldBounds } from '../../shared/contracts.ts';
import type { Relation } from '../../shared/contracts.ts';

export interface Camera {
  /** World point shown at the centre of the viewport. */
  x: number;
  y: number;
  zoom: number;
}

/** The board is an infinite plane; this is only the initial writing region. */
export const BOARD = {
  width: 1600,
  height: 900,
  margin: 60,
};

export interface LayoutReport {
  /** Nodes moved to resolve a collision, with the offset applied. */
  moved: Array<{ id: string; dx: number; dy: number; reason: string }>;
  /** Overlaps that survived resolution. */
  unresolved: string[];
}

export class SceneStore {
  nodes = new Map<string, SceneNode>();
  order: string[] = [];
  camera: Camera = { x: BOARD.width / 2, y: BOARD.height / 2, zoom: 1 };
  /** Where the writing pen currently sits, in world coordinates. */
  pen: Vec2 | null = null;
  penDown = false;
  /** Nodes dimmed by DIM_OTHERS, restored by RESTORE_EMPHASIS. */
  private dimmed = new Set<string>();
  /** Incremented on every mutation so React can re-render cheaply. */
  version = 0;

  /** Cursor used when an action gives no relation: a top-down writing flow. */
  private flowY = BOARD.margin + 20;
  /** Horizontal centre of the writing column. */
  private flowX = BOARD.width / 2;

  clear(): void {
    this.nodes.clear();
    this.order = [];
    this.dimmed.clear();
    this.camera = { x: BOARD.width / 2, y: BOARD.height / 2, zoom: 1 };
    this.pen = null;
    this.penDown = false;
    this.flowY = BOARD.margin + 20;
    this.flowX = BOARD.width / 2;
    this.version++;
  }

  /**
   * Reserve vertical space in the writing column before placing something that
   * gets annotated around its edges — an indexed array carries pointers above
   * and below it, and those need somewhere to go that is not the text above.
   */
  reserveFlow(pixels: number): void {
    this.flowY += pixels;
  }

  get(id: string): SceneNode | undefined {
    return this.nodes.get(id);
  }

  list(): SceneNode[] {
    return this.order.map((id) => this.nodes.get(id)!).filter(Boolean);
  }

  /** Resolve a target reference, tolerating "array.midpoint" style paths. */
  resolve(ref: string | undefined): SceneNode | undefined {
    if (!ref) return undefined;
    const direct = this.nodes.get(ref);
    if (direct) return direct;
    // Fall back to the longest id that prefixes the reference, then to a
    // semantic-role match, so labels attach to what the model meant.
    const base = ref.split('.')[0];
    const byId = this.nodes.get(base);
    if (byId) return byId;
    const byRole = this.list().find((n) => n.semanticRole === ref || n.semanticRole === base);
    return byRole;
  }

  /** Anchor point on a node: named anchor, else a compass point on its bounds. */
  anchorPoint(node: SceneNode, anchor?: string): Vec2 {
    if (anchor && node.anchors?.[anchor]) {
      const a = node.anchors[anchor];
      return { x: node.transform.x + a.x, y: node.transform.y + a.y };
    }
    const b = worldBounds(node);
    switch (anchor) {
      case 'top':
        return { x: b.x + b.w / 2, y: b.y };
      case 'bottom':
        return { x: b.x + b.w / 2, y: b.y + b.h };
      case 'left':
        return { x: b.x, y: b.y + b.h / 2 };
      case 'right':
        return { x: b.x + b.w, y: b.y + b.h / 2 };
      default:
        return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
    }
  }

  /**
   * Place a node from its semantic relations. Returns the world position of the
   * node's top-left corner. Falls back to the writing flow when no relation
   * resolves, which is what keeps an under-specified plan readable.
   */
  private placeFromRelations(node: SceneNode, relations: Relation[] | undefined): void {
    const w = node.localBounds.w;
    const h = node.localBounds.h;

    const rel = (relations ?? []).find((r) => this.resolve(r.target));
    if (!rel) {
      // Writing flow: column running down the board. If flowY exceeds the vertical
      // budget, wrap to the next column so long lessons do not run off screen.
      if (this.flowY + h > BOARD.height - 100) {
        this.flowX += Math.max(500, w + 80);
        this.flowY = BOARD.margin + 20;
      }
      node.transform.x = this.flowX - w / 2;
      node.transform.y = this.flowY;
      this.flowY += h + 34;
      return;
    }

    const target = this.resolve(rel.target)!;
    const tb = worldBounds(target);
    const gap = GAP_PIXELS[rel.gap ?? 'normal'] ?? GAP_PIXELS.normal;

    // These relations mean "sit on/in the target". Overlapping it is the point.
    if (['INSIDE', 'CENTERED_ON', 'ATTACHED_TO', 'ANCHOR_TO', 'FOLLOW'].includes(rel.type)) {
      node.attachedTo = target.id;
    }

    switch (rel.type) {
      case 'ABOVE':
        node.transform.x = tb.x + (tb.w - w) / 2;
        node.transform.y = tb.y - h - gap;
        break;
      case 'BELOW':
        node.transform.x = tb.x + (tb.w - w) / 2;
        node.transform.y = tb.y + tb.h + gap;
        break;
      case 'LEFT_OF':
        node.transform.x = tb.x - w - gap;
        node.transform.y = tb.y + (tb.h - h) / 2;
        break;
      case 'RIGHT_OF':
      case 'BESIDE':
        node.transform.x = tb.x + tb.w + gap;
        node.transform.y = tb.y + (tb.h - h) / 2;
        break;
      case 'CENTERED_ON':
        node.transform.x = tb.x + (tb.w - w) / 2;
        node.transform.y = tb.y + (tb.h - h) / 2;
        break;
      case 'INSIDE': {
        const pad = GAP_PIXELS.tight;
        node.transform.x = tb.x + pad;
        node.transform.y = tb.y + pad;
        break;
      }
      case 'NEAR':
        node.transform.x = tb.x + tb.w + GAP_PIXELS.tight;
        node.transform.y = tb.y + tb.h + GAP_PIXELS.tight;
        break;
      case 'FAR':
        node.transform.x = tb.x + tb.w + GAP_PIXELS.loose;
        node.transform.y = tb.y;
        break;
      case 'ALIGNED_WITH':
        if (rel.axis === 'y') {
          node.transform.x = tb.x;
          node.transform.y = tb.y + tb.h + gap;
        } else {
          node.transform.x = tb.x + tb.w + gap;
          node.transform.y = tb.y;
        }
        break;
      case 'BETWEEN': {
        const other = this.resolve(rel.target2);
        if (other) {
          const ob = worldBounds(other);
          node.transform.x = (tb.x + tb.w / 2 + ob.x + ob.w / 2) / 2 - w / 2;
          node.transform.y = (tb.y + tb.h / 2 + ob.y + ob.h / 2) / 2 - h / 2;
        } else {
          node.transform.x = tb.x + tb.w + gap;
          node.transform.y = tb.y;
        }
        break;
      }
      case 'ATTACHED_TO':
      case 'ANCHOR_TO':
      case 'FOLLOW':
      default: {
        const p = this.anchorPoint(target, rel.anchor);
        // Attach just below the anchor by default; a label sits under its mark.
        const dy = rel.anchor === 'top' ? -h - GAP_PIXELS.tight : GAP_PIXELS.tight;
        node.transform.x = p.x - w / 2;
        node.transform.y = rel.anchor === 'top' ? p.y + dy : p.y + dy;
        break;
      }
    }

    // Keep the writing flow below whatever was just placed, so a later
    // relation-less action does not land on top of it.
    this.flowY = Math.max(this.flowY, node.transform.y + h + 30);
  }

  /**
   * Add a node, resolve its placement, then run anti-overlap resolution.
   * Higher-priority content never moves for lower-priority content.
   */
  add(node: SceneNode, relations?: Relation[]): LayoutReport {
    this.placeFromRelations(node, relations);
    return this.commit(node);
  }

  /**
   * Add a node at a position the engine computed itself — a pointer under a
   * specific array cell, say. This is still deterministic layout, not the model
   * choosing coordinates.
   */
  addAt(node: SceneNode, x: number, y: number): LayoutReport {
    node.transform.x = x;
    node.transform.y = y;
    this.flowY = Math.max(this.flowY, y + node.localBounds.h + 30);
    return this.commit(node);
  }

  private commit(node: SceneNode): LayoutReport {
    this.nodes.set(node.id, node);
    this.order.push(node.id);
    const report = this.resolveCollisions(node.id);
    this.version++;
    return report;
  }

  /**
   * Deterministic anti-overlap with broad-phase spatial filtering.
   * The newly placed node is pushed away from anything it collides with.
   */
  resolveCollisions(newId: string, maxPasses = 6): LayoutReport {
    const report: LayoutReport = { moved: [], unresolved: [] };
    const subject = this.nodes.get(newId);
    if (!subject) return report;

    const PAD = 10;
    for (let pass = 0; pass < maxPasses; pass++) {
      let collided = false;

      for (const other of this.list()) {
        if (other.id === subject.id) continue;
        if (!other.visible || other.opacity <= 0.02) continue;
        // Highlights are meant to sit on top of what they emphasise.
        if (other.type === 'highlight' || subject.type === 'highlight') continue;
        // So is anything deliberately placed on or inside the other.
        if (this.areAttached(subject, other)) continue;

        const a = worldBounds(subject);
        const b = worldBounds(other);
        if (a.w === 0 || a.h === 0 || b.w === 0 || b.h === 0) continue;

        // Spatial broad-phase: skip nodes whose bounding box is nowhere near subject
        if (
          b.x > a.x + a.w + 120 ||
          b.x + b.w < a.x - 120 ||
          b.y > a.y + a.h + 120 ||
          b.y + b.h < a.y - 120
        ) {
          continue;
        }

        if (!boundsOverlap(a, b, PAD)) continue;

        collided = true;
        const subjectWins = PRIORITY_RANK[subject.priority] < PRIORITY_RANK[other.priority];
        const mover = subjectWins ? other : subject;
        const anchorBounds = subjectWins ? a : b;
        const moverBounds = subjectWins ? b : a;
        const mtv = separationVector(moverBounds, anchorBounds, PAD);

        mover.transform.x += mtv.x;
        mover.transform.y += mtv.y;
        report.moved.push({
          id: mover.id,
          dx: mtv.x,
          dy: mtv.y,
          reason: subjectWins
            ? `reflowed ${mover.id} (${mover.priority}) for higher-priority ${subject.id}`
            : `moved ${mover.id} clear of ${other.id} (${other.priority})`,
        });
      }
      if (!collided) return report;
    }

    for (const other of this.list()) {
      if (other.id === subject.id) continue;
      if (other.type === 'highlight' || subject.type === 'highlight') continue;
      if (this.areAttached(subject, other)) continue;
      if (boundsOverlap(worldBounds(subject), worldBounds(other), 0)) {
        report.unresolved.push(`${subject.id} still overlaps ${other.id}`);
      }
    }
    return report;
  }

  /**
   * Walk the attachment chain to the thing a decoration ultimately belongs to.
   * A right-angle mark attached to a height line attached to a triangle shares
   * the triangle's root, so none of those three counts as a collision.
   */
  attachmentRoot(node: SceneNode): string {
    let current = node;
    const seen = new Set<string>([current.id]);
    while (current.attachedTo) {
      const parent = this.nodes.get(current.attachedTo);
      if (!parent || seen.has(parent.id)) break;
      seen.add(parent.id);
      current = parent;
    }
    return current.id;
  }

  /**
   * True when one node is deliberately drawn on top of the other.
   *
   * Only an ancestor/descendant pair is exempt. Two labels attached to the SAME
   * diagram are siblings, not a deliberate overlap: a second "low" pointer must
   * still be pushed clear of the "high" pointer beside it.
   */
  areAttached(a: SceneNode, b: SceneNode): boolean {
    if (!a.attachedTo && !b.attachedTo) return false;
    return (
      a.attachedTo === b.id ||
      b.attachedTo === a.id ||
      this.attachmentRoot(a) === b.id ||
      this.attachmentRoot(b) === a.id
    );
  }

  /** Bounds enclosing every visible node, used by CAMERA_FIT. */
  contentBounds(ids?: string[]): Bounds | null {
    const nodes = (ids ? ids.map((i) => this.resolve(i)).filter(Boolean) : this.list()) as SceneNode[];
    const visible = nodes.filter((n) => n.visible && n.opacity > 0.05 && n.localBounds.w > 0);
    if (visible.length === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of visible) {
      const b = worldBounds(n);
      minX = Math.min(minX, b.x);
      minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w);
      maxY = Math.max(maxY, b.y + b.h);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  setDimmed(ids: string[]): void {
    this.dimmed = new Set(ids);
    this.version++;
  }

  isDimmed(id: string): boolean {
    return this.dimmed.has(id);
  }

  clearDimmed(): void {
    this.dimmed.clear();
    this.version++;
  }

  touch(): void {
    this.version++;
  }
}

/**
 * Minimum translation vector pushing `mover` clear of `anchor` along the axis
 * of least penetration. Ties resolve downward, which reads naturally on a board
 * that is written top to bottom.
 */
export function separationVector(mover: Bounds, anchor: Bounds, pad = 0): Vec2 {
  const overlapLeft = mover.x + mover.w + pad - anchor.x;
  const overlapRight = anchor.x + anchor.w + pad - mover.x;
  const overlapTop = mover.y + mover.h + pad - anchor.y;
  const overlapBottom = anchor.y + anchor.h + pad - mover.y;

  const candidates: Array<{ v: Vec2; d: number }> = [
    { v: { x: -overlapLeft, y: 0 }, d: Math.abs(overlapLeft) },
    { v: { x: overlapRight, y: 0 }, d: Math.abs(overlapRight) },
    { v: { x: 0, y: -overlapTop }, d: Math.abs(overlapTop) },
    { v: { x: 0, y: overlapBottom }, d: Math.abs(overlapBottom) },
  ];
  candidates.sort((a, b) => a.d - b.d || (a.v.y > b.v.y ? -1 : 1));
  return candidates[0].v;
}

export interface ViewportInsets {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

/** Camera that frames a bounds with padding inside the given viewport, taking chrome insets into account. */
export function cameraForBounds(
  b: Bounds,
  viewport: { width: number; height: number },
  padding = 90,
  maxZoom = 1.6,
  insets: ViewportInsets = { top: 70, bottom: 190, left: 40, right: 40 }
): Camera {
  const topInset = insets.top ?? 70;
  const bottomInset = insets.bottom ?? 190;
  const leftInset = insets.left ?? 40;
  const rightInset = insets.right ?? 40;

  const availW = Math.max(100, viewport.width - leftInset - rightInset);
  const availH = Math.max(100, viewport.height - topInset - bottomInset);

  const zoomX = availW / Math.max(1, b.w + padding * 2);
  const zoomY = availH / Math.max(1, b.h + padding * 2);
  const zoom = Math.max(0.25, Math.min(maxZoom, Math.min(zoomX, zoomY)));

  const contentCenterX = b.x + b.w / 2;
  const contentCenterY = b.y + b.h / 2;

  // Shift camera center so content center lands in middle of unobstructed canvas space
  const shiftX = (rightInset - leftInset) / (2 * zoom);
  const shiftY = (bottomInset - topInset) / (2 * zoom);

  return { x: contentCenterX + shiftX, y: contentCenterY + shiftY, zoom };
}

/** PASS/FAIL check that nothing protected overlaps (CHECK_COLLISION). */
export function checkCollisions(store: SceneStore): { pass: boolean; conflicts: string[] } {
  const conflicts: string[] = [];
  const nodes = store.list().filter((n) => n.visible && n.type !== 'highlight' && n.localBounds.w > 0);
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const protectedPair =
        a.priority === 'PRIMARY' || b.priority === 'PRIMARY';
      if (!protectedPair) continue;
      if (store.areAttached(a, b)) continue;
      if (boundsOverlap(worldBounds(a), worldBounds(b), 0)) {
        conflicts.push(`${a.id} (${a.priority}) overlaps ${b.id} (${b.priority})`);
      }
    }
  }
  return { pass: conflicts.length === 0, conflicts };
}

export type { Priority };
