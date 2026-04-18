import { useRef } from 'react'
import * as Dialog from '@radix-ui/react-dialog'

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
  const closeRef = useRef<HTMLButtonElement>(null)

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && isExporting) return
        onOpenChange(next)
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            if (!isExporting) {
              e.preventDefault()
              closeRef.current?.focus()
            }
          }}
          onEscapeKeyDown={(e) => {
            // Block Escape under export så användaren inte avbryter mid-flow.
            if (isExporting) e.preventDefault()
          }}
          onPointerDownOutside={(e) => {
            if (isExporting) e.preventDefault()
          }}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl focus:outline-none"
        >
          <Dialog.Title className="mb-2 text-base font-semibold">
            {isExporting ? 'Exporterar PDF:er...' : 'PDF-export klar'}
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            {isExporting
              ? 'Genererar och sparar PDF-filer.'
              : 'Resultat av batch-PDF-export.'}
          </Dialog.Description>

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
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
