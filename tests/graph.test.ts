/**
 * NEMO — Phase 3: the agent graph.
 *
 * These tests run the REAL compiled LangGraph. Only the provider and the
 * renderer are substituted, so routing, the repair budget, the deterministic
 * compile step and the measurement floor are all genuinely exercised.
 *
 * The provider answers according to which agent is asking, by recognising the
 * agent's own system prompt — so a change that breaks an agent's contract
 * breaks these tests rather than silently degrading the lesson.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import type { LessonPlan, SceneNode } from '../shared/contracts.ts';
import type { CompleteOptions, LLMProvider, ProviderName } from '../server/providers/index.ts';
import { WorkflowTrace } from '../server/observability/trace.ts';
import { ModelExecutionService } from '../server/models/execution.ts';
import { buildGraph, routeAfterCritic, type RenderService } from '../server/workflow/graph.ts';
import { MAX_VISUAL_REPAIR_ITERATIONS, type NemoStateType } from '../server/workflow/state.ts';
import {
  measureScene,
  deterministicFailures,
  type RenderEvidence,
} from '../server/rendering/evidence.ts';

/* --------------------------------------------------------------- fixtures */

const ANSWER = {
  domain: 'computer_science',
  normalizedQuestion: 'Explain how binary search works.',
  approach: 'Halve the search interval each step.',
  explanation:
    'Binary search works on a sorted array. It compares the target with the middle element, and because the array is sorted, that single comparison eliminates half of the remaining candidates. Repeating this on the surviving half shrinks the search range geometrically until the target is found or the range is empty, which is why the cost is logarithmic.',
  steps: [{ step: 1, operation: 'compare midpoint', result: 'discard half', reason: 'sorted' }],
  finalAnswer: 'Binary search finds the target in O(log n) comparisons.',
  keyConcepts: ['sorted input', 'midpoint', 'halving'],
  prerequisites: ['arrays'],
  misconceptions: ['works on unsorted data'],
  assumptions: [],
  verified: false,
};

const beat = (n: number) => ({
  beatId: `beat-${n}`,
  order: n,
  objective: `objective ${n}`,
  explanation: `explanation ${n}`,
  narration: `narration ${n}`,
  completionCriteria: ['beat_visuals_complete'],
  keepVisible: [],
  emphasis: [],
});

const TEACHING = {
  objective: 'Explain binary search.',
  beats: [beat(1), beat(2), beat(3), beat(4)],
  finalSummary: 'Each comparison halves the remaining range, so cost is O(log n).',
  anticipatedMisconceptions: [],
};

const VISUAL = {
  visuals: TEACHING.beats.map((b, i) => ({
    beatId: b.beatId,
    capability:
      i === 0 ? 'DRAW_ARRAY' : i === TEACHING.beats.length - 1 ? 'SHOW_FINAL_ANSWER' : 'WRITE_LABEL',
    purpose: `serve ${b.objective}`,
    target: i === 0 ? 'array_1' : `label_${i}`,
    priority: i === 0 ? 'PRIMARY' : 'SECONDARY',
  })),
};

function composition(tag: string) {
  return {
    beats: TEACHING.beats.map((b, i) => ({
      beatId: b.beatId,
      actions: [
        i === TEACHING.beats.length - 1
          ? {
              actionId: `${tag}-a${i}`,
              beatId: b.beatId,
              type: 'SHOW_FINAL_ANSWER',
              semanticRole: 'final answer',
              target: 'final_answer',
              relations: [{ type: 'BELOW', target: 'array_1', gap: 'loose' }],
              priority: 'PRIMARY',
              parameters: { text: 'O(log n) comparisons' },
            }
          : i === 0
          ? {
              actionId: `${tag}-a${i}`,
              beatId: b.beatId,
              type: 'DRAW_ARRAY',
              semanticRole: 'sorted array',
              target: 'array_1',
              relations: [],
              priority: 'PRIMARY',
              parameters: { values: [3, 7, 10, 14, 18, 21, 27, 31, 36] },
            }
          : {
              actionId: `${tag}-a${i}`,
              beatId: b.beatId,
              type: 'WRITE_LABEL',
              semanticRole: 'explanatory label',
              target: `label_${i}`,
              relations: [{ type: 'BELOW', target: 'array_1', gap: 'normal' }],
              priority: 'SECONDARY',
              parameters: { text: `step ${i}` },
            },
      ],
      parallelGroups: [],
    })),
  };
}

const REPAIR = {
  summary: 'Move the overlapping label below the array.',
  actions: [
    {
      operation: 'REPOSITION',
      target: 'label_1',
      targets: [],
      relation: { type: 'BELOW', target: 'array_1', gap: 'loose' },
      reason: 'it overlapped the array',
      addressesCategory: 'OVERLAP',
    },
  ],
};

