/**
 * NEMO — Live Bottom Transcription Bar.
 *
 * Real-time floating lecture subtitle display showing what NEMO is saying
 * while drawing on the infinite blackboard canvas.
 */

import { useState } from 'react';
import type { LessonState } from '../hooks/useLesson.ts';

interface Props {
  state: LessonState;
  busy: boolean;
  className?: string;
}

export function LiveTranscriptionBar({ state, busy, className = '' }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // Only show when a lesson has started or is actively running
  if (state.stage === 'IDLE' && !state.narration) return null;

  const speaking = state.voiceStatus === 'speaking' || (busy && state.stage === 'DRAWING');
  const text = state.narration.trim() || state.stageLabel || 'Observing board…';

  return (
    <aside
      className={`nemo-live-caption ${collapsed ? 'is-collapsed' : ''} ${className}`}
      role="status"
      aria-live="polite"
      aria-label="Live lesson transcription"
    >
      <div className="nemo-live-caption__content">
        <div className="nemo-live-caption__badge">
          <span className={`nemo-live-caption__dot ${speaking ? 'is-speaking' : ''}`} aria-hidden="true" />
          <span className="nemo-live-caption__label">
            {speaking ? 'LIVE' : state.stage === 'COMPLETED' ? 'SUMMARY' : 'NEMO'}
          </span>
          {speaking && (
            <div className="nemo-live-caption__equalizer" aria-hidden="true">
              <span /><span /><span /><span />
            </div>
          )}
        </div>

        {!collapsed && (
          <div className="nemo-live-caption__text-wrap">
            <p className="nemo-live-caption__text">{text}</p>
          </div>
        )}

        <button
          type="button"
          className="nemo-live-caption__toggle"
          onClick={() => setCollapsed((v) => !v)}
          title={collapsed ? 'Expand live transcription' : 'Minimize transcription'}
          aria-expanded={!collapsed}
        >
          {collapsed ? '▲ Subtitles' : '▼'}
        </button>
      </div>

      <style>{LIVE_CAPTION_STYLES}</style>
    </aside>
  );
}

const LIVE_CAPTION_STYLES = `
.nemo-live-caption {
  position: absolute;
  bottom: 24px;
  left: calc(50% - 140px);
  transform: translateX(-50%);
  z-index: 22;
  max-width: min(780px, calc(100vw - 440px));
  min-width: 320px;
  pointer-events: auto;
  transition: all 0.24s cubic-bezier(0.16, 1, 0.3, 1);
}

.nemo-live-caption.is-collapsed {
  min-width: unset;
}

.nemo-live-caption__content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 18px;
  border-radius: 999px;
  background: rgba(14, 14, 18, 0.88);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(255, 255, 255, 0.05);
}

.nemo-live-caption__badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
  padding: 3px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.nemo-live-caption__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9ca3af;
  transition: background 0.2s;
}

.nemo-live-caption__dot.is-speaking {
  background: #ffc861;
  box-shadow: 0 0 8px rgba(255, 200, 97, 0.8);
  animation: nemo-dot-pulse 1.4s ease-in-out infinite alternate;
}

@keyframes nemo-dot-pulse {
  from { opacity: 0.6; transform: scale(0.9); }
  to { opacity: 1; transform: scale(1.2); }
}

.nemo-live-caption__label {
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #ffd699;
  text-transform: uppercase;
}

.nemo-live-caption__equalizer {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}

.nemo-live-caption__equalizer span {
  width: 2px;
  background: #ffc861;
  border-radius: 1px;
  animation: nemo-eq 0.8s ease-in-out infinite alternate;
}

.nemo-live-caption__equalizer span:nth-child(1) { height: 4px; animation-delay: 0.1s; }
.nemo-live-caption__equalizer span:nth-child(2) { height: 10px; animation-delay: 0.3s; }
.nemo-live-caption__equalizer span:nth-child(3) { height: 7px; animation-delay: 0.2s; }
.nemo-live-caption__equalizer span:nth-child(4) { height: 11px; animation-delay: 0.4s; }

@keyframes nemo-eq {
  from { height: 3px; }
  to { height: 12px; }
}

.nemo-live-caption__text-wrap {
  flex: 1;
  overflow: hidden;
}

.nemo-live-caption__text {
  margin: 0;
  font-size: 13.5px;
  font-weight: 480;
  line-height: 1.45;
  color: #f3f4f6;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  letter-spacing: 0.01em;
}

.nemo-live-caption__toggle {
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 6px;
  transition: all 0.15s;
  flex-shrink: 0;
}

.nemo-live-caption__toggle:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.08);
}
`;

export default LiveTranscriptionBar;
