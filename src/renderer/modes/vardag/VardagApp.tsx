import { useEffect, useMemo, useState } from 'react'
import { useActiveCompany } from '../../contexts/ActiveCompanyContext'
import { FiscalYearProvider } from '../../contexts/FiscalYearContext'
import { useUiMode } from '../../lib/use-ui-mode'
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts'
import { BigButton } from '../../components/ui/BigButton'
import { KbdChip } from '../../components/ui/KbdChip'
import { BottomSheet, BottomSheetClose } from '../../components/ui/BottomSheet'
import { Field } from '../../components/ui/Field'
import { VardagShell } from './VardagShell'
import { BokforKostnadSheet } from './BokforKostnadSheet'

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

  if (!activeCompany) {
    return null
  }

  return (
    <FiscalYearProvider key={activeCompany.id}>
      <VardagAppInner companyName={activeCompany.name} />
    </FiscalYearProvider>
  )
}

function VardagAppInner({ companyName }: { companyName: string }) {
  const { setMode } = useUiMode()
  const [sheet, setSheet] = useState<VardagSheet>(null)

  useKeyboardShortcuts({
    'mod+shift+b': () => setMode('bokforare'),
  })

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

  return (
    <VardagShell companyName={companyName}>
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

      <BokforKostnadSheet
        open={sheet === 'kostnad'}
        onClose={() => setSheet(null)}
      />
      <SkapaFakturaSheet
        open={sheet === 'faktura'}
        onClose={() => setSheet(null)}
      />
    </VardagShell>
  )
}

function StatusPill({
  tone,
  label,
}: {
  tone: 'mint' | 'warning'
  label: string
}) {
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
 * Sprint H+G-8 — SkapaFakturaSheet (visuell prototyp).
 *
 * Stub som matchar prototypens layout: kund-dropdown, radobjekt-tabell,
 * sammanställning. Funktionell integration uppskjuten.
 */
function SkapaFakturaSheet({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  return (
    <BottomSheet
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose()
      }}
      title="Skapa faktura"
      description="Ny utgående faktura — välj kund och rader."
    >
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Kund" span={2}>
            <input
              type="text"
              placeholder="Sök kund eller skapa ny…"
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-sm"
            />
          </Field>
          <Field label="Fakturadatum">
            <input
              type="text"
              placeholder="2026-04-30"
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-sm font-mono"
            />
          </Field>
          <Field label="Förfallodatum" hint="14 eller 30 dagar">
            <input
              type="text"
              placeholder="2026-05-30"
              className="w-full rounded-md border border-[var(--border-default)] bg-[var(--surface)] px-3 py-2 text-sm font-mono"
            />
          </Field>
        </div>

        <div className="rounded-md border border-[var(--border-default)] p-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
            Rader
          </p>
          <div className="grid grid-cols-[1fr_60px_88px_88px] gap-2 border-b border-[var(--border-strong)] pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-faint)]">
            <span>Beskrivning</span>
            <span className="text-right">Antal</span>
            <span className="text-right">À-pris</span>
            <span className="text-right">Total</span>
          </div>
          <p className="mt-3 text-xs italic text-[var(--text-faint)]">
            Inga rader ännu — klicka "+ Ny rad" för att lägga till.
          </p>
        </div>

        <div className="flex justify-end gap-2">
          <BottomSheetClose>Avbryt</BottomSheetClose>
          <button
            type="button"
            disabled
            className="rounded-md bg-[var(--color-brand-500)] px-4 py-2 text-sm font-medium text-white opacity-50"
          >
            Skicka
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

