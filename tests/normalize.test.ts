/**
 * NEMO — provider response normalisation.
 *
 * These are regression tests for the bug that made the app hang: a reasoning
 * model (nvidia/nemotron, deepseek-r1, qwq) returns its text in `reasoning`
 * with `content` empty, the old code read only `content`, and every one of
 * those successful responses was treated as EMPTY_RESPONSE and retried.
 *
 * The payload shapes below are the ones these providers actually return.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { normalizeChatResponse, stripThinkTags } from '../server/providers/normalize.ts';
import { assessCompleteness, type AnswerArtifact } from '../shared/agents.ts';

const JSON_BODY = '{"answer":"42"}';

describe('response normalisation', () => {
  test('plain content is read as before', () => {
    const r = normalizeChatResponse({
      choices: [{ message: { content: JSON_BODY }, finish_reason: 'stop' }],
    });
    assert.equal(r.text, JSON_BODY);
    assert.equal(r.source, 'content');
    assert.equal(r.truncated, false);
    assert.equal(r.reasoningOnly, false);
  });

  test('a reasoning model with empty content is NOT treated as empty', () => {
    // The exact shape that made Nemotron look like a hang.
    const r = normalizeChatResponse({
      choices: [
        {
          message: { content: '', reasoning: `Let me work through it. ${JSON_BODY}` },
          finish_reason: 'stop',
        },
      ],
    });
    assert.notEqual(r.text, '', 'reasoning text must be recovered');
    assert.equal(r.source, 'reasoning');
    assert.equal(r.reasoningOnly, true, 'caller must know to widen the budget');
    assert.match(r.text, /"answer":"42"/);
  });

  test('reasoning_content (DeepSeek shape) is recovered', () => {
    const r = normalizeChatResponse({
      choices: [{ message: { content: null, reasoning_content: JSON_BODY } }],
    });
    assert.equal(r.text, JSON_BODY);
    assert.equal(r.source, 'reasoning');
  });

  test('reasoning_details array is recovered', () => {
    const r = normalizeChatResponse({
      choices: [
        { message: { content: '', reasoning_details: [{ text: JSON_BODY }] } },
      ],
    });
    assert.equal(r.text, JSON_BODY);
    assert.equal(r.source, 'reasoning');
  });

  test('content wins over reasoning when both are present', () => {
    const r = normalizeChatResponse({
      choices: [
        { message: { content: JSON_BODY, reasoning: 'irrelevant working' } },
      ],
    });
    assert.equal(r.text, JSON_BODY);
    assert.equal(r.source, 'content');
    assert.equal(r.reasoningOnly, false);
  });

  test('an array content payload is joined', () => {
    const r = normalizeChatResponse({
      choices: [
        {
          message: {
            content: [
              { type: 'text', text: '{"answer":' },
              { type: 'text', text: '"42"}' },
            ],
          },
        },
      ],
    });
    assert.equal(r.text, JSON_BODY);
    assert.equal(r.source, 'parts');
  });

  test('truncation is reported separately from emptiness', () => {
    const r = normalizeChatResponse({
      choices: [{ message: { content: '{"answer":' }, finish_reason: 'length' }],
    });
    assert.equal(r.truncated, true, 'a cut-off reply is not the same failure as an empty one');
    assert.equal(r.finishReason, 'length');
  });

  test('a genuinely empty reply is still empty', () => {
    const r = normalizeChatResponse({ choices: [{ message: { content: '' } }] });
    assert.equal(r.text, '');
    assert.equal(r.source, 'none');
  });

  test('token usage is carried through for the trace', () => {
    const r = normalizeChatResponse({
      choices: [{ message: { content: JSON_BODY } }],
      usage: { prompt_tokens: 120, completion_tokens: 40 },
    });
    assert.equal(r.promptTokens, 120);
    assert.equal(r.completionTokens, 40);
  });
});

describe('think tags', () => {
  test('a closed think block is removed and the answer kept', () => {
    assert.equal(stripThinkTags(`<think>hmm, let me see</think>${JSON_BODY}`), JSON_BODY);
  });

  test('an unterminated think block discards the unfinished reasoning', () => {
    // Everything after an unclosed tag is incomplete thought, not an answer.
    assert.equal(stripThinkTags('<think>still thinking about it'), '');
  });

  test('text with no tags is untouched', () => {
    assert.equal(stripThinkTags(JSON_BODY), JSON_BODY);
  });

  test('a reply that is only reasoning yields nothing usable from content', () => {
    const r = normalizeChatResponse({
      choices: [{ message: { content: '<think>working</think>' } }],
    });
    assert.equal(r.text, '');
  });
});

/* --------------------------------------------------- answer completeness */

function answer(over: Partial<AnswerArtifact> = {}): AnswerArtifact {
  return {
    domain: 'physics',
    normalizedQuestion: 'q',
    approach: 'a',
    explanation:
      'The applied force is resolved into horizontal and vertical components, ' +
      'the normal force follows from vertical equilibrium, friction opposes ' +
      'the motion, and Newton second law then gives the acceleration.',
    steps: [{ step: 1, operation: 'resolve', result: '8.66 N', reason: 'trig' }],
    finalAnswer: '2.87 m/s^2',
    keyConcepts: ['friction'],
    prerequisites: [],
    misconceptions: [],
    assumptions: [],
    verified: false,
    ...over,
  };
}

describe('answer completeness gate', () => {
  test('a finished answer passes', () => {
    assert.equal(assessCompleteness(answer()).complete, true);
  });

  test('an answer cut off mid-sentence is caught', () => {
    const v = assessCompleteness(
      answer({ explanation: answer().explanation.replace(/\.$/, '') + ' and then we' })
    );
    assert.equal(v.complete, false);
    assert.ok(v.gaps.some((g) => g.includes('cut off')));
  });

  test('an answer ending in a value is NOT a false positive', () => {
    // "= 8/3" and "2.87 m/s^2" are legitimate endings.
    for (const tail of [', so the value is 8/3', ', giving a = 2.87', ' — the result is 100%']) {
      const v = assessCompleteness(
        answer({ explanation: answer().explanation.replace(/\.$/, '') + tail })
      );
      assert.equal(v.complete, true, `"${tail}" should not be treated as truncated`);
    }
  });

  test('a missing conclusion is caught', () => {
    const v = assessCompleteness(answer({ finalAnswer: '' }));
    assert.equal(v.complete, false);
    assert.ok(v.gaps.some((g) => g.includes('final answer')));
  });

  test('an empty or stub explanation is caught', () => {
    assert.equal(assessCompleteness(answer({ explanation: '' })).complete, false);
    assert.equal(assessCompleteness(answer({ explanation: 'It is 2.87.' })).complete, false);
  });

  test('an answer with no steps and no concepts cannot be taught', () => {
    const v = assessCompleteness(answer({ steps: [], keyConcepts: [] }));
    assert.equal(v.complete, false);
  });

  test('gaps are phrased so a continuation prompt can use them', () => {
    const v = assessCompleteness(answer({ finalAnswer: '', explanation: '' }));
    assert.ok(v.gaps.length >= 2);
    for (const g of v.gaps) assert.match(g, /\.$/, 'each gap should read as a sentence');
  });
});
