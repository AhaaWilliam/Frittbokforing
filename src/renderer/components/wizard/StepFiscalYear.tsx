interface StepFiscalYearProps {
  registration_date: string
  use_broken_fiscal_year: boolean
  fiscal_year_start_month: number
  onChange: (field: string, value: string | boolean | number) => void
  onNext: () => void
  onBack: () => void
}

const MONTHS = [
  'Januari',
  'Februari',
  'Mars',
  'April',
  'Maj',
  'Juni',
  'Juli',
  'Augusti',
  'September',
  'Oktober',
  'November',
  'December',
]

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function computeFiscalYear(
  registration_date: string,
  use_broken: boolean,
  start_month: number,
): { start: string; end: string } {
  const regYear = registration_date
    ? new Date(registration_date).getFullYear()
    : new Date().getFullYear()

  if (!use_broken) {
    return {
      start: `${regYear}-01-01`,
      end: `${regYear}-12-31`,
    }
  }

  const startYear = regYear
  const endMonth = ((start_month - 1 + 11) % 12) + 1
  const endYear = start_month === 1 ? startYear : startYear + 1
  const endDay = lastDayOfMonth(endYear, endMonth)

  const sm = String(start_month).padStart(2, '0')
  const em = String(endMonth).padStart(2, '0')

  return {
    start: `${startYear}-${sm}-01`,
    end: `${endYear}-${em}-${String(endDay).padStart(2, '0')}`,
  }
}

export function StepFiscalYear({
  registration_date,
  use_broken_fiscal_year,
  fiscal_year_start_month,
  onChange,
  onNext,
  onBack,
}: StepFiscalYearProps) {
  const { start, end } = computeFiscalYear(
    registration_date,
    use_broken_fiscal_year,
    fiscal_year_start_month,
  )

  const regDate = registration_date ? new Date(registration_date) : null
  const now = new Date()
  const monthsSinceReg = regDate
    ? (now.getFullYear() - regDate.getFullYear()) * 12 +
      now.getMonth() -
      regDate.getMonth()
    : 999

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium">Ditt första bokföringsår:</p>
        <p className="mt-1 text-lg font-semibold">
          {formatSwedishDate(start)} &mdash; {formatSwedishDate(end)}
        </p>
      </div>

      {monthsSinceReg < 12 && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          Just nu stöder Fritt Bokföring räkenskapsår på 12 hela månader. Stöd
          för förkortat eller förlängt första räkenskapsår (som är vanligt för
          nystartade bolag) kommer i en senare version.
        </div>
      )}

      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={use_broken_fiscal_year}
          onChange={(e) => onChange('use_broken_fiscal_year', e.target.checked)}
          className="h-4 w-4 rounded border-border"
        />
        <span className="text-sm">Mitt företag har brutet räkenskapsår</span>
      </label>

      {use_broken_fiscal_year && (
        <div>
          <label className="mb-1 block text-sm font-medium">Startmånad</label>
          <select
            value={fiscal_year_start_month}
            onChange={(e) =>
              onChange('fiscal_year_start_month', parseInt(e.target.value, 10))
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            {MONTHS.map((name, i) => (
              <option key={i + 1} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={onBack}
          className="flex-1 rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted"
        >
          Tillbaka
        </button>
        <button
          onClick={onNext}
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Nästa
        </button>
      </div>
    </div>
  )
}

function formatSwedishDate(iso: string): string {
  const [y, m, d] = iso.split('-')
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
  return `${parseInt(d)} ${monthNames[parseInt(m) - 1]} ${y}`
}
