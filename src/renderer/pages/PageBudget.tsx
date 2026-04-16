import { useState, useEffect, useCallback } from 'react'
import { Printer } from 'lucide-react'
import { toast } from 'sonner'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import {
  useBudgetLines,
  useBudgetTargets,
  useBudgetVariance,
  useSaveBudgetTargets,
  useCopyBudgetFromPreviousFy,
  useFiscalYears,
} from '../lib/hooks'
import { formatKr } from '../lib/format'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import type { BudgetLineMeta } from '../../shared/types'

type Tab = 'budget' | 'variance'

// Grid state: lineId → periodNumber → amount in öre
type GridState = Record<string, Record<number, number>>

function buildGridFromTargets(
  targets: Array<{ line_id: string; period_number: number; amount_ore: number }>,
): GridState {
  const grid: GridState = {}
  for (const t of targets) {
    if (!grid[t.line_id]) grid[t.line_id] = {}
    grid[t.line_id][t.period_number] = t.amount_ore
  }
  return grid
}

function oreToKr(ore: number): string {
  return (ore / 100).toFixed(0)
}

function krToOre(kr: string): number {
  const n = parseFloat(kr)
  return isNaN(n) ? 0 : Math.round(n * 100)
}

const PERIOD_LABELS = Array.from({ length: 12 }, (_, i) => `P${i + 1}`)

// ═══ Budget Input Grid ═══

function BudgetInputGrid({
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

// ═══ Variance Grid ═══

function VarianceGrid({ fiscalYearId }: { fiscalYearId: number }) {
  const { data: report, isLoading } = useBudgetVariance(fiscalYearId)

  if (isLoading) return <LoadingSpinner />
  if (!report) return null

  let currentGroupId = ''

  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs font-medium text-muted-foreground">
            <th className="sticky left-0 bg-background px-3 py-2 min-w-[200px]" rowSpan={2}>
              Rad
            </th>
            {PERIOD_LABELS.map((label) => (
              <th key={label} className="px-1 py-1 text-center border-l" colSpan={3}>
                {label}
              </th>
            ))}
            <th className="px-1 py-1 text-center border-l font-semibold" colSpan={3}>
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
  line: import('../../shared/types').BudgetVarianceLine
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
          <VarianceCells key={p.periodNumber} budget={p.budgetOre} actual={p.actualOre} variance={p.varianceOre} />
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
    variance > 0
      ? 'text-green-600'
      : variance < 0
        ? 'text-red-600'
        : ''
  const weight = bold ? 'font-medium' : ''

  return (
    <>
      <td className={`px-1 py-1.5 text-right tabular-nums border-l ${weight}`}>
        {budget !== 0 ? formatKr(budget) : '—'}
      </td>
      <td className={`px-1 py-1.5 text-right tabular-nums ${weight}`}>
        {actual !== 0 ? formatKr(actual) : '—'}
      </td>
      <td className={`px-1 py-1.5 text-right tabular-nums ${varianceColor} ${weight}`}>
        {variance !== 0 ? formatKr(variance) : '—'}
      </td>
    </>
  )
}

// ═══ Page ═══

export function PageBudget() {
  const { activeFiscalYear } = useFiscalYearContext()
  const [activeTab, setActiveTab] = useState<Tab>('budget')
  const { data: lines, isLoading: linesLoading, error: linesError } = useBudgetLines()

  if (!activeFiscalYear) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Inget räkenskapsår valt.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden" data-testid="page-budget">
      <PageHeader
        title="Budget"
        action={
          activeTab === 'variance' ? (
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted print:hidden"
            >
              <Printer className="h-4 w-4" />
              Skriv ut
            </button>
          ) : undefined
        }
      />

      <div className="flex items-center gap-2 px-6 pb-3 print:hidden">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'budget'}
          onClick={() => setActiveTab('budget')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            activeTab === 'budget'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Budget
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'variance'}
          onClick={() => setActiveTab('variance')}
          className={`rounded-md px-3 py-1.5 text-sm font-medium ${
            activeTab === 'variance'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          Avvikelse
        </button>
      </div>

      <div className="flex-1 overflow-auto px-6 pb-6">
        {linesError ? (
          <div className="p-4 text-sm text-red-600">Kunde inte ladda budgetrader.</div>
        ) : linesLoading ? (
          <LoadingSpinner />
        ) : !lines ? null : activeTab === 'budget' ? (
          <BudgetInputGrid
            lines={lines}
            fiscalYearId={activeFiscalYear.id}
          />
        ) : (
          <VarianceGrid fiscalYearId={activeFiscalYear.id} />
        )}
      </div>
    </div>
  )
}
