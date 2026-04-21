import type Database from 'better-sqlite3'
import log from 'electron-log'
import { checkChronology } from './chronology-guard'
import { validateAccountsActive } from './account-service'
import { safeRebuildSearchIndex } from './search-service'
import { todayLocalFromNow } from '../utils/now'
import type {
  IpcResult,
  ErrorCode,
  CreateFixedAssetInput,
  UpdateFixedAssetInput,
  FixedAsset,
  FixedAssetWithAccumulation,
  FixedAssetWithSchedule,
  DepreciationSchedule,
  ExecuteDepreciationPeriodResult,
} from '../../shared/types'

// ═══ Schedule generation ═══

/**
 * Linjär avskrivning: lika belopp per period, sista raden justerar avrundning.
 * Invariant: sum(schedule) === cost - residual (exakt i öre).
 */
export function generateLinearSchedule(
  costOre: number,
  residualOre: number,
  months: number,
): number[] {
  const totalDepreciableOre = costOre - residualOre
  if (totalDepreciableOre <= 0) return new Array(months).fill(0)
  const perMonth = Math.round(totalDepreciableOre / months)
  const schedule = new Array(months).fill(perMonth)
  const rounded = perMonth * months
  const adjustment = totalDepreciableOre - rounded
  schedule[months - 1] += adjustment
  return schedule
}

/**
 * Degressiv avskrivning: monthly[n] = round(book_value[n] * rate_bp / 10000 / 12).
 * Klämper till residual floor — om book_value går under residual ska
 * månadsbeloppet justeras så book_value stannar på residual.
 */
export function generateDecliningSchedule(
  costOre: number,
  residualOre: number,
  months: number,
  rateBp: number,
): number[] {
  const schedule: number[] = []
  let bookValue = costOre
  for (let i = 0; i < months; i++) {
    const annualDep = Math.round((bookValue * rateBp) / 10000)
    let monthlyDep = Math.round(annualDep / 12)
    if (bookValue - monthlyDep < residualOre) {
      monthlyDep = bookValue - residualOre
    }
    if (monthlyDep < 0) monthlyDep = 0
    schedule.push(monthlyDep)
    bookValue -= monthlyDep
  }
  return schedule
}

/**
 * Lägger `months` månader på `startDate` (YYYY-MM-DD) och returnerar
 * period_start + period_end för varje månad i schema-ordning.
 */
function computePeriods(
  startDate: string,
  months: number,
): Array<{ start: string; end: string }> {
  const [yStr, mStr, dStr] = startDate.split('-')
  const startY = parseInt(yStr, 10)
  const startM = parseInt(mStr, 10)
  const dayOfMonth = parseInt(dStr, 10)
  const periods: Array<{ start: string; end: string }> = []
  for (let i = 0; i < months; i++) {
    const periodStart = new Date(startY, startM - 1 + i, dayOfMonth)
    const periodEnd = new Date(startY, startM + i, 0)
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    periods.push({ start: fmt(periodStart), end: fmt(periodEnd) })
  }
  return periods
}

// ═══ CRUD ═══

function validateFixedAssetInput(
  input: CreateFixedAssetInput,
  db: Database.Database,
): { success: false; code: ErrorCode; error: string; field?: string } | null {
  if (input.acquisition_cost_ore < 0) {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Anskaffningsvärde får inte vara negativt',
      field: 'acquisition_cost_ore',
    }
  }
  if (input.residual_value_ore < 0) {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Restvärde får inte vara negativt',
      field: 'residual_value_ore',
    }
  }
  if (input.residual_value_ore > input.acquisition_cost_ore) {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Restvärde kan inte överstiga anskaffningsvärde',
      field: 'residual_value_ore',
    }
  }
  if (input.useful_life_months <= 0) {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Nyttjandeperiod måste vara minst 1 månad',
      field: 'useful_life_months',
    }
  }
  if (
    input.method === 'declining' &&
    (input.declining_rate_bp == null || input.declining_rate_bp <= 0)
  ) {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Degressiv metod kräver avskrivningsränta (basis points > 0)',
      field: 'declining_rate_bp',
    }
  }

  const accountFields: Array<{
    value: string
    field: keyof CreateFixedAssetInput
  }> = [
    { value: input.account_asset, field: 'account_asset' },
    {
      value: input.account_accumulated_depreciation,
      field: 'account_accumulated_depreciation',
    },
    {
      value: input.account_depreciation_expense,
      field: 'account_depreciation_expense',
    },
  ]
  for (const { value, field } of accountFields) {
    const exists = db
      .prepare('SELECT 1 FROM accounts WHERE account_number = ?')
      .get(value)
    if (!exists) {
      return {
        success: false,
        code: 'ACCOUNT_NOT_FOUND',
        error: `Konto ${value} finns inte`,
        field,
      }
    }
  }

  try {
    validateAccountsActive(db, [
      input.account_asset,
      input.account_accumulated_depreciation,
      input.account_depreciation_expense,
    ])
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && 'error' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      return { success: false, code: e.code, error: e.error, field: e.field }
    }
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Kontot kunde inte valideras',
    }
  }

  return null
}

