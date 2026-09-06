/**
 * NEMO — an AI visual teacher.
 *
 * The board is the product: a black infinite canvas that Nemo draws on live
 * while it explains. Everything else stays out of its way.
 */

import { BoardCanvas } from './canvas/BoardCanvas.tsx';
import { AnswerPanel } from './components/AnswerPanel.tsx';
import { AskBar } from './components/AskBar.tsx';
import { ConfigPanel } from './components/ConfigPanel.tsx';
import { StatusStrip } from './components/StatusStrip.tsx';
import { useLesson } from './hooks/useLesson.ts';
import { useSettings } from './hooks/useSettings.ts';

export default function App() {
  const { settings, update, updateProvider, updateVoice, providerPayload, hasBrowserKey } =
    useSettings();
  const { state, store, ask, cancel, busy, onManualCamera } = useLesson(settings, providerPayload);

  const hero = state.stage === 'IDLE';

  return (
    <div className="app">
      <BoardCanvas store={store} drawing={state.stage === 'DRAWING'} onManualCamera={onManualCamera} />

      <ConfigPanel
        settings={settings}
        update={update}
        updateProvider={updateProvider}
        updateVoice={updateVoice}
        voiceStatus={state.voiceStatus}
        voiceDetail={state.voiceDetail}
        hasBrowserKey={hasBrowserKey}
      />

      <AnswerPanel
        answer={state.answer}
        finalAnswer={state.finalAnswer}
        question={state.question}
      />

      <StatusStrip
        state={state}
        busy={busy}
        onDemoMode={() => {
          update({ provider: 'mock' });
          ask(state.question || 'Explain binary search.');
        }}
      />

      <AskBar onSubmit={ask} onStop={cancel} busy={busy} hero={hero} />
    </div>
  );
}
