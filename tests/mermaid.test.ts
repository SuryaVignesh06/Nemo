import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { VisualAction } from '../shared/contracts.ts';
import { VISUAL_FUNCTIONS } from '../shared/registry.ts';
import {
  MermaidSemanticDiagramSchema,
  mermaidPayloadFromParameters,
  semanticToMermaid,
} from '../shared/visuals/mermaid.ts';
import { selectVisualRenderer } from '../shared/visuals/rendererSelector.ts';
import { applyAction } from '../src/scene/execute.ts';
import { SceneStore } from '../src/scene/store.ts';

const semantic = {
  type: 'flowchart' as const,
  direction: 'LR' as const,
  nodes: [
    { id: 'sensor', label: 'Temperature Sensor' },
    { id: 'esp32', label: 'ESP32' },
  ],
  edges: [{ from: 'sensor', to: 'esp32', label: 'I2C', relation: 'directed' as const }],
};

describe('Mermaid semantic renderer', () => {
  it('validates semantic input and deterministically generates source', () => {
    const parsed = MermaidSemanticDiagramSchema.parse(semantic);
    assert.equal(
      semanticToMermaid(parsed),
      'flowchart LR\n  sensor["Temperature Sensor"]\n  esp32["ESP32"]\n  sensor -->|I2C| esp32'
    );
  });

  it('maps semantic ids into a unified scene node', () => {
    const action: VisualAction = {
      actionId: 'diagram-1',
      beatId: 'beat-1',
      type: 'CREATE_FLOWCHART',
      semanticRole: 'protocol_overview',
      target: 'i2c_overview',
      priority: 'PRIMARY',
      parameters: semantic,
    };
    const store = new SceneStore();
    const outcome = applyAction(store, action, {
      lessonId: 'lesson-1',
      viewport: { width: 1200, height: 800 },
    });
    assert.equal(outcome.kind, 'instant');
    assert.equal(store.get('i2c_overview')?.renderPayload?.renderer, 'mermaid');
    assert.deepEqual(
      store.get('i2c_overview')?.renderPayload?.semanticObjects.map((node) => node.id),
      ['sensor', 'esp32']
    );
  });

  it('registers Mermaid capabilities and selects hybrid lessons', () => {
    assert.equal(VISUAL_FUNCTIONS.get('CREATE_SEQUENCE_DIAGRAM')?.renderer, 'mermaid');
    const selection = selectVisualRenderer({
      purpose: 'Explain binary search step by step',
      domain: 'computer_science',
    });
    assert.equal(selection.primary, 'manim');
    assert.equal(selection.secondary, 'mermaid');
  });

  it('keeps earlier canvas sections when a follow-up begins', () => {
    const store = new SceneStore();
    const payload = mermaidPayloadFromParameters('CREATE_FLOWCHART', semantic);
    store.add({
      id: 'first', type: 'diagram', semanticRole: 'overview', priority: 'PRIMARY', visible: true,
      strokes: [], localBounds: { w: 720, h: 460 }, transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      opacity: 1, drawProgress: 1, color: '#fff', renderPayload: payload,
    });
    const previousX = store.get('first')!.transform.x;
    store.beginSection();
    assert.ok(store.get('first'));
    assert.ok(store.camera.x > previousX);
  });

  it('resolves repeated semantic ids inside the newest section', () => {
    const store = new SceneStore();
    const draw = (actionId: string) => applyAction(store, {
      actionId,
      beatId: 'beat-1',
      type: 'DRAW_TEXT',
      semanticRole: 'title',
      target: 'title_1',
      priority: 'PRIMARY',
      parameters: { text: actionId },
    }, { lessonId: actionId, viewport: { width: 1200, height: 800 } });
    draw('first');
    const oldTitle = store.resolve('title_1');
    store.beginSection();
    draw('follow-up');
    const newTitle = store.resolve('title_1');
    assert.ok(oldTitle && newTitle);
    assert.notEqual(newTitle.id, oldTitle.id);
    assert.ok(newTitle.transform.x > oldTitle.transform.x);
  });
});