function validateAccountChange(
  db: Database.Database,
  accounts: string[],
): { success: false; code: ErrorCode; error: string; field?: string } | null {
  for (const value of accounts) {
    const exists = db
      .prepare('SELECT 1 FROM accounts WHERE account_number = ?')
      .get(value)
    if (!exists) {
      return {
        success: false,
        code: 'ACCOUNT_NOT_FOUND',
        error: `Konto ${value} finns inte`,
      }
    }
  }
  try {
    validateAccountsActive(db, accounts)
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && 'error' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      return { success: false, code: e.code, error: e.error, field: e.field }
    }
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Kontot kunde inte valideras',
    }
  }
  return null
}

export function createFixedAsset(
  db: Database.Database,
  input: CreateFixedAssetInput,
  companyId?: number,
): IpcResult<{ id: number; scheduleCount: number }> {
  const inputError = validateFixedAssetInput(input, db)
  if (inputError) return inputError

  return db.transaction(() => {
    const now = todayLocalFromNow()
    // Sprint MC1: companyId injiceras av IPC-handlern via getActiveCompanyId.
    // Om utelämnad (test- eller direktanrop): fall tillbaka till första bolaget
    // för bakåtkompatibilitet. Detta speglar getActiveCompanyId-fallback-kedjan.
    let resolvedCompanyId = companyId
    if (!resolvedCompanyId) {
      const first = db
        .prepare('SELECT id FROM companies ORDER BY id LIMIT 1')
        .get() as { id: number } | undefined
      resolvedCompanyId = first?.id
    }
    if (!resolvedCompanyId) {
      return {
        success: false as const,
        code: 'NOT_FOUND' as const,
        error: 'Inget företag hittades',
      }
    }

    const result = db
      .prepare(
        `
      INSERT INTO fixed_assets (
        company_id, name, acquisition_date, acquisition_cost_ore,
        residual_value_ore, useful_life_months, method, declining_rate_bp,
        account_asset, account_accumulated_depreciation, account_depreciation_expense,
        status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `,
      )
      .run(
        resolvedCompanyId,
        input.name,
        input.acquisition_date,
        input.acquisition_cost_ore,
        input.residual_value_ore,
        input.useful_life_months,
        input.method,
        input.declining_rate_bp ?? null,
        input.account_asset,
        input.account_accumulated_depreciation,
        input.account_depreciation_expense,
        now,
        now,
      )

    const assetId = Number(result.lastInsertRowid)
    const scheduleCount = insertSchedule(db, assetId, input)
    return { success: true as const, data: { id: assetId, scheduleCount } }
  })()
}

