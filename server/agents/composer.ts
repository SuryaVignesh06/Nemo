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
import {
  RELATION_TYPES,
  capabilitySheetFor,
  capabilitySheetForDomain,
} from '../../shared/registry.ts';
import { COMMON_RULES, jsonBlock, type AgentDeps } from './types.ts';

export function composerSystem(allowed: readonly string[]): string {
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
    'Every relation needs BOTH a type and a target naming another object in',
    'the scene. The first object in the lesson has nothing to anchor to, so',
    'give it an empty relations array rather than a relation with no target.',
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
    'ALLOWED CAPABILITIES (only these appear in this lesson):',
    capabilitySheetFor(allowed),
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
    system: composerSystem(visual.visuals.map((v) => v.capability)),
    user: composerUser(teaching, visual),
    schema: SceneCompositionPlanSchema,
    maxTokens: 8000,
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
    system: composerSystem(
      previous.beats.flatMap((b) => b.actions.map((a) => a.type))
    ),
    user: composerRepairUser(teaching, previous, repair),
    schema: SceneCompositionPlanSchema,
    maxTokens: 8000,
    temperature: 0.1,
    signal: deps.signal,
  });
}

/* ------------------------------------------------------- economy path */

/**
 * Visual Planner and Composer merged into one call.
 *
 * "What should be shown?" and "how should it be composed?" are genuinely
 * different questions, and keeping them apart produces better lessons. But on a
 * metered or free-tier key the binding constraint is the number of REQUESTS,
 * not their quality: a free OpenRouter key allows ~50 a day, and at four calls
 * per lesson that is a dozen questions before the key is spent.
 *
 * This path answers both questions at once from the domain-scoped registry,
 * taking a lesson from four model calls to three. The deterministic guarantees
 * are unchanged — the same schema, the same registry validation, the same
 * compiler — so what is traded is planning nuance, not safety.
 */
export function designerSystem(domain: string): string {
  return [
    "You are Nemo's Visual Designer.",
    '',
    'You decide what appears on a blackboard for each teaching beat, and how it',
    'is composed: order, grouping, what runs together, and how objects relate',
    'to one another spatially.',
    '',
    'Position is expressed ONLY as a relation to another named object. Exact',
    'geometry is resolved deterministically after you, and any coordinate you',
    'write will be discarded.',
    '',
    `Allowed relation types: ${RELATION_TYPES.join(', ')}.`,
    'Allowed gaps: tight, normal, loose.',
    '',
    'Every relation needs BOTH a type and a target naming another object. The',
    'first object in the lesson has nothing to anchor to, so give it an empty',
    'relations array rather than a relation with no target.',
    '',
    'Give each object a stable target id (array_1, graph_1, equation_2) and',
    'reuse that id to act on it again.',
    '',
    'parameters carries the content each capability needs — the text, the array',
    'values, the expression, the labels. Fill these from the lesson; never',
    'leave a placeholder like "..." or "TODO".',
    '',
    'Every beat in the teaching plan must appear, in order, and the last beat',
    'must show the final answer or a summary.',
    '',
    'You must NOT invent a capability outside the list below, write',
    'coordinates, or write code.',
    '',
    `ALLOWED CAPABILITIES for ${domain}:`,
    capabilitySheetForDomain(domain),
    '',
    'Return a JSON object: {"beats": [{beatId, actions: [{actionId, beatId, type,',
    'semanticRole, target, relations, priority, parameters}], parallelGroups}]}.',
    '',
    COMMON_RULES,
  ].join('\n');
}

export async function runVisualDesigner(
  deps: AgentDeps,
  teaching: TeachingPlan,
  domain: string
): Promise<SceneCompositionPlan> {
  deps.status('DESIGNING_VISUALS', 'Designing the board');

  return deps.models.executeStructured({
    stage: 'visual_designer',
    system: designerSystem(domain),
    user: [
      jsonBlock('TeachingPlan', teaching),
      '',
      'Design the full SceneCompositionPlan for every beat.',
    ].join('\n'),
    schema: SceneCompositionPlanSchema,
    maxTokens: 8000,
    temperature: 0.2,
    signal: deps.signal,
  });
}
