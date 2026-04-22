import { BFL_ALLOWED_START_MONTHS } from '../../../shared/constants'

interface StepFiscalYearProps {
  registration_date: string
  use_broken_fiscal_year: boolean
  fiscal_year_start_month: number
  /** BFL 3:3 — kortat första FY startar på registreringsdatum. */
  use_short_first_fy: boolean
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
  use_short: boolean = false,
): { start: string; end: string } {
  const regYear = registration_date
    ? new Date(registration_date).getFullYear()
    : new Date().getFullYear()

  // BFL 3:3 — kortat första FY startar vid registreringsdatum och
  // slutar på sista dagen i kalenderårets december. Kombinationen
  // kortat+brutet räkenskapsår kan överskrida 12 perioder och stöds
  // inte i denna version — use_short ignoreras vid use_broken=true.
  if (use_short && !use_broken && registration_date) {
    return {
      start: registration_date,
      end: `${regYear}-12-31`,
    }
  }

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
  use_short_first_fy,
  onChange,
  onNext,
  onBack,
}: StepFiscalYearProps) {
  const { start, end } = computeFiscalYear(
    registration_date,
    use_broken_fiscal_year,
    fiscal_year_start_month,
    use_short_first_fy,
  )

  const regDate = registration_date ? new Date(registration_date) : null
  const now = new Date()
  const monthsSinceReg = regDate
    ? (now.getFullYear() - regDate.getFullYear()) * 12 +
      now.getMonth() -
      regDate.getMonth()
    : 999

  // Kortat första FY stöds bara med kalenderår (inte brutet) i denna
  // version — annars kan antalet perioder överskrida 12 (DB-begränsning).
  // Visas när reg-datum inte är 1 januari (då kortat = standard).
  const regIsJan1 = registration_date === `${registration_date.slice(0, 4)}-01-01`
  const showShortOption =
    !!registration_date && !use_broken_fiscal_year && !regIsJan1

  return (
    <div className="space-y-5">
      <div className="rounded-md border border-border bg-muted/30 p-4">
        <p className="text-sm font-medium">Ditt första bokföringsår:</p>
        <p className="mt-1 text-lg font-semibold">
          {formatSwedishDate(start)} &mdash; {formatSwedishDate(end)}
        </p>
      </div>

      {monthsSinceReg < 12 && !use_short_first_fy && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
          För nystartade bolag är det vanligt att välja <em>kortat första
          räkenskapsår</em> som startar vid registreringsdatumet (BFL 3 kap
          3§). Bocka i alternativet nedan om du vill.
        </div>
      )}

      {showShortOption && (
        <label
          className="flex cursor-pointer items-start gap-3 rounded-md border border-border p-3 hover:bg-muted/50"
          data-testid="wizard-short-fy-toggle-label"
        >
          <input
            type="checkbox"
            checked={use_short_first_fy}
            onChange={(e) => onChange('use_short_first_fy', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border"
            data-testid="wizard-short-fy-toggle"
          />
          <div>
            <div className="text-sm font-medium">
              Kortat första räkenskapsår (BFL 3:3)
            </div>
            <div className="text-xs text-muted-foreground">
              Första räkenskapsåret börjar på registreringsdatumet istället
              för 1:a i månaden. Följande räkenskapsår blir 12 hela månader.
            </div>
          </div>
        </label>
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
          <label
            htmlFor="wizard-start-month"
            className="mb-1 block text-sm font-medium"
          >
            Startmånad
          </label>
          <select
            id="wizard-start-month"
            value={fiscal_year_start_month}
            onChange={(e) =>
              onChange('fiscal_year_start_month', parseInt(e.target.value, 10))
            }
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
          >
            {(use_broken_fiscal_year
              ? BFL_ALLOWED_START_MONTHS.map((m) => ({
                  month: m,
                  name: MONTHS[m - 1],
                }))
              : MONTHS.map((name, i) => ({ month: i + 1, name }))
            ).map(({ month, name }) => (
              <option key={month} value={month}>
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
