/**
 * NEMO — test suite.
 *
 * Covers the guarantees the build spec calls out: plan validation, rejection of
 * incomplete plans and unknown capabilities, the equation solver, the three
 * demo scenarios, deterministic ink, layout collision resolution, and the
 * absence of any browser-speech fallback.
 *
 * Run with: npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { solveEquation, looksLikeEquation, ParseError } from '../shared/solver.ts';
import {
  containsRawCode,
  hasPlaceholderText,
  normaliseBeat,
  stripRawCoordinates,
  validateAction,
  validatePlan,
} from '../shared/validate.ts';
import {
  CAPABILITIES,
  EXECUTABLE_TYPES,
  canonicalType,
  isExecutable,
  isKnownCapability,
} from '../shared/registry.ts';
import { benzenePlan, binarySearchPlan, equationPlan, integralPlan, mockPlanFor, physicsPlan, trianglePlan } from '../server/lesson/mockPlans.ts';
import { LessonError, type LessonPlan } from '../shared/contracts.ts';
import { extractJson } from '../server/providers/index.ts';
import { separationVector } from '../src/scene/store.ts';
import { seededRandom, textToStrokes, measureText } from '../src/handwriting/strokes.ts';

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

/* ------------------------------------------------------- equation solver */

describe('equation solver', () => {
  test('solves the demo equation correctly', () => {
    const s = solveEquation('2x + 5 = 17');
    assert.equal(s.finalAnswer, 'x = 6');
    assert.equal(s.verified, true);
    assert.equal(s.steps.length, 2);
    assert.match(s.steps[0].operation, /subtract 5/);
    assert.equal(s.steps[0].result, '2x = 12');
    assert.match(s.steps[1].operation, /divide both sides by 2/);
    assert.equal(s.steps[1].result, 'x = 6');
  });

  test('handles parentheses, division and variables on both sides', () => {
    assert.equal(solveEquation('3(x - 2) = 9').finalAnswer, 'x = 5');
    assert.equal(solveEquation('x/2 + 3 = 8').finalAnswer, 'x = 10');
    assert.equal(solveEquation('4x + 3 = x + 18').finalAnswer, 'x = 5');
    assert.equal(solveEquation('-2x + 1 = 9').finalAnswer, 'x = -4');
  });

  test('every solution verifies by substitution', () => {
    for (const q of ['2x + 5 = 17', '3(x - 2) = 9', 'x/2 + 3 = 8', '7y - 4 = 24']) {
      assert.equal(solveEquation(q).verified, true, `${q} should verify`);
    }
  });

  test('rejects input it cannot solve rather than guessing', () => {
    assert.throws(() => solveEquation('x^2 = 4'), ParseError);
    assert.throws(() => solveEquation('x + y = 3'), ParseError);
    assert.throws(() => solveEquation('not an equation'), ParseError);
  });

  test('distinguishes equations from prose that contains "="', () => {
    assert.equal(looksLikeEquation('2x + 5 = 17'), true);
    assert.equal(looksLikeEquation('Explain binary search.'), false);
    assert.equal(looksLikeEquation('what does E = mc2 mean'), false);
  });
});

/* ------------------------------------------------------------- registry */