const review = (status: string, score: number, issues: unknown[] = []) => ({
  status,
  score,
  correctnessScore: 1,
  compositionScore: score,
  readabilityScore: score,
  pedagogicalScore: score,
  issues,
  strengths: [],
  repairRecommendations: [],
});

const OVERLAP_ISSUE = {
  category: 'OVERLAP',
  severity: 'CRITICAL',
  description: 'label_1 overlaps array_1',
  targets: ['label_1', 'array_1'],
};

/* ------------------------------------------------------- stage provider */

interface Script {
  /** Reviews returned by successive critic calls. */
  reviews: unknown[];
}

/** Answers as whichever agent is asking, identified by its system prompt. */
class StageProvider implements LLMProvider {
  readonly name: ProviderName = 'mock';
  readonly model = 'stage-mock';
  readonly stages: string[] = [];
  private script: Script;
  private criticCalls = 0;
  private composerCalls = 0;

  constructor(script: Script) {
    this.script = script;
  }

  async complete(opts: CompleteOptions): Promise<string> {
    const s = opts.system;
    const reply = (stage: string, value: unknown) => {
      this.stages.push(stage);
      return JSON.stringify(value);
    };

    if (s.includes('Solver Agent')) return reply('solver', ANSWER);
    if (s.includes('Teaching Director')) return reply('director', TEACHING);
    if (s.includes('Visual Planner')) return reply('planner', VISUAL);
    if (s.includes('Visual Composer')) {
      this.composerCalls++;
      return reply(
        this.composerCalls === 1 ? 'composer' : 'composer_repair',
        composition(`c${this.composerCalls}`)
      );
    }
    if (s.includes('Visual Critic')) {
      const next = this.script.reviews[this.criticCalls] ?? review('PASS', 0.9);
      this.criticCalls++;
      return reply('critic', next);
    }
    if (s.includes('Repair Agent')) return reply('repair', REPAIR);

    throw new Error(`unrecognised agent prompt: ${s.slice(0, 60)}`);
  }
}

/* ----------------------------------------------------------- render stub */

function evidenceWith(overrides: Partial<RenderEvidence['measurements']> = {}): RenderEvidence {
  return {
    measurements: {
      nodeCount: 4,
      visibleCount: 4,
      viewport: { width: 1920, height: 1080 },
      overlaps: [],
      clipped: [],
      offScreen: [],
      tooSmall: [],
      fillRatio: 0.35,
      blank: false,
      ...overrides,
    },
    frames: ['ZmFrZQ=='],
  };
}

class StubRenderer implements RenderService {
  readonly plans: LessonPlan[] = [];
  private evidence: RenderEvidence;

  constructor(evidence: RenderEvidence = evidenceWith()) {
    this.evidence = evidence;
  }

  async render(plan: LessonPlan): Promise<RenderEvidence> {
    this.plans.push(plan);
    return this.evidence;
  }
}

/* ------------------------------------------------------------- harness */

async function run(
  script: Script,
  opts: {
    renderer?: StubRenderer;
    criticEnabled?: boolean;
    reviewEnabled?: boolean;
    maxIterations?: number;
  } = {}
) {
  const provider = new StageProvider(script);
  const renderer = opts.renderer ?? new StubRenderer();
  const trace = new WorkflowTrace('req-1', 'sess-1');
  const statuses: string[] = [];
  const published: Array<{ plan: LessonPlan; revision: number }> = [];

  const graph = buildGraph({
    models: new ModelExecutionService({ primary: provider, trace, sleep: async () => {} }),
    status: (stage) => statuses.push(stage),
    renderer,
    criticEnabled: opts.criticEnabled ?? true,
    reviewEnabled: opts.reviewEnabled ?? true,
    onPlan: (plan, revision) => published.push({ plan, revision }),
  });

  const final = (await graph.invoke({
    question: 'Explain binary search.',
    requestId: 'req-1',
    sessionId: 'sess-1',
    lessonId: 'lesson-1',
    maxIterations: opts.maxIterations ?? MAX_VISUAL_REPAIR_ITERATIONS,
  })) as NemoStateType;

  return { final, provider, renderer, trace, statuses, published };
}

/* ------------------------------------------------------------ the tests */