export function updateFixedAsset(
  db: Database.Database,
  id: number,
  input: UpdateFixedAssetInput,
): IpcResult<{ scheduleCount: number }> {
  const inputError = validateFixedAssetInput(input, db)
  if (inputError) {
    // validateFixedAssetInput also runs account existence + active checks;
    // for edit-mode we want to allow unchanged-but-inactive accounts. So
    // re-run with finer guards inside the transaction below.
    // Only propagate value-check failures (non-account) immediately.
    if (
      inputError.code !== 'ACCOUNT_NOT_FOUND' &&
      inputError.code !== 'INACTIVE_ACCOUNT'
    ) {
      return inputError
    }
  }

  return db.transaction(() => {
    const asset = db
      .prepare('SELECT * FROM fixed_assets WHERE id = ?')
      .get(id) as FixedAsset | undefined
    if (!asset) {
      return {
        success: false as const,
        code: 'NOT_FOUND' as const,
        error: 'Anläggningstillgång hittades inte',
      }
    }

    if (asset.status !== 'active') {
      return {
        success: false as const,
        code: 'VALIDATION_ERROR' as const,
        error: 'Endast aktiva tillgångar kan redigeras',
      }
    }

    const executed = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN status IN ('executed','skipped') THEN 1 ELSE 0 END), 0) AS n,
           COALESCE(SUM(CASE WHEN status = 'executed' THEN amount_ore ELSE 0 END), 0) AS acc_ore
         FROM depreciation_schedules
         WHERE fixed_asset_id = ?`,
      )
      .get(id) as { n: number; acc_ore: number }

    // M155 Alt A: edit efter exekvering påverkar bara pending-schedules.
    // Reviderad bedömning (K2-praxis) — historisk data rörs inte.
    if (executed.n > 0) {
      if (input.useful_life_months <= executed.n) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: `Ny nyttjandetid (${input.useful_life_months} mån) måste överstiga redan bokförda/överhoppade perioder (${executed.n}).`,
          field: 'useful_life_months',
        }
      }
      const bookValueAfterExecuted =
        input.acquisition_cost_ore - executed.acc_ore
      if (bookValueAfterExecuted < input.residual_value_ore) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error:
            'Nytt restvärde överstiger återstående bokfört värde efter exekverade avskrivningar.',
          field: 'residual_value_ore',
        }
      }
    }

    const changedAccounts: string[] = []
    if (input.account_asset !== asset.account_asset)
      changedAccounts.push(input.account_asset)
    if (
      input.account_accumulated_depreciation !==
      asset.account_accumulated_depreciation
    )
      changedAccounts.push(input.account_accumulated_depreciation)
    if (
      input.account_depreciation_expense !== asset.account_depreciation_expense
    )
      changedAccounts.push(input.account_depreciation_expense)

    if (changedAccounts.length > 0) {
      const accountError = validateAccountChange(db, changedAccounts)
      if (accountError) return accountError
    }

    // Radera enbart pending — bevara executed/skipped (M155).
    db.prepare(
      `DELETE FROM depreciation_schedules
       WHERE fixed_asset_id = ? AND status = 'pending'`,
    ).run(id)

    db.prepare(
      `
      UPDATE fixed_assets SET
        name = ?, acquisition_date = ?, acquisition_cost_ore = ?,
        residual_value_ore = ?, useful_life_months = ?, method = ?,
        declining_rate_bp = ?, account_asset = ?,
        account_accumulated_depreciation = ?, account_depreciation_expense = ?,
        updated_at = ?
      WHERE id = ?
    `,
    ).run(
      input.name,
      input.acquisition_date,
      input.acquisition_cost_ore,
      input.residual_value_ore,
      input.useful_life_months,
      input.method,
      input.declining_rate_bp ?? null,
      input.account_asset,
      input.account_accumulated_depreciation,
      input.account_depreciation_expense,
      todayLocalFromNow(),
      id,
    )

    const scheduleCount =
      executed.n > 0
        ? insertPendingFromState(db, id, input, executed.n, executed.acc_ore) +
          executed.n
        : insertSchedule(db, id, input)
    return { success: true as const, data: { scheduleCount } }
  })()
}

/** Internal: genererar schedule-rader och INSERTar dem. Returnerar antal. */
function insertSchedule(
  db: Database.Database,
  assetId: number,
  input: Pick<
    CreateFixedAssetInput,
    | 'acquisition_date'
    | 'acquisition_cost_ore'
    | 'residual_value_ore'
    | 'useful_life_months'
    | 'method'
    | 'declining_rate_bp'
  >,
): number {
  const amounts =
    input.method === 'linear'
      ? generateLinearSchedule(
          input.acquisition_cost_ore,
          input.residual_value_ore,
          input.useful_life_months,
        )
      : generateDecliningSchedule(
          input.acquisition_cost_ore,
          input.residual_value_ore,
          input.useful_life_months,
          input.declining_rate_bp!,
        )

  const periods = computePeriods(
    input.acquisition_date,
    input.useful_life_months,
  )
  const insert = db.prepare(`
    INSERT INTO depreciation_schedules (
      fixed_asset_id, period_number, period_start, period_end, amount_ore, status
    ) VALUES (?, ?, ?, ?, ?, 'pending')
  `)
  for (let i = 0; i < amounts.length; i++) {
    insert.run(assetId, i + 1, periods[i].start, periods[i].end, amounts[i])
  }
  return amounts.length
}

/**
 * M155 Alt A: Regenerera enbart pending-perioder efter edit på tillgång
 * med executed/skipped-historik. Reviderad bedömning — kvarvarande
 * avskrivningsunderlag fördelas över återstående pending-månader.
 *
 * executedCount = antal perioder som är 'executed' eller 'skipped' (låsta).
 * executedAccOre = summa bokförda amounts (skipped bidrar inte).
 */
function insertPendingFromState(
  db: Database.Database,
  assetId: number,
  input: Pick<
    CreateFixedAssetInput,
    | 'acquisition_date'
    | 'acquisition_cost_ore'
    | 'residual_value_ore'
    | 'useful_life_months'
    | 'method'
    | 'declining_rate_bp'
  >,
  executedCount: number,
  executedAccOre: number,
): number {
  const remainingMonths = input.useful_life_months - executedCount
  const bookValueAfterExecuted = input.acquisition_cost_ore - executedAccOre

  const amounts =
    input.method === 'linear'
      ? generateLinearSchedule(
          bookValueAfterExecuted,
          input.residual_value_ore,
          remainingMonths,
        )
      : generateDecliningSchedule(
          bookValueAfterExecuted,
          input.residual_value_ore,
          remainingMonths,
          input.declining_rate_bp!,
        )

  const periods = computePeriods(
    input.acquisition_date,
    input.useful_life_months,
  )
  const insert = db.prepare(`
    INSERT INTO depreciation_schedules (
      fixed_asset_id, period_number, period_start, period_end, amount_ore, status
    ) VALUES (?, ?, ?, ?, ?, 'pending')
  `)
  for (let i = 0; i < amounts.length; i++) {
    const periodNumber = executedCount + i + 1
    insert.run(
      assetId,
      periodNumber,
      periods[periodNumber - 1].start,
      periods[periodNumber - 1].end,
      amounts[i],
    )
  }
  return amounts.length
}

export function listFixedAssets(
  db: Database.Database,
  fiscalYearId?: number,
): IpcResult<FixedAssetWithAccumulation[]> {
  const fyBounds = fiscalYearId
    ? (db
        .prepare('SELECT start_date, end_date FROM fiscal_years WHERE id = ?')
        .get(fiscalYearId) as
        | { start_date: string; end_date: string }
        | undefined)
    : undefined

  const rows = db
    .prepare(`SELECT * FROM fixed_assets ORDER BY acquisition_date, id`)
    .all() as FixedAsset[]

  const accumulate = db.prepare(`
    SELECT
      fixed_asset_id,
      COALESCE(SUM(CASE WHEN status = 'executed' ${fyBounds ? 'AND period_end <= ?' : ''} THEN amount_ore ELSE 0 END), 0) AS acc_ore,
      SUM(CASE WHEN status = 'executed' THEN 1 ELSE 0 END) AS exec_count,
      COUNT(*) AS total_count
    FROM depreciation_schedules
    WHERE fixed_asset_id = ?
    GROUP BY fixed_asset_id
  `)

  const result: FixedAssetWithAccumulation[] = rows.map((asset) => {
    const stats = fyBounds
      ? (accumulate.get(fyBounds.end_date, asset.id) as
          | { acc_ore: number; exec_count: number; total_count: number }
          | undefined)
      : (accumulate.get(asset.id) as
          | { acc_ore: number; exec_count: number; total_count: number }
          | undefined)
    const accOre = stats?.acc_ore ?? 0
    return {
      ...asset,
      accumulated_depreciation_ore: accOre,
      book_value_ore: asset.acquisition_cost_ore - accOre,
      schedules_generated: stats?.total_count ?? 0,
      schedules_executed: stats?.exec_count ?? 0,
    }
  })

  return { success: true, data: result }
}

export function getFixedAsset(
  db: Database.Database,
  id: number,
): IpcResult<FixedAssetWithSchedule> {
  const asset = db
    .prepare(`SELECT * FROM fixed_assets WHERE id = ?`)
    .get(id) as FixedAsset | undefined
  if (!asset) {
    return {
      success: false,
      code: 'NOT_FOUND',
      error: 'Anläggningstillgång hittades inte',
    }
  }
  const schedule = db
    .prepare(
      `SELECT * FROM depreciation_schedules WHERE fixed_asset_id = ? ORDER BY period_number`,
    )
    .all(id) as DepreciationSchedule[]

  const accOre = schedule
    .filter((s) => s.status === 'executed')
    .reduce((sum, s) => sum + s.amount_ore, 0)
  const execCount = schedule.filter((s) => s.status === 'executed').length

  return {
    success: true,
    data: {
      ...asset,
      schedule,
      accumulated_depreciation_ore: accOre,
      book_value_ore: asset.acquisition_cost_ore - accOre,
      schedules_generated: schedule.length,
      schedules_executed: execCount,
    },
  }
}

/**
 * Avyttringskonto — BAS 7970 (förlust) / 3970 (vinst).
 * Sale-price ≥ book_value → vinst (skillnad) krediteras 3970.
 * Sale-price < book_value → förlust (skillnad) debiteras 7970.
 * Sale-price = 0 (S54-basic): full book_value → 7970 (samma som förlust-varianten).
 */
const DISPOSAL_LOSS_ACCOUNT = '7970'
const DISPOSAL_GAIN_ACCOUNT = '3970'

export function disposeFixedAsset(
  db: Database.Database,
  id: number,
  disposedDate: string,
  generateJournalEntry = false,
  salePriceOre = 0,
  proceedsAccount: string | null = null,
): IpcResult<void> {
  return db.transaction(() => {
    const asset = db
      .prepare('SELECT * FROM fixed_assets WHERE id = ?')
      .get(id) as FixedAsset | undefined
    if (!asset)
      return {
        success: false as const,
        code: 'NOT_FOUND' as const,
        error: 'Anläggningstillgång hittades inte',
      }
    if (asset.status === 'disposed') {
      return {
        success: false as const,
        code: 'VALIDATION_ERROR' as const,
        error: 'Tillgången är redan avyttrad',
      }
    }

    let disposalJournalEntryId: number | null = null

    if (generateJournalEntry) {
      const fy = db
        .prepare(
          `
        SELECT id, company_id FROM fiscal_years
        WHERE company_id = ?
          AND date(?) BETWEEN date(start_date) AND date(end_date)
          AND is_closed = 0
        LIMIT 1
      `,
        )
        .get(asset.company_id, disposedDate) as
        | { id: number; company_id: number }
        | undefined
      if (!fy) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: 'Avyttringsdatum ligger utanför ett öppet räkenskapsår',
        }
      }

      const accRow = db
        .prepare(
          `
        SELECT COALESCE(SUM(amount_ore), 0) AS total FROM depreciation_schedules
        WHERE fixed_asset_id = ? AND status = 'executed'
      `,
        )
        .get(id) as { total: number }
      const accumulated = accRow.total
      const bookValue = asset.acquisition_cost_ore - accumulated

      if (bookValue < 0) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error:
            'Ack. avskrivning överstiger anskaffningsvärdet — disposal-verifikat kan inte genereras automatiskt',
        }
      }
      if (salePriceOre < 0) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: 'Försäljningspris kan inte vara negativt',
          field: 'sale_price_ore',
        }
      }
      if (salePriceOre > 0 && !proceedsAccount) {
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error:
            'Intäktskonto (t.ex. bankkonto 1930) krävs vid försäljningspris > 0',
          field: 'proceeds_account',
        }
      }

      // Beräkna vinst/förlust
      // sale_price == 0 → följer S54-baseline: full förlust av book_value via 7970.
      // sale_price > 0 → gain_or_loss = sale_price - book_value
      //   > 0 → vinst → K 3970
      //   < 0 → förlust → D 7970
      //   = 0 → ingen 3970/7970-rad
      const gainOrLoss =
        salePriceOre > 0 ? salePriceOre - bookValue : -bookValue
      const isGain = gainOrLoss > 0
      const isLoss = gainOrLoss < 0
      const diffAmount = Math.abs(gainOrLoss)

      // Konton att verifiera
      const accountsToCheck = [asset.account_asset]
      if (accumulated > 0)
        accountsToCheck.push(asset.account_accumulated_depreciation)
      if (salePriceOre > 0 && proceedsAccount)
        accountsToCheck.push(proceedsAccount)
      if (isLoss || (salePriceOre === 0 && bookValue > 0))
        accountsToCheck.push(DISPOSAL_LOSS_ACCOUNT)
      if (isGain) accountsToCheck.push(DISPOSAL_GAIN_ACCOUNT)

      const placeholders = accountsToCheck.map(() => '?').join(',')
      const existing = db
        .prepare(
          `SELECT account_number FROM accounts WHERE account_number IN (${placeholders})`,
        )
        .all(...accountsToCheck) as { account_number: string }[]
      if (existing.length !== accountsToCheck.length) {
        const found = new Set(existing.map((e) => e.account_number))
        const missing = accountsToCheck.filter((a) => !found.has(a))
        return {
          success: false as const,
          code: 'VALIDATION_ERROR' as const,
          error: `Konto ${missing.join(', ')} saknas i kontoplanen`,
        }
      }
      validateAccountsActive(db, accountsToCheck)

      checkChronology(db, fy.id, 'E', disposedDate)

      const nextVer = db
        .prepare(
          `
        SELECT COALESCE(MAX(verification_number), 0) + 1 AS next_ver
        FROM journal_entries
        WHERE fiscal_year_id = ? AND verification_series = 'E'
      `,
        )
        .get(fy.id) as { next_ver: number }

      const description = `Avyttring: ${asset.name}`
      const jeResult = db
        .prepare(
          `
        INSERT INTO journal_entries (
          company_id, fiscal_year_id, verification_number, verification_series,
          journal_date, description, status, source_type
        ) VALUES (?, ?, ?, 'E', ?, ?, 'draft', 'auto_depreciation')
      `,
        )
        .run(fy.company_id, fy.id, nextVer.next_ver, disposedDate, description)

      disposalJournalEntryId = Number(jeResult.lastInsertRowid)

      const insertLine = db.prepare(`
        INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_number,
          debit_ore, credit_ore, description
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      let lineNum = 1
      // D ack_dep
      if (accumulated > 0) {
        insertLine.run(
          disposalJournalEntryId,
          lineNum++,
          asset.account_accumulated_depreciation,
          accumulated,
          0,
          description,
        )
      }
      // K asset (anskaffningsvärdet bort)
      insertLine.run(
        disposalJournalEntryId,
        lineNum++,
        asset.account_asset,
        0,
        asset.acquisition_cost_ore,
        description,
      )
      // D proceeds (om försäljningspris > 0)
      if (salePriceOre > 0 && proceedsAccount) {
        insertLine.run(
          disposalJournalEntryId,
          lineNum++,
          proceedsAccount,
          salePriceOre,
          0,
          description,
        )
      }
      // K 3970 (vinst) eller D 7970 (förlust)
      if (isGain) {
        insertLine.run(
          disposalJournalEntryId,
          lineNum++,
          DISPOSAL_GAIN_ACCOUNT,
          0,
          diffAmount,
          description,
        )
      } else if (isLoss) {
        insertLine.run(
          disposalJournalEntryId,
          lineNum++,
          DISPOSAL_LOSS_ACCOUNT,
          diffAmount,
          0,
          description,
        )
      } else if (salePriceOre === 0 && bookValue > 0) {
        // Baseline S54: sale_price=0, book_value>0 → full förlust
        insertLine.run(
          disposalJournalEntryId,
          lineNum++,
          DISPOSAL_LOSS_ACCOUNT,
          bookValue,
          0,
          description,
        )
      }

      db.prepare(
        `UPDATE journal_entries SET status = 'booked' WHERE id = ?`,
      ).run(disposalJournalEntryId)
    }

    db.prepare(
      `UPDATE fixed_assets SET status = 'disposed', disposed_date = ?, disposed_journal_entry_id = ?, updated_at = ? WHERE id = ?`,
    ).run(disposedDate, disposalJournalEntryId, todayLocalFromNow(), id)

    db.prepare(
      `UPDATE depreciation_schedules SET status = 'skipped' WHERE fixed_asset_id = ? AND status = 'pending'`,
    ).run(id)

    safeRebuildSearchIndex(db)

    return { success: true as const, data: undefined }
  })()
}

