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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  const handleSubmit = (e?: FormEvent) => {
    e?.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue('');
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form
      className={`modern-composer ${className}`}
      onSubmit={handleSubmit}
      onClick={(e) => {
        // If clicking background of pill, focus input
        if ((e.target as HTMLElement).tagName !== 'BUTTON' && !(e.target as HTMLElement).closest('button')) {
          inputRef.current?.focus();
        }
      }}
    >
      {/* Plus / Tools button on the left */}
      <button
        type="button"
        className="modern-composer__tool-btn"
        aria-label="Add attachment or action"
        title="Tools & Attachments"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.2">
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
        autoFocus
        /* Never disabled. A composer that goes dead the moment the model
           starts answering reads as a broken input, and the whole drawing
           phase is "busy". */
        spellCheck={false}
      />

      {/* Right controls: Mic, Waveform / Submit */}
      <div className="modern-composer__actions">

        <button
          type="button"
          className={`modern-composer__mic-btn ${voiceEnabled ? 'is-active' : ''}`}
          onClick={onToggleVoice}
          title={voiceEnabled ? 'Voice enabled (Click to mute)' : 'Enable Voice audio'}
          aria-label="Toggle voice"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8">
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
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5">
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
