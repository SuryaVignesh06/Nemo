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
import type { InkStroke, SceneNode } from '../../shared/contracts.ts';
import type { SceneStore } from '../scene/store.ts';

interface Props {
  store: SceneStore;
  /** Set while a lesson is drawing, so the pen is shown. */
  drawing: boolean;
  onManualCamera?: () => void;
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

export function BoardCanvas({ store, drawing, onManualCamera }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef(0);
  const dragRef = useRef<{ x: number; y: number; camX: number; camY: number } | null>(null);

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

    frameRef.current = requestAnimationFrame(render);
  }, [store, drawing]);

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

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      dragRef.current = { x: e.clientX, y: e.clientY, camX: store.camera.x, camY: store.camera.y };
    },
    [store]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.x) / store.camera.zoom;
      const dy = (e.clientY - drag.y) / store.camera.zoom;
      if (Math.abs(dx) + Math.abs(dy) > 2) onManualCamera?.();
      store.camera = { ...store.camera, x: drag.camX - dx, y: drag.camY - dy };
      store.touch();
    },
    [store, onManualCamera]
  );

  const endDrag = useCallback(() => {
    dragRef.current = null;
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="board"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onPointerLeave={endDrag}
    />
  );
}
