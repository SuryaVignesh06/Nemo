/**
 * NEMO — the single icon set.
 *
 * One library, one stroke weight, one grid. Every icon in the application
 * comes from here so nothing arrives with a different visual weight; adding a
 * glyph means adding a case, not importing a second icon package.
 *
 * Lucide-shaped: 24×24 viewBox, 1.75 stroke, round caps and joins.
 */

export type IconName =
  | 'about'
  | 'appearance'
  | 'canvas'
  | 'chat'
  | 'chevron-down'
  | 'chevron-right'
  | 'close'
  | 'feedback'
  | 'help'
  | 'keyboard'
  | 'library'
  | 'logout'
  | 'menu'
  | 'panel'
  | 'pin'
  | 'plus'
  | 'project'
  | 'search'
  | 'settings'
  | 'sparkle'
  | 'user';

interface Props {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 18, className }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    className,
  };

  switch (name) {
    case 'about':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6h.01" /></svg>;
    case 'appearance':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor" stroke="none" /></svg>;
    case 'canvas':
      return <svg {...common}><path d="M4 19.5 15.7 7.8" /><path d="m14.4 5.6 4 4" /><path d="m16.2 3.8 4 4" /><path d="M3.5 20.5c1.8-4.2 4.3-3.7 5.8-2.2-1.1 1.8-3.1 3-5.8 2.2Z" /></svg>;
    case 'chat':
      return <svg {...common}><path d="M21 11.5a8.1 8.1 0 0 1-8.5 8 9.6 9.6 0 0 1-3.9-.8L3 20.5l1.7-4.3A8 8 0 1 1 21 11.5Z" /></svg>;
    case 'chevron-down':
      return <svg {...common}><path d="m6 9.5 6 6 6-6" /></svg>;
    case 'chevron-right':
      return <svg {...common}><path d="m9.5 6 6 6-6 6" /></svg>;
    case 'close':
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>;
    case 'feedback':
      return <svg {...common}><path d="M20 14.5a2.5 2.5 0 0 1-2.5 2.5H9l-4 3.5V6.5A2.5 2.5 0 0 1 7.5 4h10A2.5 2.5 0 0 1 20 6.5Z" /><path d="M9 9h6M9 12.5h4" /></svg>;
    case 'help':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 0 1 4.9.6c0 1.7-2.5 2-2.5 3.5" /><path d="M12 17h.01" /></svg>;
    case 'keyboard':
      return <svg {...common}><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8" /></svg>;
    case 'library':
      return <svg {...common}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5z" /></svg>;
    case 'logout':
      return <svg {...common}><path d="M10 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H10" /><path d="m15 8 4 4-4 4M9 12h10" /></svg>;
    case 'menu':
      return <svg {...common}><path d="M4 7h16M4 12h16M4 17h16" /></svg>;
    case 'panel':
      return <svg {...common}><rect x="3" y="4.5" width="18" height="15" rx="2.5" /><path d="M9.5 4.5v15" /></svg>;
    case 'pin':
      return <svg {...common}><path d="M9 4h6l-.8 5.2 3.3 3.3H6.5l3.3-3.3Z" /><path d="M12 12.5V20" /></svg>;
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case 'project':
      return <svg {...common}><path d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.2l2 2H19a1.5 1.5 0 0 1 1.5 1.5v9A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5z" /></svg>;
    case 'search':
      return <svg {...common}><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></svg>;
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
    case 'sparkle':
      return <svg {...common}><path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z" /><path d="M18.5 4v3M20 5.5h-3" /></svg>;
    case 'user':
      return <svg {...common}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.8 20.5a7.4 7.4 0 0 1 14.4 0" /></svg>;
    default:
      return null;
  }
}

export default Icon;