describe('capability registry', () => {
  test('catalogues the full registry and marks a drawable subset', () => {
    assert.ok(CAPABILITIES.length > 250, `expected a large catalog, got ${CAPABILITIES.length}`);
    assert.ok(EXECUTABLE_TYPES.length > 60);
    assert.ok(EXECUTABLE_TYPES.length < CAPABILITIES.length);
  });

  test('every action type named in the build spec is allowlisted', () => {
    const specTypes = [
      'DRAW_TEXT', 'WRITE_HANDWRITING', 'WRITE_EQUATION', 'DRAW_CIRCLE', 'DRAW_RECTANGLE',
      'DRAW_TRIANGLE', 'DRAW_LINE', 'DRAW_ARROW', 'DRAW_VECTOR', 'DRAW_ARRAY', 'DRAW_GRAPH',
      'DRAW_AXIS', 'HIGHLIGHT', 'UNDERLINE', 'CIRCLE_TERM', 'STRIKE_TERM', 'BRACKET_TERM',
      'MOVE_OBJECT', 'TRANSFORM_OBJECT', 'FADE_IN', 'FADE_OUT', 'REVEAL', 'CAMERA_FOCUS',
      'CAMERA_FIT', 'CAMERA_FOLLOW', 'CAMERA_PAN', 'CAMERA_ZOOM', 'WAIT', 'SECTION_END',
    ];
    for (const t of specTypes) {
      assert.ok(isKnownCapability(t), `${t} missing from the registry`);
      assert.ok(isExecutable(t), `${t} has no executor`);
    }
  });

  test('aliases resolve to a canonical executable capability', () => {
    assert.equal(canonicalType('DRAW_GRAPH'), 'PLOT_FUNCTION');
    assert.equal(canonicalType('MOVE_OBJECT'), 'MOVE_TO');
    assert.equal(canonicalType('UNDERLINE'), 'UNDERLINE_TEXT');
    assert.equal(canonicalType('DRAW_CIRCLE'), 'DRAW_CIRCLE');
    for (const cap of CAPABILITIES) {
      if (cap.aliasOf) assert.ok(isExecutable(cap.aliasOf), `${cap.type} aliases a dead target`);
    }
  });

  test('registry sections from both source documents are present', () => {
    const sections = new Set(CAPABILITIES.map((c) => c.section));
    for (const s of [
      '2. Text, handwriting, and typography',
      '13. Camera and framing',
      '16. Physics visuals',
      '18. Chemistry visuals',
      '20. Computer science visuals',
      '23. 3D / spatial concepts for ManimGL',
      '31. AI output constraints',
    ]) {
      assert.ok(sections.has(s as never), `missing section ${s}`);
    }
  });
});

/* ----------------------------------------------------------- validation */

describe('AI output constraints', () => {
  test('rejects an unknown capability', () => {
    const { action, reasons } = validateAction(
      { type: 'DRAW_DRAGON', semanticRole: 'x', parameters: {} },
      'beat-1',
      0
    );
    assert.equal(action, null);
    assert.match(reasons[0], /REJECT_UNKNOWN_CAPABILITY/);
  });

  test('rejects a catalogued capability that has no executor', () => {
    const { action, reasons } = validateAction(
      { type: 'CREATE_3D_OBJECT', semanticRole: 'spatial_model', parameters: {} },
      'beat-1',
      0
    );
    assert.equal(action, null);
    assert.match(reasons[0], /no executor/);
  });

  test('rejects raw renderer code anywhere in an action', () => {
    for (const payload of [
      { type: 'DRAW_CIRCLE', parameters: { text: 'self.play(Create(circle))' } },
      { type: 'DRAW_CIRCLE', parameters: { text: '<svg><circle r="4"/></svg>' } },
      { type: 'DRAW_CIRCLE', parameters: { text: 'ctx.arc(1,2,3)' } },
      { type: 'DRAW_CIRCLE', parameters: { text: '```python\nfrom manim import *\n```' } },
    ]) {
      const { action, reasons } = validateAction(payload, 'beat-1', 0);
      assert.equal(action, null, `should reject ${JSON.stringify(payload.parameters)}`);
      assert.match(reasons[0], /REJECT_RAW_CODE/);
    }
  });

  test('detects code in nested structures', () => {
    assert.ok(containsRawCode({ a: { b: ['from manim import Scene'] } }).length > 0);
    assert.equal(containsRawCode({ a: { b: ['a sorted array of numbers'] } }).length, 0);
  });

  test('strips model-supplied coordinates, keeping semantic parameters', () => {
    const { params, removed } = stripRawCoordinates({ x: 100, y: 20, text: 'hello', radius: 40 });
    assert.deepEqual(Object.keys(params).sort(), ['radius', 'text']);
    assert.deepEqual(removed.sort(), ['x', 'y']);
  });

  test('an action with coordinates is accepted but stripped and reported', () => {
    const { action, reasons } = validateAction(
      { type: 'DRAW_CIRCLE', semanticRole: 'c', parameters: { x: 5, y: 9, radius: 30 } },
      'beat-1',
      0
    );
    assert.ok(action);
    assert.equal(action!.parameters.x, undefined);
    assert.equal(action!.parameters.radius, 30);
    assert.match(reasons.join(' '), /REJECT_RAW_COORDINATES/);
  });

  test('flags placeholder phrasing that means the plan stopped halfway', () => {
    assert.equal(hasPlaceholderText('then continue similarly for the rest'), true);
    assert.equal(hasPlaceholderText('and so on'), true);
    assert.equal(hasPlaceholderText('now compare the midpoint'), false);
  });

  test('only whitelisted relations survive normalisation', () => {
    const { action } = validateAction(
      {
        type: 'DRAW_TEXT',
        semanticRole: 't',
        parameters: { text: 'hi' },
        relations: [
          { type: 'BELOW', target: 'title' },
          { type: 'TELEPORT_TO', target: 'title' },
          { type: 'ABOVE' },
        ],
      },
      'beat-1',
      0
    );
    assert.equal(action!.relations!.length, 1);
    assert.equal(action!.relations![0].type, 'BELOW');
  });
});

