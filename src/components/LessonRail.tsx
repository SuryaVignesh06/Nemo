/**
 * NEMO — the lesson rail.
 *
 * One panel, not four. The board is the product (brief section 36), and the
 * previous layout worked against that: a question card, a matter card, an ask
 * bar and a caption each floated independently over the ink, overlapping the
 * drawing and each other. Everything that supports the board now lives in a
 * single column on the right, and the board owns the rest of the screen.
 *
 * The rail reserves a known region, which the camera is told about, so the
 * layout engine never places primary content underneath it (section 39).
 */

import { useState } from 'react';
import type { DefinitionItem, LessonState } from '../hooks/useLesson.ts';
import type { VoiceStatus } from '../presenter/voice.ts';

type Tab = 'explanation' | 'concepts' | 'transcript';

interface Props {
  state: LessonState;
  busy: boolean;
  voiceEnabled: boolean;
  onToggleVoice(): void;
  onAsk(question: string): void;
  onStop(): void;
  showLog: boolean;
  onToggleLog(): void;
}

const VOICE_LABEL: Record<VoiceStatus, string> = {
  disabled: 'Voice off',
  ready: 'Voice ready',
  speaking: 'Speaking',
  unavailable: 'Voice unavailable',
};

/**
 * Follow-ups drawn from the lesson's own key terms.
 *
 * Deliberately derived rather than generated: a suggestion that costs a model
 * call would delay the board, and a term the lesson just defined is the thing
 * the learner is most likely to want next.
 */
function followUps(definitions: DefinitionItem[]): string[] {
  return definitions.slice(0, 3).map((d) => `Explain ${d.term} in more depth.`);
}

/** Split prose into paragraphs, tolerating single-newline formatting. */
function paragraphs(text: string): string[] {
  const byBlank = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (byBlank.length > 1) return byBlank;
  return text.split(/\n/).map((p) => p.trim()).filter(Boolean);
}

export function LessonRail({
  state,
  busy,
  voiceEnabled,
  onToggleVoice,
  onAsk,
  onStop,
  showLog,
  onToggleLog,
}: Props) {
  const [tab, setTab] = useState<Tab>('explanation');
  const [draft, setDraft] = useState('');

  const { answer, finalAnswer, definitions, transcript } = state;
  const suggestions = followUps(definitions);

  const submit = () => {
    const q = draft.trim();
    if (!q) return;
    onAsk(q);
    setDraft('');
  };

  const progress =
    state.actionCount > 0 ? Math.round((state.actionIndex / state.actionCount) * 100) : 0;

  return (
    <aside className="rail">
      <header className="rail__head">
        <div className="rail__stage">
          {busy && <span className="rail__spinner" aria-hidden />}
          <span className={`rail__stage-text rail__stage-text--${state.stage.toLowerCase()}`}>
            {state.stageLabel || state.stage}
          </span>
          {state.beatCount > 0 && (
            <span className="rail__counter">
              beat {state.beatIndex}/{state.beatCount}
            </span>
          )}
          <button
            type="button"
            className="rail__log-btn"
            onClick={onToggleLog}
            title="Toggle the execution log"
          >
            {showLog ? 'Hide log' : 'Log'}
          </button>
        </div>
        <h2 className="rail__question" title={state.question}>
          {state.question}
        </h2>
        {state.detail && <p className="rail__detail">{state.detail}</p>}
        {busy && (
          <div className="rail__bar">
            <div
              className={`rail__bar-fill ${state.stage === 'DRAWING' ? '' : 'rail__bar-fill--indeterminate'}`}
              style={state.stage === 'DRAWING' ? { width: `${progress}%` } : undefined}
            />
          </div>
        )}
      </header>

      <nav className="rail__tabs" role="tablist">
        {(
          [
            ['explanation', 'Explanation'],
            ['concepts', `Key concepts${definitions.length ? ` (${definitions.length})` : ''}`],
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
            ) : (
              <p className="rail__empty">
                {busy ? 'Working out the answer…' : 'The written answer will appear here.'}
              </p>
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
          ) : (
            <p className="rail__empty">
              {busy ? 'Collecting the key terms…' : 'Key terms and formulas appear here.'}
            </p>
          ))}

        {tab === 'transcript' &&
          (transcript.length ? (
            <ol className="rail__transcript">
              {transcript.map((line, i) => (
                <li
                  key={i}
                  className={i === transcript.length - 1 ? 'is-current' : ''}
                >
                  {line}
                </li>
              ))}
            </ol>
          ) : (
            <p className="rail__empty">What Nemo says while drawing is transcribed here.</p>
          ))}
      </div>

      <footer className="rail__foot">
        {suggestions.length > 0 && !busy && (
          <div className="rail__followups">
            {suggestions.map((s) => (
              <button key={s} className="rail__followup" onClick={() => onAsk(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          className={`rail__voice rail__voice--${state.voiceStatus}`}
          onClick={onToggleVoice}
          title={state.voiceDetail || 'Toggle narration'}
        >
          <span className="rail__voice-dot" aria-hidden />
          {voiceEnabled ? VOICE_LABEL[state.voiceStatus] : 'Voice off'}
          {state.voiceStatus === 'unavailable' && state.voiceDetail && (
            <span className="rail__voice-detail">{state.voiceDetail}</span>
          )}
        </button>

        <div className="rail__ask">
          <textarea
            className="rail__ask-input"
            rows={1}
            value={draft}
            placeholder="Ask a follow-up…"
            spellCheck={false}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          {busy ? (
            <button className="rail__ask-btn rail__ask-btn--stop" onClick={onStop} title="Stop">
              ■
            </button>
          ) : (
            <button
              className="rail__ask-btn"
              onClick={submit}
              disabled={!draft.trim()}
              title="Ask (Enter)"
            >
              ↑
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
}
