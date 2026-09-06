/**
 * NEMO — Visual Critic Agent.
 *
 * Answers exactly one question: "is the result good?"
 *
 * The critic judges the RENDERED lesson, not the JSON that produced it. It
 * receives captured frames plus deterministic scene measurements (overlaps,
 * clipping, off-screen elements) and the lesson objective, and returns a
 * structured review. It never edits the scene — that is the Repair Agent's job,
 * and keeping the two separate is what stops the critic quietly rewriting the
 * lesson it was asked to judge.
 *
 * The deterministic measurements matter: a vision model is good at "this looks
 * confusing" and unreliable at "these two boxes overlap by 40 pixels". Facts
 * come from the layout engine; judgement comes from the model.
 */

import {
  VisualReviewSchema,
  type AnswerArtifact,
  type SceneCompositionPlan,
  type TeachingPlan,
  type VisualReview,
} from '../../shared/agents.ts';
import { COMMON_RULES, jsonBlock, type AgentDeps } from './types.ts';
import type { RenderEvidence } from '../rendering/evidence.ts';

export const CRITIC_SYSTEM = [
  "You are Nemo's Visual Critic.",
  '',
  'You inspect the actual rendered result of a lesson against what the lesson',
  'set out to teach, and report what is wrong with it.',
  '',
  'You are given: the original question, the correct answer, the teaching plan,',
  'the composition that was rendered, deterministic measurements taken from the',
  'rendered scene, and where available, captured frames.',
  '',
  'Judge four things:',
  '',
  'CORRECTNESS — does what is drawn match the correct answer? Is the maths',
  'consistent? Are physics vectors pointing the right way? Are chemical bonds',
  'connected to the right atoms?',
  '',
  'READABILITY — is anything clipped, off-screen, overlapping, too small to',
  'read, or hidden behind something else?',
  '',
  'COMPOSITION — is there a clear visual hierarchy? Is the important thing',
  'prominent? Is the board balanced, or crowded into one corner?',
  '',
  'PEDAGOGY — does the visual sequence actually explain the concept? Does the',
  'emphasis land on what matters? Is there motion that teaches nothing?',
  '',
  'FAIL the scene (status REPAIR_REQUIRED) when: important content is clipped,',
  'equations overlap, labels are unreadable, arrows point at the wrong object,',
  'the camera cuts off the result, the animation contradicts the explanation, or',
  'the final result is not clearly visible.',
  '',
  'PASS the scene when the concept is visually clear, nothing critical overlaps,',
  'and the final result is understandable.',
  '',
  'Use status FATAL only when the render is unusable — a blank board, or content',
  'that contradicts the correct answer outright.',
  '',
  'Trust the deterministic measurements over your impression of the frames for',
  'anything geometric. They are measured, not estimated.',
  '',
  'Be specific. "equation_3 overlaps graph_1 label" is useful; "layout could be',
  'better" is not. Name the ids you are complaining about in targets.',
  '',
  'You must NOT propose edits, rewrite the scene, or return a new plan. Report',
  'findings only.',
  '',
  'Scores are 0..1. Return a JSON object with keys: status (PASS,',
  'REPAIR_REQUIRED or FATAL), score, correctnessScore, compositionScore,',
  'readabilityScore, pedagogicalScore, issues (array of {category, severity,',
  'description, targets, beatId}), strengths, repairRecommendations.',
  '',
  'category is one of CORRECTNESS, VISIBILITY, OVERLAP, LAYOUT, CAMERA, TIMING,',
  'AESTHETICS. severity is CRITICAL, MAJOR or MINOR.',
  '',
  COMMON_RULES,
].join('\n');

export function criticUser(
  question: string,
  answer: AnswerArtifact,
  teaching: TeachingPlan,
  composition: SceneCompositionPlan,
  evidence: RenderEvidence
): string {
  return [
    `Original question:\n${question}`,
    '',
    `Correct answer: ${answer.finalAnswer}`,
    `Lesson objective: ${teaching.objective}`,
    '',
    jsonBlock('TeachingPlan (beats and objectives)', teaching.beats.map((b) => ({
      beatId: b.beatId,
      objective: b.objective,
    }))),
    '',
    jsonBlock('RenderedComposition', composition),
    '',
    jsonBlock('DeterministicMeasurements', evidence.measurements),
    '',
    evidence.frames.length
      ? `${evidence.frames.length} rendered frame(s) are attached. Inspect them.`
      : 'No frames could be captured; judge from the measurements and composition alone, and do not claim to have seen the render.',
    '',
    'Return the VisualReview.',
  ].join('\n');
}

export async function runCritic(
  deps: AgentDeps,
  question: string,
  answer: AnswerArtifact,
  teaching: TeachingPlan,
  composition: SceneCompositionPlan,
  evidence: RenderEvidence
): Promise<VisualReview> {
  deps.status('REVIEWING', 'Checking the visualization');

  return deps.models.executeStructured({
    stage: 'visual_critic',
    system: CRITIC_SYSTEM,
    user: criticUser(question, answer, teaching, composition, evidence),
    images: evidence.frames,
    schema: VisualReviewSchema,
    maxTokens: 3000,
    temperature: 0.1,
    signal: deps.signal,
  });
}
