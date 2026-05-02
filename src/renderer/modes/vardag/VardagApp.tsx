import { useEffect, useMemo, useState } from 'react'
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
  useReceiptCounts,
} from '../../lib/hooks'
import { useNavigate } from '../../lib/router'
import {
  computeVatDeadline,
  vatDeadlineTone,
} from '../../../shared/vat-deadline'
import { BigButton } from '../../components/ui/BigButton'
import { KbdChip, modKey } from '../../components/ui/KbdChip'
import { VardagShell } from './VardagShell'
import { BokforKostnadSheet } from './BokforKostnadSheet'
import { SkapaFakturaSheet } from './SkapaFakturaSheet'
import { CloseMonthDialog } from '../../components/period/CloseMonthDialog'

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
      <VardagAppInner
        companyName={activeCompany.name}
        vatFrequency={activeCompany.vat_frequency}
      />
    </FiscalYearProvider>
  )
}

function VardagAppInner({
  companyName,
  vatFrequency,
}: {
  companyName: string
  vatFrequency: 'monthly' | 'quarterly' | 'yearly'
}) {
  const { setMode } = useUiMode()
  const { activeFiscalYear } = useFiscalYearContext()
  const fyId = activeFiscalYear?.id
  const { data: expenseDrafts } = useExpenseDrafts(fyId)
  const { data: invoiceDrafts } = useDraftInvoices(fyId)
  const { data: latestVer } = useLatestVerification(fyId)
  const { data: receiptCounts } = useReceiptCounts()
  const navigate = useNavigate()
  // VS-110: "Inkorgen"-pillen visar antal kvitton som väntar på bokföring
  // i den nya receipts-tabellen (status='inbox'). Drafts-räknarna kvarstår
  // som referens (latestVer + bokföringsorder-kö visas på andra ytor).
  const inboxCount = receiptCounts?.inbox ?? 0
  // Kompenserande variabler så att eslint inte flaggar oanvända imports —
  // expenseDrafts/invoiceDrafts pre-fetchas så Vardag är "varmt" när
  // sheets öppnas (cache-warm).
  void expenseDrafts
  void invoiceDrafts
  const [sheet, setSheet] = useState<VardagSheet>(null)
  const [closeMonthOpen, setCloseMonthOpen] = useState(false)
  const [now, setNow] = useState(() => new Date())

  useKeyboardShortcuts({
    'mod+shift+b': () => setMode('bokforare'),
    'mod+n': () => setSheet('kostnad'),
    'mod+i': () => setSheet('faktura'),
    // VS-118: ⌘K (annonserad i kbd-hint) växlar till bokförare-läget och
    // skickar focus-request så GlobalSearch-input (i bokförare-Sidebar)
    // tar fokus efter mount. setTimeout(0) ger React en commit-tick.
    'mod+k': () => {
      setMode('bokforare')
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('global-search:focus'))
      }, 0)
    },
  })

  // VS-62: Refresha klockan varje minut så dayLabel och greeting följer
  // verkligheten även om appen står öppen över midnatt eller morgon→kväll.
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [])

  const dayLabel = useMemo(
    () =>
      now.toLocaleDateString('sv-SE', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    [now],
  )

  const greeting = useMemo(() => greetingForHour(now.getHours()), [now])

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
            onClick={() => setCloseMonthOpen(true)}
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
                  ? '1 kvitto väntar'
                  : `${inboxCount} kvitton väntar`
            }
            testId="vardag-pill-inbox"
            onClick={() => {
              // Inkorgen är ett bokförare-page (master/detail med bulk-
              // actions). Vardag har ingen sub-routing — växla mode och
              // navigera till /inbox.
              setMode('bokforare')
              navigate('/inbox')
            }}
          />
          {latestVer && (
            <StatusPill
              tone="mint"
              label={`Senast bokfört: ${latestVer.series}${String(latestVer.number).padStart(4, '0')}`}
              testId="vardag-pill-latest"
            />
          )}
          <VatDeadlinePill
            now={now}
            vatFrequency={vatFrequency}
            fiscalYearEnd={activeFiscalYear?.end_date}
            onClick={() => {
              // VS-117: pillen är klickbar och navigerar till moms-rapporten
              // i bokförare-läget. Vardag har ingen sub-routing.
              setMode('bokforare')
              navigate('/vat')
            }}
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
      <CloseMonthDialog
        open={closeMonthOpen}
        onClose={() => setCloseMonthOpen(false)}
      />
    </VardagShell>
  )
}

function VatDeadlinePill({
  now,
  vatFrequency,
  fiscalYearEnd,
  onClick,
}: {
  now: Date
  vatFrequency: 'monthly' | 'quarterly' | 'yearly'
  fiscalYearEnd: string | undefined
  onClick?: () => void
}) {
  // VS-115c: dynamisk pill som visar nästa moms-deadline med tone baserat
  // på dagar kvar (mint/warning/danger). Beräknas mot nu (lokal tid),
  // refreshar var minut via parent's `now`-state.
  const asOf = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const result = computeVatDeadline({
    frequency: vatFrequency,
    asOf,
    fiscal_year_end: fiscalYearEnd,
  })
  if (!result) {
    return (
      <StatusPill
        tone="mint"
        label="Moms: ingen deadline"
        testId="vardag-pill-vat"
        onClick={onClick}
      />
    )
  }
  const tone = vatDeadlineTone(result.daysUntil)
  const dueLocal = new Date(result.dueDate).toLocaleDateString('sv-SE', {
    day: 'numeric',
    month: 'short',
  })
  let label: string
  if (result.daysUntil < 0) {
    label = `Moms ${result.periodLabel}: ${-result.daysUntil} dag(ar) försent`
  } else if (result.daysUntil === 0) {
    label = `Moms ${result.periodLabel}: deadline idag`
  } else {
    label = `Moms ${result.periodLabel}: ${dueLocal} (${result.daysUntil} dagar)`
  }
  return (
    <StatusPill
      tone={tone}
      label={label}
      testId="vardag-pill-vat"
      onClick={onClick}
    />
  )
}

function StatusPill({
  tone,
  label,
  testId,
  onClick,
}: {
  tone: 'mint' | 'warning' | 'danger'
  label: string
  testId?: string
  onClick?: () => void
}) {
  const dotColor =
    tone === 'mint'
      ? 'var(--color-mint-500)'
      : tone === 'warning'
        ? 'var(--color-warning-500)'
        : 'var(--color-danger-500)'
  const content = (
    <>
      <span
        className="mr-2 inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: dotColor }}
        aria-hidden="true"
      />
      {label}
    </>
  )
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center transition-colors hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-500)] focus-visible:ring-offset-2"
        data-testid={testId}
      >
        {content}
      </button>
    )
  }
  return (
    <span className="inline-flex items-center" data-testid={testId}>
      {content}
    </span>
  )
}