describe('graph — happy path', () => {
  test('runs every agent once, in order, and produces a validated lesson', async () => {
    const { final, provider, renderer } = await run({ reviews: [review('PASS', 0.92)] });

    assert.deepEqual(provider.stages, [
      'solver',
      'director',
      'planner',
      'composer',
      'critic',
    ]);

    assert.deepEqual(final.visited, [
      'solver',
      'director',
      'planner',
      'composer',
      'compile',
      'render',
      'critic',
      'finish',
    ]);

    assert.equal(final.status, 'READY');
    assert.equal(final.iteration, 0, 'a passing scene needs no repair');
    assert.equal(renderer.plans.length, 1, 'rendered exactly once');

    // The compiled plan is the existing LessonPlan contract, fully populated.
    const plan = final.lessonPlan!;
    assert.equal(plan.status, 'READY');
    assert.equal(plan.domain, 'computer_science');
    assert.equal(plan.beats.length, 4);
    assert.ok(plan.beats.every((b) => b.visualActions.length > 0));
  });

  test('artifacts are carried in state as typed objects, not raw model text', async () => {
    const { final } = await run({ reviews: [review('PASS', 0.9)] });
    assert.equal(final.answer?.finalAnswer, ANSWER.finalAnswer);
    assert.equal(final.teaching?.beats.length, 4);
    assert.ok((final.visual?.visuals.length ?? 0) > 0);
    assert.ok(final.composition !== null);
    assert.equal(final.review?.status, 'PASS');
  });
});

describe('graph — repair loop', () => {
  test('a failing review triggers repair, recompile, re-render and re-review', async () => {
    const { final, provider, renderer } = await run({
      reviews: [review('REPAIR_REQUIRED', 0.4, [OVERLAP_ISSUE]), review('PASS', 0.88)],
    });

    assert.deepEqual(final.visited, [
      'solver',
      'director',
      'planner',
      'composer',
      'compile',
      'render',
      'critic',
      'repair',
      'compile',
      'render',
      'critic',
      'finish',
    ]);

    assert.equal(final.iteration, 1);
    assert.equal(final.status, 'READY');
    assert.equal(renderer.plans.length, 2, 'the repaired scene is rendered again');

    // Repair re-enters at the composer, never back through solver/director.
    assert.equal(provider.stages.filter((s) => s === 'solver').length, 1);
    assert.equal(provider.stages.filter((s) => s === 'director').length, 1);
    assert.equal(provider.stages.filter((s) => s === 'repair').length, 1);
    assert.equal(provider.stages.filter((s) => s === 'composer_repair').length, 1);

    assert.ok(
      final.warnings.some((w) => w.includes('Repair pass 1')),
      'the repair must be recorded, not silent'
    );
  });

  test('the repair budget is hard — it stops at maxIterations and still returns a lesson', async () => {
    const failing = review('REPAIR_REQUIRED', 0.3, [OVERLAP_ISSUE]);
    const { final, renderer } = await run({
      reviews: [failing, failing, failing, failing, failing],
    });

    assert.equal(final.iteration, MAX_VISUAL_REPAIR_ITERATIONS);
    assert.equal(renderer.plans.length, MAX_VISUAL_REPAIR_ITERATIONS + 1);
    assert.equal(final.status, 'READY', 'must finish, not hang');
    assert.ok(final.lessonPlan, 'a best-effort lesson is still returned');
  });

  test('a configurable budget of zero disables repair entirely', async () => {
    const { final, renderer } = await run(
      { reviews: [review('REPAIR_REQUIRED', 0.3, [OVERLAP_ISSUE])] },
      { maxIterations: 0 }
    );
    assert.equal(final.iteration, 0);
    assert.equal(renderer.plans.length, 1);
    assert.equal(final.visited.includes('repair'), false);
  });

  test('a FATAL review does not attempt repair', async () => {
    const { final, renderer } = await run({ reviews: [review('FATAL', 0.05)] });
    assert.equal(final.visited.includes('repair'), false);
    assert.equal(renderer.plans.length, 1);
    assert.equal(final.status, 'READY');
  });
});

describe('graph — routing', () => {
  const base = { iteration: 0, maxIterations: 2 } as NemoStateType;

  test('PASS and FATAL finish; REPAIR_REQUIRED repairs while budget remains', () => {
    assert.equal(routeAfterCritic({ ...base, review: review('PASS', 1) } as NemoStateType), 'finish');
    assert.equal(routeAfterCritic({ ...base, review: review('FATAL', 0) } as NemoStateType), 'finish');
    assert.equal(
      routeAfterCritic({ ...base, review: review('REPAIR_REQUIRED', 0.2) } as NemoStateType),
      'repair'
    );
  });

  test('an exhausted budget finishes even while failing', () => {
    assert.equal(
      routeAfterCritic({
        ...base,
        iteration: 2,
        review: review('REPAIR_REQUIRED', 0.2),
      } as NemoStateType),
      'finish'
    );
  });

  test('a missing review finishes rather than looping', () => {
    assert.equal(routeAfterCritic({ ...base, review: null } as NemoStateType), 'finish');
  });
});

