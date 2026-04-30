import { Callout } from '../../components/ui/Callout'
import { CheckLine } from '../../components/ui/CheckLine'
import { Pill } from '../../components/ui/Pill'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import {
  useDraftInvoices,
  useExpenseDrafts,
  useDashboardSummary,
  useInvoiceList,
  useExpenses,
} from '../../lib/hooks'
import { formatKr } from '../../lib/format'
import { useUiMode } from '../../lib/use-ui-mode'

/**
 * Sprint 22 — Vardag inkorg (placeholder).
 * Sprint 26 — Riktiga data: utkasts-fakturor, utkast-kostnader,
 * obetalda fordringar/skulder via dashboard-summary.
 *
 * "Vad behöver jag göra idag?"
 */
export function VardagPageInbox() {
  const { activeFiscalYear } = useFiscalYearContext()
  const { setMode } = useUiMode()
  const { data: invoiceDrafts, isLoading: invoicesLoading } = useDraftInvoices(
    activeFiscalYear?.id,
  )
  const { data: expenseDrafts, isLoading: expensesLoading } = useExpenseDrafts(
    activeFiscalYear?.id,
  )
  const { data: summary } = useDashboardSummary(activeFiscalYear?.id)
  // Sprint 77 — överblick-counts från list-respons (counts.overdue).
  // limit:1 håller payload minimal — vi tittar bara på counts.
  const { data: invList } = useInvoiceList(activeFiscalYear?.id, {
    limit: 1,
  }) as { data: { counts: { overdue: number } } | undefined }
  const { data: expList } = useExpenses(activeFiscalYear?.id, {
    limit: 1,
  }) as { data: { counts: { overdue: number } } | undefined }

  const invoiceDraftCount = invoiceDrafts?.length ?? 0
  const expenseDraftCount = expenseDrafts?.length ?? 0
  const hasReceivables = (summary?.unpaidReceivablesOre ?? 0) > 0
  const hasPayables = (summary?.unpaidPayablesOre ?? 0) > 0
  const overdueInvoices = invList?.counts.overdue ?? 0
  const overdueExpenses = expList?.counts.overdue ?? 0

  const isLoading = invoicesLoading || expensesLoading
  const hasItems =
    invoiceDraftCount > 0 ||
    expenseDraftCount > 0 ||
    hasReceivables ||
    hasPayables ||
    overdueInvoices > 0 ||
    overdueExpenses > 0

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Inkorg
        </h1>
        <p className="text-sm text-neutral-500">Vad behöver göras idag?</p>
      </header>

      <ul
        className="flex flex-col gap-3"
        aria-label="Att göra"
        data-testid="inbox-items"
      >
        {!activeFiscalYear ? (
          <li className="rounded-lg border border-neutral-200 bg-white p-4">
            <CheckLine
              state="info"
              label="Inget aktivt räkenskapsår"
              description="Välj eller skapa ett räkenskapsår för att se data."
            />
          </li>
        ) : isLoading ? (
          <li className="rounded-lg border border-neutral-200 bg-white p-4">
            <CheckLine
              state="pending"
              label="Laddar..."
              description="Hämtar dina utkast och fordringar."
            />
          </li>
        ) : !hasItems ? (
          <li className="rounded-lg border border-neutral-200 bg-white p-4">
            <CheckLine
              state="check"
              label="Inget brådskande"
              description="Du har inga utkast att slutföra eller obetalda fordringar att följa upp."
            />
          </li>
        ) : (
          <>
            {/* Sprint 77 — överst: förfallna behöver action snabbast */}
            {overdueInvoices > 0 && (
              <li
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4"
                data-testid="inbox-overdue-invoices"
              >
                <CheckLine
                  state="cross"
                  label={
                    overdueInvoices === 1
                      ? '1 faktura är förfallen'
                      : `${overdueInvoices} fakturor är förfallna`
                  }
                  description="Följ upp betalning från kunden."
                />
                <Pill variant="danger">{overdueInvoices}</Pill>
              </li>
            )}
            {overdueExpenses > 0 && (
              <li
                className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4"
                data-testid="inbox-overdue-expenses"
              >
                <CheckLine
                  state="cross"
                  label={
                    overdueExpenses === 1
                      ? '1 leverantörsfaktura är förfallen'
                      : `${overdueExpenses} leverantörsfakturor är förfallna`
                  }
                  description="Betala för att undvika räntor och avgifter."
                />
                <Pill variant="danger">{overdueExpenses}</Pill>
              </li>
            )}
            {invoiceDraftCount > 0 && (
              <li className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <CheckLine
                  state="cross"
                  label={`${invoiceDraftCount} faktura-utkast väntar`}
                  description="Slutför och skicka för att registrera försäljningen."
                />
                <Pill variant="warning">{invoiceDraftCount}</Pill>
              </li>
            )}
            {expenseDraftCount > 0 && (
              <li className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <CheckLine
                  state="cross"
                  label={`${expenseDraftCount} kostnads-utkast väntar`}
                  description="Bokför kostnaderna när de är klara."
                />
                <Pill variant="warning">{expenseDraftCount}</Pill>
              </li>
            )}
            {hasReceivables && summary && (
              <li className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <CheckLine
                  state="info"
                  label="Obetalda kundfordringar"
                  description={`${formatKr(summary.unpaidReceivablesOre)} att fakturera in.`}
                />
                <Pill variant="info">Att få in</Pill>
              </li>
            )}
            {hasPayables && summary && (
              <li className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <CheckLine
                  state="info"
                  label="Obetalda leverantörsskulder"
                  description={`${formatKr(summary.unpaidPayablesOre)} att betala ut.`}
                />
                <Pill variant="info">Att betala</Pill>
              </li>
            )}
          </>
        )}
      </ul>

      {hasItems && (
        <Callout variant="tip">
          För att slutföra ett utkast eller registrera betalning, växla till{' '}
          <button
            type="button"
            onClick={() => setMode('bokforare')}
            className="font-medium text-brand-700 underline-offset-2 hover:underline"
            data-testid="inbox-fallback-link"
          >
            Bokförar-läget
          </button>{' '}
          tills full Vardag-redigering är klar.
        </Callout>
      )}
    </div>
  )
}
