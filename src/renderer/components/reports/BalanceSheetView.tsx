import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type {
  BalanceSheetResult,
  ReportGroupResult,
} from '../../../shared/types'
import { formatReportAmount } from '../../lib/format'

interface Props {
  data: BalanceSheetResult
  printMode?: boolean
}

function BSGroupSection({
  group,
  printMode,
}: {
  group: ReportGroupResult
  printMode?: boolean
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const toggle = (lineId: string) => {
    if (printMode) return
    setExpanded((prev) => ({ ...prev, [lineId]: !prev[lineId] }))
  }

  const visibleLines = group.lines.filter(
    (l) => l.displayAmount !== 0 || l.accounts.length > 0,
  )

  if (visibleLines.length === 0) return null

  return (
    <div className="report-group mb-4">
      <h4 className="mb-1 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
        {group.label}
      </h4>
      {visibleLines.map((line) => {
        const isOpen = printMode || expanded[line.id]
        const hasAccounts =
          line.accounts.filter((a) => a.displayAmount !== 0).length > 0
        return (
          <div key={line.id}>
            <div
              className={`flex items-center justify-between py-1 ${hasAccounts && !printMode ? 'cursor-pointer hover:bg-muted/30' : ''}`}
              onClick={() => hasAccounts && toggle(line.id)}
            >
              <span className="flex items-center gap-1 text-sm">
                {hasAccounts && !printMode && (
                  <span className="w-4 text-muted-foreground">
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5" />
                    )}
                  </span>
                )}
                {!hasAccounts && !printMode && <span className="w-4" />}
                {line.label}
              </span>
              <span className="tabular-nums text-sm">
                {formatReportAmount(line.displayAmount)}
              </span>
            </div>
            {isOpen &&
              line.accounts
                .filter((a) => a.displayAmount !== 0)
                .map((a) => (
                  <div
                    key={a.accountNumber}
                    className="flex items-center justify-between py-0.5 pl-9 text-sm text-muted-foreground"
                  >
                    <span>
                      <span className="font-mono text-xs">
                        {a.accountNumber}
                      </span>{' '}
                      {a.accountName}
                    </span>
                    <span className="tabular-nums">
                      {formatReportAmount(a.displayAmount)}
                    </span>
                  </div>
                ))}
          </div>
        )
      })}
      <div className="mt-1 flex justify-between border-t pt-1 text-sm font-medium">
        <span>Summa {group.label.toLowerCase()}</span>
        <span className="tabular-nums">
          {formatReportAmount(group.subtotalDisplay)}
        </span>
      </div>
    </div>
  )
}

export function BalanceSheetView({ data, printMode }: Props) {
  const { assets, equityAndLiabilities, balanceDifference } = data

  return (
    <div className="report-container max-w-2xl">
      <h2 className="mb-1 text-base font-semibold">Balansräkning</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        {data.dateRange
          ? `${data.dateRange.from} \u2013 ${data.dateRange.to}`
          : `${data.fiscalYear.startDate} \u2013 ${data.fiscalYear.endDate}`}
      </p>

      {/* TILLGÅNGAR */}
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wider">
        Tillgångar
      </h3>
      {assets.groups.map((group) => (
        <BSGroupSection key={group.id} group={group} printMode={printMode} />
      ))}
      <div className="mb-6 flex justify-between border-t border-b py-1 text-sm font-bold">
        <span>SUMMA TILLGÅNGAR</span>
        <span className="tabular-nums">{formatReportAmount(assets.total)}</span>
      </div>

      {/* EGET KAPITAL OCH SKULDER */}
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wider">
        Eget kapital och skulder
      </h3>
      {equityAndLiabilities.groups.map((group) => (
        <BSGroupSection key={group.id} group={group} printMode={printMode} />
      ))}

      {/* Årets resultat (dynamic) */}
      {equityAndLiabilities.calculatedNetResult !== 0 && (
        <div className="mb-4 ml-5">
          <div className="flex justify-between py-1 text-sm">
            <span className="italic">
              Årets resultat{' '}
              <span className="text-xs text-muted-foreground">
                (preliminärt beräknat)
              </span>
            </span>
            <span className="tabular-nums">
              {formatReportAmount(equityAndLiabilities.calculatedNetResult)}
            </span>
          </div>
        </div>
      )}

      <div className="mb-2 flex justify-between border-t border-b py-1 text-sm font-bold">
        <span>SUMMA EGET KAPITAL OCH SKULDER</span>
        <span className="tabular-nums">
          {formatReportAmount(equityAndLiabilities.total)}
        </span>
      </div>

      {balanceDifference !== 0 && (
        <div className="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">
          {'\u26A0'} Differens: {formatReportAmount(balanceDifference)} kr
        </div>
      )}
    </div>
  )
}
