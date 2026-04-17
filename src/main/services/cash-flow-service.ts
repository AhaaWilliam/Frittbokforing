import type Database from 'better-sqlite3'
import type { IpcResult } from '../../shared/types'
import { calculateResultSummary } from './result-service'

/**
 * Kassaflödesanalys — indirekt metod (Sprint 53 F65).
 *
 * Rörelsekapital-intervall hårdkodade efter K2/K3-standard (BAS-kontoplan).
 * Beslut i docs/s53-decisions.md.
 *
 * Invariant: operating + investing + financing === closingCash - openingCash
 * (exakt, inte tolerans — se tester).
 */

export interface AccountRange {
  from: number
  to: number
  label: string
}

export const WORKING_CAPITAL_RANGES = {
  current_assets: [
    { from: 1400, to: 1499, label: 'Varulager' },
    { from: 1500, to: 1599, label: 'Kundfordringar' },
    { from: 1600, to: 1699, label: 'Övriga kortfristiga fordringar' },
    { from: 1700, to: 1799, label: 'Förutbetalda kostnader/upplupna intäkter' },
  ] as AccountRange[],
  current_liabilities: [
    { from: 2400, to: 2499, label: 'Leverantörsskulder' },
    { from: 2600, to: 2699, label: 'Momsredovisning' },
    { from: 2800, to: 2899, label: 'Övriga kortfristiga skulder' },
    { from: 2900, to: 2999, label: 'Upplupna kostnader/förutbetalda intäkter' },
  ] as AccountRange[],
  cash: [{ from: 1900, to: 1999, label: 'Likvida medel' }] as AccountRange[],
  investing_fixed_assets: [
    { from: 1000, to: 1299, label: 'Anläggningstillgångar' },
  ] as AccountRange[],
  financing_long_term_liabilities: [
    { from: 2300, to: 2399, label: 'Långfristiga skulder' },
  ] as AccountRange[],
  financing_equity: [
    { from: 2000, to: 2099, label: 'Eget kapital' },
  ] as AccountRange[],
  depreciation_expense: [
    { from: 7700, to: 7899, label: 'Av- och nedskrivningar' },
  ] as AccountRange[],
} as const

export interface CashFlowSection {
  label: string
  items: Array<{ label: string; amount_ore: number }>
  subtotal_ore: number
}

export interface CashFlowReport {
  netResultOre: number
  openingCashOre: number
  closingCashOre: number
  operating: CashFlowSection
  investing: CashFlowSection
  financing: CashFlowSection
  netChangeOre: number
}

// ═══ Helpers ═══

/**
 * Return sum(debit_ore - credit_ore) for all journal_entry_lines on accounts
 * matching `ranges`, for entries in `fiscalYearId` with status='booked'.
 * Uses numerisk SUBSTR-CAST (M98) för att matcha även 5-siffriga underkonton.
 */
function sumRawDelta(
  db: Database.Database,
  fiscalYearId: number,
  ranges: AccountRange[],
): number {
  if (ranges.length === 0) return 0
  const conditions = ranges
    .map(
      () =>
        `CAST(SUBSTR(jel.account_number || '0000', 1, 4) AS INTEGER) BETWEEN ? AND ?`,
    )
    .join(' OR ')
  const params: number[] = []
  for (const r of ranges) {
    params.push(r.from, r.to)
  }
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(jel.debit_ore - jel.credit_ore), 0) AS delta
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       WHERE je.fiscal_year_id = ? AND je.status = 'booked'
         AND (${conditions})`,
    )
    .get(fiscalYearId, ...params) as { delta: number }
  return row.delta
}

/**
 * Detekterar year-end-booking (bookYearEndResult) via netto-rörelse på konto 8999.
 *
 * `bookYearEndResult` bokför D 8999 / K 2099 vid vinst, K 8999 / D 2099 vid förlust.
 * Konto 8999 ("Årets resultat") används i praktiken enbart för denna operation.
 *
 * Returnerar:
 *  - +X om year-end bokades med vinst X
 *  - −X om year-end bokades med förlust X
 *  - 0 om ingen year-end-booking har skett
 *
 * F65-b (Sprint 54): utan denna detektion bröt `-netResult`-subtraktionen i
 * financing-sektionen för FY utan year-end-booking (-netResult subtraherades
 * från equity-delta=0 → financing visade felaktigt −netResult).
 */
function getYearEndBookedAmount(
  db: Database.Database,
  fiscalYearId: number,
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(jel.debit_ore - jel.credit_ore), 0) AS signed
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       WHERE je.fiscal_year_id = ? AND je.status = 'booked'
         AND jel.account_number = '8999'`,
    )
    .get(fiscalYearId) as { signed: number }
  return row.signed
}

