/**
 * NEMO — the lesson rail.
 *
 * One panel, not four. The board is the product (brief section 36), and the
 * previous layout worked against that: a question card, a matter card, an ask
 * bar and a caption each floated independently over the ink, overlapping the
 * drawing and each other. Everything that supports the board now lives in a
 * single column on the right, and the board owns the rest of the screen.
 *
 * It is sized to its own content rather than to the window. A panel pinned
 * top-to-bottom is mostly empty while the answer is still arriving, and it ran
 * straight over the provider pill in the top-right corner; this one starts
 * below that pill, hugs whatever it currently holds, and grows — animated — as
 * the explanation and the key concepts arrive. Past the cap it stops growing
 * and scrolls instead.
 *
 * Only what the panel is for is in it: the stage, the question, the matter,
 * and one place to ask again. The log button, the character counter, the beat
 * counter, the standalone voice row and the derived follow-up chips were all
 * chrome about the panel rather than about the lesson, so they are gone — the
 * log is on Ctrl L, and the voice toggle is a mic inside the ask box. Every
 * region inside carries the same inset on all four sides (--rail-pad), so
 * nothing sits closer to one edge than to another.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { LessonState } from '../hooks/useLesson.ts';
import { CoinLoader } from './originkit/CoinLoader.tsx';
import { PulsatingBorder } from './originkit/PulsatingBorder.tsx';
import { ThinkingList } from './ThinkingList.tsx';
import { ComprehensionCard } from './ComprehensionCard.tsx';

type Tab = 'explanation' | 'concepts' | 'transcript';

interface Props {
  state: LessonState;
  busy: boolean;
  onAnswerCheck?(optionId: string): void;
  onRetryCheck?(): void;
  onAskFollowup?(question: string): void;
}

/** Split prose into paragraphs, tolerating single-newline formatting. */
function paragraphs(text: string): string[] {
  const byBlank = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return text.split(/\n/).map((p) => p.trim()).filter(Boolean);
}

/**
 * The panel's height, tracked from its content.
 *
 * The measured element is inside the scroll box but never constrained by it,
 * so its box is always the natural height of what the panel holds — which is
 * what a ResizeObserver reports, and what the height transition animates
 * towards. The first measurement is taken in a layout effect so the panel
 * never paints at the wrong size for a frame.
 */
function useContentHeight<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number>();

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setHeight(el.getBoundingClientRect().height);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return { ref, height };
}

export function LessonRail({
  state,
  busy,
  onAnswerCheck,
  onRetryCheck,
  onAskFollowup,
}: Props) {
  const [tab, setTab] = useState<Tab>('explanation');
  const { ref: contentRef, height } = useContentHeight<HTMLDivElement>();
  /* The opening animation is a transform, and a height transition running at
   * the same time would fight it, so the height is only animated from the
   * second measurement onwards. */
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), 260);
    return () => window.clearTimeout(timer);
  }, []);

  const { answer, finalAnswer, definitions, transcript } = state;

  return (
    <aside
      className={`rail ${settled ? 'rail--settled' : ''}`}
      style={height ? { height: `${height}px` } : undefined}
    >
      {/* Portalled to the body by the shader, so no ancestor's overflow can
          trim the glow off the panel's edge. */}
      <div className="rail__glow" aria-hidden="true">
        <PulsatingBorder
          radius="inherit"
          thickness={1.5}
          bloom={18}
          speed={1}
        />
      </div>

      <div className="rail__content" ref={contentRef}>
        <header className="rail__head">
          <span className={`rail__stage rail__stage--${state.stage.toLowerCase()}`}>
            {state.stageLabel || state.stage}
          </span>
          <h2 className="rail__question" title={state.question}>
            {state.question}
          </h2>
        </header>

        <nav className="rail__tabs" role="tablist">
          {(
            [
              ['explanation', 'Explanation'],
              ['concepts', `Concepts${definitions.length ? ` · ${definitions.length}` : ''}`],
              ['transcript', 'Transcript'],
            ] as Array<[Tab, string]>
          ).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              className={`rail__tab ${tab === id ? 'is-active' : ''}`}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>

        <div className="rail__body">
          {tab === 'explanation' && (
            <>
              {answer.trim() ? (
                paragraphs(answer).map((p, i) => <p key={i}>{p}</p>)
              ) : busy ? (
                state.steps.length > 0 ? (
                  <ThinkingList steps={state.steps} sourceCount={state.sources.length} />
                ) : (
                  <div className="rail__loading" role="status">
                    <span className="rail__loading-art" aria-hidden="true">
                      <CoinLoader distance={8} />
                    </span>
                    <span>{state.detail || 'Working out the answer…'}</span>
                  </div>
                )
              ) : (
                <p className="rail__empty">The written answer will appear here.</p>
              )}
              {finalAnswer.trim() && (
                <div className="rail__final">
                  <span className="rail__final-tag">Answer</span>
                  <div>{finalAnswer}</div>
                </div>
              )}
            </>
          )}

          {tab === 'concepts' &&
            (definitions.length ? (
              <div className="rail__defs">
                {definitions.map((d, i) => (
                  <div key={i} className="rail__def">
                    <div className="rail__def-term">{d.term}</div>
                    <div className="rail__def-text">{d.definition}</div>
                  </div>
                ))}
              </div>
            ) : busy ? (
              <div className="rail__loading" role="status">
                <span className="rail__loading-art" aria-hidden="true">
                  <CoinLoader distance={8} />
                </span>
                <span>Collecting the key terms…</span>
              </div>
            ) : (
              <p className="rail__empty">Key terms and formulas appear here.</p>
            ))}

          {tab === 'transcript' &&
            (transcript.length ? (
              <ol className="rail__transcript">
                {transcript.map((line, i) => (
                  <li key={i} className={i === transcript.length - 1 ? 'is-current' : ''}>
                    {line}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rail__empty">What Nemo says while drawing is transcribed here.</p>
            ))}
        </div>

        {state.stage === 'COMPLETED' && state.pendingCheck && (
          <ComprehensionCard
            check={state.pendingCheck}
            result={state.checkResult}
            onAnswer={(id) => onAnswerCheck?.(id)}
            onRetry={onRetryCheck}
            onAskFollowup={onAskFollowup}
          />
        )}
      </div>
    </aside>
  );
}
