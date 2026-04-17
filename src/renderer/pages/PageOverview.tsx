import { PageHeader } from '../components/layout/PageHeader'
import { MetricCard } from '../components/overview/MetricCard'
import { PeriodList } from '../components/overview/PeriodList'
import { ReTransferButton } from '../components/overview/ReTransferButton'
import { useDashboardSummary } from '../lib/hooks'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { formatKr } from '../lib/format'

export function PageOverview() {
  const { activeFiscalYear, allFiscalYears } = useFiscalYearContext()
  const {
    data: summary,
    isLoading,
    error,
  } = useDashboardSummary(activeFiscalYear?.id)

  return (
    <div className="flex flex-1 flex-col overflow-auto">
      <PageHeader title="Översikt" />
      <div className="px-8 py-6">
        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            Kunde inte ladda dashboard-data.
          </div>
        )}

        {!error && (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <MetricCard
                label="Intäkter"
                value={summary ? formatKr(summary.revenueOre) : undefined}
                isLoading={isLoading}
                sublabel="exkl. moms"
              />
              <MetricCard
                label="Kostnader"
                value={summary ? formatKr(summary.expensesOre) : undefined}
                isLoading={isLoading}
                sublabel="exkl. moms"
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
              />
              <MetricCard
                label="Obet. kundfordringar"
                value={
                  summary ? formatKr(summary.unpaidReceivablesOre) : undefined
                }
                isLoading={isLoading}
              />
              <MetricCard
                label="Obet. lev.skulder"
                value={
                  summary ? formatKr(summary.unpaidPayablesOre) : undefined
                }
                isLoading={isLoading}
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
