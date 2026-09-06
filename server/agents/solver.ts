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

import { AnswerArtifactSchema, type AnswerArtifact } from '../../shared/agents.ts';
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
  '',
  'You must NOT:',
  '- design animations or decide what should be drawn',
  '- choose coordinates, sizes, colours or camera moves',
  '- write Manim code or any other code',
  '',
  'domain must be one of: mathematics, computer_science, physics, chemistry,',
  'biology, general.',
  '',
  'Return a JSON object with keys: domain, normalizedQuestion, approach, steps',
  '(array of {step, operation, result, reason}), finalAnswer, keyConcepts,',
  'prerequisites, misconceptions, assumptions.',
  '',
  COMMON_RULES,
].join('\n');

export function solverUser(question: string): string {
  return `Question:\n${question}\n\nSolve it and return the AnswerArtifact.`;
}

export async function runSolver(deps: AgentDeps, question: string): Promise<AnswerArtifact> {
  deps.status('SOLVING', 'Working out the answer');

  const artifact = await deps.models.executeStructured({
    stage: 'solver',
    system: SOLVER_SYSTEM,
    user: solverUser(question),
    schema: AnswerArtifactSchema,
    maxTokens: 2000,
    temperature: 0.2,
    signal: deps.signal,
  });

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