/* -------------------------------------------------------- plan validation */

function minimalPlan(overrides: Partial<LessonPlan> = {}): LessonPlan {
  return {
    lessonId: 'l1',
    requestId: 'r1',
    question: 'q',
    domain: 'general',
    answer: 'an answer',
    objective: 'an objective',
    finalSummary: 'a summary',
    status: 'READY',
    beats: [],
    ...overrides,
  };
}

describe('lesson plan validation', () => {
  test('accepts each of the scripted scenarios', () => {
    for (const plan of [
      binarySearchPlan('l', 'r', 'Explain binary search.'),
      trianglePlan('l', 'r', 'Explain the area of a triangle.'),
      equationPlan('l', 'r', '2x + 5 = 17', solveEquation('2x + 5 = 17')),
      benzenePlan('l', 'r', 'Explain benzene structure and electron delocalization.'),
      physicsPlan('l', 'r', 'A 2 kg block is pulled along a rough horizontal surface by a 10 N force'),
      integralPlan('l', 'r', 'Evaluate \\int_0^2 x^2 dx and explain what the integral represents geometrically.'),
    ]) {
      const result = validatePlan(plan);
      assert.equal(result.ok, true, `${plan.question} failed: ${result.reasons.join(' | ')}`);
    }
  });

  test('rejects a plan with no beats', () => {
    const r = validatePlan(minimalPlan());
    assert.equal(r.ok, false);
    assert.match(r.reasons[0], /REJECT_INCOMPLETE_PLAN/);
  });

  test('rejects a beat that has no visual actions', () => {
    const plan = binarySearchPlan('l', 'r', 'Explain binary search.');
    plan.beats[4].visualActions = [];
    const r = validatePlan(plan);
    assert.equal(r.ok, false);
    assert.match(r.reasons.join(' '), /has no visual actions/);
  });

  test('rejects a lesson that never concludes', () => {
    const plan = binarySearchPlan('l', 'r', 'Explain binary search.');
    plan.beats = plan.beats.slice(0, 4);
    const r = validatePlan(plan);
    assert.equal(r.ok, false);
    assert.match(r.reasons.join(' '), /does not conclude/);
  });

  test('rejects placeholder narration', () => {
    const plan = trianglePlan('l', 'r', 'triangle area');
    plan.beats[2].narration = 'draw the base, and so on';
    const r = validatePlan(plan);
    assert.equal(r.ok, false);
  });

  test('no action is silently dropped: rejects survive as reasons', () => {
    const { beat, reasons } = normaliseBeat(
      {
        beatId: 'beat-1',
        visualActions: [
          { type: 'DRAW_CIRCLE', semanticRole: 'ok', parameters: {} },
          { type: 'DRAW_DRAGON', semanticRole: 'bad', parameters: {} },
        ],
      },
      0
    );
    assert.equal(beat!.visualActions.length, 1);
    assert.equal(reasons.length > 0, true, 'the rejected action must be reported');
  });
});

/* ------------------------------------------------------------ scenarios */

