import type Database from 'better-sqlite3'
import { z } from 'zod'
import type { IpcResult } from '../../shared/types'
import { PreviewJournalLinesInputSchema } from '../../shared/ipc-schemas'
import { todayLocalFromNow } from '../utils/now'
import { loadVatCodeMap, computeLineVat } from './shared/line-vat'

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
  source: 'manual' | 'expense'
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
  if (input.source === 'expense') {
    return previewExpenseJournal(db, input)
  }

  // source === 'manual'
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

/**
 * Sprint 19b — Expense preview. Speglar `processExpenseLines` +
 * journal-line-aggregering från expense-service utan DB-skrivningar.
 *
 * Resulterande verifikat (D=debet, K=kredit):
 *   D 6XXX (kostnadskonto, line_total_ore per kostnadskonto-aggregering)
 *   D 2640 (ingående moms, sum av vat_amount_ore)
 *   K 2440 (leverantörsskuld, totalInclVat)
 *
 * Speglar invarianten i finalizeExpense:362–470 inkl. moms-konsolidering
 * till 2640 oavsett momssats. Read-only: ingen INSERT/UPDATE/DELETE.
 */
function previewExpenseJournal(
  db: Database.Database,
  input: Extract<PreviewJournalLinesInput, { source: 'expense' }>,
): IpcResult<PreviewJournalLinesResult> {
  const warnings: string[] = []

  // Ladda momskoder en gång
  const vatMap = loadVatCodeMap(db, 'incoming')

  // Aggregera per konto (samma mönster som finalizeExpense:435–448)
  const costTotals = new Map<string, number>()
  let vatTotal = 0
  let totalInclVat = 0

  for (const [i, line] of input.lines.entries()) {
    if (!vatMap.has(line.vat_code_id)) {
      warnings.push(
        `Rad ${i + 1}: momskod ${line.vat_code_id} finns inte (kontrollera urval).`,
      )
    }
    const lineTotal = line.quantity * line.unit_price_ore
    const vatAmount = computeLineVat(vatMap, line.vat_code_id, lineTotal)
    costTotals.set(
      line.account_number,
      (costTotals.get(line.account_number) ?? 0) + lineTotal,
    )
    vatTotal += vatAmount
    totalInclVat += lineTotal + vatAmount
  }

  // Plocka konto-namn för D-rader + 2640 + 2440
  const accountNumbers = [
    ...costTotals.keys(),
    ...(vatTotal > 0 ? ['2640'] : []),
    '2440',
  ]
  const names = getAccountNames(db, Array.from(new Set(accountNumbers)))

  for (const account of costTotals.keys()) {
    if (!names.has(account)) {
      warnings.push(
        `Kontonummer ${account} finns inte i kontoplanen — bokförs ändå men granska.`,
      )
    }
  }

  // Bygg journal-rader: D-konton först (sorterat), sedan K 2440 sist
  const journalLines: PreviewJournalLine[] = []

  // D-rader för kostnadskonton (deterministisk ordning)
  const sortedCostAccounts = Array.from(costTotals.keys()).sort()
  for (const account of sortedCostAccounts) {
    journalLines.push({
      account_number: account,
      account_name: names.get(account) ?? null,
      debit_ore: costTotals.get(account)!,
      credit_ore: 0,
      description: null,
    })
  }

  // D 2640 om moms finns
  if (vatTotal > 0) {
    journalLines.push({
      account_number: '2640',
      account_name: names.get('2640') ?? null,
      debit_ore: vatTotal,
      credit_ore: 0,
      description: 'Ingående moms',
    })
  }

  // K 2440
  journalLines.push({
    account_number: '2440',
    account_name: names.get('2440') ?? null,
    debit_ore: 0,
    credit_ore: totalInclVat,
    description: 'Leverantörsskuld',
  })

  const total_debit_ore = journalLines.reduce((s, l) => s + l.debit_ore, 0)
  const total_credit_ore = journalLines.reduce((s, l) => s + l.credit_ore, 0)
  const balanced = total_debit_ore === total_credit_ore && total_debit_ore > 0

  if (!balanced && total_debit_ore !== 0) {
    warnings.push(
      `Verifikatet balanserar inte: debet ${total_debit_ore} ≠ kredit ${total_credit_ore} öre.`,
    )
  }

  return {
    success: true as const,
    data: {
      source: 'expense',
      lines: journalLines,
      total_debit_ore,
      total_credit_ore,
      balanced,
      entry_date: input.expense_date ?? todayLocalFromNow(),
      description: input.description ?? null,
      warnings,
    },
  }
}
