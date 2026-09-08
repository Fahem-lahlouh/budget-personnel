/**
 * Jeu d'icônes de l'application, en SVG inline.
 *
 * Aucune librairie d'icônes : elles pèseraient plus lourd que le reste de
 * l'app pour la trentaine de symboles réellement utilisés, et une dépendance
 * externe supplémentaire n'apporterait rien ici. Tracé uniforme (contour 1.7,
 * bouts arrondis) pour que l'ensemble reste homogène.
 */

const PATHS: Record<string, string> = {
  // Catégories
  home: 'M3 10.5 12 3l9 7.5M5.5 9.5V20h13V9.5M9.5 20v-6h5v6',
  car: 'M5 16.5h14M4 16.5v2.5h2.5v-2.5M17.5 16.5V19H20v-2.5M4.2 16.5l1.4-6.3A2 2 0 0 1 7.6 8.6h8.8a2 2 0 0 1 2 1.6l1.4 6.3M7 13h2M15 13h2',
  signal: 'M12 19v-3M8.3 15.6a5 5 0 0 1 7.4 0M5.2 12.3a9.4 9.4 0 0 1 13.6 0M2.5 9a13.6 13.6 0 0 1 19 0',
  repeat: 'M4 9a5 5 0 0 1 5-5h9m0 0-3-3m3 3-3 3M20 15a5 5 0 0 1-5 5H6m0 0 3 3m-3-3 3-3',
  device: 'M3 5.5h18v10H3zM3 15.5h18M8 20h8M12 15.5v4.5',
  cart: 'M3 4h2l2.2 10.2a2 2 0 0 0 2 1.6h7.4a2 2 0 0 0 2-1.5L20.5 8H6M9.5 20h.01M17 20h.01',
  food: 'M6 3v8a2 2 0 0 0 4 0V3M8 11v10M17 3c-1.5 1-2 2.8-2 5s.6 3.5 2 4v9',
  restaurant: 'M6 3h12l-5 7v7h3M11 17H8m3 0v-7L6 3',
  sport: 'M12 4.2h.01M9.5 21l1.6-5.4-2.6-2.3.9-4.6L6.6 10 5 13M14.6 21l-1.4-4.3-3-2.6 1.2-5.7 2.5 3.1 3.3 1.1',
  clothes: 'M8.5 3.5 5 6l1.6 3 1.4-.8V21h8V8.2l1.4.8L19 6l-3.5-2.5a3.5 3.5 0 0 1-7 0Z',
  health: 'M12 20.5S4 15.6 4 10.2A4.2 4.2 0 0 1 12 8a4.2 4.2 0 0 1 8 2.2c0 5.4-8 10.3-8 10.3Z',
  transport: 'M6 3.5h12v12H6zM6 15.5 4.5 20M18 15.5 19.5 20M6 11h12M9 18.5h6M9.2 7.5h5.6',
  gift: 'M3.5 8.5h17v3.5h-17zM5 12v8h14v-8M12 8.5V20M12 8.5S10.6 3.5 8.2 3.5a2.2 2.2 0 0 0 0 5M12 8.5s1.4-5 3.8-5a2.2 2.2 0 0 1 0 5',
  plane: 'M10.5 20.5 12 16l7.5-1.5 1-3.5-8 1.5-3-6.5-2.5.5.8 6.5-4.3.8-1.6-2.6-1.7.4L3 15l1.8 3.3 4.7-1.4Z',
  dots: 'M6 12h.01M12 12h.01M18 12h.01',
  tag: 'M4 4h7.2l8.3 8.3a2 2 0 0 1 0 2.8l-4.4 4.4a2 2 0 0 1-2.8 0L4 11.2Zm3.6 3.6h.01',
  // Navigation & actions
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M4 6.5h16M4 12h16M4 17.5h16',
  chart: 'M4 20h16M7.5 20v-6M12 20V6.5M16.5 20v-9',
  settings:
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1Z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  x: 'M6 6l12 12M18 6 6 18',
  chevronLeft: 'M15 5 8 12l7 7',
  chevronRight: 'M9 5l7 7-7 7',
  chevronDown: 'M5 9l7 7 7-7',
  chevronUp: 'M5 15l7-7 7 7',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM16.2 16.2 21 21',
  trash: 'M4 7h16M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10.5 11v5M13.5 11v5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5.2l3.4 2',
  calendar: 'M4 6.5h16V20H4zM4 10.5h16M8.5 3.5V7M15.5 3.5V7',
  eye: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Zm9.5 2.6a2.6 2.6 0 1 0 0-5.2 2.6 2.6 0 0 0 0 5.2Z',
  eyeOff: 'M4 4l16 16M9.9 5.9A8.6 8.6 0 0 1 12 5.6c6 0 9.5 6.4 9.5 6.4a17 17 0 0 1-3.4 4M6.3 8.1A16.6 16.6 0 0 0 2.5 12S6 18.4 12 18.4c1.4 0 2.6-.3 3.7-.8M10.2 10.3a2.6 2.6 0 0 0 3.5 3.6',
  lock: 'M6 10.5h12V20H6zM8.7 10.5V7.8a3.3 3.3 0 0 1 6.6 0v2.7M12 14.4v2',
  key: 'M14.5 4a5.5 5.5 0 1 1-4.4 8.8L4 19v3h3l1-1v-2h2v-2h2l1.6-1.6A5.5 5.5 0 0 1 14.5 4Zm2 3.6h.01',
  faceId:
    'M4 8.5V6a2 2 0 0 1 2-2h2.5M15.5 4H18a2 2 0 0 1 2 2v2.5M20 15.5V18a2 2 0 0 1-2 2h-2.5M8.5 20H6a2 2 0 0 1-2-2v-2.5M9 9.5v2M15 9.5v2M9.2 15a4 4 0 0 0 5.6 0',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  wallet: 'M3.5 7.5A2 2 0 0 1 5.5 5.5h11a2 2 0 0 1 2 2M3.5 7.5v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-2.2M3.5 7.5v4M20.5 10.8h-3.8a1.8 1.8 0 0 0 0 3.6h3.8Z',
  euro: 'M17.5 5.8A6.6 6.6 0 0 0 7 11.2 6.6 6.6 0 0 0 17.5 18M4.5 10.3h8M4.5 13.6h6.5',
  arrowUpRight: 'M7 17 17 7M9 7h8v8',
  arrowDownRight: 'M7 7l10 10M17 9v8H9',
  trendDown: 'M4 7l6 6 3.5-3.5L20 16M20 16v-4.5M20 16h-4.5',
  sparkle: 'M12 3.5 13.8 9l5.7 1.8-5.7 1.7L12 18l-1.8-5.5-5.7-1.7L10.2 9ZM18.5 16.5l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7Z',
  alert: 'M12 4 2.7 20h18.6ZM12 10v4.2M12 17.2h.01',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 11v5.5M12 7.6h.01',
  shield: 'M12 3.2 4.5 6v6c0 4.6 3.2 7.7 7.5 8.8 4.3-1.1 7.5-4.2 7.5-8.8V6Zm-3 8.6 2.2 2.2 4-4',
  download: 'M12 4v10.5M7.5 10.5 12 15l4.5-4.5M4.5 19.5h15',
  upload: 'M12 15.5V5M7.5 9.5 12 5l4.5 4.5M4.5 19.5h15',
  refresh: 'M20 12a8 8 0 1 1-2.6-5.9M20 4v4.5h-4.5',
  store: 'M4 9.5 5.4 5h13.2L20 9.5M4 9.5h16M4 9.5v9.5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V9.5M4 9.5a2.6 2.6 0 0 0 4 1.9 2.6 2.6 0 0 0 4 0 2.6 2.6 0 0 0 4 0 2.6 2.6 0 0 0 4-1.9',
  drag: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
  pause: 'M9 5v14M15 5v14',
  play: 'M7 4.5 19 12 7 19.5Z',
  filter: 'M3.5 6h17M6.5 12h11M10 18h4',
  trophy: 'M7 4.5h10v4a5 5 0 0 1-10 0ZM7 6H4.5v1.5A3 3 0 0 0 7.4 10.5M17 6h2.5v1.5a3 3 0 0 1-2.9 3M9.5 20h5M12 13.5V20',
}

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName | string
  size?: number
  /** `filled` : le tracé est rempli au lieu d'être en contour. */
  filled?: boolean
  className?: string
  strokeWidth?: number
}

export function Icon({ name, size = 22, filled = false, className, strokeWidth = 1.7 }: IconProps) {
  const path = PATHS[name] ?? PATHS.tag
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  )
}

export const CATEGORY_ICON_NAMES = [
  'home', 'car', 'signal', 'repeat', 'device', 'cart', 'food', 'restaurant',
  'sport', 'clothes', 'health', 'transport', 'gift', 'plane', 'wallet',
  'euro', 'target', 'sparkle', 'store', 'dots', 'tag',
] as const
