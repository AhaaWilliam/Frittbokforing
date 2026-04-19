import type { CreateCompanyInput } from '../../../shared/types'
import { parseDecimal } from '../../../shared/money'

interface StepConfirmProps {
  name: string
  org_number: string
  fiscal_rule: 'K2' | 'K3'
  share_capital: string
  registration_date: string
  fiscal_year_start: string
  fiscal_year_end: string
  onBack: () => void
  onSubmit: (data: CreateCompanyInput) => void
  isPending: boolean
  error: string | null
}

function formatKr(value: string): string {
  const num = parseDecimal(value)
  if (isNaN(num)) return '0 kr'
  return num.toLocaleString('sv-SE') + ' kr'
}

export function formatSwedishDate(iso: string): string {
  const parts = iso.split('-')
  if (parts.length !== 3) return iso
  const [y, m, d] = parts
  const monthNames = [
    'januari',
    'februari',
    'mars',
    'april',
    'maj',
    'juni',
    'juli',
    'augusti',
    'september',
    'oktober',
    'november',
    'december',
  ]
  const monthIndex = parseInt(m) - 1
  const day = parseInt(d)
  if (isNaN(day) || isNaN(monthIndex) || monthIndex < 0 || monthIndex > 11) {
    return iso
  }
  return `${day} ${monthNames[monthIndex]} ${y}`
}

export function StepConfirm({
  name,
  org_number,
  fiscal_rule,
  share_capital,
  registration_date,
  fiscal_year_start,
  fiscal_year_end,
  onBack,
  onSubmit,
  isPending,
  error,
}: StepConfirmProps) {
  const handleSubmit = () => {
    const input: CreateCompanyInput = {
      name,
      org_number,
      fiscal_rule,
      share_capital: Math.round(parseDecimal(share_capital) * 100),
      registration_date,
      fiscal_year_start,
      fiscal_year_end,
    }
    onSubmit(input)
  }

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground">
          Sammanfattning
        </h3>
        <dl className="space-y-2 text-sm">
          <Row label="Företagsnamn" value={name} />
          <Row label="Organisationsnummer" value={org_number} />
          <Row
            label="Redovisningsregel"
            value={
              fiscal_rule === 'K2'
                ? 'Förenklad redovisning (K2)'
                : 'Fullständig redovisning (K3)'
            }
          />
          <Row label="Aktiekapital" value={formatKr(share_capital)} />
          <Row
            label="Registreringsdatum"
            value={formatSwedishDate(registration_date)}
          />
          <Row
            label="Bokföringsår"
            value={`${formatSwedishDate(fiscal_year_start)} — ${formatSwedishDate(fiscal_year_end)}`}
          />
        </dl>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={isPending}
          className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-50"
        >
          Tillbaka
        </button>
        <button
          onClick={handleSubmit}
          disabled={isPending}
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {isPending ? 'Skapar...' : 'Starta bokföringen'}
        </button>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  )
}
