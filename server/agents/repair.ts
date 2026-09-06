/**
 * NEMO — Repair Agent.
 *
 * Answers exactly one question: "what needs changing?"
 *
 * It converts critic findings into a closed set of semantic edit operations. It
 * cannot draw, cannot render, and cannot express a change as code or
 * coordinates — a repair is always "put this above that", never "move this to
 * x=340".
 *
 * Issues are handed to it pre-sorted by the deterministic priority order
 * (correctness, visibility, overlap, layout, camera, timing, aesthetics) so the
 * model spends its budget on what matters most.
 */

import {
  RepairPlanSchema,
  orderIssues,
  type RepairPlan,
  type SceneCompositionPlan,
  type VisualReview,
} from '../../shared/agents.ts';
import { RELATION_TYPES } from '../../shared/registry.ts';
import { COMMON_RULES, jsonBlock, type AgentDeps } from './types.ts';

export const REPAIR_SYSTEM = [
  "You are Nemo's Repair Agent.",
  '',
  'You convert critic findings into semantic repair operations against an',
  'existing composition. You do not redesign the lesson and you do not generate',
  'renderer code.',
  '',
  'Available operations:',
  '  REPOSITION   — move a target, expressed as a relation to another object',
  '  RESIZE       — scale a target (0.2 to 4)',
  '  CAMERA_FIT   — frame the camera so the target is fully visible',
  '  CAMERA_FOCUS — direct attention to the target',
  '  SEQUENCE     — serialise simultaneous animations, in the order given',
  '  RETIME       — change when or how long something animates',
  '  REMOVE       — take something off the board',
  '  EMPHASIZE / DEEMPHASIZE — change visual weight',
  '',
  `Allowed relation types for REPOSITION: ${RELATION_TYPES.join(', ')}.`,
  '',
  'Fix causes, not symptoms. If two things overlap, move the less important one',
  'rather than shrinking both. Prefer the smallest change that resolves the',
  'issue. Do not repair a MINOR aesthetic complaint at the cost of a working',
  'layout, and do not touch anything the critic did not raise.',
  '',
  'Issues are given to you in priority order. Address the highest-priority ones',
  'first, and only address what you can fix with the operations above.',
  '',
  'Every action must name addressesCategory — the issue category it resolves.',
  '',
  'Return a JSON object: {"summary": "...", "actions": [{operation, target,',
  'targets, relation, scale, reason, addressesCategory}]}.',
  '',
  COMMON_RULES,
].join('\n');

export function repairUser(review: VisualReview, composition: SceneCompositionPlan): string {
  const ordered = orderIssues(review.issues);
  return [
    jsonBlock('Issues (highest priority first)', ordered),
    '',
    review.repairRecommendations.length
      ? jsonBlock('CriticRecommendations', review.repairRecommendations)
      : '',
    '',
    jsonBlock(
      'CurrentComposition (ids you may target)',
      composition.beats.map((b) => ({
        beatId: b.beatId,
        actions: b.actions.map((a) => ({
          actionId: a.actionId,
          type: a.type,
          target: a.target,
          priority: a.priority,
        })),
      }))
    ),
    '',
    'Produce the RepairPlan.',
  ].join('\n');
}

export async function runRepair(
  deps: AgentDeps,
  review: VisualReview,
  composition: SceneCompositionPlan
): Promise<RepairPlan> {
  deps.status('REPAIRING', 'Working out what to fix');

  return deps.models.executeStructured({
    stage: 'repair',
    system: REPAIR_SYSTEM,
    user: repairUser(review, composition),
    schema: RepairPlanSchema,
    maxTokens: 2500,
    temperature: 0.1,
    signal: deps.signal,
  });
}
