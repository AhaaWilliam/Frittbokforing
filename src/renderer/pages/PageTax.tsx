import { PageHeader } from '../components/layout/PageHeader'
import { MetricCard } from '../components/overview/MetricCard'
import { Callout } from '../components/ui/Callout'
import { useTaxForecast } from '../lib/hooks'
import { useFiscalYearContext } from '../contexts/FiscalYearContext'
import { useActiveCompany } from '../contexts/ActiveCompanyContext'
import { formatKr } from '../lib/format'
import { formatFiscalYearLabel } from '../components/layout/YearPicker'

export function PageTax() {
  const { activeFiscalYear } = useFiscalYearContext()
  const { activeCompany } = useActiveCompany()
  const {
    data: forecast,
    isLoading,
    error,
  } = useTaxForecast(activeFiscalYear?.id)

  const fmt = (ore: number | null | undefined): string => {
    if (ore === null || ore === undefined) return '–'
    return formatKr(ore)
  }

  const isLoss = forecast && forecast.operatingProfitOre < 0

  // Visa helårsprognos när minst 1 period avslutats men inte de sista.
  // fiscalYearMonths = 1–13 per M161 (kortat/förlängt första FY).
  const fiscalYearMonths = forecast?.fiscalYearMonths ?? 12
  const showProjection =
    forecast &&
    forecast.monthsElapsed >= 1 &&
    forecast.monthsElapsed <= fiscalYearMonths - 2

  return (
    <div className="flex flex-1 flex-col overflow-auto print:overflow-visible">
      <div className="print:hidden">
        <PageHeader title="Skatteprognos" />
      </div>

      {/* Print-only header */}
      <div
        className="hidden print:block print:px-[15mm] print:pt-[15mm]"
        data-testid="tax-print-header"
      >
        <h1 className="text-lg font-semibold">Skatteprognos</h1>
        {activeCompany && (
          <p className="text-sm">
            {activeCompany.name}
            {activeCompany.org_number ? ` · ${activeCompany.org_number}` : ''}
            {activeFiscalYear
              ? ` · ${formatFiscalYearLabel(activeFiscalYear)}`
              : ''}
          </p>
        )}
      </div>

      <div className="space-y-6 p-8 print:space-y-3 print:p-[15mm] print:text-[10pt]">
        {/* Disclaimer */}
        <Callout
          variant="warning"
          data-testid="tax-disclaimer"
          className="print:hidden"
        >
          Prognosen är en approximation baserad på rörelseresultatet (EBIT,
          konton 3–7). Följande ingår <strong>inte</strong> i beräkningen och
          kan ge avvikelse mot verklig bolagsskatt: finansiella poster (räntor,
          klass 8), ej avdragsgilla kostnader (t.ex. förseningsavgifter, ej
          avdragsgill representation) samt övriga skattemässiga justeringar.
          Konsultera en redovisningskonsult för definitiv skatteberäkning.
        </Callout>

        {error && (
          <Callout variant="danger" data-testid="tax-error">
            Kunde inte beräkna skatteprognos.
          </Callout>
        )}

        {!error && (
          <>
            {/* Sektion 1: Skattebas */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Skattebas
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <MetricCard
                  label="Rörelseresultat (EBIT)"
                  value={fmt(forecast?.operatingProfitOre)}
                  isLoading={isLoading}
                  sublabel="exkl. finansiella poster & skatt"
                  variant={
                    !forecast
                      ? 'default'
                      : forecast.operatingProfitOre >= 0
                        ? 'positive'
                        : 'negative'
                  }
                />
              </div>

              {isLoss && (
                <div className="rounded border border-warning-100 bg-warning-100/40 p-3 text-sm text-warning-700">
                  Bolaget redovisar underskott för perioden — ingen bolagsskatt
                  beräknas. Underskott kan i vissa fall rullas framåt (kräver
                  skatterådgivning).
                </div>
              )}
            </section>

            {/* Sektion 2: År till datum */}
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                År till datum
              </h2>
              <div className="overflow-hidden rounded-lg border">
                <table className="w-full text-sm">
                  <tbody className="divide-y">
                    <tr className="bg-background">
                      <td className="px-4 py-3 text-muted-foreground">
                        Bolagsskatt (20,6%)
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {isLoading ? '–' : fmt(forecast?.corporateTaxOre)}
                      </td>
                    </tr>
                    {!isLoss && (
                      <>
                        <tr className="bg-muted/20">
                          <td className="px-4 py-3 text-muted-foreground">
                            Max periodiseringsfond (25% av vinst)
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {isLoading
                              ? '–'
                              : fmt(forecast?.periodiseringsfondMaxOre)}
                          </td>
                        </tr>
                        <tr className="bg-background">
                          <td className="px-4 py-3 text-muted-foreground">
                            Skatt med periodiseringsfond
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {isLoading
                              ? '–'
                              : fmt(forecast?.corporateTaxAfterFondOre)}
                          </td>
                        </tr>
                        <tr className="bg-muted/20 font-semibold text-success-700">
                          <td className="px-4 py-3">
                            Möjlig skatteminskning via fond
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums">
                            {isLoading
                              ? '–'
                              : fmt(forecast?.taxSavingsFromFondOre)}
                          </td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
              {!isLoss && (
                <p className="text-xs text-muted-foreground">
                  Periodiseringsfond är frivillig. Belopp som sätts av minskar
                  årets skattepliktiga inkomst men återförs och beskattas i
                  framtida år.
                </p>
              )}
            </section>

            {/* Info om nästan avslutat år */}
            {forecast && forecast.monthsElapsed >= fiscalYearMonths - 1 && (
              <p className="text-sm text-muted-foreground">
                Räkenskapsåret är nästan avslutat — år-till-datum-siffran är mer
                tillförlitlig än en prognos.
              </p>
            )}

            {/* Sektion 3: Helårsprognos */}
            {showProjection && forecast && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Helårsprognos
                </h2>
                <p className="text-xs text-muted-foreground">
                  Baserat på {forecast.monthsElapsed} av{' '}
                  {forecast.fiscalYearMonths} avslutade månader. Linjär
                  extrapolering — tar inte hänsyn till säsongsvariationer.
                </p>

                {(() => {
                  const isProjectedLoss =
                    forecast.projectedFullYearIncomeOre !== null &&
                    forecast.projectedFullYearIncomeOre < 0

                  return (
                    <div className="overflow-hidden rounded-lg border">
                      <table className="w-full text-sm">
                        <tbody className="divide-y">
                          <tr className="bg-background">
                            <td className="px-4 py-3 text-muted-foreground">
                              Beräknat helårsresultat
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-medium tabular-nums ${
                                isProjectedLoss ? 'text-danger-600' : ''
                              }`}
                            >
                              {fmt(forecast.projectedFullYearIncomeOre)}
                            </td>
                          </tr>

                          {isProjectedLoss ? (
                            <tr className="bg-warning-100/40">
                              <td
                                colSpan={2}
                                className="px-4 py-3 text-sm text-warning-700"
                              >
                                Prognosen indikerar underskott för helåret —
                                ingen bolagsskatt beräknas.
                              </td>
                            </tr>
                          ) : (
                            <>
                              <tr className="bg-muted/20">
                                <td className="px-4 py-3 text-muted-foreground">
                                  Prognos bolagsskatt (20,6%)
                                </td>
                                <td className="px-4 py-3 text-right font-medium tabular-nums">
                                  {fmt(forecast.projectedFullYearTaxOre)}
                                </td>
                              </tr>
                              <tr className="bg-background">
                                <td className="px-4 py-3 text-muted-foreground">
                                  Prognos med max periodiseringsfond
                                </td>
                                <td className="px-4 py-3 text-right font-medium tabular-nums">
                                  {fmt(
                                    forecast.projectedFullYearTaxAfterFondOre,
                                  )}
                                </td>
                              </tr>
                            </>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )
                })()}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  )
}
