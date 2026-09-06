/**
 * NEMO — model failure classification.
 *
 * The pipeline already speaks `FailureCode` (shared/contracts.ts) and that stays
 * the user-facing taxonomy. This module adds the orthogonal question the
 * reliability layer actually needs to answer:
 *
 *     "is another attempt worth making?"
 *
 * A code can be perfectly descriptive and still be pointless to retry
 * (MISSING_CREDENTIALS), or vague and worth one more go (EMPTY_RESPONSE). Those
 * are different axes, so they are modelled separately rather than overloading
 * FailureCode with retry semantics.
 */

import { LessonError, type FailureCode } from '../../shared/contracts.ts';

/** Section: MODEL_RELIABILITY_LAYER error classes. */
export type ErrorClass =
  | 'TRANSIENT_NETWORK'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'AUTHENTICATION'
  | 'INVALID_REQUEST'
  | 'PROVIDER_ERROR'
  | 'EMPTY_OUTPUT'
  | 'TRUNCATED_OUTPUT'
  | 'MALFORMED_OUTPUT'
  | 'VALIDATION_ERROR'
  | 'CANCELLED'
  | 'UNKNOWN';

/**
 * Retry only what a second identical attempt could plausibly fix.
 *
 * VALIDATION_ERROR is deliberately absent: the model answered, we understood the
 * answer, and the answer was wrong. Repeating the same prompt repeats the same
 * mistake — that case is handled by a *repair* prompt, not a retry.
 */
const RETRYABLE: ReadonlySet<ErrorClass> = new Set<ErrorClass>([
  'TRANSIENT_NETWORK',
  'TIMEOUT',
  'RATE_LIMIT',
  'PROVIDER_ERROR',
  'EMPTY_OUTPUT',
  // Retryable, but only with a larger token budget — see execution.ts.
  'TRUNCATED_OUTPUT',
]);

/** MALFORMED_OUTPUT is retryable, but only through a repair prompt. */
const REPAIRABLE: ReadonlySet<ErrorClass> = new Set<ErrorClass>(['MALFORMED_OUTPUT']);

const CODE_TO_CLASS: Record<FailureCode, ErrorClass> = {
  MISSING_CREDENTIALS: 'AUTHENTICATION',
  EMPTY_RESPONSE: 'EMPTY_OUTPUT',
  TRUNCATED_OUTPUT: 'TRUNCATED_OUTPUT',
  INVALID_RESPONSE: 'MALFORMED_OUTPUT',
  TIMEOUT: 'TIMEOUT',
  RATE_LIMIT: 'RATE_LIMIT',
  UNAVAILABLE: 'TRANSIENT_NETWORK',
  INCOMPLETE_PLAN: 'VALIDATION_ERROR',
  UNKNOWN_CAPABILITY: 'VALIDATION_ERROR',
  RAW_CODE_REJECTED: 'VALIDATION_ERROR',
  STALE_REQUEST: 'CANCELLED',
  UNSUPPORTED: 'INVALID_REQUEST',
};

export function classify(err: unknown): ErrorClass {
  if (err instanceof LessonError) return CODE_TO_CLASS[err.code] ?? 'UNKNOWN';
  const e = err as { name?: string; message?: string };
  if (e?.name === 'AbortError') return 'CANCELLED';
  if (typeof e?.message === 'string' && /timed? ?out/i.test(e.message)) return 'TIMEOUT';
  if (typeof e?.message === 'string' && /fetch failed|ECONN|ENOTFOUND|socket/i.test(e.message)) {
    return 'TRANSIENT_NETWORK';
  }
  return 'UNKNOWN';
}

export function isRetryable(cls: ErrorClass): boolean {
  return RETRYABLE.has(cls);
}

export function isRepairable(cls: ErrorClass): boolean {
  return REPAIRABLE.has(cls);
}

/** The FailureCode a given class should surface as, when it ends an attempt chain. */
export function classToCode(cls: ErrorClass): FailureCode {
  switch (cls) {
    case 'AUTHENTICATION':
      return 'MISSING_CREDENTIALS';
    case 'EMPTY_OUTPUT':
      return 'EMPTY_RESPONSE';
    case 'TRUNCATED_OUTPUT':
      return 'TRUNCATED_OUTPUT';
    case 'MALFORMED_OUTPUT':
      return 'INVALID_RESPONSE';
    case 'TIMEOUT':
      return 'TIMEOUT';
    case 'RATE_LIMIT':
      return 'RATE_LIMIT';
    case 'CANCELLED':
      return 'STALE_REQUEST';
    case 'VALIDATION_ERROR':
      return 'INCOMPLETE_PLAN';
    case 'INVALID_REQUEST':
      return 'UNSUPPORTED';
    case 'TRANSIENT_NETWORK':
    case 'PROVIDER_ERROR':
    case 'UNKNOWN':
      return 'UNAVAILABLE';
  }
}

/**
 * Detect a "successful" provider response that carries no usable content.
 * HTTP 200 with an empty message is a failure, not an answer.
 */
export function isEmptyOutput(raw: string | null | undefined): boolean {
  return !raw || raw.trim().length === 0;
}
