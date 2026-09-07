import { useEffect, useRef, useState } from 'react';

interface PixelShineBorderProps {
  className?: string;
  borderRadius?: number;
  duration?: number;
  borderWidth?: number;
}

/**
 * NEMO — Pixel Outline Shine Border
 *
 * Renders an authentic pixelated outline with traveling square pixel dashes
 * and radiant glowing pixel shimmer in NEMO's signature color spectrum.
 */
export function PixelShineBorder({
  className = '',
  borderRadius = 999,
  duration = 8,
  borderWidth = 1.5,
}: PixelShineBorderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { width, height } = size;
  const radius = Math.min(borderRadius, Math.floor(height / 2));
  const inset = Math.ceil(borderWidth / 2);

  return (
    <div
      ref={containerRef}
      className={`nemo-pixel-shine-border ${className}`.trim()}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        borderRadius: radius,
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {width > 0 && height > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ display: 'block', width: '100%', height: '100%', overflow: 'visible' }}
        >
          <defs>
            <linearGradient id="nemo-pixel-shine-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#7AB7FF" />
              <stop offset="25%" stopColor="#4DA6E6" />
              <stop offset="50%" stopColor="#379590" />
              <stop offset="75%" stopColor="#E2A33C" />
              <stop offset="100%" stopColor="#F2244F" />
            </linearGradient>

            <filter id="nemo-pixel-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          {/* Glowing pixel outline underlay */}
          <rect
            x={inset}
            y={inset}
            width={Math.max(0, width - inset * 2)}
            height={Math.max(0, height - inset * 2)}
            rx={Math.max(0, radius - inset)}
            ry={Math.max(0, radius - inset)}
            fill="none"
            stroke="url(#nemo-pixel-shine-gradient)"
            strokeWidth={borderWidth + 1}
            strokeDasharray="4 4"
            strokeLinecap="square"
            shapeRendering="crispEdges"
            filter="url(#nemo-pixel-glow)"
            opacity="0.7"
            className="nemo-pixel-shine-anim"
            style={{ animationDuration: `${duration}s` }}
          />

          {/* Crisp pixel outline foreground */}
          <rect
            x={inset}
            y={inset}
            width={Math.max(0, width - inset * 2)}
            height={Math.max(0, height - inset * 2)}
            rx={Math.max(0, radius - inset)}
            ry={Math.max(0, radius - inset)}
            fill="none"
            stroke="url(#nemo-pixel-shine-gradient)"
            strokeWidth={borderWidth}
            strokeDasharray="4 4"
            strokeLinecap="square"
            shapeRendering="crispEdges"
            className="nemo-pixel-shine-anim"
            style={{ animationDuration: `${duration}s` }}
          />
        </svg>
      )}
    </div>
  );
}

export default PixelShineBorder;
