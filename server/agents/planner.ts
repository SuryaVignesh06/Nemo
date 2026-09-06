/**
 * NEMO — Visual Planner Agent.
 *
 * Answers exactly one question: "what should be shown?"
 *
 * The capability registry, not the model, decides what is possible. The sheet
 * handed to the planner is generated deterministically from the registry, and
 * every name the planner returns is re-checked against it by the schema. A
 * planner that invents an operation fails validation rather than failing at
 * render time.
 */

import { VisualPlanSchema, type TeachingPlan, type VisualPlan } from '../../shared/agents.ts';
import { capabilitySheet } from '../../shared/registry.ts';
import { COMMON_RULES, jsonBlock, type AgentDeps } from './types.ts';

export function plannerSystem(): string {
  return [
    "You are Nemo's Visual Planner.",
    '',
    'You translate teaching goals into semantic visual operations chosen from a',
    'fixed capability registry. You decide WHAT is shown. You do not decide where',
    'it goes, how large it is, or how it animates.',
    '',
    'For each teaching beat, select the capabilities that make that beat',
    'understandable, and give each one a stable target id (e.g. array_1,',
    'graph_1, equation_2). Reuse an id to act on something already drawn; use a',
    'new id to create something.',
    '',
    'Prefer showing the object of study before annotating it. Do not select a',
    'capability that has no teaching purpose in that beat.',
    '',
    'You must NOT:',
    '- invent a capability that is not on the list below',
    '- generate Manim or any other code',
    '- choose coordinates, pixel sizes or camera positions',
    '',
    'ALLOWED CAPABILITIES — using any name not on this list invalidates your reply:',
    capabilitySheet(),
    '',
    'Return a JSON object: {"visuals": [{beatId, capability, purpose, target,',
    'priority}]} where priority is PRIMARY, SECONDARY, TERTIARY or BACKGROUND.',
    '',
    COMMON_RULES,
  ].join('\n');
}

export function plannerUser(plan: TeachingPlan): string {
  return [
    jsonBlock('TeachingPlan', plan),
    '',
    'Select the visual operations for every beat. Cover the whole lesson.',
  ].join('\n');
}

export async function runPlanner(deps: AgentDeps, plan: TeachingPlan): Promise<VisualPlan> {
  deps.status('DESIGNING_VISUALS', 'Choosing what to draw');

  return deps.models.executeStructured({
    stage: 'visual_planner',
    system: plannerSystem(),
    user: plannerUser(plan),
    schema: VisualPlanSchema,
    maxTokens: 4000,
    temperature: 0.2,
    signal: deps.signal,
  });
}
