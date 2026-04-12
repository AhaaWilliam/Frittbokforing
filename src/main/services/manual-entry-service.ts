import type Database from 'better-sqlite3'
import { validateAccountsActive } from './account-service'
import type {
  ManualEntry,
  ManualEntryWithLines,
  ManualEntryListItem,
  IpcResult,
  ErrorCode,
} from '../../shared/types'
import log from 'electron-log'

interface LineInput {
  account_number: string
  debit_ore: number
  credit_ore: number
  description?: string
}

function filterEmptyLines(lines: LineInput[]): LineInput[] {
  return lines.filter(
    (line) =>
      line.account_number.trim() !== '' ||
      line.debit_ore > 0 ||
      line.credit_ore > 0,
  )
}

export function saveManualEntryDraft(
  db: Database.Database,
  input: {
    fiscal_year_id: number
    entry_date?: string
    description?: string
    lines: LineInput[]
  },
): IpcResult<{ id: number }> {
  try {
    const filtered = filterEmptyLines(input.lines)
    if (filtered.length === 0)
      return {
        success: false,
        error: 'Minst en rad med belopp krävs.',
        code: 'VALIDATION_ERROR' as const,
      }

    const id = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO manual_entries (fiscal_year_id, entry_date, description)
         VALUES (?, ?, ?)`,
        )
        .run(
          input.fiscal_year_id,
          input.entry_date || null,
          input.description || null,
        )
      const entryId = Number(result.lastInsertRowid)

      const insertLine = db.prepare(
        `INSERT INTO manual_entry_lines (manual_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      )
      filtered.forEach((line, idx) => {
        insertLine.run(
          entryId,
          idx + 1,
          line.account_number,
          line.debit_ore,
          line.credit_ore,
          line.description || null,
        )
      })

      return entryId
    })()

    return { success: true, data: { id } }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(message)
    return {
      success: false,
      error: message,
      code: 'TRANSACTION_ERROR' as const,
    }
  }
}

export function getManualEntry(
  db: Database.Database,
  id: number,
): IpcResult<ManualEntryWithLines> {
  const entry = db
    .prepare('SELECT * FROM manual_entries WHERE id = ?')
    .get(id) as ManualEntry | undefined
  if (!entry)
    return {
      success: false,
      error: 'Bokföringsorder hittades inte.',
      code: 'MANUAL_ENTRY_NOT_FOUND' as const,
    }

  const lines = db
    .prepare(
      'SELECT * FROM manual_entry_lines WHERE manual_entry_id = ? ORDER BY line_number',
    )
    .all(id) as ManualEntryWithLines['lines']

  return { success: true, data: { ...entry, lines } }
}

