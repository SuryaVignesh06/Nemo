/**
 * NEMO — the teaching board.
 *
 * A consumer of the scene store, never a second source of truth: it reads nodes
 * and camera every frame and paints them. Progressive drawing comes from each
 * node's `drawProgress`, distributed across its strokes by length, so the pen
 * rides the real ink frontier rather than a faked path.
 *
 * The learner can pan and zoom freely; doing so takes manual control of the
 * camera until the next lesson starts.
 */

/* oxlint-disable react/immutability */
import { useCallback, useEffect, useRef } from 'react';
import type { InkStroke, SceneNode, Vec2 } from '../../shared/contracts.ts';
import { worldBounds } from '../../shared/contracts.ts';
import type { SceneStore } from '../scene/store.ts';
import { MermaidLayer } from '../visual/MermaidLayer.tsx';

interface Props {
  store: SceneStore;
  /** Set while a lesson is drawing, so the pen is shown. */
  drawing: boolean;
  onManualCamera?: () => void;
  onZoomChange?: (zoom: number) => void;
  /** When true, a pointer drag circles a region instead of panning. */
  annotateMode?: boolean;
  /** Fired once a circled region has been resolved into the store. */
  onRegionSelected?: (nodeIds: string[]) => void;
}

/** True when `point` lies inside `polygon` (standard ray-casting test). */
function pointInPolygon(point: Vec2, polygon: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const crosses = a.y > point.y !== b.y > point.y;
    if (!crosses) continue;
    const xIntersect = ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x;
    if (point.x < xIntersect) inside = !inside;
  }
  return inside;
}

/** Cached per-stroke lengths so progress maths is not redone every frame. */
const lengthCache = new WeakMap<InkStroke, number[]>();