export function deleteFixedAsset(
  db: Database.Database,
  id: number,
): IpcResult<void> {
  const asset = db
    .prepare('SELECT * FROM fixed_assets WHERE id = ?')
    .get(id) as FixedAsset | undefined
  if (!asset)
    return {
      success: false,
      code: 'NOT_FOUND',
      error: 'Anläggningstillgång hittades inte',
    }
  if (asset.status !== 'active') {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Endast aktiva tillgångar kan raderas',
    }
  }
  const executed = db
    .prepare(
      `SELECT COUNT(*) AS c FROM depreciation_schedules WHERE fixed_asset_id = ? AND status = 'executed'`,
    )
    .get(id) as { c: number }
  if (executed.c > 0) {
    return {
      success: false,
      code: 'VALIDATION_ERROR',
      error: 'Kan inte radera tillgång med exekverade avskrivningar',
    }
  }
  db.prepare('DELETE FROM fixed_assets WHERE id = ?').run(id)
  return { success: true, data: undefined }
}

// ═══ Execute depreciation period (M113 partial-success) ═══

/**
 * Kör alla pending schedules med period_end <= periodEndDate för
 * aktiva tillgångar i FY. Nestade savepoints per schedule — fel i en
 * rullar tillbaka raden men commit övriga (M113).
 */
