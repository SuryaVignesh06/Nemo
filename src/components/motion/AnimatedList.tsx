/**
 * NEMO — Animated List.
 *
 * A port of Magic UI's `AnimatedList`: children arrive one at a time on a
 * fixed interval, newest at the top, each entering with a spring-ish pop and
 * pushing the rest down.
 *
 * The reference is Tailwind + framer-motion + `AnimatePresence`; this project
 * has neither, so the same motion is expressed as a CSS keyframe on mount and
 * a layout transition on the items below it. That is not a shortcut — a list
 * that only ever prepends does not need presence tracking, and the entry
 * animation is one keyframe either way.
 *
 * Unlike the reference, the item list is the caller's live data rather than a
 * looped demo array: NEMO shows the agent's real steps as they happen, so the
 * `delay` is a cap on how fast a burst of steps may appear, not a metronome
 * driving fake ones.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';

interface Props {
  children: ReactNode[];
  /** Minimum gap between two items appearing, in ms. */
  delay?: number;
  /** Newest item at the top (the reference's behaviour). */
  newestFirst?: boolean;
  className?: string;
  /** Cap on how many items are kept on screen at once. */
  max?: number;
}

export function AnimatedList({
  children,
  delay = 420,
  newestFirst = true,
  className = '',
  max = 6,
}: Props) {
  /*
   * Items are revealed on a timer rather than all at once.
   *
   * The agent can emit three steps in the same tick — planning, then solving,
   * then drawing — and dropping all three in together loses the sense of a
   * process unfolding, which is the whole point of the animation.
   */
  const [shown, setShown] = useState(() => Math.min(children.length, 1));
  const timer = useRef<number>(0);

  useEffect(() => {
    if (shown >= children.length) {
      // A reset (a new lesson) shrinks the list under the cursor.
      if (shown > children.length) setShown(children.length);
      return;
    }
    timer.current = window.setTimeout(() => setShown((n) => n + 1), delay);
    return () => window.clearTimeout(timer.current);
  }, [shown, children.length, delay]);

  const visible = children.slice(0, shown);
  const windowed = visible.slice(Math.max(0, visible.length - max));
  const ordered = newestFirst ? [...windowed].reverse() : windowed;

  return (
    <div className={`animated-list ${className}`.trim()}>
      {ordered.map((child, index) => (
        <div
          /* Keyed by the item's position in the source list, so an item keeps
             its identity — and does not replay its entry animation — when
             something new is prepended above it. */
          key={`${windowed.length - 1 - index}`}
          className="animated-list__item"
        >
          {child}
        </div>
      ))}
    </div>
  );
}

export default AnimatedList;
