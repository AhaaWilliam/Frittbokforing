import type { CashFlowReport } from '../../../main/services/cash-flow-service'
import { formatReportAmount } from '../../lib/format'

interface Props {
  data: CashFlowReport
  fiscalYearLabel?: string
  printMode?: boolean
}

interface Section {
  label: string
  items: Array<{ label: string; amount_ore: number }>
  subtotal_ore: number
}

function SectionBlock({ section }: { section: Section }) {
  return (
    <div className="report-group mb-4">
      <h4 className="mb-1 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {section.label}
      </h4>
      {section.items.map((item, idx) => (
        <div
          key={`${item.label}-${idx}`}
          className="flex items-center justify-between py-1 pl-4"
        >
          <span className="text-sm">{item.label}</span>
          <span className="tabular-nums text-sm">
            {formatReportAmount(item.amount_ore)}
          </span>
        </div>
      ))}
      <div className="mt-1 flex justify-between border-t pt-1 text-sm font-medium">
        <span>Summa {section.label.toLowerCase()}</span>
        <span
          className="tabular-nums"
          data-testid={`cash-flow-subtotal-${section.label}`}
        >
          {formatReportAmount(section.subtotal_ore)}
        </span>
      </div>
    </div>
  )
}

export function CashFlowView({
  data,
  fiscalYearLabel,
  printMode: _printMode,
}: Props) {
  const reconciliation = data.openingCashOre + data.netChangeOre
  const drift = reconciliation - data.closingCashOre

  return (
    <div className="report-container max-w-2xl">
      <h2 className="mb-1 text-base font-semibold">
        Kassaflödesanalys — indirekt metod
      </h2>
      {fiscalYearLabel && (
        <p className="mb-4 text-xs text-muted-foreground">{fiscalYearLabel}</p>
      )}

      <SectionBlock section={data.operating} />
      <SectionBlock section={data.investing} />
      <SectionBlock section={data.financing} />

      <div className="mt-2 space-y-1 border-t pt-2">
        <div className="flex justify-between text-sm font-semibold">
          <span>Periodens kassaflöde</span>
          <span
            className="tabular-nums"
            data-testid="cash-flow-net-change"
            data-raw-ore={String(data.netChangeOre)}
          >
            {formatReportAmount(data.netChangeOre)}
          </span>
        </div>
        <div className="flex justify-between py-0.5 text-sm">
          <span className="text-muted-foreground">Ingående likvida medel</span>
          <span className="tabular-nums text-muted-foreground">
            {formatReportAmount(data.openingCashOre)}
          </span>
        </div>
        <div className="flex justify-between border-t pt-1 text-sm font-bold">
          <span>Utgående likvida medel</span>
          <span
            className="tabular-nums"
            data-testid="cash-flow-closing-cash"
            data-raw-ore={String(data.closingCashOre)}
          >
            {formatReportAmount(data.closingCashOre)}
          </span>
        </div>
      </div>

      {Math.abs(drift) > 0 && (
        <div
          role="alert"
          data-testid="cash-flow-drift-warning"
          className="mt-4 rounded border border-warning-100 bg-warning-100/40 px-3 py-2 text-xs text-warning-700"
        >
          <strong>Avstämning:</strong> Ingående + periodens kassaflöde (
          {formatReportAmount(reconciliation)}) stämmer inte exakt med utgående
          likvida medel ({formatReportAmount(data.closingCashOre)}). Differens{' '}
          <span className="tabular-nums">{formatReportAmount(drift)}</span>{' '}
          indikerar att årsresultatet inte har bokförts mot konto 2099 (se
          F65-b-dokumentation).
        </div>
      )}
    </div>
  )
}
