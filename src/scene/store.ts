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
  /** First node in the currently focused question on the persistent canvas. */
  private activeSectionStart = 0;
  /** Stable model ids rebound to their instance in the current canvas section. */
  private activeAliases = new Map<string, string>();
  /** Semantic object selected inside a structured renderer. */
  selectedObjectId: string | null = null;
  /** Freehand-circled area on the board, with whatever it enclosed. */
  selectedRegion: { points: Vec2[]; nodeIds: string[] } | null = null;
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
    this.activeSectionStart = 0;
    this.activeAliases.clear();
    this.selectedObjectId = null;
    this.selectedRegion = null;
    this.camera = { x: BOARD.width / 2, y: BOARD.height / 2, zoom: 1 };
    this.pen = null;
    this.penDown = false;
    this.flowY = BOARD.margin + 20;
    this.flowX = BOARD.width / 2;
    this.version++;
  }

  /**
   * Preserve the board, then move the writing cursor and camera to a clean
   * neighbouring region for a follow-up lesson.
   */
  beginSection(): Camera {
    const bounds = this.contentBounds();
    this.activeSectionStart = this.order.length;
    this.activeAliases.clear();
    this.dimmed.clear();
    this.selectedObjectId = null;
    this.selectedRegion = null;
    this.flowX = bounds ? bounds.x + bounds.w + 240 : BOARD.width / 2;
    this.flowY = BOARD.margin + 20;
    // Keep camera where user is looking so content never vanishes;
    // camera will smoothly tween when new actions are drawn.
    if (!bounds) {
      this.camera = { x: this.flowX, y: BOARD.height / 2, zoom: 1 };
    }
    this.pen = null;
    this.penDown = false;
    this.version++;
    return { ...this.camera };
  }

  selectObject(id: string | null): void {
    this.selectedObjectId = id;
    this.version++;
  }

  /** Record a freehand-circled area and the nodes it enclosed. */
  selectRegion(points: Vec2[], nodeIds: string[]): void {
    this.selectedRegion = { points, nodeIds };
    this.version++;
  }

  clearRegion(): void {
    this.selectedRegion = null;
    this.version++;
  }

  bindActiveAlias(alias: string | undefined, nodeId: string): void {
    if (alias) this.activeAliases.set(alias, nodeId);
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
    const activeId = this.activeAliases.get(ref);
    if (activeId) return this.nodes.get(activeId);
    const direct = this.nodes.get(ref);
    if (direct) return direct;
    // Fall back to the longest id that prefixes the reference, then to a
    // semantic-role match, so labels attach to what the model meant.
    const base = ref.split('.')[0];
    const activeBaseId = this.activeAliases.get(base);
    if (activeBaseId) return this.nodes.get(activeBaseId);
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
   * Deterministic anti-overlap.
   *
   * Resolution is a work queue, not a fixed number of passes over one node.
   * The earlier version only ever re-examined the node being added, so pushing
   * a label clear of an equation could drop it straight onto a title and the
   * engine would never look again — which is exactly how three-way tangles
   * ("summary_bullets still overlaps final_answer") reached the board.
   *
   * Every node that gets moved is re-queued, so a shove is followed through
   * until the whole affected neighbourhood is clear or the budget runs out.
   */
  resolveCollisions(newId: string, maxPasses = 6): LayoutReport {
    const report: LayoutReport = { moved: [], unresolved: [] };
    const subject = this.nodes.get(newId);
    if (!subject) return report;

    const PAD = 10;
    /* Total moves allowed across the whole cascade. Scaled off the caller's
       pass budget so the parameter still means "how hard to try". */
    const budget = Math.max(12, maxPasses * 10);
    /** How often each node has been shoved, to break ping-pong. */
    const shoves = new Map<string, number>();
    const queue: string[] = [subject.id];
    const queued = new Set<string>([subject.id]);
    let steps = 0;

    while (queue.length > 0 && steps < budget) {
      const currentId = queue.shift()!;
      queued.delete(currentId);
      const current = this.nodes.get(currentId);
      if (!current || !current.visible || current.opacity <= 0.02) continue;
      if (current.type === 'highlight') continue;
      // Wires are routed against component bounds before insertion. Their
      // rectangular extent is not their occupied area, so generic box-based
      // collision shoving would corrupt a valid routed path.
      if (current.type === 'wire') continue;

      for (const other of this.list()) {
        if (other.id === current.id) continue;
        if (!other.visible || other.opacity <= 0.02) continue;
        // Highlights are meant to sit on top of what they emphasise.
        if (other.type === 'highlight') continue;
        if (other.type === 'wire') continue;
        // So is anything deliberately placed on or inside the other.
        if (this.areAttached(current, other)) continue;

        const a = worldBounds(current);
        const b = worldBounds(other);
        if (a.w === 0 || a.h === 0 || b.w === 0 || b.h === 0) continue;

        // Spatial broad-phase: skip nodes nowhere near the one being resolved.
        if (
          b.x > a.x + a.w + 120 ||
          b.x + b.w < a.x - 120 ||
          b.y > a.y + a.h + 120 ||
          b.y + b.h < a.y - 120
        ) {
          continue;
        }

        const pad = current.type === 'diagram' || other.type === 'diagram' ? 56 : PAD;
        if (!boundsOverlap(a, b, pad)) continue;

        /*
         * Who gives way: whoever matters less. On a tie the node written later
         * moves, because a board is read in the order it was written and what
         * the learner has already taken in should stay where they saw it.
         */
        const currentRank = PRIORITY_RANK[current.priority];
        const otherRank = PRIORITY_RANK[other.priority];
        let mover = current;
        let anchor = other;
        if (otherRank > currentRank) {
          mover = other;
          anchor = current;
        } else if (otherRank === currentRank) {
          const laterIsCurrent =
            this.order.indexOf(current.id) > this.order.indexOf(other.id);
          mover = laterIsCurrent ? current : other;
          anchor = laterIsCurrent ? other : current;
        }

        // A node shoved repeatedly is wedged between two others. Move its
        // neighbour instead of bouncing it back and forth forever.
        if ((shoves.get(mover.id) ?? 0) >= 3 && (shoves.get(anchor.id) ?? 0) < 3) {
          const swap = mover;
          mover = anchor;
          anchor = swap;
        }

        const mtv = separationVector(worldBounds(mover), worldBounds(anchor), pad);
        mover.transform.x += mtv.x;
        mover.transform.y += mtv.y;
        shoves.set(mover.id, (shoves.get(mover.id) ?? 0) + 1);
        steps++;

        report.moved.push({
          id: mover.id,
          dx: mtv.x,
          dy: mtv.y,
          reason:
            mover.id === current.id
              ? `moved ${mover.id} clear of ${anchor.id} (${anchor.priority})`
              : `reflowed ${mover.id} (${mover.priority}) for higher-priority ${anchor.id}`,
        });

        // Wherever it landed may itself be occupied, so look again.
        if (!queued.has(mover.id)) {
          queue.push(mover.id);
          queued.add(mover.id);
        }
        if (steps >= budget) break;
      }
    }

    /*
     * Report on everything the cascade touched, not just the node that started
     * it: a shove that parked some other label on a title is a layout failure
     * that belongs in the log, and it used to go unmentioned.
     */
    const touched = [subject.id, ...report.moved.map((m) => m.id)];
    const seen = new Set<string>();
    for (const id of touched) {
      if (seen.has(id)) continue;
      seen.add(id);
      const node = this.nodes.get(id);
      if (!node || node.type === 'highlight' || node.type === 'wire') continue;
      for (const other of this.list()) {
        if (other.id === node.id) continue;
        if (other.type === 'highlight' || other.type === 'wire') continue;
        if (this.areAttached(node, other)) continue;
        if (boundsOverlap(worldBounds(node), worldBounds(other), 0)) {
          report.unresolved.push(`${node.id} still overlaps ${other.id}`);
        }
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
    if (a.connections?.includes(b.id) || b.connections?.includes(a.id)) return true;
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

  /** Bounds of only the current question, so old lessons stay full-size nearby. */
  activeContentBounds(): Bounds | null {
    const ids = this.order.slice(this.activeSectionStart);
    return this.contentBounds(ids) ?? this.contentBounds();
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
    { v: { x: 0, y: overlapBottom }, d: Math.abs(overlapBottom) * 0.85 },
    { v: { x: overlapRight, y: 0 }, d: Math.abs(overlapRight) },
    { v: { x: -overlapLeft, y: 0 }, d: Math.abs(overlapLeft) },
    { v: { x: 0, y: -overlapTop }, d: Math.abs(overlapTop) * 1.35 },
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
  padding = 60,
  maxZoom = 1.8,
  insets: ViewportInsets = { top: 60, bottom: 60, left: 60, right: 60 }
): Camera {
  const topInset = insets.top ?? 60;
  const bottomInset = insets.bottom ?? 60;
  const leftInset = insets.left ?? 60;
  const rightInset = insets.right ?? 60;

  const availW = Math.max(100, viewport.width - leftInset - rightInset);
  const availH = Math.max(100, viewport.height - topInset - bottomInset);

  const zoomX = availW / Math.max(1, b.w + padding * 2);
  const zoomY = availH / Math.max(1, b.h + padding * 2);
  const zoom = Math.max(0.45, Math.min(maxZoom, Math.min(zoomX, zoomY)));

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
  const nodes = store.list().filter(
    (n) => n.visible && n.type !== 'highlight' && n.type !== 'wire' && n.localBounds.w > 0
  );
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
