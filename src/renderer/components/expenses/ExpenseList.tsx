import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import type {
  ExpenseListItem,
  ExpenseStatusCounts,
  BulkPaymentResult,
} from '../../../shared/types'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useSkipLinks } from '../../contexts/SkipLinksContext'
import {
  useExpenses,
  useFinalizeExpense,
  usePayExpense,
  useBulkPayExpenses,
  useDebouncedSearch,
  useCreateExpenseCreditNoteDraft,
} from '../../lib/hooks'
import { usePageParam } from '../../lib/use-page-param'
import { useFilterParam } from '../../lib/use-filter-param'
import { useRovingTabindex } from '../../lib/use-roving-tabindex'
import { formatKr } from '../../lib/format'
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts'
import { TableSkeleton } from '../ui/TableSkeleton'
import { BANK_FORETAGSKONTO } from '../../../shared/bank-accounts'
import { EmptyState, ExpenseIllustration } from '../ui/EmptyState'
import { ConfirmFinalizeDialog } from '../ui/ConfirmFinalizeDialog'
import { PaymentDialog } from '../ui/PaymentDialog'
import { BulkPaymentDialog } from '../ui/BulkPaymentDialog'
import { BulkPaymentResultDialog } from '../ui/BulkPaymentResultDialog'
import { Pagination } from '../ui/Pagination'
import { ExpenseListRow } from './ExpenseListRow'

const PAGE_SIZE = 50

const EXPENSE_STATUSES = [
  'draft',
  'unpaid',
  'partial',
  'paid',
  'overdue',
] as const
type ExpenseStatus = (typeof EXPENSE_STATUSES)[number]

interface ExpenseListProps {
  onNavigate: (view: 'form' | { edit: number } | { view: number }) => void
}

