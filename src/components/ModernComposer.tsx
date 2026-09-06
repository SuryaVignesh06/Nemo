/**
 * NEMO — Modern Pill Composer
 *
 * Matches the OpenAI/modern AI design language:
 * [ + ]  Ask anything                     [ 🧠 Think ]  [ 🎙️ ]  [ ılı ]
 */

import { useState, useRef, useEffect, type FormEvent, type KeyboardEvent } from 'react';

interface Props {
  onSubmit(text: string): void;
  onStop?(): void;
  busy?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  voiceEnabled?: boolean;
  onToggleVoice?(): void;
}

export function ModernComposer({
  onSubmit,
  onStop,
  busy = false,
  placeholder = 'Ask anything',
  autoFocus = false,
  className = '',
  voiceEnabled = false,
  onToggleVoice,
}: Props) {
  const [value, setValue] = useState('');
  const [thinkActive, setThinkActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    const finalPrompt = thinkActive ? `${trimmed} (Please think step-by-step and show deep technical reasoning.)` : trimmed;
    onSubmit(finalPrompt);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form className={`modern-composer ${className}`} onSubmit={handleSubmit}>
      {/* Plus / Tools button on the left */}
      <button
        type="button"
        className="modern-composer__tool-btn"
        aria-label="Add attachment or action"
        title="Tools & Attachments"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" strokeLinecap="round" />
          <line x1="5" y1="12" x2="19" y2="12" strokeLinecap="round" />
        </svg>
      </button>

      {/* Main text input */}
      <input
        ref={inputRef}
        type="text"
        className="modern-composer__input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={busy}
        spellCheck={false}
      />

      {/* Right controls: Think toggle, Mic, Waveform / Submit */}
      <div className="modern-composer__actions">
        <button
          type="button"
          className={`modern-composer__think-btn ${thinkActive ? 'is-active' : ''}`}
          onClick={() => setThinkActive((t) => !t)}
          title="Deep Reasoning Mode (Think)"
          aria-pressed={thinkActive}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M9.5 2A4.5 4.5 0 0 0 5 6.5C5 7.4 5.3 8.2 5.8 8.9A5 5 0 0 0 3 13.5C3 15.8 4.6 17.8 6.8 18.3A4.5 4.5 0 0 0 11 22h1a4.5 4.5 0 0 0 4.2-3.7c2.2-.5 3.8-2.5 3.8-4.8a5 5 0 0 0-2.8-4.6c.5-.7.8-1.5.8-2.4A4.5 4.5 0 0 0 13.5 2" />
            <path d="M12 2v20M9.5 8h5M8 13h8M9.5 18h5" />
          </svg>
          <span>Think</span>
        </button>

        <button
          type="button"
          className={`modern-composer__mic-btn ${voiceEnabled ? 'is-active' : ''}`}
          onClick={onToggleVoice}
          title={voiceEnabled ? 'Voice enabled (Click to mute)' : 'Enable Voice audio'}
          aria-label="Toggle voice"
        >
          <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>

        {busy ? (
          <button
            type="button"
            className="modern-composer__action-pill modern-composer__action-pill--stop"
            onClick={onStop}
            title="Stop generating"
            aria-label="Stop generating"
          >
            <span className="modern-composer__stop-sq" />
          </button>
        ) : value.trim() ? (
          <button
            type="submit"
            className="modern-composer__action-pill modern-composer__action-pill--send"
            title="Send (Enter)"
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        ) : (
          <button
            type="button"
            className="modern-composer__action-pill modern-composer__action-pill--wave"
            title="Live Audio Voice Mode"
            aria-label="Live Audio Voice"
            onClick={onToggleVoice}
          >
            <div className="modern-composer__waveform" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
            </div>
          </button>
        )}
      </div>
    </form>
  );
}

export default ModernComposer;
