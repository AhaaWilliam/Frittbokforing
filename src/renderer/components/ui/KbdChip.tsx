import type { ReactNode } from 'react'

/**
 * VS-34: Plattformsmedveten mod-tangent. Returnerar `⌘` på macOS, annars
 * `Ctrl`. Lazy evaluation eftersom navigator inte finns i node-miljö
 * (test-loader kan cacha modulen mellan jsdom/node-miljöer).
 */
export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  const platform = navigator.platform || ''
  const ua = navigator.userAgent || ''
  return /Mac|iPhone|iPad|iPod|darwin/i.test(platform + ' ' + ua)
}

export function modKey(): string {
  return isMac() ? '⌘' : 'Ctrl'
}

export function modLabel(): string {
  return isMac() ? 'Kommando' : 'Ctrl'
}

/**
 * KbdChip — `<kbd>`-styled tangentchip för keyboard-genvägar.
 *
 * Användning: visa shortcuts inline i menyer/tooltips ("Ny faktura ⌘N"),
 * i command palette-listor, i empty-state-tips ("Tryck ⌘K för att söka").
 *
 * Kompositionsmönster: `<KbdChord keys={['⌘', 'K']} />` ger en visuell chord
 * med separator. Enskild tangent: `<KbdChip>⌘</KbdChip>`.
 */

interface KbdChipProps {
  children: ReactNode
  /** Mindre variant — för inline-text. */
  size?: 'sm' | 'md'
  /** Visuell variant. `dark` används på mörk topbar (bokförare). */
  variant?: 'light' | 'dark'
  className?: string
}

export function KbdChip({
  children,
  size = 'sm',
  variant = 'light',
  className,
}: KbdChipProps) {
  const sizeClasses =
    size === 'sm'
      ? 'text-xs px-1.5 py-0.5 min-w-[1.5rem]'
      : 'text-sm px-2 py-1 min-w-[1.75rem]'

  const variantClasses =
    variant === 'dark'
      ? 'border-[var(--color-dark-soft)] bg-[var(--color-dark)] text-[var(--text-faint)]'
      : 'border-[var(--border-default)] bg-[var(--surface-secondary)]/40 text-[var(--text-secondary)]'

  const classes = [
    'inline-flex items-center justify-center font-mono font-medium',
    'rounded',
    variantClasses,
    'shadow-sm',
    sizeClasses,
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ')

  return <kbd className={classes}>{children}</kbd>
}

interface KbdChordProps {
  /**
   * Lista av tangenter ("⌘", "K"). Renderas som separata KbdChip:s med
   * "+" som separator (visuellt + a11y-vänligt).
   */
  keys: ReadonlyArray<ReactNode>
  /** Visuell separator mellan tangenter. Default: "+". */
  separator?: ReactNode
  size?: 'sm' | 'md'
  /** A11y-text som beskriver hela ackordet (t.ex. "Kommando plus K"). */
  ariaLabel?: string
  className?: string
}

export function KbdChord({
  keys,
  separator = '+',
  size = 'sm',
  ariaLabel,
  className,
}: KbdChordProps) {
  const rootClasses = ['inline-flex items-center gap-1', className ?? '']
    .filter(Boolean)
    .join(' ')

  return (
    <span
      className={rootClasses}
      role="group"
      aria-label={ariaLabel}
      data-kbd-chord
    >
      {keys.map((key, i) => (
        // Index-key OK eftersom keys-arrayen är en stabil tangent-sekvens.
        <span className="inline-flex items-center gap-1" key={i}>
          {i > 0 && (
            <span
              aria-hidden="true"
              className="text-xs text-[var(--text-faint)]"
            >
              {separator}
            </span>
          )}
          <KbdChip size={size}>{key}</KbdChip>
        </span>
      ))}
    </span>
  )
}
