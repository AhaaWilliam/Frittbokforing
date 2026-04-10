# Session 12 — Kostnadslista (alla kodändringar)

Kopiera varje sektion till rätt fil i en ny session.

---

## 1. src/shared/types.ts — LÄGG TILL (före `ExpenseDraftListItem`)

```typescript
// === Expense List ===
export interface ExpenseListItem {
  id: number
  expense_date: string
  due_date: string | null
  description: string
  supplier_invoice_number: string | null
  status: string
  total_amount_ore: number
  total_paid: number
  remaining: number
  counterparty_name: string
  verification_number: number | null
  verification_series: string | null
  journal_entry_id: number | null
}

export interface ExpenseStatusCounts {
  draft: number
  unpaid: number
  paid: number
  overdue: number
  partial: number
  total: number
}
```

---

## 2. src/main/ipc-schemas.ts — LÄGG TILL (efter `GetExpenseSchema`)

```typescript
export const ListExpensesSchema = z
  .object({
    fiscal_year_id: z.number().int().positive(),
    status: z
      .enum(['draft', 'unpaid', 'paid', 'overdue', 'partial'])
      .optional(),
    search: z.string().max(200).optional(),
    sort_by: z
      .enum([
        'expense_date',
        'due_date',
        'description',
        'total_amount_ore',
        'counterparty_name',
        'status',
        'supplier_invoice_number',
      ])
      .default('expense_date'),
    sort_order: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict()
```

---

## 3. src/main/services/expense-service.ts — LÄGG TILL imports + 3 funktioner

### Uppdatera import (lägg till `ExpenseListItem, ExpenseStatusCounts`):

```typescript
import type {
  Expense,
  ExpenseLine,
  ExpenseWithLines,
  ExpenseDraftListItem,
  ExpenseListItem,
  ExpenseStatusCounts,
  ExpenseDetail,
  ExpensePayment,
  IpcResult,
  ErrorCode,
} from '../../shared/types'
```

### Lägg till FÖRE `getExpensePayments`:

```typescript
// ════════════════════════════════════════════════════════════
// refreshExpenseStatuses — marks overdue expenses
// ════════════════════════════════════════════════════════════
export function refreshExpenseStatuses(db: Database.Database): number {
  const result = db
    .prepare(
      `UPDATE expenses
     SET status = 'overdue', updated_at = datetime('now')
     WHERE status = 'unpaid'
       AND due_date IS NOT NULL
       AND due_date != ''
       AND due_date < date('now')`,
    )
    .run()
  return result.changes
}

// ════════════════════════════════════════════════════════════
// ensureExpenseIndexes
// ════════════════════════════════════════════════════════════
export function ensureExpenseIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_expenses_fiscal_year_status
    ON expenses(fiscal_year_id, status, expense_date)
  `)
}

