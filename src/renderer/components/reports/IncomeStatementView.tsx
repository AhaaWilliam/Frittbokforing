import { useState } from 'react'
import { ChevronRight, ChevronDown } from 'lucide-react'
import type {
  IncomeStatementResult,
  ReportGroupResult,
} from '../../../shared/types'
import { formatReportAmount } from '../../lib/format'

interface Props {
  data: IncomeStatementResult
  printMode?: boolean
}

function ReportGroupSection({
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

export function IncomeStatementView({ data, printMode }: Props) {
  return (
    <div className="report-container max-w-2xl">
      <h2 className="mb-1 text-base font-semibold">Resultaträkning</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        {data.dateRange
          ? `${data.dateRange.from} \u2013 ${data.dateRange.to}`
          : `${data.fiscalYear.startDate} \u2013 ${data.fiscalYear.endDate}`}
      </p>

      {data.groups.map((group) => (
        <ReportGroupSection
          key={group.id}
          group={group}
          printMode={printMode}
        />
      ))}

      {/* Intermediate totals */}
      <div className="mt-2 space-y-1 border-t pt-2">
        <div className="flex justify-between text-sm font-semibold">
          <span>Rörelseresultat</span>
          <span className="tabular-nums">
            {formatReportAmount(data.operatingResult)}
          </span>
        </div>
        <div className="flex justify-between text-sm font-semibold">
          <span>Resultat efter finansiella poster</span>
          <span className="tabular-nums">
            {formatReportAmount(data.resultAfterFinancial)}
          </span>
        </div>
        <div className="flex justify-between border-t pt-1 text-sm font-bold">
          <span>Årets resultat</span>
          <span
            className="tabular-nums"
            data-testid="arets-resultat-value"
            data-raw-ore={String(data.netResult)}
          >
            {formatReportAmount(data.netResult)}
          </span>
        </div>
      </div>
    </div>
  )
}
