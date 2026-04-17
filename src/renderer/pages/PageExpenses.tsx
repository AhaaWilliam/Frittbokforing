import { useState } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { useExpenseDraft, useExpense, useExpensePayments } from '../lib/hooks'
import { formatKr } from '../lib/format'
import { ExpenseList } from '../components/expenses/ExpenseList'
import { ExpenseForm } from '../components/expenses/ExpenseForm'
import { PayExpenseDialog } from '../components/expenses/PayExpenseDialog'
import {
  EntityListPage,
  type SubViewNav,
} from '../components/layout/EntityListPage'
import { useSubViewNavigation } from '../lib/use-route-navigation'
import type { ExpenseDetail, ExpensePayment } from '../../shared/types'

function EditView({
  id,
  onSave,
  onCancel,
  onPay,
}: {
  id: number
  onSave: () => void
  onCancel: () => void
  onPay: (expenseId: number) => void
}) {
  const { data: draft, isLoading } = useExpenseDraft(id)
  const { data: expense } = useExpense(id) as {
    data: ExpenseDetail | undefined
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Laddar utkast...
      </div>
    )
  }

  if (!draft) {
    if (expense) {
      const canPay =
        expense.status === 'unpaid' ||
        expense.status === 'overdue' ||
        expense.status === 'partial'
      return (
        <div className="flex flex-1 flex-col overflow-auto px-6 py-4">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Denna kostnad har bokförts.
            </p>
            {canPay && (
              <button
                type="button"
                onClick={() => onPay(expense.id)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Betala
              </button>
            )}
          </div>
          <ExpenseDetailReadonly expense={expense} />
        </div>
      )
    }
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Utkast hittades inte.
      </div>
    )
  }

  return <ExpenseForm expenseId={id} onSave={onSave} onCancel={onCancel} />
}

function ExpenseDetailReadonly({ expense }: { expense: ExpenseDetail }) {
  const { data: payments } = useExpensePayments(expense.id) as {
    data: ExpensePayment[] | undefined
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border p-4 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Beskrivning:</span>
          <span>{expense.description}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Leverantör:</span>
          <span>{expense.counterparty_name ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Datum:</span>
          <span>{expense.expense_date}</span>
        </div>
        {expense.due_date && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Förfallodatum:</span>
            <span>{expense.due_date}</span>
          </div>
        )}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Totalbelopp:</span>
          <span className="font-medium">
            {formatKr(expense.total_amount_ore)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Betalt:</span>
          <span>{formatKr(expense.total_paid)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Kvarstående:</span>
          <span className="font-semibold text-primary">
            {formatKr(expense.remaining)}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">Status:</span>
          <span>{expense.status}</span>
        </div>
      </div>

      {expense.lines.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Rader</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-1 pr-4">Beskrivning</th>
                <th className="pb-1 pr-4">Konto</th>
                <th className="pb-1 text-right">Belopp</th>
              </tr>
            </thead>
            <tbody>
              {expense.lines.map((line, i) => (
                <tr key={line.id ?? i} className="border-b last:border-0">
                  <td className="py-1 pr-4">{line.description}</td>
                  <td className="py-1 pr-4">{line.account_number}</td>
                  <td className="py-1 text-right">
                    {formatKr(line.line_total_ore)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {payments && payments.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-medium">Betalningar</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="pb-1 pr-4">Datum</th>
                <th className="pb-1 pr-4">Metod</th>
                <th className="pb-1 text-right">Belopp</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-1 pr-4">{p.payment_date}</td>
                  <td className="py-1 pr-4">{p.payment_method ?? '—'}</td>
                  <td className="py-1 text-right">{formatKr(p.amount_ore)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function ViewExpense({
  id,
  onBack,
  onPay,
}: {
  id: number
  onBack: () => void
  onPay: (expenseId: number) => void
}) {
  const { data: expense, isLoading } = useExpense(id) as {
    data: ExpenseDetail | undefined
    isLoading: boolean
  }

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Laddar kostnad...
      </div>
    )
  }

  if (!expense) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
        Kostnaden hittades inte.
      </div>
    )
  }

  const canPay =
    expense.status === 'unpaid' ||
    expense.status === 'overdue' ||
    expense.status === 'partial'

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <PageHeader
        title={expense.description}
        action={
          <div className="flex items-center gap-2">
            {canPay && (
              <button
                type="button"
                onClick={() => onPay(expense.id)}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Betala
              </button>
            )}
            <button
              type="button"
              onClick={onBack}
              className="rounded-md border border-input px-3 py-1.5 text-sm font-medium hover:bg-muted"
            >
              &larr; Tillbaka
            </button>
          </div>
        }
      />
      <div className="px-6 py-4">
        <ExpenseDetailReadonly expense={expense} />
      </div>
    </div>
  )
}

function navToNavigate(nav: SubViewNav) {
  return (target: 'form' | { edit: number } | { view: number }) => {
    if (target === 'form') nav.goToCreate()
    else if ('edit' in target) nav.goToEdit(target.edit)
    else nav.goToView(target.view)
  }
}

function PayDialog({
  payingExpenseId,
  onClose,
}: {
  payingExpenseId: number | null
  onClose: () => void
}) {
  const { data: payingExpense } = useExpense(payingExpenseId ?? undefined) as {
    data: ExpenseDetail | undefined
  }

  if (!payingExpense || payingExpenseId === null) return null

  return (
    <PayExpenseDialog
      expense={payingExpense}
      open={payingExpenseId !== null}
      onClose={onClose}
      onSuccess={onClose}
    />
  )
}

export function PageExpenses() {
  const [payingExpenseId, setPayingExpenseId] = useState<number | null>(null)
  const navigation = useSubViewNavigation('/expenses')

  return (
    <>
      <EntityListPage
        variant="sub-view"
        title="Pengar ut"
        createLabel="Ny kostnad"
        createTitle="Ny kostnad (utkast)"
        navigation={navigation}
        subViews={{
          list: (nav) => <ExpenseList onNavigate={navToNavigate(nav)} />,
          create: (nav) => (
            <ExpenseForm onSave={nav.goToList} onCancel={nav.goToList} />
          ),
          edit: (id, nav) => (
            <EditView
              id={id}
              onSave={nav.goToList}
              onCancel={nav.goToList}
              onPay={(expenseId) => setPayingExpenseId(expenseId)}
            />
          ),
          view: (id, nav) => (
            <ViewExpense
              id={id}
              onBack={nav.goToList}
              onPay={(expenseId) => setPayingExpenseId(expenseId)}
            />
          ),
        }}
      />
      <PayDialog
        payingExpenseId={payingExpenseId}
        onClose={() => setPayingExpenseId(null)}
      />
    </>
  )
}
