import type Database from 'better-sqlite3'
import log from 'electron-log'
import { todayLocal } from '../../shared/date-utils'
import type { ErrorCode, IpcResult, JournalEntry } from '../../shared/types'
import { rebuildSearchIndex } from './search-service'

// ── Types ────────────────────────────────────────────────────────────

interface CorrectionResult {
  correction_entry_id: number
  correction_verification_number: number
  original_entry_id: number
}

interface CanCorrectResult {
  canCorrect: boolean
  reason?: string
}

// ── Internal row types ───────────────────────────────────────────────

interface JournalEntryRow {
  id: number
  company_id: number
  fiscal_year_id: number
  verification_number: number
  verification_series: string
  journal_date: string
  description: string
  status: string
  source_type: string
  corrects_entry_id: number | null
  corrected_by_id: number | null
}

interface JournalEntryLineRow {
  line_number: number
  account_number: string
  debit_ore: number
  credit_ore: number
  description: string | null
}

// ── Guards ───────────────────────────────────────────────────────────

function checkGuards(
  db: Database.Database,
  entry: JournalEntryRow,
  correctionFiscalYearId?: number,
): { canCorrect: boolean; reason?: string; code?: ErrorCode } {
  // 1. Must not already be corrected (check before status — corrected entries have status='corrected')
  if (entry.corrected_by_id !== null || entry.status === 'corrected') {
    return {
      canCorrect: false,
      reason: 'Verifikatet är redan korrigerat.',
      code: 'ENTRY_ALREADY_CORRECTED',
    }
  }

  // 2. Must be booked (not draft)
  if (entry.status !== 'booked') {
    return {
      canCorrect: false,
      reason: 'Verifikatet måste vara bokfört.',
      code: 'ENTRY_NOT_BOOKED',
    }
  }

  // 3. Must not itself be a correction entry (Q12)
  if (entry.corrects_entry_id !== null) {
    return {
      canCorrect: false,
      reason: 'Korrigeringsverifikat kan inte korrigeras.',
      code: 'ENTRY_IS_CORRECTION',
    }
  }

  // 4. Must not have dependent payments (Q7 — via invoice or expense)
  const hasPayments = db
    .prepare(
      `SELECT 1 FROM invoice_payments WHERE journal_entry_id = :id
       UNION ALL
       SELECT 1 FROM expense_payments WHERE journal_entry_id = :id
       UNION ALL
       SELECT 1 FROM invoices i JOIN invoice_payments ip ON ip.invoice_id = i.id
         WHERE i.journal_entry_id = :id
       UNION ALL
       SELECT 1 FROM expenses e JOIN expense_payments ep ON ep.expense_id = e.id
         WHERE e.journal_entry_id = :id
       LIMIT 1`,
    )
    .get({ id: entry.id })
  if (hasPayments) {
    return {
      canCorrect: false,
      reason:
        'Verifikatet har beroende betalningar. Återför betalningarna först.',
      code: 'HAS_DEPENDENT_PAYMENTS',
    }
  }

  // 5. Correction FY must be open (only if FY is provided — canCorrect skip this)
  if (correctionFiscalYearId !== undefined) {
    const fy = db
      .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
      .get(correctionFiscalYearId) as { is_closed: number } | undefined
    if (!fy) {
      return {
        canCorrect: false,
        reason: 'Räkenskapsåret hittades inte.',
        code: 'NOT_FOUND',
      }
    }
    if (fy.is_closed === 1) {
      return {
        canCorrect: false,
        reason: 'Räkenskapsåret är stängt.',
        code: 'YEAR_IS_CLOSED',
      }
    }

    // 6. Period for today's date must be open in correction FY
    const today = todayLocal()
    const closedPeriod = db
      .prepare(
        `SELECT 1 FROM accounting_periods
         WHERE fiscal_year_id = ?
           AND ? >= start_date AND ? <= end_date
           AND is_closed = 1
         LIMIT 1`,
      )
      .get(correctionFiscalYearId, today, today)
    if (closedPeriod) {
      return {
        canCorrect: false,
        reason: 'Perioden för dagens datum är stängd.',
        code: 'PERIOD_CLOSED',
      }
    }
  }

  return { canCorrect: true }
}

// ── Public API ───────────────────────────────────────────────────────

/**
 * Check whether a journal entry can be corrected.
 * Used by UI to show/hide the "Korrigera" button.
 */
