import type Database from 'better-sqlite3'
import type {
  FiscalYear,
  FiscalPeriod,
  JournalEntry,
  IpcResult,
} from '../../shared/types'
import { addOneDay, addMonthsMinusOneDay } from '../../shared/date-utils'
import { generatePeriods } from './company-service'
import {
  calculateNetResult,
  bookYearEndResult,
  createOpeningBalance,
} from './opening-balance-service'
import log from 'electron-log'

export function listFiscalYears(db: Database.Database): FiscalYear[] {
  return db
    .prepare('SELECT * FROM fiscal_years ORDER BY start_date DESC')
    .all() as FiscalYear[]
}

export function listFiscalPeriods(
  db: Database.Database,
  fiscalYearId: number,
): FiscalPeriod[] {
  return db
    .prepare(
      'SELECT * FROM accounting_periods WHERE fiscal_year_id = ? ORDER BY period_number ASC',
    )
    .all(fiscalYearId) as FiscalPeriod[]
}

export function closePeriod(
  db: Database.Database,
  periodId: number,
): IpcResult<FiscalPeriod> {
  try {
    return db.transaction((): IpcResult<FiscalPeriod> => {
      const period = db
        .prepare('SELECT * FROM accounting_periods WHERE id = ?')
        .get(periodId) as FiscalPeriod | undefined

      if (!period) {
        return {
          success: false,
          error: 'Perioden hittades inte.',
          code: 'NOT_FOUND',
        }
      }

      const fy = db
        .prepare('SELECT * FROM fiscal_years WHERE id = ?')
        .get(period.fiscal_year_id) as FiscalYear

      if (fy.is_closed === 1) {
        return {
          success: false,
          error: 'Räkenskapsåret är stängt. Perioder kan inte ändras.',
          code: 'YEAR_IS_CLOSED',
        }
      }

      const openBefore = db
        .prepare(
          `SELECT COUNT(*) as count FROM accounting_periods
         WHERE fiscal_year_id = ? AND period_number < ? AND is_closed = 0`,
        )
        .get(period.fiscal_year_id, period.period_number) as { count: number }

      if (openBefore.count > 0) {
        return {
          success: false,
          error: 'Du måste stänga tidigare månader först.',
          code: 'PERIOD_NOT_SEQUENTIAL',
        }
      }

      if (period.is_closed === 1) {
        return {
          success: false,
          error: 'Perioden är redan stängd.',
          code: 'VALIDATION_ERROR',
        }
      }

      db.prepare(
        "UPDATE accounting_periods SET is_closed = 1, closed_at = datetime('now','localtime') WHERE id = ?",
      ).run(periodId)

      const updated = db
        .prepare('SELECT * FROM accounting_periods WHERE id = ?')
        .get(periodId) as FiscalPeriod

      return { success: true, data: updated }
    })()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(message)
    return {
      success: false,
      error: 'Ett oväntat fel uppstod vid periodhantering.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function reopenPeriod(
  db: Database.Database,
  periodId: number,
): IpcResult<FiscalPeriod> {
  try {
    return db.transaction((): IpcResult<FiscalPeriod> => {
      const period = db
        .prepare('SELECT * FROM accounting_periods WHERE id = ?')
        .get(periodId) as FiscalPeriod | undefined

      if (!period) {
        return {
          success: false,
          error: 'Perioden hittades inte.',
          code: 'NOT_FOUND',
        }
      }

      const fy = db
        .prepare('SELECT * FROM fiscal_years WHERE id = ?')
        .get(period.fiscal_year_id) as FiscalYear

      if (fy.is_closed === 1) {
        return {
          success: false,
          error: 'Räkenskapsåret är stängt. Perioder kan inte ändras.',
          code: 'YEAR_IS_CLOSED',
        }
      }

      if (period.is_closed === 0) {
        return {
          success: false,
          error: 'Perioden är redan öppen.',
          code: 'VALIDATION_ERROR',
        }
      }

      const closedAfter = db
        .prepare(
          `SELECT COUNT(*) as count FROM accounting_periods
         WHERE fiscal_year_id = ? AND period_number > ? AND is_closed = 1`,
        )
        .get(period.fiscal_year_id, period.period_number) as { count: number }

      if (closedAfter.count > 0) {
        return {
          success: false,
          error: 'Du måste öppna senare månader först.',
          code: 'PERIOD_NOT_SEQUENTIAL',
        }
      }

      db.prepare(
        'UPDATE accounting_periods SET is_closed = 0, closed_at = NULL WHERE id = ?',
      ).run(periodId)

      const updated = db
        .prepare('SELECT * FROM accounting_periods WHERE id = ?')
        .get(periodId) as FiscalPeriod

      return { success: true, data: updated }
    })()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(message)
    return {
      success: false,
      error: 'Ett oväntat fel uppstod vid periodhantering.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function closeFiscalYear(
  db: Database.Database,
  fiscalYearId: number,
): void {
  db.prepare(
    `UPDATE accounting_periods SET is_closed = 1, closed_at = datetime('now','localtime')
     WHERE fiscal_year_id = ? AND is_closed = 0`,
  ).run(fiscalYearId)

  db.prepare(
    `UPDATE fiscal_years SET is_closed = 1, closed_at = datetime('now','localtime')
     WHERE id = ?`,
  ).run(fiscalYearId)
}

/**
 * Skapa nytt räkenskapsår med perioder och IB.
 * Om bookResult anges, bokas årets resultat atomärt i samma transaktion.
 */
export function createNewFiscalYear(
  db: Database.Database,
  companyId: number,
  previousFiscalYearId: number,
  bookResult?: { confirmBookResult: boolean; netResultOre: number },
): { fiscalYear: FiscalYear; openingBalance: JournalEntry } {
  return db.transaction(() => {
    // Book year-end result INSIDE the transaction (K1 fix)
    if (bookResult?.confirmBookResult && bookResult.netResultOre !== 0) {
      // GUARD: Verify result hasn't changed since dialog was opened
      const actualNetResult = calculateNetResult(db, previousFiscalYearId)
      if (actualNetResult !== bookResult.netResultOre) {
        throw new Error(
          'Årets resultat har ändrats sedan dialogen öppnades. Försök igen.',
        )
      }

      // GUARD: Prevent double booking
      const existingBooking = db
        .prepare(
          "SELECT COUNT(*) as cnt FROM journal_entries WHERE verification_series = 'C' AND fiscal_year_id = ? AND description LIKE '%årets resultat%'",
        )
        .get(previousFiscalYearId) as { cnt: number }
      if (existingBooking.cnt > 0) {
        throw new Error('Årets resultat är redan bokat.')
      }

      bookYearEndResult(db, previousFiscalYearId, actualNetResult)
    }

    const prevFY = db
      .prepare('SELECT * FROM fiscal_years WHERE id = ?')
      .get(previousFiscalYearId) as FiscalYear
    if (!prevFY) throw new Error('Föregående räkenskapsår hittades inte.')

    const startDate = addOneDay(prevFY.end_date)
    const endDate = addMonthsMinusOneDay(startDate, 12)

    const existing = db
      .prepare(
        `SELECT id FROM fiscal_years
         WHERE company_id = ? AND start_date = ?`,
      )
      .get(companyId, startDate)
    if (existing) {
      throw new Error('Räkenskapsår för denna period finns redan.')
    }

    const startYear = startDate.substring(0, 4)
    const endYear = endDate.substring(0, 4)
    const yearLabel =
      startYear === endYear ? startYear : `${startYear}/${endYear.slice(-2)}`

    const fyResult = db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
         VALUES (?, ?, ?, ?)`,
      )
      .run(companyId, yearLabel, startDate, endDate)
    const newFyId = Number(fyResult.lastInsertRowid)

    const newFY = db
      .prepare('SELECT * FROM fiscal_years WHERE id = ?')
      .get(newFyId) as FiscalYear

    const periods = generatePeriods(startDate, endDate)
    const insertPeriod = db.prepare(
      `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
       VALUES (?, ?, ?, ?, ?)`,
    )
    for (const p of periods) {
      insertPeriod.run(
        companyId,
        newFyId,
        p.period_number,
        p.start_date,
        p.end_date,
      )
    }

    const ib = createOpeningBalance(db, newFyId, previousFiscalYearId)

    // F2-fix: Stäng föregående FY atomärt som sista steg i transaktionen.
    // Inline-SQL istället för closeFiscalYear()-anrop — better-sqlite3 tolererar
    // inte nested transactions, och closeFiscalYear() är tänkt att anropas
    // standalone från andra kontexter (t.ex. manuell stängning från UI).
    db.prepare(
      `UPDATE accounting_periods SET is_closed = 1, closed_at = datetime('now','localtime')
       WHERE fiscal_year_id = ? AND is_closed = 0`,
    ).run(previousFiscalYearId)

    db.prepare(
      `UPDATE fiscal_years SET is_closed = 1, closed_at = datetime('now','localtime')
       WHERE id = ?`,
    ).run(previousFiscalYearId)

    return { fiscalYear: newFY, openingBalance: ib }
  })()
}
