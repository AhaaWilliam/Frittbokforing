import { useState } from 'react'
import { Printer } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useIncomeStatement, useBalanceSheet } from '../lib/hooks'
import { IncomeStatementView } from '../components/reports/IncomeStatementView'
import { BalanceSheetView } from '../components/reports/BalanceSheetView'

type Tab = 'income-statement' | 'balance-sheet'

export function PageReports() {
  const { activeFiscalYear } = useFiscalYearContext()
  const [tab, setTab] = useState<Tab>('income-statement')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')

  const fyId = activeFiscalYear?.id
  const dateRange =
    fromDate && toDate ? { from: fromDate, to: toDate } : undefined

  const { data: incomeStatement, isLoading: isLoadingIS } = useIncomeStatement(
    fyId,
    dateRange,
  )
  const { data: balanceSheet, isLoading: isLoadingBS } = useBalanceSheet(
    fyId,
    dateRange,
  )

  if (!activeFiscalYear) {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        <PageHeader title="Rapporter" />
        <p className="mt-16 text-center text-muted-foreground">
          Inget räkenskapsår valt.
        </p>
      </div>
    )
  }

  const isLoading = isLoadingIS || isLoadingBS

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <PageHeader
        title="Rapporter"
        action={
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm hover:bg-muted/50"
          >
            <Printer className="h-4 w-4" />
            Skriv ut
          </button>
        }
      />

      <div className="p-8 print:hidden">
        {/* Date filter */}
        <div className="mb-4 flex items-center gap-3">
          <span className="text-sm text-muted-foreground">Datumfilter:</span>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            min={activeFiscalYear.start_date}
            max={activeFiscalYear.end_date}
            className="rounded border px-2 py-1 text-sm"
          />
          <span className="text-muted-foreground">&mdash;</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            min={activeFiscalYear.start_date}
            max={activeFiscalYear.end_date}
            className="rounded border px-2 py-1 text-sm"
          />
          {dateRange && (
            <button
              onClick={() => {
                setFromDate('')
                setToDate('')
              }}
              className="text-sm text-muted-foreground underline"
            >
              Rensa
            </button>
          )}
          {!dateRange && (
            <span className="text-xs text-muted-foreground">
              Tomt = hela räkenskapsåret
            </span>
          )}
        </div>

        {/* Tab navigation */}
        <div className="mb-6 flex gap-1 border-b">
          <button
            onClick={() => setTab('income-statement')}
            className={`px-4 py-2 text-sm font-medium ${
              tab === 'income-statement'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Resultaträkning
          </button>
          <button
            onClick={() => setTab('balance-sheet')}
            className={`px-4 py-2 text-sm font-medium ${
              tab === 'balance-sheet'
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Balansräkning
          </button>
        </div>

        {/* Interactive view */}
        {isLoading && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Laddar...
          </div>
        )}
        {!isLoading && tab === 'income-statement' && incomeStatement && (
          <IncomeStatementView data={incomeStatement} />
        )}
        {!isLoading && tab === 'balance-sheet' && balanceSheet && (
          <BalanceSheetView data={balanceSheet} />
        )}
      </div>

      {/* M34: PrintContainer — always renders both reports, hidden on screen */}
      <div className="hidden print:block print:p-[15mm] print:text-[10pt]">
        {incomeStatement && (
          <IncomeStatementView data={incomeStatement} printMode />
        )}
        <div className="break-before-page" />
        {balanceSheet && <BalanceSheetView data={balanceSheet} printMode />}
      </div>
    </div>
  )
}
