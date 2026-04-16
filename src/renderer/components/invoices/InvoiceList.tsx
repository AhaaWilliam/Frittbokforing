import { useState, useRef, useCallback } from 'react'
import { Search, FileDown, CheckCircle, CreditCard } from 'lucide-react'
import { toast } from 'sonner'
import type {
  InvoiceListItem,
  InvoiceStatusCounts,
  BulkPaymentResult,
} from '../../../shared/types'
import { useFiscalYearContext } from '../../contexts/FiscalYearContext'
import { useInvoiceList, useFinalizeInvoice, usePayInvoice, useBulkPayInvoices, useDebouncedSearch, useCreateCreditNoteDraft } from '../../lib/hooks'
import { useIpcMutation } from '../../lib/use-ipc-mutation'
import { formatKr } from '../../lib/format'
import { useKeyboardShortcuts } from '../../lib/useKeyboardShortcuts'
import { LoadingSpinner } from '../ui/LoadingSpinner'
import { EmptyState, InvoiceIllustration } from '../ui/EmptyState'
import { ConfirmFinalizeDialog } from '../ui/ConfirmFinalizeDialog'
import { PaymentDialog } from '../ui/PaymentDialog'
import { BulkPaymentDialog, type BulkPaymentRow } from '../ui/BulkPaymentDialog'
import { BulkPaymentResultDialog } from '../ui/BulkPaymentResultDialog'
import { BatchPdfExportDialog } from '../ui/BatchPdfExportDialog'

interface InvoiceListProps {
  onNavigate: (view: 'form' | { edit: number } | { view: number }) => void
}

const STATUS_FILTERS: {
  key: string | undefined
  label: string
  countKey: keyof InvoiceStatusCounts
}[] = [
  { key: undefined, label: 'Alla', countKey: 'total' },
  { key: 'draft', label: 'Utkast', countKey: 'draft' },
  { key: 'unpaid', label: 'Obetald', countKey: 'unpaid' },
  { key: 'paid', label: 'Betald', countKey: 'paid' },
  { key: 'overdue', label: 'F\u00f6rfallen', countKey: 'overdue' },
]

const STATUS_BADGE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Utkast' },
  unpaid: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Obetald' },
  paid: { bg: 'bg-green-100', text: 'text-green-700', label: 'Betald' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700', label: 'F\u00f6rfallen' },
}

