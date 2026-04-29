import { useState, useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { FileDown } from 'lucide-react'
import { toast } from 'sonner'
import type { BulkPaymentResult } from '../../../shared/types'
import { Callout } from './Callout'

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
  const closeRef = useRef<HTMLButtonElement>(null)

  if (!result) return null

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
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            closeRef.current?.focus()
          }}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl focus:outline-none"
        >
          <Dialog.Title className="mb-2 text-base font-semibold">
            Bulk-betalning {result.status === 'cancelled' ? 'avbruten' : 'klar'}
          </Dialog.Title>

          <Dialog.Description className="mb-4 text-sm text-muted-foreground">
            {result.succeeded.length} av {total} genomförda
          </Dialog.Description>

          {hasFailures && (
            <div className="mb-4 max-h-40 overflow-auto">
              <Callout variant="danger" title="Misslyckades">
                <ul className="space-y-1">
                  {result.failed.map((f) => (
                    <li key={f.id}>
                      ID {f.id}: {f.error}
                    </li>
                  ))}
                </ul>
              </Callout>
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
            <Dialog.Close asChild>
              <button
                ref={closeRef}
                type="button"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Stäng
              </button>
            </Dialog.Close>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
