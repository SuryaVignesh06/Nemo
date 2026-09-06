/**
 * NEMO — Phase 1: model reliability layer.
 *
 * These tests pin the behaviours the build brief calls out as high priority:
 * empty output is a failure, transient errors retry, deterministic validation
 * errors do not, schema failures get exactly one repair pass, fallback is
 * recorded, and cancellation is immediate.
 *
 * The provider is scripted so no network is touched and timing is deterministic.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';

import { LessonError } from '../shared/contracts.ts';
import type { CompleteOptions, LLMProvider, ProviderName } from '../server/providers/index.ts';
import { WorkflowTrace } from '../server/observability/trace.ts';
import {
  ModelExecutionService,
  backoffDelay,
  describeIssues,
  DEFAULT_RETRY,
} from '../server/models/execution.ts';
import {
  classToCode,
  classify,
  isEmptyOutput,
  isRepairable,
  isRetryable,
} from '../server/models/errors.ts';

/* ------------------------------------------------------------- helpers */

type Step = string | Error;

/** A provider that replays a fixed script, one entry per attempt. */
class ScriptedProvider implements LLMProvider {
  readonly name: ProviderName;
  readonly model: string;
  readonly calls: CompleteOptions[] = [];
  private script: Step[];

  constructor(script: Step[], name: ProviderName = 'zai', model = 'test-model') {
    this.script = script;
    this.name = name;
    this.model = model;
  }

  async complete(opts: CompleteOptions): Promise<string> {
    this.calls.push(opts);
    const step = this.script[this.calls.length - 1];
    if (step === undefined) throw new Error('script exhausted');
    if (step instanceof Error) throw step;
    return step;
  }
}

const Answer = z.object({ answer: z.string(), steps: z.array(z.string()) });

function makeService(
  primary: LLMProvider,
  extra: { fallback?: LLMProvider; trace?: WorkflowTrace } = {}
) {
  const trace = extra.trace ?? new WorkflowTrace('req-test', 'sess-test');
  const slept: number[] = [];
  const service = new ModelExecutionService({
    primary,
    fallback: extra.fallback,
    trace,
    retry: { maxAttempts: 3, baseDelayMs: 100, maxDelayMs: 1000 },
    // No real waiting; record what would have been waited.
    sleep: async (ms) => {
      slept.push(ms);
    },
    random: () => 0.5,
  });
  return { service, trace, slept };
}

const ok = JSON.stringify({ answer: '42', steps: ['a', 'b'] });

/* ------------------------------------------------------- classification */

describe('error classification', () => {
  test('every FailureCode maps to a class and back to a code', () => {
    const codes = [
      'MISSING_CREDENTIALS',
      'EMPTY_RESPONSE',
      'INVALID_RESPONSE',
      'TIMEOUT',
      'RATE_LIMIT',
      'UNAVAILABLE',
      'INCOMPLETE_PLAN',
      'UNKNOWN_CAPABILITY',
      'RAW_CODE_REJECTED',
      'STALE_REQUEST',
      'UNSUPPORTED',
    ] as const;
    for (const code of codes) {
      const cls = classify(new LessonError(code, 'x'));
      assert.notEqual(cls, undefined, `${code} has no class`);
      assert.ok(classToCode(cls), `${cls} has no code`);
    }
  });

  test('transient failures retry and deterministic failures do not', () => {
    assert.equal(isRetryable('TIMEOUT'), true);
    assert.equal(isRetryable('RATE_LIMIT'), true);
    assert.equal(isRetryable('EMPTY_OUTPUT'), true);
    assert.equal(isRetryable('TRANSIENT_NETWORK'), true);

    // Asking again with the same prompt cannot fix these.
    assert.equal(isRetryable('VALIDATION_ERROR'), false);
    assert.equal(isRetryable('AUTHENTICATION'), false);
    assert.equal(isRetryable('INVALID_REQUEST'), false);
    assert.equal(isRetryable('CANCELLED'), false);
  });

  test('malformed output is repairable rather than plain-retryable', () => {
    assert.equal(isRetryable('MALFORMED_OUTPUT'), false);
    assert.equal(isRepairable('MALFORMED_OUTPUT'), true);
  });

  test('blank content in any form counts as empty', () => {
    for (const v of ['', '   ', '\n\t ', null, undefined]) {
      assert.equal(isEmptyOutput(v), true, `${JSON.stringify(v)} should be empty`);
    }
    assert.equal(isEmptyOutput('{}'), false);
  });

  test('network and abort errors are recognised without a LessonError', () => {
    assert.equal(classify(Object.assign(new Error('x'), { name: 'AbortError' })), 'CANCELLED');
    assert.equal(classify(new Error('fetch failed')), 'TRANSIENT_NETWORK');
    assert.equal(classify(new Error('request timed out')), 'TIMEOUT');
  });
});

