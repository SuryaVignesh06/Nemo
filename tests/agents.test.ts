/**
 * NEMO — Phase 2: agent contracts.
 *
 * The point of these schemas is to make illegal agent output unrepresentable,
 * so the tests are mostly about what must be REJECTED: invented capabilities,
 * documented-but-undrawable capabilities, raw code, and pixel coordinates
 * smuggled in where a semantic relation belongs.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  AnswerArtifactSchema,
  ComposedActionSchema,
  ExecutableCapabilitySchema,
  NarrationPlanSchema,
  RelationSchema,
  RepairPlanSchema,
  SceneCompositionPlanSchema,
  TeachingPlanSchema,
  VisualPlanSchema,
  VisualReviewSchema,
  orderIssues,
} from '../shared/agents.ts';
import { EXECUTABLE_TYPES, CAPABILITIES, isExecutable } from '../shared/registry.ts';

/* ------------------------------------------------------- capability gate */

describe('capability gating', () => {
  test('every executable registry type is accepted', () => {
    for (const type of EXECUTABLE_TYPES) {
      const r = ExecutableCapabilitySchema.safeParse(type);
      assert.equal(r.success, true, `${type} should be accepted`);
    }
  });

  test('an invented capability is rejected', () => {
    const r = ExecutableCapabilitySchema.safeParse('CREATE_SUPER_MAGICAL_FORCE_FIELD');
    assert.equal(r.success, false);
  });

  test('a documented but undrawable capability is rejected, not silently dropped', () => {
    const documentedOnly = CAPABILITIES.find((c) => !isExecutable(c.type) && !c.aliasOf);
    assert.ok(documentedOnly, 'registry should contain a documented-only capability');
    const r = ExecutableCapabilitySchema.safeParse(documentedOnly.type);
    assert.equal(r.success, false, `${documentedOnly.type} has no executor and must be refused`);
  });
});

/* ------------------------------------------------------------- relations */

describe('relations', () => {
  test('registry relation types are accepted with semantic gaps', () => {
    const r = RelationSchema.safeParse({ type: 'BELOW', target: 'graph_1', gap: 'normal' });
    assert.equal(r.success, true);
  });

  test('an invented relation type is rejected', () => {
    assert.equal(RelationSchema.safeParse({ type: 'DIAGONAL_TO', target: 'a' }).success, false);
  });
});

/* -------------------------------------------------------- AnswerArtifact */

describe('AnswerArtifact', () => {
  test('accepts a solved problem and defaults the optional lists', () => {
    const r = AnswerArtifactSchema.safeParse({
      domain: 'mathematics',
      normalizedQuestion: 'Evaluate the integral of x^2 from 0 to 2.',
      approach: 'Apply the power rule then evaluate the bounds.',
      steps: [{ step: 1, operation: 'antidifferentiate', result: 'x^3/3', reason: 'power rule' }],
      finalAnswer: '8/3',
    });
    assert.equal(r.success, true);
    if (!r.success) return;
    assert.deepEqual(r.data.keyConcepts, []);
    assert.equal(r.data.verified, false);
  });

  test('rejects an unknown domain', () => {
    const r = AnswerArtifactSchema.safeParse({
      domain: 'astrology',
      normalizedQuestion: 'q',
      approach: 'a',
      finalAnswer: 'x',
    });
    assert.equal(r.success, false);
  });

  test('rejects an answer carrying executable code', () => {
    const r = AnswerArtifactSchema.safeParse({
      domain: 'general',
      normalizedQuestion: 'q',
      approach: 'a',
      finalAnswer: '__import__("os").system("rm -rf /")',
    });
    assert.equal(r.success, false, 'code in an artifact must not validate');
  });
});

/* ---------------------------------------------------------- TeachingPlan */

describe('TeachingPlan', () => {
  const beat = (n: number) => ({
    beatId: `beat-${n}`,
    order: n,
    objective: `objective ${n}`,
    explanation: `explanation ${n}`,
    narration: `narration ${n}`,
  });

  test('accepts a multi-beat lesson', () => {
    const r = TeachingPlanSchema.safeParse({
      objective: 'Explain binary search.',
      beats: [beat(1), beat(2), beat(3)],
      finalSummary: 'O(log n).',
    });
    assert.equal(r.success, true);
  });

  test('rejects a one-beat lesson, which is not a lesson', () => {
    const r = TeachingPlanSchema.safeParse({
      objective: 'o',
      beats: [beat(1)],
      finalSummary: 's',
    });
    assert.equal(r.success, false);
  });
});

/* ------------------------------------------------------------ VisualPlan */

describe('VisualPlan', () => {
  test('accepts planned visuals bound to real capabilities', () => {
    const r = VisualPlanSchema.safeParse({
      visuals: [
        {
          beatId: 'beat-1',
          capability: 'DRAW_ARRAY',
          purpose: 'establish the sorted array',
          target: 'array_1',
          priority: 'PRIMARY',
        },
      ],
    });
    assert.equal(r.success, true);
  });

  test('rejects a plan that names a capability with no executor', () => {
    const r = VisualPlanSchema.safeParse({
      visuals: [
        { beatId: 'b1', capability: 'SUMMON_DRAGON', purpose: 'p', target: 't' },
      ],
    });
    assert.equal(r.success, false);
  });

  test('rejects an empty plan', () => {
    assert.equal(VisualPlanSchema.safeParse({ visuals: [] }).success, false);
  });
});

/* -------------------------------------------------- SceneCompositionPlan */

