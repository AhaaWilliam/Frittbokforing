import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, CheckCircle, CreditCard } from 'lucide-react'
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
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { EmptyState, ExpenseIllustration } from '../ui/EmptyState'
import { ConfirmFinalizeDialog } from '../ui/ConfirmFinalizeDialog'
import { PaymentDialog } from '../ui/PaymentDialog'
import { BulkPaymentDialog } from '../ui/BulkPaymentDialog'
import { BulkPaymentResultDialog } from '../ui/BulkPaymentResultDialog'
import { Pagination } from '../ui/Pagination'

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
      await finalizeMutation.mutateAsync({ id: finalizeItem.id })
      toast.success('Kostnad bokförd')
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
        account_number: '1930',
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
      ['unpaid', 'partial', 'overdue'].includes(item.status),
    [],
  )

  const selectableItems = items.filter(isSelectable)

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

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

  function handleRowClick(item: ExpenseListItem) {
    if (item.status === 'draft') {
      onNavigate({ edit: item.id })
    } else {
      onNavigate({ view: item.id })
    }
  }

  // Sprint J F49-c2: roving-tabindex för rad-keyboard-navigation.
  // Sprint R F49-c polish: Space togglar bulk-selektion för rad om selektbar.
  const { getRowProps } = useRovingTabindex(
    items.length,
    (idx) => {
      const item = items[idx]
      if (item) handleRowClick(item)
    },
    (idx) => {
      const item = items[idx]
      if (item && isSelectable(item)) toggleSelect(item.id)
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
        <Search className="pointer-events-none absolute left-11 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
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
        <LoadingSpinner />
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
                    className="h-4 w-4 rounded border-gray-300"
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
                const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.draft
                return (
                  <tr
                    key={item.id}
                    {...getRowProps(idx)}
                    onClick={() => handleRowClick(item)}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/50 focus:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ring"
                  >
                    <td
                      className="px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isSelectable(item) ? (
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="h-4 w-4 rounded border-gray-300"
                        />
                      ) : (
                        <span className="inline-block h-4 w-4" />
                      )}
                    </td>
                    <td className="px-4 py-3">{item.expense_date}</td>
                    <td className="px-4 py-3">{item.counterparty_name}</td>
                    <td className="max-w-[200px] truncate px-4 py-3">
                      {item.description}
                      {item.expense_type === 'credit_note' && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                          Kredit
                        </span>
                      )}
                      {!!item.has_credit_note &&
                        item.expense_type !== 'credit_note' && (
                          <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                            Krediterad
                          </span>
                        )}
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
                    <td className="px-4 py-3">
                      <div
                        role="presentation"
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {item.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => setFinalizeItem(item)}
                            title="Bokför"
                            className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                          >
                            <CheckCircle className="h-3 w-3" />
                            Bokför
                          </button>
                        )}
                        {item.status !== 'draft' && item.status !== 'paid' && (
                          <button
                            type="button"
                            onClick={() => setPayItem(item)}
                            title="Registrera betalning"
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted"
                          >
                            <CreditCard className="h-3 w-3" />
                            Betala
                          </button>
                        )}
                        {item.status !== 'draft' &&
                          item.expense_type !== 'credit_note' &&
                          !item.has_credit_note && (
                            <button
                              type="button"
                              onClick={async (e) => {
                                e.stopPropagation()
                                if (!activeFiscalYear) return
                                try {
                                  const result =
                                    await creditNoteMutation.mutateAsync({
                                      original_expense_id: item.id,
                                      fiscal_year_id: activeFiscalYear.id,
                                    })
                                  onNavigate({ edit: result.id })
                                  toast.success('Kreditnota-utkast skapat')
                                } catch (err) {
                                  toast.error(
                                    err instanceof Error
                                      ? err.message
                                      : 'Kunde inte skapa kreditnota',
                                  )
                                }
                              }}
                              title="Skapa kreditnota"
                              className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted"
                            >
                              Kreditera
                            </button>
                          )}
                      </div>
                    </td>
                  </tr>
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
