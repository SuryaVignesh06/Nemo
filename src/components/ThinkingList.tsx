/**
 * NEMO — what the agent is doing, while it is doing it.
 *
 * The board is empty for the first several seconds of every lesson: the model
 * is reading the question, searching the web and planning beats, and none of
 * that reaches the canvas until there is something to draw. This is that
 * window, made legible — each stage arrives as its own card, newest on top, in
 * Magic UI's AnimatedList motion, inside a ShineBorder frame.
 *
 * It leaves the moment the first stroke lands: once the board is drawing, the
 * board is the status.
 */

import type { ProcessStep } from '../hooks/useLesson.ts';
import { AnimatedList } from './motion/AnimatedList.tsx';
import { ShineBorder } from './motion/ShineBorder.tsx';

interface Props {
  steps: ProcessStep[];
  /** Sources read, shown as a count once the research step has landed. */
  sourceCount: number;
}

/** A colour per stage, so the list reads as a sequence rather than a wall. */
const STAGE_COLOR: Record<string, string> = {
  CONNECTING: '#8F8F8F',
  ANALYZING: '#7AB7FF',
  RESEARCHING: '#4DA6E6',
  SOLVING: '#E2A33C',
  PLANNING: '#A07CFE',
  DIRECTING: '#A07CFE',
  DESIGNING_VISUALS: '#FE8FB5',
  VALIDATING: '#379590',
  READY: '#7DDBA4',
  DRAWING: '#7DDBA4',
};

const STAGE_GLYPH: Record<string, string> = {
  CONNECTING: '◍',
  ANALYZING: '✽',
  RESEARCHING: '⌕',
  SOLVING: '∑',
  PLANNING: '◇',
  DIRECTING: '◇',
  DESIGNING_VISUALS: '✎',
  VALIDATING: '✓',
  READY: '●',
  DRAWING: '▶',
};

export function ThinkingList({ steps, sourceCount }: Props) {
  if (!steps.length) return null;

  return (
    <section className="thinking" aria-label="What NEMO is doing" aria-live="polite">
      <ShineBorder
        shineColor={['#A07CFE', '#FE8FB5', '#FFBE7B']}
        duration={10}
        radius={18}
      />
      <header className="thinking__head">
        <span className="thinking__dot" aria-hidden="true" />
        <span>Working on it</span>
        {sourceCount > 0 && <span className="thinking__count">{sourceCount} sources</span>}
      </header>

      <AnimatedList delay={360} max={5}>
        {steps.map((step, index) => (
          <article className="thinking__card" key={`${step.stage}-${index}`}>
            <span
              className="thinking__glyph"
              style={{ background: STAGE_COLOR[step.stage] ?? '#4DA6E6' }}
              aria-hidden="true"
            >
              {STAGE_GLYPH[step.stage] ?? '◆'}
            </span>
            <span className="thinking__text">
              <strong>{step.label}</strong>
              {step.detail && <span>{step.detail}</span>}
            </span>
          </article>
        ))}
      </AnimatedList>
    </section>
  );
}

export default ThinkingList;
