/**
 * NEMO — post-lesson comprehension check.
 *
 * Shown once a lesson finishes drawing, if the model produced one.
 * When the learner selects an incorrect answer, NEMO provides pedagogical guidance
 * and lets the learner try again until they master the concept.
 */

import { useState } from 'react';
import type { ComprehensionCheck } from '../../shared/contracts.ts';

interface Props {
  check: ComprehensionCheck | null;
  result: { optionId: string; correct: boolean } | null;
  onAnswer(optionId: string): void;
  onRetry?(): void;
  onAskFollowup?(question: string): void;
}

export function ComprehensionCard({ check, result, onAnswer, onRetry, onAskFollowup }: Props) {
  const [attemptedWrong, setAttemptedWrong] = useState<string[]>([]);
  const [showFullRationale, setShowFullRationale] = useState(false);

  if (!check || check.options.length === 0) return null;

  const isComplete = result?.correct === true;
  const isWrong = Boolean(result && !result.correct);

  const handleSelect = (optionId: string) => {
    if (isComplete) return;
    if (optionId !== check.correctOptionId) {
      setAttemptedWrong((prev) => (prev.includes(optionId) ? prev : [...prev, optionId]));
    }
    onAnswer(optionId);
  };

  const handleRetry = () => {
    setShowFullRationale(false);
    onRetry?.();
  };

  return (
    <div className="nemo-check" role="group" aria-label="Comprehension Check">
      <div className="nemo-check__head">
        <span className="nemo-check__badge">CONCEPT CHECK</span>
        {isComplete && <span className="nemo-check__status-tag is-correct">✓ Mastered</span>}
        {isWrong && <span className="nemo-check__status-tag is-retry">Try Again</span>}
      </div>

      <p className="nemo-check__question">{check.question}</p>

      <div className="nemo-check__options">
        {check.options.map((option) => {
          const isSelected = result?.optionId === option.id;
          const isMarkedWrong = attemptedWrong.includes(option.id) || (isSelected && isWrong);
          const isCorrectAndRevealed = (isSelected && isComplete) || (showFullRationale && option.id === check.correctOptionId);

          let optionClass = 'nemo-check__option';
          if (isCorrectAndRevealed) {
            optionClass += ' nemo-check__option--correct';
          } else if (isMarkedWrong) {
            optionClass += ' nemo-check__option--incorrect';
          }

          return (
            <button
              key={option.id}
              type="button"
              className={optionClass}
              onClick={() => handleSelect(option.id)}
              disabled={isComplete}
              aria-pressed={isSelected}
            >
              <span className="nemo-check__option-bullet">
                {isCorrectAndRevealed ? '✓' : isMarkedWrong ? '✗' : option.id.toUpperCase()}
              </span>
              <span className="nemo-check__option-text">{option.label}</span>
            </button>
          );
        })}
      </div>

      {result && (
        <div className={`nemo-check__feedback ${result.correct ? 'is-correct' : 'is-incorrect'}`}>
          {result.correct ? (
            <>
              <p className="nemo-check__feedback-title">🎯 Exactly right!</p>
              <p className="nemo-check__feedback-body">{check.rationale}</p>
              {onAskFollowup && (
                <button
                  type="button"
                  className="nemo-check__action-btn"
                  onClick={() => onAskFollowup(`Test me with a deeper conceptual question about this.`)}
                >
                  Ask a follow-up challenge →
                </button>
              )}
            </>
          ) : (
            <>
              <p className="nemo-check__feedback-title">🤔 Not quite there yet.</p>
              <p className="nemo-check__feedback-body">
                {showFullRationale
                  ? check.rationale
                  : 'Think about how the fundamental principles interact on the canvas. Re-examine the visual demonstration above and select another option.'}
              </p>
              <div className="nemo-check__retry-actions">
                <button
                  type="button"
                  className="nemo-check__retry-btn"
                  onClick={handleRetry}
                >
                  🔄 Pick another answer
                </button>
                {!showFullRationale && (
                  <button
                    type="button"
                    className="nemo-check__hint-btn"
                    onClick={() => setShowFullRationale(true)}
                  >
                    Reveal explanation
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}

      <style>{COMPREHENSION_CARD_STYLES}</style>
    </div>
  );
}

const COMPREHENSION_CARD_STYLES = `
.nemo-check {
  margin-top: 16px;
  padding: 18px 20px 20px;
  border: 1px solid rgba(255, 196, 84, 0.28);
  border-radius: 18px;
  background: linear-gradient(145deg, #1f1b16, #161412);
  color: #fff;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}
.nemo-check__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.nemo-check__badge {
  font-size: 11px;
  font-weight: 760;
  letter-spacing: .09em;
  color: #ffd699;
}
.nemo-check__status-tag {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
}
.nemo-check__status-tag.is-correct {
  background: rgba(96, 210, 130, 0.2);
  color: #9fe6b0;
  border: 1px solid rgba(96, 210, 130, 0.4);
}
.nemo-check__status-tag.is-retry {
  background: rgba(255, 196, 84, 0.2);
  color: #ffd699;
  border: 1px solid rgba(255, 196, 84, 0.35);
}
.nemo-check__question {
  margin: 0 0 14px;
  font-size: 14.5px;
  font-weight: 500;
  line-height: 1.55;
  color: #f5f5f5;
}
.nemo-check__options {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.nemo-check__option {
  display: flex;
  align-items: center;
  gap: 12px;
  text-align: left;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, .1);
  background: rgba(255, 255, 255, .04);
  color: #eee;
  font-size: 13.5px;
  cursor: pointer;
  transition: all .16s ease;
}
.nemo-check__option:not(:disabled):hover {
  background: rgba(255, 255, 255, .09);
  border-color: rgba(255, 255, 255, .2);
  transform: translateX(2px);
}
.nemo-check__option:disabled {
  cursor: default;
}
.nemo-check__option-bullet {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.08);
  font-size: 11px;
  font-weight: 700;
  color: #aaa;
  flex-shrink: 0;
}
.nemo-check__option--correct {
  border-color: rgba(96, 210, 130, .6);
  background: rgba(96, 210, 130, .14);
  color: #d1fae5;
}
.nemo-check__option--correct .nemo-check__option-bullet {
  background: rgba(96, 210, 130, .3);
  color: #a7f3d0;
}
.nemo-check__option--incorrect {
  border-color: rgba(239, 68, 68, .5);
  background: rgba(239, 68, 68, .12);
  color: #fecaca;
  opacity: 0.85;
}
.nemo-check__option--incorrect .nemo-check__option-bullet {
  background: rgba(239, 68, 68, .3);
  color: #fca5a5;
}
.nemo-check__feedback {
  margin-top: 14px;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
}
.nemo-check__feedback.is-correct {
  background: rgba(16, 185, 129, 0.12);
  border: 1px solid rgba(16, 185, 129, 0.3);
  color: #d1fae5;
}
.nemo-check__feedback.is-incorrect {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.28);
  color: #fecaca;
}
.nemo-check__feedback-title {
  margin: 0 0 6px;
  font-weight: 600;
  font-size: 13.5px;
}
.nemo-check__feedback-body {
  margin: 0;
  color: #e5e7eb;
}
.nemo-check__retry-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}
.nemo-check__retry-btn {
  background: rgba(255, 196, 84, 0.2);
  border: 1px solid rgba(255, 196, 84, 0.4);
  color: #ffd699;
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s;
}
.nemo-check__retry-btn:hover {
  background: rgba(255, 196, 84, 0.32);
}
.nemo-check__hint-btn {
  background: transparent;
  border: none;
  color: #9ca3af;
  font-size: 12px;
  text-decoration: underline;
  cursor: pointer;
  padding: 4px;
}
.nemo-check__hint-btn:hover {
  color: #e5e7eb;
}
.nemo-check__action-btn {
  margin-top: 10px;
  background: rgba(96, 210, 130, 0.2);
  border: 1px solid rgba(96, 210, 130, 0.4);
  color: #a7f3d0;
  font-size: 12.5px;
  font-weight: 600;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background .15s;
}
.nemo-check__action-btn:hover {
  background: rgba(96, 210, 130, 0.32);
}
`;

export default ComprehensionCard;
