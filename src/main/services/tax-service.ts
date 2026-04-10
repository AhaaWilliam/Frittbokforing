import type Database from 'better-sqlite3'
import type { TaxForecast } from '../../shared/types'
import { calculateOperatingResult } from './result-service'

// Skattelagstiftning — aldrig magic numbers
const CORPORATE_TAX_NUMERATOR = 206
const CORPORATE_TAX_DENOMINATOR = 1000
const PERIODISERINGSFOND_RATE = 25
const PERIODISERINGSFOND_DIVISOR = 100

export function getTaxForecast(
  db: Database.Database,
  fiscalYearId: number,
): TaxForecast {
  const run = db.transaction((): TaxForecast => {
    const operatingProfitOre = calculateOperatingResult(db, fiscalYearId)

    // ── Avslutade perioder (för helårsprognos) ──
    // En period räknas som avslutad först dagen EFTER end_date (< istället för <=)
    const monthsRow = db
      .prepare(
        `
      SELECT COUNT(*) AS months_elapsed
      FROM accounting_periods
      WHERE fiscal_year_id = ?
        AND date(end_date) < date('now', 'localtime')
    `,
      )
      .get(fiscalYearId) as { months_elapsed: number }

    // ── Beräkningar (all logik i main process — princip #1) ──

    // Skattebas: aldrig negativt (förlust → ingen skatt)
    const taxableIncomeOre = Math.max(0, operatingProfitOre)

    // Bolagsskatt — heltalsaritmetik
    const corporateTaxOre = Math.floor(
      (taxableIncomeOre * CORPORATE_TAX_NUMERATOR) / CORPORATE_TAX_DENOMINATOR,
    )

    // Periodiseringsfond — valfri, visar max möjlig
    const periodiseringsfondMaxOre = Math.floor(
      (taxableIncomeOre * PERIODISERINGSFOND_RATE) / PERIODISERINGSFOND_DIVISOR,
    )
    const taxableIncomeAfterFondOre =
      taxableIncomeOre - periodiseringsfondMaxOre
    const corporateTaxAfterFondOre = Math.floor(
      (taxableIncomeAfterFondOre * CORPORATE_TAX_NUMERATOR) /
        CORPORATE_TAX_DENOMINATOR,
    )
    const taxSavingsFromFondOre = corporateTaxOre - corporateTaxAfterFondOre

    // Helårsprognos — null om inga avslutade perioder
    const monthsElapsed = monthsRow.months_elapsed
    let projectedFullYearIncomeOre: number | null = null
    let projectedFullYearTaxOre: number | null = null
    let projectedFullYearTaxAfterFondOre: number | null = null

    if (monthsElapsed > 0) {
      projectedFullYearIncomeOre = Math.round(
        (operatingProfitOre * 12) / monthsElapsed,
      )

      const projectedTaxableOre = Math.max(0, projectedFullYearIncomeOre)
      projectedFullYearTaxOre = Math.floor(
        (projectedTaxableOre * CORPORATE_TAX_NUMERATOR) /
          CORPORATE_TAX_DENOMINATOR,
      )

      const projectedFondOre = Math.floor(
        (projectedTaxableOre * PERIODISERINGSFOND_RATE) /
          PERIODISERINGSFOND_DIVISOR,
      )
      projectedFullYearTaxAfterFondOre = Math.floor(
        ((projectedTaxableOre - projectedFondOre) * CORPORATE_TAX_NUMERATOR) /
          CORPORATE_TAX_DENOMINATOR,
      )
    }

    return {
      operatingProfitOre,
      taxableIncomeOre,
      corporateTaxOre,
      periodiseringsfondMaxOre,
      taxableIncomeAfterFondOre,
      corporateTaxAfterFondOre,
      taxSavingsFromFondOre,
      monthsElapsed,
      fiscalYearMonths: 12,
      projectedFullYearIncomeOre,
      projectedFullYearTaxOre,
      projectedFullYearTaxAfterFondOre,
      taxRatePercent: 20.6,
      periodiseringsfondRatePercent: 25.0,
    }
  })

  return run()
}
