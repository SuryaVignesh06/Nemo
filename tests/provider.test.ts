/**
 * NEMO — provider reliability.
 *
 * These cover the machinery that decides whether a lesson survives a rough
 * model call: continuation after a token-limit stop, streamed parsing, retry,
 * and explicit model fallback. Each one stands for a failure that was
 * previously fatal — a truncated plan thrown away, a busy free model reported
 * as broken, a reply whose text sat in a field nobody read.
 */

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { LessonError } from '../shared/contracts.ts';
import {
  completeResilient,
  createProvider,
  extractJson,
  readSseStream,
  stitchContinuation,
  type CompleteOptions,
  type LLMProvider,
  type ProviderName,
} from '../server/providers/index.ts';

async function withFetchStub<T>(stub: typeof fetch, run: () => Promise<T>): Promise<T> {
  const realFetch = globalThis.fetch;
  globalThis.fetch = stub;
  try {
    return await run();
  } finally {
    globalThis.fetch = realFetch;
  }
}

/** A stub provider whose call outcome is scripted. */
function scripted(
  name: ProviderName,
  model: string,
  outcomes: Array<string | LessonError>,
  calls: string[]
): LLMProvider {
  let i = 0;
  return {
    name,
    model,
    async complete(_opts: CompleteOptions): Promise<string> {
      calls.push(model);
      const outcome = outcomes[Math.min(i++, outcomes.length - 1)];
      if (outcome instanceof LessonError) throw outcome;
      return outcome;
    },
  };
}

/** Build a Response carrying an OpenAI-shaped SSE body. */
function sseResponse(frames: unknown[], trailing = true): Response {
  const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('') +
    (trailing ? 'data: [DONE]\n\n' : '');
  return new Response(new TextEncoder().encode(body));
}

describe('continuation stitching', () => {
  it('drops the overlap a model repeats when resuming', () => {
    const partial = '{"beats":[{"beatId":"beat-1","narration":"Draw the sorted array';
    const continuation = '"beat-1","narration":"Draw the sorted array"}]}';
    assert.equal(stitchContinuation(partial, continuation), '"}]}');
  });

  it('strips a code fence the continuation opens with', () => {
    assert.equal(stitchContinuation('{"a":1', '```json\n,"b":2}\n```'), ',"b":2}\n');
  });

  it('keeps a continuation that shares no tail with the partial', () => {
    assert.equal(stitchContinuation('{"a":1', ',"b":2}'), ',"b":2}');
  });

  it('ignores a coincidental short overlap rather than eating real output', () => {
    // Under the 24-character threshold, so "," must survive.
    assert.equal(stitchContinuation('{"a":1,', ',"b":2}'), ',"b":2}');
  });
});

describe('streamed chat completions', () => {
  it('assembles content deltas in order and reports the stop reason', async () => {
    const res = sseResponse([
      { choices: [{ delta: { content: '{"ok":' } }] },
      { choices: [{ delta: { content: 'true}' } }] },
      { choices: [{ delta: {}, finish_reason: 'stop' }] },
    ]);
    const out = await readSseStream(res, 'test', 5_000, undefined, 0, undefined);
    assert.equal(out.content, '{"ok":true}');
    assert.equal(out.finishReason, 'stop');
  });

  it('keeps reasoning separate from content', async () => {
    const res = sseResponse([
      { choices: [{ delta: { reasoning: 'thinking about it' } }] },
      { choices: [{ delta: { content: 'answer' }, finish_reason: 'stop' }] },
    ]);
    const out = await readSseStream(res, 'test', 5_000, undefined, 0, undefined);
    assert.equal(out.content, 'answer');
    assert.equal(out.reasoning, 'thinking about it');
  });

  it('reports a token-limit stop so the caller can continue it', async () => {
    const res = sseResponse([
      { choices: [{ delta: { content: '{"beats":[' } }] },
      { choices: [{ delta: {}, finish_reason: 'length' }] },
    ]);
    const out = await readSseStream(res, 'test', 5_000, undefined, 0, undefined);
    assert.equal(out.finishReason, 'length');
    assert.equal(out.content, '{"beats":[');
  });

  it('reports progress through onDelta, continuing an existing character count', async () => {
    const totals: number[] = [];
    const res = sseResponse([
      { choices: [{ delta: { content: 'abc' } }] },
      { choices: [{ delta: { content: 'de' }, finish_reason: 'stop' }] },
    ]);
    await readSseStream(res, 'test', 5_000, (_c, total) => totals.push(total), 100, undefined);
    assert.deepEqual(totals, [103, 105]);
  });

  it('surfaces an error frame delivered mid-stream', async () => {
    const res = sseResponse([{ error: { message: 'upstream is overloaded' } }]);
    await assert.rejects(
      () => readSseStream(res, 'test', 5_000, undefined, 0, undefined),
      (err: LessonError) => err.code === 'RATE_LIMIT'
    );
  });

  it('tolerates keep-alive comments and split frames', async () => {
    const body =
      ': keep-alive\n\n' +
      'data: {"choices":[{"delta":{"content":"hi"}}]}\n\n' +
      'data: not json\n\n' +
      'data: {"choices":[{"delta":{"content":" there"},"finish_reason":"stop"}]}\n\n' +
      'data: [DONE]\n\n';
    const res = new Response(new TextEncoder().encode(body));
    const out = await readSseStream(res, 'test', 5_000, undefined, 0, undefined);
    assert.equal(out.content, 'hi there');
  });
});

