/**
 * NEMO — Canvas Ask Bar
 *
 * Floating prompt and demo launcher on the infinite canvas,
 * styled to match the modern AI "Where should we begin?" interface.
 */

import { ModernComposer } from './ModernComposer.tsx';

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
}

export function CanvasAskBar({ onAsk, onStop, busy, voiceEnabled, onToggleVoice }: Props) {
  return (
    <div className="canvas-ask canvas-ask--hero">
      <div className="canvas-ask__header">
        <h1 className="canvas-ask__title">Where should we begin?</h1>
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
