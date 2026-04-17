import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft as saveInvoiceDraft,
  finalizeDraft as finalizeInvoice,
} from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
} from '../src/main/services/expense-service'
import { matchBankTransaction } from '../src/main/services/bank/bank-match-service'

interface Seeded {
  companyId: number
  fyId: number
  custId: number
  suppId: number
  vatOutId: number
  vatInId: number
}

function seed(db: Database.Database): Seeded {
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule)
      VALUES (1, '559000-1234', 'Match AB', 'K2');
    INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
  `)
  for (let m = 1; m <= 12; m++) {
    const start = `2026-${String(m).padStart(2, '0')}-01`
    const endDay = new Date(2026, m, 0).getDate()
    const end = `2026-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
    db.prepare(
      'INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date) VALUES (1, 1, ?, ?, ?)',
    ).run(m, start, end)
  }
  const cust = createCounterparty(db, {
    name: 'Kund Alfa AB',
    type: 'customer',
    org_number: null,
    default_payment_terms: 30,
  })
  if (!cust.success) throw new Error(cust.error)
  const supp = createCounterparty(db, {
    name: 'Lev Gamma AB',
    type: 'supplier',
    org_number: null,
    default_payment_terms: 30,
  })
  if (!supp.success) throw new Error(supp.error)
  const vatOut = db.prepare("SELECT id FROM vat_codes WHERE code='MP1'").get() as { id: number }
  const vatIn = db.prepare("SELECT id FROM vat_codes WHERE code='IP1'").get() as { id: number }
  return {
    companyId: 1,
    fyId: 1,
    custId: cust.data.id,
    suppId: supp.data.id,
    vatOutId: vatOut.id,
    vatInId: vatIn.id,
  }
}

function createUnpaidInvoice(db: Database.Database, s: Seeded, totalOre: number): { invoiceId: number; totalOre: number } {
  // unit_price_ore = totalOre / 1.25 (exkl moms 25%); use unit_price_ore s.t. TOTAL matches
  // Använd netto så 25% moms ger rätt total
  const netOre = Math.round(totalOre / 1.25)
  const draft = saveInvoiceDraft(db, {
    counterparty_id: s.custId,
    fiscal_year_id: s.fyId,
    invoice_date: '2026-03-01',
    due_date: '2026-03-31',
    lines: [
      {
        product_id: null,
        description: 'Tjänst',
        quantity: 1,
        unit_price_ore: netOre,
        vat_code_id: s.vatOutId,
        sort_order: 0,
        account_number: '3002',
      },
    ],
  })
  if (!draft.success) throw new Error(draft.error)
  const fin = finalizeInvoice(db, draft.data.id)
  if (!fin.success) throw new Error(fin.error)
  const row = db.prepare('SELECT total_amount_ore FROM invoices WHERE id=?').get(draft.data.id) as { total_amount_ore: number }
  return { invoiceId: draft.data.id, totalOre: row.total_amount_ore }
}

function createUnpaidExpense(db: Database.Database, s: Seeded): { expenseId: number; totalOre: number } {
  const draft = saveExpenseDraft(db, {
    fiscal_year_id: s.fyId,
    counterparty_id: s.suppId,
    expense_date: '2026-03-05',
    due_date: '2026-04-05',
    description: 'Kontor',
    lines: [{ description: 'Pennor', account_number: '6110', quantity: 1, unit_price_ore: 100_00, vat_code_id: s.vatInId }],
  })
  if (!draft.success) throw new Error(draft.error)
  const fin = finalizeExpense(db, draft.data.id)
  if (!fin.success) throw new Error(fin.error)
  const row = db.prepare('SELECT total_amount_ore FROM expenses WHERE id=?').get(draft.data.id) as { total_amount_ore: number }
  return { expenseId: draft.data.id, totalOre: row.total_amount_ore }
}

function insertBankTx(db: Database.Database, s: Seeded, amountOre: number, valueDate = '2026-03-15'): number {
  // Create a minimal statement (balance-neutral bypass not needed — we bypass bank-statement-service)
  const stmtRes = db.prepare(
    `INSERT INTO bank_statements (company_id, fiscal_year_id, statement_number, bank_account_iban,
       statement_date, opening_balance_ore, closing_balance_ore, source_format, import_file_hash)
     VALUES (?, ?, 'STMT', 'SE4550000000058398257466', ?, 0, ?, 'camt.053', ?)`,
  ).run(s.companyId, s.fyId, valueDate, amountOre, `h-${Math.random()}`)
  const statementId = Number(stmtRes.lastInsertRowid)
  const txRes = db.prepare(
    `INSERT INTO bank_transactions (bank_statement_id, booking_date, value_date, amount_ore)
     VALUES (?, ?, ?, ?)`,
  ).run(statementId, valueDate, valueDate, amountOre)
  return Number(txRes.lastInsertRowid)
}