const STATUS_FILTERS: {
  key: ExpenseStatus | undefined
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

export function ExpenseList({ onNavigate }: ExpenseListProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const { setBulkActionsActive } = useSkipLinks()
  const [statusFilter, setStatusFilter] = useFilterParam<ExpenseStatus>(
    'expenses_status',
    EXPENSE_STATUSES,
  )
  const { search, debouncedSearch, setSearch } = useDebouncedSearch()
  const searchRef = useRef<HTMLInputElement>(null)

  // Finalize dialog state
  const [finalizeItem, setFinalizeItem] = useState<ExpenseListItem | null>(null)

  // Payment dialog state
  const [payItem, setPayItem] = useState<ExpenseListItem | null>(null)

  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const bulkActive = selectedIds.size > 0
  useEffect(() => {
    setBulkActionsActive(bulkActive)
    return () => setBulkActionsActive(false)
  }, [bulkActive, setBulkActionsActive])
  const [showBulkDialog, setShowBulkDialog] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkPaymentResult | null>(null)

  const finalizeMutation = useFinalizeExpense()
  const payMutation = usePayExpense()
  const bulkPayMutation = useBulkPayExpenses()
  const creditNoteMutation = useCreateExpenseCreditNoteDraft(
    activeFiscalYear?.id,
  )

  // Refs for M102: stable row callbacks read latest values via ref
  const activeFiscalYearRef = useRef(activeFiscalYear)
  activeFiscalYearRef.current = activeFiscalYear
  const creditNoteMutationRef = useRef(creditNoteMutation)
  creditNoteMutationRef.current = creditNoteMutation
  const onNavigateRef = useRef(onNavigate)
  onNavigateRef.current = onNavigate

  useKeyboardShortcuts({
    'mod+k': () => searchRef.current?.focus(),
  })

  // Sprint 57 C2b: pagination-state; Sprint C B1: URL-sync
  const [page, setPage] = usePageParam('expenses_page', 0)
  const prevFilters = useRef({ statusFilter, debouncedSearch })

  useEffect(() => {
    const prev = prevFilters.current
    if (
      prev.statusFilter !== statusFilter ||
      prev.debouncedSearch !== debouncedSearch
    ) {
      setPage(0)
      prevFilters.current = { statusFilter, debouncedSearch }
    }
  }, [statusFilter, debouncedSearch])

  const prevFyId = useRef(activeFiscalYear?.id)
  useEffect(() => {
    if (
      prevFyId.current !== undefined &&
      prevFyId.current !== activeFiscalYear?.id
    ) {
      setPage(0)
    }
    if (prevFyId.current !== activeFiscalYear?.id) {
      setSelectedIds(new Set())
      prevFyId.current = activeFiscalYear?.id
    }
  }, [activeFiscalYear?.id, setPage])

  const response = useExpenses(activeFiscalYear?.id, {
    status: statusFilter,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const isLoading = response.isLoading
  const totalItems =
    (response.data as { total_items?: number } | undefined)?.total_items ?? 0

  let items: ExpenseListItem[] = []
  let counts: ExpenseStatusCounts = {
    total: 0,
    draft: 0,
    unpaid: 0,
    partial: 0,
    paid: 0,
    overdue: 0,
  }

  if (response.data) {
    items = response.data.expenses
    counts = response.data.counts
  }

  async function handleFinalize() {
    if (!finalizeItem) return
    try {
      const result = await finalizeMutation.mutateAsync({
        id: finalizeItem.id,
      })
      toast.success(`Kostnad bokförd som B${result.verification_number}`)
      setFinalizeItem(null)
    } catch (err) {
      console.error('Finalize expense failed:', err)
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte bokföra kostnaden',
      )
    }
  }

  async function handlePayment(amount: number, date: string) {
    if (!payItem) return
    try {
      await payMutation.mutateAsync({
        expense_id: payItem.id,
        amount_ore: amount,
        payment_date: date,
        payment_method: 'bankgiro',
        account_number: BANK_FORETAGSKONTO,
      })
      toast.success('Betalning registrerad')
      setPayItem(null)
    } catch (err) {
      console.error('Pay expense failed:', err)
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte registrera betalning',
      )
    }
  }

  const isSelectable = useCallback(
    (item: ExpenseListItem) =>
      ['unpaid', 'partial', 'overdue'].includes(item.status) &&
      item.expense_type !== 'credit_note',
    [],
  )

  const selectableItems = items.filter(isSelectable)

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleRowClick = useCallback((item: ExpenseListItem) => {
    if (item.status === 'draft') {
      onNavigateRef.current({ edit: item.id })
    } else {
      onNavigateRef.current({ view: item.id })
    }
  }, [])

  const handleCreateCreditNote = useCallback(async (item: ExpenseListItem) => {
    const fy = activeFiscalYearRef.current
    if (!fy) return
    try {
      const result = await creditNoteMutationRef.current.mutateAsync({
        original_expense_id: item.id,
        fiscal_year_id: fy.id,
      })
      onNavigateRef.current({ edit: result.id })
      toast.success('Kreditnota-utkast skapat')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte skapa kreditnota',
      )
    }
  }, [])

  function toggleSelectAll() {
    if (selectedIds.size === selectableItems.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(selectableItems.map((i) => i.id)))
    }
  }

  async function handleBulkPay(
    payments: Array<{ id: number; amount_ore: number }>,
    date: string,
    accountNumber: string,
    bankFeeOre: number | undefined,
    userNote: string | undefined,
  ) {
    try {
      const result = await bulkPayMutation.mutateAsync({
        payments: payments.map((p) => ({
          expense_id: p.id,
          amount_ore: p.amount_ore,
        })),
        payment_date: date,
        account_number: accountNumber,
        bank_fee_ore: bankFeeOre,
        user_note: userNote,
      })
      setShowBulkDialog(false)
      setSelectedIds(new Set())
      setBulkResult(result)
      if (result.failed.length === 0) {
        toast.success(`${result.succeeded.length} betalningar registrerade`)
      } else {
        toast.warning(
          `${result.succeeded.length} av ${result.succeeded.length + result.failed.length} genomförda`,
        )
      }
    } catch (err) {
      console.error('Bulk pay failed:', err)
      toast.error(
        err instanceof Error ? err.message : 'Bulk-betalning misslyckades',
      )
    }
  }

  const itemsRef = useRef(items)
  itemsRef.current = items

  // Sprint J F49-c2: roving-tabindex för rad-keyboard-navigation.
  // Sprint R F49-c polish: Space togglar bulk-selektion för rad om selektbar.
  const { getRowProps } = useRovingTabindex(
    items.length,
    (idx) => {
      const item = itemsRef.current[idx]
      if (item) handleRowClick(item)
    },
    (idx) => {
      const item = itemsRef.current[idx]
      if (item && isSelectable(item)) handleToggleSelect(item.id)
    },
  )

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
        <Search
          className="pointer-events-none absolute left-11 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          ref={searchRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Sök leverantör, beskrivning eller fakturanr..."
          className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div
          id="bulk-actions"
          role="region"
          aria-label="Massåtgärder"
          className="flex items-center gap-3 px-8 py-2 bg-primary/5 border-b"
        >
          <span className="text-sm font-medium">{selectedIds.size} valda</span>
          <button
            type="button"
            onClick={() => setShowBulkDialog(true)}
            className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <CreditCard className="h-3 w-3" />
            Bulk-betala
          </button>
          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Avmarkera alla
          </button>
        </div>
      )}

      {/* Table */}
      {isLoading ? (
        <TableSkeleton columns={11} withSelectColumn rows={6} />
      ) : items.length === 0 ? (
        !debouncedSearch && !statusFilter ? (
          <EmptyState
            icon={<ExpenseIllustration />}
            title="Inga kostnader ännu"
            description="Registrera din första kostnad för att komma igång."
          />
        ) : (
          <div className="px-8 py-16 text-center text-sm text-muted-foreground">
            {emptyMessage()}
          </div>
        )
      ) : (
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="px-3 py-3 w-8">
                  <input
                    type="checkbox"
                    checked={
                      selectableItems.length > 0 &&
                      selectedIds.size === selectableItems.length
                    }
                    onChange={toggleSelectAll}
                    className="h-4 w-4 rounded border-[var(--border-default)]"
                  />
                </th>
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3">Leverantör</th>
                <th className="px-4 py-3">Beskrivning</th>
                <th className="px-4 py-3">Lev.fakturanr</th>
                <th className="px-4 py-3 text-right">Totalt</th>
                <th className="px-4 py-3 text-right">Betalt</th>
                <th className="px-4 py-3 text-right">Kvarst.</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Förfaller</th>
                <th className="px-4 py-3">Verif</th>
                <th className="px-4 py-3">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const rowProps = getRowProps(idx)
                return (
                  <ExpenseListRow
                    key={item.id}
                    item={item}
                    tabIndex={rowProps.tabIndex}
                    onRef={rowProps.ref}
                    onKeyDown={rowProps.onKeyDown}
                    onFocus={rowProps.onFocus}
                    isSelected={selectedIds.has(item.id)}
                    isSelectable={isSelectable(item)}
                    onRowClick={handleRowClick}
                    onToggleSelect={handleToggleSelect}
                    onFinalizeClick={setFinalizeItem}
                    onPayClick={setPayItem}
                    onCreateCreditNote={handleCreateCreditNote}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sprint 57 C2b: Pagination */}
      {activeFiscalYear && !isLoading && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={totalItems}
          onPageChange={setPage}
          label="kostnader"
          testIdPrefix="pag-expenses"
        />
      )}

      <ConfirmFinalizeDialog
        open={!!finalizeItem}
        onOpenChange={(open) => {
          if (!open) setFinalizeItem(null)
        }}
        title="Bokför kostnad"
        description={
          finalizeItem
            ? `Beskrivning: ${finalizeItem.description}\nLeverantör: ${finalizeItem.counterparty_name}\nBelopp: ${formatKr(finalizeItem.total_amount_ore)}`
            : ''
        }
        onConfirm={handleFinalize}
        isLoading={finalizeMutation.isPending}
      />

      {payItem && (
        <PaymentDialog
          open={!!payItem}
          onOpenChange={(open) => {
            if (!open) setPayItem(null)
          }}
          title="Registrera betalning"
          totalAmount={payItem.total_amount_ore}
          paidAmount={payItem.total_paid}
          documentDate={payItem.expense_date}
          fiscalYearEnd={activeFiscalYear?.end_date ?? '2099-12-31'}
          onSubmit={handlePayment}
          isLoading={payMutation.isPending}
        />
      )}

      <BulkPaymentDialog
        open={showBulkDialog}
        onOpenChange={setShowBulkDialog}
        title={`Bulk-betalning (${selectedIds.size} kostnader)`}
        rows={items
          .filter((i) => selectedIds.has(i.id))
          .map((i) => ({
            id: i.id,
            label: i.supplier_invoice_number || i.description,
            counterparty: i.counterparty_name,
            remaining: i.remaining,
          }))}
        onSubmit={handleBulkPay}
        isLoading={bulkPayMutation.isPending}
      />

      <BulkPaymentResultDialog
        open={!!bulkResult}
        onOpenChange={() => setBulkResult(null)}
        result={bulkResult}
        batchType="expense"
      />
    </div>
  )
}
