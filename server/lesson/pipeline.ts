/**
 * NEMO — lesson pipeline.
 *
 *   QUESTION ANALYZER -> PROBLEM SOLVER -> TEACHING PLANNER -> VISUAL DIRECTOR
 *                                                                    |
 *                                                          VISUAL VALIDATION
 *                                                                    |
 *                                                          validated LessonPlan
 *
 * Each stage is its own model call with its own structured contract, so a
 * failure names the stage that produced it. Arithmetic never comes from the
 * model when the deterministic solver can do it.
 */

import type {
  Domain,
  LessonPlan,
  QuestionAnalysis,
  Solution,
  TeachingBeat,
  VisualAction,
} from '../../shared/contracts.ts';
import { LessonError } from '../../shared/contracts.ts';
import { looksLikeEquation, solveEquation } from '../../shared/solver.ts';
import { normaliseBeat, validateAction, validatePlan } from '../../shared/validate.ts';
import { createProvider, extractJson, type LLMProvider, type ProviderConfig } from '../providers/index.ts';
import {
  ANALYZER_SYSTEM,
  SOLVER_SYSTEM,
  analyzerUser,
  directorRepairUser,
  directorSystem,
  directorUser,
  plannerSystem,
  plannerUser,
  solverUser,
} from './prompts.ts';
import { mockPlanFor } from './mockPlans.ts';

export interface PipelineHooks {
  status(stage: string, detail?: string): void;
  signal?: AbortSignal;
}

const DOMAINS: Domain[] = [
  'mathematics',
  'computer_science',
  'physics',
  'chemistry',
  'biology',
  'general',
];

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/* ------------------------------------------------------------- stage 1 */

async function analyze(
  provider: LLMProvider,
  question: string,
  hooks: PipelineHooks
): Promise<QuestionAnalysis> {
  hooks.status('ANALYZING', 'Reading the question');
  const raw = await provider.complete({
    system: ANALYZER_SYSTEM,
    user: analyzerUser(question),
    json: true,
    maxTokens: 800,
    signal: hooks.signal,
  });
  const o = asRecord(extractJson(raw));
  const domain = DOMAINS.includes(o.domain as Domain) ? (o.domain as Domain) : 'general';
  return {
    normalizedQuestion: typeof o.normalizedQuestion === 'string' ? o.normalizedQuestion : question,
    domain,
    intent: typeof o.intent === 'string' ? o.intent : 'understand the topic',
    entities: Array.isArray(o.entities) ? o.entities.filter((e): e is string => typeof e === 'string') : [],
    requestedDepth:
      o.requestedDepth === 'brief' || o.requestedDepth === 'deep' ? o.requestedDepth : 'normal',
    // The deterministic parser, not the model, decides what we can actually solve.
    isEquation: looksLikeEquation(question),
  };
}

/* ------------------------------------------------------------- stage 2 */

async function solve(
  provider: LLMProvider,
  question: string,
  analysis: QuestionAnalysis,
  hooks: PipelineHooks
): Promise<Solution> {
  // A real equation is solved here, not by the model. The model narrates the
  // steps it is given; it never gets to be wrong about the arithmetic.
  if (analysis.isEquation) {
    hooks.status('SOLVING', 'Solving the equation');
    try {
      return solveEquation(question);
    } catch (err) {
      throw new LessonError(
        'UNSUPPORTED',
        `That equation could not be recognised: ${(err as Error).message}`
      );
    }
  }

  hooks.status('SOLVING', 'Working out the answer');
  const raw = await provider.complete({
    system: SOLVER_SYSTEM,
    user: solverUser(question, analysis),
    json: true,
    maxTokens: 1500,
    signal: hooks.signal,
  });
  const o = asRecord(extractJson(raw));
  const steps = Array.isArray(o.steps) ? o.steps : [];
  const parsed = steps.map((s, i) => {
    const r = asRecord(s);
    return {
      step: typeof r.step === 'number' ? r.step : i + 1,
      operation: typeof r.operation === 'string' ? r.operation : '',
      result: typeof r.result === 'string' ? r.result : '',
      reason: typeof r.reason === 'string' ? r.reason : '',
    };
  });
  const answer = typeof o.answer === 'string' ? o.answer : '';
  if (!answer.trim() && parsed.length === 0) {
    throw new LessonError('INVALID_RESPONSE', 'The solver stage returned no answer.');
  }
  return {
    original: question,
    steps: parsed,
    finalAnswer: typeof o.finalAnswer === 'string' && o.finalAnswer ? o.finalAnswer : answer,
    verified: false,
  };
}