describe('graph — measurements outrank the model', () => {
  test('a PASS is overridden when geometry is provably broken', async () => {
    const renderer = new StubRenderer(
      evidenceWith({ offScreen: ['label_2'], visibleCount: 3 })
    );
    const { final } = await run({ reviews: [review('PASS', 0.95), review('PASS', 0.95)] }, { renderer });

    // The model said PASS every time; the measurement forced repair anyway,
    // and the budget — not the model — is what finally stopped the loop.
    assert.ok(final.visited.includes('repair'), 'a measured defect must force repair');
    assert.equal(final.review?.status, 'REPAIR_REQUIRED');
    assert.equal(final.iteration, MAX_VISUAL_REPAIR_ITERATIONS);
    assert.equal(final.status, 'READY', 'still terminates with a lesson');
  });

  test('without a vision critic, measurements alone still gate the scene', async () => {
    const clean = new StubRenderer();
    const { final: passing, provider } = await run({ reviews: [] }, { renderer: clean, criticEnabled: false });
    assert.equal(passing.review?.status, 'PASS');
    assert.equal(provider.stages.includes('critic'), false, 'no model call for the critic');
    assert.ok(passing.visited.includes('critic:deterministic'));

    const broken = new StubRenderer(evidenceWith({ blank: true, visibleCount: 0 }));
    const { final: failing } = await run({ reviews: [] }, { renderer: broken, criticEnabled: false });
    assert.equal(failing.review?.status, 'REPAIR_REQUIRED');
    assert.ok(failing.visited.includes('repair'));
  });
});

/* -------------------------------------------------------- measurements */

describe('scene measurement', () => {
  const node = (id: string, x: number, y: number, w: number, h: number): SceneNode => ({
    id,
    type: 'text',
    semanticRole: 'label',
    priority: 'SECONDARY',
    visible: true,
    strokes: [],
    localBounds: { w, h },
    transform: { x, y, scale: 1, rotation: 0 },
    opacity: 1,
    drawProgress: 1,
    color: '#fff',
  });

  const vp = { width: 1000, height: 800 };

  test('a clean scene reports no defects', () => {
    const m = measureScene([node('a', 10, 10, 200, 60), node('b', 10, 200, 200, 60)], vp);
    assert.deepEqual(m.overlaps, []);
    assert.deepEqual(m.clipped, []);
    assert.equal(m.blank, false);
    assert.deepEqual(deterministicFailures(m), []);
  });

  test('substantial overlap is detected and reported by coverage', () => {
    const m = measureScene([node('a', 100, 100, 200, 100), node('b', 120, 110, 200, 100)], vp);
    assert.equal(m.overlaps.length, 1);
    assert.ok(m.overlaps[0].coverage > 0.5);
    assert.ok(deterministicFailures(m).some((f) => f.includes('overlap')));
  });

  test('deliberate attachment is not counted as an overlap defect', () => {
    const label = { ...node('label', 105, 105, 50, 20), attachedTo: 'box' };
    const m = measureScene([node('box', 100, 100, 200, 100), label], vp);
    assert.deepEqual(m.overlaps, [], 'attached nodes are meant to overlap');
  });

  test('clipping names the edge and the fraction lost', () => {
    const m = measureScene([node('wide', 900, 100, 400, 100)], vp);
    assert.equal(m.clipped.length, 1);
    assert.deepEqual(m.clipped[0].edges, ['right']);
    assert.ok(m.clipped[0].outsideFraction > 0.5);
    assert.ok(deterministicFailures(m).some((f) => f.includes('outside the viewport')));
  });

  test('a fully off-screen node is reported as off-screen, not clipped', () => {
    const m = measureScene([node('gone', 2000, 2000, 100, 100)], vp);
    assert.deepEqual(m.offScreen, ['gone']);
    assert.equal(m.clipped.length, 0);
    assert.ok(deterministicFailures(m).some((f) => f.includes('off-screen')));
  });

  test('unreadably small nodes are flagged', () => {
    const m = measureScene([node('tiny', 10, 10, 4, 4)], vp);
    assert.deepEqual(m.tooSmall, ['tiny']);
    assert.ok(deterministicFailures(m).some((f) => f.includes('readable minimum')));
  });

  test('an empty board is a failure, not a pass', () => {
    const m = measureScene([], vp);
    assert.equal(m.blank, true);
    assert.ok(deterministicFailures(m).some((f) => f.includes('empty')));
  });

  test('measurement is deterministic for the same input', () => {
    const nodes = [node('a', 100, 100, 200, 100), node('b', 120, 110, 200, 100)];
    assert.deepEqual(measureScene(nodes, vp), measureScene(nodes, vp));
  });
});
