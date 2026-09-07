/**
 * NEMO — Canvas Ask Bar
 *
 * Floating prompt and demo launcher on the infinite canvas,
 * styled to match the modern AI "Where should we begin?" interface.
 */

import { ModernComposer } from './ModernComposer.tsx';
import { NemoMascot } from './ui/NemoMascot.tsx';

export interface CanvasDemoItem {
  label: string;
  query: string;
  description?: string;
}

export const CANVAS_DEMOS: readonly CanvasDemoItem[] = [
  {
    label: 'Binary Search',
    query: 'Explain binary search.',
    description: 'Pointers, array slicing & O(log n)',
  },
  {
    label: 'Benzene Chemistry',
    query: 'Explain benzene structure and electron delocalization.',
    description: 'Resonance hybrid & π-electron cloud',
  },
  {
    label: 'Physics Friction',
    query:
      'A 2 kg block is pulled along a rough horizontal surface by a 10 N force at an angle of 30 degrees above the horizontal. The coefficient of kinetic friction is 0.2. What is the acceleration of the block?',
    description: 'Free body diagram & vectors',
  },
  {
    label: 'Calculus Area',
    query:
      'Evaluate \\int_0^2 x^2 dx and explain what the integral represents geometrically.',
    description: 'Definite integral area & curve',
  },
  {
    label: 'ESP32 LED',
    query: 'How does an ESP32 turn on an LED connected to GPIO 2?',
    description: 'Microcontroller GPIO & current flow',
  },
];

interface Props {
  onAsk(question: string): void;
  onStop(): void;
  busy: boolean;
  voiceEnabled?: boolean;
  onToggleVoice?(): void;
  compact?: boolean;
  /** Readable labels of whatever the learner just circled on the board. */
  circledLabels?: string[];
  onClearCircled?(): void;
}

export function CanvasAskBar({
  onAsk,
  onStop,
  busy,
  voiceEnabled,
  onToggleVoice,
  compact = false,
  circledLabels,
  onClearCircled,
}: Props) {
  if (compact) {
    return (
      <div className="canvas-ask canvas-ask--followup" aria-label="Ask a visual follow-up">
        {circledLabels && circledLabels.length > 0 && (
          <div className="canvas-ask__region-chip">
            <span>
              Circled: {circledLabels.slice(0, 3).join(', ')}
              {circledLabels.length > 3 ? ` +${circledLabels.length - 3}` : ''}
            </span>
            {onClearCircled && (
              <button type="button" onClick={onClearCircled} aria-label="Clear circled region">
                ×
              </button>
            )}
          </div>
        )}
        <ModernComposer
          onSubmit={onAsk}
          onStop={onStop}
          busy={busy}
          placeholder={
            circledLabels && circledLabels.length > 0
              ? 'Ask about what you circled…'
              : 'Ask a follow-up on this canvas…'
          }
          voiceEnabled={voiceEnabled}
          onToggleVoice={onToggleVoice}
        />
      </div>
    );
  }

  return (
    <div className="canvas-ask canvas-ask--hero">
      <div className="canvas-ask__header">
        <NemoMascot
          size={76}
          state={busy ? 'thinking' : 'idle'}
          showBubble={true}
          bubbleText="Hello!"
          bubbleSubtitle="I'm NEMO!"
          animated={true}
        />
      </div>

      <div className="canvas-ask__composer-wrap">
        <ModernComposer
          onSubmit={onAsk}
          onStop={onStop}
          busy={busy}
          autoFocus
          placeholder="Ask anything"
          voiceEnabled={voiceEnabled}
          onToggleVoice={onToggleVoice}
        />
      </div>

      <div className="canvas-ask__demos">
        <div className="canvas-ask__chips">
          {CANVAS_DEMOS.map((demo) => (
            <button
              key={demo.label}
              type="button"
              className="canvas-ask__chip"
              onClick={() => onAsk(demo.query)}
              disabled={busy}
              title={demo.description || demo.query}
            >
              <span>{demo.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default CanvasAskBar;
