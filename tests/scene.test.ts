/**
 * NEMO — scene engine tests.
 *
 * Runs the three demo lesson plans through the real executor and layout engine
 * (the same code the browser runs) and asserts that every action produces the
 * scene state the lesson depends on: real ink, resolved placement, no protected
 * overlaps, and a camera that frames the content.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { SceneStore, checkCollisions, cameraForBounds } from '../src/scene/store.ts';
import { applyAction } from '../src/scene/execute.ts';
import { binarySearchPlan, equationPlan, trianglePlan } from '../server/lesson/mockPlans.ts';
import { solveEquation } from '../shared/solver.ts';
import { boundsOverlap, worldBounds, type LessonPlan } from '../shared/contracts.ts';

const VIEWPORT = { width: 1440, height: 900 };

interface RunResult {
  store: SceneStore;
  outcomes: Array<{ type: string; kind: string; nodes: string[]; note?: string }>;
  drawn: number;
}

/** Execute a whole plan the way the presenter does, minus the animation delay. */
function runPlan(plan: LessonPlan): RunResult {
  const store = new SceneStore();
  const outcomes: RunResult['outcomes'] = [];
  let drawn = 0;
  for (const beat of plan.beats) {
    for (const action of beat.visualActions) {
      const outcome = applyAction(store, action, { lessonId: plan.lessonId, viewport: VIEWPORT });
      outcomes.push({
        type: action.type,
        kind: outcome.kind,
        nodes: outcome.nodeIds,
        note: outcome.note,
      });
      // The presenter tweens drawProgress to 1; do it instantly here.
      for (const id of outcome.nodeIds) {
        const n = store.get(id);
        if (n && outcome.kind === 'draw') {
          n.drawProgress = 1;
          drawn++;
        } else if (n) {
          n.drawProgress = 1;
        }
      }
      if (outcome.kind === 'camera' && outcome.camera) store.camera = outcome.camera;
    }
  }
  return { store, outcomes, drawn };
}

const PLANS: Array<[string, () => LessonPlan]> = [
  ['binary search', () => binarySearchPlan('lesson-bs', 'r', 'Explain binary search.')],
  ['triangle area', () => trianglePlan('lesson-tri', 'r', 'Explain the area of a triangle.')],
  [
    'equation',
    () => equationPlan('lesson-eq', 'r', '2x + 5 = 17', solveEquation('2x + 5 = 17')),
  ],
];

describe('scene engine executes every demo plan', () => {
  for (const [name, make] of PLANS) {
    test(`${name}: every action reaches an executor`, () => {
      const { outcomes } = runPlan(make());
      const unhandled = outcomes.filter((o) => o.note && /no executor for/.test(o.note));
      assert.deepEqual(unhandled, [], `unhandled actions in ${name}`);
    });

    test(`${name}: creates visible nodes with real ink`, () => {
      const { store } = runPlan(make());
      const nodes = store.list();
      assert.ok(nodes.length > 4, `${name} produced only ${nodes.length} nodes`);
      for (const n of nodes) {
        assert.ok(n.strokes.length > 0, `${n.id} has no strokes`);
        const points = n.strokes.reduce((sum, s) => sum + s.points.length, 0);
        assert.ok(points > 1, `${n.id} has no stroke points`);
        assert.ok(n.localBounds.w > 0 && n.localBounds.h > 0, `${n.id} has empty bounds`);
        assert.ok(Number.isFinite(n.transform.x) && Number.isFinite(n.transform.y),
          `${n.id} was never placed`);
      }
    });

    test(`${name}: no protected content overlaps after layout`, () => {
      const { store } = runPlan(make());
      const result = checkCollisions(store);
      assert.equal(result.pass, true, `overlaps: ${result.conflicts.join(' | ')}`);
    });

    test(`${name}: content fits a framed camera`, () => {
      const { store } = runPlan(make());
      const bounds = store.contentBounds();
      assert.ok(bounds, 'no content bounds');
      const cam = cameraForBounds(bounds!, VIEWPORT, 100, 1.1);
      assert.ok(cam.zoom > 0.1 && cam.zoom <= 1.1, `implausible zoom ${cam.zoom}`);
      assert.ok(Number.isFinite(cam.x) && Number.isFinite(cam.y));
    });

    test(`${name}: the same lesson id reproduces identical ink`, () => {
      const a = runPlan(make());
      const b = runPlan(make());
      const inkOf = (r: RunResult) =>
        r.store.list().map((n) => [n.id, n.strokes.flatMap((s) => s.points.map((p) => [p.x, p.y]))]);
      assert.deepEqual(inkOf(a), inkOf(b));
    });
  }
});