// ════════════════════════════════════════════════════════════
// listExpenses — filter, search, sort, status counts
// ════════════════════════════════════════════════════════════
export function listExpenses(
  db: Database.Database,
  input: {
    fiscal_year_id: number
    status?: string
    search?: string
    sort_by?: string
    sort_order?: string
  },
): {
  expenses: ExpenseListItem[]
  counts: ExpenseStatusCounts
} {
  refreshExpenseStatuses(db)

  // Status counts
  const countRows = db
    .prepare(
      'SELECT status, COUNT(*) as count FROM expenses WHERE fiscal_year_id = ? GROUP BY status',
    )
    .all(input.fiscal_year_id) as { status: string; count: number }[]

  const counts: ExpenseStatusCounts = {
    total: 0,
    draft: 0,
    unpaid: 0,
    partial: 0,
    paid: 0,
    overdue: 0,
  }
  for (const row of countRows) {
    counts.total += row.count
    const key = row.status as keyof ExpenseStatusCounts
    if (key in counts && key !== 'total') {
      counts[key] = row.count
    }
  }

  // Build query
  const conditions: string[] = ['e.fiscal_year_id = ?']
  const params: (string | number)[] = [input.fiscal_year_id]

  if (input.status) {
    conditions.push('e.status = ?')
    params.push(input.status)
  }

  if (input.search) {
    conditions.push(
      "(c.name LIKE '%' || ? || '%' OR e.description LIKE '%' || ? || '%' OR e.supplier_invoice_number LIKE '%' || ? || '%')",
    )
    params.push(input.search, input.search, input.search)
  }

  const sortColumnMap: Record<string, string> = {
    expense_date: 'e.expense_date',
    due_date: 'e.due_date',
    description: 'e.description',
    total_amount_ore: 'e.total_amount_ore',
    counterparty_name: 'c.name',
    status: 'e.status',
    supplier_invoice_number: 'e.supplier_invoice_number',
  }
  const sortCol =
    sortColumnMap[input.sort_by || 'expense_date'] || 'e.expense_date'
  const sortDir = input.sort_order === 'asc' ? 'ASC' : 'DESC'

  const rows = db
    .prepare(
      `SELECT
      e.id, e.expense_date, e.due_date, e.description,
      e.supplier_invoice_number, e.status, e.total_amount_ore,
      e.journal_entry_id,
      COALESCE(c.name, 'Okänd leverantör') as counterparty_name,
      je.verification_number, je.verification_series,
      COALESCE(pay.total_paid, 0) as total_paid
    FROM expenses e
    LEFT JOIN counterparties c ON e.counterparty_id = c.id
    LEFT JOIN journal_entries je ON e.journal_entry_id = je.id
    LEFT JOIN (
      SELECT expense_id, SUM(amount) as total_paid
      FROM expense_payments
      GROUP BY expense_id
    ) pay ON e.id = pay.expense_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${sortCol} ${sortDir}`,
    )
    .all(...params) as (ExpenseListItem & { total_paid: number })[]

  // Compute remaining in TypeScript
  const expenses: ExpenseListItem[] = rows.map((row) => ({
    ...row,
    remaining: row.total_amount_ore - row.total_paid,
  }))

  return { expenses, counts }
}
```

---

## 4. src/main/ipc-handlers.ts — ÄNDRA import + startup + ny handler

### Uppdatera expense-service import:

```typescript
import {
  saveExpenseDraft,
  getExpenseDraft,
  updateExpenseDraft,
  deleteExpenseDraft,
  listExpenseDrafts,
  finalizeExpense,
  payExpense,
  getExpensePayments,
  getExpense,
  refreshExpenseStatuses,
  ensureExpenseIndexes,
  listExpenses,
} from './services/expense-service'
```

### Uppdatera schema import (lägg till):

```typescript
  ListExpensesSchema,
```

### I `registerIpcHandlers()` — efter befintliga startup-anrop:

```typescript
  ensureExpenseIndexes(db)
  refreshExpenseStatuses(db)
```

### Ny IPC handler (efter `expense:get`):

```typescript
  ipcMain.handle('expense:list', (_event, input: unknown) => {
    const parsed = ListExpensesSchema.safeParse(input)
    if (!parsed.success)
      return {
        success: false,
        error: 'Ogiltigt input.',
        code: 'VALIDATION_ERROR',
      }
    try {
      const result = listExpenses(db, parsed.data)
      return { success: true, data: result }
    } catch (err) {
      console.error('expense:list error:', err)
      return {
        success: false,
        error: 'Kunde inte lista kostnader.',
        code: 'TRANSACTION_ERROR',
      }
    }
  })
```

---

## 5. src/main/preload.ts — LÄGG TILL (efter `getExpense`):

```typescript
  listExpenses: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('expense:list', data),
```

---

## 6. src/renderer/electron.d.ts — LÄGG TILL (efter `getExpense`):

```typescript
  listExpenses: (data: Record<string, unknown>) => Promise<
    IpcResult<{
      expenses: import('../shared/types').ExpenseListItem[]
      counts: import('../shared/types').ExpenseStatusCounts
    }>
  >
