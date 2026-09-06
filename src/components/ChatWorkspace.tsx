import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ModernComposer } from './ModernComposer.tsx';
import type { DefinitionItem, LessonState } from '../hooks/useLesson.ts';

export interface ChatSuggestion {
  title: string;
  description: string;
  prompt: string;
  category?: string;
  icon?: ReactNode;
}

export interface TurnSnapshot {
  question: string;
  answer: string;
  finalAnswer: string;
  definitions: DefinitionItem[];
  error: string | null;
}

export interface ChatWorkspaceProps {
  state: LessonState;
  busy: boolean;
  onAsk(question: string): void;
  onStop(): void;
  onOpenCanvas(): void;
  suggestions?: readonly ChatSuggestion[];
  className?: string;
  autoFocus?: boolean;
  turns?: TurnSnapshot[];
  voiceEnabled?: boolean;
  onToggleVoice?(): void;
}

type TechnicalIconName = 'chip' | 'junction' | 'circuit' | 'code';

const DEFAULT_SUGGESTIONS: readonly ChatSuggestion[] = [
  {
    category: 'Embedded systems',
    title: 'ESP32 + LED',
    description: 'Wire it safely, then trace what happens when GPIO 2 goes HIGH.',
    prompt: 'Show me how an ESP32 turns on an LED connected to GPIO 2.',
    icon: <TechnicalIcon name="chip" />,
  },
  {
    category: 'Semiconductors',
    title: 'Explore a PN junction',
    description: 'Visualize depletion, charge carriers, and forward bias.',
    prompt: 'Explain a PN junction visually, including forward and reverse bias.',
    icon: <TechnicalIcon name="junction" />,
  },
  {
    category: 'Circuit analysis',
    title: 'Understand an RC circuit',
    description: 'Follow voltage and current through charge and discharge.',
    prompt: 'Teach me how an RC circuit charges and discharges with a waveform.',
    icon: <TechnicalIcon name="circuit" />,
  },
  {
    category: 'Programming',
    title: 'Visualize binary search',
    description: 'See each comparison shrink the search space step by step.',
    prompt: 'Visualize binary search on a sorted array and explain each step.',
    icon: <TechnicalIcon name="code" />,
  },
] as const;

function TechnicalIcon({ name }: { name: TechnicalIconName }) {
  if (name === 'chip') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="6.5" y="6.5" width="11" height="11" rx="2" />
        <path d="M9.5 9.5h5v5h-5zM3 8h3.5M3 12h3.5M3 16h3.5M17.5 8H21M17.5 12H21M17.5 16H21M8 3v3.5M12 3v3.5M16 3v3.5M8 17.5V21M12 17.5V21M16 17.5V21" />
      </svg>
    );
  }
  if (name === 'junction') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 12h5M16 12h5M8 6v12l8-6-8-6ZM16 6v12" />
        <circle cx="4" cy="12" r="1" />
        <circle cx="20" cy="12" r="1" />
      </svg>
    );
  }
  if (name === 'circuit') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7h4l1.2-2 2.2 4 2.2-4 2.2 4L17 7h3v10H4V7Z" />
        <path d="M8 14h8M9.5 17v3M14.5 17v3" />
        <circle cx="4" cy="7" r="1" />
        <circle cx="20" cy="7" r="1" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m8.5 7-5 5 5 5M15.5 7l5 5-5 5M13.5 4 10 20" />
    </svg>
  );
}

function NemoMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`nemo-chat__mark${compact ? ' nemo-chat__mark--compact' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 48 48">
        <circle cx="24" cy="24" r="13.5" />
        <path d="M16.5 29V19l15 10V19" />
        <path className="nemo-chat__mark-orbit" d="M5 29.5c4.5 6.5 17.3 8.4 28.5 4.2S50 20.9 43 15" />
        <circle className="nemo-chat__mark-node" cx="42.5" cy="15.5" r="2" />
      </svg>
    </span>
  );
}

function CanvasIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="15.5" rx="2.5" />
      <path d="M7 15.5 10.5 12l2.5 2.5 2.2-2.2 2.8 3.2M8 8.5h.01" />
    </svg>
  );
}

function snapshot(state: LessonState): TurnSnapshot {
  return {
    question: state.question,
    answer: state.answer,
    finalAnswer: state.finalAnswer,
    definitions: state.definitions.map((definition) => ({ ...definition })),
    error: state.error,
  };
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function appendDistinctTurn(turns: TurnSnapshot[], next: TurnSnapshot): TurnSnapshot[] {
  if (!next.question.trim()) return turns;
  if (turns[turns.length - 1]?.question === next.question) {
    return [...turns.slice(0, -1), next];
  }
  return [...turns, next];
}

function AssistantResponse({
  turn,
  active,
  busy,
  state,
  onOpenCanvas,
}: {
  turn: TurnSnapshot;
  active: boolean;
  busy: boolean;
  state: LessonState;
  onOpenCanvas(): void;
}) {
  const hasResponse = Boolean(turn.answer.trim() || turn.finalAnswer.trim() || turn.definitions.length);

  return (
    <article className="nemo-chat__assistant" aria-label="NEMO response" aria-busy={active && busy}>
      <div className="nemo-chat__assistant-avatar">
        <NemoMark compact />
      </div>
      <div className="nemo-chat__response">
        <div className="nemo-chat__response-head">
          <span>NEMO</span>
          {active && busy && <span className="nemo-chat__stream-tag">Live</span>}
        </div>

        {turn.error ? (
          <div className="nemo-chat__error" role="alert">
            <strong>I couldn’t finish that lesson.</strong>
            <span>{turn.error}</span>
          </div>
        ) : hasResponse ? (
          <>
            {splitParagraphs(turn.answer).map((paragraph, index) => (
              <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
            ))}
            {active && busy && turn.answer.trim() && (
              <span className="nemo-chat__cursor" aria-hidden="true" />
            )}
          </>
        ) : active && busy ? (
          <div className="nemo-chat__thinking" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        ) : (
          <p className="nemo-chat__muted">Ask a follow-up or open the visual canvas to continue.</p>
        )}

        {turn.definitions.length > 0 && (
          <section className="nemo-chat__concepts" aria-labelledby="nemo-key-concepts">
            <h3 id="nemo-key-concepts">Key concepts</h3>
            <dl>
              {turn.definitions.map((item, index) => (
                <div key={`${item.term}-${index}`}>
                  <dt>{item.term}</dt>
                  <dd>{item.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {turn.finalAnswer.trim() && (
          <section className="nemo-chat__final" aria-label="Final answer">
            <span>Final answer</span>
            <p>{turn.finalAnswer}</p>
          </section>
        )}

        {active && busy && (
          <div className="nemo-chat__progress" role="status" aria-live="polite">
            <span className="nemo-chat__progress-pulse" aria-hidden="true" />
            <div>
              <strong>{state.stageLabel || 'NEMO is working'}</strong>
              {state.detail && <span>{state.detail}</span>}
            </div>
            {state.actionCount > 0 && (
              <span className="nemo-chat__progress-count">
                {Math.min(state.actionIndex, state.actionCount)}/{state.actionCount}
              </span>
            )}
          </div>
        )}

        {(active || turn.finalAnswer.trim()) && (
          <button type="button" className="nemo-chat__inline-canvas" onClick={onOpenCanvas}>
            <CanvasIcon />
            <span>Open Canvas</span>
            {active && state.plan && <span className="nemo-chat__ready-dot" aria-label="Visual ready" />}
          </button>
        )}
      </div>
    </article>
  );
}

export function ChatWorkspace({
  state,
  busy,
  onAsk,
  onStop,
  onOpenCanvas,
  suggestions = DEFAULT_SUGGESTIONS,
  className = '',
  autoFocus = true,
  turns: propTurns,
  voiceEnabled = false,
  onToggleVoice,
}: ChatWorkspaceProps) {
  const [archivedTurns, setArchivedTurns] = useState<TurnSnapshot[]>([]);
  const [pendingQuestion, setPendingQuestion] = useState('');
  const latestRef = useRef<TurnSnapshot>(snapshot(state));
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = latestRef.current;
    if (previous.question && state.question && previous.question !== state.question) {
      setArchivedTurns((turns) => appendDistinctTurn(turns, previous));
    }
    latestRef.current = snapshot(state);
    if (pendingQuestion && pendingQuestion === state.question) setPendingQuestion('');
  }, [pendingQuestion, state]);

  useEffect(() => {
    const viewport = scrollRef.current;
    if (!viewport || !state.question) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: busy ? 'smooth' : 'auto' });
  }, [busy, state.answer, state.definitions.length, state.finalAnswer, state.question, state.stage]);

  const turns = useMemo(() => {
    if (propTurns !== undefined) {
      return propTurns;
    }
    const current = snapshot(state);
    const withoutDuplicate = archivedTurns.filter((turn) => turn.question !== current.question);
    return current.question ? [...withoutDuplicate, current] : withoutDuplicate;
  }, [propTurns, archivedTurns, state]);

  const handleComposerSubmit = (question: string) => {
    if (!question || busy) return;
    setPendingQuestion(question);
    onAsk(question);
  };

  const empty = turns.length === 0 && !pendingQuestion;

  return (
    <main className={`nemo-chat ${className}`.trim()} aria-label="NEMO chat workspace">
      <style>{CHAT_WORKSPACE_STYLES}</style>

      <div className="nemo-chat__viewport" ref={scrollRef}>
        {empty ? (
          <section className="nemo-chat__hero-openai" aria-labelledby="nemo-hero-title">
            <h1 id="nemo-hero-title" className="nemo-chat__hero-heading">
              Where should we begin?
            </h1>
            <div className="nemo-chat__hero-composer-wrap">
              <ModernComposer
                onSubmit={handleComposerSubmit}
                onStop={onStop}
                busy={busy}
                autoFocus={autoFocus}
                placeholder="Ask anything"
                voiceEnabled={voiceEnabled}
                onToggleVoice={onToggleVoice}
              />
            </div>
            <div className="nemo-chat__hero-chips">
              {suggestions.map((suggestion) => (
                <button
                  type="button"
                  className="nemo-chat__hero-chip"
                  key={suggestion.prompt}
                  onClick={() => handleComposerSubmit(suggestion.prompt)}
                  disabled={busy}
                >
                  <span className="nemo-chat__hero-chip-icon">
                    {suggestion.icon ?? <TechnicalIcon name="circuit" />}
                  </span>
                  <span>{suggestion.title}</span>
                </button>
              ))}
            </div>
          </section>
        ) : (
          <section className="nemo-chat__conversation" aria-label="Conversation">
            {turns.map((turn, index) => {
              const active = index === turns.length - 1 && turn.question === state.question;
              return (
                <div className="nemo-chat__turn" key={`${turn.question}-${index}`}>
                  <div className="nemo-chat__user-row">
                    <div className="nemo-chat__user-message">{turn.question}</div>
                    <span className="nemo-chat__user-avatar" aria-hidden="true">SV</span>
                  </div>
                  <AssistantResponse
                    turn={turn}
                    active={active}
                    busy={busy}
                    state={state}
                    onOpenCanvas={onOpenCanvas}
                  />
                </div>
              );
            })}

            {pendingQuestion && pendingQuestion !== state.question && (
              <div className="nemo-chat__turn">
                <div className="nemo-chat__user-row">
                  <div className="nemo-chat__user-message">{pendingQuestion}</div>
                  <span className="nemo-chat__user-avatar" aria-hidden="true">SV</span>
                </div>
                <article className="nemo-chat__assistant" aria-label="NEMO response" aria-busy="true">
                  <div className="nemo-chat__assistant-avatar"><NemoMark compact /></div>
                  <div className="nemo-chat__response">
                    <div className="nemo-chat__response-head"><span>NEMO</span></div>
                    <div className="nemo-chat__thinking" aria-label="Sending question">
                      <span /><span /><span />
                    </div>
                  </div>
                </article>
              </div>
            )}
          </section>
        )}
      </div>

      {!empty && (
        <div className="nemo-chat__composer-region">
          <ModernComposer
            onSubmit={handleComposerSubmit}
            onStop={onStop}
            busy={busy}
            placeholder="Ask a follow-up or explore a new concept…"
            voiceEnabled={voiceEnabled}
            onToggleVoice={onToggleVoice}
          />
          <div className="nemo-chat__composer-meta">
            <span><kbd>Enter</kbd> send</span>
            <span>NEMO may make mistakes. Verify critical hardware limits.</span>
          </div>
        </div>
      )}
    </main>
  );
}

const CHAT_WORKSPACE_STYLES = `
.nemo-chat {
  --nemo-chat-bg: var(--bg-app);
  --nemo-chat-surface: var(--bg-elevated);
  --nemo-chat-surface-strong: var(--bg-active);
  --nemo-chat-border: var(--border-subtle);
  --nemo-chat-border-strong: var(--border-default);
  --nemo-chat-text: var(--text-primary);
  --nemo-chat-muted: var(--text-tertiary);
  --nemo-chat-accent: var(--accent);
  --nemo-chat-accent-strong: var(--accent-strong);
  --nemo-chat-accent-soft: var(--accent-soft);
  --nemo-chat-danger: var(--danger);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  color: var(--nemo-chat-text);
  background: var(--nemo-chat-bg);
  font-family: var(--font-ui);
  isolation: isolate;
}

