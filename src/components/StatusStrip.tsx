/**
 * NEMO — lesson status.
 *
 * Top-centre: the question and what Nemo is doing right now. Bottom: the line
 * currently being narrated, so the lesson reads even with the sound off.
 * The developer detail (beat/action counters and the action log) is behind a
 * toggle so it never competes with the board during a demo.
 */

import { useState } from 'react';
import type { LessonState } from '../hooks/useLesson.ts';

interface Props {
  state: LessonState;
  busy: boolean;
  onDemoMode?: () => void;
}

export function StatusStrip({ state, busy, onDemoMode }: Props) {
  const [showLog, setShowLog] = useState(false);
  if (state.stage === 'IDLE') return null;

  const progress =
    state.actionCount > 0 ? Math.round((state.actionIndex / state.actionCount) * 100) : 0;

  return (
    <>
      <div className="status">
        <div className="status__main">
          <span className="status__question">{state.question}</span>
          <span className={`status__stage status__stage--${state.stage.toLowerCase()}`}>
            {busy && <span className="status__spinner" aria-hidden />}
            {state.stageLabel}
            {state.beatCount > 0 && state.stage === 'DRAWING' && (
              <span className="status__counter">
                beat {state.beatIndex}/{state.beatCount} · action {state.actionIndex}/
                {state.actionCount}
              </span>
            )}
          </span>
          <button
            className="status__toggle"
            onClick={() => setShowLog((v) => !v)}
            title="Show execution log"
          >
            {showLog ? 'hide log' : 'log'}
          </button>
        </div>
        {state.stage === 'DRAWING' && (
          <div className="status__bar">
            <div className="status__bar-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>

      {state.error && (
        <div className="error-banner" role="alert">
          <div>
            <strong>Nemo could not finish this lesson.</strong>
            <span>{state.error}</span>
          </div>
          {onDemoMode && (
            <button className="error-banner__action" onClick={onDemoMode}>
              Switch to Demo Mode
            </button>
          )}
        </div>
      )}

      {state.narration && (state.stage === 'DRAWING' || state.stage === 'COMPLETED') && (
        <div className="narration">{state.narration}</div>
      )}

      {showLog && (
        <div className="log">
          <div className="log__head">
            execution log
            {state.plan && (
              <span className="log__meta">
                {state.plan.beats.length} beats ·{' '}
                {state.plan.beats.reduce((n, b) => n + b.visualActions.length, 0)} actions ·{' '}
                {state.plan.domain}
              </span>
            )}
          </div>
          <div className="log__body">
            {state.log.length === 0 ? (
              <div className="log__line log__line--muted">nothing yet</div>
            ) : (
              state.log.map((line, i) => (
                <div
                  key={`${i}-${line.slice(0, 24)}`}
                  className={`log__line ${/FAIL|UNRESOLVED|COLLISION|REJECT/.test(line) ? 'log__line--bad' : ''}`}
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </>
  );
}
