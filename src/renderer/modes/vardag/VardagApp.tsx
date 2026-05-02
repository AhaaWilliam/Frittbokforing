import { useMemo, useState } from 'react'
import { useActiveCompany } from '../../contexts/ActiveCompanyContext'
import {
  FiscalYearProvider,
  useFiscalYearContext,
} from '../../contexts/FiscalYearContext'
import { useUiMode } from '../../lib/use-ui-mode'
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts'
import {
  useExpenseDrafts,
  useDraftInvoices,
  useLatestVerification,
} from '../../lib/hooks'
import { BigButton } from '../../components/ui/BigButton'
import { KbdChip, modKey } from '../../components/ui/KbdChip'
import { VardagShell } from './VardagShell'
import { BokforKostnadSheet } from './BokforKostnadSheet'
import { SkapaFakturaSheet } from './SkapaFakturaSheet'

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
  const { activeFiscalYear } = useFiscalYearContext()
  const fyId = activeFiscalYear?.id
  const { data: expenseDrafts } = useExpenseDrafts(fyId)
  const { data: invoiceDrafts } = useDraftInvoices(fyId)
  const { data: latestVer } = useLatestVerification(fyId)
  const inboxCount = (expenseDrafts?.length ?? 0) + (invoiceDrafts?.length ?? 0)
  const [sheet, setSheet] = useState<VardagSheet>(null)

  useKeyboardShortcuts({
    'mod+shift+b': () => setMode('bokforare'),
    'mod+n': () => setSheet('kostnad'),
    'mod+i': () => setSheet('faktura'),
  })

  const dayLabel = useMemo(() => {
    return new Date().toLocaleDateString('sv-SE', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })
  }, [])

  const greeting = useMemo(() => greetingForHour(new Date().getHours()), [])

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
          <StatusPill
            tone={inboxCount > 0 ? 'warning' : 'mint'}
            label={
              inboxCount === 0
                ? 'Inkorgen är tom'
                : inboxCount === 1
                  ? '1 obokförd post'
                  : `${inboxCount} obokförda poster`
            }
            testId="vardag-pill-inbox"
          />
          {latestVer && (
            <StatusPill
              tone="mint"
              label={`Senast bokfört: ${latestVer.series}${String(latestVer.number).padStart(4, '0')}`}
              testId="vardag-pill-latest"
            />
          )}
          <StatusPill
            tone="mint"
            label="Momsperiod: aktuell"
            testId="vardag-pill-vat"
          />
        </div>

        <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-[18px] text-[11px] text-[var(--text-faint)]">
          <span>
            <KbdChip>{`${modKey()}N`}</KbdChip> ny kostnad
          </span>
          <span>
            <KbdChip>{`${modKey()}I`}</KbdChip> ny faktura
          </span>
          <span>
            <KbdChip>{`${modKey()}K`}</KbdChip> sök allt
          </span>
          <span>
            <KbdChip>{`${modKey()}⇧B`}</KbdChip> Bokförare-läget
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
  testId,
}: {
  tone: 'mint' | 'warning'
  label: string
  testId?: string
}) {
  const dotColor =
    tone === 'mint' ? 'var(--color-mint-500)' : 'var(--color-warning-500)'
  return (
    <span className="inline-flex items-center" data-testid={testId}>
      <span
        className="mr-2 inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}


