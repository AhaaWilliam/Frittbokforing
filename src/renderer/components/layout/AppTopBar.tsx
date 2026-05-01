import { useUiMode } from '../../lib/use-ui-mode'
import { useFiscalYearContextOptional } from '../../contexts/FiscalYearContext'
import { KbdChip } from '../ui/KbdChip'

interface AppTopBarProps {
  companyName: string
}

const SV_MONTHS = [
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

/**
 * Sprint H+G-4 — AppTopBar (matchar H+G-prototyp).
 *
 * Topbar spänner full bredd i båda mode:n. Vänster: italic "Fritt"-brand
 * 19px · pipe · bolagsnamn · räkenskapsår-kontext (år · senaste aktiva
 * månad). Höger: mode-pill med kbd-shortcut (⌘⇧B togglar mode).
 *
 * I bokförare-läget är topbaren mörk (--top-bar-surface = #1d1c1a),
 * i vardag är den ljus (--top-bar-surface = #fbfaf8). Tokens skiftas
 * via [data-mode] på documentElement (use-ui-mode.ts).
 *
 * "Senaste aktiva period"-label visar den månad inom aktivt räkenskapsår
 * som är "nuvarande" (dvs. där dagens datum faller). Om dagens datum
 * ligger utanför FY visas FY-startens månad.
 */
export function AppTopBar({ companyName }: AppTopBarProps) {
  const { mode, setMode } = useUiMode()
  const fyContext = useFiscalYearContextOptional()

  const periodLabel = formatPeriodLabel(fyContext?.activeFiscalYear ?? null)
  const isVardag = mode === 'vardag'

  return (
    <header
      className="flex shrink-0 items-center justify-between border-b px-6 py-3"
      style={{
        background: 'var(--top-bar-surface)',
        color: 'var(--top-bar-text)',
        borderColor: 'var(--top-bar-border)',
      }}
      role="banner"
      data-testid="app-top-bar"
    >
      <div className="flex items-center gap-3">
        <span className="font-serif text-[19px] font-normal leading-none">
          <span className="font-serif-italic">Fritt</span> Bokföring
        </span>
        <span className="opacity-50" aria-hidden="true">
          ·
        </span>
        <span className="text-sm" data-testid="topbar-company">
          {companyName}
        </span>
        {periodLabel && (
          <>
            <span className="opacity-50" aria-hidden="true">
              ·
            </span>
            <span className="text-sm opacity-75" data-testid="topbar-period">
              {periodLabel}
            </span>
          </>
        )}
      </div>

      <button
        type="button"
        onClick={() => setMode(isVardag ? 'bokforare' : 'vardag')}
        className="inline-flex items-center gap-2 rounded-md border border-current px-3 py-1.5 text-sm font-medium opacity-90 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-current"
        data-testid={isVardag ? 'switch-to-bokforare' : 'switch-to-vardag'}
        aria-label={
          isVardag ? 'Byt till bokförar-läge' : 'Byt till vardag-läge'
        }
      >
        <span>{isVardag ? 'Bokförar-läge' : 'Vardag-läge'}</span>
        <KbdChip variant={isVardag ? 'light' : 'dark'}>⌘⇧B</KbdChip>
      </button>
    </header>
  )
}

function formatPeriodLabel(
  fy: { start_date: string; end_date: string } | null | undefined,
): string | null {
  if (!fy) return null
  const start = new Date(fy.start_date)
  const end = new Date(fy.end_date)
  const now = new Date()

  const within = now >= start && now <= end
  const month = within ? now.getMonth() : start.getMonth()
  const year = within ? now.getFullYear() : start.getFullYear()
  const monthName = SV_MONTHS[month] ?? ''
  return `räkenskapsår ${year} · ${monthName}`
}
