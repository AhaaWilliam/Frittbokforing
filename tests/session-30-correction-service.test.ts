import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
} from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  payExpense,
} from '../src/main/services/expense-service'
import {
  saveManualEntryDraft,
  finalizeManualEntry,
} from '../src/main/services/manual-entry-service'
import {
  createCorrectionEntry,
  canCorrectEntry,
} from '../src/main/services/correction-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2026-01-15',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
}

function seedBase(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  const cp = createCounterparty(testDb, { name: 'Kund AB', type: 'customer' })
  if (!cp.success) throw new Error('CP failed')
  const supplierCp = createCounterparty(testDb, { name: 'Leverantör AB', type: 'supplier' })
  if (!supplierCp.success) throw new Error('Supplier CP failed')
  const vatCode = testDb.prepare("SELECT id FROM vat_codes WHERE code = 'MP1'").get() as { id: number }
  const inVatCode = testDb.prepare("SELECT id FROM vat_codes WHERE code = 'IP1'").get() as { id: number }
  return {
    fiscalYearId: fy.id,
    cpId: cp.data.id,
    supplierCpId: supplierCp.data.id,
    vatCodeId: vatCode.id,
    inVatCodeId: inVatCode.id,
  }
}

function bookInvoice(testDb: Database.Database, seed: ReturnType<typeof seedBase>, date: string) {
  const draft = saveDraft(testDb, {
    counterparty_id: seed.cpId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: date,
    due_date: date,
    lines: [{
      product_id: null,
      description: 'Konsulttjänst',
      account_number: '3001',
      quantity: 1,
      unit_price_ore: 10000,
      vat_code_id: seed.vatCodeId,
      sort_order: 0,
    }],
  })
  if (!draft.success) throw new Error('Draft failed')
  const fin = finalizeDraft(testDb, draft.data.id)
  if (!fin.success) throw new Error('Finalize failed: ' + fin.error)
  return { invoiceId: fin.data.id, journalEntryId: fin.data.journal_entry_id!, totalAmountOre: fin.data.total_amount_ore }
}

function bookExpense(testDb: Database.Database, seed: ReturnType<typeof seedBase>, date: string) {
  const draft = saveExpenseDraft(testDb, {
    counterparty_id: seed.supplierCpId,
    fiscal_year_id: seed.fiscalYearId,
    expense_date: date,
    description: 'Kontorsmaterial',
    lines: [{
      description: 'Papper',
      account_number: '5410',
      quantity: 1,
      unit_price_ore: 5000,
      vat_code_id: seed.inVatCodeId,
      sort_order: 0,
    }],
  })
  if (!draft.success) throw new Error('Expense draft failed')
  const fin = finalizeExpense(testDb, draft.data.id)
  if (!fin.success) throw new Error('Expense finalize failed: ' + fin.error)
  // finalizeExpense returns { id, verification_number } — read full expense from DB
  const exp = testDb.prepare('SELECT id, journal_entry_id, total_amount_ore FROM expenses WHERE id = ?').get(fin.data.id) as {
    id: number; journal_entry_id: number; total_amount_ore: number
  }
  return { expenseId: exp.id, journalEntryId: exp.journal_entry_id, totalAmountOre: exp.total_amount_ore }
}

function bookManualEntry(testDb: Database.Database, seed: ReturnType<typeof seedBase>, date: string) {
  const draft = saveManualEntryDraft(testDb, {
    fiscal_year_id: seed.fiscalYearId,
    entry_date: date,
    description: 'Manuell testbokning',
    lines: [
      { account_number: '1930', debit_ore: 10000, credit_ore: 0, description: 'Bank' },
      { account_number: '3001', debit_ore: 0, credit_ore: 10000, description: 'Intäkt' },
    ],
  })
  if (!draft.success) throw new Error('Manual entry draft failed: ' + draft.error)
  const fin = finalizeManualEntry(testDb, draft.data.id, seed.fiscalYearId)
  if (!fin.success) throw new Error('Manual entry finalize failed: ' + fin.error)
  return { journalEntryId: fin.data.journalEntryId, verificationNumber: fin.data.verificationNumber }
}