describe('retry and model fallback', () => {
  it('retries a transient failure on the same model', async () => {
    const calls: string[] = [];
    const provider = scripted(
      'openrouter',
      'model-a',
      [new LessonError('RATE_LIMIT', 'busy'), 'recovered'],
      calls
    );
    const out = await completeResilient(
      { provider: 'openrouter', apiKey: 'k', model: 'model-a' },
      {
        system: 's',
        user: 'u',
        attemptsPerModel: 2,
        fallbackModels: [],
        factory: () => provider,
      }
    );
    assert.equal(out.text, 'recovered');
    assert.equal(out.model, 'model-a');
    assert.deepEqual(calls, ['model-a', 'model-a']);
    assert.ok(out.notices.some((n) => n.includes('RATE_LIMIT')));
  });

  it('falls back to the next model and says which one answered', async () => {
    const calls: string[] = [];
    const notices: string[] = [];
    const out = await completeResilient(
      { provider: 'openrouter', apiKey: 'k', model: 'model-a' },
      {
        system: 's',
        user: 'u',
        attemptsPerModel: 1,
        fallbackModels: ['model-b'],
        onNotice: (n) => notices.push(n),
        factory: (cfg) =>
          cfg.model === 'model-a'
            ? scripted('openrouter', 'model-a', [new LessonError('EMPTY_RESPONSE', 'nothing')], calls)
            : scripted('openrouter', 'model-b', ['from the alternate'], calls),
      }
    );
    assert.equal(out.text, 'from the alternate');
    // The reported model is the one that actually answered, not the request.
    assert.equal(out.model, 'model-b');
    assert.deepEqual(calls, ['model-a', 'model-b']);
    assert.ok(notices.some((n) => n.includes('Falling back to model-b')));
  });

  it('does not retry a bad key: every model would reject it identically', async () => {
    const calls: string[] = [];
    await assert.rejects(
      () =>
        completeResilient(
          { provider: 'openrouter', apiKey: 'k', model: 'model-a' },
          {
            system: 's',
            user: 'u',
            attemptsPerModel: 3,
            fallbackModels: ['model-b'],
            factory: () =>
              scripted(
                'openrouter',
                'model-a',
                [new LessonError('MISSING_CREDENTIALS', 'bad key')],
                calls
              ),
          }
        ),
      (err: LessonError) => err.code === 'MISSING_CREDENTIALS'
    );
    assert.equal(calls.length, 1);
  });

  it('does not retry an invalid response: the request itself is the problem', async () => {
    const calls: string[] = [];
    await assert.rejects(
      () =>
        completeResilient(
          { provider: 'openrouter', apiKey: 'k', model: 'model-a' },
          {
            system: 's',
            user: 'u',
            attemptsPerModel: 3,
            fallbackModels: [],
            factory: () =>
              scripted('openrouter', 'model-a', [new LessonError('INVALID_RESPONSE', 'junk')], calls),
          }
        ),
      (err: LessonError) => err.code === 'INVALID_RESPONSE'
    );
    assert.equal(calls.length, 1);
  });

  it('surfaces the last failure once every model is exhausted', async () => {
    const calls: string[] = [];
    await assert.rejects(
      () =>
        completeResilient(
          { provider: 'openrouter', apiKey: 'k', model: 'model-a' },
          {
            system: 's',
            user: 'u',
            attemptsPerModel: 1,
            fallbackModels: ['model-b'],
            factory: (cfg) =>
              scripted(
                'openrouter',
                cfg.model!,
                [new LessonError('UNAVAILABLE', `${cfg.model} is down`)],
                calls
              ),
          }
        ),
      (err: LessonError) => err.code === 'UNAVAILABLE' && /model-b/.test(err.message)
    );
    assert.deepEqual(calls, ['model-a', 'model-b']);
  });
});