export function InvoiceList({ onNavigate }: InvoiceListProps) {
  const { activeFiscalYear } = useFiscalYearContext()
  const [statusFilter, setStatusFilter] = useState<string | undefined>(
    undefined,
  )
  const { search, debouncedSearch, setSearch } = useDebouncedSearch()
  const searchRef = useRef<HTMLInputElement>(null)

  // Finalize dialog state
  const [finalizeItem, setFinalizeItem] = useState<InvoiceListItem | null>(null)

  // Payment dialog state
  const [payItem, setPayItem] = useState<InvoiceListItem | null>(null)

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [showBulkDialog, setShowBulkDialog] = useState(false)
  const [bulkResult, setBulkResult] = useState<BulkPaymentResult | null>(null)
  const [batchPdfExporting, setBatchPdfExporting] = useState(false)
  const [batchPdfResult, setBatchPdfResult] = useState<{ succeeded: number; failed: Array<{ invoiceId: number; error: string }> } | null>(null)

  const finalizeMutation = useFinalizeInvoice(activeFiscalYear?.id)
  const payMutation = usePayInvoice()
  const bulkPayMutation = useBulkPayInvoices()
  const creditNoteMutation = useCreateCreditNoteDraft(activeFiscalYear?.id)

  // PDF hooks
  const generatePdfMutation = useIpcMutation(
    (data: { invoiceId: number }) => window.api.generateInvoicePdf(data),
  )

  useKeyboardShortcuts({
    'mod+k': () => searchRef.current?.focus(),
  })

  const response = useInvoiceList(activeFiscalYear?.id, {
    status: statusFilter,
    search: debouncedSearch || undefined,
  })

  const isLoading = response.isLoading

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

  async function handlePayment(amount: number, date: string, bankFeeOre?: number) {
    if (!payItem) return
    try {
      await payMutation.mutateAsync({
        invoice_id: payItem.id,
        amount_ore: amount,
        payment_date: date,
        payment_method: 'bankgiro',
        account_number: '1930',
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

  const isSelectable = useCallback((item: InvoiceListItem) =>
    item.status !== 'draft', [])

  const selectableItems = items.filter(isSelectable)

  function toggleSelect(id: number) {
    setSelectedIds(prev => {
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
      setSelectedIds(new Set(selectableItems.map(i => i.id)))
    }
  }

  async function handleBulkPay(payments: Array<{ id: number; amount_ore: number }>, date: string, accountNumber: string, bankFeeOre: number | undefined, userNote: string | undefined) {
    try {
      const result = await bulkPayMutation.mutateAsync({
        payments: payments.map(p => ({ invoice_id: p.id, amount_ore: p.amount_ore })),
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
        toast.warning(`${result.succeeded.length} av ${result.succeeded.length + result.failed.length} genomförda`)
      }
    } catch (err) {
      console.error('Bulk pay failed:', err)
      toast.error(err instanceof Error ? err.message : 'Bulk-betalning misslyckades')
    }
  }

  async function handleBatchPdfExport() {
    try {
      const dirResponse = await window.api.selectDirectory()
      if (!dirResponse.success || !dirResponse.data) return
      const directory = dirResponse.data.directory

      const selectedItems = items.filter(i => selectedIds.has(i.id))
      const invoices = selectedItems.map(i => ({
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
        toast.warning(`${result.succeeded} av ${result.succeeded + result.failed.length} exporterade`)
      }
    } catch (error) {
      setBatchPdfExporting(false)
      toast.error(error instanceof Error ? error.message : 'PDF-export misslyckades')
    }
  }

  function handleRowClick(item: InvoiceListItem) {
    if (item.status === 'draft') {
      onNavigate({ edit: item.id })
    } else {
      onNavigate({ view: item.id })
    }
  }

  async function handleGeneratePdf(
    e: React.MouseEvent,
    invoiceId: number,
    invoiceNumber: string,
  ) {
    e.stopPropagation()
    try {
      const pdfData = await generatePdfMutation.mutateAsync({ invoiceId })
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
  }

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
        <div className="flex items-center gap-3 px-8 py-2 bg-primary/5 border-b">
          <span className="text-sm font-medium">{selectedIds.size} valda</span>
          {items
            .filter(i => selectedIds.has(i.id))
            .every(i => ['unpaid', 'partial', 'overdue'].includes(i.status)) && (
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
        <LoadingSpinner />
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
                    checked={selectableItems.length > 0 && selectedIds.size === selectableItems.length}
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
              {items.map((item) => {
                const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.draft
                return (
                  <tr
                    key={item.id}
                    onClick={() => handleRowClick(item)}
                    className="cursor-pointer border-b transition-colors hover:bg-muted/50"
                  >
                    <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
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
                    <td className="px-4 py-3">
                      {item.invoice_number || '\u2014'}
                      {item.invoice_type === 'credit_note' && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-medium text-purple-700">
                          Kredit
                        </span>
                      )}
                      {!!item.has_credit_note && item.invoice_type !== 'credit_note' && (
                        <span className="ml-1.5 inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-500">
                          Krediterad
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">{item.invoice_date}</td>
                    <td className="px-4 py-3">{item.counterparty_name}</td>
                    <td className="px-4 py-3 text-right">
                      {formatKr(item.net_amount_ore)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {formatKr(item.vat_amount_ore)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatKr(item.total_amount_ore)}
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
                      {item.due_date}
                    </td>
                    <td className="px-4 py-3">
                      {item.verification_number
                        ? `A${item.verification_number}`
                        : '\u2014'}
                    </td>
                    <td className="px-4 py-3">
                      <div
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
                        {item.status !== 'draft' && item.invoice_type !== 'credit_note' && !item.has_credit_note && (
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation()
                              if (!activeFiscalYear) return
                              try {
                                const result = await creditNoteMutation.mutateAsync({
                                  original_invoice_id: item.id,
                                  fiscal_year_id: activeFiscalYear.id,
                                })
                                onNavigate({ edit: result.id })
                                toast.success('Kreditfaktura-utkast skapat')
                              } catch (err) {
                                toast.error(err instanceof Error ? err.message : 'Kunde inte skapa kreditfaktura')
                              }
                            }}
                            title="Skapa kreditfaktura"
                            className="inline-flex items-center gap-1 rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-muted"
                          >
                            Kreditera
                          </button>
                        )}
                        {item.status !== 'draft' && (
                          <button
                            type="button"
                            onClick={(e) =>
                              handleGeneratePdf(e, item.id, item.invoice_number)
                            }
                            title="Ladda ner PDF"
                            className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <FileDown className="h-4 w-4" />
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
          .filter(i => selectedIds.has(i.id))
          .map(i => ({
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
