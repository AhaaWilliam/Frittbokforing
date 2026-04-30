import { useEffect, useMemo, useState } from 'react'
import { useActiveCompany } from '../../contexts/ActiveCompanyContext'
import { useUiMode } from '../../lib/use-ui-mode'
import { BigButton } from '../../components/ui/BigButton'
import { KbdChip } from '../../components/ui/KbdChip'
import { VardagShell } from './VardagShell'

/**
 * Sprint H+G-3 — VardagApp som hero-screen (matchar H+G-prototyp).
 *
 * Vardag är ett enskilt fokus-läge — ingen sub-routing inom mode:n.
 * Tre primära handlingar exponeras via 220×220 BigButtons.
 *
 * "Bokför kostnad" och "Skapa faktura" öppnar sheets (placeholders nu,
 * fylls i Sprint H+G-8). "Stäng månad" byter till bokförare-läge.
 *
 * Inkorg-räknare, sista verifikat och momsperiod visas som status-pills
 * — datakällor placeholderas tills Sprint H+G-7 hookar dem.
 *
 * Tidigare struktur (sub-pages Inbox/Spend/Income/Status + bottom-nav)
 * är borttagen i denna sprint enligt redesign-plan.
 */

type VardagSheet = 'kostnad' | 'faktura' | null

function greetingForHour(hour: number): string {
  if (hour < 5) return 'God natt'
  if (hour < 10) return 'God morgon'
  if (hour < 18) return 'Hej'
  return 'God kväll'
}

export function VardagApp() {
  const { activeCompany } = useActiveCompany()
  const { setMode } = useUiMode()
  const [sheet, setSheet] = useState<VardagSheet>(null)

  const dayLabel = useMemo(() => {
    return new Date().toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  }, [])

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), [])

  useEffect(() => {
    if (!sheet) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSheet(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [sheet])

  if (!activeCompany) {
    return null
  }

  return (
    <VardagShell companyName={activeCompany.name}>
      <div
        className="relative flex min-h-full flex-col items-center justify-center px-12 pt-10"
        data-testid="vardag-hero"
      >
        <div className="mb-2 font-serif-italic text-sm text-[var(--text-secondary)]">
          {dayLabel}
        </div>
        <h1 className="mb-1.5 text-center font-serif text-3xl font-normal text-[var(--text-primary)]">
          {greeting}.
        </h1>
        <p className="mb-12 font-serif-italic text-lg font-normal text-[var(--text-secondary)]">
          Vad vill du göra idag?
        </p>

        <div className="mb-10 flex gap-[22px]">
          <BigButton
            color="plommon"
            label="Bokför kostnad"
            hint="Kvitto, faktura eller bankhändelse"
            onClick={() => setSheet('kostnad')}
            testId="vardag-bigbtn-kostnad"
          />
          <BigButton
            color="mint"
            label="Skapa faktura"
            hint="Ny faktura till kund"
            onClick={() => setSheet('faktura')}
            testId="vardag-bigbtn-faktura"
          />
          <BigButton
            color="dark"
            label="Stäng månad"
            hint="Avstämning, moms, lås period"
            onClick={() => setMode('bokforare')}
            testId="vardag-bigbtn-stang-manad"
          />
        </div>

        <div
          className="mb-10 flex gap-7 text-xs text-[var(--text-secondary)]"
          data-testid="vardag-status-pills"
        >
          <StatusPill tone="mint" label="Inkorgen är tom" />
          <StatusPill tone="mint" label="Momsperiod: aktuell" />
        </div>

        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-[18px] text-[11px] text-[var(--text-faint)]">
          <span>
            <KbdChip>⌘K</KbdChip> sök allt
          </span>
          <span>
            <KbdChip>⌘⇧B</KbdChip> Bokförare-läget
          </span>
          <span>
            <KbdChip>?</KbdChip> hjälp
          </span>
        </div>
      </div>

      {sheet !== null && (
        <PlaceholderSheet
          title={sheet === 'kostnad' ? 'Bokför kostnad' : 'Skapa faktura'}
          onClose={() => setSheet(null)}
        />
      )}
    </VardagShell>
  )
}

function StatusPill({ tone, label }: { tone: 'mint' | 'warning'; label: string }) {
  const dotColor =
    tone === 'mint' ? 'var(--color-mint-500)' : 'var(--color-warning-500)'
  return (
    <span className="inline-flex items-center">
      <span
        className="mr-2 inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

/**
 * Placeholder-sheet — fylls med riktigt innehåll i Sprint H+G-8
 * (BokforKostnadSheet + SkapaFakturaSheet).
 */
function PlaceholderSheet({
  title,
  onClose,
}: {
  title: string
  onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-2xl rounded-t-md border border-[var(--border-default)] bg-[var(--surface-elevated)] p-8"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
        data-testid="vardag-sheet"
      >
        <h2 className="mb-2 font-serif text-xl font-normal">{title}</h2>
        <p className="mb-6 text-sm text-[var(--text-secondary)]">
          Sheet-innehåll fylls i Sprint H+G-8.
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[var(--border-default)] px-4 py-2 text-sm hover:bg-[var(--surface-secondary)]"
        >
          Stäng
        </button>
      </div>
    </div>
  )
}
