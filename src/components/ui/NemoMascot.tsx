import { useEffect, useState } from 'react';
import { NemoMark } from './NemoMark.tsx';

export type NemoMascotState =
  | 'idle'
  | 'happy'
  | 'excited'
  | 'thinking'
  | 'listening'
  | 'explaining'
  | 'confused'
  | 'curious'
  | 'encouraging'
  | 'correct'
  | 'incorrect'
  | 'celebrating'
  | 'loading'
  | 'error';

interface NemoMascotProps {
  /** Size in pixels */
  size?: number;
  /** State of the mascot */
  state?: NemoMascotState;
  /** Whether to show the typing line under the mascot */
  showBubble?: boolean;
  /** First phrase in the typing rotation */
  bubbleText?: string;
  /** Second phrase in the typing rotation */
  bubbleSubtitle?: string;
  /** Whether to play animation */
  animated?: boolean;
  /** Custom class name */
  className?: string;
  /** Optional click handler */
  onClick?: () => void;
}

/** Typewriter line: types a phrase, holds, deletes, moves to the next. */
function useTypewriter(phrases: string[], active: boolean) {
  const [text, setText] = useState('');
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phase, setPhase] = useState<'typing' | 'holding' | 'deleting'>('typing');

  useEffect(() => {
    if (!active || phrases.length === 0) return;
    const current = phrases[phraseIndex % phrases.length] ?? '';
    let timer: number;

    if (phase === 'typing') {
      if (text.length < current.length) {
        timer = window.setTimeout(() => setText(current.slice(0, text.length + 1)), 38);
      } else {
        timer = window.setTimeout(() => setPhase('holding'), 1600);
      }
    } else if (phase === 'holding') {
      timer = window.setTimeout(() => setPhase('deleting'), 1200);
    } else {
      if (text.length > 0) {
        timer = window.setTimeout(() => setText(current.slice(0, text.length - 1)), 20);
      } else {
        timer = window.setTimeout(() => {
          setPhraseIndex((i) => (i + 1) % phrases.length);
          setPhase('typing');
        }, 220);
      }
    }
    return () => window.clearTimeout(timer);
  }, [active, phrases, phraseIndex, phase, text]);

  useEffect(() => {
    if (!active) setText('');
  }, [active]);

  return text;
}

const DEFAULT_PROMPTS = ["What's on your mind?", "Let's start building.", 'Ask me anything.'];

/**
 * NEMO Mascot — Authentic Pixel-Art 'N' brand companion.
 * Matches the sidebar brand mark with staggered pixel pulse animation
 * and dynamic interactive typewriter prompts. Completely orb-free!
 */
export function NemoMascot({
  size = 72,
  state = 'idle',
  showBubble = true,
  bubbleText,
  bubbleSubtitle,
  animated = true,
  className = '',
  onClick,
}: NemoMascotProps) {
  const isThinking = state === 'thinking' || state === 'loading';

  const phrases = (bubbleText || bubbleSubtitle)
    ? [bubbleText, bubbleSubtitle, ...DEFAULT_PROMPTS].filter((value): value is string => Boolean(value))
    : DEFAULT_PROMPTS;
  const typed = useTypewriter(phrases, showBubble);

  // If size passed is huge (e.g. 240 or 340 from legacy orb props), clamp to a sleek hero size
  const markSize = size > 120 ? 76 : size;

  return (
    <div
      className={`nemo-mascot-wrapper ${animated ? 'is-animated' : ''} ${isThinking ? 'is-thinking' : ''} ${className}`.trim()}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '14px',
        cursor: onClick ? 'pointer' : 'default',
        userSelect: 'none',
        margin: '0 auto',
      }}
      onClick={onClick}
      role="img"
      aria-label={`NEMO AI (${state})`}
    >
      <NemoMark size={markSize} animated={animated} noContainer={true} />

      {showBubble && (
        <div
          className="nemo-mascot__typing-row"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            fontSize: '15px',
            color: 'var(--text-secondary, #A0A4B8)',
            fontWeight: 500,
            letterSpacing: '0.01em',
            minHeight: '26px',
            textAlign: 'center',
          }}
        >
          <span>{typed}</span>
          <span
            className="nemo-mascot__cursor"
            style={{
              width: '2px',
              height: '1.1em',
              background: '#7AB7FF',
              borderRadius: '1px',
              display: 'inline-block',
              animation: 'nemo-cursor-blink 0.9s infinite',
            }}
            aria-hidden="true"
          />
        </div>
      )}
    </div>
  );
}

export default NemoMascot;
