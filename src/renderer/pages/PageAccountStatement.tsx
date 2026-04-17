import { useState, useMemo, useEffect } from 'react'
import { Printer } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useAllAccounts, useAccountStatement } from '../lib/hooks'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { formatReportAmount, todayLocal } from '../lib/format'
import { getHashParams, setHashParams } from '../lib/router'
import { subtractMonths } from '../../shared/date-utils'
import type { Account } from '../../shared/types'

const ACCOUNT_CLASS_NAMES: Record<number, string> = {
  1: 'Tillgångar',
  2: 'Skulder & EK',
  3: 'Intäkter',
  4: 'Kostnader',
  5: 'Kostnader',
  6: 'Kostnader',
  7: 'Kostnader',
  8: 'Finansiellt',
  9: 'Övrigt',
}

function getAccountClass(accountNumber: string): number {
  return parseInt(accountNumber[0])
}

function groupAccounts(accounts: Account[]) {
  const groups = new Map<number, Account[]>()
  for (const a of accounts) {
    const cls = getAccountClass(a.account_number)
    let list = groups.get(cls)
    if (!list) {
      list = []
      groups.set(cls, list)
    }
    list.push(a)
  }
  return groups
}

/**
 * Compute default date_from: today minus 3 months, clipped to FY start.
 * Pure string arithmetic — no new Date(dateString) (timezone invariant).
 */
export function defaultDateFrom(fyStart: string, today: string): string {
  const candidate = subtractMonths(today, 3)
  return candidate < fyStart ? fyStart : candidate
}

function balanceSuffix(ore: number): string {
  if (ore > 0) return ' (D)'
  if (ore < 0) return ' (K)'
  return ''
}

export function PageAccountStatement() {
  const { activeFiscalYear } = useFiscalYearContext()
  const { data: accounts = [] } = useAllAccounts(true)

  const today = todayLocal()
  const fyStart = activeFiscalYear?.start_date ?? today
  const fyEnd = activeFiscalYear?.end_date ?? today

  const [selectedAccount, setSelectedAccount] = useState<string>(() => {
    const params = getHashParams()
    return params.get('account') ?? ''
  })
  const [dateFrom, setDateFrom] = useState(() => {
    const params = getHashParams()
    return params.get('from') ?? defaultDateFrom(fyStart, today)
  })
  const [dateTo, setDateTo] = useState(() => {
    const params = getHashParams()
    return params.get('to') ?? (today > fyEnd ? fyEnd : today)
  })

  // Sync state → URL params
  useEffect(() => {
    const params: Record<string, string> = {}
    if (selectedAccount) params.account = selectedAccount
    if (dateFrom) params.from = dateFrom
    if (dateTo) params.to = dateTo
    setHashParams(params)
  }, [selectedAccount, dateFrom, dateTo])

  const {
    data: statement,
    isLoading,
    isError,
    error,
  } = useAccountStatement(
    activeFiscalYear?.id,
    selectedAccount || undefined,
    dateFrom || undefined,
    dateTo || undefined,
  )

  const groupedAccounts = useMemo(() => groupAccounts(accounts), [accounts])
  const selectedAccountName = useMemo(() => {
    if (!selectedAccount) return ''
    const acct = accounts.find((a) => a.account_number === selectedAccount)
    return acct ? `${acct.account_number} ${acct.name}` : selectedAccount
  }, [selectedAccount, accounts])

  if (!activeFiscalYear) {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        <PageHeader title="Kontoutdrag" />
        <p className="mt-16 text-center text-muted-foreground">
          Inget räkenskapsår valt.
        </p>
      </div>
    )
  }

  function handleShowFullYear() {
    setDateFrom(fyStart)
    setDateTo(fyEnd)
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Kontoutdrag"
        action={
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm hover:bg-muted/50"
            data-testid="print-button"
          >
            <Printer className="h-4 w-4" />
            Skriv ut
          </button>
        }
      />

      {/* Print-only header */}
      <div className="hidden print:block px-8 py-4" data-testid="print-header">
        <h2 className="text-base font-medium">{selectedAccountName}</h2>
        <p className="text-sm text-muted-foreground">
          Period: {dateFrom} &mdash; {dateTo}
        </p>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden px-8 py-4">
        {/* Filters */}
        <div
          className="mb-4 space-y-3 print:hidden"
          data-testid="filter-section"
        >
          <div className="flex items-center gap-3">
            <label htmlFor="account-select" className="text-sm font-medium">
              Konto:
            </label>
            <select
              id="account-select"
              value={selectedAccount}
              onChange={(e) => setSelectedAccount(e.target.value)}
              className="w-80 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Välj konto...</option>
              {Array.from(groupedAccounts.entries())
                .sort(([a], [b]) => a - b)
                .map(([cls, accts]) => (
                  <optgroup
                    key={cls}
                    label={`${cls} — ${ACCOUNT_CLASS_NAMES[cls] ?? ''}`}
                  >
                    {accts.map((a) => (
                      <option key={a.account_number} value={a.account_number}>
                        {a.account_number} {a.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label htmlFor="date-from" className="text-sm font-medium">
              Från:
            </label>
            <input
              id="date-from"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              min={activeFiscalYear.start_date}
              max={activeFiscalYear.end_date}
              className="rounded border px-2 py-1 text-sm"
            />
            <span className="text-muted-foreground">&mdash;</span>
            <label htmlFor="date-to" className="text-sm font-medium">
              Till:
            </label>
            <input
              id="date-to"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={activeFiscalYear.start_date}
              max={activeFiscalYear.end_date}
              className="rounded border px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={handleShowFullYear}
              className="text-sm text-primary hover:underline"
            >
              Visa hela räkenskapsåret
            </button>
          </div>
        </div>

        {/* Content area */}
        {!selectedAccount ? (
          <p className="mt-8 text-center text-muted-foreground">
            Välj ett konto för att visa kontoutdrag.
          </p>
        ) : isLoading ? (
          <LoadingSpinner />
        ) : isError ? (
          <div
            role="alert"
            className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            {(error as Error)?.message ?? 'Ett fel uppstod.'}
          </div>
        ) : statement && statement.lines.length === 0 ? (
          <p className="mt-8 text-center text-muted-foreground">
            Inga transaktioner för detta konto i vald period.
          </p>
        ) : statement ? (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Ver.nr</th>
                  <th className="px-3 py-2">Beskrivning</th>
                  <th className="px-3 py-2 text-right">Debet</th>
                  <th className="px-3 py-2 text-right">Kredit</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {statement.lines.map((line, i) => (
                  <tr key={i} className="border-b hover:bg-muted/50">
                    <td className="px-3 py-2">{line.date}</td>
                    <td className="px-3 py-2 font-mono">
                      {line.verification_series}
                      {line.verification_number}
                    </td>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2 text-right">
                      {line.debit_ore > 0
                        ? formatReportAmount(line.debit_ore)
                        : ''}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {line.credit_ore > 0
                        ? formatReportAmount(line.credit_ore)
                        : ''}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatReportAmount(Math.abs(line.running_balance_ore))}
                      {balanceSuffix(line.running_balance_ore)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-medium">
                  <td className="px-3 py-2" colSpan={3}>
                    Summa
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatReportAmount(statement.summary.total_debit_ore)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatReportAmount(statement.summary.total_credit_ore)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {formatReportAmount(
                      Math.abs(statement.summary.closing_balance_ore),
                    )}
                    {balanceSuffix(statement.summary.closing_balance_ore)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : null}
      </div>
    </div>
  )
}
