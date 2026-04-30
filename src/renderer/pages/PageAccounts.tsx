import { useState, useMemo, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { PageHeader } from '../components/layout/PageHeader'
import { Callout } from '../components/ui/Callout'
import { Pill } from '../components/ui/Pill'
import {
  useAllAccounts,
  useCreateAccount,
  useUpdateAccount,
  useToggleAccountActive,
} from '../lib/hooks'
import { useKeyboardShortcuts } from '../lib/useKeyboardShortcuts'
import { LoadingSpinner } from '../components/ui/LoadingSpinner'
import { TableSkeleton } from '../components/ui/TableSkeleton'
import { EmptyState, AccountIllustration } from '../components/ui/EmptyState'
import type { Account } from '../../shared/types'

const ACCOUNT_CLASS_NAMES: Record<number, string> = {
  1: 'Tillgångar',
  2: 'Skulder & EK',
  3: 'Intäkter',
  4: 'Kostnader',
  5: 'Kostnader',
  6: 'Kostnader',
  7: 'Kostnader',
  8: 'Finansiellt',
  9: 'Övrigt',
}

function getAccountClass(accountNumber: string): number {
  return parseInt(accountNumber[0])
}

interface AccountDialogProps {
  open: boolean
  onClose: () => void
  account?: Account | null
}

function AccountDialog({ open, onClose, account }: AccountDialogProps) {
  const isEdit = !!account
  const createMutation = useCreateAccount()
  const updateMutation = useUpdateAccount()

  const [accountNumber, setAccountNumber] = useState('')
  const [name, setName] = useState('')
  const [k2Allowed, setK2Allowed] = useState(true)
  const [k3Only, setK3Only] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset form when dialog opens/closes or account changes
  useEffect(() => {
    if (open) {
      if (account) {
        setAccountNumber(account.account_number)
        setName(account.name)
        setK2Allowed(account.k2_allowed === 1)
        setK3Only(account.k3_only === 1)
      } else {
        setAccountNumber('')
        setName('')
        setK2Allowed(true)
        setK3Only(false)
      }
      setError(null)
    }
  }, [open, account])

  if (!open) return null

  const derivedClass =
    accountNumber.length >= 1 && /^\d/.test(accountNumber)
      ? (ACCOUNT_CLASS_NAMES[parseInt(accountNumber[0])] ?? '')
      : ''

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({
          account_number: account!.account_number,
          name: name.trim(),
          k2_allowed: k2Allowed,
          k3_only: k3Only,
        })
      } else {
        await createMutation.mutateAsync({
          account_number: accountNumber.trim(),
          name: name.trim(),
          k2_allowed: k2Allowed,
          k3_only: k3Only,
        })
      }
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Okänt fel')
    }
  }

  const inputClass =
    'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-lg bg-background p-6 shadow-xl">
        <h2 className="mb-4 text-base font-medium">
          {isEdit ? 'Redigera konto' : 'Lägg till konto'}
        </h2>

        {error && (
          <div className="mb-4">
            <Callout variant="danger" data-testid="account-error">
              {error}
            </Callout>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="account-form-number"
              className="mb-1 block text-sm font-medium"
            >
              Kontonummer
            </label>
            <input
              id="account-form-number"
              type="text"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              disabled={isEdit}
              placeholder="4–6 siffror"
              className={`${inputClass} ${isEdit ? 'bg-muted' : ''}`}
            />
            {derivedClass && !isEdit && (
              <p className="mt-1 text-xs text-muted-foreground">
                Kontoklass: {getAccountClass(accountNumber)} — {derivedClass}
              </p>
            )}
          </div>

          <div>
            <label
              htmlFor="account-form-name"
              className="mb-1 block text-sm font-medium"
            >
              Namn
            </label>
            <input
              id="account-form-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={k2Allowed}
                onChange={(e) => setK2Allowed(e.target.checked)}
              />
              K2
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={k3Only}
                onChange={(e) => setK3Only(e.target.checked)}
              />
              Enbart K3
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Avbryt
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || updateMutation.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {isEdit ? 'Spara' : 'Skapa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function PageAccounts() {
  const [showInactive, setShowInactive] = useState(false)
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useKeyboardShortcuts({
    'mod+n': () => handleOpenCreate(),
    'mod+k': () => searchRef.current?.focus(),
  })

  const { data: accounts = [], isLoading } = useAllAccounts(
    showInactive ? undefined : true,
  )
  const toggleMutation = useToggleAccountActive()

  const filtered = useMemo(() => {
    if (!search.trim()) return accounts
    const q = search.toLowerCase()
    return accounts.filter(
      (a) => a.account_number.includes(q) || a.name.toLowerCase().includes(q),
    )
  }, [accounts, search])

  function handleOpenCreate() {
    setEditAccount(null)
    setDialogOpen(true)
  }

  function handleOpenEdit(account: Account) {
    setEditAccount(account)
    setDialogOpen(true)
  }

  function handleCloseDialog() {
    setDialogOpen(false)
    setEditAccount(null)
  }

  async function handleToggleActive(account: Account) {
    const newActive = account.is_active === 0
    try {
      await toggleMutation.mutateAsync({
        account_number: account.account_number,
        is_active: newActive,
      })
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Kunde inte ändra status',
      )
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <PageHeader
        title="Kontoplan"
        action={
          <button
            onClick={handleOpenCreate}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Lägg till konto
          </button>
        }
      />

      <div className="flex flex-1 flex-col overflow-hidden px-8 py-4">
        {/* Filters */}
        <div className="mb-4 flex items-center gap-4">
          <input
            ref={searchRef}
            type="text"
            placeholder="Sök kontonummer eller namn..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
            />
            Visa inaktiva konton
          </label>
        </div>

        {/* Table */}
        {isLoading ? (
          <TableSkeleton columns={7} rows={6} ariaLabel="Laddar konton" />
        ) : filtered.length === 0 && !search.trim() ? (
          <EmptyState
            icon={<AccountIllustration />}
            title="Inga konton hittades"
            description="Lägg till ditt första konto för att komma igång med bokföringen."
            action={{ label: 'Lägg till konto', onClick: handleOpenCreate }}
          />
        ) : (
          <div className="flex-1 overflow-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-2">Kontonummer</th>
                  <th className="px-3 py-2">Namn</th>
                  <th className="px-3 py-2">Klass</th>
                  <th className="px-3 py-2 text-center">K2</th>
                  <th className="px-3 py-2 text-center">K3</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Åtgärder</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((account) => (
                  <tr
                    key={account.account_number}
                    className="border-b hover:bg-muted/50"
                  >
                    <td className="px-3 py-2 font-mono">
                      {account.account_number}
                    </td>
                    <td className="px-3 py-2">{account.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {getAccountClass(account.account_number)} —{' '}
                      {ACCOUNT_CLASS_NAMES[
                        getAccountClass(account.account_number)
                      ] ?? ''}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {account.k2_allowed === 1 ? '✓' : ''}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {account.k3_only === 1 ? '✓' : ''}
                    </td>
                    <td className="px-3 py-2">
                      {account.is_active === 1 ? (
                        <Pill variant="success" withDot>Aktiv</Pill>
                      ) : (
                        <Pill variant="neutral" withDot>Inaktiv</Pill>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleOpenEdit(account)}
                          className="text-xs text-primary hover:underline"
                        >
                          Redigera
                        </button>
                        <button
                          onClick={() => handleToggleActive(account)}
                          disabled={
                            account.is_system_account === 1 &&
                            account.is_active === 1
                          }
                          title={
                            account.is_system_account === 1
                              ? 'Systemkonto'
                              : undefined
                          }
                          className="text-xs text-muted-foreground hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {account.is_active === 1 ? 'Inaktivera' : 'Aktivera'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtered.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Inga konton hittades.
              </div>
            )}
          </div>
        )}
      </div>

      <AccountDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        account={editAccount}
      />
    </div>
  )
}
