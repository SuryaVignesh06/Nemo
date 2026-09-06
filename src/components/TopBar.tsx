/**
 * NEMO — the top bar.
 *
 * Minimal by contract: the mode switch sits in the centre and nothing else
 * competes with it. Chat and Visual are two views of one session, so the
 * switch is chrome that never unmounts — moving between them keeps the
 * conversation rather than navigating away from it.
 */

import { Icon } from './ui/Icon.tsx';

export type WorkspaceMode = 'chat' | 'canvas';

interface Props {
  mode: WorkspaceMode;
  onModeChange(mode: WorkspaceMode): void;
  /** Shown on the Visual tab once a lesson has been drawn. */
  visualReady?: boolean;
  onOpenMenu?(): void;
  onNewChat?(): void;
  onOpenSettings?(): void;
}

export function TopBar({ mode, onModeChange, visualReady, onOpenMenu, onNewChat, onOpenSettings: _onOpenSettings }: Props) {
  return (
    <header className="nemo-topbar">
      <button
        className="nemo-topbar__menu"
        type="button"
        aria-label="Open navigation"
        onClick={onOpenMenu}
      >
        <Icon name="menu" />
      </button>

      <div className="nemo-topbar__switch" role="tablist" aria-label="Workspace mode">
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
          <Icon name="sparkle" size={15} />
          <span>Visual</span>
          {visualReady && <span className="nemo-topbar__dot" aria-label="A visual is ready" />}
        </button>
      </div>

      <div className="nemo-topbar__actions">
        {onNewChat && (
          <button
            className="nemo-topbar__action"
            type="button"
            aria-label="New chat"
            title="New chat (Ctrl N)"
            onClick={onNewChat}
          >
            <Icon name="plus" />
          </button>
        )}
      </div>
    </header>
  );
}

export default TopBar;