export function canCorrectEntry(
  db: Database.Database,
  journalEntryId: number,
): IpcResult<CanCorrectResult> {
  const entry = db
    .prepare(
      `SELECT id, company_id, fiscal_year_id, verification_number,
              verification_series, journal_date, description, status,
              source_type, corrects_entry_id, corrected_by_id
       FROM journal_entries WHERE id = ?`,
    )
    .get(journalEntryId) as JournalEntryRow | undefined

  if (!entry) {
    return {
      success: true,
      data: { canCorrect: false, reason: 'Verifikatet hittades inte.' },
    }
  }

  const result = checkGuards(db, entry)
  return {
    success: true,
    data: { canCorrect: result.canCorrect, reason: result.reason },
  }
}

/**
 * Create a correction entry that reverses all lines of the original.
 * Atomic: either the full correction succeeds or nothing changes.
 */
export function createCorrectionEntry(
  db: Database.Database,
  input: { journal_entry_id: number; fiscal_year_id: number },
): IpcResult<CorrectionResult> {
  try {
    const result = db.transaction(() => {
      // 1. Fetch original entry
      const entry = db
        .prepare(
          `SELECT id, company_id, fiscal_year_id, verification_number,
                  verification_series, journal_date, description, status,
                  source_type, corrects_entry_id, corrected_by_id
           FROM journal_entries WHERE id = ?`,
        )
        .get(input.journal_entry_id) as JournalEntryRow | undefined

      if (!entry) {
        throw {
          code: 'ENTRY_NOT_FOUND' as ErrorCode,
          error: 'Verifikatet hittades inte.',
        }
      }

      // 2. Run all guards within this transaction — TOCTOU-skydd (M140).
      // Flytta INTE checkGuards utanför transaktionen — en betalning kan
      // registreras mellan canCorrectEntry (read-only) och denna mutation.
      const guardResult = checkGuards(db, entry, input.fiscal_year_id)
      if (!guardResult.canCorrect) {
        throw {
          code: guardResult.code ?? ('VALIDATION_ERROR' as ErrorCode),
          error: guardResult.reason!,
        }
      }

      // 3. Fetch original lines
      const lines = db
        .prepare(
          `SELECT line_number, account_number, debit_ore, credit_ore, description
           FROM journal_entry_lines
           WHERE journal_entry_id = ?
           ORDER BY line_number`,
        )
        .all(input.journal_entry_id) as JournalEntryLineRow[]

      if (lines.length === 0) {
        throw {
          code: 'VALIDATION_ERROR' as ErrorCode,
          error: 'Originalverifikatet har inga rader.',
        }
      }

      // 4. Allocate next C-series number for the correction's FY
      const nextVer = db
        .prepare(
          "SELECT COALESCE(MAX(verification_number), 0) + 1 as next_ver FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'C'",
        )
        .get(input.fiscal_year_id) as { next_ver: number }
      const verificationNumber = nextVer.next_ver

      // 5. Build description with M139 cross-reference
      const originalRef = `${entry.verification_series}${entry.verification_number}`
      const description = `Korrigering av ver. ${originalRef} — ${entry.description}`

      // 6. Create correction journal entry (as draft first)
      const today = todayLocal()
      const jeResult = db
        .prepare(
          `INSERT INTO journal_entries (
            company_id, fiscal_year_id, verification_number, verification_series,
            journal_date, description, status, source_type, corrects_entry_id
          ) VALUES (
            (SELECT id FROM companies LIMIT 1), ?, ?, 'C',
            ?, ?, 'draft', 'manual', ?
          )`,
        )
        .run(
          input.fiscal_year_id,
          verificationNumber,
          today,
          description,
          input.journal_entry_id,
        )
      const correctionEntryId = Number(jeResult.lastInsertRowid)

      // 7. Create reversed lines (swap debit <-> credit)
      const insertLine = db.prepare(
        `INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_number,
          debit_ore, credit_ore, description
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      for (const line of lines) {
        insertLine.run(
          correctionEntryId,
          line.line_number,
          line.account_number,
          line.credit_ore, // swap: original credit → correction debit
          line.debit_ore, // swap: original debit → correction credit
          line.description,
        )
      }

      // 8. Book the correction entry (triggers validate balance + period)
      db.prepare(
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
      ).run(correctionEntryId)

      // 9. Mark original as corrected
      db.prepare(
        "UPDATE journal_entries SET status = 'corrected', corrected_by_id = ? WHERE id = ?",
      ).run(correctionEntryId, input.journal_entry_id)

      return {
        correction_entry_id: correctionEntryId,
        correction_verification_number: verificationNumber,
        original_entry_id: input.journal_entry_id,
      }
    })()

    try { rebuildSearchIndex(db) } catch { /* log only */ }
    return { success: true, data: result }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      log.error(`[correction-service] createCorrectionEntry: ${e.error}`)
      return { success: false, error: e.error, code: e.code, field: e.field }
    }
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(`[correction-service] createCorrectionEntry: ${message}`)
    return { success: false, error: message, code: 'UNEXPECTED_ERROR' }
  }
}