.nemo-chat button,
.nemo-chat textarea { font: inherit; }
.nemo-chat button { color: inherit; }
.nemo-chat svg { width: 1.25rem; height: 1.25rem; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }

.nemo-chat__topbar {
  z-index: 5;
  min-height: 66px;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 11px clamp(18px, 3vw, 38px);
  border-bottom: 1px solid var(--nemo-chat-border);
  background: var(--bg-app);
  backdrop-filter: blur(14px);
}

.nemo-chat__topbar-identity { display: flex; align-items: center; gap: 10px; min-width: 0; }
.nemo-chat__topbar-identity > div { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.nemo-chat__topbar-identity strong { font-size: 13px; letter-spacing: .14em; line-height: 1.2; }
.nemo-chat__topbar-identity span { color: var(--nemo-chat-muted); font-size: 11px; white-space: nowrap; }

.nemo-chat__mark { width: 64px; height: 64px; display: inline-grid; place-items: center; color: var(--nemo-chat-accent); flex: none; }
.nemo-chat__mark svg { width: 100%; height: 100%; stroke-width: 1.45; }
.nemo-chat__mark--compact { width: 32px; height: 32px; }
.nemo-chat__mark-orbit { stroke: var(--text-tertiary); }
.nemo-chat__mark-node { fill: var(--nemo-chat-accent); stroke: none; }

.nemo-chat__canvas-button,
.nemo-chat__inline-canvas {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 1px solid var(--nemo-chat-border-strong);
  border-radius: 10px;
  background: var(--nemo-chat-surface);
  cursor: pointer;
  transition: border-color .16s ease, background .16s ease, transform .16s ease;
}
.nemo-chat__canvas-button { min-height: 40px; padding: 0 14px; font-size: 13px; font-weight: 650; }
.nemo-chat__canvas-button:hover,
.nemo-chat__inline-canvas:hover { border-color: var(--border-strong); background: var(--nemo-chat-accent-soft); }
.nemo-chat__canvas-button:active,
.nemo-chat__inline-canvas:active { transform: translateY(1px); }
.nemo-chat__ready-dot { width: 6px; height: 6px; border-radius: 999px; background: var(--nemo-chat-accent); box-shadow: 0 0 0 3px var(--nemo-chat-accent-soft); }

.nemo-chat__viewport { min-height: 0; flex: 1 1 auto; overflow-y: auto; overscroll-behavior: contain; scrollbar-color: var(--border-strong) transparent; }
.nemo-chat__welcome { width: min(820px, calc(100% - 40px)); min-height: 100%; margin: 0 auto; padding: clamp(50px, 10vh, 108px) 0 170px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.nemo-chat__eyebrow { margin: 13px 0 8px; color: var(--nemo-chat-accent); font-size: 10px; font-weight: 700; letter-spacing: .19em; }
.nemo-chat__welcome h1 { margin: 0; font-size: clamp(29px, 4.3vw, 46px); font-weight: 620; letter-spacing: -.035em; line-height: 1.15; }
.nemo-chat__welcome-copy { max-width: 590px; margin: 16px auto 34px; color: var(--nemo-chat-muted); font-size: clamp(14px, 1.4vw, 16px); line-height: 1.65; }

.nemo-chat__suggestions { width: 100%; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 11px; text-align: left; }
.nemo-chat__suggestion { min-width: 0; min-height: 116px; display: grid; grid-template-columns: 40px minmax(0, 1fr) 18px; align-items: start; gap: 12px; padding: 17px; border: 1px solid var(--nemo-chat-border); border-radius: 14px; background: var(--bg-elevated); text-align: left; cursor: pointer; transition: border-color .16s ease, background .16s ease, transform .16s ease; }
.nemo-chat__suggestion:hover { border-color: var(--nemo-chat-border-strong); background: var(--nemo-chat-surface-strong); transform: translateY(-1px); }
.nemo-chat__suggestion:disabled { opacity: .5; cursor: not-allowed; transform: none; }
.nemo-chat__suggestion-icon { width: 38px; height: 38px; display: grid; place-items: center; border-radius: 10px; color: var(--nemo-chat-accent); background: var(--nemo-chat-accent-soft); }
.nemo-chat__suggestion-copy { min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.nemo-chat__suggestion-copy small { color: var(--nemo-chat-accent); font-size: 10px; font-weight: 650; letter-spacing: .06em; text-transform: uppercase; }
.nemo-chat__suggestion-copy strong { margin-top: 2px; font-size: 14px; line-height: 1.35; }
.nemo-chat__suggestion-copy > span { color: var(--nemo-chat-muted); font-size: 12px; line-height: 1.45; }
.nemo-chat__suggestion-arrow { color: var(--text-disabled); font-size: 14px; transition: color .16s ease, transform .16s ease; }
.nemo-chat__suggestion:hover .nemo-chat__suggestion-arrow { color: var(--nemo-chat-accent); transform: translate(1px, -1px); }

.nemo-chat__conversation { width: min(850px, calc(100% - 42px)); margin: 0 auto; padding: 38px 0 190px; }
.nemo-chat__turn + .nemo-chat__turn { margin-top: 46px; padding-top: 38px; border-top: 1px solid var(--border-subtle); }
.nemo-chat__user-row { display: flex; justify-content: flex-end; align-items: flex-end; gap: 10px; margin-bottom: 30px; }
.nemo-chat__user-message { max-width: min(680px, 82%); padding: 12px 16px; border: 1px solid var(--nemo-chat-border); border-radius: 17px 17px 4px 17px; background: var(--nemo-chat-surface-strong); font-size: 14px; line-height: 1.55; white-space: pre-wrap; }
.nemo-chat__user-avatar { width: 30px; height: 30px; display: grid; place-items: center; flex: none; border: 1px solid var(--nemo-chat-border-strong); border-radius: 50%; color: var(--nemo-chat-muted); font-size: 9px; font-weight: 700; text-transform: uppercase; }
.nemo-chat__assistant { display: grid; grid-template-columns: 34px minmax(0, 1fr); gap: 14px; }
.nemo-chat__assistant-avatar { padding-top: 1px; }
.nemo-chat__response { min-width: 0; color: var(--text-primary); font-size: 15px; line-height: 1.75; }
.nemo-chat__response-head { height: 30px; display: flex; align-items: flex-start; gap: 9px; color: var(--nemo-chat-text); font-size: 12px; font-weight: 750; letter-spacing: .08em; }
.nemo-chat__response p { margin: 0 0 14px; white-space: pre-wrap; }
.nemo-chat__stream-tag { margin-top: 1px; padding: 1px 6px; border: 1px solid var(--border-default); border-radius: 999px; color: var(--nemo-chat-accent); font-size: 8px; letter-spacing: .08em; text-transform: uppercase; }
.nemo-chat__muted { color: var(--nemo-chat-muted); }
.nemo-chat__cursor { width: 2px; height: 1.05em; display: inline-block; vertical-align: -.12em; margin-left: 2px; border-radius: 1px; background: var(--nemo-chat-accent); animation: nemo-chat-blink .9s steps(2, start) infinite; }

.nemo-chat__thinking { height: 28px; display: flex; align-items: center; gap: 5px; }
.nemo-chat__thinking span { width: 5px; height: 5px; border-radius: 50%; background: var(--nemo-chat-accent); animation: nemo-chat-breathe 1.15s ease-in-out infinite; }
.nemo-chat__thinking span:nth-child(2) { animation-delay: .14s; }
.nemo-chat__thinking span:nth-child(3) { animation-delay: .28s; }

.nemo-chat__error { display: flex; flex-direction: column; gap: 3px; padding: 13px 15px; border: 1px solid var(--danger-soft); border-radius: 10px; color: var(--nemo-chat-danger); background: var(--danger-soft); font-size: 13px; line-height: 1.55; }
.nemo-chat__concepts { margin: 24px 0 18px; padding-top: 19px; border-top: 1px solid var(--nemo-chat-border); }
.nemo-chat__concepts h3 { margin: 0 0 11px; color: var(--nemo-chat-muted); font-size: 11px; letter-spacing: .08em; text-transform: uppercase; }
.nemo-chat__concepts dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin: 0; }
.nemo-chat__concepts dl > div { padding: 12px; border: 1px solid var(--nemo-chat-border); border-radius: 10px; background: var(--bg-elevated); }
.nemo-chat__concepts dt { color: var(--nemo-chat-accent-strong); font-size: 12px; font-weight: 700; line-height: 1.4; }
.nemo-chat__concepts dd { margin: 4px 0 0; color: var(--nemo-chat-muted); font-size: 12px; line-height: 1.5; }
.nemo-chat__final { margin: 20px 0; padding: 14px 16px; border-left: 2px solid var(--nemo-chat-accent); border-radius: 0 10px 10px 0; background: var(--nemo-chat-accent-soft); }
.nemo-chat__final > span { display: block; margin-bottom: 4px; color: var(--nemo-chat-accent); font-size: 9px; font-weight: 750; letter-spacing: .11em; text-transform: uppercase; }
.nemo-chat__final p { margin: 0; color: var(--nemo-chat-text); font-weight: 600; }

.nemo-chat__progress { min-height: 50px; display: flex; align-items: center; gap: 10px; margin-top: 18px; padding: 10px 12px; border: 1px solid var(--nemo-chat-border); border-radius: 10px; background: var(--bg-elevated); }
.nemo-chat__progress-pulse { width: 8px; height: 8px; flex: none; border-radius: 50%; background: var(--nemo-chat-accent); animation: nemo-chat-pulse 1.4s ease-out infinite; }
.nemo-chat__progress > div { min-width: 0; display: flex; flex: 1; flex-direction: column; line-height: 1.4; }
.nemo-chat__progress strong { font-size: 11px; font-weight: 650; }
.nemo-chat__progress div span { overflow: hidden; color: var(--nemo-chat-muted); font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.nemo-chat__progress-count { color: var(--nemo-chat-muted); font-size: 10px; font-variant-numeric: tabular-nums; }
.nemo-chat__inline-canvas { min-height: 34px; margin-top: 12px; padding: 0 11px; color: var(--nemo-chat-muted); font-size: 11px; }
.nemo-chat__inline-canvas svg { width: 15px; height: 15px; }

.nemo-chat__composer-region { z-index: 4; flex: 0 0 auto; margin-top: -155px; padding: 46px clamp(18px, 3vw, 38px) 14px; background: linear-gradient(to bottom, transparent, var(--nemo-chat-bg) 38%); pointer-events: none; }
.nemo-chat__composer { width: min(790px, 100%); min-height: 62px; display: flex; align-items: flex-end; gap: 10px; margin: 0 auto; padding: 7px 8px 7px 18px; border: 1px solid var(--nemo-chat-border-strong); border-radius: 18px; background: var(--bg-elevated); box-shadow: 0 17px 48px rgba(0,0,0,.33); pointer-events: auto; transition: border-color .16s ease, box-shadow .16s ease; }
.nemo-chat__composer:focus-within { border-color: var(--border-strong); box-shadow: 0 17px 48px rgba(0,0,0,.33), 0 0 0 3px var(--accent-soft); }
.nemo-chat__composer textarea { width: 100%; height: 52px; min-height: 52px; max-height: 160px; resize: none; padding: 14px 0 10px; border: 0; outline: 0; color: var(--nemo-chat-text); background: transparent; font-size: 14px; line-height: 1.5; scrollbar-width: thin; }
.nemo-chat__composer textarea::placeholder { color: var(--text-tertiary); }
.nemo-chat__composer textarea:disabled { cursor: wait; }
.nemo-chat__submit { width: 42px; height: 42px; display: grid; place-items: center; flex: none; margin-bottom: 3px; border: 0; border-radius: 12px; color: var(--text-inverse); background: var(--nemo-chat-accent-strong); cursor: pointer; transition: filter .15s ease, transform .15s ease, opacity .15s ease; }
.nemo-chat__submit:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
.nemo-chat__submit:disabled { opacity: .28; cursor: not-allowed; }
.nemo-chat__submit--stop { color: var(--nemo-chat-text); background: var(--bg-active); }
.nemo-chat__submit--stop span { width: 11px; height: 11px; border-radius: 2px; background: currentColor; }
.nemo-chat__composer-meta { width: min(760px, 100%); display: flex; justify-content: space-between; gap: 16px; margin: 8px auto 0; color: var(--text-disabled); font-size: 9px; line-height: 1.4; pointer-events: auto; }
.nemo-chat__composer-meta kbd { padding: 0; color: var(--text-tertiary); background: transparent; font: inherit; }
.nemo-chat__sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }

.nemo-chat button:focus-visible,
.nemo-chat textarea:focus-visible { outline: 2px solid var(--nemo-chat-accent); outline-offset: 3px; }

@keyframes nemo-chat-blink { 50% { opacity: 0; } }
@keyframes nemo-chat-breathe { 0%, 70%, 100% { opacity: .25; transform: translateY(0); } 35% { opacity: 1; transform: translateY(-2px); } }
@keyframes nemo-chat-pulse { 0% { box-shadow: 0 0 0 0 var(--accent-soft); } 70%, 100% { box-shadow: 0 0 0 8px transparent; } }

@media (max-width: 720px) {
  .nemo-chat__topbar { min-height: 58px; padding: 9px 14px; }
  .nemo-chat__topbar-identity > div span { display: none; }
  .nemo-chat__canvas-button { min-height: 36px; padding: 0 10px; }
  .nemo-chat__welcome { width: min(100% - 28px, 620px); padding-top: 38px; }
  .nemo-chat__suggestions { grid-template-columns: 1fr; }
  .nemo-chat__suggestion { min-height: 94px; }
  .nemo-chat__conversation { width: calc(100% - 28px); padding-top: 26px; }
  .nemo-chat__user-message { max-width: 88%; }
  .nemo-chat__assistant { grid-template-columns: 29px minmax(0, 1fr); gap: 10px; }
  .nemo-chat__assistant-avatar .nemo-chat__mark { width: 28px; height: 28px; }
  .nemo-chat__concepts dl { grid-template-columns: 1fr; }
  .nemo-chat__composer-region { padding-inline: 12px; }
  .nemo-chat__composer { min-height: 58px; border-radius: 15px; padding-left: 14px; }
  .nemo-chat__composer-meta { justify-content: center; text-align: center; }
  .nemo-chat__composer-meta span:first-child { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .nemo-chat *, .nemo-chat *::before, .nemo-chat *::after { scroll-behavior: auto !important; animation-duration: .001ms !important; animation-iteration-count: 1 !important; transition-duration: .001ms !important; }
}
`;
