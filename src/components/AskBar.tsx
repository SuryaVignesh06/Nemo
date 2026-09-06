/**
 * NEMO — the opening ask.
 *
 * Shown only on the empty board, where it is the whole interface. Once a
 * lesson exists the ask box lives in the rail's footer instead, so a follow-up
 * is asked in the same place the answer is being read and nothing floats over
 * the ink (brief sections 37–39).
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  onSubmit(question: string): void;
  onStop(): void;
  busy: boolean;
}

/** Each chip carries the question it actually asks, not a label to re-parse. */
const SUGGESTIONS: Array<{ label: string; question: string }> = [
  { label: '⚡ Binary search', question: 'Explain binary search.' },
  {
    label: '∫ Definite integral',
    question:
      'Evaluate the integral from 0 to 2 of x^2 and explain what it represents geometrically.',
  },
  {
    label: '🪐 Why planets orbit',
    question: 'Explain why planets stay in orbit around the sun.',
  },
  {
    label: '🧪 Benzene',
    question: 'Explain benzene structure and electron delocalization.',
  },
  { label: '💡 ESP32 LED', question: 'How does an ESP32 turn on an LED?' },
  { label: '2x + 5 = 17', question: '2x + 5 = 17' },
];

export function AskBar({ onSubmit, onStop, busy }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    onSubmit(q);
    setValue('');
  };

  return (
    <div className="ask">
      <h1 className="ask__title">What do you want to learn?</h1>
      <p className="ask__sub">Nemo works it out and draws the explanation on the board.</p>

      <div className="ask__field">
        <textarea
          ref={inputRef}
          className="ask__input"
          rows={1}
          value={value}
          placeholder="Ask Nemo anything…"
          spellCheck={false}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
        />
        {busy ? (
          <button className="ask__button ask__button--stop" onClick={onStop} title="Stop the lesson">
            Stop
          </button>
        ) : (
          <button
            className="ask__button"
            onClick={submit}
            disabled={!value.trim()}
            title="Ask (Enter)"
          >
            ↑
          </button>
        )}
      </div>

      <div className="ask__suggestions">
        {SUGGESTIONS.map((s) => (
          <button key={s.label} className="ask__chip" onClick={() => onSubmit(s.question)}>
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
