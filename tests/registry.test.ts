import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CAPABILITIES,
  EXECUTABLE_TYPES,
  VISUAL_FUNCTION_REGISTRY_VERSION,
  VISUAL_FUNCTIONS,
  modelCapabilityCatalog,
} from '../shared/registry.ts';

describe('visual function registry metadata', () => {
  test('derives complete, honest metadata for every catalog entry', () => {
    for (const capability of CAPABILITIES) {
      assert.equal(capability.version, VISUAL_FUNCTION_REGISTRY_VERSION);
      assert.ok(capability.domain.length > 0, `${capability.type} has no domain`);
      assert.ok(capability.category.length > 0, `${capability.type} has no category`);
      assert.ok(capability.keywords.length > 0, `${capability.type} has no search keywords`);
      assert.equal(capability.example.action.type, capability.type);
      assert.equal(capability.test.file, 'tests/registry.test.ts');

      if (capability.implemented) {
        assert.notEqual(capability.renderer, 'none');
        assert.equal(capability.implementation.status, 'implemented');
        if (capability.renderer === 'mermaid') {
          assert.equal(capability.implementation.file, 'shared/visuals/mermaid.ts');
          assert.equal(capability.implementation.entryPoint, 'mermaidPayloadFromParameters');
        } else {
          assert.equal(capability.implementation.file, 'src/scene/execute.ts');
          assert.equal(capability.implementation.entryPoint, 'applyAction');
        }
      } else {
        assert.equal(capability.renderer, 'none');
        assert.equal(capability.implementation.status, 'documented-only');
        assert.equal(capability.implementation.file, null);
        assert.equal(capability.implementation.entryPoint, null);
      }
    }
  });

  test('keeps executable counts and metadata in agreement', () => {
    assert.deepEqual(
      CAPABILITIES.filter((capability) => capability.implementation.status === 'implemented').map(
        (capability) => capability.type
      ),
      EXECUTABLE_TYPES
    );
  });
});

describe('visual function registry queries', () => {
  test('supports normalized get, has, and filtered list operations', () => {
    assert.equal(VISUAL_FUNCTIONS.get('drawCircle')?.type, 'DRAW_CIRCLE');
    assert.equal(VISUAL_FUNCTIONS.get(' draw-circle ')?.type, 'DRAW_CIRCLE');
    assert.equal(VISUAL_FUNCTIONS.has('WRITE_EQUATION'), true);
    assert.equal(VISUAL_FUNCTIONS.has('SUMMON_DRAGON'), false);

    const executableMath = VISUAL_FUNCTIONS.list({ domain: 'mathematics', implemented: true });
    assert.ok(executableMath.length > 0);
    assert.ok(executableMath.every((capability) => capability.domain === 'mathematics'));
    assert.ok(executableMath.every((capability) => capability.implemented));

    const canonicalOnly = VISUAL_FUNCTIONS.list({ includeAliases: false });
    assert.ok(canonicalOnly.every((capability) => !capability.aliasOf));
  });

  test('ranks deterministic semantic keyword and synonym matches', () => {
    const graph = VISUAL_FUNCTIONS.search('plot a mathematical graph', {
      implemented: true,
      limit: 5,
    });
    assert.ok(graph.some((result) => result.capability.type === 'PLOT_FUNCTION'));

    const handwriting = VISUAL_FUNCTIONS.search('handwritten label', {
      implemented: true,
      limit: 5,
    });
    assert.equal(handwriting[0]?.capability.type, 'WRITE_LABEL');

    assert.deepEqual(
      VISUAL_FUNCTIONS.search('binary search array midpoint', { limit: 4 }),
      VISUAL_FUNCTIONS.search('binary search array midpoint', { limit: 4 })
    );
  });

  test('validates membership, implementation status, aliases, and invocation shape', () => {
    const valid = VISUAL_FUNCTIONS.validate({ type: 'drawGraph', parameters: {} });
    assert.equal(valid.ok, true);
    assert.equal(valid.canonicalType, 'PLOT_FUNCTION');

    const documentedOnly = CAPABILITIES.find((capability) => !capability.implemented);
    assert.ok(documentedOnly);
    assert.equal(VISUAL_FUNCTIONS.validate(documentedOnly.type).ok, false);
    assert.equal(
      VISUAL_FUNCTIONS.validate(documentedOnly.type, { requireImplemented: false }).ok,
      true
    );

    assert.match(VISUAL_FUNCTIONS.validate('SUMMON_DRAGON').errors[0] ?? '', /UNKNOWN/);
    assert.match(
      VISUAL_FUNCTIONS.validate({ type: 'DRAW_CIRCLE', parameters: [] }).errors[0] ?? '',
      /PARAMETERS/
    );
  });
});

describe('model-facing capability catalog', () => {
  test('contains only executable metadata and never exposes source-code internals', () => {
    const catalog = modelCapabilityCatalog();
    assert.equal(catalog.length, EXECUTABLE_TYPES.length);

    for (const capability of catalog) {
      assert.deepEqual(
        Object.keys(capability).sort(),
        [
          'aliasOf',
          'category',
          'description',
          'domain',
          'example',
          'name',
          'output',
          'parameters',
          'version',
        ].filter((key) => key !== 'aliasOf' || Object.hasOwn(capability, key)).sort()
      );
      assert.equal(Object.hasOwn(capability, 'implementation'), false);
      assert.equal(Object.hasOwn(capability, 'test'), false);
      assert.equal(Object.hasOwn(capability, 'keywords'), false);
    }
  });
});
