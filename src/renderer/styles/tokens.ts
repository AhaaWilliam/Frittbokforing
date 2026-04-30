/**
 * Design tokens — TypeScript source of truth.
 *
 * Per ADR 005 (dual-mode UI) och implementeringsplanens Sprint 12:
 * - Bas-tokens på `:root` (gemensamma för båda modes)
 * - Mode-overrides på `[data-mode="vardag"]` / `[data-mode="bokforare"]`
 *
 * **Sync med tokens.css:** Detta objekt och `tokens.css`/`@theme` MÅSTE hållas
 * i synk. CSS är canonical för Tailwind v4-utilities; denna TS-fil används
 * av komponenter som behöver token-värden i JS (t.ex. charts, animation-config).
 * Paritet verifieras av `tests/sprint-12-token-parity.test.ts` (Sprint 13).
 *
 * **Inga magic numbers i komponenter.** All färg, spacing, typografi och
 * radius går via dessa tokens — direkt i style/className eller via
 * Tailwind-utility som speglar samma värde.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Color — bas-palett (mode-agnostisk)
// ─────────────────────────────────────────────────────────────────────────────

export const colorBase = {
  // Neutral scale (zinc-baserad, ger god läsbarhet på papper-vita ytor)
  neutral50: '#fafafa',
  neutral100: '#f4f4f5',
  neutral200: '#e4e4e7',
  neutral300: '#d4d4d8',
  neutral400: '#a1a1aa',
  neutral500: '#71717a',
  neutral600: '#52525b',
  neutral700: '#3f3f46',
  neutral800: '#27272a',
  neutral900: '#18181b',
  neutral950: '#09090b',

  // Brand — varm bokföringsblå med en gnutta värme (testar olika varianter
  // i Sprint 13 mot prototypen; detta är försiktig start-palett)
  brand50: '#eef4ff',
  brand100: '#dbe7ff',
  brand500: '#3b6cdb',
  brand600: '#2d54b8',
  brand700: '#234293',
  brand900: '#13265a',

  // Status — fullständig palett (Sprint 69 utvidgning).
  // Paritet med `--color-{semantik}-{ton}` i index.css @theme.
  success100: '#dcfce7',
  success500: '#16a34a',
  success600: '#15803d',
  success700: '#166534',
  warning100: '#fef3c7',
  warning500: '#d97706',
  warning600: '#b45309',
  warning700: '#92400e',
  danger100: '#fee2e2',
  danger500: '#dc2626',
  danger600: '#b91c1c',
  danger700: '#991b1b',
  info100: '#e0f2fe',
  info500: '#0284c7',
  info600: '#0369a1',
  info700: '#075985',
  // Semantisk status-alias — domänkoncept ("förfallen") snarare än färgnamn.
  statusOverdue: '#b91c1c', // = danger600
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Typography
// ─────────────────────────────────────────────────────────────────────────────

export const fontFamily = {
  // Display — rubriker, KPI-tal, hero-text. Variabelt typsnitt.
  display: '"Fraunces", "Iowan Old Style", "Apple Garamond", Georgia, serif',
  // UI — alla brödtext, knappar, formulär. Variabelt typsnitt.
  sans: '"Inter Tight", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  // Tabulärt — verifikat-nummer, belopp, kbd-chips, kontonummer.
  mono: '"JetBrains Mono", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
} as const

export const fontSize = {
  xs: '0.75rem', // 12px — fine print, kbd-chip-label
  sm: '0.875rem', // 14px — sekundär text, label
  base: '1rem', // 16px — bröd-default
  lg: '1.125rem', // 18px — primär CTA, lead
  xl: '1.25rem', // 20px — sub-rubrik
  '2xl': '1.5rem', // 24px — sid-rubrik (Vardag)
  '3xl': '1.875rem', // 30px — sid-rubrik (Bokförare)
  '4xl': '2.25rem', // 36px — KPI-värde
  '5xl': '3rem', // 48px — hero / dashboard top-metric
} as const

export const fontWeight = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
} as const

export const lineHeight = {
  tight: 1.15, // display
  snug: 1.35, // rubriker
  normal: 1.55, // bröd
  relaxed: 1.7, // long-form
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Spacing (4px-skala)
// ─────────────────────────────────────────────────────────────────────────────

export const spacing = {
  0: '0',
  0.5: '0.125rem', // 2
  1: '0.25rem', // 4
  1.5: '0.375rem', // 6
  2: '0.5rem', // 8
  3: '0.75rem', // 12
  4: '1rem', // 16
  5: '1.25rem', // 20
  6: '1.5rem', // 24
  8: '2rem', // 32
  10: '2.5rem', // 40
  12: '3rem', // 48
  16: '4rem', // 64
  20: '5rem', // 80
  24: '6rem', // 96
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Radius
// ─────────────────────────────────────────────────────────────────────────────

export const radius = {
  none: '0',
  sm: '0.25rem', // 4px — kbd-chip, små badges
  md: '0.5rem', // 8px — knappar, inputs (default)
  lg: '0.75rem', // 12px — kort
  xl: '1rem', // 16px — stora paneler, sheets
  '2xl': '1.5rem', // 24px — hero-paneler
  full: '9999px', // pills, status-rundningar
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Shadow / elevation
// ─────────────────────────────────────────────────────────────────────────────

export const shadow = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(0 0 0 / 0.04)',
  md: '0 4px 8px -2px rgb(0 0 0 / 0.06), 0 2px 4px -2px rgb(0 0 0 / 0.04)',
  lg: '0 12px 24px -8px rgb(0 0 0 / 0.10), 0 4px 8px -4px rgb(0 0 0 / 0.06)',
  // Sheet — för bottom-sheets (Vardag) och dialogs
  sheet: '0 -8px 32px -4px rgb(0 0 0 / 0.12)',
  // Focus ring (a11y)
  focus: '0 0 0 3px rgb(59 108 219 / 0.35)',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Motion
// ─────────────────────────────────────────────────────────────────────────────

export const duration = {
  instant: '0ms',
  fast: '120ms', // hover, focus, micro
  base: '200ms', // open/close, fade
  slow: '320ms', // sheet, large layout
} as const

export const easing = {
  // Standard Material-style — bra default för UI
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  // Decelerate — för "kommer in" (sheets, popovers)
  decel: 'cubic-bezier(0, 0, 0, 1)',
  // Accelerate — för "går ut" (close, dismiss)
  accel: 'cubic-bezier(0.3, 0, 1, 1)',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Z-index lager
// ─────────────────────────────────────────────────────────────────────────────

export const zIndex = {
  base: 0,
  raised: 10,
  sticky: 20, // sticky table headers
  navigation: 30,
  dropdown: 40,
  overlay: 50, // modal backdrops
  modal: 60, // dialog content
  toast: 70,
  commandPalette: 80, // ⌘K alltid överst
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Mode-resolved tokens
// ─────────────────────────────────────────────────────────────────────────────

export type UiMode = 'vardag' | 'bokforare'

/**
 * Mode-specifika overrides. Sprint 12 sätter en konservativ baseline —
 * Sprint 13–17 expanderar när vi sett varje yta i båda modes.
 *
 * Värdena speglar `[data-mode="..."]`-scopes i tokens.css.
 */
