/**
 * NEMO — the one global sidebar.
 *
 * Every destination in the application hangs off this component; features plug
 * into the page area rather than growing navigation of their own.
 *
 * Deliberately short: New chat, Visual canvas, Search, Library, then the account control.
 * Fake history has been removed.
 *
 * Brand mark uses the authentic animated pixel NemoMark.
 * When collapsed, hovering over the brand logo reveals the expand button.
 */

import { AccountMenu, type AccountMenuProps } from './AccountMenu.tsx';
import { Icon, type IconName } from './ui/Icon.tsx';
import { NemoMark } from './ui/NemoMark.tsx';

export type SidebarDestination = 'chat' | 'canvas' | 'library';

export interface SidebarConversation {
  id: string;
  title: string;
}

export interface SidebarProject {
  id: string;
  title: string;
  chatCount: number;
}

export interface AppSidebarProps {
  /** Controls the drawer state on narrow screens; desktop navigation is persistent. */
  open?: boolean;
  collapsed?: boolean;
  activeDestination?: SidebarDestination;
  activeConversationId?: string;
  activeProjectId?: string;
  projects?: readonly SidebarProject[];
  pinnedChats?: readonly SidebarConversation[];
  recentChats?: readonly SidebarConversation[];
  account: AccountMenuProps;
  onClose?: () => void;
  onToggleCollapsed?: () => void;
  onNewChat?: () => void;
  onSearch?: () => void;
  onSelectProject?: (project: SidebarProject) => void;
  onSelectConversation?: (conversation: SidebarConversation) => void;
  onNavigate?: (destination: SidebarDestination) => void;
}

export function AppSidebar({
  open = false,
  collapsed = false,
  activeDestination = 'chat',
  activeConversationId: _activeConversationId,
  activeProjectId: _activeProjectId,
  projects: _projects = [],
  pinnedChats: _pinnedChats = [],
  recentChats: _recentChats = [],
  account,
  onClose,
  onToggleCollapsed,
  onNewChat,
  onSearch,
  onSelectProject: _onSelectProject,
  onSelectConversation: _onSelectConversation,
  onNavigate,
}: AppSidebarProps) {
  /** A row that shows only its icon when the rail is collapsed. */
  const navRow = (
    icon: IconName,
    label: string,
    onClick?: () => void,
    options: { active?: boolean; shortcut?: string } = {}
  ) => (
    <button
      className={`nemo-nav__row ${options.active ? 'is-active' : ''}`}
      type="button"
      onClick={onClick}
      aria-current={options.active ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? label : undefined}
    >
      <Icon name={icon} pixel size={18} />
      {!collapsed && (
        <>
          <span className="nemo-nav__label">{label}</span>
          {options.shortcut && <kbd>{options.shortcut}</kbd>}
        </>
      )}
    </button>
  );

  return (
    <aside
      className={`nemo-nav ${open ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}
      aria-label="NEMO navigation"
    >
      <div className="nemo-nav__top">
        <button
          className="nemo-nav__brand"
          type="button"
          aria-label={collapsed ? 'Expand sidebar (Ctrl B)' : 'NEMO visual canvas'}
          title={collapsed ? 'Expand sidebar (Ctrl B)' : 'NEMO'}
          onClick={collapsed ? onToggleCollapsed : () => onNavigate?.('chat')}
        >
          <span className="nemo-nav__mark" aria-hidden="true">
            <NemoMark size={26} animated />
          </span>
          {collapsed && (
            <span className="nemo-nav__expand-hover" aria-hidden="true">
              <Icon name="panel" pixel size={18} />
            </span>
          )}
          {!collapsed && <span className="nemo-nav__wordmark">NEMO</span>}
        </button>

        {!collapsed && (
          <button
            className="nemo-nav__icon-button nemo-nav__collapse"
            type="button"
            aria-label="Collapse sidebar"
            title="Collapse sidebar (Ctrl B)"
            onClick={onToggleCollapsed}
          >
            <Icon name="panel" pixel size={18} />
          </button>
        )}

        <button
          className="nemo-nav__icon-button nemo-nav__close"
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
        >
          <Icon name="close" pixel size={18} />
        </button>
      </div>

      <div className="nemo-nav__primary">
        {navRow('chat', 'Chat', () => onNavigate?.('chat'), {
          active: activeDestination === 'chat',
        })}
        {navRow('canvas', 'Visual canvas', () => onNavigate?.('canvas'), {
          active: activeDestination === 'canvas',
        })}
        {navRow('plus', 'New chat', onNewChat, { shortcut: 'Ctrl N' })}
        {navRow('search', 'Search', onSearch, { shortcut: 'Ctrl K' })}
        {navRow('library', 'Library', () => onNavigate?.('library'), {
          active: activeDestination === 'library',
        })}
      </div>

      <div className="nemo-nav__panel-badge" aria-hidden="true">
        <img
          src="/nemo-sidebar-badge.png"
          alt=""
          className="nemo-nav__panel-badge-img"
        />
      </div>

      <div className="nemo-nav__footer">
        <AccountMenu {...account} collapsed={collapsed} />
      </div>
    </aside>
  );
}

export default AppSidebar;
