import { useBudgetVariance } from '../../lib/hooks'
import { formatKr } from '../../lib/format'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { PERIOD_LABELS } from './budget-grid-utils'

export function VarianceGrid({ fiscalYearId }: { fiscalYearId: number }) {
  const { data: report, isLoading } = useBudgetVariance(fiscalYearId)

  if (isLoading) return <LoadingSpinner />
  if (!report) return null

  let currentGroupId = ''

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            <th
              className="sticky left-0 bg-background px-3 py-2 min-w-[200px]"
              rowSpan={2}
            >
              Rad
            </th>
            {PERIOD_LABELS.map((label) => (
              <th
                key={label}
                className="px-1 py-1 text-center border-l"
                colSpan={3}
              >
                {label}
              </th>
            ))}
            <th
              className="px-1 py-1 text-center border-l font-semibold"
              colSpan={3}
            >
              Helår
            </th>
          </tr>
          <tr className="border-b text-[10px] text-muted-foreground">
            {[...PERIOD_LABELS, 'Helår'].map((label) => (
              <VarianceSubHeaders key={label} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {report.lines.map((line) => {
            const showGroup = line.groupId !== currentGroupId
            currentGroupId = line.groupId
            return (
              <VarianceRow
                key={line.lineId}
                line={line}
                showGroupHeader={showGroup}
              />
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function VarianceSubHeaders() {
  return (
    <>
      <th className="px-1 py-1 text-right border-l">Budget</th>
      <th className="px-1 py-1 text-right">Utfall</th>
      <th className="px-1 py-1 text-right">Avvik.</th>
    </>
  )
}

function VarianceRow({
  line,
  showGroupHeader,
}: {
  line: import('../../../shared/types').BudgetVarianceLine
  showGroupHeader: boolean
}) {
  return (
    <>
      {showGroupHeader && (
        <tr>
          <td
            colSpan={40}
            className="bg-muted/50 px-3 py-1.5 text-xs font-semibold text-muted-foreground"
          >
            {line.groupLabel}
          </td>
        </tr>
      )}
      <tr>
        <td className="sticky left-0 bg-background px-3 py-1.5 text-sm">
          {line.label}
        </td>
        {line.periods.map((p) => (
          <VarianceCells
            key={p.periodNumber}
            budget={p.budgetOre}
            actual={p.actualOre}
            variance={p.varianceOre}
          />
        ))}
        <VarianceCells
          budget={line.totalBudgetOre}
          actual={line.totalActualOre}
          variance={line.totalVarianceOre}
          bold
        />
      </tr>
    </>
  )
}

function VarianceCells({
  budget,
  actual,
  variance,
  bold,
}: {
  budget: number
  actual: number
  variance: number
  bold?: boolean
}) {
  const varianceColor =
    variance > 0 ? 'text-green-600' : variance < 0 ? 'text-red-600' : ''
  const weight = bold ? 'font-medium' : ''

  return (
    <>
      <td className={`px-1 py-1.5 text-right tabular-nums border-l ${weight}`}>
        {budget !== 0 ? formatKr(budget) : '—'}
      </td>
      <td className={`px-1 py-1.5 text-right tabular-nums ${weight}`}>
        {actual !== 0 ? formatKr(actual) : '—'}
      </td>
      <td
        className={`px-1 py-1.5 text-right tabular-nums ${varianceColor} ${weight}`}
      >
        {variance !== 0 ? formatKr(variance) : '—'}
      </td>
    </>
  )
}
