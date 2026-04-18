import { useState, useRef } from 'react'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import type { BulkPaymentResult } from '../../../shared/types'
import { useDialogBehavior } from '../../lib/use-dialog-behavior'

interface BulkPaymentResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: BulkPaymentResult | null
  batchType?: 'invoice' | 'expense'
}

export function BulkPaymentResultDialog({
  open,
  onOpenChange,
  result,
  batchType,
}: BulkPaymentResultDialogProps) {
  const [exporting, setExporting] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Sprint K (F49-c3): focus-trap + Escape + focus-return.
  const { onKeyDown } = useDialogBehavior({
    open,
    onClose: () => onOpenChange(false),
    containerRef: dialogRef,
    initialFocusRef: closeRef,
  })

  if (!open || !result) return null

  const total = result.succeeded.length + result.failed.length
  const hasFailures = result.failed.length > 0
  const canExport =
    (batchType === 'expense' || batchType === 'invoice') &&
    result.status !== 'cancelled' &&
    result.batch_id != null

  async function handleExport() {
    if (!result?.batch_id) return
    setExporting(true)
    try {
      const validateResult = await window.api.validateBatchExport({
        batch_id: result.batch_id,
      })
      if (!validateResult.success) {
        toast.error(validateResult.error)
        setExporting(false)
        return
      }
      if (!validateResult.data.valid) {
        const issue = validateResult.data.batchIssue
        if (issue === 'already_exported') {
          toast.error('Batchen har redan exporterats')
        } else if (issue === 'company_missing_bankgiro') {
          toast.error('Företaget saknar bankgiro — krävs för betalfil')
        } else if (validateResult.data.issues.length > 0) {
          const names = validateResult.data.issues
            .map((i) => i.counterpartyName)
            .join(', ')
          toast.error(`Leverantörer saknar betalningsuppgifter: ${names}`)
        }
        setExporting(false)
        return
      }

      const exportResult = await window.api.exportPain001({
        batch_id: result.batch_id,
      })
      if (exportResult.success && exportResult.data.saved) {
        toast.success('Betalfil exporterad')
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte exportera betalfil',
      )
    }
    setExporting(false)
  }

  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-result-title"
        className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
      >
        <h2 id="bulk-result-title" className="mb-2 text-base font-semibold">
          Bulk-betalning {result.status === 'cancelled' ? 'avbruten' : 'klar'}
        </h2>

        <p className="mb-4 text-sm text-muted-foreground">
          {result.succeeded.length} av {total} genomförda
        </p>

        {hasFailures && (
          <div className="mb-4 max-h-40 overflow-auto rounded-md border border-red-200 bg-red-50 p-3">
            <p className="mb-2 text-xs font-medium text-red-700">
              Misslyckades:
            </p>
            <ul className="space-y-1 text-xs text-red-600">
              {result.failed.map((f) => (
                <li key={f.id}>
                  ID {f.id}: {f.error}
                </li>
              ))}
            </ul>
          </div>
        )}

        {result.bank_fee_journal_entry_id && (
          <p className="mb-4 text-xs text-muted-foreground">
            Bankavgift bokförd (verifikat #{result.bank_fee_journal_entry_id})
          </p>
        )}

        <div className="flex justify-end gap-2">
          {canExport && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center gap-1.5 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" />
              {exporting ? 'Exporterar...' : 'Exportera betalfil'}
            </button>
          )}
          <button
            ref={closeRef}
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Stäng
          </button>
        </div>
      </div>
    </div>
  )
}
