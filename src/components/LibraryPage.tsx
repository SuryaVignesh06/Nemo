/**
 * NEMO — the Library.
 *
 * Not a shelf of canned topics: a search box over four public catalogues. You
 * name a subject, pick what kind of thing you want — books, repositories,
 * papers, documentation — and the server goes and looks (server/research).
 *
 * The book rule is the one worth stating in the UI as well as in the server:
 * when a free copy exists the card links straight to it and says so, and when
 * it does not, the card shows the price, the rating and the shop instead. A
 * learner should never click "read" and land on a paywall.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './ui/Icon.tsx';
import { CoinLoader } from './originkit/CoinLoader.tsx';
import { ShineBorder } from './motion/ShineBorder.tsx';

export type DiscoveryKind = 'books' | 'repos' | 'papers' | 'docs';

interface DiscoveryItem {
  kind: DiscoveryKind;
  id: string;
  title: string;
  byline: string;
  description: string;
  url: string;
  image?: string;
  facts: string[];
  freeUrl?: string;
  price?: string;
  rating?: number;
  source: string;
}

const KINDS: ReadonlyArray<{ id: DiscoveryKind; label: string; hint: string }> = [
  { id: 'books', label: 'Books', hint: 'Free scans first, then price and rating' },
  { id: 'repos', label: 'Repositories', hint: 'Ranked by stars, from GitHub' },
  { id: 'papers', label: 'Research', hint: 'arXiv PDFs and journal DOIs' },
  { id: 'docs', label: 'Documents', hint: 'Documentation, guides and tutorials' },
];

export function LibraryPage() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<DiscoveryKind>('books');
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** The search this page is showing, so the empty state can say so. */
  const [ran, setRan] = useState('');
  /* Newest search wins: switching kind mid-flight must not be overwritten by
     the previous kind's slower answer. */
  const requestRef = useRef(0);

  const run = useCallback(async (text: string, nextKind: DiscoveryKind) => {
    const q = text.trim();
    if (!q) return;
    const ticket = ++requestRef.current;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, kind: nextKind }),
      });
      const data = (await res.json()) as { items?: DiscoveryItem[]; error?: { message: string } };
      if (ticket !== requestRef.current) return;
      if (!res.ok) throw new Error(data.error?.message ?? `Search failed (HTTP ${res.status}).`);
      setItems(data.items ?? []);
      setRan(q);
    } catch (err) {
      if (ticket !== requestRef.current) return;
      setItems([]);
      setError((err as Error).message);
    } finally {
      if (ticket === requestRef.current) setBusy(false);
    }
  }, []);

  // Switching kind re-runs the search that is already on screen.
  useEffect(() => {
    if (ran) void run(ran, kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  return (
    <main className="library" aria-label="Library">
      <div className="library__inner">
        <header className="library__head">
          <h1>Find anything on a subject</h1>
          <p>
            One search across books, repositories, research papers and documentation — read live
            from the open web.
          </p>
        </header>

        <form
          className="library__search"
          onSubmit={(event) => {
            event.preventDefault();
            void run(query, kind);
          }}
        >
          <ShineBorder shineColor={['#A07CFE', '#FE8FB5', '#FFBE7B']} duration={12} radius={999} />
          <Icon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a subject, a title, an author, a library…"
            aria-label="Search the library"
            spellCheck={false}
          />
          <button type="submit" disabled={!query.trim() || busy}>
            {busy ? 'Searching…' : 'Search'}
          </button>
        </form>

        <div className="library__kinds" role="tablist" aria-label="What to search for">
          {KINDS.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={kind === option.id}
              className={kind === option.id ? 'is-active' : ''}
              title={option.hint}
              onClick={() => setKind(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>

        {busy && (
          <div className="library__busy" role="status">
            <span className="library__busy-art" aria-hidden="true">
              <CoinLoader distance={8} />
            </span>
            <span>Reading the web for “{query.trim() || ran}”…</span>
          </div>
        )}

        {!busy && error && (
          <p className="library__error" role="alert">
            {error}
          </p>
        )}

        {!busy && !error && items.length > 0 && (
          <div className="library__grid">
            {items.map((item) => (
              <a
                key={item.id}
                className="library__card"
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {item.image && (
                  <span className={`library__art library__art--${item.kind}`}>
                    <img
                      src={item.image}
                      alt=""
                      loading="lazy"
                      /* Open Library lists a cover id for books whose scan is
                         missing, so the placeholder has to be removed by the
                         load failure rather than by the metadata. */
                      onError={(event) => {
                        const box = event.currentTarget.parentElement;
                        if (box) box.style.display = 'none';
                      }}
                    />
                  </span>
                )}
                <span className="library__copy">
                  <span className="library__title">{item.title}</span>
                  {item.byline && <span className="library__byline">{item.byline}</span>}
                  {item.description && <span className="library__desc">{item.description}</span>}
                  <span className="library__facts">
                    {item.freeUrl && <em className="library__free">Free</em>}
                    {item.price && <em className="library__price">{item.price}</em>}
                    {item.facts.map((fact) => (
                      <em key={fact}>{fact}</em>
                    ))}
                    <em className="library__source">{item.source}</em>
                  </span>
                </span>
              </a>
            ))}
          </div>
        )}

        {!busy && !error && !items.length && (
          <div className="library__empty">
            {ran ? (
              <p>
                Nothing came back for “{ran}” in {kind}. Try another wording, or a different kind.
              </p>
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}

export default LibraryPage;
