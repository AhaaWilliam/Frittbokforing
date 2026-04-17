import { memo, useCallback, useEffect, useRef } from 'react'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  variant?: 'danger' | 'warning' | 'default'
  onConfirm: () => void
}

export const ConfirmDialog = memo(function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Bekräfta',
  cancelLabel = 'Avbryt',
  variant = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)

  // Focus cancel button on open
  useEffect(() => {
    if (open) {
      cancelRef.current?.focus()
    }
  }, [open])

  // Escape key closes dialog
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onOpenChange(false)
        return
      }
      // Focus trap: Tab cycles within dialog
      if (e.key === 'Tab') {
        const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled])',
        )
        if (!focusable || focusable.length === 0) return
        const first = focusable[0]
        const last = focusable[focusable.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    },
    [onOpenChange],
  )

  if (!open) return null

  const confirmClasses =
    variant === 'danger'
      ? 'bg-red-600 text-white hover:bg-red-700'
      : variant === 'warning'
        ? 'bg-amber-600 text-white hover:bg-amber-700'
        : 'bg-primary text-primary-foreground hover:bg-primary/90'

  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onKeyDown={handleKeyDown}
    >
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl"
      >
        <h2 id="confirm-dialog-title" className="mb-2 text-base font-semibold">
          {title}
        </h2>
        <p
          id="confirm-dialog-desc"
          className="mb-6 text-sm text-muted-foreground whitespace-pre-line"
        >
          {description}
        </p>
        <div className="flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`rounded-md px-4 py-2 text-sm font-medium ${confirmClasses}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
})
