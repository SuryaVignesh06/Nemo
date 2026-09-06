/**
 * NEMO — workflow entry point.
 *
 * Assembles the graph's dependencies from configuration and runs one request.
 * This is the seam the HTTP layer talks to; it knows about providers, models
 * and the renderer, so app.ts does not have to.
 *
 * Request isolation: the caller owns the AbortSignal, and every model call and
 * the renderer subprocess receive it. A superseded request stops at the next
 * await rather than finishing and overwriting a newer lesson.
 */

import { LessonError, type LessonPlan } from '../../shared/contracts.ts';
import type { AnswerArtifact, NarrationPlan } from '../../shared/agents.ts';
import { createProvider, type ProviderConfig, type ProviderName } from '../providers/index.ts';
import { ModelExecutionService, type RetryPolicy } from '../models/execution.ts';
import { WorkflowTrace } from '../observability/trace.ts';
import { ManimGLRenderer } from '../rendering/manimgl.ts';
import { buildGraph, type RenderService } from './graph.ts';
import { MAX_VISUAL_REPAIR_ITERATIONS, type NemoStateType } from './state.ts';

export interface RunRequest {
  question: string;
  requestId: string;
  sessionId: string;
  lessonId: string;
  provider: ProviderConfig;
  signal?: AbortSignal;
  status(stage: string, detail?: string): void;
  /**
   * Receives the compiled lesson the moment it is valid, before any render or
   * review. The HTTP layer streams it straight to the board so drawing starts
   * immediately; a later repair arrives as a higher revision.
   */
  onPlan?(plan: LessonPlan, revision: number): void;
  /** Receives the complete written answer before visual planning starts. */
  onAnswer?(answer: AnswerArtifact): void;
  /**
   * Render through ManimGL and run the critic/repair loop. Off by default for
   * a live request (it costs ~20s before anything is drawn); on for demos.
   */
  review?: boolean;
  /** Merge planner+composer into one call. Defaults on; NEMO_ECONOMY=0 disables. */
  economy?: boolean;
}

export interface RunResult {
  plan: LessonPlan;
  /** The complete written answer, independent of whether drawing succeeded. */
  answer: AnswerArtifact | null;
  narration: NarrationPlan | null;
  warnings: string[];
  trace: WorkflowTrace;
  visited: string[];
  reviewScore: number | null;
  repairIterations: number;
}

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function retryPolicy(): RetryPolicy {
  return {
    // Each attempt spends a request from the key's budget, so the default is
    // deliberately low. Raise MODEL_MAX_RETRIES on a paid key.
    maxAttempts: intFromEnv('MODEL_MAX_RETRIES', 2),
    baseDelayMs: intFromEnv('MODEL_RETRY_BASE_MS', 400),
    maxDelayMs: intFromEnv('MODEL_RETRY_MAX_MS', 4000),
  };
}

/**
 * A configured fallback, or none.
 *
 * Deliberately opt-in: silently answering from a different model than the
 * operator configured is worse than failing, so a fallback exists only when
 * MODEL_FALLBACK_PROVIDER is set, and every use of it is recorded in the trace.
 */
function fallbackConfig(primary: ProviderConfig): ProviderConfig | null {
  const provider = process.env.MODEL_FALLBACK_PROVIDER as ProviderName | undefined;
  if (!provider || provider === primary.provider) return null;
  const keys: Record<string, string | undefined> = {
    zai: process.env.ZAI_API_KEY,
    openrouter: process.env.OPENROUTER_API_KEY,
    gemini: process.env.GEMINI_API_KEY,
  };
  const apiKey = keys[provider];
  if (!apiKey) return null;
  return { provider, apiKey, model: process.env.MODEL_FALLBACK_MODEL };
}

/**
 * Whether to render and review at all on this request.
 *
 * Default off: the live path must put ink on the board in seconds. Set
 * NEMO_REVIEW=1 to run the ManimGL render and critic/repair loop inline.
 */
/**
 * Economy mode is ON by default.
 *
 * The separate Visual Planner produces better lessons, but it costs a fourth
 * model request, and on a free key the daily request count runs out long before
 * quality becomes the limiting factor. Set NEMO_ECONOMY=0 for the full pipeline.
 */
function economyDefault(): boolean {
  const flag = process.env.NEMO_ECONOMY;
  return !(flag === '0' || flag === 'false');
}

function reviewDefault(): boolean {
  const flag = process.env.NEMO_REVIEW;
  return flag === '1' || flag === 'true';
}

/**
 * Whether the critic may call a vision model.
 *
 * Off by default for the mock provider and wherever no vision model is
 * configured: the critic then runs on deterministic measurements alone, which
 * still catches clipping, overlap and blank boards.
 */
function criticEnabled(cfg: ProviderConfig): boolean {
  if (cfg.provider === 'mock') return false;
  const flag = process.env.NEMO_VISION_CRITIC;
  if (flag === '0' || flag === 'false') return false;
  return true;
}

export async function runWorkflow(
  req: RunRequest,
  renderer?: RenderService
): Promise<RunResult> {
  const question = req.question.trim();
  if (!question) throw new LessonError('UNSUPPORTED', 'Ask a question first.');

  const trace = new WorkflowTrace(
    req.requestId,
    req.sessionId,
    process.env.NEMO_DEBUG === '1'
  );

  const primary = createProvider(req.provider);
  const fb = fallbackConfig(req.provider);

  const models = new ModelExecutionService({
    primary,
    fallback: fb ? createProvider(fb) : undefined,
    trace,
    retry: retryPolicy(),
  });

  const graph = buildGraph({
    models,
    signal: req.signal,
    status: req.status,
    renderer:
      renderer ??
      new ManimGLRenderer({
        timeoutMs: intFromEnv('MANIMGL_TIMEOUT_MS', 240_000),
      }),
    criticEnabled: criticEnabled(req.provider),
    reviewEnabled: req.review ?? reviewDefault(),
    onPlan: req.onPlan,
    onAnswer: req.onAnswer,
    economy: req.economy ?? economyDefault(),
  });

  let final: NemoStateType;
  try {
    final = (await graph.invoke({
      question,
      requestId: req.requestId,
      sessionId: req.sessionId,
      lessonId: req.lessonId,
      maxIterations: intFromEnv(
        'VISUAL_REPAIR_MAX_ITERATIONS',
        MAX_VISUAL_REPAIR_ITERATIONS
      ),
    })) as NemoStateType;
  } catch (err) {
    // The trace is most valuable on the path that failed: it names the stage,
    // the attempt and the error class. Printing it only on success meant every
    // real failure arrived with the least information.
    if (process.env.NEMO_DEBUG === '1') console.log(trace.format());
    throw err;
  }

  if (req.signal?.aborted) {
    throw new LessonError('STALE_REQUEST', 'Superseded by a newer question.');
  }
  if (!final.lessonPlan) {
    throw new LessonError(
      'INCOMPLETE_PLAN',
      final.errorMessage ?? 'The workflow finished without producing a lesson.',
      final.warnings
    );
  }

  // Log the per-stage report so a failure names the component, not the pipeline.
  if (process.env.NEMO_DEBUG === '1') console.log(trace.format());

  return {
    plan: final.lessonPlan,
    answer: final.answer,
    narration: final.narration,
    warnings: final.warnings,
    trace,
    visited: final.visited,
    reviewScore: final.review?.score ?? null,
    repairIterations: final.iteration,
  };
}