describe('provider-owned model discovery', () => {
  it('maps OpenRouter metadata and derives free/paid status from published pricing', async () => {
    const urls: string[] = [];
    const provider = createProvider({
      provider: 'openrouter',
      apiKey: 'or-secret',
      model: 'example/default',
    });
    const items = await withFetchStub(
      (async (input, init) => {
        const url = String(input);
        urls.push(url);
        assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer or-secret');
        assert.ok(!url.includes('or-secret'), 'the API key never appears in the discovery URL');
        return new Response(
          JSON.stringify({
            data: [
              {
                id: 'vendor/paid',
                name: 'Alpha Paid',
                description: 'A vision-capable structured model',
                context_length: 128_000,
                created: 200,
                architecture: {
                  input_modalities: ['text', 'image'],
                  output_modalities: ['text'],
                },
                pricing: { prompt: '0.000001', completion: '0.000002', request: '0' },
                supported_parameters: ['tools', 'structured_outputs'],
                top_provider: { max_completion_tokens: 16_384 },
              },
              {
                id: 'vendor/free:free',
                name: 'Beta Free',
                context_length: 64_000,
                created: 100,
                architecture: { input_modalities: ['text'], output_modalities: ['text'] },
                pricing: { prompt: '0', completion: '0', request: '0' },
                supported_parameters: ['temperature'],
              },
              {
                id: 'vendor/unknown',
                name: 'Gamma Unknown',
                architecture: { input_modalities: ['text'], output_modalities: ['text'] },
              },
            ],
          }),
          { headers: { 'Content-Type': 'application/json' } }
        );
      }) as typeof fetch,
      () => provider.listModels({ sort: 'pricing-high-to-low' })
    );

    assert.deepEqual(items.map((item) => item.id), [
      'vendor/paid',
      'vendor/free:free',
      'vendor/unknown',
    ]);
    assert.equal(items[0].provider, 'openrouter');
    assert.equal(items[0].pricingTier, 'paid');
    assert.equal(items[0].isFree, false);
    assert.equal(items[0].pricing?.prompt, 0.000001);
    assert.equal(items[0].contextLength, 128_000);
    assert.equal(items[0].maxOutputTokens, 16_384);
    assert.deepEqual(items[0].inputModalities, ['text', 'image']);
    assert.deepEqual(items[0].capabilities, ['tools', 'structured_outputs']);
    assert.equal(items[1].pricingTier, 'free');
    assert.equal(items[1].isFree, true);
    assert.equal(items[2].pricingTier, 'unknown');
    assert.equal(items[2].isFree, null);
    assert.equal(new URL(urls[0]).searchParams.get('output_modalities'), 'text');
    assert.equal(new URL(urls[0]).searchParams.get('sort'), 'pricing-high-to-low');
  });

  it('applies OpenRouter free/paid filters and search without a fallback catalog', async () => {
    const provider = createProvider({ provider: 'openrouter', apiKey: 'key' });
    const fetchStub = (async () =>
      new Response(
        JSON.stringify({
          data: [
            {
              id: 'example/free:free',
              name: 'Free Tutor',
              pricing: { prompt: '0', completion: '0' },
            },
            {
              id: 'example/paid',
              name: 'Paid Tutor',
              pricing: { prompt: '0.1', completion: '0.2' },
            },
          ],
        })
      )) as typeof fetch;

    const free = await withFetchStub(fetchStub, () =>
      provider.listModels({ filter: 'free', search: 'tutor' })
    );
    const paid = await withFetchStub(fetchStub, () =>
      provider.listModels({ filter: 'paid', search: 'PAID' })
    );
    assert.deepEqual(free.map((item) => item.id), ['example/free:free']);
    assert.deepEqual(paid.map((item) => item.id), ['example/paid']);
  });

  it('paginates Gemini models, keeps only generateContent resources, and preserves unknown pricing', async () => {
    const provider = createProvider({ provider: 'gemini', apiKey: 'gem-secret' });
    const seen: URL[] = [];
    const items = await withFetchStub(
      (async (input, init) => {
        const url = new URL(String(input));
        seen.push(url);
        assert.equal(new Headers(init?.headers).get('x-goog-api-key'), 'gem-secret');
        assert.ok(!url.toString().includes('gem-secret'), 'the API key stays out of the URL');
        if (!url.searchParams.has('pageToken')) {
          return new Response(
            JSON.stringify({
              models: [
                {
                  name: 'models/gemini-small',
                  baseModelId: 'gemini-small',
                  version: '001',
                  displayName: 'Gemini Small',
                  description: 'Fast generation',
                  inputTokenLimit: 32_000,
                  outputTokenLimit: 8_000,
                  supportedGenerationMethods: ['generateContent', 'countTokens'],
                },
                {
                  name: 'models/text-embedding',
                  displayName: 'Embedding only',
                  supportedGenerationMethods: ['embedContent'],
                },
              ],
              nextPageToken: 'next-page',
            })
          );
        }
        assert.equal(url.searchParams.get('pageToken'), 'next-page');
        return new Response(
          JSON.stringify({
            models: [
              {
                name: 'models/gemini-thinking',
                displayName: 'Gemini Thinking',
                inputTokenLimit: 1_000_000,
                outputTokenLimit: 64_000,
                supportedGenerationMethods: ['generateContent'],
                thinking: true,
              },
            ],
          })
        );
      }) as typeof fetch,
      () => provider.listModels({ sort: 'context-high-to-low' })
    );

    assert.equal(seen.length, 2);
    assert.equal(seen[0].searchParams.get('pageSize'), '1000');
    assert.deepEqual(items.map((item) => item.id), ['gemini-thinking', 'gemini-small']);
    assert.equal(items[0].pricingTier, 'unknown');
    assert.equal(items[0].isFree, null);
    assert.equal(items[0].pricing, undefined);
    assert.deepEqual(items[0].capabilities, ['generateContent', 'thinking']);
    assert.deepEqual(items[0].inputModalities, []);
    assert.equal(items[1].baseModelId, 'gemini-small');
    assert.equal(items[1].version, '001');
  });

  it('returns no guessed Gemini free/paid results when the endpoint publishes no pricing', async () => {
    const provider = createProvider({ provider: 'gemini', apiKey: 'key' });
    const fetchStub = (async () =>
      new Response(
        JSON.stringify({
          models: [
            {
              name: 'models/gemini-example',
              displayName: 'Gemini Example',
              supportedGenerationMethods: ['generateContent'],
            },
          ],
        })
      )) as typeof fetch;
    const free = await withFetchStub(fetchStub, () => provider.listModels({ filter: 'free' }));
    const paid = await withFetchStub(fetchStub, () => provider.listModels({ filter: 'paid' }));
    assert.deepEqual(free, []);
    assert.deepEqual(paid, []);
  });

  it('bounds discovery requests with a timeout', async () => {
    const provider = createProvider({ provider: 'openrouter', apiKey: 'key' });
    await withFetchStub(
      ((async (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            const error = new Error('aborted');
            error.name = 'AbortError';
            reject(error);
          });
        })) as typeof fetch),
      () =>
        assert.rejects(
          () => provider.listModels({ timeoutMs: 5 }),
          (err: LessonError) => err.code === 'TIMEOUT' && /openrouter/.test(err.message)
        )
    );
  });

  it('healthCheck reports reachability without throwing or exposing credentials', async () => {
    const provider = createProvider({ provider: 'gemini', apiKey: 'health-secret' });
    const health = await withFetchStub(
      (async () => new Response(JSON.stringify({ models: [] }))) as typeof fetch,
      () => provider.healthCheck()
    );
    assert.equal(health.ok, true);
    assert.equal(health.status, 'healthy');
    assert.equal(health.modelCount, 0);
    assert.ok(!JSON.stringify(health).includes('health-secret'));
  });

  it('does not fabricate Z.AI discovery when no official endpoint exists', async () => {
    const provider = createProvider({ provider: 'zai', apiKey: 'key' });
    await assert.rejects(
      () => provider.listModels(),
      (err: LessonError) => err.code === 'UNSUPPORTED' && /official model-discovery/.test(err.message)
    );
    const health = await provider.healthCheck();
    assert.equal(health.status, 'unsupported');
  });
});

