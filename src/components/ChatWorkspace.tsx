import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ModernComposer } from './ModernComposer.tsx';
import { NemoMark } from './ui/NemoMark.tsx';
import { NemoMascot } from './ui/NemoMascot.tsx';
import { PixelShineBorder } from './motion/PixelShineBorder.tsx';
import { TextAnimate } from './motion/TextAnimate.tsx';
import { Icon } from './ui/Icon.tsx';
import { ComprehensionCard } from './ComprehensionCard.tsx';
import type { ProcessStep } from '../hooks/useLesson.ts';
import type { SourceRef, VideoRef } from '../../shared/contracts.ts';
import type { DefinitionItem, LessonState } from '../hooks/useLesson.ts';

export interface TurnSnapshot {
  question: string;
  answer: string;
  /** The short plain-language answer; the long one lives behind the disclosure. */
  chatAnswer: string;
  finalAnswer: string;
  definitions: DefinitionItem[];
  sources: SourceRef[];
  videos: VideoRef[];
  steps: ProcessStep[];
  error: string | null;
}

export interface ChatWorkspaceProps {
  state: LessonState;
  busy: boolean;
  onAsk(question: string): void;
  onStop(): void;
  onOpenCanvas?(): void;
  className?: string;
  autoFocus?: boolean;
  turns?: TurnSnapshot[];
  voiceEnabled?: boolean;
  onToggleVoice?(): void;
  onSpeak?(text: string): Promise<void> | void;
  onStopSpeaking?(): void;
  speaking?: boolean;
  onAnswerCheck?(optionId: string): void;
  onRetryCheck?(): void;
}

function ChatMark({ compact = false, busy = false }: { compact?: boolean; busy?: boolean }) {
  return (
    <span
      className={`nemo-chat__mark${compact ? ' nemo-chat__mark--compact' : ''}`}
      aria-hidden="true"
    >
      <NemoMark
        size={compact ? 24 : 44}
        animated={true}
        state={busy ? 'responding' : 'idle'}
      />
    </span>
  );
}

function snapshot(state: LessonState): TurnSnapshot {
  return {
    question: state.question,
    answer: state.answer,
    chatAnswer: state.chatAnswer,
    finalAnswer: state.finalAnswer,
    definitions: state.definitions.map((definition) => ({ ...definition })),
    sources: state.sources,
    videos: state.videos,
    steps: state.steps.map((step) => ({ ...step })),
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

function sourceDomain(source: SourceRef): string {
  try {
    return new URL(source.url).hostname.replace(/^www\./, '');
  } catch {
    return source.source || 'source';
  }
}

function sourceFavicon(source: SourceRef): string {
  if (source.faviconUrl) return source.faviconUrl;
  try {
    return `${new URL(source.url).origin}/favicon.ico`;
  } catch {
    return '';
  }
}

function SourceLogo({ source, compact = false }: { source: SourceRef; compact?: boolean }) {
  const domain = sourceDomain(source);
  const favicon = sourceFavicon(source);
  return (
    <span className={`nemo-source-logo${compact ? ' is-compact' : ''}`} title={domain}>
      <span className="nemo-source-logo__monogram">{domain.slice(0, 1).toUpperCase()}</span>
      {favicon && (
        <img
          src={favicon}
          alt=""
          onError={(event) => { event.currentTarget.style.display = 'none'; }}
        />
      )}
    </span>
  );
}

/**
 * Claude-style Thinking Sparkle Icon (coral/amber 8-rayed sunburst).
 */
function ClaudeSpark({ animated = true }: { animated?: boolean }) {
  return (
    <span
      className={`claude-spark${animated ? ' is-animated' : ''}`}
      aria-hidden="true"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 15,
        height: 15,
        flexShrink: 0,
      }}
    >
      <svg viewBox="0 0 24 24" width="100%" height="100%" fill="none">
        <g
          stroke="#E2825A"
          strokeWidth="2.5"
          strokeLinecap="round"
          className={animated ? 'claude-spark__spokes' : ''}
        >
          <line x1="12" y1="3.5" x2="12" y2="7.5" />
          <line x1="12" y1="16.5" x2="12" y2="20.5" />
          <line x1="3.5" y1="12" x2="7.5" y2="12" />
          <line x1="16.5" y1="12" x2="20.5" y2="12" />
          <line x1="5.6" y1="5.6" x2="8.8" y2="8.8" />
          <line x1="15.2" y1="15.2" x2="18.4" y2="18.4" />
          <line x1="18.4" y1="5.6" x2="15.2" y2="8.8" />
          <line x1="8.8" y1="15.2" x2="5.6" y2="18.4" />
        </g>
      </svg>
    </span>
  );
}

