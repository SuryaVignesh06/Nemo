/**
 * NEMO — Visual Composer / Scene Director Agent.
 *
 * Answers exactly one question: "how should it be composed?"
 *
 * It turns a flat list of chosen capabilities into an ordered, related,
 * parameterised composition. It expresses position as relations between named
 * objects; the deterministic layout engine turns those into geometry.
 *
 * On a repair pass it receives the previous composition plus the repair plan and
 * returns a revised composition — it never authors a new lesson from scratch.
 */

import {
  SceneCompositionPlanSchema,
  type RepairPlan,
  type SceneCompositionPlan,
  type TeachingPlan,
  type VisualPlan,
} from '../../shared/agents.ts';
import { RELATION_TYPES, capabilitySheet } from '../../shared/registry.ts';
import { COMMON_RULES, jsonBlock, type AgentDeps } from './types.ts';

export function composerSystem(): string {
  return [
    "You are Nemo's Visual Composer.",
    '',
    'You compose selected visual operations into a coherent blackboard scene.',
    'You decide grouping, order, what runs together, what each operation needs',
    'as input, and how objects relate spatially to one another.',
    '',
    'Position is expressed ONLY as a relation to another named object. Exact',
    'geometry is resolved deterministically after you, and any coordinate you',
    'write will be discarded.',
    '',
    `Allowed relation types: ${RELATION_TYPES.join(', ')}.`,
    'Allowed gaps: tight, normal, loose.',
    '',
    'parameters carries the content each capability needs — the text to write,',
    'the array values, the function expression, the labels. Fill these in from',
    'the lesson; never leave a placeholder like "..." or "TODO".',
    '',
    'parallelGroups lists actionIds that may animate simultaneously. Group only',
    'operations the learner can absorb at once. Everything else is sequential.',
    '',
    'You must NOT:',
    '- use a capability outside the allowed list',
    '- write x/y coordinates, pixel sizes or code',
    '',
    'ALLOWED CAPABILITIES:',
    capabilitySheet(),
    '',
    'Return a JSON object: {"beats": [{beatId, actions: [{actionId, beatId, type,',
    'semanticRole, target, relations, priority, parameters, timing,',
    'narrationCue}], parallelGroups}]}.',
    '',
    COMMON_RULES,
  ].join('\n');
}

export function composerUser(teaching: TeachingPlan, visual: VisualPlan): string {
  return [
    jsonBlock('TeachingPlan', teaching),
    '',
    jsonBlock('VisualPlan', visual),
    '',
    'Compose the full SceneCompositionPlan. Every beat in the TeachingPlan must',
    'appear, in order.',
  ].join('\n');
}

export function composerRepairUser(
  teaching: TeachingPlan,
  previous: SceneCompositionPlan,
  repair: RepairPlan
): string {
  return [
    jsonBlock('TeachingPlan', teaching),
    '',
    jsonBlock('PreviousComposition', previous),
    '',
    jsonBlock('RepairPlan', repair),
    '',
    'Apply every repair action to the previous composition and return the full',
    'revised SceneCompositionPlan. Keep everything the repair plan does not',
    'mention exactly as it was — same actionIds, same beats, same order.',
  ].join('\n');
}

export async function runComposer(
  deps: AgentDeps,
  teaching: TeachingPlan,
  visual: VisualPlan
): Promise<SceneCompositionPlan> {
  deps.status('COMPOSING', 'Composing the scene');

  return deps.models.executeStructured({
    stage: 'composer',
    system: composerSystem(),
    user: composerUser(teaching, visual),
    schema: SceneCompositionPlanSchema,
    maxTokens: 6000,
    temperature: 0.2,
    signal: deps.signal,
  });
}

export async function runComposerRepair(
  deps: AgentDeps,
  teaching: TeachingPlan,
  previous: SceneCompositionPlan,
  repair: RepairPlan
): Promise<SceneCompositionPlan> {
  deps.status('REPAIRING', 'Applying the fixes');

  return deps.models.executeStructured({
    stage: 'composer_repair',
    system: composerSystem(),
    user: composerRepairUser(teaching, previous, repair),
    schema: SceneCompositionPlanSchema,
    maxTokens: 6000,
    temperature: 0.1,
    signal: deps.signal,
  });
}