```

---

## 7. src/renderer/lib/hooks.ts — ÄNDRA mutations + LÄGG TILL useExpenses

### Uppdatera `useSaveExpenseDraft` — lägg till `['expenses']` invalidering:

```typescript
export function useSaveExpenseDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      window.api.saveExpenseDraft(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-drafts'] })
      qc.invalidateQueries({ queryKey: ['expenses'] })
    },
  })
}
```

### Uppdatera `useUpdateExpenseDraft` — lägg till `['expenses']`:

```typescript
export function useUpdateExpenseDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      window.api.updateExpenseDraft(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-drafts'] })
      qc.invalidateQueries({ queryKey: ['expense-draft'] })
      qc.invalidateQueries({ queryKey: ['expenses'] })
    },
  })
}
```

### Uppdatera `useDeleteExpenseDraft` — lägg till `['expenses']`:

```typescript
export function useDeleteExpenseDraft() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: { id: number }) => window.api.deleteExpenseDraft(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expense-drafts'] })
      qc.invalidateQueries({ queryKey: ['expenses'] })
    },
  })
}
```

### LÄGG TILL i slutet av filen:

```typescript
export function useExpenses(
  fiscalYearId: number | undefined,
  filters?: {
    status?: string
    search?: string
    sort_by?: string
    sort_order?: 'asc' | 'desc'
  },
) {
  return useQuery({
    queryKey: [
      'expenses',
      fiscalYearId,
      filters?.status ?? null,
      filters?.search ?? null,
      filters?.sort_by ?? 'expense_date',
      filters?.sort_order ?? 'desc',
    ],
    queryFn: () =>
      window.api.listExpenses({
        fiscal_year_id: fiscalYearId!,
        ...filters,
      }),
    enabled: !!fiscalYearId,
  })
}
```

---

## 8. src/renderer/components/expenses/ExpenseList.tsx — NY FIL

```typescript
import { useState, useEffect } from 'react'
import { Search } from 'lucide-react'
import type {
  ExpenseListItem,
  ExpenseStatusCounts,
} from '../../../shared/types'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useExpenses } from '../../lib/hooks'
import { formatKr } from '../../lib/format'

interface ExpenseListProps {
  onNavigate: (view: 'form' | { edit: number } | { view: number }) => void
}

const STATUS_FILTERS: {
  key: string | undefined
  label: string
  countKey: keyof ExpenseStatusCounts
}[] = [
  { key: undefined, label: 'Alla', countKey: 'total' },
  { key: 'draft', label: 'Utkast', countKey: 'draft' },
  { key: 'unpaid', label: 'Obetald', countKey: 'unpaid' },
  { key: 'partial', label: 'Delbetald', countKey: 'partial' },
  { key: 'paid', label: 'Betald', countKey: 'paid' },
  { key: 'overdue', label: 'Förfallen', countKey: 'overdue' },
]

const STATUS_BADGE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Utkast' },
  unpaid: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Obetald' },
  partial: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Delbetald' },
  paid: { bg: 'bg-green-100', text: 'text-green-700', label: 'Betald' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'Förfallen' },
}

