/**
 * NEMO — semantic compiler: SceneCompositionPlan -> LessonPlan.
 *
 * This is the deterministic boundary. Above it, agents emit intent. Below it,
 * nothing the model wrote is ever interpreted as an instruction again: every
 * action is re-checked against the registry by the EXISTING validators
 * (shared/validate.ts), coordinates are stripped, and raw code is refused.
 *
 * It deliberately reuses validateAction / normaliseBeat / validatePlan rather
 * than introducing a second validation path. Two validators would eventually
 * disagree, and the weaker one would become the security boundary.
 */

import type {
  LessonPlan,
  TeachingBeat,
  VisualAction,
} from '../../shared/contracts.ts';
import { LessonError } from '../../shared/contracts.ts';
import { normaliseBeat, validateAction, validatePlan } from '../../shared/validate.ts';
import type {
  AnswerArtifact,
  SceneCompositionPlan,
  TeachingPlan,
} from '../../shared/agents.ts';

export interface CompileResult {
  plan: LessonPlan;
  warnings: string[];
}

/**
 * Order actions so that anything the composer marked as a parallel group stays
 * adjacent, and everything else keeps its authored order. The renderer decides
 * how to play them; this only guarantees a stable, sensible sequence.
 */
function orderActions(
  actions: readonly { actionId: string }[],
  groups: readonly (readonly string[])[]
): string[] {
  const grouped = new Map<string, number>();
  groups.forEach((g, i) => g.forEach((id) => grouped.set(id, i)));

  return actions
    .map((a, index) => ({ id: a.actionId, index, group: grouped.get(a.actionId) ?? -1 }))
    .sort((a, b) => {
      // Members of the same group are pulled together at the position of the
      // group's first member; ungrouped actions keep their own position.
      const ka = a.group === -1 ? a.index : Math.min(...groupIndices(actions, groups, a.group));
      const kb = b.group === -1 ? b.index : Math.min(...groupIndices(actions, groups, b.group));
      return ka - kb || a.index - b.index;
    })
    .map((a) => a.id);
}

function groupIndices(
  actions: readonly { actionId: string }[],
  groups: readonly (readonly string[])[],
  group: number
): number[] {
  const ids = new Set(groups[group] ?? []);
  const idx = actions.map((a, i) => (ids.has(a.actionId) ? i : -1)).filter((i) => i >= 0);
  return idx.length ? idx : [Number.MAX_SAFE_INTEGER];
}

/**
 * Compile a composition into a validated LessonPlan.
 *
 * Individual actions that fail validation are dropped with a warning rather
 * than failing the lesson — one bad label should not lose a nine-beat
 * explanation. A beat left with no actions at all, or a plan that fails
 * whole-plan validation, is a real failure and is raised.
 */
export function compileComposition(
  ids: { lessonId: string; requestId: string },
  question: string,
  answer: AnswerArtifact,
  teaching: TeachingPlan,
  composition: SceneCompositionPlan
): CompileResult {
  const warnings: string[] = [];
  const byBeat = new Map(composition.beats.map((b) => [b.beatId, b]));

  const beats: TeachingBeat[] = teaching.beats
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((step, i) => {
      const composed = byBeat.get(step.beatId);
      const accepted: VisualAction[] = [];

      if (!composed) {
        warnings.push(`Beat ${step.beatId} had no composed visuals.`);
      } else {
        const order = orderActions(composed.actions, composed.parallelGroups);
        const position = new Map(order.map((id, idx) => [id, idx]));
        const sorted = [...composed.actions].sort(
          (a, b) => (position.get(a.actionId) ?? 0) - (position.get(b.actionId) ?? 0)
        );

        sorted.forEach((action, index) => {
          // The existing validator is the authority: registry membership,
          // raw-code refusal and coordinate stripping all happen here.
          const { action: valid, reasons } = validateAction(action, step.beatId, index);
          warnings.push(...reasons);
          if (valid) accepted.push(valid);
        });
      }

      const { beat } = normaliseBeat(
        {
          beatId: step.beatId,
          order: step.order,
          objective: step.objective,
          explanation: step.explanation,
          narration: step.narration,
          completionCriteria: step.completionCriteria.length
            ? step.completionCriteria
            : ['beat_visuals_complete'],
          visualActions: accepted,
        },
        i
      );
      return beat!;
    });

  const plan: LessonPlan = {
    lessonId: ids.lessonId,
    requestId: ids.requestId,
    question,
    domain: answer.domain,
    answer: answer.finalAnswer,
    objective: teaching.objective,
    beats,
    finalSummary: teaching.finalSummary,
    status: 'READY',
  };

  const result = validatePlan(plan);
  if (!result.ok) {
    throw new LessonError(
      'INCOMPLETE_PLAN',
      `The composed lesson failed validation: ${result.reasons.slice(0, 2).join('; ')}`,
      [...result.reasons, ...warnings].slice(0, 12)
    );
  }

  return { plan, warnings: [...warnings, ...result.reasons].slice(0, 20) };
}
