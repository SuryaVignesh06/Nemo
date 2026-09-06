/**
 * NEMO — end to end.
 *
 * The real LangGraph workflow driving the real ManimGL renderer. Only the model
 * is substituted (there is no API key in CI, and a live model would make the
 * test non-deterministic); everything below the agents is production code:
 * the registry, the validators, the compiler, ManimGL, frame capture, real
 * measured geometry, and the critic/repair routing.
 *
 * This is the test that would catch "the interfaces are wired but nothing
 * actually renders".
 *
 * Opt in with NEMO_RENDER_TEST=1; skipped when manimgl is unavailable.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { CompleteOptions, LLMProvider, ProviderName } from '../server/providers/index.ts';
import { WorkflowTrace } from '../server/observability/trace.ts';
import { ModelExecutionService } from '../server/models/execution.ts';
import { buildGraph } from '../server/workflow/graph.ts';
import type { NemoStateType } from '../server/workflow/state.ts';
import { ManimGLRenderer } from '../server/rendering/manimgl.ts';
import { mockPlanFor } from '../server/lesson/mockPlans.ts';

/**
 * Answers as each agent, reusing the scripted binary-search lesson so the
 * composition is one the compiler and ManimGL can genuinely render.
 */
class LessonProvider implements LLMProvider {
  readonly name: ProviderName = 'mock';
  readonly model = 'e2e-mock';
  readonly stages: string[] = [];
  private criticCalls = 0;

  private plan = mockPlanFor('lesson-e2e', 'req-e2e', 'Explain binary search.');

  async complete(opts: CompleteOptions): Promise<string> {
    const s = opts.system;

    if (s.includes('Solver Agent')) {
      this.stages.push('solver');
      return JSON.stringify({
        domain: 'computer_science',
        normalizedQuestion: 'Explain how binary search works.',
        approach: 'Halve the search interval on each comparison.',
        steps: [
          { step: 1, operation: 'compare midpoint', result: 'discard half', reason: 'sorted' },
        ],
        finalAnswer: this.plan.answer,
        keyConcepts: ['sorted input', 'midpoint'],
        prerequisites: [],
        misconceptions: [],
        assumptions: [],
      });
    }

    if (s.includes('Teaching Director')) {
      this.stages.push('director');
      return JSON.stringify({
        objective: this.plan.objective,
        beats: this.plan.beats.map((b) => ({
          beatId: b.beatId,
          order: b.order,
          objective: b.objective,
          explanation: b.explanation,
          narration: b.narration,
          completionCriteria: b.completionCriteria,
          keepVisible: [],
          emphasis: [],
        })),
        finalSummary: this.plan.finalSummary,
        anticipatedMisconceptions: [],
      });
    }

    if (s.includes('Visual Planner')) {
      this.stages.push('planner');
      return JSON.stringify({
        visuals: this.plan.beats.flatMap((b) =>
          b.visualActions.map((a) => ({
            beatId: b.beatId,
            capability: a.type,
            purpose: b.objective,
            target: a.target ?? a.actionId,
            priority: a.priority ?? 'SECONDARY',
          }))
        ),
      });
    }

    if (s.includes('Visual Composer')) {
      this.stages.push('composer');
      return JSON.stringify({
        beats: this.plan.beats.map((b) => ({
          beatId: b.beatId,
          actions: b.visualActions.map((a) => ({
            actionId: a.actionId,
            beatId: b.beatId,
            type: a.type,
            semanticRole: a.semanticRole,
            target: a.target,
            relations: a.relations ?? [],
            priority: a.priority ?? 'SECONDARY',
            parameters: a.parameters ?? {},
          })),
          parallelGroups: [],
        })),
      });
    }

    if (s.includes('Visual Critic')) {
      this.criticCalls++;
      this.stages.push('critic');
      // Pass on the first review so the run terminates in one render.
      return JSON.stringify({
        status: 'PASS',
        score: 0.85,
        correctnessScore: 0.9,
        compositionScore: 0.8,
        readabilityScore: 0.85,
        pedagogicalScore: 0.85,
        issues: [],
        strengths: ['the array is established before it is searched'],
        repairRecommendations: [],
      });
    }

    if (s.includes('Repair Agent')) {
      this.stages.push('repair');
      return JSON.stringify({
        summary: 'no-op',
        actions: [
          {
            operation: 'CAMERA_FIT',
            target: 'array',
            targets: [],
            reason: 'keep the array in frame',
            addressesCategory: 'CAMERA',
          },
        ],
      });
    }

    throw new Error(`unrecognised agent prompt: ${s.slice(0, 60)}`);
  }
}

describe('end to end — LangGraph through real ManimGL', () => {
  test('a question becomes a rendered, measured, reviewed lesson', async (t) => {
    if (process.env.NEMO_RENDER_TEST !== '1') {
      t.skip('set NEMO_RENDER_TEST=1 to run the live end-to-end workflow');
      return;
    }
    if (!(await ManimGLRenderer.available())) {
      t.skip('manimgl is not installed on this machine');
      return;
    }

    const provider = new LessonProvider();
    const trace = new WorkflowTrace('req-e2e', 'sess-e2e');
    const statuses: string[] = [];

    const graph = buildGraph({
      models: new ModelExecutionService({ primary: provider, trace, sleep: async () => {} }),
      status: (stage) => statuses.push(stage),
      // The real renderer: real manimgl subprocess, real ffmpeg frame capture.
      renderer: new ManimGLRenderer(),
      criticEnabled: true,
    });

    const final = (await graph.invoke({
      question: 'Explain binary search.',
      requestId: 'req-e2e',
      sessionId: 'sess-e2e',
      lessonId: 'lesson-e2e',
      maxIterations: 1,
    })) as NemoStateType;

    // Every agent ran.
    for (const stage of ['solver', 'director', 'planner', 'composer', 'critic']) {
      assert.ok(provider.stages.includes(stage), `${stage} did not run`);
    }

    // A real lesson came out the far end.
    assert.equal(final.status, 'READY');
    assert.ok(final.lessonPlan, 'no lesson plan produced');
    assert.ok(final.lessonPlan!.beats.length >= 4, 'lesson is too short to teach anything');
    assert.ok(
      final.lessonPlan!.beats.every((b) => b.visualActions.length > 0),
      'every beat must draw something'
    );

    // The critic judged an actual render, not the JSON that produced it.
    const evidence = final.evidence!;
    assert.ok(evidence, 'no render evidence');
    assert.equal(evidence.captureError, undefined, `render failed: ${evidence.captureError}`);
    assert.ok(evidence.frames.length > 0, 'no frames were captured for the critic');
    assert.ok(evidence.measurements.nodeCount > 0, 'no geometry was measured from the render');
    assert.equal(evidence.measurements.blank, false, 'the rendered board was empty');

    // The workflow reported real progress to the UI.
    assert.ok(statuses.includes('RENDERING'));
    assert.ok(statuses.includes('REVIEWING'));

    // Every model call is accounted for.
    assert.ok(trace.attempts.length >= 5);
    assert.ok(trace.attempts.every((a) => a.status === 'SUCCESS'));
  });
});
