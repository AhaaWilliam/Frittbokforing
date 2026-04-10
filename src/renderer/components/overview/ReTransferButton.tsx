import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useReTransferOpeningBalance } from '../../lib/hooks'

export function ReTransferButton() {
  const reTransfer = useReTransferOpeningBalance()
  const [showConfirm, setShowConfirm] = useState(false)

  if (showConfirm) {
    return (
      <div className="mt-6 rounded border border-amber-200 bg-amber-50 p-4">
        <p className="mb-3 text-sm text-amber-800">
          Befintlig IB (O1) ersätts med ny beräkning baserad på föregående års
          saldon. Fortsätt?
        </p>
        <div className="flex gap-2">
          <button
            onClick={async () => {
              await reTransfer.mutateAsync()
              setShowConfirm(false)
            }}
            disabled={reTransfer.isPending}
            className="rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
          >
            {reTransfer.isPending ? 'Uppdaterar...' : 'Uppdatera'}
          </button>
          <button
            onClick={() => setShowConfirm(false)}
            className="rounded border px-3 py-1.5 text-sm hover:bg-muted"
          >
            Avbryt
          </button>
        </div>
        {reTransfer.isError && (
          <p className="mt-2 text-sm text-red-600">
            {reTransfer.error?.message || 'Fel vid uppdatering av IB.'}
          </p>
        )}
        {reTransfer.isSuccess && (
          <p className="mt-2 text-sm text-green-600">
            Ingående balanser uppdaterade.
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="mt-6">
      <button
        onClick={() => setShowConfirm(true)}
        className="flex items-center gap-2 rounded border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Uppdatera ingående balanser
      </button>
    </div>
  )
}
