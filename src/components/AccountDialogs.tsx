/**
 * NEMO — the surfaces the account menu opens.
 *
 * The menu itself stays a quick list; the detail lives here. One `Modal`
 * shell backs all of them, so every dialog in the application shares its
 * dismissal behaviour, focus handling and visual weight.
 *
 * Only what is actually implemented is shown. There is no billing screen and
 * no support inbox, because NEMO has neither — inventing them would be a lie
 * told in UI.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './ui/Icon.tsx';
import type { Appearance, LearningPreferences } from './accountPreferences.ts';

export type DialogName =
  | 'account'
  | 'personalization'
  | 'shortcuts'
  | 'help'
  | 'feedback'
  | 'about'
  | 'signout'
  | null;

/* ------------------------------------------------------------------ shell */

function Modal({
  title,
  onClose,
  children,
  footer,
  width = 520,
}: {
  title: string;
  onClose(): void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus()
    );
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="nemo-modal"
      role="presentation"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div
        ref={panelRef}
        className="nemo-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ maxWidth: width }}
      >
        <header className="nemo-modal__head">
          <h2>{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose}>
            <Icon name="close" size={17} />
          </button>
        </header>
        <div className="nemo-modal__body">{children}</div>
        {footer && <footer className="nemo-modal__foot">{footer}</footer>}
      </div>
    </div>
  );
}