describe('binary search scene detail', () => {
  const { store } = runPlan(binarySearchPlan('lesson-bs', 'r', 'Explain binary search.'));

  test('the array is drawn with an anchor for every cell', () => {
    const array = store.list().find((n) => n.type === 'array');
    assert.ok(array, 'no array node');
    for (let i = 0; i < 7; i++) {
      assert.ok(array!.anchors?.[`cell${i}`], `missing anchor for cell ${i}`);
      assert.ok(array!.anchors?.[`cell${i}.top`]);
      assert.ok(array!.anchors?.[`cell${i}.bottom`]);
    }
  });

  test('pointers land on the cells they name', () => {
    const array = store.list().find((n) => n.type === 'array')!;
    const cellX = (i: number) => array.transform.x + array.anchors![`cell${i}`].x;

    // low-1 marks index 0, high-1 index 6, mid-1 index 3.
    const check = (id: string, index: number) => {
      const node = store.get(id);
      assert.ok(node, `${id} missing`);
      const b = worldBounds(node!);
      const centre = b.x + b.w / 2;
      assert.ok(
        Math.abs(centre - cellX(index)) < 60,
        `${id} centre ${centre.toFixed(0)} is not near cell ${index} at ${cellX(index).toFixed(0)}`
      );
    };
    check('low-1', 0);
    check('high-1', 6);
    check('mid-1', 3);
    check('mid-2', 5);
  });

  test('the discarded ranges cover the halves that were eliminated', () => {
    const array = store.list().find((n) => n.type === 'array')!;
    const ab = worldBounds(array);
    for (const id of ['discard-1', 'discard-2', 'found']) {
      const node = store.get(id);
      assert.ok(node, `${id} missing`);
      assert.ok(boundsOverlap(worldBounds(node!), ab, 0), `${id} does not cover the array`);
    }
    // The kept range is one cell wide; the discarded ones are wider.
    assert.ok(worldBounds(store.get('discard-1')!).w > worldBounds(store.get('found')!).w);
  });

  test('the lesson ends with the answer, the complexity and a summary on the board', () => {
    for (const id of ['result', 'complexity', 'summary', 'halving']) {
      const node = store.get(id);
      assert.ok(node, `${id} was never drawn`);
      assert.equal(node!.visible, true);
    }
  });
});

describe('equation scene detail', () => {
  const { store } = runPlan(
    equationPlan('lesson-eq', 'r', '2x + 5 = 17', solveEquation('2x + 5 = 17'))
  );

  test('each equation line sits below the previous one', () => {
    const ids = ['eq-0', 'eq-1', 'eq-2'];
    const ys = ids.map((id) => {
      const n = store.get(id);
      assert.ok(n, `${id} missing`);
      return worldBounds(n!).y;
    });
    assert.ok(ys[1] > ys[0], 'the second line must be below the first');
    assert.ok(ys[2] > ys[1], 'the third line must be below the second');
  });

  test('the balancing operation is written between the lines', () => {
    const op = store.get('op-1');
    assert.ok(op, 'the balancing note is missing');
    const eq0 = worldBounds(store.get('eq-0')!);
    const eq1 = worldBounds(store.get('eq-1')!);
    const opB = worldBounds(op!);
    assert.ok(opB.y >= eq0.y, 'operation should not sit above the first line');
    assert.ok(opB.y <= eq1.y + eq1.h, 'operation should not sit below the result line');
  });

  test('the final answer is on the board and circled', () => {
    // The last algebra line IS the answer, so it is emphasised in place.
    const answer = store.get('eq-2');
    assert.ok(answer, 'no answer line on the board');
    assert.equal(answer!.visible, true);
    const circle = store.list().find((n) => n.semanticRole === 'emphasise_answer');
    assert.ok(circle, 'the answer was never circled');
    assert.equal(circle!.attachedTo, 'eq-2', 'the circle must be around the answer');
    // And it is written exactly once.
    const answerLines = store.list().filter((n) => n.id.startsWith('eq-'));
    assert.equal(answerLines.length, 3, 'one line per solver step plus the original');
  });
});

