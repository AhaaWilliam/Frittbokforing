import { useEffect, useState } from 'react'
import { FileText, Users, Package, Upload } from 'lucide-react'
import { PageHeader } from '../components/layout/PageHeader'
import { MetricCard } from '../components/overview/MetricCard'
import { PeriodList } from '../components/overview/PeriodList'
import { ReTransferButton } from '../components/overview/ReTransferButton'
import { Callout } from '../components/ui/Callout'
import { useDashboardSummary } from '../lib/hooks'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useNavigate } from '../lib/router'
import { formatKr } from '../lib/format'

const BACKUP_WARN_DAYS = 30

function daysSince(iso: string): number {
  const then = new Date(iso)
  const now = new Date()
  const ms = now.getTime() - then.getTime()
  return Math.floor(ms / (1000 * 60 * 60 * 24))
}

function BackupReminder({
  navigate,
  lastBackup,
}: {
  navigate: (path: string) => void
  lastBackup: string | null
}) {
  const age = lastBackup ? daysSince(lastBackup) : null
  const needsAttention = age === null || age >= BACKUP_WARN_DAYS
  if (!needsAttention) return null

  return (
    <div className="mb-4">
      <Callout
        variant="warning"
        title={
          age === null
            ? 'Ingen säkerhetskopia har skapats ännu'
            : `Senaste säkerhetskopia är ${age} dagar gammal`
        }
        data-testid="backup-reminder"
      >
        <div className="flex items-start justify-between gap-4">
          <p className="text-xs">
            Bokföringslagen 7 kap kräver arkivering i 7 år. Skapa en
            säkerhetskopia regelbundet — datafilen är helt lokal.
          </p>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="flex-shrink-0 rounded-md border border-warning-500/30 bg-[var(--surface-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-warning-100/40"
          >
            Öppna inställningar
          </button>
        </div>
      </Callout>
    </div>
  )
}

function isFreshInstall(summary: {
  revenueOre: number
  expensesOre: number
  vatNetOre: number
  unpaidReceivablesOre: number
  unpaidPayablesOre: number
}): boolean {
  return (
    summary.revenueOre === 0 &&
    summary.expensesOre === 0 &&
    summary.vatNetOre === 0 &&
    summary.unpaidReceivablesOre === 0 &&
    summary.unpaidPayablesOre === 0
  )
}

function WelcomeCtas({ navigate }: { navigate: (path: string) => void }) {
  const ctas = [
    {
      icon: FileText,
      label: 'Skapa din första faktura',
      description: 'Bokför intäkter från kunder',
      path: '/income',
    },
    {
      icon: Users,
      label: 'Lägg till en kund',
      description: 'Registrera motparter för fakturering',
      path: '/customers',
    },
    {
      icon: Package,
      label: 'Lägg till produkter',
      description: 'Återanvändbara artiklar på fakturor',
      path: '/products',
    },
    {
      icon: Upload,
      label: 'Importera från annat system',
      description: 'SIE4- eller SIE5-fil',
      path: '/import',
    },
  ]
  return (
    <div
      className="mb-8 rounded-lg border border-border bg-card p-6"
      data-testid="welcome-empty-state"
    >
      <h2 className="font-serif text-lg font-normal">
        Välkommen till <span className="font-serif-italic">Fritt</span>{' '}
        Bokföring
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Börja med ett av följande för att komma igång. Siffrorna nedan
        uppdateras automatiskt när du bokför.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {ctas.map(({ icon: Icon, label, description, path }) => (
          <button
            key={path}
            type="button"
            onClick={() => navigate(path)}
            className="flex items-start gap-3 rounded-md border border-border p-3 text-left transition-colors hover:border-primary hover:bg-primary/5"
          >
            <Icon className="mt-0.5 h-5 w-5 text-primary" aria-hidden="true" />
            <div>
              <div className="text-sm font-medium">{label}</div>
              <div className="text-xs text-muted-foreground">{description}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

export function PageOverview() {
  const { activeFiscalYear, allFiscalYears } = useFiscalYearContext()
  const navigate = useNavigate()
  const {
    data: summary,
    isLoading,
    error,
  } = useDashboardSummary(activeFiscalYear?.id)

  const [lastBackup, setLastBackup] = useState<string | null>(null)
  useEffect(() => {
    window.api.getSetting('last_backup_date').then((val) => {
      if (typeof val === 'string') setLastBackup(val)
    })
  }, [])

  const showWelcome = summary != null && isFreshInstall(summary)

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <PageHeader title="Översikt" />
      <div className="px-8 py-6">
        {error && (
          <div className="mb-4">
            <Callout variant="danger" data-testid="overview-error">
              Kunde inte ladda dashboard-data.
            </Callout>
          </div>
        )}

        {!error && !showWelcome && (
          <BackupReminder navigate={navigate} lastBackup={lastBackup} />
        )}

        {!error && showWelcome && <WelcomeCtas navigate={navigate} />}

        {!error && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <MetricCard
                label="Intäkter"
                value={summary ? formatKr(summary.revenueOre) : undefined}
                isLoading={isLoading}
                sublabel="exkl. moms"
                onClick={() => navigate('/income')}
              />
              <MetricCard
                label="Kostnader"
                value={summary ? formatKr(summary.expensesOre) : undefined}
                isLoading={isLoading}
                sublabel="exkl. moms"
                onClick={() => navigate('/expenses')}
              />
              <MetricCard
                label="Rörelseresultat"
                value={
                  summary ? formatKr(summary.operatingResultOre) : undefined
                }
                isLoading={isLoading}
                sublabel="exkl. finansiella poster & skatt"
                variant={
                  !summary
                    ? 'default'
                    : summary.operatingResultOre >= 0
                      ? 'positive'
                      : 'negative'
                }
                onClick={() => navigate('/reports')}
              />
            </div>

            <div className="mb-8 grid grid-cols-3 gap-3">
              <MetricCard
                label="Moms netto"
                value={summary ? formatKr(summary.vatNetOre) : undefined}
                isLoading={isLoading}
                sublabel={
                  !summary
                    ? undefined
                    : summary.vatNetOre >= 0
                      ? 'att betala till SKV'
                      : 'fordran på SKV'
                }
                onClick={() => navigate('/vat')}
              />
              <MetricCard
                label="Obet. kundfordringar"
                value={
                  summary ? formatKr(summary.unpaidReceivablesOre) : undefined
                }
                isLoading={isLoading}
                onClick={() => navigate('/aging')}
              />
              <MetricCard
                label="Obet. lev.skulder"
                value={
                  summary ? formatKr(summary.unpaidPayablesOre) : undefined
                }
                isLoading={isLoading}
                onClick={() => navigate('/aging')}
              />
            </div>
          </>
        )}

        <PeriodList />

        {allFiscalYears.length > 1 && activeFiscalYear && <ReTransferButton />}
      </div>
    </div>
  )
}