/* ------------------------------------------------------------- stage 3 */

interface PlannedBeat {
  beatId: string;
  order: number;
  objective: string;
  explanation: string;
  narration: string;
  completionCriteria: string[];
}

async function plan(
  provider: LLMProvider,
  question: string,
  analysis: QuestionAnalysis,
  solution: Solution,
  hooks: PipelineHooks
): Promise<{ objective: string; finalSummary: string; beats: PlannedBeat[] }> {
  hooks.status('PLANNING', 'Planning how to teach it');
  const raw = await provider.complete({
    system: plannerSystem(),
    user: plannerUser(question, analysis, solution),
    json: true,
    maxTokens: 3000,
    signal: hooks.signal,
  });
  const o = asRecord(extractJson(raw));
  const rawBeats = Array.isArray(o.beats) ? o.beats : [];
  if (rawBeats.length === 0) {
    throw new LessonError('INCOMPLETE_PLAN', 'The teaching planner returned no beats.');
  }
  const beats: PlannedBeat[] = rawBeats.map((b, i) => {
    const r = asRecord(b);
    return {
      beatId: typeof r.beatId === 'string' && r.beatId ? r.beatId : `beat-${i + 1}`,
      order: typeof r.order === 'number' ? r.order : i + 1,
      objective: typeof r.objective === 'string' ? r.objective : '',
      explanation: typeof r.explanation === 'string' ? r.explanation : '',
      narration: typeof r.narration === 'string' ? r.narration : '',
      completionCriteria: Array.isArray(r.completionCriteria)
        ? r.completionCriteria.filter((c): c is string => typeof c === 'string')
        : ['beat_visuals_complete'],
    };
  });
  return {
    objective: typeof o.objective === 'string' ? o.objective : analysis.intent,
    finalSummary: typeof o.finalSummary === 'string' ? o.finalSummary : solution.finalAnswer,
    beats,
  };
}

/* ------------------------------------------------------------- stage 4 */

async function direct(
  provider: LLMProvider,
  question: string,
  analysis: QuestionAnalysis,
  solution: Solution,
  beats: PlannedBeat[],
  hooks: PipelineHooks,
  repairReasons?: string[]
): Promise<{ actionsByBeat: Map<string, VisualAction[]>; reasons: string[] }> {
  hooks.status('DIRECTING', repairReasons ? 'Repairing visual actions' : 'Choosing what to draw');
  const userPrompt = repairReasons
    ? directorRepairUser(question, analysis, solution, beats, repairReasons)
    : directorUser(question, analysis, solution, beats);

  const raw = await provider.complete({
    system: directorSystem(),
    user: userPrompt,
    json: true,
    maxTokens: 4000,
    temperature: 0.2,
    signal: hooks.signal,
  });

  const o = asRecord(extractJson(raw));
  const rawBeats = Array.isArray(o.beats) ? o.beats : [];
  if (rawBeats.length === 0) {
    throw new LessonError('INCOMPLETE_PLAN', 'The visual director returned no visual actions.');
  }

  const actionsByBeat = new Map<string, VisualAction[]>();
  const reasons: string[] = [];

  for (const [i, rb] of rawBeats.entries()) {
    const r = asRecord(rb);
    const beatId =
      typeof r.beatId === 'string' && r.beatId ? r.beatId : beats[i]?.beatId ?? `beat-${i + 1}`;
    const rawActions = Array.isArray(r.visualActions) ? r.visualActions : [];
    const accepted: VisualAction[] = [];
    rawActions.forEach((ra, ai) => {
      const { action, reasons: rs } = validateAction(ra, beatId, ai);
      reasons.push(...rs);
      if (action) accepted.push(action);
    });
    actionsByBeat.set(beatId, accepted);
  }

  return { actionsByBeat, reasons };
}

/* -------------------------------------------------------------- driver */

export interface BuildResult {
  plan: LessonPlan;
  /** Non-fatal validation notes, surfaced in the developer strip. */
  warnings: string[];
  providerName: string;
  model: string;
}

