import { useRef } from 'react'
import { useDialogBehavior } from '../../lib/use-dialog-behavior'

interface BatchPdfExportDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  isExporting: boolean
  result: {
    succeeded: number
    failed: Array<{ invoiceId: number; error: string }>
  } | null
}

export function BatchPdfExportDialog({
  open,
  onOpenChange,
  isExporting,
  result,
}: BatchPdfExportDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)

  // Sprint K (F49-c3): focus-trap + Escape + focus-return. Escape
  // blockeras under export så användaren inte kan avbryta mid-flow.
  const { onKeyDown } = useDialogBehavior({
    open,
    onClose: () => {
      if (!isExporting) onOpenChange(false)
    },
    containerRef: dialogRef,
    initialFocusRef: closeRef,
  })

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onKeyDown={onKeyDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="batch-pdf-title"
        className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
      >
        <h2 id="batch-pdf-title" className="mb-2 text-base font-semibold">
          {isExporting ? 'Exporterar PDF:er...' : 'PDF-export klar'}
        </h2>

        {isExporting && (
          <div className="flex items-center gap-3 py-4">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-sm text-muted-foreground">
              Genererar och sparar PDF-filer...
            </span>
          </div>
        )}

        {result && (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              {result.succeeded} av {result.succeeded + result.failed.length}{' '}
              exporterade
            </p>

            {result.failed.length > 0 && (
              <div className="mb-4 max-h-40 overflow-auto rounded-md border border-red-200 bg-red-50 p-3">
                <p className="mb-2 text-xs font-medium text-red-700">
                  Misslyckades:
                </p>
                <ul className="space-y-1 text-xs text-red-600">
                  {result.failed.map((f) => (
                    <li key={f.invoiceId}>
                      Faktura ID {f.invoiceId}: {f.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}

        {!isExporting && (
          <div className="flex justify-end">
            <button
              ref={closeRef}
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Stäng
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