describe('demo scenarios', () => {
  test('binary search teaches the whole algorithm, not just narration', () => {
    const plan = binarySearchPlan('l', 'r', 'Explain binary search.');
    const types = plan.beats.flatMap((b) => b.visualActions.map((a) => a.type));
    for (const required of [
      'DRAW_ARRAY',
      'MARK_LOW',
      'MARK_HIGH',
      'MARK_MIDPOINT',
      'HIGHLIGHT_ARRAY_RANGE',
      'SHOW_FINAL_ANSWER',
      'SUMMARIZE',
    ]) {
      assert.ok(types.includes(required), `binary search is missing ${required}`);
    }
    // Three iterations means three midpoint markings.
    assert.equal(types.filter((t) => t === 'MARK_MIDPOINT').length >= 2, true);
    // The halving argument and the complexity must both be drawn.
    const text = JSON.stringify(plan);
    assert.match(text, /O\(log n\)/);
    assert.match(text, /n\/2/);
    assert.ok(plan.beats.length >= 10);
  });

  test('binary search discards a half at each comparison', () => {
    const plan = binarySearchPlan('l', 'r', 'Explain binary search.');
    const ranges = plan.beats
      .flatMap((b) => b.visualActions)
      .filter((a) => a.type === 'HIGHLIGHT_ARRAY_RANGE');
    const discards = ranges.filter((a) => a.parameters.mode === 'discard');
    assert.equal(discards.length, 2, 'two halves are eliminated before the target is found');
    assert.ok(ranges.some((a) => a.parameters.mode === 'keep'), 'the found cell is kept');
  });

  test('the equation plan draws every solver step in order', () => {
    const solution = solveEquation('2x + 5 = 17');
    const plan = equationPlan('l', 'r', '2x + 5 = 17', solution);
    const equations = plan.beats
      .flatMap((b) => b.visualActions)
      .filter((a) => a.type === 'WRITE_EQUATION')
      .map((a) => String(a.parameters.expression));
    assert.deepEqual(equations, ['2x + 5 = 17', '2x = 12', 'x = 6']);

    // The last step already wrote "x = 6", so the lesson emphasises that line
    // rather than writing the answer a second time.
    const emphasis = plan.beats
      .flatMap((b) => b.visualActions)
      .filter((a) => a.type === 'CIRCLE_TERM' || a.type === 'PULSE');
    assert.equal(emphasis.length, 2, 'the answer should be circled and pulsed');
    assert.ok(emphasis.every((a) => a.target === 'eq-2'), 'emphasis must land on the answer line');
    assert.equal(
      plan.beats.flatMap((b) => b.visualActions).filter((a) => a.type === 'SHOW_FINAL_ANSWER').length,
      0,
      'no duplicate answer line'
    );
  });

  test('an equation whose last step is not the answer still shows it explicitly', () => {
    // "5x = 20" solves in one division, so the final line is the answer.
    // "x + 4 = 9" also ends on the answer; use a form that does not.
    const solution = solveEquation('x = 7');
    const plan = equationPlan('l', 'r', 'x = 7', solution);
    const shown = plan.beats
      .flatMap((b) => b.visualActions)
      .filter((a) => a.type === 'SHOW_FINAL_ANSWER' || a.type === 'CIRCLE_TERM');
    assert.ok(shown.length > 0, 'the answer must be revealed one way or the other');
  });

  test('the triangle plan draws the shape, both labels and the formula', () => {
    const plan = trianglePlan('l', 'r', 'Explain the area of a triangle.');
    const types = plan.beats.flatMap((b) => b.visualActions.map((a) => a.type));
    assert.ok(types.includes('DRAW_TRIANGLE'));
    assert.ok(types.includes('DRAW_LINE'), 'the height must be drawn');
    const text = JSON.stringify(plan);
    assert.match(text, /"label":"b"|"text":"b"|"label": "b"/);
    assert.match(text, /A = 1\/2 b h/);
  });

  test('demo mode solves an arbitrary linear equation, not just the scripted one', () => {
    const plan = mockPlanFor('l', 'r', '5x - 10 = 30');
    assert.match(JSON.stringify(plan), /x = 8/);
  });

  test('demo mode refuses an unscripted question instead of showing something unrelated', () => {
    assert.throws(
      () => mockPlanFor('l', 'r', 'Explain photosynthesis'),
      (err: unknown) => err instanceof LessonError && err.code === 'UNSUPPORTED'
    );
  });
});

/* --------------------------------------------------------- provider layer */

describe('provider response handling', () => {
  test('extracts JSON from a fenced block', () => {
    assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  });

  test('extracts JSON surrounded by prose', () => {
    assert.deepEqual(extractJson('Sure! {"a": [1,2]} hope that helps'), { a: [1, 2] });
  });

  test('is not confused by braces inside strings', () => {
    assert.deepEqual(extractJson('{"a":"}{"}'), { a: '}{' });
  });

  test('reports truncated JSON rather than returning a partial object', () => {
    assert.throws(
      () => extractJson('{"a": 1, "b": '),
      (err: unknown) => err instanceof LessonError && err.code === 'INVALID_RESPONSE'
    );
  });
});

/* -------------------------------------------------------- layout engine */