/**
 * Claude-style Thought Process Disclosure:
 *
 * Free-standing inline line (no bulky card, no border, no background).
 * - While busy (Image 2):
 *   Claude-style coral sparkle + current action (e.g. "Sifting", "Choosing what to draw", "Analyzing...")
 *   + clickable toggle "Thought process >"
 * - When complete (Image 3):
 *   Clean toggle: "Thought process >" (or "Thought process ∨" when open).
 * - When open:
 *   Subtle, minimalist bordered card showing thought steps, details, and crawled web sources.
 */
function ThoughtProcess({
  steps,
  sources,
  detail,
  busy,
}: {
  steps: ProcessStep[];
  sources: SourceRef[];
  detail: string;
  busy: boolean;
}) {
  const [open, setOpen] = useState(false);

  if (!steps.length && !sources.length && !busy) return null;
  const current = steps[steps.length - 1];
  const activeLabel = (current?.label ?? detail) || 'Thinking…';

  return (
    <div className={`claude-thought ${open ? 'is-open' : ''} ${busy ? 'is-busy' : ''}`}>
      <button
        type="button"
        className="claude-thought__header"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {busy ? (
          <>
            <ClaudeSpark animated />
            <span className="claude-thought__status">{activeLabel}</span>
            <span className="claude-thought__toggle-arrow">
              <span className="claude-thought__arrow-label">Thought process</span>
              <Icon
                name={open ? 'chevron-down' : 'chevron-right'}
                size={12}
                className="claude-thought__caret"
              />
            </span>
          </>
        ) : (
          <span className="claude-thought__toggle-arrow">
            <span className="claude-thought__arrow-label">Thought process</span>
            <Icon
              name={open ? 'chevron-down' : 'chevron-right'}
              size={12}
              className="claude-thought__caret"
            />
          </span>
        )}

        {!busy && sources.length > 0 && (
          <span className="claude-thought__sources-badge">
            {sources.length} sources
          </span>
        )}
      </button>

      {open && (
        <div className="claude-thought__body">
          <div className="claude-thought__content">
            {steps.length > 0 ? (
              <ul className="claude-thought__list">
                {steps.map((step, index) => (
                  <li
                    key={`${step.stage}-${index}`}
                    className={index === steps.length - 1 && busy ? 'is-current' : ''}
                  >
                    <span className="claude-thought__step-bullet">
                      {index === steps.length - 1 && busy ? '→' : '✓'}
                    </span>
                    <div className="claude-thought__step-info">
                      <span className="claude-thought__step-label">{step.label}</span>
                      {step.detail && (
                        <span className="claude-thought__step-detail">{step.detail}</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            ) : detail ? (
              <p className="claude-thought__detail-text">{detail}</p>
            ) : null}

            {sources.length > 0 && (
              <div className="claude-thought__sources-section">
                <span className="claude-thought__sources-title">Read from the web</span>
                <div className="claude-thought__sources-grid">
                  {sources.map((source) => (
                    <a
                      key={source.url}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="claude-thought__source-link"
                    >
                      <SourceLogo source={source} compact />
                      <span className="claude-thought__source-meta">
                        <span className="claude-thought__source-host">{sourceDomain(source)}</span>
                        <span className="claude-thought__source-title">{source.title}</span>
                      </span>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ResponseActions({
  text,
  speaking,
  onSpeak,
  onStopSpeaking,
}: {
  text: string;
  speaking: boolean;
  onSpeak?: (text: string) => Promise<void> | void;
  onStopSpeaking?: () => void;
}) {
  const [feedback, setFeedback] = useState<'like' | 'dislike' | null>(null);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'NEMO answer', text });
      } catch {
        // Closing the native share sheet is not an error state.
      }
    } else {
      await copy();
    }
  };

  return (
    <div className="nemo-response-actions" aria-label="Response actions">
      <button
        type="button"
        onClick={() => speaking ? onStopSpeaking?.() : onSpeak?.(text)}
        aria-label={speaking ? 'Stop speaking' : 'Speak answer'}
        title={speaking ? 'Stop speaking' : 'Speak answer'}
        className={speaking ? 'is-active' : ''}
      >
        <Icon name={speaking ? 'pause' : 'volume'} />
      </button>
      <button type="button" onClick={() => setFeedback((value) => value === 'like' ? null : 'like')} aria-label="Like response" title="Like" className={feedback === 'like' ? 'is-active' : ''}><Icon name="thumbs-up" /></button>
      <button type="button" onClick={() => setFeedback((value) => value === 'dislike' ? null : 'dislike')} aria-label="Dislike response" title="Dislike" className={feedback === 'dislike' ? 'is-active' : ''}><Icon name="thumbs-down" /></button>
      <button type="button" onClick={share} aria-label="Share response" title="Share"><Icon name="share" /></button>
      <button type="button" onClick={copy} aria-label={copied ? 'Copied' : 'Copy response'} title={copied ? 'Copied' : 'Copy'} className={copied ? 'is-success' : ''}><Icon name={copied ? 'check' : 'copy'} /></button>
      {copied && <span className="nemo-response-actions__notice" role="status">Copied</span>}
    </div>
  );
}

function AssistantResponse({
  turn,
  active,
  busy,
  state,
  onSpeak,
  onStopSpeaking,
  speaking,
  onAnswerCheck,
  onRetryCheck,
}: {
  turn: TurnSnapshot;
  active: boolean;
  busy: boolean;
  state: LessonState;
  onSpeak?: (text: string) => Promise<void> | void;
  onStopSpeaking?: () => void;
  speaking: boolean;
  onAnswerCheck?: (optionId: string) => void;
  onRetryCheck?: () => void;
}) {
  /* Exactly one piece of answer content is shown in chat. Prefer the compact
     learner-facing answer, with the full answer and final value as fallbacks
     for workflows that do not emit chatAnswer yet. */
  const reply = turn.chatAnswer.trim() || turn.answer.trim() || turn.finalAnswer.trim();
  const processSteps = active ? state.steps : turn.steps;

  return (
    <article className="nemo-chat__assistant" aria-label="NEMO response" aria-busy={active && busy}>
      <div className="nemo-chat__assistant-avatar">
        <ChatMark compact busy={active && busy} />
      </div>
      <div className="nemo-chat__response">
        {!turn.error && (processSteps.length > 0 || turn.sources.length > 0 || (active && busy)) && (
          <ThoughtProcess
            steps={processSteps}
            sources={turn.sources}
            detail={state.detail}
            busy={active && busy}
          />
        )}

        {turn.error ? (
          <div className="nemo-chat__error" role="alert">
            <strong>I couldn’t finish that lesson.</strong>
            <span>{turn.error}</span>
          </div>
        ) : reply ? (
          <div className="nemo-chat__bubble">
            <div className="nemo-chat__bubble-head">
              <NemoMark size={28} animated={active && busy} state={active && busy ? 'responding' : 'idle'} />
              <span>NEMO</span>
              <small>Visual teacher</small>
            </div>
            <div className="nemo-chat__bubble-output">
              {splitParagraphs(reply).map((paragraph, index) => (
                <p key={`${index}-${paragraph.slice(0, 24)}`}>
                  {/* Animated only while it is arriving: a turn scrolled back to
                      should not replay itself. */}
                  <TextAnimate animate={active && busy}>{paragraph}</TextAnimate>
                </p>
              ))}
            </div>
            <ResponseActions
              text={reply}
              speaking={active && speaking}
              onSpeak={onSpeak}
              onStopSpeaking={onStopSpeaking}
            />
            {active && !busy && (
              <ComprehensionCard
                check={state.pendingCheck}
                result={state.checkResult}
                onAnswer={(id) => onAnswerCheck?.(id)}
                onRetry={onRetryCheck}
              />
            )}
          </div>
        ) : active && busy ? null : (
          <p className="nemo-chat__muted">Ask a follow-up or open the visual canvas to continue.</p>
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
  className = '',
  autoFocus = true,
  turns: propTurns,
  voiceEnabled = false,
  onToggleVoice,
  onSpeak,
  onStopSpeaking,
  speaking = false,
  onAnswerCheck,
  onRetryCheck,
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
    if (!question) return;
    setPendingQuestion(question);
    onAsk(question);
  };

  const empty = turns.length === 0 && !pendingQuestion;

  return (
    <main className={`nemo-chat ${className}`.trim()} aria-label="NEMO chat workspace">
      <style>{CHAT_WORKSPACE_STYLES}</style>

      <div
        className={`nemo-chat__viewport${empty ? ' nemo-chat__viewport--empty' : ''}`}
        ref={scrollRef}
      >
        {empty ? (
          <section className="nemo-chat__hero-openai" aria-label="NEMO AI assistant">
            <div className="nemo-chat__hero-mascot">
              <NemoMascot
                size={78}
                state={busy ? 'thinking' : 'idle'}
                showBubble={true}
                bubbleText={busy ? 'Thinking…' : 'Ask me anything'}
                bubbleSubtitle={busy ? (state.steps[state.steps.length - 1]?.label || 'Working…') : "Not to worry, I’m NEMO!"}
                animated={true}
              />
            </div>
            <div className="nemo-chat__hero-composer-wrap">
              <div className="nemo-chat__composer-shell">
                <PixelShineBorder />
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
                    onSpeak={onSpeak}
                    onStopSpeaking={onStopSpeaking}
                    speaking={speaking}
                    onAnswerCheck={onAnswerCheck}
                    onRetryCheck={onRetryCheck}
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
                  <div className="nemo-chat__assistant-avatar"><ChatMark compact busy /></div>
                  <div className="nemo-chat__response">
                    <ThoughtProcess steps={[]} sources={[]} detail="Connecting…" busy />
                  </div>
                </article>
              </div>
            )}
          </section>
        )}
      </div>

      {!empty && (
        <div className="nemo-chat__composer-region">
          <div className="nemo-chat__composer-shell">
            <PixelShineBorder />
            <ModernComposer
              onSubmit={handleComposerSubmit}
              onStop={onStop}
              busy={busy}
              placeholder="Ask a follow-up or explore a new concept…"
              voiceEnabled={voiceEnabled}
              onToggleVoice={onToggleVoice}
            />
          </div>
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
/* The generic icon rule above must never collapse the full mascot artwork or marks. */
.nemo-chat .nemo-mascot-svg,
.nemo-chat .nemo-pixel-mascot__svg,
.nemo-chat .nemo-round-mascot svg,
.nemo-chat .nemo-orb-mark svg,
.nemo-chat .nemo-mark svg { width: 100%; height: 100%; stroke: none; }

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
/* Empty state: the composer is the only thing on the page, so it sits in the
   middle of it. A margin of auto cannot centre vertically inside a plain
   block, which is why the hero used to ride at the top of the viewport. */
.nemo-chat__viewport--empty { display: flex; flex-direction: column; justify-content: center; }


.nemo-chat__conversation { width: min(850px, calc(100% - 42px)); margin: 0 auto; padding: 96px 0 190px; }
.nemo-chat__turn + .nemo-chat__turn { margin-top: 46px; padding-top: 38px; border-top: 1px solid var(--border-subtle); }
.nemo-chat__user-row { display: flex; justify-content: flex-end; align-items: flex-end; gap: 10px; margin-bottom: 30px; }
/* The two speakers are inverted cards: the person writes on white, NEMO
   answers on the room's own near-black. Nothing else distinguishes them, and
   nothing else needs to. */
.nemo-chat__user-message { max-width: min(680px, 82%); padding: 12px 16px; border: 1px solid #ffffff; border-radius: 18px 18px 4px 18px; background: #ffffff; color: #101010; font-size: 14px; font-weight: 500; line-height: 1.55; white-space: pre-wrap; box-shadow: 0 6px 20px rgba(0,0,0,.35); }
.nemo-chat__bubble { max-width: min(780px, 100%); padding: 20px 22px 22px; border: 1px solid rgba(255,255,255,.075); border-radius: 22px; background: linear-gradient(145deg, #292929, #232323); color: #fff; font-size: 15.5px; line-height: 1.7; box-shadow: 0 16px 44px rgba(0,0,0,.24); }
.nemo-chat__bubble-head { display: flex; align-items: center; gap: 10px; margin-bottom: 16px; padding-bottom: 13px; border-bottom: 1px solid rgba(255,255,255,.07); }
.nemo-chat__bubble-head > span { color: #fff; font-size: 12px; font-weight: 760; letter-spacing: .08em; }
.nemo-chat__bubble-head > small { color: #8d8d8d; font-size: 11px; }
.nemo-chat__bubble-output { color: #f5f5f5; }
.nemo-chat__bubble p { margin: 0 0 12px; }
.nemo-chat__bubble p:last-child { margin-bottom: 0; }
.nemo-response-actions { position: relative; display: flex; align-items: center; gap: 5px; margin-top: 18px; padding-top: 13px; border-top: 1px solid rgba(255,255,255,.07); }
.nemo-response-actions button { width: 36px; height: 36px; display: grid; place-items: center; padding: 0; border: 0; border-radius: 10px; background: transparent; color: #a7a7a7; cursor: pointer; transition: color .16s ease, background .16s ease, transform .16s ease; }
.nemo-response-actions button:hover { color: #fff; background: rgba(255,255,255,.08); transform: translateY(-1px); }
.nemo-response-actions button.is-active { color: #b69aff; background: rgba(160,124,254,.14); }
.nemo-response-actions button.is-success { color: #7ee2aa; }
.nemo-response-actions button svg { width: 18px; height: 18px; }
.nemo-response-actions__notice { margin-left: 4px; color: #9fdaaF; font-size: 11px; animation: nemo-status-slide-up .18s ease; }
.nemo-chat__assistant { display: flex; align-items: flex-start; gap: 14px; }
.nemo-chat__assistant-avatar { display: flex; flex: none; margin-top: 2px; }
.nemo-chat__response { min-width: 0; flex: 1; color: var(--text-primary); font-size: 15px; line-height: 1.75; }

.nemo-chat__response p { margin: 0 0 14px; white-space: pre-wrap; }
.nemo-chat__stream-tag { margin-top: 1px; padding: 1px 6px; border: 1px solid var(--border-default); border-radius: 999px; color: var(--nemo-chat-accent); font-size: 8px; letter-spacing: .08em; text-transform: uppercase; }
.nemo-chat__muted { color: var(--nemo-chat-muted); }
.nemo-chat__cursor { width: 2px; height: 1.05em; display: inline-block; vertical-align: -.12em; margin-left: 2px; border-radius: 1px; background: var(--nemo-chat-accent); animation: nemo-chat-blink .9s steps(2, start) infinite; }

.nemo-chat__thinking { width: 156px; height: 134px; display: flex; align-items: center; justify-content: center; margin: -18px 0 -8px -20px; overflow: visible; }
.nemo-chat__thinking .nemo-mascot-wrapper { flex: none; }

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
/* The composer itself always takes input — the region above it is only a
   gradient, and turning its pointer events off used to make the bar inert. */
.nemo-chat__composer-region .modern-composer { pointer-events: auto; }
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
.nemo-chat textarea:focus-visible,
.nemo-chat input:focus-visible { outline: 1px solid var(--border-strong); outline-offset: 2px; }
.nemo-chat .modern-composer input:focus-visible { outline: none; }


/* ------------------------------------------------------ Claude-style thought process */
.claude-thought {
  margin: 6px 0 14px;
}

.claude-thought__header {
  all: unset;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  padding: 4px 0;
  user-select: none;
}

.claude-thought__status {
  font-size: 13.5px;
  font-weight: 500;
  color: #c9cdd4;
  letter-spacing: 0.01em;
}

.claude-thought__toggle-arrow {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.claude-thought__arrow-label {
  font-size: 13px;
  font-weight: 450;
  color: var(--text-tertiary, #8a8f98);
  transition: color 0.15s ease;
}

.claude-thought__header:hover .claude-thought__arrow-label,
.claude-thought__header:hover .claude-thought__status {
  color: var(--text-primary, #e8ecf2);
}

.claude-thought__caret {
  transition: transform 0.2s ease;
  opacity: 0.75;
  color: var(--text-tertiary, #8a8f98);
}

.claude-thought__sources-badge {
  font-size: 11px;
  color: var(--text-tertiary, #888);
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.claude-thought__body {
  margin-top: 8px;
  padding: 12px 16px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  color: #9da3af;
  font-size: 13px;
  line-height: 1.55;
  animation: nemo-thought-open 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  max-width: min(680px, 100%);
}

.claude-thought__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 8px;
}

.claude-thought__list li {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.claude-thought__step-bullet {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  font-size: 10px;
  color: #8dceaa;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 2px;
}

.claude-thought__list li.is-current .claude-thought__step-bullet {
  color: #c7b5ff;
  background: rgba(160, 124, 254, 0.15);
}

.claude-thought__step-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.claude-thought__step-label {
  font-weight: 550;
  color: #d1d5db;
}

.claude-thought__step-detail {
  font-size: 12px;
  color: #808693;
}

.claude-thought__detail-text {
  margin: 0;
  color: #9da3af;
}

.claude-thought__sources-section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.claude-thought__sources-title {
  display: block;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-tertiary, #777);
  margin-bottom: 6px;
}

.claude-thought__sources-grid {
  display: grid;
  gap: 6px;
}

.claude-thought__source-link {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 8px;
  color: var(--text-secondary);
  text-decoration: none;
  font-size: 12px;
}

.claude-thought__source-link:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-primary);
}

.claude-thought__source-host {
  color: #7ab7ff;
  font-size: 11px;
}

.claude-thought__source-title {
  color: #aaa;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.claude-spark.is-animated {
  animation: claude-spark-pulse 2s ease-in-out infinite;
}

.claude-spark__spokes {
  transform-origin: 12px 12px;
  animation: claude-spark-spin 8s linear infinite;
}

@keyframes claude-spark-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@keyframes claude-spark-pulse {
  0%, 100% { opacity: 0.8; transform: scale(1); }
  50% { opacity: 1; transform: scale(1.12); }
}

@keyframes nemo-thought-open {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

/* ----------------------------------------------------------------- videos */
.nemo-videos { margin: 16px 0 4px; }
.nemo-videos h4 { margin: 0 0 8px; color: var(--text-disabled); font-size: 10.5px; font-weight: 650; letter-spacing: .09em; text-transform: uppercase; }
.nemo-videos__row { display: grid; grid-template-columns: repeat(auto-fill, minmax(168px, 1fr)); gap: 10px; }
.nemo-videos__card { display: grid; gap: 5px; padding: 8px; border: 1px solid var(--nemo-chat-border); border-radius: 12px; background: var(--bg-elevated); color: var(--text-secondary); text-decoration: none; transition: border-color .16s ease, transform .16s ease; }
.nemo-videos__card:hover { border-color: var(--nemo-chat-border-strong); transform: translateY(-1px); }
.nemo-videos__thumb { position: relative; display: block; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 8px; background: #000; }
.nemo-videos__thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.nemo-videos__play { position: absolute; inset: 0; display: grid; place-items: center; }
.nemo-videos__play svg { width: 30px; height: 30px; fill: rgba(255,255,255,.92); stroke: none; filter: drop-shadow(0 2px 6px rgba(0,0,0,.6)); }
.nemo-videos__time { position: absolute; right: 5px; bottom: 5px; padding: 1px 5px; border-radius: 4px; background: rgba(0,0,0,.8); color: #fff; font-size: 10px; }
.nemo-videos__title { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: var(--text-primary); font-size: 12px; line-height: 1.35; }
.nemo-videos__channel { color: var(--text-disabled); font-size: 11px; }

/* Floating loading status card/pill directly above chat box */
.nemo-chat__floating-status {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  width: fit-content;
  max-width: 90%;
  margin: 0 auto 12px;
  padding: 6px 14px;
  border-radius: 999px;
  background: rgba(20, 20, 20, 0.9);
  border: 1px solid rgba(255, 255, 255, 0.12);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
  pointer-events: auto;
  animation: nemo-status-slide-up 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.nemo-chat__hero-composer-wrap .nemo-chat__floating-status {
  margin-bottom: 16px;
}

.nemo-chat__status-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #a07cfe;
  flex: none;
  box-shadow: 0 0 8px #a07cfe;
  animation: nemo-status-pulse 1.4s ease-in-out infinite;
}

.nemo-chat__status-label {
  color: var(--text-primary);
  font-size: 12.5px;
  font-weight: 500;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.nemo-chat__status-count {
  padding: 1px 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-tertiary);
  font-size: 11px;
}

.nemo-chat__status-bars {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 12px;
  margin-left: 2px;
}

.nemo-chat__status-bars span {
  width: 2px;
  background: var(--text-tertiary);
  border-radius: 1px;
  animation: nemo-wave-bar 1s ease-in-out infinite;
}

.nemo-chat__status-bars span:nth-child(1) { height: 6px; animation-delay: 0s; }
.nemo-chat__status-bars span:nth-child(2) { height: 11px; animation-delay: 0.2s; }
.nemo-chat__status-bars span:nth-child(3) { height: 8px; animation-delay: 0.4s; }

@keyframes nemo-status-slide-up {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes nemo-status-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.3; transform: scale(0.85); }
}

@keyframes nemo-wave-bar {
  0%, 100% { transform: scaleY(0.5); }
  50% { transform: scaleY(1.2); }
}

/* The composer's shine border needs a positioned host at the same radius. */
.nemo-chat__composer-shell { position: relative; width: min(760px, 100%); margin: 0 auto; border-radius: 999px; pointer-events: auto; }

@keyframes nemo-chat-blink { 50% { opacity: 0; } }
@keyframes nemo-chat-breathe { 0%, 70%, 100% { opacity: .25; transform: translateY(0); } 35% { opacity: 1; transform: translateY(-2px); } }
@keyframes nemo-chat-pulse { 0% { box-shadow: 0 0 0 0 var(--accent-soft); } 70%, 100% { box-shadow: 0 0 0 8px transparent; } }

@media (max-width: 720px) {
  .nemo-chat__topbar { min-height: 58px; padding: 9px 14px; }
  .nemo-chat__topbar-identity > div span { display: none; }
  .nemo-chat__canvas-button { min-height: 36px; padding: 0 10px; }
        .nemo-chat__conversation { width: calc(100% - 28px); padding-top: 84px; }
  .nemo-chat__user-message { max-width: 88%; }
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