describe('salvaging a damaged plan', () => {
  it('recovers the finished beats from JSON that stopped mid-object', () => {
    const truncated =
      '{"domain":"computer_science","beats":[' +
      '{"beatId":"beat-1","visualActions":[]},' +
      '{"beatId":"beat-2","visualActions":[]},' +
      '{"beatId":"beat-3","narration":"the model stopped he';
    const parsed = extractJson(truncated, true) as { beats: unknown[] };
    assert.ok(Array.isArray(parsed.beats));
    assert.ok(parsed.beats.length >= 2, 'the complete beats survive the truncation');
  });

  it('recovers from unclosed markdown code fence and truncated field value', () => {
    const raw =
      '```json { "domain": "computer science", "objective": "Understand selection sort", "chatAnswer": "Selection Sort wo';
    const parsed = extractJson(raw, true) as Record<string, unknown>;
    assert.equal(parsed.domain, 'computer science');
    assert.equal(parsed.chatAnswer, 'Selection Sort wo');
  });

  it('tolerates unescaped newlines and LaTeX backslashes in string literals', () => {
    const raw =
      '```json\n{\n  "domain": "math",\n  "explanation": "Line 1\nLine 2 with \\frac{a}{b} and \\alpha"\n}';
    const parsed = extractJson(raw, true) as Record<string, unknown>;
    assert.equal(parsed.domain, 'math');
    assert.ok(typeof parsed.explanation === 'string');
  });

  it('still refuses truncated JSON when repair was not asked for', () => {
    assert.throws(
      () => extractJson('{"beats":[{"beatId":"beat-1"', false),
      (err: LessonError) => err.code === 'INVALID_RESPONSE'
    );
  });
});

