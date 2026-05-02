type BigButtonColor = 'plommon' | 'mint' | 'dark'

interface BigButtonProps {
  color: BigButtonColor
  label: string
  hint: string
  onClick: () => void
  testId?: string
}

const COLOR_TOKEN: Record<BigButtonColor, string> = {
  plommon: 'var(--color-brand-500)',
  mint: 'var(--color-mint-500)',
  dark: 'var(--color-dark)',
}

/**
 * BigButton — 220×220 hero-knapp för Vardag-läget (H+G-prototyp).
 *
 * Tre primära handlingar i Vardag: "Bokför kostnad", "Skapa faktura",
 * "Stäng månad". Varje knapp visar en färgad cirkel-marker (token-baserad),
 * en serif-rubrik, en hint-rad och en pil. Hover lyfter knappen 2px och
 * ger djupare skugga via CSS hover-pseudoklass (VS-65 — undviker
 * useState-baserad re-render per mus-event).
 */
export function BigButton({
  color,
  label,
  hint,
  onClick,
  testId,
}: BigButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="group flex h-[220px] w-[220px] flex-col justify-between rounded-md border border-[var(--border-default)] bg-[var(--surface-elevated)] p-6 text-left shadow-[0_1px_2px_rgba(30,30,28,.04)] transition-all hover:-translate-y-0.5 hover:border-[var(--border-strong)] hover:shadow-[0_12px_28px_rgba(30,30,28,.10)] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span
        className="block h-9 w-9 rounded-full"
        style={{ background: COLOR_TOKEN[color] }}
        aria-hidden="true"
      />
      <span className="block">
        <span className="block font-serif text-[22px] font-normal leading-[1.15] text-[var(--text-primary)]">
          {label}
        </span>
        <span className="mt-1.5 block text-xs leading-[1.4] text-[var(--text-secondary)]">
          {hint}
        </span>
      </span>
      <span
        className="self-end text-lg text-[var(--text-faint)] transition-colors group-hover:text-[var(--text-primary)]"
        aria-hidden="true"
      >
        →
      </span>
    </button>
  )
}
