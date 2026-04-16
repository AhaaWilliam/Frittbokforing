import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import {
  useBudgetTargets,
  useSaveBudgetTargets,
  useCopyBudgetFromPreviousFy,
  useFiscalYears,
} from '../../lib/hooks'
import { formatKr } from '../../lib/format'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import type { BudgetLineMeta } from '../../../shared/types'
import {
  buildGridFromTargets,
  krToOre,
  oreToKr,
  PERIOD_LABELS,
  type GridState,
} from './budget-grid-utils'

export function BudgetInputGrid({
  lines,
  fiscalYearId,
}: {
  lines: BudgetLineMeta[]
  fiscalYearId: number
}) {
  const { data: targets, isLoading } = useBudgetTargets(fiscalYearId)
  const saveMutation = useSaveBudgetTargets()
  const copyMutation = useCopyBudgetFromPreviousFy()
  const { data: fiscalYears } = useFiscalYears()

  const [grid, setGrid] = useState<GridState>({})
  const [dirty, setDirty] = useState(false)

  useEffect(() => {
    if (targets) {
      setGrid(buildGridFromTargets(targets))
      setDirty(false)
    }
  }, [targets])

  const previousFy = fiscalYears
    ?.filter((fy) => fy.id !== fiscalYearId)
    .sort((a, b) => b.id - a.id)[0]

  const setCellValue = useCallback(
    (lineId: string, period: number, valueKr: string) => {
      setGrid((prev) => ({
        ...prev,
        [lineId]: { ...(prev[lineId] ?? {}), [period]: krToOre(valueKr) },
      }))
      setDirty(true)
    },
    [],
  )

  function getLineTotal(lineId: string): number {
    const periods = grid[lineId]
    if (!periods) return 0
    return Object.values(periods).reduce((s, v) => s + v, 0)
  }

  async function handleSave() {
    const allTargets: Array<{
      line_id: string
      period_number: number
      amount_ore: number
    }> = []
    for (const [lineId, periods] of Object.entries(grid)) {
      for (const [pStr, ore] of Object.entries(periods)) {
        allTargets.push({
          line_id: lineId,
          period_number: parseInt(pStr, 10),
          amount_ore: ore,
        })
      }
    }
    if (allTargets.length === 0) return

    try {
      await saveMutation.mutateAsync({
        fiscal_year_id: fiscalYearId,
        targets: allTargets,
      })
      toast.success('Budget sparad')
      setDirty(false)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte spara budget',
      )
    }
  }

  async function handleCopy() {
    if (!previousFy) return
    try {
      const result = await copyMutation.mutateAsync({
        target_fiscal_year_id: fiscalYearId,
        source_fiscal_year_id: previousFy.id,
      })
      toast.success(`${result.count} budgetvärden kopierade`)
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Kunde inte kopiera budget',
      )
    }
  }

  function handleDistributeEvenly() {
    setGrid((prev) => {
      const next = { ...prev }
      for (const line of lines) {
        const total = getLineTotal(line.lineId)
        if (total === 0) continue
        const perPeriod = Math.floor(total / 12)
        const remainder = total - perPeriod * 12
        const periods: Record<number, number> = {}
        for (let p = 1; p <= 12; p++) {
          periods[p] = perPeriod + (p === 12 ? remainder : 0)
        }
        next[line.lineId] = periods
      }
      return next
    })
    setDirty(true)
  }

  if (isLoading) return <LoadingSpinner />

  let currentGroupId = ''

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3 print:hidden">
        <button
          type="button"
          onClick={handleSave}
          disabled={!dirty || saveMutation.isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saveMutation.isPending ? 'Sparar...' : 'Spara'}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!previousFy || copyMutation.isPending}
          title={previousFy ? `Kopiera från ${previousFy.year_label}` : 'Inget tidigare räkenskapsår'}
          className="rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Kopiera från förra året
        </button>
        <button
          type="button"
          onClick={handleDistributeEvenly}
          className="rounded-md border border-input px-3 py-2 text-sm font-medium hover:bg-muted"
        >
          Fördela jämnt
        </button>
      </div>

      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs font-medium text-muted-foreground">
              <th className="sticky left-0 bg-background px-3 py-2 min-w-[200px]">Rad</th>
              {PERIOD_LABELS.map((label) => (
                <th key={label} className="px-2 py-2 text-right min-w-[80px]">
                  {label}
                </th>
              ))}
              <th className="px-2 py-2 text-right min-w-[90px] font-semibold">Helår</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {lines.map((line) => {
              const showGroup = line.groupId !== currentGroupId
              currentGroupId = line.groupId
              return (
                <BudgetInputRow
                  key={line.lineId}
                  line={line}
                  grid={grid}
                  showGroupHeader={showGroup}
                  onCellChange={setCellValue}
                  lineTotal={getLineTotal(line.lineId)}
                />
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function BudgetInputRow({
  line,
  grid,
  showGroupHeader,
  onCellChange,
  lineTotal,
}: {
  line: BudgetLineMeta
  grid: GridState
  showGroupHeader: boolean
  onCellChange: (lineId: string, period: number, value: string) => void
  lineTotal: number
}) {
  return (
    <>
      {showGroupHeader && (
        <tr>
          <td
            colSpan={14}
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
        {PERIOD_LABELS.map((_, i) => {
          const period = i + 1
          const ore = grid[line.lineId]?.[period] ?? 0
          return (
            <td key={period} className="px-1 py-1">
              <input
                type="number"
                step="1"
                value={ore === 0 ? '' : oreToKr(ore)}
                onChange={(e) => onCellChange(line.lineId, period, e.target.value)}
                className="w-full rounded border border-input bg-background px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                aria-label={`${line.label} ${PERIOD_LABELS[i]}`}
              />
            </td>
          )
        })}
        <td className="px-2 py-1.5 text-right text-sm font-medium tabular-nums">
          {lineTotal !== 0 ? formatKr(lineTotal) : '—'}
        </td>
      </tr>
    </>
  )
}
