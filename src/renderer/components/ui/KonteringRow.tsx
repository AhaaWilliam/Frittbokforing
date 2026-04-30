import { formatKr } from '../../lib/format'

interface KonteringRowProps {
  account: string
  description?: string
  debit?: number
  credit?: number
}

/**
 * Sprint H+G-8 — KonteringRow-primitive.
 *
 * En rad i förslag-kontering eller live-preview: kontonummer i mono,
 * beskrivning, debet/kredit i ören (formaterat till kr för visning).
 *
 * Använd i sheets för att visa förslag-kontering eller i ZoneCons för
 * live-preview vid bokföring.
 */
export function KonteringRow({
  account,
  description,
  debit,
  credit,
}: KonteringRowProps) {
  return (
    <div className="grid grid-cols-[60px_1fr_88px_88px] items-center gap-2 border-b border-[var(--border-default)] py-2 last:border-0 text-sm">
      <span className="font-mono text-xs text-[var(--text-primary)]">
        {account}
      </span>
      <span className="truncate text-[var(--text-secondary)]">
        {description ?? ' '}
      </span>
      <span className="text-right font-mono text-xs">
        {debit != null ? formatKr(debit) : ''}
      </span>
      <span className="text-right font-mono text-xs">
        {credit != null ? formatKr(credit) : ''}
      </span>
    </div>
  )
}

/**
 * Header-rad för en lista av KonteringRow.
 */
export function KonteringHeader() {
  return (
    <div className="grid grid-cols-[60px_1fr_88px_88px] items-center gap-2 border-b border-[var(--border-strong)] pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
      <span>Konto</span>
      <span>Beskrivning</span>
      <span className="text-right">Debet</span>
      <span className="text-right">Kredit</span>
    </div>
  )
}
