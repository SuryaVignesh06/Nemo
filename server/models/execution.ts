/**
 * NEMO — ModelExecutionService.
 *
 * Every model call in the agent graph goes through here. Agents describe what
 * they want; this decides how many times to ask, how long to wait, what counts
 * as an answer, and what to record.
 *
 * The rules it enforces:
 *
 *   - A 200 with empty content is a failure (EMPTY_OUTPUT), never an answer.
 *   - Transport failures retry with exponential backoff + jitter.
 *   - Schema failures do NOT plain-retry — they get one repair prompt that
 *     shows the model its own output and the validation errors. Repeating an
 *     identical prompt just reproduces an identical mistake.
 *   - A configured fallback model is tried only after the primary is exhausted,
 *     and the swap is always recorded, never silent.
 *   - Cancellation wins immediately and is never retried.
 */

import type { z } from 'zod';

import { LessonError } from '../../shared/contracts.ts';
import { extractJson, type LLMProvider } from '../providers/index.ts';
import type { WorkflowTrace } from '../observability/trace.ts';
import {
  classToCode,
  classify,
  isEmptyOutput,
  isRepairable,
  isRetryable,
  type ErrorClass,
} from './errors.ts';

export interface RetryPolicy {
  /** Total attempts per provider, including the first. */
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

export const DEFAULT_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 400,
  maxDelayMs: 4000,
};

/** Read timeout for a single attempt. Separate from the whole-stage budget. */
export const DEFAULT_ATTEMPT_TIMEOUT_MS = 60_000;

