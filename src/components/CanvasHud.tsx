/**
 * NEMO — Canvas HUD
 *
 * Floating glassmorphism controls overlaying the infinite canvas:
 * Zoom controls (+ / - / %), Recenter / Fit, Drag-to-pan hint, and LessonRail toggle.
 */

import { useCallback } from 'react';
import type { SceneStore } from '../scene/store.ts';

interface Props {
  store: SceneStore;
  zoom: number;
  onManualCamera?: () => void;
  railOpen?: boolean;
  onToggleRail?: () => void;
  hasLesson?: boolean;
  onClearBoard?: () => void;
}

export function CanvasHud({
  store,
  zoom,
  onManualCamera,
  railOpen = true,
  onToggleRail,
  hasLesson = false,
  onClearBoard,
}: Props) {
  const zoomPercent = Math.round(zoom * 100);

  const handleZoomIn = useCallback(() => {
    const cam = store.camera;
    const nextZoom = Math.min(4, cam.zoom * 1.25);
    store.camera = { ...cam, zoom: nextZoom };
    store.touch();
    onManualCamera?.();
  }, [store, onManualCamera]);

  const handleZoomOut = useCallback(() => {
    const cam = store.camera;
    const nextZoom = Math.max(0.15, cam.zoom / 1.25);
    store.camera = { ...cam, zoom: nextZoom };
    store.touch();
    onManualCamera?.();
  }, [store, onManualCamera]);

  const handleResetZoom = useCallback(() => {
    store.camera = { x: 1600 / 2, y: 900 / 2, zoom: 1 };
    store.touch();
    onManualCamera?.();
  }, [store, onManualCamera]);

  return (
    <div className="canvas-hud" role="toolbar" aria-label="Canvas controls">
      <div className="canvas-hud__group">
        <button
          type="button"
          className="canvas-hud__btn"
          onClick={handleZoomOut}
          title="Zoom out (Scroll down)"
          aria-label="Zoom out"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
          </svg>
        </button>

        <button
          type="button"
          className="canvas-hud__zoom-pill"
          onClick={handleResetZoom}
          title="Reset zoom to 100% and center view"
          aria-label={`Current zoom ${zoomPercent}%, click to reset`}
        >
          <span>{zoomPercent}%</span>
        </button>

        <button
          type="button"
          className="canvas-hud__btn"
          onClick={handleZoomIn}
          title="Zoom in (Scroll up)"
          aria-label="Zoom in"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
            <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
          </svg>
        </button>

        <span className="canvas-hud__divider" aria-hidden="true" />

        <button
          type="button"
          className="canvas-hud__btn"
          onClick={handleResetZoom}
          title="Center view (100%)"
          aria-label="Center view"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="7" />
            <line x1="12" y1="2" x2="12" y2="5" strokeLinecap="round" />
            <line x1="12" y1="19" x2="12" y2="22" strokeLinecap="round" />
            <line x1="2" y1="12" x2="5" y2="12" strokeLinecap="round" />
            <line x1="19" y1="12" x2="22" y2="12" strokeLinecap="round" />
          </svg>
        </button>

        {onClearBoard && store.list().length > 0 && (
          <button
            type="button"
            className="canvas-hud__btn"
            onClick={onClearBoard}
            title="Clear board ink"
            aria-label="Clear board"
          >
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
            </svg>
          </button>
        )}
      </div>

      <div className="canvas-hud__hint" aria-hidden="true">
        <span>Drag to pan · Scroll to zoom</span>
      </div>

      {hasLesson && onToggleRail && (
        <button
          type="button"
          className={`canvas-hud__rail-toggle ${railOpen ? 'is-active' : ''}`}
          onClick={onToggleRail}
          title={railOpen ? 'Collapse side panel for full board' : 'Expand side panel'}
          aria-label={railOpen ? 'Collapse side panel' : 'Expand side panel'}
        >
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8">
            <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
            <path d="M15 4.5v15" />
          </svg>
          <span>{railOpen ? 'Hide panel' : 'Show panel'}</span>
        </button>
      )}
    </div>
  );
}

export default CanvasHud;
