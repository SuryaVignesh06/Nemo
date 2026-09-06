/**
 * NEMO — workflow state.
 *
 * The single state object the graph threads through every node.
 *
 * Deliberately, this file is the ONLY place LangGraph's Annotation type appears
 * alongside Nemo's artifacts. The artifacts themselves (shared/agents.ts) know
 * nothing about the orchestrator, so replacing LangGraph means rewriting this
 * file and graph.ts, and nothing else.
 *
 * Raw provider responses are not stored here. Normalised artifacts go in state;
 * raw text lives only in the trace, and only in debug mode.
 */

import { Annotation } from '@langchain/langgraph';

import type {
  AnswerArtifact,
  NarrationPlan,
  RepairPlan,
  SceneCompositionPlan,
  TeachingPlan,
  VisualPlan,
  VisualReview,
} from '../../shared/agents.ts';
import type { LessonPlan } from '../../shared/contracts.ts';
import type { RenderEvidence } from '../rendering/evidence.ts';

/** High-level progress, surfaced to the UI. Never internal reasoning. */
export type WorkflowStatus =
  | 'UNDERSTANDING'
  | 'SOLVING'
  | 'PLANNING'
  | 'DESIGNING_VISUALS'
  | 'COMPOSING'
  | 'VALIDATING'
  | 'RENDERING'
  | 'REVIEWING'
  | 'REPAIRING'
  | 'NARRATING'
  | 'READY'
  | 'ERROR';

/** Default from the brief. Never an unbounded loop. */
export const MAX_VISUAL_REPAIR_ITERATIONS = 2;

/** Last-write-wins for scalar fields; the graph is linear so this is safe. */
function replace<T>() {
  return {
    reducer: (_prev: T, next: T) => next,
  };
}

function appendList<T>() {
  return {
    reducer: (prev: T[], next: T[]) => [...prev, ...next],
    default: (): T[] => [],
  };
}

export const NemoState = Annotation.Root({
  /* ------------------------------------------------------------ request */
  question: Annotation<string>(replace<string>()),
  requestId: Annotation<string>(replace<string>()),
  sessionId: Annotation<string>(replace<string>()),
  lessonId: Annotation<string>(replace<string>()),

  /* ---------------------------------------------------------- artifacts */
  answer: Annotation<AnswerArtifact | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  teaching: Annotation<TeachingPlan | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  visual: Annotation<VisualPlan | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  composition: Annotation<SceneCompositionPlan | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  /** The validated plan handed to the renderer and the browser. */
  lessonPlan: Annotation<LessonPlan | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),

  /* ------------------------------------------------------ review cycle */
  evidence: Annotation<RenderEvidence | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  review: Annotation<VisualReview | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  repair: Annotation<RepairPlan | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  /**
   * Best composition seen so far, kept so a lesson that never fully passes
   * still returns its best attempt rather than nothing.
   */
  bestComposition: Annotation<SceneCompositionPlan | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
  bestScore: Annotation<number>({
    reducer: (_p, n) => n,
    default: () => -1,
  }),

  narration: Annotation<NarrationPlan | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),

  /* --------------------------------------------------------- bookkeeping */
  iteration: Annotation<number>({
    reducer: (_p, n) => n,
    default: () => 0,
  }),
  maxIterations: Annotation<number>({
    reducer: (_p, n) => n,
    default: () => MAX_VISUAL_REPAIR_ITERATIONS,
  }),
  status: Annotation<WorkflowStatus>({
    reducer: (_p, n) => n,
    default: () => 'UNDERSTANDING',
  }),
  /** Non-fatal notes surfaced in the developer strip. */
  warnings: Annotation<string[]>(appendList<string>()),
  /** Node names in execution order, for the observable agent graph. */
  visited: Annotation<string[]>(appendList<string>()),
  errorMessage: Annotation<string | null>({
    reducer: (_p, n) => n,
    default: () => null,
  }),
});

export type NemoStateType = typeof NemoState.State;
export type NemoStateUpdate = Partial<NemoStateType>;