describe('S55 A4 — matchBankTransaction', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('1. Invoice full-pay match — payment-rad skapas, status → matched', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 12_500)
    const txId = insertBankTx(db, s, inv.totalOre)
    const result = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.invoiceId,
      payment_account: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.payment_id).toBeGreaterThan(0)
    expect(result.data.journal_entry_id).toBeGreaterThan(0)
    const tx = db.prepare('SELECT reconciliation_status FROM bank_transactions WHERE id=?').get(txId) as { reconciliation_status: string }
    expect(tx.reconciliation_status).toBe('matched')
    const matchRow = db.prepare('SELECT * FROM bank_reconciliation_matches WHERE bank_transaction_id=?').get(txId) as { invoice_payment_id: number | null; expense_payment_id: number | null; match_method: string }
    expect(matchRow.invoice_payment_id).toBe(result.data.payment_id)
    expect(matchRow.expense_payment_id).toBeNull()
    expect(matchRow.match_method).toBe('manual')
  })

  it('2. Invoice partial-pay match — status=partial', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 12_500)
    const txId = insertBankTx(db, s, Math.floor(inv.totalOre / 2))
    const result = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.invoiceId,
      payment_account: '1930',
    })
    expect(result.success).toBe(true)
    const status = db.prepare('SELECT status FROM invoices WHERE id=?').get(inv.invoiceId) as { status: string }
    expect(status.status).toBe('partial')
  })

  it('3. Öresutjämning (diff ≤ 50 öre → M99) triggas korrekt', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 12_500)
    // Betala 30 öre mindre än total — inom 50-öres-threshold
    const txId = insertBankTx(db, s, inv.totalOre - 30)
    const result = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.invoiceId,
      payment_account: '1930',
    })
    expect(result.success).toBe(true)
    // 3740 (öresutjämning) ska finnas i verifikatet
    if (!result.success) return
    const rounding = db.prepare(
      "SELECT COUNT(*) as c FROM journal_entry_lines WHERE journal_entry_id=? AND account_number='3740'",
    ).get(result.data.journal_entry_id) as { c: number }
    expect(rounding.c).toBeGreaterThan(0)
  })

  it('4. Expense match med negativ TX — payment-rad skapas', () => {
    const s = seed(db)
    const exp = createUnpaidExpense(db, s)
    const txId = insertBankTx(db, s, -exp.totalOre)
    const result = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'expense',
      matched_entity_id: exp.expenseId,
      payment_account: '1930',
    })
    expect(result.success).toBe(true)
    if (!result.success) return
    const matchRow = db.prepare('SELECT * FROM bank_reconciliation_matches WHERE bank_transaction_id=?').get(txId) as { expense_payment_id: number | null; invoice_payment_id: number | null }
    expect(matchRow.expense_payment_id).toBe(result.data.payment_id)
    expect(matchRow.invoice_payment_id).toBeNull()
  })

  it('5. Direction-guard: +TX mot expense → VALIDATION_ERROR', () => {
    const s = seed(db)
    const exp = createUnpaidExpense(db, s)
    const txId = insertBankTx(db, s, 5000)
    const result = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'expense',
      matched_entity_id: exp.expenseId,
      payment_account: '1930',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.field).toBe('matched_entity_type')
    }
  })

  it('6. Direction-guard: −TX mot invoice → VALIDATION_ERROR', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 12_500)
    const txId = insertBankTx(db, s, -5000)
    const result = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.invoiceId,
      payment_account: '1930',
    })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.field).toBe('matched_entity_type')
  })

  it('7. Already-matched TX avvisas', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 12_500)
    const txId = insertBankTx(db, s, inv.totalOre)
    const first = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.invoiceId,
      payment_account: '1930',
    })
    expect(first.success).toBe(true)
    // Andra försök
    const second = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.invoiceId,
      payment_account: '1930',
    })
    expect(second.success).toBe(false)
    if (!second.success) expect(second.code).toBe('VALIDATION_ERROR')
  })
})
