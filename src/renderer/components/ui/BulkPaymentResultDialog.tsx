import type { BulkPaymentResult } from '../../../shared/types'

interface BulkPaymentResultDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  result: BulkPaymentResult | null
}

export function BulkPaymentResultDialog({
  open,
  onOpenChange,
  result,
}: BulkPaymentResultDialogProps) {
  if (!open || !result) return null

  const total = result.succeeded.length + result.failed.length
  const hasFailures = result.failed.length > 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
        <h2 className="mb-2 text-base font-semibold">
          Bulk-betalning {result.status === 'cancelled' ? 'avbruten' : 'klar'}
        </h2>

        <p className="mb-4 text-sm text-muted-foreground">
          {result.succeeded.length} av {total} genomförda
        </p>

        {hasFailures && (
          <div className="mb-4 max-h-40 overflow-auto rounded-md border border-red-200 bg-red-50 p-3">
            <p className="mb-2 text-xs font-medium text-red-700">Misslyckades:</p>
            <ul className="space-y-1 text-xs text-red-600">
              {result.failed.map(f => (
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

        <div className="flex justify-end">
          <button
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