export function executeDepreciationPeriod(
  db: Database.Database,
  fiscalYearId: number,
  periodEndDate: string,
): IpcResult<ExecuteDepreciationPeriodResult> {
  const succeeded: ExecuteDepreciationPeriodResult['succeeded'] = []
  const failed: ExecuteDepreciationPeriodResult['failed'] = []

  const fy = db
    .prepare(
      'SELECT company_id, start_date, end_date FROM fiscal_years WHERE id = ?',
    )
    .get(fiscalYearId) as
    | { company_id: number; start_date: string; end_date: string }
    | undefined
  if (!fy) {
    return {
      success: false,
      code: 'NOT_FOUND',
      error: 'Räkenskapsår hittades inte',
    }
  }

  const pending = db
    .prepare(
      `
    SELECT ds.id AS schedule_id, ds.fixed_asset_id, ds.period_number, ds.period_end,
           ds.amount_ore, fa.name AS asset_name,
           fa.account_accumulated_depreciation, fa.account_depreciation_expense
    FROM depreciation_schedules ds
    JOIN fixed_assets fa ON fa.id = ds.fixed_asset_id
    WHERE ds.status = 'pending'
      AND fa.status = 'active'
      AND ds.period_end <= ?
      AND ds.period_end BETWEEN ? AND ?
    ORDER BY ds.period_end, ds.id
  `,
    )
    .all(periodEndDate, fy.start_date, fy.end_date) as Array<{
    schedule_id: number
    fixed_asset_id: number
    period_number: number
    period_end: string
    amount_ore: number
    asset_name: string
    account_accumulated_depreciation: string
    account_depreciation_expense: string
  }>

  if (pending.length === 0) {
    return {
      success: true,
      data: { succeeded, failed, batch_status: 'completed' },
    }
  }

  const ROLLBACK_SENTINEL = '__CANCEL_ALL_FAILED__'

  try {
    db.transaction(() => {
      for (const p of pending) {
        try {
          const journalEntryId = db.transaction(() =>
            _executeScheduleTx(db, fiscalYearId, fy.company_id, p),
          )()
          succeeded.push({
            asset_id: p.fixed_asset_id,
            schedule_id: p.schedule_id,
            journal_entry_id: journalEntryId ?? 0,
            amount_ore: p.amount_ore,
          })
        } catch (err: unknown) {
          const e =
            err && typeof err === 'object' && 'code' in err && 'error' in err
              ? (err as { code: ErrorCode; error: string })
              : {
                  code: 'UNEXPECTED_ERROR' as ErrorCode,
                  error: err instanceof Error ? err.message : 'Oväntat fel',
                }
          failed.push({
            asset_id: p.fixed_asset_id,
            schedule_id: p.schedule_id,
            error: e.error,
            code: e.code,
          })
        }
      }

      if (succeeded.length === 0 && failed.length > 0) {
        // Intentional rollback sentinel — caught by outer try-catch to return
        // cancelled status while ensuring the transaction is rolled back.
        throw new Error(ROLLBACK_SENTINEL)
      }

      safeRebuildSearchIndex(db)
    })()
  } catch (err: unknown) {
    if (err instanceof Error && err.message === ROLLBACK_SENTINEL) {
      return {
        success: true,
        data: { succeeded: [], failed, batch_status: 'cancelled' },
      }
    }
    return {
      success: false,
      code: 'UNEXPECTED_ERROR',
      error:
        err instanceof Error
          ? err.message
          : 'Oväntat fel vid avskrivningsexekvering',
    }
  }

  const batch_status: ExecuteDepreciationPeriodResult['batch_status'] =
    failed.length === 0 ? 'completed' : 'partial'
  return { success: true, data: { succeeded, failed, batch_status } }
}

