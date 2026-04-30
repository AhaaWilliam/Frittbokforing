import { memo } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'

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
  const confirmClasses =
    variant === 'danger'
      ? 'bg-danger-500 text-white hover:bg-danger-600'
      : variant === 'warning'
        ? 'bg-warning-500 text-white hover:bg-warning-600'
        : 'bg-primary text-primary-foreground hover:bg-primary/90'

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-background p-6 shadow-xl focus:outline-none">
          <AlertDialog.Title className="mb-2 text-base font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mb-6 text-sm text-muted-foreground whitespace-pre-line">
            {description}
          </AlertDialog.Description>
          <div className="flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
              >
                {cancelLabel}
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={onConfirm}
                className={`rounded-md px-4 py-2 text-sm font-medium ${confirmClasses}`}
              >
                {confirmLabel}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
})
