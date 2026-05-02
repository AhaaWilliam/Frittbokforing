import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { Callout } from './Callout'

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
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && isLoading) return
        onOpenChange(next)
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content
          onEscapeKeyDown={(e) => {
            if (isLoading) e.preventDefault()
          }}
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg bg-[var(--surface-elevated)] p-6 shadow-xl focus:outline-none"
        >
          <AlertDialog.Title className="mb-2 text-base font-semibold">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="mb-4 text-sm text-muted-foreground whitespace-pre-line">
            {description}
          </AlertDialog.Description>
          <div className="mb-6">
            <Callout variant="warning">
              Denna åtgärd kan inte ångras. Verifikationen bokförs permanent.
            </Callout>
          </div>
          <div className="flex justify-end gap-3">
            <AlertDialog.Cancel asChild>
              <button
                type="button"
                disabled={isLoading}
                className="rounded-md border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50"
              >
                Avbryt
              </button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <button
                type="button"
                onClick={onConfirm}
                disabled={isLoading}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isLoading ? 'Bokför...' : 'Bokför'}
              </button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
