import type Database from 'better-sqlite3'
import type { JournalEntry } from '../../shared/types'
import { getBalanceSheetAccountBalances } from './result-service'

// Re-export for backwards compatibility (imported by tests and fiscal-service)
export { calculateNetResult } from './result-service'

/**
 * Boka årsresultat via 8999/2099 (C-serie verifikation).
 */
export function bookYearEndResult(
  db: Database.Database,
  fiscalYearId: number,
  netResultOre: number,
): JournalEntry | null {
  if (netResultOre === 0) return null

  const fy = db
    .prepare('SELECT * FROM fiscal_years WHERE id = ?')
    .get(fiscalYearId) as { end_date: string; company_id: number }

  // C-serie numrering
  const nextVer = db
    .prepare(
      `SELECT COALESCE(MAX(verification_number), 0) + 1 as next_ver
       FROM journal_entries
       WHERE fiscal_year_id = ? AND verification_series = 'C'`,
    )
    .get(fiscalYearId) as { next_ver: number }

  // Insert as draft first (triggers validate balance on booking)
  const entryResult = db
    .prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (
        ?, ?, ?, 'C', ?, 'Bokföring av årets resultat', 'draft', 'manual'
      )`,
    )
    .run(fy.company_id, fiscalYearId, nextVer.next_ver, fy.end_date)
  const journalEntryId = Number(entryResult.lastInsertRowid)

  const insertLine = db.prepare(
    `INSERT INTO journal_entry_lines (
      journal_entry_id, line_number, account_number,
      debit_ore, credit_ore, description
    ) VALUES (?, ?, ?, ?, ?, 'Bokföring av årets resultat')`,
  )

  if (netResultOre > 0) {
    // Vinst: debet 8999, kredit 2099
    insertLine.run(journalEntryId, 1, '8999', netResultOre, 0)
    insertLine.run(journalEntryId, 2, '2099', 0, netResultOre)
  } else {
    // Förlust: debet 2099, kredit 8999
    const absAmount = Math.abs(netResultOre)
    insertLine.run(journalEntryId, 1, '2099', absAmount, 0)
    insertLine.run(journalEntryId, 2, '8999', 0, absAmount)
  }

  // Book
  db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(
    journalEntryId,
  )

  return db
    .prepare('SELECT * FROM journal_entries WHERE id = ?')
    .get(journalEntryId) as JournalEntry
}

/**
 * Skapa IB-verifikation i det nya räkenskapsåret.
 * Hämtar alla BS-konton (1000-2999) från föregående FY.
 */
export function createOpeningBalance(
  db: Database.Database,
  newFiscalYearId: number,
  previousFiscalYearId: number,
): JournalEntry {
  const newFy = db
    .prepare('SELECT * FROM fiscal_years WHERE id = ?')
    .get(newFiscalYearId) as {
    start_date: string
    company_id: number
  }

  // Hämta saldon för BS-konton (klass 1-2) via numerisk jämförelse (M98)
  const balances = getBalanceSheetAccountBalances(db, previousFiscalYearId)
    .filter((b) => b.balance !== 0)

  // Skapa journal_entry (O-serie)
  const entryResult = db
    .prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (
        ?, ?, 1, 'O', ?, 'Ingående balans', 'draft', 'opening_balance'
      )`,
    )
    .run(newFy.company_id, newFiscalYearId, newFy.start_date)
  const journalEntryId = Number(entryResult.lastInsertRowid)

  // Skapa journal_entry_lines
  if (balances.length > 0) {
    const insertLine = db.prepare(
      `INSERT INTO journal_entry_lines (
        journal_entry_id, line_number, account_number,
        debit_ore, credit_ore, description
      ) VALUES (?, ?, ?, ?, ?, 'Ingående balans')`,
    )

    let lineNum = 1
    for (const b of balances) {
      // B13: Omför 2099 (Årets resultat) till 2091 (Balanserad vinst/förlust)
      const accountNumber =
        b.account_number === '2099' ? '2091' : b.account_number
      if (b.balance > 0) {
        insertLine.run(journalEntryId, lineNum++, accountNumber, b.balance, 0)
      } else {
        insertLine.run(
          journalEntryId,
          lineNum++,
          accountNumber,
          0,
          Math.abs(b.balance),
        )
      }
    }

    // Validera balans
    const check = db
      .prepare(
        `SELECT SUM(debit_ore) as d, SUM(credit_ore) as c
         FROM journal_entry_lines WHERE journal_entry_id = ?`,
      )
      .get(journalEntryId) as { d: number; c: number }
    if (check.d !== check.c) {
      throw {
        code: 'UNBALANCED_ENTRY' as const,
        error: `IB balanserar inte: debet ${check.d} ≠ kredit ${check.c}`,
      }
    }

    // Book
    db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(
      journalEntryId,
    )
  } else {
    // Tom IB — inga saldon, radera den tomma JE:n
    db.prepare('DELETE FROM journal_entries WHERE id = ?').run(journalEntryId)
    // Skapa en minimal IB med 0 rader (just the entry marker)
    const minResult = db
      .prepare(
        `INSERT INTO journal_entries (
          company_id, fiscal_year_id, verification_number, verification_series,
          journal_date, description, status, source_type
        ) VALUES (
          ?, ?, 1, 'O', ?, 'Ingående balans (tom)', 'booked', 'opening_balance'
        )`,
      )
      .run(newFy.company_id, newFiscalYearId, newFy.start_date)
    return db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(Number(minResult.lastInsertRowid)) as JournalEntry
  }

  return db
    .prepare('SELECT * FROM journal_entries WHERE id = ?')
    .get(journalEntryId) as JournalEntry
}

/**
 * Re-transfer: radera befintlig IB + skapa ny.
 */
export function reTransferOpeningBalance(
  db: Database.Database,
  fiscalYearId: number,
): JournalEntry {
  // Hitta befintlig IB
  const oldIb = db
    .prepare(
      `SELECT * FROM journal_entries
       WHERE fiscal_year_id = ? AND source_type = 'opening_balance'`,
    )
    .get(fiscalYearId) as JournalEntry | undefined

  // Hitta föregående FY
  const prevFy = db
    .prepare(
      `SELECT * FROM fiscal_years
       WHERE end_date < (SELECT start_date FROM fiscal_years WHERE id = ?)
       ORDER BY end_date DESC LIMIT 1`,
    )
    .get(fiscalYearId) as { id: number } | undefined

  if (!prevFy) {
    throw { code: 'NOT_FOUND' as const, error: 'Inget föregående räkenskapsår hittades.' }
  }

  return db.transaction(() => {
    // Radera befintlig IB om den finns
    if (oldIb) {
      db.prepare(
        'DELETE FROM journal_entry_lines WHERE journal_entry_id = ?',
      ).run(oldIb.id)
      db.prepare('DELETE FROM journal_entries WHERE id = ?').run(oldIb.id)
    }

    return createOpeningBalance(db, fiscalYearId, prevFy.id)
  })()
}
