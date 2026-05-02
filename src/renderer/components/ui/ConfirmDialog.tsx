import { memo } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Button, type ButtonVariant } from './Button'

interface ConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  // VS-49: 'dark' = irreversibel period/system-action (M156).
  variant?: 'danger' | 'warning' | 'default' | 'dark'
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
  const buttonVariant: ButtonVariant =
    variant === 'danger'
      ? 'destructive'
      : variant === 'warning'
        ? 'warning'
        : variant === 'dark'
          ? 'dark'
          : 'primary'

  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[var(--surface-elevated)] p-6 shadow-xl focus:outline-none">
          <AlertDialog.Title className="mb-2 text-base font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mb-6 text-sm text-muted-foreground whitespace-pre-line">
            {description}
          </AlertDialog.Description>
          <div className="flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={buttonVariant} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
})
