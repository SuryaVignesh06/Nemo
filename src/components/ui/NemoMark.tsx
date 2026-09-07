export interface NemoMarkProps {
  size?: number;
  className?: string;
  animated?: boolean;
  state?: string;
  noContainer?: boolean;
}

/**
 * NEMO — the official pixel-art 'N' brand logo matching the user's image.
 * 5x5 pixel matrix with four horizontal color tiers:
 * - Top: Sky / periwinkle blue (#7AB7FF, #4DA6E6)
 * - Upper-mid: Teal (#379590)
 * - Lower-mid: Amber gold (#E2A33C)
 * - Bottom: Coral pink / red (#F2244F)
 */
export function NemoMark({
  size = 28,
  className = '',
  animated = true,
  noContainer = false,
}: NemoMarkProps) {
  return (
    <span
      className={`nemo-mark ${animated ? 'is-animated' : ''} ${className}`.trim()}
      style={
        noContainer
          ? {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: size,
              height: size,
              background: 'transparent',
              border: 'none',
              boxShadow: 'none',
              padding: 0,
              flexShrink: 0,
            }
          : {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: size,
              height: size,
              borderRadius: Math.max(4, Math.round(size * 0.2)),
              background: '#16171A',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: Math.max(2, Math.round(size * 0.12)),
              boxSizing: 'border-box',
              overflow: 'hidden',
              flexShrink: 0,
            }
      }
      role="img"
      aria-label="NEMO"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 5 5"
        width="100%"
        height="100%"
        shapeRendering="crispEdges"
        style={{ display: 'block', width: '100%', height: '100%' }}
      >
        {/* Row 0: Light sky blue */}
        <rect x="0" y="0" width="1" height="1" fill="#7AB7FF" />
        <rect x="4" y="0" width="1" height="1" fill="#7AB7FF" />

        {/* Row 1: Bright blue / transition */}
        <rect x="0" y="1" width="1" height="1" fill="#4DA6E6" />
        <rect x="1" y="1" width="1" height="1" fill="#4DA6E6" />
        <rect x="4" y="1" width="1" height="1" fill="#4DA6E6" />

        {/* Row 2: Teal */}
        <rect x="0" y="2" width="1" height="1" fill="#379590" />
        <rect x="2" y="2" width="1" height="1" fill="#379590" />
        <rect x="4" y="2" width="1" height="1" fill="#379590" />

        {/* Row 3: Amber / Gold */}
        <rect x="0" y="3" width="1" height="1" fill="#E2A33C" />
        <rect x="3" y="3" width="1" height="1" fill="#E2A33C" />
        <rect x="4" y="3" width="1" height="1" fill="#E2A33C" />

        {/* Row 4: Coral Red */}
        <rect x="0" y="4" width="1" height="1" fill="#F2244F" />
        <rect x="4" y="4" width="1" height="1" fill="#F2244F" />
      </svg>
    </span>
  );
}

export default NemoMark;
