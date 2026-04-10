import { useState, useEffect } from 'react'
import { PageHeader } from '../components/layout/PageHeader'
import { useCompany, useUpdateCompany } from '../lib/hooks'
import type { UpdateCompanyInput } from '../../shared/types'

function BackupSection() {
  const [lastBackup, setLastBackup] = useState<string | null>(null)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)

  useEffect(() => {
    window.api.getSetting('last_backup_date').then((val) => {
      if (typeof val === 'string') setLastBackup(val)
    })
  }, [])

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
      <button
        onClick={handleBackup}
        disabled={isBackingUp}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {isBackingUp ? 'Skapar backup...' : 'Skapa säkerhetskopia'}
      </button>
      {backupMessage && (
        <div className="mt-3 rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {backupMessage}
        </div>
      )}
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
        {/* Backup */}
        <BackupSection />

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
