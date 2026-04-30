import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import {
  useCompany,
  useUpdateCompany,
  useBankTxMappings,
  useUpsertBankTxMapping,
  useDeleteBankTxMapping,
} from '../lib/hooks'
import type { UpdateCompanyInput } from '../../shared/types'
import { ConfirmDialog } from '../components/ui/ConfirmDialog'
import { SecuritySection } from '../components/settings/SecuritySection'
import { AboutLegalSection } from '../components/settings/AboutLegalSection'

function BackupSection() {
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false)

  useEffect(() => {
    window.api.getSetting('last_backup_date').then((val) => {
      if (typeof val === 'string') setLastBackup(val)
    })
    window.api.getSetting('auto_backup_enabled').then((val) => {
      // default true om osatt
      setAutoBackupEnabled(val !== false)
    })
  }, [])

  async function handleAutoBackupToggle(enabled: boolean) {
    setAutoBackupEnabled(enabled)
    await window.api.setSetting('auto_backup_enabled', enabled)
  }

  async function handleBackup() {
    setIsBackingUp(true)
    setBackupMessage(null)
    try {
      const result = await window.api.backupCreate()
      if (result.filePath) {
        const now = new Date().toISOString()
        await window.api.setSetting('last_backup_date', now)
        setLastBackup(now)
        setBackupMessage(`Säkerhetskopia sparad: ${result.filePath}`)
      }
    } catch {
      setBackupMessage('Kunde inte skapa säkerhetskopia.')
    } finally {
      setIsBackingUp(false)
    }
  }

  function formatBackupDate(iso: string): string {
    return new Date(iso).toLocaleString('sv-SE')
  }

  return (
    <div className="mb-8">
      <h2 className="mb-4 text-base font-medium">Säkerhetskopiering</h2>
      <p className="mb-2 text-sm text-muted-foreground">
        {lastBackup
          ? `Senaste backup: ${formatBackupDate(lastBackup)}`
          : 'Ingen säkerhetskopia har skapats ännu.'}
      </p>
      <label
        className="mb-4 flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50"
        aria-label="Automatisk säkerhetskopia"
      >
        <input
          type="checkbox"
          checked={autoBackupEnabled}
          onChange={(e) => handleAutoBackupToggle(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-border"
          data-testid="auto-backup-toggle"
        />
        <div>
          <div className="text-sm font-medium">
            Automatisk säkerhetskopia (var 7:e dag)
          </div>
          <div className="text-xs text-muted-foreground">
            Sparas tyst till ~/Documents/Fritt Bokföring/backups när du öppnar
            appen. Senaste 30 backupper behålls.
          </div>
        </div>
      </label>
      <button
        onClick={handleBackup}
        disabled={isBackingUp}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isBackingUp ? 'Skapar backup...' : 'Skapa säkerhetskopia'}
      </button>
      <button
        onClick={() => setShowRestoreConfirm(true)}
        disabled={isRestoring || isBackingUp}
        className="ml-3 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
      >
        {isRestoring ? 'Återställer...' : 'Återställ från backup'}
      </button>
      {backupMessage && (
        <div
          className={`mt-3 rounded-md border px-4 py-3 text-sm ${
            backupMessage.startsWith('Säkerhetskopia sparad')
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {backupMessage}
        </div>
      )}
      <ConfirmDialog
        open={showRestoreConfirm}
        onOpenChange={setShowRestoreConfirm}
        title="Återställ från backup"
        description="Detta ersätter hela databasen med den valda backupen. En säkerhetskopia av nuvarande data skapas automatiskt. Appen startar om efter återställning."
        confirmLabel="Välj backup-fil"
        variant="warning"
        onConfirm={async () => {
          setShowRestoreConfirm(false)
          setIsRestoring(true)
          setBackupMessage(null)
          try {
            const result = await window.api.backupRestore()
            if (!result.restored && result.message) {
              setBackupMessage(result.message)
            }
            // If restored=true, app relaunches — we never reach here
          } catch {
            setBackupMessage('Kunde inte återställa backup.')
          } finally {
            setIsRestoring(false)
          }
        }}
      />
    </div>
  )
}

function BankTxMappingsSection() {
  const { data: mappings, isLoading } = useBankTxMappings()
  const upsert = useUpsertBankTxMapping()
  const del = useDeleteBankTxMapping()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [domain, setDomain] = useState('PMNT')
  const [family, setFamily] = useState('CCRD')
  const [subfamily, setSubfamily] = useState('')
  const [classification, setClassification] = useState<
    'bank_fee' | 'interest' | 'ignore'
  >('bank_fee')
  const [accountNumber, setAccountNumber] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  function resetForm() {
    setShowForm(false)
    setEditingId(null)
    setDomain('PMNT')
    setFamily('CCRD')
    setSubfamily('')
    setClassification('bank_fee')
    setAccountNumber('')
    setError(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      await upsert.mutateAsync({
        ...(editingId !== null ? { id: editingId } : {}),
        domain: domain.trim().toUpperCase(),
        family: family.trim().toUpperCase(),
        subfamily: subfamily.trim().toUpperCase(),
        classification,
        account_number: accountNumber.trim() || null,
      })
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Okänt fel')
    }
  }

  const classificationLabel: Record<typeof classification, string> = {
    bank_fee: 'Bankavgift',
    interest: 'Ränta',
    ignore: 'Ignorera',
  }

  return (
    <div className="mb-8">
      <h2 className="mb-2 text-base font-medium">
        Bank-kodsmappningar (BkTxCd)
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        ISO 20022-koder (Domain / Family / SubFamily) som styr
        auto-klassificering av bank-transaktioner. Räntans tecken
        (inkomst/utgift) härleds från beloppstecknet.
      </p>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Laddar...</div>
      ) : (
        <table className="w-full text-sm" data-testid="bank-tx-mappings-table">
          <thead>
            <tr className="border-b text-left text-xs uppercase text-muted-foreground">
              <th className="px-2 py-2">Domain</th>
              <th className="px-2 py-2">Family</th>
              <th className="px-2 py-2">SubFamily</th>
              <th className="px-2 py-2">Klassificering</th>
              <th className="px-2 py-2">Konto</th>
              <th className="px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {(mappings ?? []).map((m) => (
              <tr key={m.id} className="border-b">
                <td className="px-2 py-2 font-mono text-xs">{m.domain}</td>
                <td className="px-2 py-2 font-mono text-xs">{m.family}</td>
                <td className="px-2 py-2 font-mono text-xs">{m.subfamily}</td>
                <td className="px-2 py-2">
                  {classificationLabel[m.classification]}
                </td>
                <td className="px-2 py-2 font-mono text-xs">
                  {m.account_number ?? '—'}
                </td>
                <td className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(m.id)
                      setDomain(m.domain)
                      setFamily(m.family)
                      setSubfamily(m.subfamily)
                      setClassification(m.classification)
                      setAccountNumber(m.account_number ?? '')
                      setShowForm(true)
                    }}
                    className="mr-3 text-xs text-primary hover:underline"
                    data-testid={`mapping-edit-${m.id}`}
                  >
                    Redigera
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeletingId(m.id)}
                    className="text-xs text-red-600 hover:underline"
                    data-testid={`mapping-delete-${m.id}`}
                  >
                    Radera
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="mt-4 rounded-md border px-3 py-1.5 text-sm hover:bg-muted"
          data-testid="mapping-add-btn"
        >
          + Lägg till mappning
        </button>
      )}

      {showForm && (
        <form
          onSubmit={handleSubmit}
          className="mt-4 space-y-3 rounded-md border p-4"
          data-testid="mapping-form"
        >
          <div className="grid grid-cols-3 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Domain</span>
              <input
                type="text"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                required
                maxLength={10}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Family</span>
              <input
                type="text"
                value={family}
                onChange={(e) => setFamily(e.target.value)}
                required
                maxLength={10}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">SubFamily</span>
              <input
                type="text"
                value={subfamily}
                onChange={(e) => setSubfamily(e.target.value)}
                required
                maxLength={10}
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                data-testid="mapping-subfamily-input"
              />
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Klassificering</span>
              <select
                value={classification}
                onChange={(e) =>
                  setClassification(
                    e.target.value as 'bank_fee' | 'interest' | 'ignore',
                  )
                }
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="bank_fee">Bankavgift</option>
                <option value="interest">Ränta</option>
                <option value="ignore">Ignorera</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Konto (valfritt)</span>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                maxLength={10}
                placeholder="t.ex. 6570"
                className="block w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
              />
            </label>
          </div>
          {error && (
            <div
              role="alert"
              className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
            >
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={upsert.isPending}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              data-testid="mapping-save-btn"
            >
              {upsert.isPending
                ? 'Sparar...'
                : editingId !== null
                  ? 'Uppdatera'
                  : 'Skapa'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border px-4 py-2 text-sm hover:bg-muted"
            >
              Avbryt
            </button>
          </div>
        </form>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
        title="Radera mappning?"
        description="Transaktioner som matchar denna kod kommer inte längre auto-klassificeras."
        confirmLabel="Radera"
        variant="danger"
        onConfirm={async () => {
          if (deletingId === null) return
          try {
            await del.mutateAsync({ id: deletingId })
          } finally {
            setDeletingId(null)
          }
        }}
      />
    </div>
  )
}

export function PageSettings() {
  const { data: company, isLoading } = useCompany()
  const updateMutation = useUpdateCompany()

  const [vatNumber, setVatNumber] = useState('')
  const [addressLine1, setAddressLine1] = useState('')
  const [postalCode, setPostalCode] = useState('')
  const [city, setCity] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [bankgiro, setBankgiro] = useState('')
  const [plusgiro, setPlusgiro] = useState('')
  const [website, setWebsite] = useState('')
  const [boardMembers, setBoardMembers] = useState('')
  const [approvedForFTax, setApprovedForFTax] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (company) {
      setVatNumber(company.vat_number ?? '')
      setAddressLine1(company.address_line1 ?? '')
      setPostalCode(company.postal_code ?? '')
      setCity(company.city ?? '')
      setEmail(company.email ?? '')
      setPhone(company.phone ?? '')
      setBankgiro(company.bankgiro ?? '')
      setPlusgiro(company.plusgiro ?? '')
      setWebsite(company.website ?? '')
      setBoardMembers(company.board_members ?? '')
      setApprovedForFTax(company.approved_for_f_tax !== 0)
    }
  }, [company])

  if (isLoading || !company) {
    return (
      <div className="flex flex-1 flex-col overflow-auto">
        <PageHeader title="Inställningar" />
        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
          Laddar...
        </div>
      </div>
    )
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    const payload: UpdateCompanyInput = {
      vat_number: vatNumber.trim() || null,
      address_line1: addressLine1.trim() || null,
      postal_code: postalCode.trim() || null,
      city: city.trim() || null,
      email: email.trim() || null,
      phone: phone.trim() || null,
      bankgiro: bankgiro.trim() || null,
      plusgiro: plusgiro.trim() || null,
      website: website.trim() || null,
      board_members: boardMembers.trim() || null,
      approved_for_f_tax: approvedForFTax ? 1 : 0,
    }

    try {
      await updateMutation.mutateAsync(payload)
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Okänt fel')
    }
  }

  const inputClass =
    'block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary'

  const labelClass = 'block text-sm font-medium text-foreground mb-1'

  function formatCurrency(value: number): string {
    return new Intl.NumberFormat('sv-SE', {
      style: 'currency',
      currency: 'SEK',
      minimumFractionDigits: 0,
    }).format(value)
  }

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <PageHeader title="Inställningar" />
      <div className="mx-auto w-full max-w-2xl px-8 py-6">
        {/* Säkerhet (ADR 004) */}
        <SecuritySection />

        {/* Backup */}
        <BackupSection />

        {/* Om & juridik */}
        <AboutLegalSection />

        {/* Bank-kodsmappningar */}
        <BankTxMappingsSection />

        {/* Read-only company info */}
        <div className="mb-8">
          <h2 className="mb-4 text-base font-medium">Företagsuppgifter</h2>
          <dl className="space-y-2">
            <div className="grid grid-cols-3 gap-2 border-b px-1 py-2.5">
              <dt className="text-sm text-muted-foreground">Företagsnamn</dt>
              <dd className="col-span-2 text-sm">{company.name}</dd>
            </div>
            <div className="grid grid-cols-3 gap-2 border-b px-1 py-2.5">
              <dt className="text-sm text-muted-foreground">Org.nummer</dt>
              <dd className="col-span-2 text-sm">{company.org_number}</dd>
            </div>
            <div className="grid grid-cols-3 gap-2 border-b px-1 py-2.5">
              <dt className="text-sm text-muted-foreground">Regelverkt</dt>
              <dd className="col-span-2 text-sm">
                {company.fiscal_rule === 'K2'
                  ? 'Förenklad (K2)'
                  : 'Fullständig (K3)'}
              </dd>
            </div>
            <div className="grid grid-cols-3 gap-2 border-b px-1 py-2.5">
              <dt className="text-sm text-muted-foreground">Aktiekapital</dt>
              <dd className="col-span-2 text-sm">
                {formatCurrency(company.share_capital)}
              </dd>
            </div>
          </dl>
        </div>

        {/* Editable fields */}
        <div>
          <h2 className="mb-4 text-base font-medium">Kontaktuppgifter</h2>

          {error && (
            <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}
          {success && (
            <div className="mb-4 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
              Inställningarna har sparats
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="vat_number" className={labelClass}>
                VAT-nummer
              </label>
              <input
                id="vat_number"
                type="text"
                value={vatNumber}
                onChange={(e) => setVatNumber(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="address_line1" className={labelClass}>
                Adress
              </label>
              <input
                id="address_line1"
                type="text"
                value={addressLine1}
                onChange={(e) => setAddressLine1(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="postal_code" className={labelClass}>
                  Postnummer
                </label>
                <input
                  id="postal_code"
                  type="text"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="city" className={labelClass}>
                  Stad
                </label>
                <input
                  id="city"
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="email" className={labelClass}>
                  E-post
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="phone" className={labelClass}>
                  Telefon
                </label>
                <input
                  id="phone"
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="bankgiro" className={labelClass}>
                  Bankgiro
                </label>
                <input
                  id="bankgiro"
                  type="text"
                  value={bankgiro}
                  onChange={(e) => setBankgiro(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label htmlFor="plusgiro" className={labelClass}>
                  Plusgiro
                </label>
                <input
                  id="plusgiro"
                  type="text"
                  value={plusgiro}
                  onChange={(e) => setPlusgiro(e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label htmlFor="website" className={labelClass}>
                Webbplats
              </label>
              <input
                id="website"
                type="text"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="board_members" className={labelClass}>
                Styrelseledamöter
              </label>
              <textarea
                id="board_members"
                value={boardMembers}
                onChange={(e) => setBoardMembers(e.target.value)}
                rows={3}
                placeholder="T.ex. Anna Andersson (ordförande), Erik Eriksson"
                className={inputClass}
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                id="approved_for_f_tax"
                type="checkbox"
                checked={approvedForFTax}
                onChange={(e) => setApprovedForFTax(e.target.checked)}
                className="h-4 w-4 rounded border-input accent-primary"
              />
              <label
                htmlFor="approved_for_f_tax"
                className="text-sm text-foreground"
              >
                Godkänd för F-skatt (visas på fakturor)
              </label>
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {updateMutation.isPending ? 'Sparar...' : 'Spara'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
