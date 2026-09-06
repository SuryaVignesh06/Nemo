/**
 * NEMO — Solver Agent.
 *
 * Answers exactly one question: "what is correct?"
 *
 * When the input is a linear equation the deterministic solver produces the
 * arithmetic and the model is not consulted at all. That is a preserved
 * property of the existing pipeline: the model narrates steps it is given, it
 * never gets the chance to be wrong about the numbers.
 */

import {
  AnswerArtifactSchema,
  assessCompleteness,
  type AnswerArtifact,
} from '../../shared/agents.ts';
import { looksLikeEquation, solveEquation } from '../../shared/solver.ts';
import { COMMON_RULES, type AgentDeps } from './types.ts';

export const SOLVER_SYSTEM = [
  "You are Nemo's Solver Agent.",
  '',
  'Your only responsibility is to determine what is correct.',
  '',
  'You must:',
  '- restate the question unambiguously',
  '- identify the domain',
  '- solve the problem and derive any equations',
  '- list the intermediate steps that lead to the answer',
  '- state the final answer',
  '- identify key concepts, prerequisites and likely misconceptions',
  '- state any assumptions you had to make',
  '- write the full explanation a learner would read, in `explanation`',
  '',
  'ANSWER THE WHOLE QUESTION. Do not stop after the first part. If the question',
  'has several components, address every one of them. Finish with a clear',
  'conclusion. An explanation that stops mid-way is a failure, not a partial',
  'success.',
  '',
  'You must NOT:',
  '- design animations or decide what should be drawn',
  '- choose coordinates, sizes, colours or camera moves',
  '- write Manim code or any other code',
  '',
  'domain must be one of: mathematics, computer_science, physics, chemistry,',
  'biology, general.',
  '',
  'Return a JSON object with keys: domain, normalizedQuestion, approach,',
  'explanation, steps (array of {step, operation, result, reason}), finalAnswer,',
  'keyConcepts, prerequisites, misconceptions, assumptions.',
  '',
  COMMON_RULES,
].join('\n');

export function solverUser(question: string): string {
  return `Question:\n${question}\n\nSolve it and return the AnswerArtifact.`;
}

/** Ask the model to finish an answer it left unfinished. */
export function continuationUser(
  question: string,
  previous: AnswerArtifact,
  gaps: string[]
): string {
  return [
    `Question:
${question}`,
    '',
    'Your previous answer was incomplete:',
    ...gaps.map((g) => `- ${g}`),
    '',
    'Your previous answer:',
    JSON.stringify(previous, null, 1).slice(0, 6000),
    '',
    'Return the COMPLETE AnswerArtifact — the whole answer, not just the missing',
    'part. Finish every component of the question and end with a clear',
    'conclusion.',
  ].join('\n');
}

/** How many times the solver may be asked to finish an unfinished answer. */
const MAX_CONTINUATIONS = 2;

export async function runSolver(deps: AgentDeps, question: string): Promise<AnswerArtifact> {
  deps.status('SOLVING', 'Working out the answer');

  let artifact = await deps.models.executeStructured({
    stage: 'solver',
    system: SOLVER_SYSTEM,
    user: solverUser(question),
    schema: AnswerArtifactSchema,
    // Reasoning models spend most of their budget before emitting anything.
    maxTokens: 6000,
    temperature: 0.2,
    signal: deps.signal,
  });

  // Never hand a half-answer to the visual pipeline: the lesson would then
  // faithfully visualise only half the question.
  for (let attempt = 1; attempt <= MAX_CONTINUATIONS; attempt++) {
    const verdict = assessCompleteness(artifact);
    if (verdict.complete) break;

    deps.status('SOLVING', `Completing the answer (${attempt}/${MAX_CONTINUATIONS})`);
    artifact = await deps.models.executeStructured({
      stage: `solver_continuation_${attempt}`,
      system: SOLVER_SYSTEM,
      user: continuationUser(question, artifact, verdict.gaps),
      schema: AnswerArtifactSchema,
      maxTokens: 6000,
      temperature: 0.2,
      signal: deps.signal,
    });
  }

  // Deterministic arithmetic overrides the model wherever it applies.
  if (looksLikeEquation(question)) {
    try {
      const solved = solveEquation(question);
      return {
        ...artifact,
        domain: 'mathematics',
        steps: solved.steps,
        finalAnswer: solved.finalAnswer,
        verified: true,
      };
    } catch {
      // Not a form the parser handles; keep the model's answer as-is.
    }
  }

  return artifact;
}
