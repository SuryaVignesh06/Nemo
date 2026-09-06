/**
 * NEMO — the layers that sit over the board itself.
 *
 * Three things, and nothing else: the live caption, a failure banner, and the
 * developer log. Everything that is not a live overlay belongs in the rail.
 *
 * The caption is centred on the *canvas* region rather than the window, so it
 * tracks what is being drawn instead of sliding under the rail (section 40).
 */

import type { LessonState } from '../hooks/useLesson.ts';

interface Props {
  state: LessonState;
  showLog: boolean;
  onDemoMode?: () => void;
}

export function StatusStrip({ state, showLog, onDemoMode }: Props) {
  if (state.stage === 'IDLE' && !state.error) return null;

  const speaking = state.voiceStatus === 'speaking';

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

      {state.narration && (state.stage === 'DRAWING' || state.stage === 'COMPLETED') && (
        <div className="caption">
          {speaking && <span className="caption__live">LIVE</span>}
          <span className="caption__text">{state.narration}</span>
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
