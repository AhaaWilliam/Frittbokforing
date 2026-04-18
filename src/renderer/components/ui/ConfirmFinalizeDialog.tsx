import { useRef } from 'react'
import { useDialogBehavior } from '../../lib/use-dialog-behavior'

interface ConfirmFinalizeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  onConfirm: () => void
  isLoading: boolean
}

export function ConfirmFinalizeDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  isLoading,
}: ConfirmFinalizeDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Sprint K (F49-c3): focus-trap + Escape + focus-return.
  const { onKeyDown } = useDialogBehavior({
    open,
    onClose: () => {
      if (!isLoading) onOpenChange(false)
    },
    containerRef: dialogRef,
    initialFocusRef: cancelRef,
  })

  if (!open) return null

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
        aria-labelledby="confirm-finalize-title"
        className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
      >
        <h2
          id="confirm-finalize-title"
          className="mb-2 text-base font-semibold"
        >
          {title}
        </h2>
        <p className="mb-4 text-sm text-muted-foreground whitespace-pre-line">
          {description}
        </p>
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 mb-6 text-sm text-amber-800">
          Denna åtgärd kan inte ångras. Verifikationen bokförs permanent.
        </div>
        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
          >
            Avbryt
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {isLoading ? 'Bokför...' : 'Bokför'}
          </button>
        </div>
      </div>
    </div>
  )
}
