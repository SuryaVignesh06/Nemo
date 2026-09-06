/**
 * NEMO — workflow tracing.
 *
 * Records one line per model attempt and per deterministic stage so a failed
 * lesson names the component that failed rather than the whole pipeline. This
 * is what turns "the request timed out" into "Visual Planner, attempt 2,
 * EMPTY_OUTPUT after 3.07s".
 *
 * Nothing here ever holds an API key. Raw model text is kept only when debug
 * mode is on, and only truncated.
 */

import type { ErrorClass } from '../models/errors.ts';

export type AttemptStatus = 'SUCCESS' | 'FAILED';

export interface AttemptRecord {
  /** Agent / stage name, e.g. "solver". */
  stage: string;
  provider: string;
  model: string;
  attempt: number;
  durationMs: number;
  status: AttemptStatus;
  errorClass?: ErrorClass;
  message?: string;
  /** Set when this attempt ran on a configured fallback rather than the primary. */
  fallbackUsed?: boolean;
  promptTokens?: number;
  completionTokens?: number;
}

export interface StageRecord {
  stage: string;
  durationMs: number;
  status: AttemptStatus;
  detail?: string;
}

export class WorkflowTrace {
  readonly requestId: string;
  readonly sessionId: string;
  readonly attempts: AttemptRecord[] = [];
  readonly stages: StageRecord[] = [];
  private readonly startedAt = Date.now();
  private readonly debug: boolean;
  private readonly samples: Array<{ stage: string; sample: string }> = [];

  constructor(requestId: string, sessionId: string, debug = false) {
    this.requestId = requestId;
    this.sessionId = sessionId;
    this.debug = debug;
  }

  recordAttempt(r: AttemptRecord): void {
    this.attempts.push(r);
  }

  recordStage(r: StageRecord): void {
    this.stages.push(r);
  }

  /** Truncated raw output, retained only in debug mode for diagnosis. */
  recordSample(stage: string, raw: string): void {
    if (!this.debug) return;
    this.samples.push({ stage, sample: raw.slice(0, 400) });
  }

  get totalMs(): number {
    return Date.now() - this.startedAt;
  }

  /** Retry count beyond the first attempt, across every stage. */
  get retryCount(): number {
    return this.attempts.filter((a) => a.attempt > 1).length;
  }

  /** Human-readable report, in the shape the build brief asks for. */
  format(): string {
    const lines: string[] = [
      `REQUEST ${this.requestId.slice(0, 8)}`,
      '─'.repeat(32),
      '',
    ];
    for (const a of this.attempts) {
      lines.push(a.stage);
      lines.push(`  provider: ${a.provider}`);
      lines.push(`  model: ${a.model}`);
      lines.push(`  attempt: ${a.attempt}`);
      lines.push(`  duration: ${(a.durationMs / 1000).toFixed(2)}s`);
      lines.push(`  status: ${a.status === 'SUCCESS' ? 'SUCCESS' : a.errorClass}`);
      if (a.fallbackUsed) lines.push('  fallback: yes');
      lines.push('');
    }
    for (const s of this.stages) {
      lines.push(s.stage);
      lines.push(`  duration: ${(s.durationMs / 1000).toFixed(2)}s`);
      lines.push(`  status: ${s.status}${s.detail ? ` (${s.detail})` : ''}`);
      lines.push('');
    }
    lines.push(`TOTAL ${(this.totalMs / 1000).toFixed(2)}s`);
    return lines.join('\n');
  }

  /** Structured form for the developer strip / debug endpoint. */
  toJSON(): Record<string, unknown> {
    return {
      requestId: this.requestId,
      sessionId: this.sessionId,
      totalMs: this.totalMs,
      retryCount: this.retryCount,
      attempts: this.attempts,
      stages: this.stages,
      ...(this.debug ? { samples: this.samples } : {}),
    };
  }
}
