import { useState } from 'react'
import { Printer } from 'lucide-react'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useBudgetLines, useFiscalPeriods } from '../lib/hooks'
import { PageHeader } from '../components/layout/PageHeader'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { BudgetInputGrid } from '../components/budget/BudgetInputGrid'
import { VarianceGrid } from '../components/budget/VarianceGrid'

type Tab = 'budget' | 'variance'

export function PageBudget() {
  const { activeFiscalYear } = useFiscalYearContext()
  const [activeTab, setActiveTab] = useState<Tab>('budget')
  const {
    data: lines,
    isLoading: linesLoading,
    error: linesError,
  } = useBudgetLines()
  const { data: periods } = useFiscalPeriods(activeFiscalYear?.id)
  const periodCount = periods?.length ?? 12

  if (!activeFiscalYear) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Inget räkenskapsår valt.
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
          <div className="p-4 text-sm text-red-600">
            Kunde inte ladda budgetrader.
          </div>
        ) : linesLoading ? (
          <LoadingSpinner />
        ) : !lines ? null : activeTab === 'budget' ? (
          <BudgetInputGrid
            lines={lines}
            fiscalYearId={activeFiscalYear.id}
            periodCount={periodCount}
          />
        ) : (
          <VarianceGrid fiscalYearId={activeFiscalYear.id} />
        )}
      </div>
    </div>
  )
}
