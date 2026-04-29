import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { IpcResult } from '../../shared/types'
import { PreviewJournalLinesInputSchema } from '../../shared/ipc-schemas'
import { todayLocalFromNow } from '../utils/now'

/**
 * Sprint 16 — Live verifikat-preview (ADR 006).
 *
 * Read-only beräkning av journal-lines från form-input. Inga DB-skrivningar.
 * Inga transaktioner. Snabb och säker att anropa per tangenttryck (debounced
 * 150 ms i renderer).
 *
 * Per CLAUDE.md regel 1 + 5: bokföringslogik körs i main process, inte
 * i renderer. Detta gäller även preview.
 *
 * **Scope för Sprint 16:** manuell journalpost. Expense-preview ligger i
 * backlog — `buildJournalLines` för expense har DB-uppslag mot products
 * och vat_codes som kräver refaktor innan det kan kallas pure (M123).
 * Manuell journalpost är väsentligt enklare: användaren anger debit/credit
 * direkt; preview-funktionen validerar balans och decorator:ar med
 * konto-namn från `accounts`-tabellen för visning.
 */

export type PreviewJournalLinesInput = z.infer<
  typeof PreviewJournalLinesInputSchema
>

export interface PreviewJournalLine {
  account_number: string
  account_name: string | null
  debit_ore: number
  credit_ore: number
  description: string | null
}

export interface PreviewJournalLinesResult {
  source: 'manual'
  lines: PreviewJournalLine[]
  total_debit_ore: number
  total_credit_ore: number
  balanced: boolean
  /**
   * Beräknat datum (eller user-provided). Visas i UI som "Verifikat 2026-04-29".
   */
  entry_date: string
  /** Optional användartext. Visas under datumet. */
  description: string | null
  /**
   * Diagnostiska fel som inte stoppar preview men signalerar att final
   * finalize kommer att blockera. T.ex. okänt kontonummer, obalans.
   */
  warnings: ReadonlyArray<string>
}

/**
 * Hämtar konto-namn för ett set av kontonummer i en query.
 * Returnerar Map<account_number, name|null>.
 */
function getAccountNames(
  db: Database.Database,
  numbers: string[],
): Map<string, string | null> {
  if (numbers.length === 0) return new Map()
  const placeholders = numbers.map(() => '?').join(',')
  const rows = db
    .prepare(
      `SELECT account_number, name FROM accounts WHERE account_number IN (${placeholders})`,
    )
    .all(...numbers) as Array<{ account_number: string; name: string }>
  const map = new Map<string, string | null>()
  for (const r of rows) map.set(r.account_number, r.name)
  return map
}

export function previewJournalLines(
  db: Database.Database,
  input: PreviewJournalLinesInput,
): IpcResult<PreviewJournalLinesResult> {
  if (input.source !== 'manual') {
    return {
      success: false as const,
      code: 'VALIDATION_ERROR' as const,
      error: `Preview för source=${input.source} är inte implementerat ännu.`,
    }
  }

  const lines = input.lines
  const accountNumbers = Array.from(new Set(lines.map((l) => l.account_number)))
  const names = getAccountNames(db, accountNumbers)

  const warnings: string[] = []

  // Per-rad-validering: debit XOR credit > 0
  for (const [i, line] of lines.entries()) {
    if (line.debit_ore > 0 && line.credit_ore > 0) {
      warnings.push(
        `Rad ${i + 1}: både debet och kredit är angivna — bara den ena får vara > 0.`,
      )
    }
    if (line.debit_ore === 0 && line.credit_ore === 0) {
      warnings.push(`Rad ${i + 1}: varken debet eller kredit är angiven.`)
    }
    if (!names.has(line.account_number)) {
      warnings.push(
        `Rad ${i + 1}: kontonummer ${line.account_number} finns inte i kontoplanen.`,
      )
    }
  }

  const total_debit_ore = lines.reduce((s, l) => s + l.debit_ore, 0)
  const total_credit_ore = lines.reduce((s, l) => s + l.credit_ore, 0)
  const balanced = total_debit_ore === total_credit_ore && total_debit_ore > 0

  if (!balanced) {
    if (total_debit_ore === 0 && total_credit_ore === 0) {
      warnings.push('Inga belopp angivna.')
    } else {
      const diff = total_debit_ore - total_credit_ore
      const sign = diff > 0 ? 'mer debet än kredit' : 'mer kredit än debet'
      warnings.push(
        `Verifikatet balanserar inte (${sign}: ${Math.abs(diff)} öre).`,
      )
    }
  }

  const today = todayLocalFromNow()

  return {
    success: true as const,
    data: {
      source: 'manual',
      lines: lines.map((l) => ({
        account_number: l.account_number,
        account_name: names.get(l.account_number) ?? null,
        debit_ore: l.debit_ore,
        credit_ore: l.credit_ore,
        description: l.description ?? null,
      })),
      total_debit_ore,
      total_credit_ore,
      balanced,
      entry_date: input.entry_date ?? today,
      description: input.description ?? null,
      warnings,
    },
  }
}