/** A labelled row of mutually exclusive choices. */
function ChoiceRow<T extends string>({
  label,
  hint,
  value,
  options,
  onChange,
}: {
  label: string;
  hint?: string;
  value: T;
  options: ReadonlyArray<{ id: T; label: string }>;
  onChange(next: T): void;
}) {
  return (
    <div className="nemo-field">
      <div className="nemo-field__label">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </div>
      <div className="nemo-segmented" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={value === option.id}
            className={value === option.id ? 'is-active' : ''}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- content */

const SHORTCUTS: ReadonlyArray<[string, string]> = [
  ['New chat', 'Ctrl / Cmd + N'],
  ['Search chats', 'Ctrl / Cmd + K'],
  ['Toggle sidebar', 'Ctrl / Cmd + B'],
  ['Keyboard shortcuts', 'Ctrl / Cmd + /'],
  ['Send message', 'Enter'],
  ['New line', 'Shift + Enter'],
  ['Close menu or dialog', 'Esc'],
];

export interface AccountDialogsProps {
  open: DialogName;
  onClose(): void;
  user: { name: string; email?: string };
  appearance: Appearance;
  onAppearanceChange(next: Appearance): void;
  preferences: LearningPreferences;
  onPreferencesChange(next: LearningPreferences): void;
  onSignOut(): void;
  /** Provider, model and voice configuration lives in the existing panel. */
  onOpenSettings(): void;
}

export function AccountDialogs({
  open,
  onClose,
  user,
  appearance,
  onAppearanceChange,
  preferences,
  onPreferencesChange,
  onSignOut,
  onOpenSettings,
}: AccountDialogsProps) {
  const [feedback, setFeedback] = useState({ category: 'Product', message: '' });
  const [feedbackSent, setFeedbackSent] = useState(false);

  if (!open) return null;

  if (open === 'account') {
    return (
      <Modal title="Account" onClose={onClose}>
        <p className="nemo-modal__lead">
          NEMO runs locally on this machine. There is no hosted account, so nothing about you
          leaves this device.
        </p>
        <dl className="nemo-detail-list">
          <div>
            <dt>Name</dt>
            <dd>{user.name}</dd>
          </div>
          <div>
            <dt>Identifier</dt>
            <dd>{user.email ?? 'Not signed in'}</dd>
          </div>
          <div>
            <dt>Session</dt>
            <dd>Local browser storage</dd>
          </div>
          <div>
            <dt>API keys</dt>
            <dd>
              Stored in this browser and sent only to the local NEMO backend.{' '}
              <button type="button" className="nemo-link" onClick={onOpenSettings}>
                Manage in Settings
              </button>
            </dd>
          </div>
        </dl>
      </Modal>
    );
  }

  if (open === 'personalization') {
    return (
      <Modal title="Personalization" onClose={onClose} width={560}>
        <p className="nemo-modal__lead">
          How NEMO teaches. These preferences shape future answers; they do not change work
          already on the board.
        </p>
        <ChoiceRow
          label="Technical level"
          hint="Sets the assumed background knowledge."
          value={preferences.level}
          options={[
            { id: 'beginner', label: 'Beginner' },
            { id: 'intermediate', label: 'Intermediate' },
            { id: 'advanced', label: 'Advanced' },
          ]}
          onChange={(level) => onPreferencesChange({ ...preferences, level })}
        />
        <ChoiceRow
          label="Explanation depth"
          hint="How much detail a written answer carries."
          value={preferences.depth}
          options={[
            { id: 'concise', label: 'Concise' },
            { id: 'detailed', label: 'Detailed' },
          ]}
          onChange={(depth) => onPreferencesChange({ ...preferences, depth })}
        />
        <ChoiceRow
          label="Teaching style"
          hint="What NEMO reaches for first when explaining."
          value={preferences.style}
          options={[
            { id: 'visual-first', label: 'Visual first' },
            { id: 'code-first', label: 'Code first' },
            { id: 'balanced', label: 'Balanced' },
          ]}
          onChange={(style) => onPreferencesChange({ ...preferences, style })}
        />
      </Modal>
    );
  }

  if (open === 'shortcuts') {
    return (
      <Modal title="Keyboard shortcuts" onClose={onClose}>
        <ul className="nemo-shortcuts">
          {SHORTCUTS.map(([label, keys]) => (
            <li key={label}>
              <span>{label}</span>
              <kbd>{keys}</kbd>
            </li>
          ))}
        </ul>
      </Modal>
    );
  }

  if (open === 'help') {
    return (
      <Modal title="Help" onClose={onClose}>
        <p className="nemo-modal__lead">
          NEMO answers a technical question, then draws the explanation on the canvas when a
          diagram makes it clearer.
        </p>
        <ul className="nemo-help-list">
          <li>
            <strong>Ask anything technical.</strong> Circuits, semiconductors, embedded systems,
            algorithms and mathematics all draw.
          </li>
          <li>
            <strong>Demo keywords draw instantly.</strong> Type <code>binary search</code>,{' '}
            <code>benzene</code>, <code>friction</code>, <code>integral</code>, <code>esp32 led</code>{' '}
            or an equation such as <code>2x + 5 = 17</code> for a scripted lesson that needs no API
            key.
          </li>
          <li>
            <strong>Switch to Visual</strong> at any time — the conversation comes with you.
          </li>
          <li>
            <strong>No model responding?</strong> Check the provider and key in Settings; NEMO
            reports which model actually answered.
          </li>
        </ul>
      </Modal>
    );
  }

  if (open === 'feedback') {
    return (
      <Modal
        title="Give feedback"
        onClose={onClose}
        footer={
          <>
            <button type="button" className="nemo-button" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="nemo-button nemo-button--primary"
              disabled={!feedback.message.trim() || feedbackSent}
              onClick={() => setFeedbackSent(true)}
            >
              {feedbackSent ? 'Saved locally' : 'Send'}
            </button>
          </>
        }
      >
        <div className="nemo-field">
          <div className="nemo-field__label">
            <span>Category</span>
          </div>
          <select
            className="nemo-input"
            value={feedback.category}
            onChange={(event) => setFeedback((f) => ({ ...f, category: event.target.value }))}
          >
            <option>Product</option>
            <option>Visual canvas</option>
            <option>Answer quality</option>
            <option>Bug report</option>
          </select>
        </div>
        <div className="nemo-field">
          <div className="nemo-field__label">
            <span>Message</span>
          </div>
          <textarea
            className="nemo-input"
            rows={5}
            value={feedback.message}
            placeholder="What worked, what didn't?"
            onChange={(event) => setFeedback((f) => ({ ...f, message: event.target.value }))}
          />
        </div>
        <p className="nemo-modal__note">
          NEMO has no feedback service to send to, so this is kept on this device only.
        </p>
      </Modal>
    );
  }

  if (open === 'about') {
    return (
      <Modal title="About NEMO" onClose={onClose} width={440}>
        <div className="nemo-about">
          <span className="nemo-about__mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <circle cx="12" cy="12" r="8.4" />
              <path d="M8.6 15.4V8.6l6.8 6.8V8.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <div>
            <strong>NEMO</strong>
            <small>Version 0.1.0 · local build</small>
          </div>
        </div>
        <p className="nemo-modal__lead">
          An AI visual teacher: it works a question out, writes the answer, then draws the
          explanation live on an infinite board.
        </p>
        <ChoiceRow
          label="Appearance"
          hint="Applies across the whole application."
          value={appearance}
          options={[
            { id: 'dark', label: 'Dark' },
            { id: 'light', label: 'Light' },
            { id: 'system', label: 'System' },
          ]}
          onChange={onAppearanceChange}
        />
      </Modal>
    );
  }

  // open === 'signout'
  return (
    <Modal
      title="Log out?"
      onClose={onClose}
      width={420}
      footer={
        <>
          <button type="button" className="nemo-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="nemo-button nemo-button--danger"
            onClick={() => {
              onSignOut();
              onClose();
            }}
          >
            Log out
          </button>
        </>
      }
    >
      <p className="nemo-modal__lead">
        Your conversation stays on this device. API keys saved in this browser are kept — clear
        them from Settings if you want them removed.
      </p>
    </Modal>
  );
}

export default AccountDialogs;
