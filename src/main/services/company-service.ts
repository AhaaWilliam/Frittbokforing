import type Database from 'better-sqlite3'
import type { Company, IpcResult, ErrorCode } from '../../shared/types'
import {
  CreateCompanyInputSchema,
  UpdateCompanyInputSchema,
} from '../ipc-schemas'
import {
  mapUniqueConstraintError,
  COMPANY_UNIQUE_MAPPINGS,
} from './error-helpers'
import log from 'electron-log'
import { buildUpdate } from '../utils/build-update'

export interface GeneratedPeriod {
  period_number: number
  start_date: string
  end_date: string
}

/**
 * Genererar 1–12 perioder för ett räkenskapsår. Stödjer både
 * standard-FY (12 kalendermånader från 1:a i månaden) och kortat
 * första FY per BFL 3 kap 3§ (start på godtyckligt datum, stub-period
 * till sista dagen i startmånaden, därefter hela kalendermånader).
 *
 * Regler:
 * - Första period: start = fiscalYearStart, end = sista dagen i start-
 *   månaden (eller fiscalYearEnd om det inträffar tidigare).
 * - Mellanperioder: start = 1:a i månaden, end = sista dagen i samma
 *   månad.
 * - Sista period: start = 1:a i slutmånaden, end = fiscalYearEnd
 *   (fiscalYearEnd MÅSTE vara sista dagen i sin månad för ≤ 12
 *   perioder — enforced i schema, inte här).
 * - Hanterar skottår (feb 29) via JS `new Date(y, m+1, 0)`.
 * - Hanterar brutet räkenskapsår.
 *
 * Invarianter:
 * 1. 1 ≤ periods.length ≤ 12 (DB CHECK `period_number <= 12`)
 * 2. periods[0].start_date === fiscalYearStart
 * 3. periods[last].end_date === fiscalYearEnd
 * 4. Varje period: end_date >= start_date (stub kan vara 1-dags)
 * 5. Inga gap — periods[i+1].start_date === periods[i].end_date + 1 dag
 * 6. Inga överlapp (följer av #5)
 */
export function generatePeriods(
  fiscalYearStart: string,
  fiscalYearEnd: string,
): GeneratedPeriod[] {
  const periods: GeneratedPeriod[] = []
  const endDate = new Date(fiscalYearEnd + 'T00:00:00')
  let cursor = new Date(fiscalYearStart + 'T00:00:00')
  let periodNumber = 1

  while (cursor.getTime() <= endDate.getTime() && periodNumber <= 13) {
    // Sista dagen i aktuell månad
    const lastOfMonth = new Date(
      cursor.getFullYear(),
      cursor.getMonth() + 1,
      0,
    )
    // Period slutar vid sista-dagen-i-månaden eller fiscalYearEnd,
    // beroende av vilket som kommer först.
    const periodEnd =
      lastOfMonth.getTime() <= endDate.getTime() ? lastOfMonth : endDate

    periods.push({
      period_number: periodNumber,
      start_date: formatDate(cursor),
      end_date: formatDate(periodEnd),
    })

    // Nästa period börjar dagen efter denna slutar
    cursor = new Date(
      periodEnd.getFullYear(),
      periodEnd.getMonth(),
      periodEnd.getDate() + 1,
    )
    periodNumber++
  }

  validatePeriodInvariants(periods, fiscalYearStart, fiscalYearEnd)

  return periods
}

