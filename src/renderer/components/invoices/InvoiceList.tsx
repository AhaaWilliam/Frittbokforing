import { useState, useRef, useCallback, useEffect } from 'react'
import { Search, FileDown, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import type {
  InvoiceListItem,
  InvoiceStatusCounts,
  BulkPaymentResult,
} from '../../../shared/types'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useSkipLinks } from '../../contexts/SkipLinksContext'
import {
  useInvoiceList,
  useFinalizeInvoice,
  usePayInvoice,
  useBulkPayInvoices,
  useDebouncedSearch,
  useCreateCreditNoteDraft,
} from '../../lib/hooks'
import { useIpcMutation } from '../../lib/use-ipc-mutation'
import { BANK_FORETAGSKONTO } from '../../../shared/bank-accounts'
import { usePageParam } from '../../lib/use-page-param'
import { useFilterParam } from '../../lib/use-filter-param'
import { useRovingTabindex } from '../../lib/use-roving-tabindex'
import { formatKr } from '../../lib/format'
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts'
import { TableSkeleton } from '../ui/TableSkeleton'
import { EmptyState, InvoiceIllustration } from '../ui/EmptyState'
import { ConfirmFinalizeDialog } from '../ui/ConfirmFinalizeDialog'
import { PaymentDialog } from '../ui/PaymentDialog'
import { BulkPaymentDialog } from '../ui/BulkPaymentDialog'
import { BulkPaymentResultDialog } from '../ui/BulkPaymentResultDialog'
import { BatchPdfExportDialog } from '../ui/BatchPdfExportDialog'
import { Pagination } from '../ui/Pagination'
import { InvoiceListRow } from './InvoiceListRow'

const PAGE_SIZE = 50

const INVOICE_STATUSES = ['draft', 'unpaid', 'paid', 'overdue'] as const
type InvoiceStatus = (typeof INVOICE_STATUSES)[number]

interface InvoiceListProps {
  onNavigate: (view: 'form' | { edit: number } | { view: number }) => void
}

const STATUS_FILTERS: {
  key: InvoiceStatus | undefined
  label: string
  countKey: keyof InvoiceStatusCounts
}[] = [
  { key: undefined, label: 'Alla', countKey: 'total' },
  { key: 'draft', label: 'Utkast', countKey: 'draft' },
  { key: 'unpaid', label: 'Obetald', countKey: 'unpaid' },
  { key: 'paid', label: 'Betald', countKey: 'paid' },
  { key: 'overdue', label: 'F\u00f6rfallen', countKey: 'overdue' },
]

