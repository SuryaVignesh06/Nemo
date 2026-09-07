import * as React from 'react';

export interface PulsatingBorderProps {
  colors?: string[];
  colorBack?: string;
  speed?: number;
  radius?: number | string;
  thickness?: number;
  softness?: number;
  intensity?: number;
  bloom?: number;
  spotSize?: number;
  spread?: number;
  className?: string;
  style?: React.CSSProperties;
}

const DEFAULT_COLORS = ['#4DA6E6', '#A07CFE', '#FE8FB5', '#FFBE7B', '#379590'];

/**
 * NEMO — Pulsating Border.
 *
 * Engineered to perfectly trace the exact border geometry of its host panel
 * (such as the LessonRail Matter Panel) with 100% precision:
 * - Direct in-flow overlay with `inset: 0` and `border-radius: inherit`
 * - Resizes synchronously with CSS height transitions and transforms
 * - Zero coordinate drift, zero portalling detachment
 * - Rich traveling gradient light with soft ambient drop-shadow bloom
 */
export function PulsatingBorder({
  colors = DEFAULT_COLORS,
  speed = 1,
  radius = 'inherit',
  thickness = 1.5,
  bloom = 16,
  className = '',
  style,
}: PulsatingBorderProps) {
  const activeColors = Array.isArray(colors) && colors.length ? colors : DEFAULT_COLORS;
  const duration = Math.max(4, Math.round(9 / (speed || 1)));

  return (
    <div
      className={`rail-pulsating-border ${className}`.trim()}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        borderRadius: typeof radius === 'number' ? `${radius}px` : radius,
        border: `${thickness}px solid transparent`,
        backgroundImage: `radial-gradient(transparent, transparent, ${activeColors.join(', ')}, transparent, transparent)`,
        backgroundSize: '300% 300%',
        backgroundPosition: '0 0',
        backgroundRepeat: 'no-repeat',
        WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
        WebkitMaskComposite: 'xor',
        maskComposite: 'exclude',
        pointerEvents: 'none',
        zIndex: 1,
        animation: `shine-travel ${duration}s infinite linear, rail-pulse-glow 3.2s ease-in-out infinite alternate`,
        filter: `drop-shadow(0 0 ${Math.round(bloom * 0.35)}px rgba(160, 124, 254, 0.5)) drop-shadow(0 0 ${Math.round(bloom * 0.75)}px rgba(77, 166, 230, 0.3))`,
        ...style,
      }}
    />
  );
}

export default PulsatingBorder;
