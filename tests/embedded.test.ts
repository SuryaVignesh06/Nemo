import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { esp32LedPlan, mockPlanFor } from '../server/lesson/mockPlans.ts';
import { validatePlan } from '../shared/validate.ts';
import { EXECUTABLE_TYPES, VISUAL_FUNCTIONS } from '../shared/registry.ts';
import { applyAction } from '../src/scene/execute.ts';
import { checkCollisions, SceneStore } from '../src/scene/store.ts';

const VIEWPORT = { width: 1440, height: 900 };

function executeEsp32() {
  const plan = esp32LedPlan('lesson-esp32', 'request-esp32', 'How does an ESP32 turn on an LED?');
  const store = new SceneStore();
  const outcomes: Array<{ type: string; nodeIds: string[]; note?: string; unresolved: string[] }> = [];
  for (const beat of plan.beats) {
    for (const action of beat.visualActions) {
      const result = applyAction(store, action, { lessonId: plan.lessonId, viewport: VIEWPORT });
      outcomes.push({
        type: action.type,
        nodeIds: result.nodeIds,
        note: result.note,
        unresolved: result.layout?.unresolved ?? [],
      });
      for (const id of result.nodeIds) {
        const node = store.get(id);
        if (node) node.drawProgress = 1;
      }
    }
  }
  return { plan, store, outcomes };
}

describe('ESP32 LED visual-function family', () => {
  test('every registered function in the slice has an executable implementation', () => {
    const names = [
      'CREATE_ESP32',
      'CREATE_GPIO',
      'CREATE_RESISTOR',
      'CREATE_LED',
      'CREATE_GROUND',
      'CREATE_WIRE',
      'CREATE_CODE_BLOCK',
      'HIGHLIGHT_CODE_LINE',
      'SET_GPIO_STATE',
      'SHOW_CURRENT_FLOW',
      'SET_LED_STATE',
    ];
    for (const name of names) {
      assert.ok(EXECUTABLE_TYPES.includes(name), `${name} is not executable`);
      assert.equal(VISUAL_FUNCTIONS.validate(name).ok, true, `${name} fails registry validation`);
    }
  });

  test('the canonical lesson is complete, valid, and selected by Demo Mode', () => {
    const plan = mockPlanFor('lesson', 'request', 'How does an ESP32 turn on an LED?');
    assert.equal(plan.domain, 'embedded_systems');
    assert.equal(validatePlan(plan).ok, true, validatePlan(plan).reasons.join('\n'));
    const types = plan.beats.flatMap((beat) => beat.visualActions.map((action) => action.type));
    for (const required of [
      'CREATE_ESP32', 'CREATE_GPIO', 'CREATE_RESISTOR', 'CREATE_LED', 'CREATE_GROUND',
      'CREATE_WIRE', 'CREATE_CODE_BLOCK', 'HIGHLIGHT_CODE_LINE', 'SET_GPIO_STATE',
      'SHOW_CURRENT_FLOW', 'SET_LED_STATE', 'SHOW_FINAL_ANSWER',
    ]) {
      assert.ok(types.includes(required), `lesson omitted ${required}`);
    }
  });

  test('executes every action into real ink or a deliberate state mutation', () => {
    const { store, outcomes } = executeEsp32();
    for (const outcome of outcomes) {
      if (outcome.type === 'CAMERA_FIT' || outcome.type === 'SECTION_END') continue;
      assert.ok(outcome.nodeIds.length > 0, `${outcome.type} produced no node/state evidence: ${outcome.note}`);
    }
    const visible = store.list().filter((node) => node.visible && node.opacity > 0.05);
    assert.ok(visible.length >= 15);
    assert.ok(visible.every((node) => node.strokes.length > 0), 'every visible node has drawable ink');
  });

  test('preserves component identity while GPIO and LED states change', () => {
    const { store } = executeEsp32();
    assert.equal(store.get('gpio2')?.state?.level, 'HIGH');
    assert.equal(store.get('led')?.state?.power, 'ON');
    assert.equal(store.list().filter((node) => node.id === 'gpio2').length, 1);
    assert.equal(store.list().filter((node) => node.id === 'led').length, 1);
  });

  test('keeps the active code line readable beneath its highlight', () => {
    const { store } = executeEsp32();
    const highlight = store.get('code-line-2-highlight');
    assert.equal(highlight?.type, 'highlight');
    assert.ok(highlight?.strokes.every((stroke) => stroke.opacity <= 0.4));
  });

  test('routes wires between real semantic objects and leaves protected content collision-free', () => {
    const { store, outcomes } = executeEsp32();
    for (const id of ['wire_gpio_resistor', 'wire_resistor_led', 'wire_led_ground']) {
      const wire = store.get(id);
      assert.equal(wire?.type, 'wire');
      assert.equal(wire?.state?.routed, true);
      assert.equal(wire?.connections?.length, 2);
      assert.ok((wire?.strokes.length ?? 0) >= 2);
    }
    assert.deepEqual(outcomes.flatMap((outcome) => outcome.unresolved), []);
    assert.deepEqual(checkCollisions(store), { pass: true, conflicts: [] });
  });

  test('is geometry-deterministic across replays with the same lesson id', () => {
    const renderedGeometry = () => executeEsp32().store.list().map((node) => ({
      id: node.id,
      strokes: node.strokes.map(({ id: _allocationId, ...stroke }) => stroke),
    }));
    const first = renderedGeometry();
    const second = renderedGeometry();
    assert.deepEqual(first, second);
  });
});
