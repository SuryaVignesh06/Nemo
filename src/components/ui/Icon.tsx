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
  | 'brain'
  | 'check'
  | 'canvas'
  | 'chat'
  | 'chevron-down'
  | 'chevron-right'
  | 'close'
  | 'copy'
  | 'feedback'
  | 'help'
  | 'keyboard'
  | 'library'
  | 'logout'
  | 'menu'
  | 'pause'
  | 'panel'
  | 'pin'
  | 'plus'
  | 'project'
  | 'search'
  | 'share'
  | 'settings'
  | 'sparkle'
  | 'thumbs-down'
  | 'thumbs-up'
  | 'volume'
  | 'user';

interface Props {
  name: IconName;
  size?: number;
  className?: string;
  pixel?: boolean;
}

export function Icon({ name, size = 18, className, pixel = false }: Props) {
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

  if (pixel) {
    const pixelCommon = {
      width: size,
      height: size,
      viewBox: '0 0 24 24',
      fill: 'currentColor',
      stroke: 'none',
      'aria-hidden': true,
      focusable: false,
      className,
      style: { shapeRendering: 'crispEdges' as const },
    };

    switch (name) {
      case 'plus':
        return (
          <svg {...pixelCommon}>
            <path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z" />
          </svg>
        );
      case 'canvas':
        return (
          <svg {...pixelCommon}>
            <path d="M3 3h18v2H3zm0 2h2v11H3zm16 0h2v11h-2zm-16 11h18v2H3zm4-8h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-8 4h2v2H7zm4 0h2v2h-2zm4 0h2v2h-2zm-4 4v3h2v-3zm6 0v3h2v-3z" />
          </svg>
        );
      case 'search':
        return (
          <svg {...pixelCommon}>
            <path d="M6 3h8v2h2v2h2v6h-2v2h-2v2H6v-2H4v-2H2V7h2V5h2V3zm0 3H4v6h2v2h6v-2h2V6h-2V5H6v1zm8 9h2v2h-2zm2 2h2v2h-2zm2 2h3v3h-3z" />
          </svg>
        );
      case 'library':
        return (
          <svg {...pixelCommon}>
            <path d="M3 4h5v16H3zm7 2h5v14h-5zm7-2h4v16h-4zm-7 2v2h1V6zm0 10v2h1v-2zm-7-2v2h1v-2zm0-8v2h1V6zm14 2v2h1V8zm0 10v2h1v-2z" />
          </svg>
        );
      case 'panel':
        return (
          <svg {...pixelCommon}>
            <path d="M3 4h18v16H3zm2 2v12h5V6zm7 0v12h7V6zm2 4h3v2h-3zm0 4h3v2h-3z" />
          </svg>
        );
      case 'chevron-down':
        return (
          <svg {...pixelCommon}>
            <path d="M6 9h3v2h2v2h2v-2h2V9h3v2h-3v2h-2v2h-2v-2H9v-2H6z" />
          </svg>
        );
      case 'chevron-right':
        return (
          <svg {...pixelCommon}>
            <path d="M9 6h2v3h2v2h2v2h-2v2h-2v3H9v-3h2v-2h2v-2h-2V9H9z" />
          </svg>
        );
      case 'pin':
        return (
          <svg {...pixelCommon}>
            <path d="M9 4h6v2h-1v4h3v2h-4v7h-2v-7H7v-2h3V6H9z" />
          </svg>
        );
      case 'close':
        return (
          <svg {...pixelCommon}>
            <path d="M5 5h3v2h2v2h4V7h2V5h3v3h-2v2h-2v4h2v2h2v3h-3v-2h-2v-2h-4v2H8v2H5v-3h2v-2h2v-4H7V8H5z" />
          </svg>
        );
      case 'chat':
        return (
          <svg {...pixelCommon}>
            <path d="M4 4h16v11H8l-4 4V4zm2 2v7h12V6H6zm2 2h8v1H8V8zm0 2h6v1H8v-1z" />
          </svg>
        );
      case 'user':
        return (
          <svg {...pixelCommon}>
            <path d="M9 4h6v6H9V4zm-4 8h14v2h-1v6H6v-6H5v-2zm3 2v4h8v-4H8z" />
          </svg>
        );
      default:
        break;
    }
  }

  switch (name) {
    case 'about':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 7.6h.01" /></svg>;
    case 'appearance':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 3v18a9 9 0 0 0 0-18Z" fill="currentColor" stroke="none" /></svg>;
    case 'brain':
      return <svg {...common}><path d="M9 4.5a2.5 2.5 0 0 0-2.5 2.5 2.5 2.5 0 0 0-1.5 4.4A2.8 2.8 0 0 0 6 16.5a2.5 2.5 0 0 0 3 2.4V7a2.5 2.5 0 0 0 0-2.5Z" /><path d="M15 4.5a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1 1.5 4.4A2.8 2.8 0 0 1 18 16.5a2.5 2.5 0 0 1-3 2.4V7a2.5 2.5 0 0 1 0-2.5Z" /><path d="M9 8.5H7.3M9 12.5H7M9 16h-1.7M15 8.5h1.7M15 12.5h2M15 16h1.7" /></svg>;
    case 'check':
      return <svg {...common}><path d="m5 12.5 4.2 4.2L19 7" /></svg>;
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
    case 'copy':
      return <svg {...common}><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" /></svg>;
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
    case 'pause':
      return <svg {...common}><path d="M9 5v14M15 5v14" /></svg>;
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
    case 'share':
      return <svg {...common}><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="m8.3 10.9 7.4-4.6M8.3 13.1l7.4 4.6" /></svg>;
    case 'settings':
      return <svg {...common}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" /></svg>;
    case 'sparkle':
      return <svg {...common}><path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9Z" /><path d="M18.5 4v3M20 5.5h-3" /></svg>;
    case 'thumbs-down':
      return <svg {...common}><path d="M7 3v12H3V3h4ZM7 13h3l-1 5.1a2.2 2.2 0 0 0 4.1 1.5L17 13h2.2A1.8 1.8 0 0 0 21 11.2L20 5a2.4 2.4 0 0 0-2.4-2H7" /></svg>;
    case 'thumbs-up':
      return <svg {...common}><path d="M7 21V9H3v12h4ZM7 11h3l-1-5.1a2.2 2.2 0 0 1 4.1-1.5L17 11h2.2a1.8 1.8 0 0 1 1.8 1.8L20 19a2.4 2.4 0 0 1-2.4 2H7" /></svg>;
    case 'volume':
      return <svg {...common}><path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" /><path d="M15 9a4 4 0 0 1 0 6M17.8 6.5a7.5 7.5 0 0 1 0 11" /></svg>;
    case 'user':
      return <svg {...common}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.8 20.5a7.4 7.4 0 0 1 14.4 0" /></svg>;
    default:
      return null;
  }
}

export default Icon;
