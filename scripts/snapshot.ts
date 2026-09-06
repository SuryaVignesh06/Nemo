/**
 * NEMO — headless scene snapshot.
 *
 * Runs a lesson plan through the real scene engine and dumps the resulting ink
 * as JSON for `scripts/snapshot.py` to rasterise. This is a development aid for
 * checking handwriting and layout without opening a browser; the browser is
 * still the product.
 *
 *     node scripts/snapshot.ts binary   > out.json
 *     node scripts/snapshot.ts equation > out.json
 *     node scripts/snapshot.ts triangle > out.json
 */

import { SceneStore } from '../src/scene/store.ts';
import { applyAction } from '../src/scene/execute.ts';
import { binarySearchPlan, equationPlan, esp32LedPlan, trianglePlan } from '../server/lesson/mockPlans.ts';
import { solveEquation } from '../shared/solver.ts';
import { worldBounds, type LessonPlan } from '../shared/contracts.ts';

const VIEWPORT = { width: 1440, height: 900 };

const which = process.argv[2] ?? 'binary';
const plan: LessonPlan =
  which === 'esp32'
    ? esp32LedPlan('lesson-esp32', 'r', 'How does an ESP32 turn on an LED?')
    : which === 'equation'
    ? equationPlan('lesson-eq', 'r', '2x + 5 = 17', solveEquation('2x + 5 = 17'))
    : which === 'triangle'
      ? trianglePlan('lesson-tri', 'r', 'Explain the area of a triangle.')
      : binarySearchPlan('lesson-bs', 'r', 'Explain binary search.');

const store = new SceneStore();
for (const beat of plan.beats) {
  for (const action of beat.visualActions) {
    const outcome = applyAction(store, action, { lessonId: plan.lessonId, viewport: VIEWPORT });
    for (const id of outcome.nodeIds) {
      const node = store.get(id);
      if (node) node.drawProgress = 1;
    }
  }
}

const nodes = store.list().map((n) => {
  const b = worldBounds(n);
  return {
    id: n.id,
    type: n.type,
    priority: n.priority,
    bounds: b,
    color: n.color,
    opacity: n.opacity,
    strokes: n.strokes.map((s) => ({
      color: s.color ?? n.color,
      width: s.width,
      fill: s.fill ?? null,
      points: s.points.map((p) => [
        Math.round((n.transform.x + p.x * n.transform.scale) * 100) / 100,
        Math.round((n.transform.y + p.y * n.transform.scale) * 100) / 100,
      ]),
    })),
  };
});

process.stdout.write(
  JSON.stringify({ question: plan.question, bounds: store.contentBounds(), nodes }, null, 0)
);
