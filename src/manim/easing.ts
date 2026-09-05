/* ============================================
   Manim Easing Functions
   Ported from manimlib/utils/rate_functions.py
   ============================================ */

/** Linear interpolation */
export function linear(t: number): number {
  return t;
}

/**
 * Manim's signature smooth easing.
 * Zero first and second derivatives at t=0 and t=1.
 * Equivalent to bezier([0, 0, 0, 1, 1, 1])
 */
export function smooth(t: number): number {
  const s = 1 - t;
  return t * t * t * (10 * s * s + 5 * s * t + t * t);
}

/** Accelerating start */
export function rushInto(t: number): number {
  return 2 * smooth(0.5 * t);
}

/** Decelerating end */
export function rushFrom(t: number): number {
  return 2 * smooth(0.5 * (t + 1)) - 1;
}

/** Slow into stop */
export function slowInto(t: number): number {
  return Math.sqrt(1 - (1 - t) * (1 - t));
}

/** Double smooth — smooth in both halves */
export function doubleSmooth(t: number): number {
  if (t < 0.5) {
    return 0.5 * smooth(2 * t);
  }
  return 0.5 * (1 + smooth(2 * t - 1));
}

/** There and back — smooth up then smooth down */
export function thereAndBack(t: number): number {
  const newT = t < 0.5 ? 2 * t : 2 * (1 - t);
  return smooth(newT);
}

/** Elastic ease out */
export function elastic(t: number): number {
  if (t === 0 || t === 1) return t;
  const p = 0.3;
  return Math.pow(2, -10 * t) * Math.sin(((t - p / 4) * (2 * Math.PI)) / p) + 1;
}

/** Bounce ease out */
export function bounce(t: number): number {
  if (t < 1 / 2.75) {
    return 7.5625 * t * t;
  } else if (t < 2 / 2.75) {
    const t2 = t - 1.5 / 2.75;
    return 7.5625 * t2 * t2 + 0.75;
  } else if (t < 2.5 / 2.75) {
    const t2 = t - 2.25 / 2.75;
    return 7.5625 * t2 * t2 + 0.9375;
  } else {
    const t2 = t - 2.625 / 2.75;
    return 7.5625 * t2 * t2 + 0.984375;
  }
}

/** Clamp value to [0, 1] */
export function clamp(val: number): number {
  return Math.max(0, Math.min(1, val));
}

/** Get easing function by name */
export function getEasing(name: string): (t: number) => number {
  const map: Record<string, (t: number) => number> = {
    smooth,
    linear,
    rushInto,
    rushFrom,
    slowInto,
    doubleSmooth,
    thereAndBack,
    elastic,
    bounce,
  };
  return map[name] || smooth;
}