/* -------------------------------------------------------------- backoff */

describe('backoff', () => {
  test('grows exponentially and is capped by the policy', () => {
    const policy = { maxAttempts: 5, baseDelayMs: 100, maxDelayMs: 500 };
    const full = () => 1;
    assert.equal(backoffDelay(1, policy, full), 100);
    assert.equal(backoffDelay(2, policy, full), 200);
    assert.equal(backoffDelay(3, policy, full), 400);
    // Clamped, not 800.
    assert.equal(backoffDelay(4, policy, full), 500);
  });

  test('jitter scales the delay down, never above the ceiling', () => {
    for (const r of [0, 0.25, 0.5, 0.99]) {
      const d = backoffDelay(3, DEFAULT_RETRY, () => r);
      assert.ok(d >= 0 && d <= 1600, `delay ${d} out of range for r=${r}`);
    }
  });
});

/* ------------------------------------------------------------ execution */

describe('ModelExecutionService', () => {
  test('a valid first response is returned without retrying', async () => {
    const provider = new ScriptedProvider([ok]);
    const { service, trace } = makeService(provider);

    const result = await service.executeStructured({
      stage: 'solver',
      system: 's',
      user: 'u',
      schema: Answer,
    });

    assert.deepEqual(result, { answer: '42', steps: ['a', 'b'] });
    assert.equal(provider.calls.length, 1);
    assert.equal(trace.attempts.length, 1);
    assert.equal(trace.attempts[0].status, 'SUCCESS');
    assert.equal(trace.attempts[0].stage, 'solver');
  });

  test('an empty 200 is treated as failure and retried, not returned', async () => {
    // The provider "succeeds" with whitespace, exactly the reported bug.
    const provider = new ScriptedProvider(['   ', ok]);
    const { service, trace } = makeService(provider);

    const result = await service.executeStructured({
      stage: 'planner',
      system: 's',
      user: 'u',
      schema: Answer,
    });

    assert.equal(result.answer, '42');
    assert.equal(provider.calls.length, 2);
    assert.equal(trace.attempts[0].status, 'FAILED');
    assert.equal(trace.attempts[0].errorClass, 'EMPTY_OUTPUT');
    assert.equal(trace.attempts[1].status, 'SUCCESS');
  });

  test('a timeout is retried with backoff', async () => {
    const provider = new ScriptedProvider([new LessonError('TIMEOUT', 'slow'), ok]);
    const { service, trace, slept } = makeService(provider);

    await service.executeStructured({ stage: 'solver', system: 's', user: 'u', schema: Answer });

    assert.equal(provider.calls.length, 2);
    assert.equal(trace.attempts[0].errorClass, 'TIMEOUT');
    assert.equal(slept.length, 1, 'should have waited once before retrying');
  });

  test('bad credentials fail immediately without burning attempts', async () => {
    const provider = new ScriptedProvider([
      new LessonError('MISSING_CREDENTIALS', 'bad key'),
      ok,
    ]);
    const { service, trace, slept } = makeService(provider);

    await assert.rejects(
      () => service.executeStructured({ stage: 'solver', system: 's', user: 'u', schema: Answer }),
      (err: LessonError) => err.code === 'MISSING_CREDENTIALS'
    );

    assert.equal(provider.calls.length, 1, 'must not retry an auth failure');
    assert.equal(slept.length, 0);
    assert.equal(trace.attempts[0].errorClass, 'AUTHENTICATION');
  });

  test('schema failure triggers one repair prompt carrying the errors', async () => {
    // First reply is valid JSON but the wrong shape.
    const provider = new ScriptedProvider([JSON.stringify({ answer: 42 }), ok]);
    const { service, trace } = makeService(provider);

    const result = await service.executeStructured({
      stage: 'composer',
      system: 's',
      user: 'ORIGINAL-PROMPT',
      schema: Answer,
    });

    assert.equal(result.answer, '42');
    assert.equal(provider.calls.length, 2);
    assert.equal(trace.attempts[0].errorClass, 'MALFORMED_OUTPUT');

    // The repair prompt must show the model its own output and the errors.
    const repair = provider.calls[1].user;
    assert.match(repair, /ORIGINAL-PROMPT/, 'repair keeps the original task');
    assert.match(repair, /Schema errors/, 'repair states the errors');
    assert.match(repair, /steps/, 'repair names the missing field');
  });

  test('a response that never validates fails with the schema issues attached', async () => {
    const bad = JSON.stringify({ nope: true });
    const provider = new ScriptedProvider([bad, bad, bad]);
    const { service } = makeService(provider);

    await assert.rejects(
      () => service.executeStructured({ stage: 'planner', system: 's', user: 'u', schema: Answer }),
      (err: LessonError) => {
        assert.equal(err.code, 'INVALID_RESPONSE');
        assert.ok(err.details.length > 0, 'schema issues must be reported');
        return true;
      }
    );
  });

  test('the fallback provider is used only after the primary is exhausted, and is recorded', async () => {
    const primary = new ScriptedProvider(
      [
        new LessonError('UNAVAILABLE', 'down'),
        new LessonError('UNAVAILABLE', 'down'),
        new LessonError('UNAVAILABLE', 'down'),
      ],
      'zai',
      'glm-4.6'
    );
    const fallback = new ScriptedProvider([ok], 'openrouter', 'backup-model');
    const { service, trace } = makeService(primary, { fallback });

    const result = await service.executeStructured({
      stage: 'solver',
      system: 's',
      user: 'u',
      schema: Answer,
    });

    assert.equal(result.answer, '42');
    assert.equal(primary.calls.length, 3, 'primary exhausts its attempts first');
    assert.equal(fallback.calls.length, 1);

    // The swap must be visible in the trace, never silent.
    const used = trace.attempts.find((a) => a.status === 'SUCCESS');
    assert.equal(used?.fallbackUsed, true);
    assert.equal(used?.provider, 'openrouter');
    assert.equal(used?.model, 'backup-model');
  });

  test('cancellation stops immediately and does not try the fallback', async () => {
    const controller = new AbortController();
    controller.abort();
    const primary = new ScriptedProvider([ok]);
    const fallback = new ScriptedProvider([ok], 'gemini');
    const { service } = makeService(primary, { fallback });

    await assert.rejects(
      () =>
        service.executeStructured({
          stage: 'solver',
          system: 's',
          user: 'u',
          schema: Answer,
          signal: controller.signal,
        }),
      (err: LessonError) => err.code === 'STALE_REQUEST'
    );

    assert.equal(primary.calls.length, 0, 'aborted before any call');
    assert.equal(fallback.calls.length, 0, 'cancellation is not a provider problem');
  });

  test('a fenced JSON reply is still accepted', async () => {
    const provider = new ScriptedProvider(['```json\n' + ok + '\n```']);
    const { service } = makeService(provider);
    const result = await service.executeStructured({
      stage: 'solver',
      system: 's',
      user: 'u',
      schema: Answer,
    });
    assert.equal(result.answer, '42');
  });
});

