/**
 * NEMO — Text Animate (blurInUp, by character).
 *
 * A port of Magic UI's `TextAnimate` in the one configuration the chat uses:
 * each character rises into place out of a blur, staggered across the line.
 *
 * The reference drives this with framer-motion variants and a `once` flag;
 * here it is a per-character CSS animation with a staggered `animation-delay`,
 * which is the same motion at a fraction of the cost — and the cost matters,
 * because a streamed reply re-renders on every token.
 *
 * Streaming is what the port has to solve that the reference does not. The
 * demo animates a finished string once; a model reply grows a few characters
 * at a time, so a naive port restarts the whole line's animation on every
 * token and the text visibly strobes. Characters already on screen are
 * therefore left alone — `animated` tracks how far the animation has run, and
 * only the characters past that point are given a fresh delay. That is exactly
 * what the reference's `once` means, applied to a string that is still
 * arriving.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  children: string;
  /** Seconds between one character starting and the next. */
  stagger?: number;
  /** Disables the animation entirely — for text that was never streamed. */
  animate?: boolean;
  className?: string;
}

/** Past this, a paragraph animates as one block: 900 spans is not worth it. */
const MAX_ANIMATED_CHARS = 420;

export function TextAnimate({ children, stagger = 0.012, animate = true, className = '' }: Props) {
  const text = children ?? '';
  /* How much of the text has already played. Held in a ref as well as state
     because the render below needs the value from the same tick it is set. */
  const playedRef = useRef(0);
  const [, force] = useState(0);

  useEffect(() => {
    if (playedRef.current !== text.length) {
      playedRef.current = text.length;
      // A shorter string means a new message reused this node; replay it.
      force((n) => n + 1);
    }
  }, [text]);

  if (!animate || text.length > MAX_ANIMATED_CHARS) {
    return <span className={className}>{text}</span>;
  }

  const chars = Array.from(text);
  return (
    <span className={`text-animate ${className}`.trim()} aria-label={text}>
      {chars.map((char, index) => (
        <span
          key={index}
          className="text-animate__char"
          aria-hidden="true"
          style={{ animationDelay: `${(index % 60) * stagger}s` }}
        >
          {/* A plain space collapses inside an inline-block. */}
          {char === ' ' ? ' ' : char}
        </span>
      ))}
    </span>
  );
}

export default TextAnimate;
