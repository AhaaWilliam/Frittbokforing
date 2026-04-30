import { Callout } from '../../components/ui/Callout'
import { Pill, type PillVariant } from '../../components/ui/Pill'
import { CheckLine } from '../../components/ui/CheckLine'
import { useInvoiceList } from '../../lib/hooks'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useUiMode } from '../../lib/use-ui-mode'
import { formatKr } from '../../lib/format'
import type { InvoiceListItem } from '../../../shared/types'

/**
 * Sprint 22 — placeholder.
 * Sprint 70 — visa senaste 5 finaliserade fakturor (read-only).
 *
 * Quick-fakturering kräver produktbeslut (auto-default-konton, moms-default,
 * customer-snabbskapande). Tills dess ger sidan minst översikt över aktivitet:
 * vad har skickats, vilka är förfallna, hur står det till med inbetalningar.
 */

const STATUS_PILL: Record<string, { variant: PillVariant; label: string }> = {
  draft: { variant: 'neutral', label: 'Utkast' },
  unpaid: { variant: 'warning', label: 'Obetald' },
  partial: { variant: 'warning', label: 'Delbetald' },
  paid: { variant: 'success', label: 'Betald' },
  overdue: { variant: 'danger', label: 'Förfallen' },
  void: { variant: 'neutral', label: 'Ogiltigförklarad' },
}

function InvoiceRow({ inv }: { inv: InvoiceListItem }) {
  const pill = STATUS_PILL[inv.status] ?? STATUS_PILL.unpaid
  const isOverdue = inv.status === 'overdue'
  return (
    <li
      className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4"
      data-testid="income-invoice-row"
    >
      <div className="flex flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="font-medium text-neutral-900">
            {inv.counterparty_name}
          </span>
          <span className="font-mono text-xs text-neutral-500">
            #{inv.invoice_number || '—'}
          </span>
        </div>
        <span
          className={`text-xs ${isOverdue ? 'text-status-overdue' : 'text-neutral-500'}`}
        >
          Förfaller {inv.due_date}
          {inv.remaining > 0 &&
            inv.remaining < inv.total_amount_ore &&
            ` · ${formatKr(inv.remaining)} kvar`}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm text-neutral-900">
          {formatKr(inv.total_amount_ore)}
        </span>
        <Pill variant={pill.variant} size="sm">
          {pill.label}
        </Pill>
      </div>
    </li>
  )
}

export function VardagPageIncome() {
  const { activeFiscalYear } = useFiscalYearContext()
  const { setMode } = useUiMode()
  const { data: list, isLoading } = useInvoiceList(activeFiscalYear?.id, {
    sort_by: 'invoice_date',
    sort_order: 'desc',
    limit: 5,
  }) as {
    data: { items: InvoiceListItem[] } | undefined
    isLoading: boolean
  }

  // Filtrera bort utkast — visningen handlar om "vad har skickats".
  const recent = (list?.items ?? []).filter((i) => i.status !== 'draft')

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header>
        <h1 className="font-display text-3xl font-semibold text-neutral-900">
          Skicka faktura
        </h1>
        <p className="text-sm text-neutral-500">
          Senaste skickade fakturor och deras status.
        </p>
      </header>

      <section aria-label="Senaste fakturor">
        <h2 className="mb-3 text-sm font-medium text-neutral-700">
          Senaste 5 fakturor
        </h2>

        {!activeFiscalYear ? (
          <ul className="flex flex-col gap-3" data-testid="income-no-fy">
            <li className="rounded-lg border border-neutral-200 bg-white p-4">
              <CheckLine
                state="info"
                label="Inget aktivt räkenskapsår"
                description="Välj eller skapa ett räkenskapsår för att se fakturor."
              />
            </li>
          </ul>
        ) : isLoading ? (
          <ul className="flex flex-col gap-3">
            <li className="rounded-lg border border-neutral-200 bg-white p-4">
              <CheckLine
                state="pending"
                label="Laddar..."
                description="Hämtar dina senaste fakturor."
              />
            </li>
          </ul>
        ) : recent.length === 0 ? (
          <ul className="flex flex-col gap-3" data-testid="income-empty">
            <li className="rounded-lg border border-neutral-200 bg-white p-4">
              <CheckLine
                state="info"
                label="Inga skickade fakturor ännu"
                description="När du har skickat din första faktura visas den här."
              />
            </li>
          </ul>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="income-list">
            {recent.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} />
            ))}
          </ul>
        )}
      </section>

      <Callout variant="tip" title="Snabb-fakturering kommer">
        Detta är en överblick. För att skapa eller skicka fakturor, växla till{' '}
        <button
          type="button"
          onClick={() => setMode('bokforare')}
          className="font-medium text-brand-700 underline-offset-2 hover:underline"
          data-testid="income-fallback-link"
        >
          Bokförar-läget
        </button>
        .
      </Callout>
    </div>
  )
}