describe('triangle scene detail', () => {
  const { store } = runPlan(trianglePlan('lesson-tri', 'r', 'Explain the area of a triangle.'));

  test('the triangle exposes the anchors the lesson labels', () => {
    const tri = store.get('triangle');
    assert.ok(tri);
    for (const key of ['baseLeft', 'baseRight', 'baseMid', 'apex', 'footOfHeight']) {
      assert.ok(tri!.anchors?.[key], `missing anchor ${key}`);
    }
  });

  test('the height sits inside the triangle', () => {
    const tri = worldBounds(store.get('triangle')!);
    const h = worldBounds(store.get('height')!);
    assert.ok(boundsOverlap(h, tri, 0), 'the height must be drawn on the triangle');
  });

  test('the formula is drawn', () => {
    const formula = store.get('formula');
    assert.ok(formula);
    assert.equal(formula!.visible, true);
    assert.ok(formula!.strokes.length > 5);
  });
});

describe('layout resolves collisions rather than stacking', () => {
  test('a lower-priority node is moved off a PRIMARY node', () => {
    const plan = binarySearchPlan('lesson-x', 'r', 'Explain binary search.');
    const { store } = runPlan(plan);
    const nodes = store.list().filter((n) => n.type !== 'highlight' && n.localBounds.w > 1);
    let overlaps = 0;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        if (boundsOverlap(worldBounds(nodes[i]), worldBounds(nodes[j]), 0)) overlaps++;
      }
    }
    // Markers deliberately sit against the array they point at; everything else
    // must be clear. Keep this tight enough to catch a regression.
    assert.ok(overlaps <= 4, `${overlaps} overlapping pairs is too many`);
  });
});

describe('domain executors execute cleanly', () => {
  test('physics, CS, chemistry and graph capabilities create visible nodes', () => {
    const store = new SceneStore();
    const actions = [
      { actionId: 'a1', beatId: 'b1', semanticRole: 'test', type: 'CREATE_VECTOR', target: 'vec1', parameters: { label: 'v', magnitude: 100 } },
      { actionId: 'a2', beatId: 'b1', semanticRole: 'test', type: 'DRAW_TRAJECTORY', target: 'traj1', parameters: { width: 300 } },
      { actionId: 'a3', beatId: 'b1', semanticRole: 'test', type: 'CREATE_FORCE_DIAGRAM', target: 'force1', parameters: {} },
      { actionId: 'a4', beatId: 'b1', semanticRole: 'test', type: 'DRAW_TREE', target: 'tree1', parameters: { values: [10, 5, 15] } },
      { actionId: 'a5', beatId: 'b1', semanticRole: 'test', type: 'DRAW_LINKED_LIST', target: 'list1', parameters: { values: ['head', 'node1', 'null'] } },
      { actionId: 'a6', beatId: 'b1', semanticRole: 'test', type: 'DRAW_STACK', target: 'stack1', parameters: { items: ['bottom', 'top'] } },
      { actionId: 'a7', beatId: 'b1', semanticRole: 'test', type: 'CREATE_ATOM', target: 'atom1', parameters: { symbol: 'Na' } },
      { actionId: 'a8', beatId: 'b1', semanticRole: 'test', type: 'CREATE_MOLECULE', target: 'mol1', parameters: { formula: 'H2O' } },
      { actionId: 'a9', beatId: 'b1', semanticRole: 'test', type: 'PLOT_POINTS', target: 'pts1', parameters: { points: [[10, 20], [30, 40]] } },
    ];

    for (const action of actions) {
      const outcome = applyAction(store, action, { lessonId: 'test-domain', viewport: VIEWPORT });
      assert.equal(outcome.kind, 'draw');
      assert.ok(outcome.nodeIds.length > 0);
      const node = store.get(outcome.nodeIds[0]);
      assert.ok(node);
      assert.ok(node.strokes.length > 0);
    }
  });
});