describe('SceneCompositionPlan', () => {
  const action = {
    actionId: 'a1',
    beatId: 'beat-1',
    type: 'DRAW_ARRAY',
    semanticRole: 'sorted array',
    target: 'array_1',
    relations: [{ type: 'BELOW', target: 'title_1', gap: 'normal' }],
    priority: 'PRIMARY',
    parameters: { values: [3, 7, 10, 14, 18, 21, 27, 31, 36] },
  };

  test('accepts a composed beat with semantic relations', () => {
    const r = SceneCompositionPlanSchema.safeParse({
      beats: [{ beatId: 'beat-1', actions: [action], parallelGroups: [] }],
    });
    assert.equal(r.success, true);
  });

  test('composition carries relations, never a resolved position', () => {
    const r = ComposedActionSchema.safeParse(action);
    assert.equal(r.success, true);
    if (!r.success) return;
    // Geometry is the layout engine's job; the contract has no place to put it.
    assert.equal('x' in r.data, false);
    assert.equal('y' in r.data, false);
  });

  test('rejects an action whose type is not executable', () => {
    const r = ComposedActionSchema.safeParse({ ...action, type: 'DRAW_HYPERCUBE' });
    assert.equal(r.success, false);
  });
});

/* ---------------------------------------------------------- VisualReview */

describe('VisualReview', () => {
  test('accepts a passing review with scores in range', () => {
    const r = VisualReviewSchema.safeParse({
      status: 'PASS',
      score: 0.9,
      correctnessScore: 1,
      compositionScore: 0.85,
      readabilityScore: 0.9,
      pedagogicalScore: 0.88,
    });
    assert.equal(r.success, true);
  });

  test('rejects an out-of-range score', () => {
    const r = VisualReviewSchema.safeParse({
      status: 'PASS',
      score: 11,
      correctnessScore: 1,
      compositionScore: 1,
      readabilityScore: 1,
      pedagogicalScore: 1,
    });
    assert.equal(r.success, false);
  });

  test('accepts a repair-required review carrying categorised issues', () => {
    const r = VisualReviewSchema.safeParse({
      status: 'REPAIR_REQUIRED',
      score: 0.4,
      correctnessScore: 1,
      compositionScore: 0.3,
      readabilityScore: 0.4,
      pedagogicalScore: 0.6,
      issues: [
        {
          category: 'OVERLAP',
          severity: 'CRITICAL',
          description: 'equation_3 overlaps the graph label',
          targets: ['equation_3', 'graph_1'],
        },
      ],
    });
    assert.equal(r.success, true);
  });
});

/* -------------------------------------------------------- issue ordering */

describe('repair priority', () => {
  test('correctness outranks visibility, overlap, camera and aesthetics', () => {
    const ordered = orderIssues([
      { category: 'AESTHETICS', severity: 'CRITICAL' },
      { category: 'CAMERA', severity: 'MAJOR' },
      { category: 'CORRECTNESS', severity: 'MINOR' },
      { category: 'OVERLAP', severity: 'CRITICAL' },
      { category: 'VISIBILITY', severity: 'MAJOR' },
    ] as const);
    assert.deepEqual(
      ordered.map((i) => i.category),
      ['CORRECTNESS', 'VISIBILITY', 'OVERLAP', 'CAMERA', 'AESTHETICS']
    );
  });

  test('within a category, severity breaks the tie', () => {
    const ordered = orderIssues([
      { category: 'OVERLAP', severity: 'MINOR' },
      { category: 'OVERLAP', severity: 'CRITICAL' },
    ] as const);
    assert.equal(ordered[0].severity, 'CRITICAL');
  });
});

/* ------------------------------------------------------------ RepairPlan */

describe('RepairPlan', () => {
  test('accepts a semantic reposition, the example from the brief', () => {
    const r = RepairPlanSchema.safeParse({
      summary: 'Move the overlapping equation above the graph.',
      actions: [
        {
          operation: 'REPOSITION',
          target: 'equation_3',
          relation: { type: 'ABOVE', target: 'graph_1', gap: 'normal' },
          reason: 'it overlapped the graph label',
          addressesCategory: 'OVERLAP',
        },
      ],
    });
    assert.equal(r.success, true);
  });

  test('accepts CAMERA_FIT and SEQUENCE repairs', () => {
    const r = RepairPlanSchema.safeParse({
      summary: 'Fit the answer and serialise the simultaneous animations.',
      actions: [
        {
          operation: 'CAMERA_FIT',
          target: 'final_answer',
          reason: 'the camera cut off the final answer',
          addressesCategory: 'CAMERA',
        },
        {
          operation: 'SEQUENCE',
          target: 'beat-4',
          targets: ['a1', 'a2', 'a3'],
          reason: 'too many simultaneous animations',
          addressesCategory: 'TIMING',
        },
      ],
    });
    assert.equal(r.success, true);
  });

  test('rejects an operation outside the closed repair set', () => {
    const r = RepairPlanSchema.safeParse({
      summary: 's',
      actions: [
        { operation: 'RUN_PYTHON', target: 't', reason: 'r', addressesCategory: 'LAYOUT' },
      ],
    });
    assert.equal(r.success, false);
  });

  test('rejects an empty repair plan', () => {
    assert.equal(RepairPlanSchema.safeParse({ summary: 's', actions: [] }).success, false);
  });
});

/* --------------------------------------------------------- NarrationPlan */

describe('NarrationPlan', () => {
  test('accepts narration events tied to beats', () => {
    const r = NarrationPlanSchema.safeParse({
      events: [
        { beatId: 'beat-1', kind: 'SPEAK', text: 'We start with a sorted array.' },
        { beatId: 'beat-1', kind: 'PAUSE', text: '', holdSeconds: 1 },
      ],
    });
    assert.equal(r.success, true);
  });

  test('defaults to silence rather than failing', () => {
    const r = NarrationPlanSchema.safeParse({});
    assert.equal(r.success, true);
    if (!r.success) return;
    assert.deepEqual(r.data.events, []);
  });
});