export async function buildLesson(
  cfg: ProviderConfig,
  question: string,
  ids: { lessonId: string; requestId: string },
  hooks: PipelineHooks
): Promise<BuildResult> {
  const trimmed = question.trim();
  if (!trimmed) throw new LessonError('UNSUPPORTED', 'Ask a question first.');

  // Demo Mode: explicitly selected, deterministic, never a fallback.
  if (cfg.provider === 'mock') {
    hooks.status('PLANNING', 'Demo Mode: loading the scripted lesson');
    const plan = mockPlanFor(ids.lessonId, ids.requestId, trimmed);
    const result = validatePlan(plan);
    if (!result.ok) {
      throw new LessonError('INCOMPLETE_PLAN', 'The scripted plan failed validation.', result.reasons);
    }
    return { plan, warnings: result.reasons, providerName: 'mock', model: 'deterministic-mock' };
  }

  const provider = createProvider(cfg);

  const analysis = await analyze(provider, trimmed, hooks);
  throwIfAborted(hooks);

  // Domain guard: fail fast if domain is not currently drawable
  if (analysis.domain === 'biology') {
    throw new LessonError(
      'UNSUPPORTED',
      'Nemo cannot draw biology lessons yet. Try asking a mathematics, computer science, or physics question.'
    );
  }

  const solution = await solve(provider, trimmed, analysis, hooks);
  throwIfAborted(hooks);

  const planned = await plan(provider, trimmed, analysis, solution, hooks);
  throwIfAborted(hooks);

  let { actionsByBeat, reasons } = await direct(
    provider,
    trimmed,
    analysis,
    solution,
    planned.beats,
    hooks
  );
  throwIfAborted(hooks);

  hooks.status('VALIDATING', 'Checking the visual plan');

  const buildBeatsFromMap = (map: Map<string, VisualAction[]>): TeachingBeat[] => {
    return planned.beats.map((b, i) => {
      const actions = map.get(b.beatId) ?? [];
      const { beat } = normaliseBeat(
        {
          beatId: b.beatId,
          order: b.order,
          objective: b.objective,
          explanation: b.explanation,
          narration: b.narration,
          completionCriteria: b.completionCriteria,
          visualActions: actions,
        },
        i
      );
      return beat!;
    });
  };

  let beats = buildBeatsFromMap(actionsByBeat);

  let lessonPlan: LessonPlan = {
    lessonId: ids.lessonId,
    requestId: ids.requestId,
    question: trimmed,
    domain: analysis.domain,
    answer: solution.finalAnswer || planned.objective,
    objective: planned.objective,
    beats,
    finalSummary: planned.finalSummary,
    status: 'READY',
  };

  let validation = validatePlan(lessonPlan);

  // N4: Director Repair Loop — if initial visual plan fails validation, retry once with failure reasons
  if (!validation.ok) {
    hooks.status('VALIDATING', 'Repairing visual plan with failure feedback...');
    try {
      const repairResult = await direct(
        provider,
        trimmed,
        analysis,
        solution,
        planned.beats,
        hooks,
        [...validation.reasons, ...reasons]
      );
      throwIfAborted(hooks);
      const repairedBeats = buildBeatsFromMap(repairResult.actionsByBeat);
      const repairedPlan: LessonPlan = {
        ...lessonPlan,
        beats: repairedBeats,
      };
      const repairedValidation = validatePlan(repairedPlan);
      if (repairedValidation.ok) {
        lessonPlan = repairedPlan;
        validation = repairedValidation;
        reasons = [...reasons, ...repairResult.reasons, 'Visual director repaired plan on retry'];
      }
    } catch {
      // If repair call fails, fall back to initial validation error handling
    }
  }

  if (!validation.ok) {
    throw new LessonError(
      'INCOMPLETE_PLAN',
      `The generated visual plan was incomplete or unsafe: ${validation.reasons.slice(0, 2).join('; ')}. Tip: Try selecting a different model in the Config Panel.`,
      [...validation.reasons, ...reasons].slice(0, 12)
    );
  }

  return {
    plan: lessonPlan,
    warnings: [...reasons, ...validation.reasons].slice(0, 20),
    providerName: provider.name,
    model: provider.model,
  };
}

function throwIfAborted(hooks: PipelineHooks): void {
  if (hooks.signal?.aborted) {
    throw new LessonError('STALE_REQUEST', 'Superseded by a newer question.');
  }
}

/** Standalone solve endpoint (POST /api/solve). */
export function solveOnly(question: string): Solution {
  if (!looksLikeEquation(question)) {
    throw new LessonError(
      'UNSUPPORTED',
      'That input is not a linear equation. /api/solve only handles equations.'
    );
  }
  try {
    return solveEquation(question);
  } catch (err) {
    throw new LessonError('UNSUPPORTED', (err as Error).message);
  }
}
