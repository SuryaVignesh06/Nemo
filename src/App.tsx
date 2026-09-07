/**
 * NEMO — the application shell.
 *
 * One layout for the whole product: a persistent sidebar, a minimal top bar
 * carrying the Chat / Visual switch, and a page area features plug into. A new
 * feature adds a view here; it never rebuilds the shell or grows navigation of
 * its own.
 *
 * Chat and Visual are two independent sessions, each with its own lesson
 * state, scene store, and in-flight request. Asking something in one never
 * touches the other — switching views just changes which session is on
 * screen.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BoardCanvas } from './canvas/BoardCanvas.tsx';
import {
  AppSidebar,
  type SidebarConversation,
  type SidebarDestination,
  type SidebarProject,
} from './components/AppSidebar.tsx';
import { AccountDialogs, type DialogName } from './components/AccountDialogs.tsx';
import {
  DEFAULT_PREFERENCES,
  type Appearance,
  type LearningPreferences,
} from './components/accountPreferences.ts';
import { ChatWorkspace, type TurnSnapshot } from './components/ChatWorkspace.tsx';
import { CanvasHud } from './components/CanvasHud.tsx';
import { CanvasAskBar } from './components/CanvasAskBar.tsx';
import { ConfigPanel } from './components/ConfigPanel.tsx';
import { LessonRail } from './components/LessonRail.tsx';
import { StatusStrip } from './components/StatusStrip.tsx';
import { TopBar } from './components/TopBar.tsx';
import { CognitiveTutorPanel } from './components/CognitiveTutorPanel.tsx';
import { Icon } from './components/ui/Icon.tsx';
import { LiveTranscriptionBar } from './components/LiveTranscriptionBar.tsx';
import { LibraryPage } from './components/LibraryPage.tsx';
import { useLesson } from './hooks/useLesson.ts';
import { useSettings } from './hooks/useSettings.ts';

export const RAIL_WIDTH = 380;

const SEARCHABLE_CHATS: readonly SidebarConversation[] = [
  { id: 'esp32-uart', title: 'ESP32 UART Debugging' },
  { id: 'semiconductor-basics', title: 'Semiconductor Basics' },
  { id: 'digital-logic', title: 'Digital Logic Notes' },
  { id: 'mosfet', title: 'How does a MOSFET work?' },
  { id: 'temperature-monitor', title: 'Build ESP32 temperature monitor' },
  { id: 'raspberry-pi-gpio', title: 'Raspberry Pi GPIO' },
  { id: 'pn-junction', title: 'Explain PN junction' },
  { id: 'c-pointers', title: 'C pointers' },
];

const APPEARANCE_KEY = 'nemo.appearance';
const PREFERENCES_KEY = 'nemo.preferences';

function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

/* ------------------------------------------------------------------ search */

function SearchDialog({
  onClose,
  onSelect,
}: {
  onClose(): void;
  onSelect(chat: SidebarConversation): void;
}) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => {
    const key = query.trim().toLowerCase();
    return key
      ? SEARCHABLE_CHATS.filter((chat) => chat.title.toLowerCase().includes(key))
      : SEARCHABLE_CHATS;
  }, [query]);

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="nemo-search"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section
        className="nemo-search__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search conversations"
      >
        <div className="nemo-search__field">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
          />
          <kbd>Esc</kbd>
        </div>
        <div className="nemo-search__results">
          <span className="nemo-search__label">{query ? 'Matches' : 'Recent conversations'}</span>
          {results.length ? (
            results.map((chat) => (
              <button key={chat.id} type="button" onClick={() => onSelect(chat)}>
                <Icon name="chat" size={16} />
                <span>{chat.title}</span>
              </button>
            ))
          ) : (
            <p>No conversations match “{query}”.</p>
          )}
        </div>
      </section>
    </div>
  );
}

/* --------------------------------------------------------------------- app */

