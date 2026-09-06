/**
 * NEMO — Teaching Director Agent.
 *
 * Answers exactly one question: "how should this be taught?"
 *
 * It thinks in pedagogy — order, emphasis, what stays on the board, when to
 * pause — and never in renderer terms. It receives a correct answer and turns
 * it into a lesson.
 */

import {
  TeachingPlanSchema,
  type AnswerArtifact,
  type TeachingPlan,
} from '../../shared/agents.ts';
import { COMMON_RULES, jsonBlock, type AgentDeps } from './types.ts';

export const DIRECTOR_SYSTEM = [
  "You are Nemo's Teaching Director.",
  '',
  'Your job is to turn a correct answer into a pedagogically coherent lesson',
  'that will be drawn on a blackboard, one beat at a time.',
  '',
  'Decide:',
  '- the overall teaching objective',
  '- the sequence of beats and the conceptual progression between them',
  '- what appears first, what follows, and what must stay visible',
  '- what deserves emphasis',
  '- what the learner must understand before the beat is complete',
  '- which misconceptions to pre-empt',
  '',
  'Build the lesson so understanding accumulates. Establish the object before',
  'operating on it. Do not summarise a result the learner has not yet seen',
  'derived. Every beat must add one idea, not five.',
  '',
  'You must NOT:',
  '- name drawing capabilities, shapes, colours or animations',
  '- choose coordinates or camera moves',
  '- write code of any kind',
  '',
  'narration is what Nemo says aloud during the beat: one or two plain spoken',
  'sentences, no markup, no symbols that cannot be read out loud.',
  '',
  'Use between 4 and 6 beats. Each beat is one idea, and every field is one or',
  'two short sentences — a long plan gets cut off before it is finished.',
  '',
  'Return a JSON object with keys: objective, beats (array of {beatId, order,',
  'objective, explanation, narration, completionCriteria, keepVisible,',
  'emphasis}), finalSummary, anticipatedMisconceptions.',
  '',
  COMMON_RULES,
].join('\n');

export function directorUser(question: string, answer: AnswerArtifact): string {
  return [
    `Question:\n${question}`,
    '',
    jsonBlock('AnswerArtifact', answer),
    '',
    'Produce the TeachingPlan.',
  ].join('\n');
}

export async function runDirector(
  deps: AgentDeps,
  question: string,
  answer: AnswerArtifact
): Promise<TeachingPlan> {
  deps.status('PLANNING', 'Planning how to teach it');

  return deps.models.executeStructured({
    stage: 'teaching_director',
    system: DIRECTOR_SYSTEM,
    user: directorUser(question, answer),
    schema: TeachingPlanSchema,
    maxTokens: 8000,
    temperature: 0.3,
    signal: deps.signal,
  });
}
