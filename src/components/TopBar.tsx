/**
/**
 * NEMO — the top bar.
 *
 * Chat and Visual are navigation choices only. Their lesson sessions and state
 * remain completely independent in App.
 */

import { Icon } from './ui/Icon.tsx';

export type WorkspaceMode = 'chat' | 'canvas';

interface Props {
  mode: WorkspaceMode;
  onModeChange(mode: WorkspaceMode): void;
  onOpenMenu?(): void;
  onNewChat?(): void;
  onOpenSettings?(): void;
  onToggleCognitivePanel?(): void;
  isCognitiveOpen?: boolean;
  configSlot?: React.ReactNode;
}

export function TopBar({
  mode,
  onModeChange,
  onOpenMenu,
  onNewChat: _onNewChat,
  onOpenSettings: _onOpenSettings,
  onToggleCognitivePanel,
  isCognitiveOpen,
  configSlot,
}: Props) {
  return (
    <header className="nemo-topbar">
      {/* On the visual canvas the sidebar is hidden outright and this is the
          only way back to it, so it shows an arrow pointing at where the
          drawer will come from rather than the hamburger. */}
      <button
        className="nemo-topbar__menu"
        type="button"
        aria-label="Open navigation"
        title="Open navigation"
        onClick={onOpenMenu}
      >
        <Icon name={mode === 'canvas' ? 'chevron-right' : 'menu'} />
      </button>

      <div className="nemo-topbar__switch" role="tablist" aria-label="Workspace">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'chat'}
          className={mode === 'chat' ? 'is-active' : ''}
          onClick={() => onModeChange('chat')}
        >
          Chat
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'canvas'}
          className={mode === 'canvas' ? 'is-active' : ''}
          onClick={() => onModeChange('canvas')}
        >
          <Icon name="sparkle" size={14} />
          Visual
        </button>
      </div>

      <div className="nemo-topbar__actions">
        {onToggleCognitivePanel && (
          <button
            className={`nemo-topbar__action ${isCognitiveOpen ? 'is-active' : ''}`}
            type="button"
            aria-label="Cognitive AI Tutor & Knowledge Graph"
            title="Cognitive AI Tutor & Knowledge Graph"
            onClick={onToggleCognitivePanel}
          >
            <Icon name="brain" size={16} />
          </button>
        )}
        {configSlot}
      </div>
    </header>
  );
}

export default TopBar;