/**
 * Sum expense-side (debit) charges on 78xx accounts — non-cash depreciation
 * to add back in operating cash flow.
 */
function sumDepreciationExpense(
  db: Database.Database,
  fiscalYearId: number,
): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(jel.debit_ore - jel.credit_ore), 0) AS total
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       WHERE je.fiscal_year_id = ? AND je.status = 'booked'
         AND CAST(SUBSTR(jel.account_number || '0000', 1, 4) AS INTEGER) BETWEEN 7700 AND 7899`,
    )
    .get(fiscalYearId) as { total: number }
  return row.total
}

/**
 * Cash balance = sum(debit - credit) for 1900-1999 in given FY.
 * openingCash = 0 for a brand-new FY; carried-over IB from previous FY
 * is already counted in the journal via opening_balance entries (which have
 * status='booked').
 */
function getCashBalance(db: Database.Database, fiscalYearId: number): number {
  return sumRawDelta(
    db,
    fiscalYearId,
    WORKING_CAPITAL_RANGES.cash as unknown as AccountRange[],
  )
}

/**
 * Current-period delta for a range — the raw balance change during this FY.
 * = sum(debit-credit) of journal_entry_lines WITHOUT status='booked'
 *   source_type != 'opening_balance' to exclude IB carry-over.
 */
function sumPeriodDelta(
  db: Database.Database,
  fiscalYearId: number,
  ranges: AccountRange[],
): number {
  if (ranges.length === 0) return 0
  const conditions = ranges
    .map(
      () =>
        `CAST(SUBSTR(jel.account_number || '0000', 1, 4) AS INTEGER) BETWEEN ? AND ?`,
    )
    .join(' OR ')
  const params: number[] = []
  for (const r of ranges) {
    params.push(r.from, r.to)
  }
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(jel.debit_ore - jel.credit_ore), 0) AS delta
       FROM journal_entry_lines jel
       JOIN journal_entries je ON jel.journal_entry_id = je.id
       WHERE je.fiscal_year_id = ? AND je.status = 'booked'
         AND je.source_type != 'opening_balance'
         AND (${conditions})`,
    )
    .get(fiscalYearId, ...params) as { delta: number }
  return row.delta
}

/** Section-sum för redovisning i rapporten: sum(|-delta|) för current assets etc. */
function buildSection(
  label: string,
  items: Array<{ label: string; amount_ore: number }>,
): CashFlowSection {
  return {
    label,
    items,
    subtotal_ore: items.reduce((sum, i) => sum + i.amount_ore, 0),
  }
}

// ═══ Public API ═══

