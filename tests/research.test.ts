import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldResearchQuestion } from '../server/app.ts';
import { canonicalPublicUrl, rankWebResults } from '../server/research/web.ts';

describe('research query gating', () => {
  it('does not crawl greetings or empty fragments', () => {
    assert.equal(shouldResearchQuestion('hi'), false);
    assert.equal(shouldResearchQuestion('Thank you!'), false);
    assert.equal(shouldResearchQuestion(''), false);
  });

  it('researches substantive questions', () => {
    assert.equal(shouldResearchQuestion('What changed in React 19?'), true);
    assert.equal(shouldResearchQuestion('Explain MOSFET operation'), true);
  });
});

describe('web result normalization', () => {
  it('removes tracking and rejects private network targets', () => {
    assert.equal(
      canonicalPublicUrl('https://example.com/guide/?utm_source=test&chapter=2#intro'),
      'https://example.com/guide?chapter=2'
    );
    assert.equal(canonicalPublicUrl('http://127.0.0.1/admin'), null);
    assert.equal(canonicalPublicUrl('http://192.168.1.2/private'), null);
    assert.equal(canonicalPublicUrl('http://[::1]/admin'), null);
    assert.equal(canonicalPublicUrl('https://fda.gov/food'), 'https://fda.gov/food');
  });

  it('ranks relevant results and keeps domain diversity', () => {
    const ranked = rankWebResults([
      { title: 'Unrelated social post', url: 'https://facebook.com/a', snippet: '', source: 'facebook.com' },
      { title: 'React 19 reference', url: 'https://react.dev/reference/react', snippet: 'React 19 APIs', source: 'react.dev' },
      { title: 'React 19 upgrade guide', url: 'https://react.dev/blog/upgrade', snippet: 'How to upgrade', source: 'react.dev' },
      { title: 'React 19 changes', url: 'https://developer.mozilla.org/react-19', snippet: 'A technical overview', source: 'developer.mozilla.org' },
      { title: 'Third React page', url: 'https://react.dev/third', snippet: 'React 19', source: 'react.dev' },
    ], 'What changed in React 19?', 5);

    assert.equal(ranked[0].source, 'react.dev');
    assert.equal(ranked.filter((item) => item.source === 'react.dev').length, 2);
    assert.ok(ranked.some((item) => item.source === 'developer.mozilla.org'));
  });
});