function getLines(testDb: Database.Database, journalEntryId: number) {
  return testDb.prepare(
    'SELECT line_number, account_number, debit_ore, credit_ore, description FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
  ).all(journalEntryId) as { line_number: number; account_number: string; debit_ore: number; credit_ore: number; description: string | null }[]
}

function getEntry(testDb: Database.Database, id: number) {
  return testDb.prepare(
    'SELECT id, status, corrects_entry_id, corrected_by_id, verification_series, verification_number, description, fiscal_year_id, source_type FROM journal_entries WHERE id = ?',
  ).get(id) as { id: number; status: string; corrects_entry_id: number | null; corrected_by_id: number | null; verification_series: string; verification_number: number; description: string; fiscal_year_id: number; source_type: string }
}

beforeEach(() => { db = createTestDb() })
afterEach(() => { db.close() })

describe('B4: Correction Service', () => {
  // === Happy path ===

  it('creates correction entry: original → corrected, correction → booked', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')

    const result = createCorrectionEntry(db, {
      journal_entry_id: manual.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })

    expect(result.success).toBe(true)
    if (!result.success) return

    // Original is corrected
    const original = getEntry(db, manual.journalEntryId)
    expect(original.status).toBe('corrected')
    expect(original.corrected_by_id).toBe(result.data.correction_entry_id)

    // Correction is booked
    const correction = getEntry(db, result.data.correction_entry_id)
    expect(correction.status).toBe('booked')
    expect(correction.corrects_entry_id).toBe(manual.journalEntryId)
  })

  it('net-balance: original + correction = 0 per account', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')

    const result = createCorrectionEntry(db, {
      journal_entry_id: manual.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const originalLines = getLines(db, manual.journalEntryId)
    const correctionLines = getLines(db, result.data.correction_entry_id)

    // For each account, sum(debit - credit) across both entries should be 0
    const balances = new Map<string, number>()
    for (const line of [...originalLines, ...correctionLines]) {
      const prev = balances.get(line.account_number) ?? 0
      balances.set(line.account_number, prev + line.debit_ore - line.credit_ore)
    }
    for (const [account, balance] of balances) {
      expect(balance, `Account ${account} should net to 0`).toBe(0)
    }
  })

  it('correction has reversed lines (swap debet/kredit)', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')

    const result = createCorrectionEntry(db, {
      journal_entry_id: manual.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const originalLines = getLines(db, manual.journalEntryId)
    const correctionLines = getLines(db, result.data.correction_entry_id)

    expect(correctionLines.length).toBe(originalLines.length)
    for (let i = 0; i < originalLines.length; i++) {
      expect(correctionLines[i].account_number).toBe(originalLines[i].account_number)
      expect(correctionLines[i].debit_ore).toBe(originalLines[i].credit_ore)
      expect(correctionLines[i].credit_ore).toBe(originalLines[i].debit_ore)
    }
  })

  it('description contains M139 cross-reference', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')

    const result = createCorrectionEntry(db, {
      journal_entry_id: manual.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    const correction = getEntry(db, result.data.correction_entry_id)
    expect(correction.description).toContain('Korrigering av ver.')
    expect(correction.description).toContain(`C${manual.verificationNumber}`)
  })

  it('C-series number is correct (next available in correction FY)', () => {
    const seed = seedBase(db)
    // Create first manual entry → C1
    bookManualEntry(db, seed, '2026-03-01')
    // Create second → C2
    const manual2 = bookManualEntry(db, seed, '2026-03-02')

    // Correct the second → correction should be C3
    const result = createCorrectionEntry(db, {
      journal_entry_id: manual2.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    expect(result.data.correction_verification_number).toBe(3)
    const correction = getEntry(db, result.data.correction_entry_id)
    expect(correction.verification_series).toBe('C')
    expect(correction.verification_number).toBe(3)
  })

  it('cross-FY correction: original in FY1 (closed), correction in FY2 that covers today (Q11)', () => {
    // Setup: FY1 = 2025, FY2 = 2026 (covers today's date)
    // Seed creates FY 2026-01-01 → 2026-12-31 as FY1.
    // We create FY2 = 2025 for the original, then correct from FY1 (which covers today).
    // Actually simpler: use the default FY1 (2026) for the original, create FY2 (2026-extended)
    // that also covers today, and close FY1.
    //
    // Simplest approach: book original in current FY, create a second FY that also covers
    // today, close the first. The overlap triggers would block this.
    //
    // Real approach: Create FY1=2025 (for original), FY2=2026 (covers today, for correction).
    const testDb = createTestDb()
    createCompany(testDb, {
      name: 'CrossFY AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2' as const,
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2025-01-01',
      fiscal_year_end: '2025-12-31',
    })
    const fy1 = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }

    // Book a manual entry in FY1 (2025)
    const draft = saveManualEntryDraft(testDb, {
      fiscal_year_id: fy1.id,
      entry_date: '2025-06-01',
      description: 'Original i FY2025',
      lines: [
        { account_number: '1930', debit_ore: 10000, credit_ore: 0, description: 'Bank' },
        { account_number: '3001', debit_ore: 0, credit_ore: 10000, description: 'Intäkt' },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) { testDb.close(); return }
    const fin = finalizeManualEntry(testDb, draft.data.id, fy1.id)
    expect(fin.success).toBe(true)
    if (!fin.success) { testDb.close(); return }

    // Create FY2 = 2026 (covers today)
    testDb.prepare(`INSERT INTO fiscal_years (company_id, year_label, start_date, end_date, is_closed, annual_report_status)
      VALUES (1, '2026', '2026-01-01', '2026-12-31', 0, 'not_started')`).run()
    const fy2 = testDb.prepare("SELECT id FROM fiscal_years WHERE year_label = '2026'").get() as { id: number }

    // Close FY1
    testDb.prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(fy1.id)

    const result = createCorrectionEntry(testDb, {
      journal_entry_id: fin.data.journalEntryId,
      fiscal_year_id: fy2.id,
    })
    expect(result.success).toBe(true)
    if (!result.success) { testDb.close(); return }

    // Correction is in FY2
    const correction = getEntry(testDb, result.data.correction_entry_id)
    expect(correction.fiscal_year_id).toBe(fy2.id)
    // Original remains in FY1
    const original = getEntry(testDb, fin.data.journalEntryId)
    expect(original.fiscal_year_id).toBe(fy1.id)
    testDb.close()
  })

  // === Guard tests ===

  it('guard: cannot correct draft → felkod', () => {
    const seed = seedBase(db)
    // Create a draft manual entry but don't finalize
    const draft = saveManualEntryDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      entry_date: '2026-03-01',
      description: 'Test',
      lines: [
        { account_number: '1930', debit_ore: 1000, credit_ore: 0 },
        { account_number: '3001', debit_ore: 0, credit_ore: 1000 },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return

    // The manual_entry has a journal_entry_id that is null for drafts,
    // so we need to use a draft journal entry directly
    db.prepare(`INSERT INTO journal_entries (company_id, fiscal_year_id, verification_series, journal_date, description, status, source_type)
      VALUES (1, ?, 'C', '2026-03-01', 'Draft entry', 'draft', 'manual')`).run(seed.fiscalYearId)
    const draftJeId = Number((db.prepare('SELECT last_insert_rowid() as id').get() as { id: number }).id)

    const result = createCorrectionEntry(db, {
      journal_entry_id: draftJeId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('ENTRY_NOT_BOOKED')
  })

  it('guard: cannot correct already corrected → felkod', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')

    // First correction succeeds
    const first = createCorrectionEntry(db, {
      journal_entry_id: manual.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(first.success).toBe(true)

    // Second correction on same entry fails
    const second = createCorrectionEntry(db, {
      journal_entry_id: manual.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(second.success).toBe(false)
    if (second.success) return
    expect(second.code).toBe('ENTRY_ALREADY_CORRECTED')
  })

  it('guard: cannot correct a correction entry (Q12) → felkod', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')

    const correction = createCorrectionEntry(db, {
      journal_entry_id: manual.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(correction.success).toBe(true)
    if (!correction.success) return

    // Try to correct the correction entry
    const result = createCorrectionEntry(db, {
      journal_entry_id: correction.data.correction_entry_id,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('ENTRY_IS_CORRECTION')
  })

  it('guard: cannot correct entry with invoice_payments → felkod', () => {
    const seed = seedBase(db)
    const inv = bookInvoice(db, seed, '2026-03-01')

    // Pay the invoice
    const payResult = payInvoice(db, {
      invoice_id: inv.invoiceId,
      amount_ore: inv.totalAmountOre,
      payment_date: '2026-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)

    // Try to correct the invoice's journal entry
    const result = createCorrectionEntry(db, {
      journal_entry_id: inv.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('HAS_DEPENDENT_PAYMENTS')
  })

  it('guard: cannot correct entry with expense_payments → felkod', () => {
    const seed = seedBase(db)
    const exp = bookExpense(db, seed, '2026-03-01')

    // Pay the expense — date must be on or after expense_date
    const payResult = payExpense(db, {
      expense_id: exp.expenseId,
      amount_ore: exp.totalAmountOre,
      payment_date: '2026-04-01',
      payment_method: 'bank',
      account_number: '1930',
    })
    if (!payResult.success) {
      throw new Error('payExpense failed: ' + JSON.stringify(payResult))
    }

    // Try to correct the expense's journal entry
    const result = createCorrectionEntry(db, {
      journal_entry_id: exp.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('HAS_DEPENDENT_PAYMENTS')
  })

  it('guard: cannot correct in closed FY → felkod', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')

    // Close the FY
    db.prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(seed.fiscalYearId)

    const result = createCorrectionEntry(db, {
      journal_entry_id: manual.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('YEAR_IS_CLOSED')
  })

  it('guard: cannot correct when period is closed → felkod', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')

    // Close all periods that cover today
    db.prepare(
      `UPDATE accounting_periods SET is_closed = 1 WHERE fiscal_year_id = ?`,
    ).run(seed.fiscalYearId)

    const result = createCorrectionEntry(db, {
      journal_entry_id: manual.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('PERIOD_CLOSED')
  })

  it('guard: entry not found → felkod', () => {
    const seed = seedBase(db)

    const result = createCorrectionEntry(db, {
      journal_entry_id: 99999,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('ENTRY_NOT_FOUND')
  })

  // === canCorrectEntry ===

  it('canCorrectEntry returns true for eligible entry', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')

    const result = canCorrectEntry(db, manual.journalEntryId)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.canCorrect).toBe(true)
  })

  it('canCorrectEntry returns false for corrected entry', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')
    createCorrectionEntry(db, { journal_entry_id: manual.journalEntryId, fiscal_year_id: seed.fiscalYearId })

    const result = canCorrectEntry(db, manual.journalEntryId)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.canCorrect).toBe(false)
    expect(result.data.reason).toContain('redan korrigerat')
  })

  it('canCorrectEntry returns false for non-existent entry', () => {
    seedBase(db)
    const result = canCorrectEntry(db, 99999)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.canCorrect).toBe(false)
  })

  // === Atomicity ===

  it('atomic: full rollback on error (simulated by closed FY)', () => {
    const seed = seedBase(db)
    const manual = bookManualEntry(db, seed, '2026-03-01')

    // Close the FY to make the correction fail
    db.prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(seed.fiscalYearId)

    const before = db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get() as { cnt: number }

    const result = createCorrectionEntry(db, {
      journal_entry_id: manual.journalEntryId,
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(false)

    // No new entries should have been created
    const after = db.prepare('SELECT COUNT(*) as cnt FROM journal_entries').get() as { cnt: number }
    expect(after.cnt).toBe(before.cnt)

    // Original should still be booked (not corrected)
    const original = getEntry(db, manual.journalEntryId)
    expect(original.status).toBe('booked')
    expect(original.corrected_by_id).toBeNull()
  })
})
