import type { LessonState } from '../hooks/useLesson.ts';
import { NemoMark } from './ui/NemoMark.tsx';

interface Props {
  state: LessonState;
  busy: boolean;
}

/** One compact visual-page overlay: animated NEMO mark + current transcript. */
export function VisualTopStatus({ state, busy }: Props) {
  const speaking = state.voiceStatus === 'speaking';
  const text = state.narration.trim() || state.detail.trim() || state.stageLabel || 'Ready';

  return (
    <div className="visual-live-status" role="status" aria-live="polite" aria-label="NEMO narration">
      <NemoMark size={38} animated={busy || speaking} />
      <div className="visual-live-status__transcript">
        <span className={`visual-live-status__dot ${busy || speaking ? 'is-active' : ''}`} aria-hidden="true" />
        <span className="visual-live-status__label">
          {speaking ? 'Live' : busy ? state.stageLabel || 'Working' : 'NEMO'}
        </span>
        {speaking && (
          <span className="visual-live-status__bars" aria-hidden="true"><span /><span /><span /></span>
        )}
        <span className="visual-live-status__text">{text}</span>
      </div>
    </div>
  );
}

export default VisualTopStatus;