/** Internal: bokför en schedule som E-serie-verifikat. Kastar strukturerat fel. */
function _executeScheduleTx(
  db: Database.Database,
  fiscalYearId: number,
  companyId: number,
  p: {
    schedule_id: number
    fixed_asset_id: number
    period_number: number
    period_end: string
    amount_ore: number
    asset_name: string
    account_accumulated_depreciation: string
    account_depreciation_expense: string
  },
): number | null {
  if (p.amount_ore === 0) {
    // Noll-avskrivning: markera som executed utan verifikat
    db.prepare(
      `UPDATE depreciation_schedules SET status = 'executed' WHERE id = ?`,
    ).run(p.schedule_id)
    checkAndMarkFullyDepreciated(db, p.fixed_asset_id)
    return null
  }

  checkChronology(db, fiscalYearId, 'E', p.period_end)

  const nextVer = db
    .prepare(
      `
    SELECT COALESCE(MAX(verification_number), 0) + 1 AS next_ver
    FROM journal_entries
    WHERE fiscal_year_id = ? AND verification_series = 'E'
  `,
    )
    .get(fiscalYearId) as { next_ver: number }

  const description = `Avskrivning: ${p.asset_name} (period ${p.period_number})`
  const jeResult = db
    .prepare(
      `
    INSERT INTO journal_entries (
      company_id, fiscal_year_id, verification_number, verification_series,
      journal_date, description, status, source_type
    ) VALUES (?, ?, ?, 'E', ?, ?, 'draft', 'auto_depreciation')
  `,
    )
    .run(companyId, fiscalYearId, nextVer.next_ver, p.period_end, description)

  const journalEntryId = Number(jeResult.lastInsertRowid)

  const insertLine = db.prepare(`
    INSERT INTO journal_entry_lines (
      journal_entry_id, line_number, account_number,
      debit_ore, credit_ore, description
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)
  insertLine.run(
    journalEntryId,
    1,
    p.account_depreciation_expense,
    p.amount_ore,
    0,
    description,
  )
  insertLine.run(
    journalEntryId,
    2,
    p.account_accumulated_depreciation,
    0,
    p.amount_ore,
    description,
  )

  db.prepare(`UPDATE journal_entries SET status = 'booked' WHERE id = ?`).run(
    journalEntryId,
  )

  db.prepare(
    `UPDATE depreciation_schedules SET status = 'executed', journal_entry_id = ? WHERE id = ?`,
  ).run(journalEntryId, p.schedule_id)

  checkAndMarkFullyDepreciated(db, p.fixed_asset_id)
  return journalEntryId
}

function checkAndMarkFullyDepreciated(
  db: Database.Database,
  assetId: number,
): void {
  const pending = db
    .prepare(
      `SELECT COUNT(*) AS c FROM depreciation_schedules WHERE fixed_asset_id = ? AND status = 'pending'`,
    )
    .get(assetId) as { c: number }
  if (pending.c === 0) {
    const asset = db
      .prepare('SELECT status FROM fixed_assets WHERE id = ?')
      .get(assetId) as { status: string }
    if (asset.status === 'active') {
      db.prepare(
        `UPDATE fixed_assets SET status = 'fully_depreciated', updated_at = ? WHERE id = ?`,
      ).run(todayLocalFromNow(), assetId)
    }
  }
}