export interface ExecuteRequest<T> {
  /** Stage name for the trace, e.g. "solver". */
  stage: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** Base64 PNG frames for a vision-capable stage (the critic). */
  images?: string[];
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ServiceOptions {
  primary: LLMProvider;
  /** Tried only after the primary exhausts its attempts. */
  fallback?: LLMProvider;
  trace: WorkflowTrace;
  retry?: RetryPolicy;
  /** Injected for deterministic tests. */
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** Exponential backoff with full jitter, clamped to the policy ceiling. */
export function backoffDelay(
  attempt: number,
  policy: RetryPolicy,
  random: () => number
): number {
  const ceiling = Math.min(policy.baseDelayMs * 2 ** (attempt - 1), policy.maxDelayMs);
  return Math.round(ceiling * random());
}

/** Compact, model-readable rendering of Zod issues for a repair prompt. */
export function describeIssues(err: z.ZodError): string[] {
  return err.issues.slice(0, 12).map((i) => {
    const path = i.path.length ? i.path.join('.') : '(root)';
    return `${path}: ${i.message}`;
  });
}

function repairPrompt(original: string, raw: string, issues: string[]): string {
  return [
    original,
    '',
    'Your previous reply did not satisfy the required schema.',
    '',
    'Your previous reply:',
    raw.slice(0, 2000),
    '',
    'Schema errors that must be fixed:',
    ...issues.map((i) => `- ${i}`),
    '',
    'Reply again with ONLY the corrected JSON object. No prose, no code fences.',
  ].join('\n');
}

export class ModelExecutionService {
  private primary: LLMProvider;
  private fallback?: LLMProvider;
  private trace: WorkflowTrace;
  private retry: RetryPolicy;
  private sleep: (ms: number) => Promise<void>;
  private random: () => number;

  constructor(opts: ServiceOptions) {
    this.primary = opts.primary;
    this.fallback = opts.fallback;
    this.trace = opts.trace;
    this.retry = opts.retry ?? DEFAULT_RETRY;
    this.sleep = opts.sleep ?? defaultSleep;
    this.random = opts.random ?? Math.random;
  }

  /**
   * Run a request against the primary provider, then the fallback if one is
   * configured, returning the first response that both parses and validates.
   */
  async executeStructured<T>(req: ExecuteRequest<T>): Promise<T> {
    let last: LessonError | null = null;

    for (const [index, provider] of this.providers().entries()) {
      const usingFallback = index > 0;
      try {
        return await this.runProvider(provider, req, usingFallback);
      } catch (err) {
        last = err instanceof LessonError ? err : new LessonError('UNAVAILABLE', String(err));
        // Cancellation and a malformed request are not improved by another provider.
        const cls = classify(last);
        if (cls === 'CANCELLED' || cls === 'INVALID_REQUEST') throw last;
      }
    }

    throw last ?? new LessonError('UNAVAILABLE', `${req.stage} produced no result.`);
  }

  private providers(): LLMProvider[] {
    return this.fallback ? [this.primary, this.fallback] : [this.primary];
  }

  private async runProvider<T>(
    provider: LLMProvider,
    req: ExecuteRequest<T>,
    fallbackUsed: boolean
  ): Promise<T> {
    let repairContext: { raw: string; issues: string[] } | null = null;
    // Grows when a reply is cut off at the limit. Repeating the same request
    // with the same budget just truncates in the same place.
    let budgetMultiplier = 1;

    for (let attempt = 1; attempt <= this.retry.maxAttempts; attempt++) {
      this.throwIfAborted(req.signal);
      const started = Date.now();

      try {
        const user = repairContext
          ? repairPrompt(req.user, repairContext.raw, repairContext.issues)
          : req.user;

        const raw = await provider.complete({
          system: req.system,
          user,
          images: req.images,
          json: true,
          maxTokens: req.maxTokens ? req.maxTokens * budgetMultiplier : undefined,
          temperature: req.temperature,
          timeoutMs: req.timeoutMs ?? DEFAULT_ATTEMPT_TIMEOUT_MS,
          signal: req.signal,
        });

        // Providers already raise EMPTY_RESPONSE, but a silent empty string
        // must never reach a parser.
        if (isEmptyOutput(raw)) {
          throw new LessonError('EMPTY_RESPONSE', `${provider.name} returned no content.`);
        }

        this.trace.recordSample(req.stage, raw);

        const parsed = extractJson(raw, true);
        const result = req.schema.safeParse(parsed);

        if (!result.success) {
          const issues = describeIssues(result.error);
          // One repair pass, then give up on this provider.
          if (!repairContext && attempt < this.retry.maxAttempts) {
            repairContext = { raw, issues };
            this.record(
              req.stage,
              provider,
              attempt,
              started,
              'FAILED',
              'MALFORMED_OUTPUT',
              issues[0],
              fallbackUsed
            );
            continue;
          }
          throw new LessonError(
            'INVALID_RESPONSE',
            `${req.stage} returned JSON that does not match its contract.`,
            issues
          );
        }

        this.record(
          req.stage,
          provider,
          attempt,
          started,
          'SUCCESS',
          undefined,
          undefined,
          fallbackUsed
        );
        return result.data;
      } catch (err) {
        const cls = classify(err);
        const message = err instanceof Error ? err.message : String(err);
        this.record(req.stage, provider, attempt, started, 'FAILED', cls, message, fallbackUsed);

        if (cls === 'CANCELLED') throw err;

        // A truncated reply is worth another attempt, but only with room to
        // finish. Capped so a runaway model cannot escalate without bound.
        if (cls === 'TRUNCATED_OUTPUT') budgetMultiplier = Math.min(budgetMultiplier * 2, 4);

        const canRetry =
          attempt < this.retry.maxAttempts && (isRetryable(cls) || isRepairable(cls));
        if (!canRetry) {
          throw err instanceof LessonError
            ? err
            : new LessonError(classToCode(cls), `${req.stage}: ${message}`);
        }

        await this.sleep(backoffDelay(attempt, this.retry, this.random));
      }
    }

    throw new LessonError(
      'UNAVAILABLE',
      `${req.stage} exhausted ${this.retry.maxAttempts} attempts on ${provider.name}.`
    );
  }

  private record(
    stage: string,
    provider: LLMProvider,
    attempt: number,
    started: number,
    status: 'SUCCESS' | 'FAILED',
    errorClass?: ErrorClass,
    message?: string,
    fallbackUsed?: boolean
  ): void {
    this.trace.recordAttempt({
      stage,
      provider: provider.name,
      model: provider.model,
      attempt,
      durationMs: Date.now() - started,
      status,
      errorClass,
      message,
      fallbackUsed,
    });
  }

  private throwIfAborted(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new LessonError('STALE_REQUEST', 'Superseded by a newer question.');
    }
  }
}