export function updateManualEntryDraft(
  db: Database.Database,
  input: {
    id: number
    entry_date?: string
    description?: string
    lines: LineInput[]
  },
): IpcResult<void> {
  try {
    db.transaction(() => {
      const entry = db
        .prepare('SELECT status FROM manual_entries WHERE id = ?')
        .get(input.id) as { status: string } | undefined
      if (!entry) throw new Error('Bokföringsorder hittades inte.')
      if (entry.status !== 'draft')
        throw new Error('Kan inte ändra bokförd verifikation.')

      const filtered = filterEmptyLines(input.lines)

      db.prepare(
        `UPDATE manual_entries SET entry_date = ?, description = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
      ).run(input.entry_date || null, input.description || null, input.id)

      db.prepare(
        'DELETE FROM manual_entry_lines WHERE manual_entry_id = ?',
      ).run(input.id)

      const insertLine = db.prepare(
        `INSERT INTO manual_entry_lines (manual_entry_id, line_number, account_number, debit_ore, credit_ore, description)
       VALUES (?, ?, ?, ?, ?, ?)`,
      )
      filtered.forEach((line, idx) => {
        insertLine.run(
          input.id,
          idx + 1,
          line.account_number,
          line.debit_ore,
          line.credit_ore,
          line.description || null,
        )
      })
    })()

    return { success: true, data: undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(message)
    return {
      success: false,
      error: message,
      code: 'TRANSACTION_ERROR' as const,
    }
  }
}

export function deleteManualEntryDraft(
  db: Database.Database,
  id: number,
): IpcResult<void> {
  const entry = db
    .prepare('SELECT status FROM manual_entries WHERE id = ?')
    .get(id) as { status: string } | undefined
  if (!entry)
    return {
      success: false,
      error: 'Hittades inte.',
      code: 'MANUAL_ENTRY_NOT_FOUND' as const,
    }
  if (entry.status !== 'draft')
    return {
      success: false,
      error: 'Kan inte radera bokförd verifikation.',
      code: 'ALREADY_FINALIZED' as const,
    }

  db.prepare('DELETE FROM manual_entries WHERE id = ?').run(id)
  return { success: true, data: undefined }
}

export function listManualEntryDrafts(
  db: Database.Database,
  fiscalYearId: number,
): ManualEntry[] {
  return db
    .prepare(
      "SELECT * FROM manual_entries WHERE fiscal_year_id = ? AND status = 'draft' ORDER BY created_at DESC",
    )
    .all(fiscalYearId) as ManualEntry[]
}

export function listManualEntries(
  db: Database.Database,
  fiscalYearId: number,
): ManualEntryListItem[] {
  return db
    .prepare(
      `SELECT
      me.id,
      me.entry_date,
      me.description,
      je.verification_number,
      je.verification_series,
      COALESCE((SELECT SUM(jel.debit_ore) FROM journal_entry_lines jel WHERE jel.journal_entry_id = je.id), 0) as total_amount
    FROM manual_entries me
    JOIN journal_entries je ON me.journal_entry_id = je.id
    WHERE me.fiscal_year_id = ? AND me.status = 'finalized'
    ORDER BY je.verification_number DESC`,
    )
    .all(fiscalYearId) as ManualEntryListItem[]
}

export function finalizeManualEntry(
  db: Database.Database,
  id: number,
  fiscalYearId: number,
): IpcResult<{ journalEntryId: number; verificationNumber: number }> {
  try {
    const result = db.transaction(() => {
      // 1. Get manual entry + lines
      const entry = db
        .prepare('SELECT * FROM manual_entries WHERE id = ?')
        .get(id) as ManualEntry | undefined
      if (!entry) throw new Error('Bokföringsorder hittades inte.')
      if (entry.status !== 'draft') throw new Error('Redan bokförd.')

      const rawLines = db
        .prepare(
          'SELECT * FROM manual_entry_lines WHERE manual_entry_id = ? ORDER BY line_number',
        )
        .all(id) as LineInput[]

      // 2. Filter empty lines
      const lines = filterEmptyLines(rawLines)

      // 3. Validate: at least 2 lines with amounts
      const linesWithAmount = lines.filter(
        (l) => l.debit_ore > 0 || l.credit_ore > 0,
      )
      if (linesWithAmount.length < 2)
        throw new Error('Minst 2 rader med belopp krävs.')

      // 4. Validate balance
      const sumDebit = lines.reduce((s, l) => s + l.debit_ore, 0)
      const sumCredit = lines.reduce((s, l) => s + l.credit_ore, 0)
      if (sumDebit !== sumCredit)
        throw new Error(
          `Obalanserad verifikation: debet ${sumDebit} ≠ kredit ${sumCredit}`,
        )

      // 5. Validate date
      if (!entry.entry_date || entry.entry_date.trim() === '')
        throw new Error('Datum saknas.')

      // 6. Validate date within fiscal year
      const fy = db
        .prepare('SELECT * FROM fiscal_years WHERE id = ?')
        .get(fiscalYearId) as {
        start_date: string
        end_date: string
        is_closed?: number
      }
      if (fy.is_closed === 1)
        throw new Error(
          'Räkenskapsåret är stängt. Nya verifikationer kan inte bokföras.',
        )
      if (entry.entry_date < fy.start_date || entry.entry_date > fy.end_date)
        throw new Error('Datum utanför räkenskapsåret.')

      // 7. Validate period open
      const period = db
        .prepare(
          'SELECT is_closed FROM accounting_periods WHERE fiscal_year_id = ? AND ? BETWEEN start_date AND end_date',
        )
        .get(fiscalYearId, entry.entry_date) as
        | { is_closed: number }
        | undefined
      if (period && period.is_closed) throw new Error('Perioden är stängd.')

      // 8. Validate accounts exist
      for (const line of lines) {
        const acct = db
          .prepare(
            'SELECT account_number FROM accounts WHERE account_number = ?',
          )
          .get(line.account_number)
        if (!acct) throw new Error(`Ogiltigt konto: ${line.account_number}`)
      }

      // 8b. Validate all referenced accounts are active
      validateAccountsActive(
        db,
        lines.map((l) => l.account_number),
      )

      // 9. Allocate C-series number
      const nextVer = db
        .prepare(
          "SELECT COALESCE(MAX(verification_number), 0) + 1 as next_ver FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'C'",
        )
        .get(fiscalYearId) as { next_ver: number }
      const verificationNumber = nextVer.next_ver

      // 10. INSERT journal_entry (draft first, then book)
      const jeResult = db
        .prepare(
          `INSERT INTO journal_entries (
          company_id, fiscal_year_id, verification_number, verification_series,
          journal_date, description, status, source_type
        ) VALUES (
          (SELECT id FROM companies LIMIT 1), ?, ?, 'C',
          ?, ?, 'draft', 'manual'
        )`,
        )
        .run(
          fiscalYearId,
          verificationNumber,
          entry.entry_date,
          entry.description || 'Manuell verifikation',
        )
      const journalEntryId = Number(jeResult.lastInsertRowid)

      // 11. INSERT journal_entry_lines
      const insertJel = db.prepare(
        `INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_number,
          debit_ore, credit_ore, description
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      lines.forEach((line, idx) => {
        insertJel.run(
          journalEntryId,
          idx + 1,
          line.account_number,
          line.debit_ore,
          line.credit_ore,
          line.description || null,
        )
      })

      // 12. Book the journal entry (triggers validate balance + period)
      db.prepare(
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
      ).run(journalEntryId)

      // 13. Update manual_entries
      db.prepare(
        `UPDATE manual_entries SET status = 'finalized', journal_entry_id = ?, updated_at = datetime('now','localtime')
       WHERE id = ?`,
      ).run(journalEntryId, id)

      return { journalEntryId, verificationNumber }
    })()

    return { success: true, data: result }
  } catch (err) {
    // M100: Strukturerade fel från validation helpers (t.ex. validateAccountsActive)
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: string; error?: string; field?: string }
      log.error(
        `[manual-entry-service] finalizeManualEntry: ${e.error ?? 'unknown'}`,
      )
      return {
        success: false,
        error: e.error ?? 'Okänt fel',
        code: e.code as ErrorCode,
        field: e.field,
      }
    }
    // Fallback för plain Error och okända typer
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(message)
    return {
      success: false,
      error: message,
      code: 'TRANSACTION_ERROR' as const,
    }
  }
}
