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
  // Neutral scale — varmare papper-toner (Sprint H+G-1, var zinc-baserad)
  neutral50: '#fbfaf8', // card
  neutral100: '#f1f0ee', // bg, papperston
  neutral200: '#e7e6e2', // card-2, sekundär yta
  neutral300: '#d6d4cf', // border
  neutral400: '#a8a6a0', // border-strong
  neutral500: '#8d8b85', // faint, tertiärtext
  neutral600: '#56544f', // muted, sekundärtext
  neutral700: '#3a3935',
  neutral800: '#2b2a27', // dark-soft
  neutral900: '#1d1c1a', // dark
  neutral950: '#1a1a18', // text — varm primärsvart

  // Brand — dusty teal (Sprint H+G-1, var tech-blå)
  brand50: '#f1f4f4',
  brand100: '#dde3e3', // plommon-soft (selected, hover)
  brand500: '#7a9498', // plommon (main)
  brand600: '#5e7a7e',
  brand700: '#4a6266',
  brand900: '#2a3b3e',

  // Mint — sage green (NY sekundär accent)
  mint50: '#f3f5f0',
  mint100: '#e1e4dc', // mint-soft
  mint500: '#94a58c', // mint (main)
  mint600: '#768867',
  mint700: '#5e6e54',

  // Mörk yta — för bokförare-topbar
  dark: '#1d1c1a',
  darkSoft: '#2b2a27',

  // Status — alignade med prototyp
  success100: '#e1e4dc', // alias mint-100 (success = positivt = mint)
  success500: '#94a58c',
  success600: '#768867',
  success700: '#5e6e54',
  warning100: '#ead9c8', // dusty terracotta-soft
  warning500: '#b08568',
  warning600: '#93704f',
  warning700: '#75593e',
  danger100: '#f4dada',
  danger500: '#9a4d4d', // dämpad röd (var #dc2626)
  danger600: '#7c3d3d',
  danger700: '#5c2d2d',
  info100: '#dde3e3', // alias brand-100 (info = neutral upplysning)
  info500: '#7a9498',
  info600: '#5e7a7e',
  info700: '#4a6266',
  // Semantisk status-alias — domänkoncept ("förfallen") snarare än färgnamn.
  statusOverdue: '#93704f', // = warning600 (förfallen = warning, inte danger)
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
  sm: '0.8125rem', // 13px — bröd-default (prototyp-norm)
  base: '0.875rem', // 14px — Vardag bröd, generösare
  lg: '1.0625rem', // 17px — primär CTA, lead
  xl: '1.25rem', // 20px — sub-rubrik
  '2xl': '1.375rem', // 22px — sheet-titel italic Fraunces
  '3xl': '1.875rem', // 30px — Vardag hero "God morgon"
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
  sm: '0.1875rem', // 3px — kbd-chip, mono-badges
  md: '0.25rem', // 4px — knappar, inputs (default, prototyp-norm)
  lg: '0.375rem', // 6px — kort
  xl: '0.5rem', // 8px — stora paneler
  '2xl': '0.625rem', // 10px — sheets
  full: '9999px', // pills, status-rundningar
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Shadow / elevation
// ─────────────────────────────────────────────────────────────────────────────

export const shadow = {
  none: 'none',
  sm: '0 1px 2px 0 rgb(30 30 28 / 0.04)',
  md: '0 4px 8px -2px rgb(30 30 28 / 0.06), 0 2px 4px -2px rgb(30 30 28 / 0.04)',
  lg: '0 12px 28px -6px rgb(30 30 28 / 0.10), 0 4px 8px -4px rgb(30 30 28 / 0.06)',
  // Sheet — för bottom-sheets och dialogs
  sheet: '0 -8px 32px -4px rgb(30 30 28 / 0.18)',
  // Focus ring (a11y) — dusty teal-tonad
  focus: '0 0 0 3px rgb(122 148 152 / 0.35)',
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
  // Standard — prototyp-aligned (mjukare än Material)
  standard: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
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
    // Vardag = papper, ljus topbar, generös typografi
    surface: '#f1f0ee', // papperston
    surfaceElevated: '#fbfaf8', // card
    textPrimary: '#1a1a18',
    textSecondary: '#56544f',
    border: '#d6d4cf',
    accent: colorBase.brand500, // dusty teal
    fontSizeBase: fontSize.base, // 14px (luftigare)
    topBarSurface: '#fbfaf8', // ljus topbar i Vardag
    topBarText: '#1a1a18',
  },
  bokforare: {
    // Bokförare = papper, mörk topbar, tät spacing
    surface: '#f1f0ee', // papperston (samma som Vardag)
    surfaceElevated: '#fbfaf8', // card
    textPrimary: '#1a1a18',
    textSecondary: '#56544f',
    border: '#d6d4cf',
    accent: colorBase.brand500, // dusty teal
    fontSizeBase: fontSize.sm, // 13px (tightare)
    // Top-bar är mörk i Bokförare-läget (matchar prototyp H+G)
    topBarSurface: colorBase.dark, // #1d1c1a
    topBarText: '#ebeae6',
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
