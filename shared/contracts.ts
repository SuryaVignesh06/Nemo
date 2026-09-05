/**
 * NEMO — core contracts shared by the backend pipeline and the browser runtime.
 *
 * These types are the boundary between "what the model is allowed to say" and
 * "what the engine will draw". Everything crossing that boundary is validated
 * by validate.ts before it reaches the scene.
 */

import { RELATION_TYPES } from './registry.ts';

export type LessonStatus =
  | 'PLANNING'
  | 'READY'
  | 'EXECUTING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type ActionStatus = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

export type Priority = 'PRIMARY' | 'SECONDARY' | 'TERTIARY' | 'BACKGROUND';

export type Pace = 'fast' | 'normal' | 'deliberate';

export type Domain =
  | 'mathematics'
  | 'computer_science'
  | 'physics'
  | 'chemistry'
  | 'biology'
  | 'general';

/** Section 14 spatial relation. The model never supplies coordinates. */
export interface Relation {
  type: string;
  target: string;
  /** Optional second reference for BETWEEN. */
  target2?: string;
  /** Semantic gap keyword, not pixels. */
  gap?: 'tight' | 'normal' | 'loose';
  anchor?: string;
  axis?: 'x' | 'y';
}

export interface ActionTiming {
  delay?: number;
  duration?: number;
  pace?: Pace;
}

/** One semantic visual instruction. The model's only visual vocabulary. */
export interface VisualAction {
  actionId: string;
  beatId: string;
  /** Must be a registry capability with an executor. */
  type: string;
  semanticRole: string;
  /** Node id this action creates or acts upon. */
  target?: string;
  relations?: Relation[];
  priority?: Priority;
  parameters: Record<string, unknown>;
  timing?: ActionTiming;
  narrationCue?: string;
  completionCriteria?: string[];
}

export interface TeachingBeat {
  beatId: string;
  order: number;
  objective: string;
  explanation: string;
  visualActions: VisualAction[];
  narration: string;
  completionCriteria: string[];
}

export interface LessonPlan {
  lessonId: string;
  requestId: string;
  question: string;
  domain: Domain;
  answer: string;
  objective: string;
  beats: TeachingBeat[];
  finalSummary: string;
  status: LessonStatus;
}

/* ---------------------------------------------------------------- stages */

export interface QuestionAnalysis {
  normalizedQuestion: string;
  domain: Domain;
  intent: string;
  entities: string[];
  requestedDepth: 'brief' | 'normal' | 'deep';
  /** True when the input is a solvable equation rather than a concept question. */
  isEquation: boolean;
}

export interface SolutionStep {
  step: number;
  /** What is done to both sides, e.g. "subtract 5 from both sides". */
  operation: string;
  /** State of the expression after this operation. */
  result: string;
  /** Why this step is valid. */
  reason: string;
}

export interface Solution {
  original: string;
  steps: SolutionStep[];
  finalAnswer: string;
  /** Set when the solver verified the answer numerically. */
  verified: boolean;
}

/* ---------------------------------------------------------------- events */

export type LessonEvent =
  | { type: 'lesson.started'; lessonId: string; requestId: string; question: string }
  | { type: 'lesson.status'; lessonId: string; stage: string; detail?: string }
  | { type: 'lesson.plan'; lessonId: string; plan: LessonPlan }
  | { type: 'beat.started'; lessonId: string; beatId: string; order: number; narration: string }
  | { type: 'action.started'; lessonId: string; action: VisualAction }
  | { type: 'action.completed'; lessonId: string; actionId: string }
  | { type: 'action.failed'; lessonId: string; actionId: string; reason: string }
  | { type: 'beat.completed'; lessonId: string; beatId: string }
  | { type: 'lesson.completed'; lessonId: string; summary: string }
  | { type: 'lesson.failed'; lessonId: string; code: FailureCode; message: string }
  | { type: 'lesson.cancelled'; lessonId: string };

/** Section 37 — explicit provider failure taxonomy. Never a silent fallback. */
export type FailureCode =
  | 'MISSING_CREDENTIALS'
  | 'EMPTY_RESPONSE'
  | 'INVALID_RESPONSE'
  | 'TIMEOUT'
  | 'RATE_LIMIT'
  | 'UNAVAILABLE'
  | 'INCOMPLETE_PLAN'
  | 'UNKNOWN_CAPABILITY'
  | 'RAW_CODE_REJECTED'
  | 'STALE_REQUEST'
  | 'UNSUPPORTED';

export class LessonError extends Error {
  code: FailureCode;
  details: string[];
  constructor(code: FailureCode, message: string, details: string[] = []) {
    super(message);
    this.name = 'LessonError';
    this.code = code;
    this.details = details;
  }
}

/* ------------------------------------------------------------ scene node */

export interface Vec2 {
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface InkStroke {
  id: string;
  points: Array<{ x: number; y: number; pressure?: number }>;
  width: number;
  opacity: number;
  semanticRole: string;
  /** Rendered as a filled region rather than a traced line (highlights). */
  fill?: string;
  color?: string;
  /** Strokes are drawn in this order; the pen follows them. */
  closed?: boolean;
}

export type SceneNodeType =
  | 'text'
  | 'equation'
  | 'circle'
  | 'rectangle'
  | 'triangle'
  | 'polygon'
  | 'line'
  | 'arrow'
  | 'array'
  | 'axes'
  | 'marker'
  | 'highlight'
  | 'group'
  | 'vector'
  | 'path'
  | 'diagram'
  | 'tree'
  | 'linked_list'
  | 'stack'
  | 'queue'
  | 'atom'
  | 'molecule'
  | 'reaction'
  | 'points';

export interface SceneNode {
  id: string;
  type: SceneNodeType;
  semanticRole: string;
  priority: Priority;
  visible: boolean;
  /** Strokes in node-local coordinates, origin at the node's top-left. */
  strokes: InkStroke[];
  /** Local extent of the strokes, used by layout before placement. */
  localBounds: { w: number; h: number };
  transform: { x: number; y: number; scale: number; rotation: number };
  opacity: number;
  /** 0..1 progressive reveal of this node's strokes. */
  drawProgress: number;
  color: string;
  /** Named anchor points other nodes may attach to (e.g. array cell centres). */
  anchors?: Record<string, Vec2>;
  /**
   * Set when this node was deliberately placed on or inside another (INSIDE,
   * ATTACHED_TO, CENTERED_ON...). Overlap with that node is the intent, so the
   * anti-overlap engine leaves the pair alone.
   */
  attachedTo?: string;
  /** Set when the node was produced by an action, for traceability. */
  actionId?: string;
}

/* -------------------------------------------------------------- helpers */

export const GAP_PIXELS: Record<string, number> = {
  tight: 14,
  normal: 34,
  loose: 90,
};

export function isRelationType(t: string): boolean {
  return RELATION_TYPES.includes(t);
}

/** World-space bounds of a placed node. */
export function worldBounds(n: SceneNode): Bounds {
  return {
    x: n.transform.x,
    y: n.transform.y,
    w: n.localBounds.w * n.transform.scale,
    h: n.localBounds.h * n.transform.scale,
  };
}

export function boundsOverlap(a: Bounds, b: Bounds, pad = 0): boolean {
  return (
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
  );
}

export function overlapArea(a: Bounds, b: Bounds): number {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

export const PRIORITY_RANK: Record<Priority, number> = {
  PRIMARY: 0,
  SECONDARY: 1,
  TERTIARY: 2,
  BACKGROUND: 3,
};
