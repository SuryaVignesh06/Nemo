/**
 * NEMO — agent artifact contracts.
 *
 * One schema per agent boundary. These are the ONLY shapes an agent may emit;
 * anything else is a validation failure handled by ModelExecutionService.
 *
 * Two deliberate properties:
 *
 *   1. Nothing here mentions LangGraph. The orchestration framework is
 *      replaceable; these contracts are not. The graph imports these — never
 *      the other way round.
 *
 *   2. Capability names are validated against the deterministic registry, not
 *      described in prose. A planner that invents SHOW_MAGIC_FIELD fails schema
 *      validation rather than failing at render time.
 *
 * Coordinates are absent by construction: agents express intent with semantic
 * relations, and the layout engine resolves geometry.
 */

import { z } from 'zod';

import { PRIORITIES, RELATION_TYPES, isExecutable, isKnownCapability } from './registry.ts';

/* ------------------------------------------------------------ primitives */

export const DomainSchema = z.enum([
  'mathematics',
  'computer_science',
  'physics',
  'chemistry',
  'biology',
  'general',
]);

export const PrioritySchema = z.enum(PRIORITIES as unknown as [string, ...string[]]);

export const RelationSchema = z.object({
  type: z
    .string()
    .refine((t) => RELATION_TYPES.includes(t), {
      message: `must be one of: ${RELATION_TYPES.join(', ')}`,
    }),
  target: z.string().min(1),
  target2: z.string().optional(),
  gap: z.enum(['tight', 'normal', 'loose']).optional(),
  anchor: z.string().optional(),
  axis: z.enum(['x', 'y']).optional(),
});

/**
 * A capability the Visual Planner is allowed to ask for: it must exist in the
 * registry AND have a deterministic executor in this build. A documented-only
 * capability is rejected here rather than silently dropped at render time.
 */
export const ExecutableCapabilitySchema = z
  .string()
  .refine(isKnownCapability, { message: 'not a registry capability' })
  .refine(isExecutable, { message: 'known capability but not drawable in this build' });