export const modeTokens = {
  vardag: {
    // Vardag = papper, varm vit, generös spacing
    surface: colorBase.neutral50,
    surfaceElevated: '#ffffff',
    textPrimary: colorBase.neutral900,
    textSecondary: colorBase.neutral600,
    border: colorBase.neutral200,
    accent: colorBase.brand500,
    // Större bas-typografi — Vardag är touch-vänligare
    fontSizeBase: fontSize.lg, // 18px
  },
  bokforare: {
    // Bokförare = täta tabeller, mörk top-bar, tät spacing
    surface: '#ffffff',
    surfaceElevated: '#ffffff',
    textPrimary: colorBase.neutral950,
    textSecondary: colorBase.neutral500,
    border: colorBase.neutral200,
    accent: colorBase.brand600,
    // Standard bröd — bokförare jobbar med tät information
    fontSizeBase: fontSize.base, // 16px
    // Top-bar är mörk i Bokförare-läget (ADR 005 — "mörk yta i ljust tema")
    topBarSurface: colorBase.neutral900,
    topBarText: colorBase.neutral50,
  },
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Default mode
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_MODE: UiMode = 'bokforare'

/**
 * Settings-nyckel för persisterat mode-val (per ADR 005).
 * Läses i main.tsx vid app-start, persisteras vid mode-byte.
 */
export const MODE_SETTING_KEY = 'ui_mode'