export default function App() {
  const { settings, update, updateProvider, updateVoice, providerPayload, hasBrowserKey } =
    useSettings();
  const [view, setView] = useState<SidebarDestination>('chat');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [settingsRequest, setSettingsRequest] = useState(0);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [chatKey, setChatKey] = useState(0);
  const [activeConversationId, setActiveConversationId] = useState<string>();
  const [activeProjectId, setActiveProjectId] = useState<string>();
  const [notice, setNotice] = useState('');
  const [appearance, setAppearance] = useState<Appearance>(
    () => readStored<{ value: Appearance }>(APPEARANCE_KEY, { value: 'dark' }).value
  );
  const [preferences, setPreferences] = useState<LearningPreferences>(() =>
    readStored(PREFERENCES_KEY, DEFAULT_PREFERENCES)
  );

  const [canvasZoom, setCanvasZoom] = useState(1);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [cognitiveOpen, setCognitiveOpen] = useState(false);
  const [turns, setTurns] = useState<TurnSnapshot[]>([]);
  const [annotateMode, setAnnotateMode] = useState(false);
  const [circledLabels, setCircledLabels] = useState<string[]>([]);

  const insets = useCallback(
    (hasLesson: boolean) => ({
      top: 76,
      bottom: 96,
      left: 42,
      right: hasLesson && !railCollapsed ? RAIL_WIDTH + 48 : 48,
    }),
    [railCollapsed]
  );
  /*
   * Two fully independent lesson sessions, not one shared above both views.
   * Asking something in chat must never touch the visual canvas and vice
   * versa — each keeps its own state, scene store, and in-flight request.
   */
  const {
    state: chatState,
    ask: chatAsk,
    cancel: chatCancel,
    reset: chatReset,
    busy: chatBusy,
    answerCheck: chatAnswerCheck,
    retryCheck: chatRetryCheck,
  } = useLesson(settings, providerPayload, insets, 'chat');

  const {
    state: visualState,
    store: visualStore,
    ask: visualAsk,
    cancel: visualCancel,
    busy: visualBusy,
    onManualCamera: visualOnManualCamera,
    answerCheck: visualAnswerCheck,
    retryCheck: visualRetryCheck,
    clearCircledRegion: visualClearCircledRegion,
  } = useLesson(settings, providerPayload, insets, 'visual');

  const activeVoiceState = view === 'canvas' ? visualState : chatState;

  /* Circling is only meaningful once the board has finished drawing —
     while the explanation is still being narrated/drawn there is nothing
     stable yet to circle, and a lasso mid-draw would just fight the
     presenter's own camera moves. */
  const canAnnotate = visualState.stage === 'COMPLETED';
  useEffect(() => {
    if (!canAnnotate && annotateMode) setAnnotateMode(false);
  }, [canAnnotate, annotateMode]);

  useEffect(() => {
    if (!chatState.question) return;
    const current: TurnSnapshot = {
      question: chatState.question,
      answer: chatState.answer,
      chatAnswer: chatState.chatAnswer,
      finalAnswer: chatState.finalAnswer,
      definitions: chatState.definitions,
      sources: chatState.sources,
      videos: chatState.videos,
      steps: chatState.steps,
      error: chatState.error,
    };
    setTurns((prev) => {
      const idx = prev.findIndex((t) => t.question === current.question);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = current;
        return copy;
      }
      return [...prev, current];
    });
  }, [chatState.question, chatState.answer, chatState.finalAnswer, chatState.definitions, chatState.error]);

  /* Appearance is a document-level concern: one attribute, whole app. */
  useEffect(() => {
    document.documentElement.dataset.appearance = appearance;
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify({ value: appearance }));
    } catch {
      // Private browsing: the choice simply does not persist.
    }
  }, [appearance]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
    } catch {
      // As above.
    }
  }, [preferences]);

  const navigate = useCallback((destination: SidebarDestination) => {
    setView(destination);
    setSidebarOpen(false);
  }, []);

  const newChat = useCallback(() => {
    chatReset();
    setTurns([]);
    setChatKey((key) => key + 1);
    setActiveConversationId(undefined);
    setActiveProjectId(undefined);
    setView('chat');
    setSidebarOpen(false);
  }, [chatReset]);

  const askFresh = useCallback(
    (prompt: string, conversationId?: string) => {
      const nextSessionId = chatReset();
      setChatKey((key) => key + 1);
      setActiveConversationId(conversationId);
      setActiveProjectId(undefined);
      setView('chat');
      setSearchOpen(false);
      setSidebarOpen(false);
      requestAnimationFrame(() => chatAsk(prompt, nextSessionId));
    },
    [chatAsk, chatReset]
  );

  const openConversation = useCallback(
    (chat: SidebarConversation) => askFresh(chat.title, chat.id),
    [askFresh]
  );

  const openProject = useCallback(
    (project: SidebarProject) => {
      newChat();
      setActiveProjectId(project.id);
      setNotice(`${project.title} selected`);
    },
    [newChat]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'n') {
        event.preventDefault();
        newChat();
      } else if (key === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (key === 'b') {
        event.preventDefault();
        setCollapsed((value) => !value);
      } else if (key === 'l') {
        event.preventDefault();
        setShowLog((value) => !value);
      } else if (key === '/') {
        event.preventDefault();
        setDialog('shortcuts');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [newChat]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 2400);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const openSettings = useCallback(() => {
    setSettingsRequest((value) => value + 1);
    setSidebarOpen(false);
  }, []);

  const account = useMemo(
    () => ({
      user: { name: 'Surya Vignesh', email: 'surya@nemo.ai' },
      appearance,
      onAppearanceChange: setAppearance,
      onSettings: openSettings,
      onAccount: () => setDialog('account'),
      onPersonalization: () => setDialog('personalization'),
      onKeyboardShortcuts: () => setDialog('shortcuts'),
      onHelp: () => setDialog('help'),
      onFeedback: () => setDialog('feedback'),
      onAbout: () => setDialog('about'),
      onSignOut: () => setDialog('signout'),
    }),
    [appearance, openSettings]
  );

  const mode = view === 'canvas' ? 'canvas' : 'chat';

  return (
    <div className={`nemo-shell nemo-shell--${view}`}>
      <AppSidebar
        open={sidebarOpen}
        collapsed={collapsed}
        activeDestination={view}
        activeConversationId={activeConversationId}
        activeProjectId={activeProjectId}
        account={account}
        onClose={() => setSidebarOpen(false)}
        onToggleCollapsed={() => setCollapsed((value) => !value)}
        onNewChat={newChat}
        onSearch={() => {
          setSearchOpen(true);
          setSidebarOpen(false);
        }}
        onSelectConversation={openConversation}
        onSelectProject={openProject}
        onNavigate={navigate}
      />
      {sidebarOpen && (
        <button
          className="nemo-scrim"
          aria-label="Close navigation"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="nemo-main">
        <TopBar
          mode={mode}
          onModeChange={(next) => navigate(next === 'canvas' ? 'canvas' : 'chat')}
          onOpenMenu={() => setSidebarOpen(true)}
          onNewChat={newChat}
          onOpenSettings={openSettings}
          onToggleCognitivePanel={() => setCognitiveOpen((v) => !v)}
          isCognitiveOpen={cognitiveOpen}
          configSlot={
            <ConfigPanel
              settings={settings}
              update={update}
              updateProvider={updateProvider}
              updateVoice={updateVoice}
              voiceStatus={activeVoiceState.voiceStatus}
              voiceDetail={activeVoiceState.voiceDetail}
              hasBrowserKey={hasBrowserKey}
              openRequest={settingsRequest}
            />
          }
        />

        <CognitiveTutorPanel isOpen={cognitiveOpen} onClose={() => setCognitiveOpen(false)} />

        <div className="nemo-page">
          {view === 'chat' && (
            <ChatWorkspace
              key={chatKey}
              state={chatState}
              busy={chatBusy}
              onAsk={chatAsk}
              onStop={chatCancel}
              onOpenCanvas={() => navigate('canvas')}
              turns={turns}
              voiceEnabled={settings.voiceEnabled}
              onToggleVoice={() => update({ voiceEnabled: !settings.voiceEnabled })}
              onAnswerCheck={chatAnswerCheck}
              onRetryCheck={chatRetryCheck}
            />
          )}

          {view === 'canvas' && (
            <main
              className={`canvas-stage app ${visualState.stage === 'IDLE' ? 'app--hero' : 'app--lesson'} ${railCollapsed ? 'canvas-stage--rail-collapsed' : ''}`}
              aria-label="NEMO visual canvas"
            >
              <BoardCanvas
                store={visualStore}
                drawing={visualState.stage === 'DRAWING'}
                onManualCamera={visualOnManualCamera}
                onZoomChange={setCanvasZoom}
                annotateMode={annotateMode}
                onRegionSelected={(labels) => {
                  setCircledLabels(labels);
                  setAnnotateMode(false);
                }}
              />

              <LiveTranscriptionBar state={visualState} busy={visualBusy} />

              {visualState.stage === 'IDLE' ? (
                <CanvasAskBar
                  onAsk={visualAsk}
                  onStop={visualCancel}
                  busy={visualBusy}
                  voiceEnabled={settings.voiceEnabled}
                  onToggleVoice={() => update({ voiceEnabled: !settings.voiceEnabled })}
                />
              ) : (
                <div className="canvas-dock">
                  <CanvasAskBar
                    compact
                    onAsk={(question) => {
                      setCircledLabels([]);
                      visualAsk(question);
                    }}
                    onStop={visualCancel}
                    busy={visualBusy}
                    voiceEnabled={settings.voiceEnabled}
                    onToggleVoice={() => update({ voiceEnabled: !settings.voiceEnabled })}
                    circledLabels={circledLabels}
                    onClearCircled={() => {
                      visualClearCircledRegion();
                      setCircledLabels([]);
                    }}
                  />
                  {!railCollapsed && (
                    <LessonRail
                      state={visualState}
                      busy={visualBusy}
                      onAnswerCheck={visualAnswerCheck}
                      onRetryCheck={visualRetryCheck}
                      onAskFollowup={(q) => visualAsk(q)}
                    />
                  )}
                </div>
              )}

              <CanvasHud
                store={visualStore}
                zoom={canvasZoom}
                onManualCamera={visualOnManualCamera}
                hasLesson={visualState.stage !== 'IDLE'}
                railOpen={!railCollapsed}
                onToggleRail={() => setRailCollapsed((c) => !c)}
                annotateMode={annotateMode}
                canAnnotate={canAnnotate}
                onToggleAnnotate={() => setAnnotateMode((v) => !v)}
              />

              <StatusStrip
                state={visualState}
                showLog={showLog}
                onDemoMode={() => {
                  update({ provider: 'mock' });
                  visualAsk(visualState.question || 'Explain binary search.');
                }}
              />
            </main>
          )}

          {view === 'library' && <LibraryPage />}
        </div>

        {notice && (
          <div className="nemo-toast" role="status">
            {notice}
          </div>
        )}
      </div>

      {searchOpen && (
        <SearchDialog onClose={() => setSearchOpen(false)} onSelect={openConversation} />
      )}

      <AccountDialogs
        open={dialog}
        onClose={() => setDialog(null)}
        user={account.user}
        appearance={appearance}
        onAppearanceChange={setAppearance}
        preferences={preferences}
        onPreferencesChange={setPreferences}
        onOpenSettings={openSettings}
        onSignOut={() => setNotice('Local mode: there is no account session to end')}
      />
    </div>
  );
}