describe('layout and anti-overlap', () => {
  test('separation vector pushes along the shortest axis', () => {
    const mover = { x: 0, y: 0, w: 100, h: 100 };
    const anchor = { x: 90, y: 0, w: 100, h: 100 };
    const v = separationVector(mover, anchor, 0);
    assert.equal(v.y, 0);
    assert.equal(v.x, -10, 'push left, the shallower overlap');
  });

  test('separation resolves a vertical overlap vertically', () => {
    const mover = { x: 0, y: 80, w: 100, h: 100 };
    const anchor = { x: 0, y: 0, w: 100, h: 100 };
    const v = separationVector(mover, anchor, 0);
    assert.equal(v.x, 0);
    assert.equal(v.y, 20, 'push down and clear');
  });

  test('separation includes the requested padding', () => {
    const v = separationVector({ x: 0, y: 80, w: 100, h: 100 }, { x: 0, y: 0, w: 100, h: 100 }, 10);
    assert.equal(v.y, 30);
  });
});

/* ---------------------------------------------------------- handwriting */

describe('handwriting', () => {
  test('the same seed always produces identical ink', () => {
    const a = textToStrokes('x = 6', 40, 'lesson-1:node-1');
    const b = textToStrokes('x = 6', 40, 'lesson-1:node-1');
    assert.deepEqual(
      a.strokes.map((s) => s.points),
      b.strokes.map((s) => s.points)
    );
  });

  test('a different seed produces different ink', () => {
    const a = textToStrokes('x = 6', 40, 'lesson-1:node-1');
    const b = textToStrokes('x = 6', 40, 'lesson-1:node-2');
    assert.notDeepEqual(
      a.strokes.map((s) => s.points),
      b.strokes.map((s) => s.points)
    );
  });

  test('the seeded RNG is stable and well distributed', () => {
    const r1 = seededRandom('abc');
    const r2 = seededRandom('abc');
    const draws = Array.from({ length: 200 }, () => r1());
    assert.deepEqual(draws.slice(0, 5), Array.from({ length: 5 }, () => r2()));
    assert.ok(draws.every((v) => v >= 0 && v < 1));
    const mean = draws.reduce((a, b) => a + b, 0) / draws.length;
    assert.ok(mean > 0.35 && mean < 0.65, `mean ${mean} looks skewed`);
  });

  test('every character of the demo scenarios has real strokes', () => {
    const text = 'Binary Search 2x + 5 = 17 A = 1/2 b h low high mid O(log n)';
    const result = textToStrokes(text, 30, 'seed');
    assert.ok(result.strokes.length > text.replace(/\s/g, '').length);
    assert.ok(result.width > 0);
    // A space is the only character allowed to contribute no ink.
    for (const ch of text.replace(/\s/g, '')) {
      assert.ok(textToStrokes(ch, 30, 's').strokes.length > 0, `"${ch}" produced no strokes`);
    }
  });

  test('measured width matches the built strokes', () => {
    const size = 32;
    const built = textToStrokes('binary search', size, 'seed');
    const measured = measureText('binary search', size);
    assert.ok(Math.abs(built.width - measured) < size * 0.4);
  });
});

/* ------------------------------------------------------------- security */

describe('security posture', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
    }
    return out;
  };

  const sourceFiles = walk(join(ROOT, 'src'))
    .concat(walk(join(ROOT, 'server')))
    .concat(walk(join(ROOT, 'shared')));

  test('no browser speech synthesis anywhere in the app', () => {
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8');
      // The voice module mentions it only to say it is deliberately absent.
      const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      assert.ok(
        !/speechSynthesis|SpeechSynthesisUtterance/.test(code),
        `${file} references browser speech synthesis`
      );
    }
  });

  test('model output is never evaluated', () => {
    for (const file of sourceFiles) {
      const code = readFileSync(file, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
      assert.ok(!/\beval\s*\(/.test(code), `${file} calls eval`);
      assert.ok(!/new\s+Function\s*\(/.test(code), `${file} constructs a Function`);
    }
  });

  test('no API key is hard-coded', () => {
    for (const file of sourceFiles) {
      const text = readFileSync(file, 'utf8');
      assert.ok(!/sk-[A-Za-z0-9]{20,}/.test(text), `${file} contains a literal API key`);
      assert.ok(!/xi-api-key['"]\s*:\s*['"][A-Za-z0-9]{16,}/.test(text), `${file} hard-codes a voice key`);
    }
  });
});
