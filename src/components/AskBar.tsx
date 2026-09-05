/**
 * NEMO — the ask bar.
 *
 * The dominant control when the board is empty; it slides to the bottom once a
 * lesson is running so the canvas stays the product.
 */

import { useEffect, useRef, useState } from 'react';

interface Props {
  onSubmit(question: string): void;
  onStop(): void;
  busy: boolean;
  /** Centred hero state before the first lesson. */
  hero: boolean;
}

const SUGGESTIONS = [
  '⚡ Binary Search Demo',
  '🧪 Benzene Chemistry Demo',
  '⚙️ Physics Friction Demo',
  '∫ Calculus Area Demo',
  '2x + 5 = 17',
  'Explain the area of a triangle.',
];

export function AskBar({ onSubmit, onStop, busy, hero }: Props) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [hero]);

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    onSubmit(q);
    setValue('');
  };

  const handleChipClick = (s: string) => {
    let query = s;
    if (s.includes('Binary Search')) {
      query = 'Explain binary search.';
    } else if (s.includes('Benzene')) {
      query = 'Explain benzene structure and electron delocalization.';
    } else if (s.includes('Physics')) {
      query =
        'A 2 kg block is pulled along a rough horizontal surface by a 10 N force at an angle of 30 degrees above the horizontal. The coefficient of kinetic friction is 0.2. What is the acceleration of the block?';
    } else if (s.includes('Calculus') || s.includes('Integral')) {
      query = 'Evaluate \\int_0^2 x^2 dx and explain what the integral represents geometrically.';
    }
    onSubmit(query);
  };

  return (
    <div className={`ask ${hero ? 'ask--hero' : 'ask--docked'}`}>
      {hero && (
        <>
          <h1 className="ask__title">What do you want to learn?</h1>
          <p className="ask__sub">Nemo will work it out and draw the explanation on the board.</p>
        </>
      )}

      <div className="ask__field">
        <textarea
          ref={inputRef}
          className="ask__input"
          rows={1}
          value={value}
          placeholder="Ask Nemo anything..."
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
        {hero ? (
          SUGGESTIONS.map((s) => (
            <button
              key={s}
              className={`ask__chip ${s.includes('Demo') ? 'ask__chip--accent' : ''}`}
              onClick={() => handleChipClick(s)}
            >
              {s}
            </button>
          ))
        ) : (
          <>
            <button
              className="ask__chip ask__chip--accent"
              onClick={() => handleChipClick('Explain binary search.')}
              title="Play Binary Search Animation Demo"
            >
              ⚡ Binary Search Demo
            </button>
            <button
              className="ask__chip ask__chip--accent"
              onClick={() => handleChipClick('Explain benzene structure and electron delocalization.')}
              title="Play Benzene Chemistry Animation Demo"
            >
              🧪 Benzene Chemistry Demo
            </button>
            <button
              className="ask__chip ask__chip--accent"
              onClick={() => handleChipClick('Physics Friction Demo')}
              title="Play Physics Friction & Acceleration Demo"
            >
              ⚙️ Physics Friction Demo
            </button>
            <button
              className="ask__chip ask__chip--accent"
              onClick={() => handleChipClick('Calculus Area Demo')}
              title="Play Definite Integral Area Demo"
            >
              ∫ Calculus Area Demo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