export function getCashFlowStatement(
  db: Database.Database,
  fiscalYearId: number,
): IpcResult<CashFlowReport> {
  const fy = db
    .prepare('SELECT id FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { id: number } | undefined
  if (!fy) {
    return {
      success: false,
      code: 'NOT_FOUND',
      error: 'Räkenskapsår hittades inte',
    }
  }

  const rawNetResultOre = calculateResultSummary(db, fiscalYearId).netResultOre
  const depreciationExpense = sumDepreciationExpense(db, fiscalYearId)

  // F65-b: detektera year-end-booking (konto 8999). `bookYearEndResult` flyttar
  // netresultatet från klass 3–8 till 2099; efter det returnerar calculateResultSummary
  // 0 (eftersom 8999 offsettar revenue/cost). Det pre-YE-netresultatet ligger då som
  // signed 8999-rörelse.
  const yearEndAmount = getYearEndBookedAmount(db, fiscalYearId)
  const effectiveNetResult =
    yearEndAmount !== 0 ? yearEndAmount : rawNetResultOre

  // Raw period deltas (debit-credit) — EXCLUDING opening_balance journal entries
  const assetsDelta = sumPeriodDelta(db, fiscalYearId, [
    ...WORKING_CAPITAL_RANGES.current_assets,
  ])
  const liabilitiesDelta = sumPeriodDelta(db, fiscalYearId, [
    ...WORKING_CAPITAL_RANGES.current_liabilities,
  ])
  const investingDelta = sumPeriodDelta(db, fiscalYearId, [
    ...WORKING_CAPITAL_RANGES.investing_fixed_assets,
  ])
  const equityDelta = sumPeriodDelta(db, fiscalYearId, [
    ...WORKING_CAPITAL_RANGES.financing_equity,
  ])
  const debtDelta = sumPeriodDelta(db, fiscalYearId, [
    ...WORKING_CAPITAL_RANGES.financing_long_term_liabilities,
  ])

  // Operating: effectiveNetResult + depreciation - ΔassetsRaw - ΔliabRaw
  // (Raw liab delta is negative when liabilities increased; subtracting a negative adds.)
  const workingCapitalChange = -assetsDelta - liabilitiesDelta

  const operating = buildSection('Operativ verksamhet', [
    { label: 'Årets resultat', amount_ore: effectiveNetResult },
    { label: 'Återlagda avskrivningar', amount_ore: depreciationExpense },
    { label: 'Förändring rörelsekapital', amount_ore: workingCapitalChange },
  ])

  // Investing: -ΔfixedAssetsRaw - depreciationExpense
  // (ΔfixedAssets_raw includes depreciation-driven credits on 1x19; subtract dep to isolate net acq/disp.)
  const investingCashFlow = -investingDelta - depreciationExpense
  const investing = buildSection('Investeringsverksamhet', [
    {
      label: 'Anläggningstillgångar netto',
      amount_ore: investingCashFlow,
    },
  ])

  // Financing: -(equityDelta + yearEndAmount) - debtDelta
  // yearEndAmount compenserar för year-end-booking: vid vinst är 2099-effekten på equityDelta
  // = -yearEndAmount (credit), och vi vill exkludera detta från financing-flödet.
  // Addera yearEndAmount till equityDelta ger 0 om enda equity-rörelsen är year-end.
  const equityDeltaExclYE = equityDelta + yearEndAmount
  const equityContribution = -equityDeltaExclYE
  const debtContribution = -debtDelta
  const financing = buildSection('Finansieringsverksamhet', [
    {
      label: 'Eget kapital netto (exkl. årets resultat)',
      amount_ore: equityContribution,
    },
    { label: 'Långfristiga skulder netto', amount_ore: debtContribution },
  ])

  const netChangeOre =
    operating.subtotal_ore + investing.subtotal_ore + financing.subtotal_ore

  // opening + closing cash
  const closingCashOre = getCashBalance(db, fiscalYearId)
  const openingCashOre =
    sumRawDelta(db, fiscalYearId, [...WORKING_CAPITAL_RANGES.cash]) -
    sumPeriodDelta(db, fiscalYearId, [...WORKING_CAPITAL_RANGES.cash])
  // closingCashOre = opening + period delta (from booked entries incl IB)
  // opening = closing - period delta; but delta here excludes opening_balance entries,
  // so: opening from IB entries = closingCash - periodDelta

  return {
    success: true,
    data: {
      netResultOre: effectiveNetResult,
      openingCashOre,
      closingCashOre,
      operating,
      investing,
      financing,
      netChangeOre,
    },
  }
}
