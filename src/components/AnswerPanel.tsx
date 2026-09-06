/**
 * NEMO — the written answer.
 *
 * The answer is a product of the pipeline in its own right, not a by-product of
 * drawing. It arrives before any visual planning, so the learner is reading
 * while the board is still being composed, and a lesson whose rendering fails
 * has still answered the question.
 *
 * It is deliberately a narrow column pinned to the left: the board is the
 * product, and the text must never sit on top of the ink.
 */

import { useState } from 'react';

interface Props {
  answer: string;
  finalAnswer: string;
  question: string;
}

export function AnswerPanel({ answer, finalAnswer, question }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  if (!answer.trim() && !finalAnswer.trim()) return null;

  return (
    <aside className={`answer ${collapsed ? 'answer--collapsed' : ''}`}>
      <header className="answer-head">
        <span className="answer-q" title={question}>
          {question}
        </span>
        <button
          type="button"
          className="answer-toggle"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
        >
          {collapsed ? 'Show answer' : 'Hide'}
        </button>
      </header>

      {!collapsed && (
        <div className="answer-body">
          {/* Paragraph breaks are preserved; the model writes prose, not markup. */}
          {answer
            .split(/\n{2,}/)
            .filter((p) => p.trim())
            .map((p, i) => (
              <p key={i}>{p.trim()}</p>
            ))}

          {finalAnswer.trim() && (
            <p className="answer-final">
              <span className="answer-final-tag">Answer</span>
              {finalAnswer}
            </p>
          )}
        </div>
      )}
    </aside>
  );
}