/* ---------------------------------------------------------------- trace */

describe('workflow trace', () => {
  test('counts retries and reports per-stage status', () => {
    const trace = new WorkflowTrace('req-abc12345', 'sess');
    trace.recordAttempt({
      stage: 'solver',
      provider: 'zai',
      model: 'glm-4.6',
      attempt: 1,
      durationMs: 4820,
      status: 'SUCCESS',
    });
    trace.recordAttempt({
      stage: 'visual_planner',
      provider: 'zai',
      model: 'glm-4.6',
      attempt: 1,
      durationMs: 2810,
      status: 'FAILED',
      errorClass: 'EMPTY_OUTPUT',
    });
    trace.recordAttempt({
      stage: 'visual_planner',
      provider: 'zai',
      model: 'glm-4.6',
      attempt: 2,
      durationMs: 3070,
      status: 'SUCCESS',
    });
    trace.recordStage({ stage: 'compiler', durationMs: 820, status: 'SUCCESS' });

    assert.equal(trace.retryCount, 1);

    const report = trace.format();
    assert.match(report, /REQUEST req-abc1/);
    assert.match(report, /EMPTY_OUTPUT/);
    assert.match(report, /4\.82s/);

    const json = trace.toJSON() as { attempts: unknown[] };
    assert.equal(json.attempts.length, 3);
  });

  test('raw model text is withheld unless debug mode is on', () => {
    const quiet = new WorkflowTrace('r', 's', false);
    quiet.recordSample('solver', 'sensitive raw output');
    assert.equal('samples' in quiet.toJSON(), false);

    const debug = new WorkflowTrace('r', 's', true);
    debug.recordSample('solver', 'raw output');
    const json = debug.toJSON() as { samples: unknown[] };
    assert.equal(json.samples.length, 1);
  });
});

/* -------------------------------------------------------------- issues */

describe('schema issue rendering', () => {
  test('issues name the failing path so the repair prompt is actionable', () => {
    const result = Answer.safeParse({ answer: 1, steps: 'no' });
    assert.equal(result.success, false);
    if (result.success) return;
    const issues = describeIssues(result.error);
    assert.ok(issues.some((i) => i.startsWith('answer:')));
    assert.ok(issues.some((i) => i.startsWith('steps:')));
  });
});
