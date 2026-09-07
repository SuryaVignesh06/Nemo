/**
 * NEMO — Shine Border.
 *
 * A port of Magic UI's `ShineBorder`: a coloured light travelling around the
 * edge of whatever it is dropped into.
 *
 * The reference paints a moving radial gradient into a box whose own middle is
 * punched out with `mask-composite: xor`, so only the border ring shows. That
 * technique is CSS, not Tailwind, so it carries over exactly — what changes is
 * the packaging: no `cn`, no class strings, and the duration and colours are
 * passed as custom properties so one stylesheet rule can serve every instance.
 *
 * The host element must be positioned; the border is an inset overlay and
 * never takes a pointer event.
 */

interface Props {
  /** Two or more colours to cycle through. */
  shineColor?: string[];
  /** Seconds for one full travel. */
  duration?: number;
  /** Ring thickness in pixels. */
  borderWidth?: number;
  /** Must match the host's radius, or the ring will not sit on its edge. */
  radius?: number | string;
  className?: string;
}

const DEFAULT_COLORS = ['#A07CFE', '#FE8FB5', '#FFBE7B'];

export function ShineBorder({
  shineColor = DEFAULT_COLORS,
  duration = 14,
  borderWidth = 1,
  radius = 'inherit',
  className = '',
}: Props) {
  const colors = Array.isArray(shineColor) && shineColor.length ? shineColor : DEFAULT_COLORS;

  return (
    <div
      className={`shine-border ${className}`.trim()}
      aria-hidden="true"
      style={
        {
          '--shine-width': `${borderWidth}px`,
          '--shine-duration': `${duration}s`,
          '--shine-radius': typeof radius === 'number' ? `${radius}px` : radius,
          // The reference's gradient: a soft light that sweeps the ring,
          // transparent everywhere it is not.
          backgroundImage: `radial-gradient(transparent, transparent, ${colors.join(', ')}, transparent, transparent)`,
        } as React.CSSProperties
      }
    />
  );
}

export default ShineBorder;
