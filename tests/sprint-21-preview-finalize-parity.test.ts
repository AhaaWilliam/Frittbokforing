/**
 * Sprint 21 — Preview ↔ Finalize paritetstest (M135).
 *
 * Förhindrar drift mellan `previewJournalLines` (preview-service) och
 * faktiska journal_entry_lines som skrivs av `finalizeManualEntry` /
 * `finalizeExpense`. En framtida bugg som ändrar journal-shape i bara
 * ett av lagren fångas här.
 *
 * Strategi: kör samma input genom båda paths och jämför resulterande
 * journal-lines aggregerat per (account_number, debit_ore, credit_ore).
 * Beskrivning och raden ordning ingår inte i jämförelsen — bara
 * bokföringsmässig effekt.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { previewJournalLines } from '../src/main/services/preview-service'
import {
  saveManualEntryDraft,
  finalizeManualEntry,
} from '../src/main/services/manual-entry-service'
import {
  saveExpenseDraft,
  finalizeExpense,
} from '../src/main/services/expense-service'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'

interface NormLine {
  account_number: string
  debit_ore: number
  credit_ore: number
}

function normalizePreview(lines: ReadonlyArray<NormLine>): NormLine[] {
  return lines
    .map((l) => ({
      account_number: l.account_number,
      debit_ore: l.debit_ore,
      credit_ore: l.credit_ore,
    }))
    .sort((a, b) => {
      const byAcc = a.account_number.localeCompare(b.account_number)
      if (byAcc !== 0) return byAcc
      const byDeb = a.debit_ore - b.debit_ore
      if (byDeb !== 0) return byDeb
      return a.credit_ore - b.credit_ore
    })
}

function readJournalLines(
  db: Database.Database,
  journalEntryId: number,
): NormLine[] {
  const rows = db
    .prepare(
      'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
    )
    .all(journalEntryId) as NormLine[]
  return normalizePreview(rows)
}

function setupCompany(db: Database.Database): { fiscalYearId: number } {
  const result = createCompany(db, {
    name: 'Parity Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2026-01-01',
    fiscal_year_start: '2026-01-01',
    fiscal_year_end: '2026-12-31',
  })
  if (!result.success) throw new Error('createCompany failed: ' + result.error)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as
    | { id: number }
    | undefined
  if (!fy) throw new Error('No fiscal_year created')
  return { fiscalYearId: fy.id }
}

describe('Sprint 21 — preview/finalize parity (manual)', () => {
  let db: Database.Database
  let fiscalYearId: number

  beforeEach(() => {
    db = createTestDb()
    const setup = setupCompany(db)
    fiscalYearId = setup.fiscalYearId
  })

  it('balanserat 2-rad-verifikat: preview === finalize', () => {
    const input = {
      source: 'manual' as const,
      fiscal_year_id: fiscalYearId,
      entry_date: '2026-04-29',
      description: 'Parity manual',
      lines: [
        { account_number: '1930', debit_ore: 100000, credit_ore: 0 },
        { account_number: '6230', debit_ore: 0, credit_ore: 100000 },
      ],
    }

    // Preview-path
    const preview = previewJournalLines(db, input)
    expect(preview.success).toBe(true)
    if (!preview.success) return
    const previewLines = normalizePreview(preview.data.lines)

    // Finalize-path
    const saveResult = saveManualEntryDraft(db, {
      fiscal_year_id: fiscalYearId,
      entry_date: '2026-04-29',
      description: 'Parity manual',
      lines: input.lines,
    })
    expect(saveResult.success).toBe(true)
    if (!saveResult.success) return

    const finalizeResult = finalizeManualEntry(
      db,
      saveResult.data.id,
      fiscalYearId,
    )
    expect(finalizeResult.success).toBe(true)
    if (!finalizeResult.success) return

    const journalLines = readJournalLines(
      db,
      finalizeResult.data.journalEntryId,
    )

    expect(previewLines).toEqual(journalLines)
  })

  it('multi-rad balanserat verifikat: preview === finalize', () => {
    const input = {
      source: 'manual' as const,
      fiscal_year_id: fiscalYearId,
      entry_date: '2026-05-01',
      description: 'Parity multi',
      lines: [
        { account_number: '1930', debit_ore: 60000, credit_ore: 0 },
        { account_number: '1510', debit_ore: 40000, credit_ore: 0 },
        { account_number: '6230', debit_ore: 0, credit_ore: 100000 },
      ],
    }

    const preview = previewJournalLines(db, input)
    expect(preview.success).toBe(true)
    if (!preview.success) return

    const saveResult = saveManualEntryDraft(db, {
      fiscal_year_id: fiscalYearId,
      entry_date: input.entry_date,
      description: input.description,
      lines: input.lines,
    })
    expect(saveResult.success).toBe(true)
    if (!saveResult.success) return

    const finalizeResult = finalizeManualEntry(
      db,
      saveResult.data.id,
      fiscalYearId,
    )
    expect(finalizeResult.success).toBe(true)
    if (!finalizeResult.success) return

    expect(normalizePreview(preview.data.lines)).toEqual(
      readJournalLines(db, finalizeResult.data.journalEntryId),
    )
  })
})

describe('Sprint 21 — preview/finalize parity (expense)', () => {
  let db: Database.Database
  let fiscalYearId: number
  let supplierId: number
  let ip1Id: number

  beforeEach(() => {
    db = createTestDb()
    const setup = setupCompany(db)
    fiscalYearId = setup.fiscalYearId
    const company = db.prepare('SELECT id FROM companies LIMIT 1').get() as {
      id: number
    }
    const supplier = createCounterparty(db, {
      company_id: company.id,
      name: 'Test Leverantör',
      type: 'supplier',
      default_payment_terms: 30,
    })
    if (!supplier.success)
      throw new Error('Supplier-creation failed: ' + supplier.error)
    supplierId = supplier.data.id
    ip1Id = (
      db.prepare(`SELECT id FROM vat_codes WHERE code = 'IP1'`).get() as {
        id: number
      }
    ).id
  })

  it('enkelrad 25%-moms: preview === finalize', () => {
    const lines = [
      {
        description: 'Telefonräkning',
        account_number: '6230',
        quantity: 1,
        unit_price_ore: 80000,
        vat_code_id: ip1Id,
      },
    ]

    const preview = previewJournalLines(db, {
      source: 'expense',
      fiscal_year_id: fiscalYearId,
      expense_date: '2026-04-29',
      description: 'Parity expense',
      lines,
    })
    expect(preview.success).toBe(true)
    if (!preview.success) return

    const saveResult = saveExpenseDraft(db, {
      fiscal_year_id: fiscalYearId,
      counterparty_id: supplierId,
      expense_type: 'normal',
      supplier_invoice_number: 'F-1',
      expense_date: '2026-04-29',
      due_date: '2026-05-29',
      description: 'Parity expense',
      payment_terms: 30,
      notes: '',
      lines,
    })
    expect(saveResult.success).toBe(true)
    if (!saveResult.success) return

    const finalizeResult = finalizeExpense(db, saveResult.data.id)
    expect(finalizeResult.success).toBe(true)
    if (!finalizeResult.success) return

    // Hitta journal_entry_id via expense-row
    const exp = db
      .prepare('SELECT journal_entry_id FROM expenses WHERE id = ?')
      .get(saveResult.data.id) as { journal_entry_id: number }
    expect(exp.journal_entry_id).not.toBeNull()

    expect(normalizePreview(preview.data.lines)).toEqual(
      readJournalLines(db, exp.journal_entry_id),
    )
  })

  it('multi-rad olika kostnadskonton: preview === finalize (aggregering)', () => {
    const lines = [
      {
        description: 'Tel A',
        account_number: '6230',
        quantity: 1,
        unit_price_ore: 50000,
        vat_code_id: ip1Id,
      },
      {
        description: 'Tel B',
        account_number: '6230',
        quantity: 2,
        unit_price_ore: 25000,
        vat_code_id: ip1Id,
      },
      {
        description: 'Kontorsmaterial',
        account_number: '6110',
        quantity: 1,
        unit_price_ore: 30000,
        vat_code_id: ip1Id,
      },
    ]

    const preview = previewJournalLines(db, {
      source: 'expense',
      fiscal_year_id: fiscalYearId,
      expense_date: '2026-04-29',
      description: 'Parity multi-line',
      lines,
    })
    expect(preview.success).toBe(true)
    if (!preview.success) return

    const saveResult = saveExpenseDraft(db, {
      fiscal_year_id: fiscalYearId,
      counterparty_id: supplierId,
      expense_type: 'normal',
      supplier_invoice_number: 'F-2',
      expense_date: '2026-04-29',
      due_date: '2026-05-29',
      description: 'Parity multi-line',
      payment_terms: 30,
      notes: '',
      lines,
    })
    expect(saveResult.success).toBe(true)
    if (!saveResult.success) return

    const finalizeResult = finalizeExpense(db, saveResult.data.id)
    expect(finalizeResult.success).toBe(true)
    if (!finalizeResult.success) return

    const exp = db
      .prepare('SELECT journal_entry_id FROM expenses WHERE id = ?')
      .get(saveResult.data.id) as { journal_entry_id: number }

    expect(normalizePreview(preview.data.lines)).toEqual(
      readJournalLines(db, exp.journal_entry_id),
    )
  })

  it('totalsummor matchar (debet === kredit)', () => {
    const lines = [
      {
        description: 'X',
        account_number: '6230',
        quantity: 3,
        unit_price_ore: 33333,
        vat_code_id: ip1Id,
      },
    ]

    const preview = previewJournalLines(db, {
      source: 'expense',
      fiscal_year_id: fiscalYearId,
      expense_date: '2026-04-29',
      description: 'Sum check',
      lines,
    })
    expect(preview.success).toBe(true)
    if (!preview.success) return

    expect(preview.data.balanced).toBe(true)
    expect(preview.data.total_debit_ore).toBe(preview.data.total_credit_ore)

    const saveResult = saveExpenseDraft(db, {
      fiscal_year_id: fiscalYearId,
      counterparty_id: supplierId,
      expense_type: 'normal',
      supplier_invoice_number: 'F-3',
      expense_date: '2026-04-29',
      due_date: '2026-05-29',
      description: 'Sum check',
      payment_terms: 30,
      notes: '',
      lines,
    })
    expect(saveResult.success).toBe(true)
    if (!saveResult.success) return

    finalizeExpense(db, saveResult.data.id)
    const exp = db
      .prepare('SELECT journal_entry_id FROM expenses WHERE id = ?')
      .get(saveResult.data.id) as { journal_entry_id: number }

    const journalLines = readJournalLines(db, exp.journal_entry_id)
    const totalDebit = journalLines.reduce((s, l) => s + l.debit_ore, 0)
    const totalCredit = journalLines.reduce((s, l) => s + l.credit_ore, 0)
    expect(totalDebit).toBe(preview.data.total_debit_ore)
    expect(totalCredit).toBe(preview.data.total_credit_ore)
  })
})