function cumulativeLengths(stroke: InkStroke): number[] {
  const cached = lengthCache.get(stroke);
  if (cached) return cached;
  const out: number[] = [0];
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1];
    const b = stroke.points[i];
    out.push(out[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  lengthCache.set(stroke, out);
  return out;
}

function strokeLength(stroke: InkStroke): number {
  const c = cumulativeLengths(stroke);
  return c[c.length - 1] ?? 0;
}

const nodeLengthCache = new WeakMap<SceneNode, { total: number; perStroke: number[] }>();

function nodeLengths(node: SceneNode) {
  const cached = nodeLengthCache.get(node);
  if (cached) return cached;
  const perStroke = node.strokes.map((s) => Math.max(strokeLength(s), 1));
  const total = perStroke.reduce((a, b) => a + b, 0);
  const value = { total, perStroke };
  nodeLengthCache.set(node, value);
  return value;
}

/**
 * Paint one node. Returns the current ink frontier in world space when the node
 * is only partly drawn, so the caller can put the pen there.
 */
function paintNode(
  ctx: CanvasRenderingContext2D,
  node: SceneNode,
  dimmed: boolean
): { x: number; y: number } | null {
  if (!node.visible || node.opacity <= 0.01) return null;

  const { total, perStroke } = nodeLengths(node);
  const progress = Math.max(0, Math.min(1, node.drawProgress));
  if (progress <= 0) return null;
  const drawUpTo = progress * total;

  ctx.save();
  const cx = node.localBounds.w / 2;
  const cy = node.localBounds.h / 2;
  ctx.translate(node.transform.x + cx, node.transform.y + cy);
  ctx.rotate(node.transform.rotation);
  ctx.scale(node.transform.scale, node.transform.scale);
  ctx.translate(-cx, -cy);
  ctx.globalAlpha = node.opacity * (dimmed ? 0.22 : 1);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  let consumed = 0;
  let frontier: { x: number; y: number } | null = null;

  for (const [si, stroke] of node.strokes.entries()) {
    const len = perStroke[si];
    if (consumed >= drawUpTo) break;
    const localTarget = Math.min(len, drawUpTo - consumed);
    const complete = localTarget >= len - 0.001;

    if (stroke.fill) {
      // Highlight bands are filled regions, not traced lines.
      if (complete || localTarget > len * 0.15) {
        ctx.beginPath();
        stroke.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = stroke.fill;
        ctx.globalAlpha = node.opacity * (dimmed ? 0.22 : 1) * (complete ? 1 : localTarget / len);
        ctx.fill();
        ctx.globalAlpha = node.opacity * (dimmed ? 0.22 : 1);
      }
      consumed += len;
      continue;
    }

    const cum = cumulativeLengths(stroke);
    ctx.beginPath();
    ctx.strokeStyle = stroke.color ?? node.color;
    ctx.lineWidth = stroke.width;
    ctx.globalAlpha = node.opacity * stroke.opacity * (dimmed ? 0.22 : 1);

    let last = stroke.points[0];
    if (!last) {
      consumed += len;
      continue;
    }
    ctx.moveTo(last.x, last.y);
    for (let i = 1; i < stroke.points.length; i++) {
      const segEnd = cum[i];
      const p = stroke.points[i];
      if (segEnd <= localTarget) {
        ctx.lineTo(p.x, p.y);
        last = p;
      } else {
        // Partial segment: interpolate to the exact frontier.
        const segStart = cum[i - 1];
        const t = (localTarget - segStart) / Math.max(1e-6, segEnd - segStart);
        const px = last.x + (p.x - last.x) * t;
        const py = last.y + (p.y - last.y) * t;
        ctx.lineTo(px, py);
        frontier = { x: px, y: py };
        break;
      }
    }
    ctx.stroke();
    if (!complete && !frontier) frontier = { x: last.x, y: last.y };
    consumed += len;
    if (frontier) break;
  }

  ctx.restore();

  if (!frontier) return null;
  // Convert the frontier back to world space through the node's transform.
  const s = node.transform.scale;
  const r = node.transform.rotation;
  const lx = frontier.x - cx;
  const ly = frontier.y - cy;
  const rx = lx * Math.cos(r) - ly * Math.sin(r);
  const ry = lx * Math.sin(r) + ly * Math.cos(r);
  return {
    x: node.transform.x + cx + rx * s,
    y: node.transform.y + cy + ry * s,
  };
}

/** A minimal glowing pointer dot, drawn in screen space marking the ink frontier. */
function paintPen(ctx: CanvasRenderingContext2D, x: number, y: number, down: boolean): void {
  ctx.save();
  ctx.translate(x, y);

  // Soft ambient outer halo
  ctx.beginPath();
  ctx.arc(0, 0, down ? 7 : 4.5, 0, Math.PI * 2);
  ctx.fillStyle = down ? 'rgba(121, 184, 255, 0.35)' : 'rgba(255, 255, 255, 0.15)';
  ctx.fill();

  // Crisp core pointer dot
  ctx.beginPath();
  ctx.arc(0, 0, down ? 3.5 : 2.5, 0, Math.PI * 2);
  ctx.fillStyle = down ? '#79b8ff' : 'rgba(255, 255, 255, 0.9)';
  ctx.fill();

  ctx.restore();
}

export function BoardCanvas({
  store,
  drawing,
  onManualCamera,
  onZoomChange,
  annotateMode = false,
  onRegionSelected,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null);
  const lastZoomRef = useRef(store.camera.zoom);
  /** World-space points of the lasso currently being drawn, if any. */
  const lassoRef = useRef<Vec2[] | null>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, w, h);

    const cam = store.camera;
    const zoom = cam.zoom;
    if (Math.abs(zoom - lastZoomRef.current) > 0.001) {
      lastZoomRef.current = zoom;
      onZoomChange?.(zoom);
    }
    const offsetX = w / 2 - cam.x * zoom;
    const offsetY = h / 2 - cam.y * zoom;

    // Figma-style infinite dot matrix background.
    const spacing = 64 * zoom;
    if (spacing > 22) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
      const startX = ((offsetX % spacing) + spacing) % spacing;
      const startY = ((offsetY % spacing) + spacing) % spacing;
      for (let x = startX; x < w; x += spacing) {
        for (let y = startY; y < h; y += spacing) {
          ctx.fillRect(x, y, 1.5, 1.5);
        }
      }
    }

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(zoom, zoom);

    let penAt: { x: number; y: number } | null = null;
    for (const node of store.list()) {
      const frontier = paintNode(ctx, node, store.isDimmed(node.id));
      if (frontier) penAt = frontier;
    }
    ctx.restore();

    if (penAt) {
      store.pen = penAt;
      if (drawing) paintPen(ctx, penAt.x * zoom + offsetX, penAt.y * zoom + offsetY, store.penDown);
    }

    const lasso = lassoRef.current;
    if (lasso && lasso.length > 1) {
      ctx.save();
      ctx.beginPath();
      lasso.forEach((p, i) => {
        const sx = p.x * zoom + offsetX;
        const sy = p.y * zoom + offsetY;
        if (i === 0) ctx.moveTo(sx, sy);
        else ctx.lineTo(sx, sy);
      });
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 196, 84, 0.12)';
      ctx.fill();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = 'rgba(255, 196, 84, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }

    frameRef.current = requestAnimationFrame(render);
  }, [store, drawing, onZoomChange]);

  useEffect(() => {
    onZoomChange?.(store.camera.zoom);
  }, [store, onZoomChange]);

  useEffect(() => {
    frameRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frameRef.current);
  }, [render]);

  /* ------------------------------------------------------- interaction */

  const onWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const cam = store.camera;
      const factor = Math.exp(-e.deltaY * 0.0016);
      const nextZoom = Math.max(0.15, Math.min(4, cam.zoom * factor));
      // Keep the world point under the cursor fixed while zooming.
      const worldX = (mx - rect.width / 2) / cam.zoom + cam.x;
      const worldY = (my - rect.height / 2) / cam.zoom + cam.y;
      store.camera = {
        zoom: nextZoom,
        x: worldX - (mx - rect.width / 2) / nextZoom,
        y: worldY - (my - rect.height / 2) / nextZoom,
      };
      store.touch();
      onManualCamera?.();
    },
    [store, onManualCamera]
  );

  /** Screen-space pointer coordinates converted to world space. */
  const toWorld = useCallback(
    (clientX: number, clientY: number): Vec2 | null => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      const cam = store.camera;
      return {
        x: (clientX - rect.left - rect.width / 2) / cam.zoom + cam.x,
        y: (clientY - rect.top - rect.height / 2) / cam.zoom + cam.y,
      };
    },
    [store]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      if (annotateMode) {
        const point = toWorld(e.clientX, e.clientY);
        lassoRef.current = point ? [point] : [];
        return;
      }
      dragRef.current = { x: e.clientX, y: e.clientY, camX: store.camera.x, camY: store.camera.y };
    },
    [store, annotateMode, toWorld]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (annotateMode) {
        if (!lassoRef.current) return;
        const point = toWorld(e.clientX, e.clientY);
        if (!point) return;
        const last = lassoRef.current[lassoRef.current.length - 1];
        // Skip near-duplicate points so a slow drag does not bloat the path.
        if (!last || Math.hypot(point.x - last.x, point.y - last.y) > 4 / store.camera.zoom) {
          lassoRef.current = [...lassoRef.current, point];
        }
        return;
      }
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.x) / store.camera.zoom;
      const dy = (e.clientY - drag.y) / store.camera.zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) onManualCamera?.();
      store.camera = { ...store.camera, x: drag.camX - dx, y: drag.camY - dy };
      store.touch();
    },
    [store, onManualCamera, annotateMode, toWorld]
  );

  /** Minimum enclosed area (world units²) before a lasso counts as a real circle, not a stray click. */
  const MIN_LASSO_AREA = 400;

  const finishLasso = useCallback(() => {
    const points = lassoRef.current;
    lassoRef.current = null;
    if (!points || points.length < 3) return;

    let area = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      area += points[j].x * points[i].y - points[i].x * points[j].y;
    }
    if (Math.abs(area) / 2 < MIN_LASSO_AREA) return;

    const matched = store
      .list()
      .filter((n) => n.visible && n.localBounds.w > 0)
      .filter((n) => {
        const b = worldBounds(n);
        return pointInPolygon({ x: b.x + b.w / 2, y: b.y + b.h / 2 }, points);
      });

    store.selectRegion(points, matched.map((n) => n.id));
    onRegionSelected?.(matched.map((n) => n.semanticRole || n.id));
  }, [store, onRegionSelected]);

  const endDrag = useCallback(() => {
    dragRef.current = null;
    if (annotateMode) finishLasso();
  }, [annotateMode, finishLasso]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className={`board${annotateMode ? ' board--annotate' : ''}`}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={endDrag}
      />
      <MermaidLayer store={store} />
    </>
  );
}