/** Reject anything that smells like the model trying to emit code or pixels. */
const SafeText = z
  .string()
  .max(2000)
  .refine((s) => !/\b(import|exec|eval|__import__|subprocess|require)\s*\(/.test(s), {
    message: 'must not contain code',
  });

/* ------------------------------------------------------- 1. AnswerArtifact */

export const SolutionStepSchema = z.object({
  step: z.number().int().min(1),
  operation: SafeText,
  result: SafeText,
  reason: SafeText,
});

/**
 * Solver output. Answers "what is correct?" and nothing else — no visuals,
 * no sequencing, no geometry.
 */
export const AnswerArtifactSchema = z.object({
  domain: DomainSchema,
  /** The question restated unambiguously. */
  normalizedQuestion: SafeText,
  /** Short summary of the approach. Not chain-of-thought. */
  approach: SafeText,
  /**
   * The complete prose explanation, as the learner would read it.
   *
   * This exists so the answer is a first-class product of the pipeline rather
   * than a by-product of visual planning: it is shown in the UI immediately,
   * and it is what the Teaching Director reads. A lesson can answer the
   * question even if rendering later fails.
   */
  explanation: z.string().max(12000).default(''),
  steps: z.array(SolutionStepSchema).max(20).default([]),
  finalAnswer: SafeText,
  keyConcepts: z.array(SafeText).max(12).default([]),
  prerequisites: z.array(SafeText).max(8).default([]),
  misconceptions: z.array(SafeText).max(8).default([]),
  assumptions: z.array(SafeText).max(8).default([]),
  /** Set when the answer was produced or checked by the deterministic solver. */
  verified: z.boolean().default(false),
});

export type AnswerArtifact = z.infer<typeof AnswerArtifactSchema>;

/**
 * Verdict on whether an answer is finished.
 *
 * Deliberately deterministic rather than another model call: "does this stop
 * mid-sentence" and "is there a final answer" are checkable, and paying a model
 * to check the model is both slower and less reliable.
 */
export interface CompletenessVerdict {
  complete: boolean;
  /** Why it was judged incomplete, phrased for the continuation prompt. */
  gaps: string[];
}

/** Text that ends mid-thought rather than concluding. */
function endsMidThought(text: string): boolean {
  const t = text.trimEnd();
  if (!t) return true;
  // A trailing conjunction, comma, or open bracket means more was coming.
  if (/[,;:([{]$/.test(t)) return true;
  // Ellipsis or an explicit continuation marker.
  if (/(\.\.\.|…)$/.test(t)) return true;
  if (/\b(continued|to be continued|and so on)\s*\.?$/i.test(t)) return true;

  // The reliable signal is terminal punctuation. A conjunction list cannot
  // work — a reply cut off at "and then we" ends in no conjunction at all,
  // while a finished one may legitimately end at "...is a vector".
  // Closing brackets and quotes count, as does a bare number or unit, since
  // an answer may legitimately end "= 8/3" or "a = 2.87 m/s^2".
  if (/[.!?:;)\]}"'’”]$/.test(t)) return false;
  if (/[\d²³%]$/.test(t)) return false;
  return true;
}

/**
 * Check an answer is actually finished before any visual work begins.
 *
 * The failure this prevents is specific: a model that explains the first third
 * of a question, and a lesson that then faithfully visualises only that third.
 */
export function assessCompleteness(a: AnswerArtifact): CompletenessVerdict {
  const gaps: string[] = [];

  if (!a.finalAnswer.trim()) {
    gaps.push('There is no final answer or conclusion.');
  }
  if (!a.explanation.trim()) {
    gaps.push('The explanation is empty.');
  } else if (a.explanation.trim().length < 120) {
    gaps.push('The explanation is too short to have addressed the question.');
  } else if (endsMidThought(a.explanation)) {
    gaps.push('The explanation stops mid-sentence and was cut off before finishing.');
  }
  if (a.steps.length === 0 && a.keyConcepts.length === 0) {
    gaps.push('There are no reasoning steps and no key concepts, so nothing can be taught.');
  }
  for (const [i, step] of a.steps.entries()) {
    if (!step.result.trim()) {
      gaps.push(`Step ${i + 1} ("${step.operation}") has no result.`);
      break;
    }
  }

  return { complete: gaps.length === 0, gaps };
}

/* -------------------------------------------------------- 2. TeachingPlan */

export const TeachingStepSchema = z.object({
  beatId: z.string().min(1).max(64),
  order: z.number().int().min(1),
  objective: SafeText,
  explanation: SafeText,
  narration: SafeText,
  /** What must be true on the board before moving on. */
  completionCriteria: z.array(SafeText).max(6).default([]),
  /** Node ids from earlier beats that must stay on the board. */
  keepVisible: z.array(z.string()).max(20).default([]),
  emphasis: z.array(SafeText).max(6).default([]),
});

/** Teaching Director output. Answers "how should this be taught?". */
export const TeachingPlanSchema = z.object({
  objective: SafeText,
  beats: z.array(TeachingStepSchema).min(2).max(14),
  finalSummary: SafeText,
  anticipatedMisconceptions: z.array(SafeText).max(8).default([]),
});

export type TeachingPlan = z.infer<typeof TeachingPlanSchema>;

/* ---------------------------------------------------------- 3. VisualPlan */

export const PlannedVisualSchema = z.object({
  beatId: z.string().min(1),
  /** Must be an executable registry capability. */
  capability: ExecutableCapabilitySchema,
  /** Why this visual serves the teaching goal. */
  purpose: SafeText,
  /** Node id this creates or acts upon. */
  target: z.string().min(1).max(64),
  priority: PrioritySchema.default('SECONDARY'),
});

/** Visual Planner output. Answers "what should be shown?". */
export const VisualPlanSchema = z.object({
  visuals: z.array(PlannedVisualSchema).min(1).max(120),
});

export type VisualPlan = z.infer<typeof VisualPlanSchema>;

/* ----------------------------------------------- 4. SceneCompositionPlan */

export const ComposedActionSchema = z.object({
  actionId: z.string().min(1).max(64),
  beatId: z.string().min(1),
  type: ExecutableCapabilitySchema,
  semanticRole: SafeText,
  target: z.string().min(1).max(64).optional(),
  relations: z.array(RelationSchema).max(6).default([]),
  priority: PrioritySchema.default('SECONDARY'),
  /** Capability-specific inputs. Coordinates are stripped downstream. */
  parameters: z.record(z.string(), z.unknown()).default({}),
  timing: z
    .object({
      delay: z.number().min(0).max(10).optional(),
      duration: z.number().min(0).max(20).optional(),
      pace: z.enum(['fast', 'normal', 'deliberate']).optional(),
    })
    .optional(),
  narrationCue: SafeText.optional(),
});

export const ComposedBeatSchema = z.object({
  beatId: z.string().min(1),
  actions: z.array(ComposedActionSchema).max(40),
  /** Actions that may run together; everything else is sequential. */
  parallelGroups: z.array(z.array(z.string()).max(8)).max(8).default([]),
});

/** Composer output. Answers "how should it be composed?". */
export const SceneCompositionPlanSchema = z.object({
  beats: z.array(ComposedBeatSchema).min(1).max(14),
});

export type SceneCompositionPlan = z.infer<typeof SceneCompositionPlanSchema>;

/* --------------------------------------------------------- 5. VisualReview */

export const ReviewStatusSchema = z.enum(['PASS', 'REPAIR_REQUIRED', 'FATAL']);

export const IssueSeveritySchema = z.enum(['CRITICAL', 'MAJOR', 'MINOR']);

/** Repair priority order from the brief: correctness first, aesthetics last. */
export const IssueCategorySchema = z.enum([
  'CORRECTNESS',
  'VISIBILITY',
  'OVERLAP',
  'LAYOUT',
  'CAMERA',
  'TIMING',
  'AESTHETICS',
]);

export const VisualIssueSchema = z.object({
  category: IssueCategorySchema,
  severity: IssueSeveritySchema,
  description: SafeText,
  /** Node or action ids the issue concerns. */
  targets: z.array(z.string()).max(8).default([]),
  beatId: z.string().optional(),
});

const Score = z.number().min(0).max(1);

/** Critic output. Answers "is the result good?" — and never edits the scene. */
export const VisualReviewSchema = z.object({
  status: ReviewStatusSchema,
  score: Score,
  correctnessScore: Score,
  compositionScore: Score,
  readabilityScore: Score,
  pedagogicalScore: Score,
  issues: z.array(VisualIssueSchema).max(24).default([]),
  strengths: z.array(SafeText).max(8).default([]),
  repairRecommendations: z.array(SafeText).max(12).default([]),
});

export type VisualReview = z.infer<typeof VisualReviewSchema>;

/* ----------------------------------------------------------- 6. RepairPlan */

/**
 * The closed set of edits a repair may request. Deliberately small: a repair
 * adjusts an existing composition, it does not author a new lesson.
 */
export const RepairOperationSchema = z.enum([
  'REPOSITION',
  'RESIZE',
  'CAMERA_FIT',
  'CAMERA_FOCUS',
  'SEQUENCE',
  'RETIME',
  'REMOVE',
  'EMPHASIZE',
  'DEEMPHASIZE',
]);

export const RepairActionSchema = z.object({
  operation: RepairOperationSchema,
  /** Action or node id being repaired. */
  target: z.string().min(1).max(64),
  /** For SEQUENCE: the ids to serialise, in order. */
  targets: z.array(z.string()).max(12).default([]),
  /** For REPOSITION: where it should go, semantically. */
  relation: RelationSchema.optional(),
  scale: z.number().min(0.2).max(4).optional(),
  reason: SafeText,
  addressesCategory: IssueCategorySchema,
});

/** Repair output. Answers "what needs changing?" — semantic edits only. */
export const RepairPlanSchema = z.object({
  actions: z.array(RepairActionSchema).min(1).max(20),
  summary: SafeText,
});

export type RepairPlan = z.infer<typeof RepairPlanSchema>;

/* -------------------------------------------------------- 7. NarrationPlan */

export const NarrationEventSchema = z.object({
  beatId: z.string().min(1),
  kind: z.enum(['SPEAK', 'PAUSE', 'EMPHASIZE']),
  text: SafeText,
  /** Seconds to hold, for PAUSE. */
  holdSeconds: z.number().min(0).max(10).optional(),
});

export const NarrationPlanSchema = z.object({
  events: z.array(NarrationEventSchema).max(60).default([]),
});

export type NarrationPlan = z.infer<typeof NarrationPlanSchema>;

/* ---------------------------------------------------------------- helpers */

/** Repair priority order, lowest number is repaired first. */
export const CATEGORY_PRIORITY: Record<z.infer<typeof IssueCategorySchema>, number> = {
  CORRECTNESS: 0,
  VISIBILITY: 1,
  OVERLAP: 2,
  LAYOUT: 3,
  CAMERA: 4,
  TIMING: 5,
  AESTHETICS: 6,
};

/** Sort issues so the most consequential problem is addressed first. */
export function orderIssues<T extends { category: keyof typeof CATEGORY_PRIORITY; severity: string }>(
  issues: readonly T[]
): T[] {
  const sev: Record<string, number> = { CRITICAL: 0, MAJOR: 1, MINOR: 2 };
  return [...issues].sort(
    (a, b) =>
      CATEGORY_PRIORITY[a.category] - CATEGORY_PRIORITY[b.category] ||
      (sev[a.severity] ?? 9) - (sev[b.severity] ?? 9)
  );
}
