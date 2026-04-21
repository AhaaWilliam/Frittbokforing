import type Database from 'better-sqlite3'
import type { VatQuarterReport, VatReport } from '../../shared/types'
import {
  VAT_OUT_25_ACCOUNT,
  VAT_OUT_12_ACCOUNT,
  VAT_OUT_6_ACCOUNT,
  VAT_IN_ACCOUNT,
} from '../../shared/vat-accounts'

const SWEDISH_MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'maj',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'dec',
] as const

function monthIndexFromISO(isoDate: string): number {
  return parseInt(isoDate.substring(5, 7), 10) - 1
}

function yearFromISO(isoDate: string): number {
  return parseInt(isoDate.substring(0, 4), 10)
}

function buildQuarterLabel(
  quarterIndex: number,
  startDate: string,
  endDate: string,
): string {
  const startMonth = SWEDISH_MONTHS[monthIndexFromISO(startDate)]
  const endMonth = SWEDISH_MONTHS[monthIndexFromISO(endDate)]
  const year = yearFromISO(endDate)
  return `Kv ${quarterIndex + 1} (${startMonth}\u2013${endMonth} ${year})`
}

interface QuarterFrame {
  quarter_index: number
  quarter_start: string
  quarter_end: string
}

interface VatDataRow {
  quarter_index: number
  vat_out_25: number
  vat_out_12: number
  vat_out_6: number
  vat_in: number
}

export function getVatReport(
  db: Database.Database,
  fiscalYearId: number,
): VatReport {
  const run = db.transaction((): VatReport => {
    // Query 1: Quarter skeleton (always 4 rows)
    const quarterFrames = db
      .prepare(
        `SELECT
        ((period_number - 1) / 3) AS quarter_index,
        MIN(start_date) AS quarter_start,
        MAX(end_date) AS quarter_end
      FROM accounting_periods
      WHERE fiscal_year_id = ?
      GROUP BY ((period_number - 1) / 3)
      ORDER BY quarter_index`,
      )
      .all(fiscalYearId) as QuarterFrame[]

    if (quarterFrames.length !== 4) {
      throw {
        code: 'VALIDATION_ERROR',
        error:
          `Expected 4 quarters but got ${quarterFrames.length}. ` +
          `Only 12-month fiscal years are supported in v1.`,
      }
    }

    // Query 2: VAT data per quarter — parameterized (F20)
    const vatDataRows = db
      .prepare(
        `SELECT
        ((ap.period_number - 1) / 3) AS quarter_index,
        COALESCE(SUM(CASE
          WHEN jel.account_number = ?
          THEN jel.credit_ore - jel.debit_ore ELSE 0
        END), 0) AS vat_out_25,
        COALESCE(SUM(CASE
          WHEN jel.account_number = ?
          THEN jel.credit_ore - jel.debit_ore ELSE 0
        END), 0) AS vat_out_12,
        COALESCE(SUM(CASE
          WHEN jel.account_number = ?
          THEN jel.credit_ore - jel.debit_ore ELSE 0
        END), 0) AS vat_out_6,
        COALESCE(SUM(CASE
          WHEN jel.account_number = ?
          THEN jel.debit_ore - jel.credit_ore ELSE 0
        END), 0) AS vat_in
      FROM journal_entry_lines jel
      JOIN journal_entries je ON je.id = jel.journal_entry_id
      JOIN accounting_periods ap
        ON ap.fiscal_year_id = je.fiscal_year_id
        AND je.journal_date >= ap.start_date
        AND je.journal_date <= ap.end_date
      WHERE je.fiscal_year_id = ?
        AND je.status = 'booked'
        AND jel.account_number IN (?, ?, ?, ?)
      GROUP BY ((ap.period_number - 1) / 3)
      ORDER BY quarter_index`,
      )
      .all(
        VAT_OUT_25_ACCOUNT,
        VAT_OUT_12_ACCOUNT,
        VAT_OUT_6_ACCOUNT,
        VAT_IN_ACCOUNT,
        fiscalYearId,
        VAT_OUT_25_ACCOUNT,
        VAT_OUT_12_ACCOUNT,
        VAT_OUT_6_ACCOUNT,
        VAT_IN_ACCOUNT,
      ) as VatDataRow[]

    // Build map for merge
    const vatDataMap = new Map<number, VatDataRow>()
    for (const row of vatDataRows) {
      vatDataMap.set(row.quarter_index, row)
    }

    // Merge quarter frames with VAT data
    const quarters: VatQuarterReport[] = quarterFrames.map((qf) => {
      const vatData = vatDataMap.get(qf.quarter_index)
      const hasData = vatData !== undefined

      const vatOut25Ore = vatData?.vat_out_25 ?? 0
      const vatOut12Ore = vatData?.vat_out_12 ?? 0
      const vatOut6Ore = vatData?.vat_out_6 ?? 0
      const vatInOre = vatData?.vat_in ?? 0
      const vatOutTotalOre = vatOut25Ore + vatOut12Ore + vatOut6Ore

      return {
        quarterIndex: qf.quarter_index,
        quarterLabel: buildQuarterLabel(
          qf.quarter_index,
          qf.quarter_start,
          qf.quarter_end,
        ),
        startDate: qf.quarter_start,
        endDate: qf.quarter_end,
        hasData,

        vatOut25Ore,
        vatOut12Ore,
        vatOut6Ore,
        vatOutTotalOre,

        // Derived taxable bases
        taxableBase25Ore: vatOut25Ore * 4, // 100/25 = 4 (exact)
        taxableBase12Ore: Math.round((vatOut12Ore * 25) / 3), // 100/12 = 25/3 (±1 öre)
        taxableBase6Ore: Math.round((vatOut6Ore * 50) / 3), // 100/6 = 50/3 (±1 öre)

        vatInOre,
        vatNetOre: vatOutTotalOre - vatInOre,
      }
    })

    // Year total — derive base from year totals to avoid double rounding
    const ytVatOut25 = quarters.reduce((s, q) => s + q.vatOut25Ore, 0)
    const ytVatOut12 = quarters.reduce((s, q) => s + q.vatOut12Ore, 0)
    const ytVatOut6 = quarters.reduce((s, q) => s + q.vatOut6Ore, 0)
    const ytVatOutTotal = quarters.reduce((s, q) => s + q.vatOutTotalOre, 0)
    const ytVatIn = quarters.reduce((s, q) => s + q.vatInOre, 0)

    const yearTotal: VatQuarterReport = {
      quarterIndex: -1,
      quarterLabel: 'Helår',
      startDate: quarters[0].startDate,
      endDate: quarters[3].endDate,
      hasData: quarters.some((q) => q.hasData),

      vatOut25Ore: ytVatOut25,
      vatOut12Ore: ytVatOut12,
      vatOut6Ore: ytVatOut6,
      vatOutTotalOre: ytVatOutTotal,

      taxableBase25Ore: ytVatOut25 * 4,
      taxableBase12Ore: Math.round((ytVatOut12 * 25) / 3),
      taxableBase6Ore: Math.round((ytVatOut6 * 50) / 3),

      vatInOre: ytVatIn,
      vatNetOre: ytVatOutTotal - ytVatIn,
    }

    return { quarters, yearTotal, fiscalYearId }
  })

  return run()
}
