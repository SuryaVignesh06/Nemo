/**
 * NEMO — the one global sidebar.
 *
 * Every destination in the application hangs off this component; features plug
 * into the page area rather than growing navigation of their own.
 *
 * Deliberately short: New chat, Search, Library, then Projects, Pinned and
 * Recent, then the account control. Nothing is added because another product
 * has it. Styling lives in shell.css against the global tokens — the private
 * palette this file used to inline was the single largest source of drift.
 */

import { useId, useState, type ReactNode } from 'react';
import { AccountMenu, type AccountMenuProps } from './AccountMenu.tsx';
import { Icon, type IconName } from './ui/Icon.tsx';

export type SidebarDestination = 'chat' | 'canvas' | 'library';

export interface SidebarConversation {
  id: string;
  title: string;
}

export interface SidebarProject {
  id: string;
  title: string;
  /** Any valid CSS colour used for the small project marker. */
  color?: string;
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

const DEFAULT_RECENT: readonly SidebarConversation[] = [
  { id: 'mosfet', title: 'How does a MOSFET work?' },
  { id: 'temperature-monitor', title: 'Build ESP32 temperature monitor' },
  { id: 'raspberry-pi-gpio', title: 'Raspberry Pi GPIO' },
  { id: 'pn-junction', title: 'Explain PN junction' },
  { id: 'c-pointers', title: 'C pointers' },
];

function Section({
  title,
  children,
  hidden,
}: {
  title: string;
  children: ReactNode;
  hidden?: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const regionId = useId();
  if (hidden) return null;

  return (
    <section className="nemo-nav__section">
      <button
        className="nemo-nav__section-toggle"
        type="button"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={() => setExpanded((value) => !value)}
      >
        <span>{title}</span>
        <span className={`nemo-nav__caret ${expanded ? 'is-open' : ''}`}>
          <Icon name="chevron-down" size={14} />
        </span>
      </button>
      <div id={regionId} className="nemo-nav__list" hidden={!expanded}>
        {children}
      </div>
    </section>
  );
}

export function AppSidebar({
  open = false,
  collapsed = false,
  activeDestination = 'chat',
  activeConversationId,
  activeProjectId: _activeProjectId,
  projects: _projects = [],
  pinnedChats: _pinnedChats = [],
  recentChats = DEFAULT_RECENT,
  account,
  onClose,
  onToggleCollapsed,
  onNewChat,
  onSearch,
  onSelectProject: _onSelectProject,
  onSelectConversation,
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
      <Icon name={icon} />
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
          aria-label="NEMO visual canvas"
          onClick={() => onNavigate?.('canvas')}
        >
          <span className="nemo-nav__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="12" r="8.4" />
              <path d="M8.6 15.4V8.6l6.8 6.8V8.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          {!collapsed && <span className="nemo-nav__wordmark">NEMO</span>}
        </button>

        <button
          className="nemo-nav__icon-button nemo-nav__collapse"
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (Ctrl B)`}
          onClick={onToggleCollapsed}
        >
          <Icon name="panel" />
        </button>

        <button
          className="nemo-nav__icon-button nemo-nav__close"
          type="button"
          aria-label="Close navigation"
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      </div>

      <div className="nemo-nav__primary">
        {navRow('plus', 'New chat', onNewChat, { shortcut: 'Ctrl N' })}
        {navRow('canvas', 'Visual canvas', () => onNavigate?.('canvas'), {
          active: activeDestination === 'canvas',
        })}
        {navRow('search', 'Search', onSearch, { shortcut: 'Ctrl K' })}
        {navRow('library', 'Library', () => onNavigate?.('library'), {
          active: activeDestination === 'library',
        })}
      </div>

      <div className="nemo-nav__scroll">
        <Section title="Recent chats" hidden={collapsed}>
          {recentChats.map((chat) => (
            <button
              key={chat.id}
              className={`nemo-nav__row nemo-nav__row--item ${activeConversationId === chat.id ? 'is-active' : ''}`}
              type="button"
              aria-current={activeConversationId === chat.id ? 'page' : undefined}
              onClick={() => onSelectConversation?.(chat)}
              title={chat.title}
            >
              <span className="nemo-nav__label">{chat.title}</span>
            </button>
          ))}
        </Section>
      </div>

      <div className="nemo-nav__footer">
        <AccountMenu {...account} collapsed={collapsed} />
      </div>
    </aside>
  );
}

export default AppSidebar;
