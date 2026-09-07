/**
 * NEMO — the layers that sit over the board itself.
 *
 * Failure and developer-log overlays. VisualTopStatus is the single owner of
 * live narration, so transcription can never be duplicated.
 */

import type { LessonState } from '../hooks/useLesson.ts';

interface Props {
  state: LessonState;
  showLog: boolean;
  onDemoMode?: () => void;
}

export function StatusStrip({ state, showLog, onDemoMode }: Props) {
  if (state.stage === 'IDLE' && !state.error) return null;

  return (
    <>
      {state.error && (
        <div className="error-banner" role="alert">
          <div>
            <strong>Nemo could not finish this lesson.</strong>
            <span>{state.error}</span>
          </div>
          {onDemoMode && (
            <button className="error-banner__action" onClick={onDemoMode}>
              Run the scripted demo
            </button>
          )}
        </div>
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