export function ExpenseList({ onNavigate }: ExpenseListProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  )
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const response = useExpenses(activeFiscalYear?.id, {
    status: statusFilter,
    search: debouncedSearch || undefined,
  })

  const isLoading = response.isLoading

  let items: ExpenseListItem[] = []
  let counts: ExpenseStatusCounts = {
    total: 0,
    draft: 0,
    unpaid: 0,
    partial: 0,
    paid: 0,
    overdue: 0,
  }

  if (response.data?.success) {
    items = response.data.data.expenses
    counts = response.data.data.counts
  }

  function handleRowClick(item: ExpenseListItem) {
    if (item.status === 'draft') {
      onNavigate({ edit: item.id })
    } else {
      onNavigate({ view: item.id })
    }
  }

  function emptyMessage(): string {
    if (debouncedSearch) return 'Inga kostnader matchar sökningen.'
    if (statusFilter === 'draft') return 'Inga utkast-kostnader.'
    if (statusFilter === 'unpaid') return 'Inga obetalda kostnader.'
    if (statusFilter === 'partial') return 'Inga delbetalda kostnader.'
    if (statusFilter === 'paid') return 'Inga betalda kostnader.'
    if (statusFilter === 'overdue') return 'Inga förfallna kostnader.'
    return 'Inga kostnader ännu. Klicka "+ Ny kostnad" för att registrera.'
  }

  return (
    <div className="flex flex-1 flex-col">
      {/* Filter pills */}
      <div className="flex items-center gap-2 px-8 pt-4 pb-2">
        {STATUS_FILTERS.map((f) => {
          const isActive = statusFilter === f.key
          return (
            <button
              key={f.label}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={
                isActive
                  ? 'rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground'
                  : 'rounded-full border border-input px-3 py-1 text-xs font-medium text-muted-foreground hover:bg-muted'
              }
            >
              {f.label}
              {counts[f.countKey] > 0 && (
                <span className="ml-1 opacity-70">({counts[f.countKey]})</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Search input */}
      <div className="relative px-8 py-2">
        <Search className="pointer-events-none absolute left-11 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök leverantör, beskrivning eller fakturanr..."
          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          Laddar...
        </div>
      ) : items.length === 0 ? (
        <div className="px-8 py-16 text-center text-sm text-muted-foreground">
          {emptyMessage()}
        </div>
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="px-8 py-3">Datum</th>
                <th className="px-4 py-3">Leverantör</th>
                <th className="px-4 py-3">Beskrivning</th>
                <th className="px-4 py-3">Lev.fakturanr</th>
                <th className="px-4 py-3 text-right">Totalt</th>
                <th className="px-4 py-3 text-right">Betalt</th>
                <th className="px-4 py-3 text-right">Kvarst.</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Förfaller</th>
                <th className="px-4 py-3">Verif</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.draft
                return (
                  <tr
                    key={item.id}
                    onClick={() => handleRowClick(item)}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                  >
                    <td className="px-8 py-3">{item.expense_date}</td>
                    <td className="px-4 py-3">{item.counterparty_name}</td>
                    <td className="max-w-[200px] truncate px-4 py-3">
                      {item.description}
                    </td>
                    <td className="px-4 py-3">
                      {item.supplier_invoice_number || '\u2014'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatKr(item.total_amount_ore)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {item.total_paid > 0 ? formatKr(item.total_paid) : ''}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatKr(item.remaining)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.bg} ${badge.text}`}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td
                      className={`px-4 py-3 ${item.status === 'overdue' ? 'text-red-600' : ''}`}
                    >
                      {item.due_date || '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      {item.verification_number
                        ? `${item.verification_series ?? 'B'}${item.verification_number}`
                        : '\u2014'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

---

## 9. src/renderer/pages/PageExpenses.tsx — ÄNDRA import

**Byt ut:**
```typescript
import { ExpenseDraftList } from '../components/expenses/ExpenseDraftList'
```
**Mot:**
```typescript
import { ExpenseList } from '../components/expenses/ExpenseList'
```

**Byt ut (i list-vyn längst ner):**
```typescript
<ExpenseDraftList onSelect={(id) => setView({ edit: id })} />
```
**Mot:**
```typescript
<ExpenseList onNavigate={setView} />
```

---

## 10. tests/session-12.test.ts — NY FIL

Se fullständig fil: `tests/session-12.test.ts` (12 tester: 5 list, 4 overdue, 3 counts)

---

## Sammanfattning

| Fil | Typ | Vad |
|---|---|---|
| `src/shared/types.ts` | Ändrad | +ExpenseListItem, +ExpenseStatusCounts |
| `src/main/ipc-schemas.ts` | Ändrad | +ListExpensesSchema |
| `src/main/services/expense-service.ts` | Ändrad | +refreshExpenseStatuses, +ensureExpenseIndexes, +listExpenses |
| `src/main/ipc-handlers.ts` | Ändrad | +import, +startup, +expense:list handler |
| `src/main/preload.ts` | Ändrad | +listExpenses |
| `src/renderer/electron.d.ts` | Ändrad | +listExpenses |
| `src/renderer/lib/hooks.ts` | Ändrad | +useExpenses, mutation hooks uppdaterade |
| `src/renderer/components/expenses/ExpenseList.tsx` | **Ny** | Ersätter ExpenseDraftList |
| `src/renderer/pages/PageExpenses.tsx` | Ändrad | ExpenseDraftList → ExpenseList |
| `tests/session-12.test.ts` | **Ny** | 12 tester |

**Resultat:** 188/188 tester, 0 lint errors, Sprint 3 komplett.