export function InvoiceList({ onNavigate }: InvoiceListProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const { setBulkActionsActive } = useSkipLinks()
  const [statusFilter, setStatusFilter] = useFilterParam<InvoiceStatus>(
    'invoices_status',
    INVOICE_STATUSES,
  )
  const { search, debouncedSearch, setSearch } = useDebouncedSearch()
  const searchRef = useRef<HTMLInputElement>(null)

  // Finalize dialog state
  const [finalizeItem, setFinalizeItem] = useState<InvoiceListItem | null>(null)

  // Payment dialog state
  const [payItem, setPayItem] = useState<InvoiceListItem | null>(null)

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const bulkActive = selectedIds.size > 0
  useEffect(() => {
    setBulkActionsActive(bulkActive)
    return () => setBulkActionsActive(false)
  }, [bulkActive, setBulkActionsActive])
  const [showBulkDialog, setShowBulkDialog] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkPaymentResult | null>(null)
  const [batchPdfExporting, setBatchPdfExporting] = useState(false)
  const [batchPdfResult, setBatchPdfResult] = useState<{
    succeeded: number
    failed: Array<{ invoiceId: number; error: string }>
  } | null>(null)

  const finalizeMutation = useFinalizeInvoice(activeFiscalYear?.id)
  const payMutation = usePayInvoice()
  const bulkPayMutation = useBulkPayInvoices()
  const creditNoteMutation = useCreateCreditNoteDraft(activeFiscalYear?.id)

  // PDF hooks
  const generatePdfMutation = useIpcMutation((data: { invoiceId: number }) =>
    window.api.generateInvoicePdf(data),
  )

  // Refs for M102: stable row callbacks read latest values via ref
  const activeFiscalYearRef = useRef(activeFiscalYear)
  activeFiscalYearRef.current = activeFiscalYear
  const creditNoteMutationRef = useRef(creditNoteMutation)
  creditNoteMutationRef.current = creditNoteMutation
  const generatePdfMutationRef = useRef(generatePdfMutation)
  generatePdfMutationRef.current = generatePdfMutation
  const onNavigateRef = useRef(onNavigate)
  onNavigateRef.current = onNavigate

  useKeyboardShortcuts({
    'mod+k': () => searchRef.current?.focus(),
  })

  // Sprint 57 C2b: pagination-state (Beslut 11 + 12); Sprint C B1: URL-sync
  const [page, setPage] = usePageParam('invoices_page', 0)
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

  const response = useInvoiceList(activeFiscalYear?.id, {
    status: statusFilter,
    search: debouncedSearch || undefined,
    limit: PAGE_SIZE,
    offset: page * PAGE_SIZE,
  })

  const isLoading = response.isLoading
  const totalItems =
    (response.data as { total_items?: number } | undefined)?.total_items ?? 0

  // Extract items and counts from the IpcResult
  let items: InvoiceListItem[] = []
  let counts: InvoiceStatusCounts = {
    total: 0,
    draft: 0,
    unpaid: 0,
    partial: 0,
    paid: 0,
    overdue: 0,
  }

  if (response.data) {
    items = response.data.items
    counts = response.data.counts
  }

  async function handleFinalize() {
    if (!finalizeItem) return
    try {
      await finalizeMutation.mutateAsync({ id: finalizeItem.id })
      toast.success('Faktura bokförd')
      setFinalizeItem(null)
    } catch (err) {
      console.error('Finalize invoice failed:', err)
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte bokföra fakturan',
      )
    }
  }

  async function handlePayment(
    amount: number,
    date: string,
    bankFeeOre?: number,
  ) {
    if (!payItem) return
    try {
      await payMutation.mutateAsync({
        invoice_id: payItem.id,
        amount_ore: amount,
        payment_date: date,
        payment_method: 'bankgiro',
        account_number: BANK_FORETAGSKONTO,
        ...(bankFeeOre ? { bank_fee_ore: bankFeeOre } : {}),
      })
      toast.success('Betalning registrerad')
      setPayItem(null)
    } catch (err) {
      console.error('Pay invoice failed:', err)
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte registrera betalning',
      )
    }
  }

  const isSelectable = useCallback(
    (item: InvoiceListItem) =>
      item.status !== 'draft' && item.invoice_type !== 'credit_note',
    [],
  )

  const selectableItems = items.filter(isSelectable)

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
          invoice_id: p.id,
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

  async function handleBatchPdfExport() {
    try {
      const dirResponse = await window.api.selectDirectory()
      if (!dirResponse.success || !dirResponse.data) return
      const directory = dirResponse.data.directory

      const selectedItems = items.filter((i) => selectedIds.has(i.id))
      const invoices = selectedItems.map((i) => ({
        invoiceId: i.id,
        fileName: `Faktura_${i.invoice_number}_${i.counterparty_name.replace(/[^a-zA-ZåäöÅÄÖ0-9]/g, '_')}.pdf`,
      }))

      setBatchPdfExporting(true)
      const response = await window.api.savePdfBatch({ directory, invoices })
      setBatchPdfExporting(false)

      if (!response.success) {
        toast.error(response.error)
        return
      }

      const result = response.data
      setBatchPdfResult(result)
      setSelectedIds(new Set())

      if (result.failed.length === 0) {
        toast.success(`${result.succeeded} PDF:er exporterade`)
      } else {
        toast.warning(
          `${result.succeeded} av ${result.succeeded + result.failed.length} exporterade`,
        )
      }
    } catch (error) {
      setBatchPdfExporting(false)
      toast.error(
        error instanceof Error ? error.message : 'PDF-export misslyckades',
      )
    }
  }

  const handleRowClick = useCallback((item: InvoiceListItem) => {
    if (item.status === 'draft') {
      onNavigateRef.current({ edit: item.id })
    } else {
      onNavigateRef.current({ view: item.id })
    }
  }, [])

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleCreateCreditNote = useCallback(async (item: InvoiceListItem) => {
    const fy = activeFiscalYearRef.current
    if (!fy) return
    try {
      const result = await creditNoteMutationRef.current.mutateAsync({
        original_invoice_id: item.id,
        fiscal_year_id: fy.id,
      })
      onNavigateRef.current({ edit: result.id })
      toast.success('Kreditfaktura-utkast skapat')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte skapa kreditfaktura',
      )
    }
  }, [])

  const handleGeneratePdf = useCallback(
    async (e: React.MouseEvent, invoiceId: number, invoiceNumber: string) => {
      e.stopPropagation()
      try {
        const pdfData = await generatePdfMutationRef.current.mutateAsync({
          invoiceId,
        })
        const fileName = `Faktura-${invoiceNumber}.pdf`
        await window.api.saveInvoicePdf({
          data: pdfData.data,
          defaultFileName: fileName,
        })
      } catch (error) {
        console.error('PDF generation failed:', error)
        toast.error(
          error instanceof Error ? error.message : 'Kunde inte generera PDF',
        )
      }
    },
    [],
  )

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
    if (debouncedSearch) return 'Inga fakturor matchar s\u00f6kningen.'
    if (statusFilter === 'draft') return 'Inga utkast-fakturor.'
    if (statusFilter === 'unpaid') return 'Inga obetald-fakturor.'
    if (statusFilter === 'paid') return 'Inga betald-fakturor.'
    if (statusFilter === 'overdue') return 'Inga f\u00f6rfallen-fakturor.'
    return 'Inga fakturor \u00e4nnu.'
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
          placeholder="S\u00f6k kund eller fakturanummer..."
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
          {items
            .filter((i) => selectedIds.has(i.id))
            .every((i) =>
              ['unpaid', 'partial', 'overdue'].includes(i.status),
            ) && (
            <button
              type="button"
              onClick={() => setShowBulkDialog(true)}
              className="inline-flex items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
            >
              <CreditCard className="h-3 w-3" />
              Bulk-betala
            </button>
          )}
          <button
            type="button"
            onClick={handleBatchPdfExport}
            disabled={batchPdfExporting}
            className="inline-flex items-center gap-1 rounded-md border border-input px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50"
          >
            <FileDown className="h-3 w-3" />
            {batchPdfExporting ? 'Exporterar...' : 'Exportera PDF:er'}
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
        <TableSkeleton columns={10} withSelectColumn rows={6} />
      ) : items.length === 0 ? (
        !debouncedSearch && !statusFilter ? (
          <EmptyState
            icon={<InvoiceIllustration />}
            title="Inga fakturor ännu"
            description="Skapa din första faktura för att komma igång."
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
                <th className="px-4 py-3">Nr</th>
                <th className="px-4 py-3">Datum</th>
                <th className="px-4 py-3">Kund</th>
                <th className="px-4 py-3 text-right">Netto</th>
                <th className="px-4 py-3 text-right">Moms</th>
                <th className="px-4 py-3 text-right">Totalt</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">F\u00f6rfaller</th>
                <th className="px-4 py-3">Verif</th>
                <th className="px-4 py-3">Åtgärder</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, idx) => {
                const rowProps = getRowProps(idx)
                return (
                  <InvoiceListRow
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
                    onGeneratePdf={handleGeneratePdf}
                  />
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sprint 57 C2b: Pagination — visas alltid när fiscal year är valt */}
      {activeFiscalYear && !isLoading && (
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          totalItems={totalItems}
          onPageChange={setPage}
          label="fakturor"
          testIdPrefix="pag-invoices"
        />
      )}

      <ConfirmFinalizeDialog
        open={!!finalizeItem}
        onOpenChange={(open) => {
          if (!open) setFinalizeItem(null)
        }}
        title="Bokför faktura"
        description={
          finalizeItem
            ? `Faktura ${finalizeItem.invoice_number || '(utkast)'}\nKund: ${finalizeItem.counterparty_name}\nBelopp: ${formatKr(finalizeItem.total_amount_ore)}`
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
          documentDate={payItem.invoice_date}
          fiscalYearEnd={activeFiscalYear?.end_date ?? '2099-12-31'}
          onSubmit={handlePayment}
          isLoading={payMutation.isPending}
        />
      )}

      <BulkPaymentDialog
        open={showBulkDialog}
        onOpenChange={setShowBulkDialog}
        title={`Bulk-betalning (${selectedIds.size} fakturor)`}
        rows={items
          .filter((i) => selectedIds.has(i.id))
          .map((i) => ({
            id: i.id,
            label: i.invoice_number || `#${i.id}`,
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
        batchType="invoice"
      />

      <BatchPdfExportDialog
        open={batchPdfExporting || !!batchPdfResult}
        onOpenChange={(open) => {
          if (!open) {
            setBatchPdfExporting(false)
            setBatchPdfResult(null)
          }
        }}
        isExporting={batchPdfExporting}
        result={batchPdfResult}
      />
    </div>
  )
}
