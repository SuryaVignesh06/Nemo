/**
 * NEMO — the account menu.
 *
 * One component, used wherever the profile button appears, so Chat and the
 * Visual Canvas open the identical menu rather than two that drift apart.
 *
 * It is a *quick* menu, not a settings dashboard: each entry either performs a
 * small action or opens the surface that owns the detail. Anything that cannot
 * be undone asks first.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './ui/Icon.tsx';
import type { Appearance } from './accountPreferences.ts';

export interface AccountUser {
  name: string;
  email?: string;
  avatarUrl?: string;
}

export interface AccountMenuProps {
  user: AccountUser;
  appearance: Appearance;
  onAppearanceChange(next: Appearance): void;
  /** Opens the provider/voice configuration panel. */
  onSettings(): void;
  onAccount(): void;
  onPersonalization(): void;
  onKeyboardShortcuts(): void;
  onHelp(): void;
  onFeedback(): void;
  onAbout(): void;
  onSignOut(): void;
  /** Rendered inside the sidebar footer; collapsed hides the name and email. */
  collapsed?: boolean;
}

/** Gap between the trigger and the menu, and the margin kept off the window. */
const MENU_GAP = 8;
const MENU_EDGE = 8;
const MENU_WIDTH = 268;

function initialsFor(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join('') || 'N'
  );
}

const APPEARANCES: ReadonlyArray<{ id: Appearance; label: string }> = [
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
  { id: 'system', label: 'System' },
];

export function AccountMenu({
  user,
  appearance,
  onAppearanceChange,
  onSettings,
  onAccount,
  onPersonalization,
  onKeyboardShortcuts,
  onHelp,
  onFeedback,
  onAbout,
  onSignOut,
  collapsed = false,
}: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  /*
   * The menu is portalled to the body rather than left inside the sidebar.
   *
   * The sidebar clips its overflow — it has to, so a long chat title cannot
   * spill across the page — and that clipped every menu wider than the rail
   * straight down its right edge. Out at the body it is placed in viewport
   * pixels against the trigger's rect instead, which nothing can trim.
   */
  const [anchor, setAnchor] = useState<{ left: number; bottom: number }>();

  const close = (returnFocus = true) => {
    setOpen(false);
    setAppearanceOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };

  const place = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    setAnchor({
      // Held inside the window, so a narrow viewport shifts it rather than
      // letting it run off the right-hand side.
      left: Math.min(
        Math.max(MENU_EDGE, rect.left),
        Math.max(MENU_EDGE, window.innerWidth - MENU_WIDTH - MENU_EDGE)
      ),
      bottom: Math.max(MENU_EDGE, window.innerHeight - rect.top + MENU_GAP),
    });
  }, []);

  // Placed before paint, so the menu never appears at the previous position
  // for a frame.
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close();
        return;
      }
      // Roving focus: the menu is a list, so arrows walk it.
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      const items = menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
      if (!items?.length) return;
      event.preventDefault();
      const list = Array.from(items);
      const index = list.indexOf(document.activeElement as HTMLElement);
      const next =
        event.key === 'ArrowDown'
          ? list[(index + 1) % list.length]
          : list[(index - 1 + list.length) % list.length];
      next?.focus();
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // Focus the first item so the menu is usable from the keyboard alone.
    requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus()
    );
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const run = (action: () => void) => () => {
    close(false);
    action();
  };

  const item = (name: IconName, label: string, action: () => void, extra?: string) => (
    <button type="button" role="menuitem" className="nemo-account__item" onClick={run(action)}>
      <Icon name={name} size={17} />
      <span>{label}</span>
      {extra && <small>{extra}</small>}
    </button>
  );

  const menu = (
    <div
      id={menuId}
      ref={menuRef}
      className="nemo-account__menu"
      role="menu"
      aria-label="Account"
      style={anchor ? { left: anchor.left, bottom: anchor.bottom } : { visibility: 'hidden' }}
    >
      <div className="nemo-account__header">
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" />
        ) : (
          <span className="nemo-account__avatar" aria-hidden="true">
            {initialsFor(user.name)}
          </span>
        )}
        <div>
          <strong>{user.name}</strong>
          {user.email && <small>{user.email}</small>}
        </div>
      </div>

      <div className="nemo-account__group">
        {item('user', 'Account', onAccount)}
        {item('sparkle', 'Personalization', onPersonalization)}
        {item('settings', 'Settings', onSettings)}

        <button
          type="button"
          role="menuitem"
          className="nemo-account__item"
          aria-expanded={appearanceOpen}
          onClick={() => setAppearanceOpen((value) => !value)}
        >
          <Icon name="appearance" size={17} />
          <span>Appearance</span>
          <small className="nemo-account__value">
            {APPEARANCES.find((a) => a.id === appearance)?.label}
          </small>
          <span className={`nemo-account__caret ${appearanceOpen ? 'is-open' : ''}`}>
            <Icon name="chevron-down" size={15} />
          </span>
        </button>
        {appearanceOpen && (
          <div className="nemo-account__appearance" role="group" aria-label="Appearance">
            {APPEARANCES.map((option) => (
              <button
                key={option.id}
                type="button"
                className={appearance === option.id ? 'is-active' : ''}
                aria-pressed={appearance === option.id}
                onClick={() => onAppearanceChange(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="nemo-account__separator" role="separator" />

      <div className="nemo-account__group">
        {item('keyboard', 'Keyboard shortcuts', onKeyboardShortcuts, 'Ctrl /')}
        {item('help', 'Help', onHelp)}
        {item('feedback', 'Give feedback', onFeedback)}
      </div>

      <div className="nemo-account__separator" role="separator" />
      <div className="nemo-account__group">{item('about', 'About NEMO', onAbout)}</div>

      <div className="nemo-account__separator" role="separator" />
      <div className="nemo-account__group">
        <button
          type="button"
          role="menuitem"
          className="nemo-account__item nemo-account__item--danger"
          onClick={run(onSignOut)}
        >
          <Icon name="logout" size={17} />
          <span>Log out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="nemo-account" ref={wrapRef}>
      {open && createPortal(menu, document.body)}

      <button
        ref={triggerRef}
        type="button"
        className="nemo-account__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={collapsed ? `Account: ${user.name}` : undefined}
        title={collapsed ? user.name : undefined}
        onClick={() => setOpen((value) => !value)}
      >
        {user.avatarUrl ? (
          <img src={user.avatarUrl} alt="" />
        ) : (
          <span className="nemo-account__avatar" aria-hidden="true">
            {initialsFor(user.name)}
          </span>
        )}
        {!collapsed && (
          <>
            <span className="nemo-account__identity">
              <strong>{user.name}</strong>
              {user.email && <small>{user.email}</small>}
            </span>
            <span className="nemo-account__more" aria-hidden="true">
              <Icon name="chevron-down" size={15} />
            </span>
          </>
        )}
      </button>
    </div>
  );
}

export default AccountMenu;