function formatDate(d: Date): string {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function validatePeriodInvariants(
  periods: GeneratedPeriod[],
  fyStart: string,
  fyEnd: string,
): void {
  if (periods.length < 1 || periods.length > 12) {
    throw new Error(
      `Invariant: periods.length (${periods.length}) måste vara mellan 1 och 12 (DB CHECK period_number <= 12)`,
    )
  }
  if (periods[0].start_date !== fyStart) {
    throw new Error(
      `Invariant: Period 1 start (${periods[0].start_date}) ≠ räkenskapsår start (${fyStart})`,
    )
  }
  const last = periods[periods.length - 1]
  if (last.end_date !== fyEnd) {
    throw new Error(
      `Invariant: Sista periodens slut (${last.end_date}) ≠ räkenskapsår slut (${fyEnd})`,
    )
  }
  for (let i = 0; i < periods.length; i++) {
    // Stub-perioder kan vara 1 dag långa (start_date === end_date är OK).
    if (periods[i].end_date < periods[i].start_date) {
      throw new Error(
        `Invariant: Period ${i + 1} end_date (${periods[i].end_date}) < start_date (${periods[i].start_date})`,
      )
    }
    if (i > 0) {
      const prevEnd = new Date(periods[i - 1].end_date + 'T00:00:00')
      const nextDay = new Date(prevEnd)
      nextDay.setDate(nextDay.getDate() + 1)
      const expected = formatDate(nextDay)
      if (periods[i].start_date !== expected) {
        throw new Error(
          `Invariant: Gap/överlapp mellan period ${i} och ${i + 1}: ` +
            `${periods[i - 1].end_date} → ${periods[i].start_date} (förväntat ${expected})`,
        )
      }
    }
  }
}

export function createCompany(
  db: Database.Database,
  input: unknown,
): IpcResult<Company> {
  // 1. Zod-validera
  const parsed = CreateCompanyInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
      code: 'VALIDATION_ERROR' as const,
    }
  }
  const data = parsed.data

  try {
    // 2. Generera perioder INNAN transaktionen
    let periods: GeneratedPeriod[]
    try {
      periods = generatePeriods(data.fiscal_year_start, data.fiscal_year_end)
    } catch (err) {
      return {
        success: false,
        error:
          err instanceof Error ? err.message : 'Periodgenerering misslyckades',
        code: 'PERIOD_GENERATION_ERROR' as const,
      }
    }

    // 3. Kör allt i EN transaktion
    const result = db.transaction(() => {
      // a) INSERT company
      const companyResult = db
        .prepare(
          `INSERT INTO companies (name, org_number, fiscal_rule, share_capital, registration_date, board_members)
         VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          data.name,
          data.org_number,
          data.fiscal_rule,
          data.share_capital,
          data.registration_date,
          data.board_members ?? null,
        )
      const companyId = Number(companyResult.lastInsertRowid)

      // b) INSERT fiscal_year
      const yearLabel = data.fiscal_year_start.substring(0, 4)
      const fyResult = db
        .prepare(
          `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (?, ?, ?, ?)`,
        )
        .run(companyId, yearLabel, data.fiscal_year_start, data.fiscal_year_end)
      const fiscalYearId = Number(fyResult.lastInsertRowid)

      // c) INSERT 12 accounting_periods
      const periodStmt = db.prepare(
        `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
         VALUES (?, ?, ?, ?, ?)`,
      )
      for (const period of periods) {
        periodStmt.run(
          companyId,
          fiscalYearId,
          period.period_number,
          period.start_date,
          period.end_date,
        )
      }

      // verification_sequences table dropped in migration 028 (F7).

      // e) Hämta det skapade företaget
      const company = db
        .prepare('SELECT * FROM companies WHERE id = ?')
        .get(companyId) as Company
      return company
    })()

    return { success: true, data: result }
  } catch (err: unknown) {
    const mapped = mapUniqueConstraintError(err, COMPANY_UNIQUE_MAPPINGS)
    if (mapped) return { success: false, ...mapped }
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      return { success: false, error: e.error, code: e.code, field: e.field }
    }
    log.error('[company-service] createCompany:', err)
    return {
      success: false,
      error: 'Ett oväntat fel uppstod vid skapande av företag.',
      code: 'UNEXPECTED_ERROR' as const,
    }
  }
}

export function listCompanies(db: Database.Database): Company[] {
  return db.prepare('SELECT * FROM companies ORDER BY id').all() as Company[]
}

export function getCompanyById(
  db: Database.Database,
  id: number,
): Company | null {
  const row = db.prepare('SELECT * FROM companies WHERE id = ?').get(id)
  return (row as Company) ?? null
}

/**
 * Backwards-kompatibel single-company getter.
 *
 * Sprint MC1: returnerar första bolaget. Renderer-sidan migreras till
 * listCompanies/getCompanyById i Sprint MC2 när ActiveCompanyContext införs.
 * Nya callsites ska INTE använda denna — använd listCompanies eller
 * getCompanyById med ett aktivt company_id från active-context-helpern.
 */
export function getCompany(db: Database.Database): Company | null {
  const row = db.prepare('SELECT * FROM companies ORDER BY id LIMIT 1').get()
  return (row as Company) ?? null
}

export function updateCompany(
  db: Database.Database,
  input: unknown,
): IpcResult<Company> {
  const parsed = UpdateCompanyInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
      code: 'VALIDATION_ERROR' as const,
    }
  }

  // Sprint MC1: updateCompany targetar fortfarande "första bolaget" via
  // getCompany. UI-kontraktet utvidgas i MC2 (UpdateCompanyInputSchema får
  // ett id-fält samtidigt som ActiveCompanyContext införs).
  const company = getCompany(db)
  if (!company) {
    return {
      success: false,
      error: 'Inget företag hittat.',
      code: 'NOT_FOUND' as const,
    }
  }

  const built = buildUpdate(
    db,
    'companies',
    parsed.data as Record<string, unknown>,
    { allowedColumns: ALLOWED_COMPANY_COLUMNS },
  )
  if (built) built.run('id = ?', [company.id])

  return { success: true, data: getCompany(db)! }
}

const ALLOWED_COMPANY_COLUMNS = new Set([
  'name',
  'org_number',
  'vat_number',
  'email',
  'phone',
  'address_line1',
  'address_line2',
  'postal_code',
  'city',
  'country',
  'bankgiro',
  'plusgiro',
  'website',
  'share_capital',
  'board_members',
  'fiscal_rule',
  'base_currency',
  'approved_for_f_tax',
])
