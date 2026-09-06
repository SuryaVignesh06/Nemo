/**
 * NEMO — Phase 4: the ManimGL renderer.
 *
 * The fast tests assert the migration itself: the compiler must target
 * manimlib, use ManimGL's animation names, and refuse anything outside the
 * registry. They run everywhere and catch a regression back to Community Manim.
 *
 * The slow test drives the real `manimgl` binary end to end. It is skipped when
 * the toolchain is absent (no OpenGL, no FFmpeg) rather than failing, and is
 * opt-in via NEMO_RENDER_TEST=1 so `npm test` stays quick.
 *
 * Run it with:  NEMO_RENDER_TEST=1 npm test
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { mockPlanFor } from '../server/lesson/mockPlans.ts';
import { validatePlan } from '../shared/validate.ts';
import { ManimGLRenderer } from '../server/rendering/manimgl.ts';
import { measureRects, deterministicFailures } from '../server/rendering/evidence.ts';

const compiler = readFileSync('manim/nemo_compiler.py', 'utf8');

/* ------------------------------------------------------ the migration */

describe('ManimGL migration', () => {
  test('the compiler imports manimlib, not Community Manim', () => {
    assert.match(compiler, /from manimlib import/);
    assert.doesNotMatch(
      compiler,
      /^\s*from manim import/m,
      'importing `manim` would load Manim Community'
    );
  });

  test('it uses ShowCreation, which is ManimGL name for Create', () => {
    assert.match(compiler, /ShowCreation\(/);
    assert.doesNotMatch(
      compiler,
      /[^w]\bCreate\(/,
      'Create is Community-only and does not exist in manimlib'
    );
  });

  test('MathTex is gone — ManimGL calls it Tex', () => {
    assert.doesNotMatch(compiler, /MathTex/);
  });

  test('no dataclass survives, which ManimGL module loader cannot process', () => {
    // manimlib loads scene files through its own ModuleLoader, leaving
    // sys.modules[__module__] as None; dataclass field resolution then fails.
    assert.doesNotMatch(compiler, /@dataclass/);
  });

  test('model strings are rendered as Text, never compiled as TeX', () => {
    // Handing a model string to a TeX compiler would make content into a command.
    assert.doesNotMatch(compiler, /Tex\(\s*body/);
    assert.match(compiler, /def _equation/);
  });

  test('there is no eval, exec or import of anything the plan names', () => {
    for (const forbidden of [/\beval\(/, /\bexec\(/, /__import__/, /subprocess/]) {
      assert.doesNotMatch(compiler, forbidden, `${forbidden} must not appear in the compiler`);
    }
  });

  test('an action with no adapter is refused loudly rather than skipped', () => {
    assert.match(compiler, /class UnsupportedAction/);
    assert.match(compiler, /raise UnsupportedAction/);
  });

  test('the compiler emits measured geometry for the critic', () => {
    assert.match(compiler, /_dump_bounds/);
    assert.match(compiler, /NEMO_BOUNDS/);
  });

  test('the ESP32 visual-function slice has controlled ManimGL adapters', () => {
    for (const action of [
      'CREATE_ESP32', 'CREATE_GPIO', 'SET_GPIO_STATE', 'CREATE_RESISTOR',
      'CREATE_LED', 'SET_LED_STATE', 'CREATE_GROUND', 'CREATE_WIRE',
      'CREATE_CODE_BLOCK', 'HIGHLIGHT_CODE_LINE', 'SHOW_CURRENT_FLOW',
    ]) {
      assert.match(compiler, new RegExp(`"${action}"`), `${action} missing from compiler`);
    }
  });
});

/* -------------------------------------------------- measurement bridge */

describe('measured geometry from the renderer', () => {
  test('ManimGL-shaped bounds flow into the same measurement code as the board', () => {
    const viewport = { width: 854, height: 480 };
    const rects = [
      { id: 'title', x: 311, y: 225, w: 232, h: 30 },
      { id: 'array', x: 203, y: 362, w: 449, h: 60 },
      // Deliberately overlapping the array, as a broken layout would.
      { id: 'label', x: 210, y: 370, w: 200, h: 40 },
      // Entirely outside the frame.
      { id: 'lost', x: 2000, y: 900, w: 100, h: 40 },
    ];
    const m = measureRects(rects, viewport);

    assert.equal(m.viewport.width, 854);
    assert.equal(m.nodeCount, 4);
    assert.equal(m.blank, false);
    assert.ok(m.overlaps.some((o) => o.a === 'array' && o.b === 'label'));
    assert.deepEqual(m.offScreen, ['lost']);

    const failures = deterministicFailures(m);
    assert.ok(failures.some((f) => f.includes('off-screen')));
    assert.ok(failures.some((f) => f.includes('overlap')));
  });
});

/* ------------------------------------------------------- real renderer */

describe('ManimGL renderer (live)', () => {
  test('renders a real lesson and returns frames plus measured geometry', async (t) => {
    if (process.env.NEMO_RENDER_TEST !== '1') {
      t.skip('set NEMO_RENDER_TEST=1 to run the live ManimGL render');
      return;
    }
    if (!(await ManimGLRenderer.available())) {
      t.skip('manimgl is not installed on this machine');
      return;
    }

    const plan = mockPlanFor('lesson-1', 'req-1', 'Explain binary search.');
    assert.equal(validatePlan(plan).ok, true, 'fixture plan must be valid');

    const evidence = await new ManimGLRenderer().render(plan);

    assert.equal(evidence.captureError, undefined, 'render should not report a capture failure');
    assert.ok(evidence.frames.length > 0, 'frames must be captured for the critic');
    assert.ok(evidence.frames[0].length > 1000, 'a frame should carry real image data');

    const m = evidence.measurements;
    assert.equal(m.blank, false, 'the board must not be empty');
    assert.ok(m.nodeCount > 0, 'geometry must be measured from the render');
    assert.ok(m.viewport.width > 0 && m.viewport.height > 0);
  });

  test('a missing binary degrades to a capture error, it does not throw', async () => {
    const renderer = new ManimGLRenderer({ binary: 'definitely-not-a-real-binary' });
    const plan = mockPlanFor('lesson-1', 'req-1', 'Explain binary search.');

    const evidence = await renderer.render(plan);

    // The workflow must survive a machine with no renderer: the critic then
    // works from measurements alone rather than the lesson failing outright.
    assert.ok(evidence.captureError, 'the failure must be reported');
    assert.deepEqual(evidence.frames, []);
    assert.equal(evidence.measurements.blank, true);
  });
});
