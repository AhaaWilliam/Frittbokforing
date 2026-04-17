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
import { unmatchBankTransaction } from '../src/main/services/bank/bank-unmatch-service'
import { _createBankFeeEntryTx } from '../src/main/services/bank/bank-fee-entry-service'
import { createCorrectionEntry } from '../src/main/services/correction-service'

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
    INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Unmatch AB', 'K2');
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
    name: 'Kund',
    type: 'customer',
    org_number: null,
    default_payment_terms: 30,
  })
  if (!cust.success) throw new Error(cust.error)
  const supp = createCounterparty(db, {
    name: 'Lev',
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

function createUnpaidInvoice(db: Database.Database, s: Seeded, netOre: number): { id: number; totalOre: number } {
  const draft = saveInvoiceDraft(db, {
    counterparty_id: s.custId,
    fiscal_year_id: s.fyId,
    invoice_date: '2026-03-01',
    due_date: '2026-03-31',
    lines: [
      {
        product_id: null,
        description: 'Tj',
        quantity: 1,
        unit_price_ore: netOre,
        vat_code_id: s.vatOutId,
        sort_order: 0,
        account_number: '3001',
      },
    ],
  })
  if (!draft.success) throw new Error(draft.error)
  const fin = finalizeInvoice(db, draft.data.id)
  if (!fin.success) throw new Error(fin.error)
  const row = db.prepare('SELECT total_amount_ore FROM invoices WHERE id=?').get(draft.data.id) as { total_amount_ore: number }
  return { id: draft.data.id, totalOre: row.total_amount_ore }
}

function createUnpaidExpense(db: Database.Database, s: Seeded, netOre: number): { id: number; totalOre: number } {
  const draft = saveExpenseDraft(db, {
    fiscal_year_id: s.fyId,
    counterparty_id: s.suppId,
    expense_date: '2026-03-01',
    due_date: '2026-03-31',
    description: 'Utg',
    lines: [
      { description: 'Pennor', account_number: '6110', quantity: 1, unit_price_ore: netOre, vat_code_id: s.vatInId },
    ],
  })
  if (!draft.success) throw new Error(draft.error)
  const fin = finalizeExpense(db, draft.data.id)
  if (!fin.success) throw new Error(fin.error)
  const row = db.prepare('SELECT total_amount_ore FROM expenses WHERE id=?').get(draft.data.id) as { total_amount_ore: number }
  return { id: draft.data.id, totalOre: row.total_amount_ore }
}

function insertBankTx(
  db: Database.Database,
  s: Seeded,
  amountOre: number,
  valueDate = '2026-03-15',
): number {
  const stmtRes = db
    .prepare(
      `INSERT INTO bank_statements (company_id, fiscal_year_id, statement_number, bank_account_iban,
         statement_date, opening_balance_ore, closing_balance_ore, source_format, import_file_hash)
       VALUES (?, ?, 'STMT', 'SE4550000000058398257466', ?, 0, ?, 'camt.053', ?)`,
    )
    .run(s.companyId, s.fyId, valueDate, amountOre, `h-${valueDate}-${amountOre}-${Math.random()}`)
  const txRes = db
    .prepare(
      `INSERT INTO bank_transactions (bank_statement_id, booking_date, value_date, amount_ore)
       VALUES (?, ?, ?, ?)`,
    )
    .run(Number(stmtRes.lastInsertRowid), valueDate, valueDate, amountOre)
  return Number(txRes.lastInsertRowid)
}

describe('S58 C1 — bank-unmatch-service', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  // Prereq-smoke: verifiera att createCorrectionEntry fungerar mot payment-verifikat
  // EFTER att payment-raden raderats (vår nödvändiga arbetsflödes-ordning)
  it('0 (prereq). createCorrectionEntry mot payment-JE passerar guards när payment-raden är borta', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 10_000)
    const txId = insertBankTx(db, s, inv.totalOre)
    const match = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.id,
      payment_account: '1930',
    })
    if (!match.success) throw new Error(match.error)
    const paymentId = match.data.payment_id
    const jeId = match.data.journal_entry_id

    // Radera först reconciliation + payment (frigör FK + guard)
    db.prepare('DELETE FROM bank_reconciliation_matches WHERE bank_transaction_id = ?').run(txId)
    db.prepare('DELETE FROM invoice_payments WHERE id = ?').run(paymentId)

    // Nu ska correction gå igenom
    const corr = createCorrectionEntry(db, { journal_entry_id: jeId, fiscal_year_id: s.fyId })
    expect(corr.success).toBe(true)
    if (!corr.success) return
    expect(corr.data.correction_entry_id).toBeGreaterThan(0)
  })

  it('1. Unmatch invoice-match → korrigeringsverifikat + payment borta + paid_amount=0 + status=unpaid + TX=unmatched', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 10_000)
    const txId = insertBankTx(db, s, inv.totalOre)
    const match = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.id,
      payment_account: '1930',
    })
    if (!match.success) throw new Error(match.error)

    // Verifiera pre-state
    const preInvoice = db.prepare('SELECT paid_amount_ore, status FROM invoices WHERE id=?').get(inv.id) as { paid_amount_ore: number; status: string }
    expect(preInvoice.paid_amount_ore).toBe(inv.totalOre)
    expect(preInvoice.status).toBe('paid')

    // Unmatch
    const unmatch = unmatchBankTransaction(db, { bank_transaction_id: txId })
    expect(unmatch.success).toBe(true)
    if (!unmatch.success) return
    expect(unmatch.data.correction_journal_entry_id).toBeGreaterThan(0)
    expect(unmatch.data.unmatched_payment_id).toBe(match.data.payment_id)

    // Payment borta
    const payment = db.prepare('SELECT 1 FROM invoice_payments WHERE id=?').get(match.data.payment_id)
    expect(payment).toBeUndefined()

    // Reconciliation borta
    const rec = db.prepare('SELECT 1 FROM bank_reconciliation_matches WHERE bank_transaction_id=?').get(txId)
    expect(rec).toBeUndefined()

    // Invoice paid_amount=0, status=unpaid
    const postInvoice = db.prepare('SELECT paid_amount_ore, status FROM invoices WHERE id=?').get(inv.id) as { paid_amount_ore: number; status: string }
    expect(postInvoice.paid_amount_ore).toBe(0)
    expect(postInvoice.status).toBe('unpaid')

    // TX unmatched
    const tx = db.prepare('SELECT reconciliation_status FROM bank_transactions WHERE id=?').get(txId) as { reconciliation_status: string }
    expect(tx.reconciliation_status).toBe('unmatched')

    // Korrigeringsverifikat finns i C-serie
    const corr = db.prepare('SELECT verification_series FROM journal_entries WHERE id=?').get(unmatch.data.correction_journal_entry_id) as { verification_series: string }
    expect(corr.verification_series).toBe('C')
  })

  it('2. Unmatch expense-match → motsvarande flöde för expense', () => {
    const s = seed(db)
    const exp = createUnpaidExpense(db, s, 5_000)
    const txId = insertBankTx(db, s, -exp.totalOre)
    const match = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'expense',
      matched_entity_id: exp.id,
      payment_account: '1930',
    })
    if (!match.success) throw new Error(match.error)

    const unmatch = unmatchBankTransaction(db, { bank_transaction_id: txId })
    expect(unmatch.success).toBe(true)
    if (!unmatch.success) return

    const post = db.prepare('SELECT paid_amount_ore, status FROM expenses WHERE id=?').get(exp.id) as { paid_amount_ore: number; status: string }
    expect(post.paid_amount_ore).toBe(0)
    expect(post.status).toBe('unpaid')

    const payment = db.prepare('SELECT 1 FROM expense_payments WHERE id=?').get(match.data.payment_id)
    expect(payment).toBeUndefined()
  })

  it('3. Unmatch fee-match → korrigeringsverifikat + ingen paid_amount-påverkan', () => {
    const s = seed(db)
    const txId = insertBankTx(db, s, -5_000)
    const feeResult = db.transaction(() =>
      _createBankFeeEntryTx(db, {
        bank_transaction_id: txId,
        classification: {
          type: 'bank_fee',
          account: '6570',
          series: 'B',
          score: 100,
          confidence: 'HIGH',
          reasons: ['CHRG'],
          method: 'auto_fee',
        },
        payment_account: '1930',
      }),
    )()

    const unmatch = unmatchBankTransaction(db, { bank_transaction_id: txId })
    expect(unmatch.success).toBe(true)
    if (!unmatch.success) return
    expect(unmatch.data.unmatched_fee_entry_id).toBe(feeResult.journal_entry_id)
    expect(unmatch.data.unmatched_payment_id).toBeNull()

    const rec = db.prepare('SELECT 1 FROM bank_reconciliation_matches WHERE bank_transaction_id=?').get(txId)
    expect(rec).toBeUndefined()

    const tx = db.prepare('SELECT reconciliation_status FROM bank_transactions WHERE id=?').get(txId) as { reconciliation_status: string }
    expect(tx.reconciliation_status).toBe('unmatched')
  })

  it('4. Unmatch av redan unmatchad TX → NOT_MATCHED', () => {
    const s = seed(db)
    const txId = insertBankTx(db, s, 10_000)
    const result = unmatchBankTransaction(db, { bank_transaction_id: txId })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('NOT_MATCHED')
  })

  it('5. Unmatch av batch-payment → BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 10_000)
    const txId = insertBankTx(db, s, inv.totalOre)
    const match = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.id,
      payment_account: '1930',
    })
    if (!match.success) throw new Error(match.error)

    // Injicera en payment_batch_id manuellt
    const batchRes = db
      .prepare(
        `INSERT INTO payment_batches (fiscal_year_id, batch_type, payment_date, account_number, status)
         VALUES (?, 'invoice', '2026-03-15', '1930', 'completed')`,
      )
      .run(s.fyId)
    db.prepare('UPDATE invoice_payments SET payment_batch_id = ? WHERE id = ?').run(Number(batchRes.lastInsertRowid), match.data.payment_id)

    const result = unmatchBankTransaction(db, { bank_transaction_id: txId })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED')
  })

  it('6. Unmatch i stängd period → PERIOD_CLOSED', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 10_000)
    const txId = insertBankTx(db, s, inv.totalOre, '2026-03-15')
    const match = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.id,
      payment_account: '1930',
    })
    if (!match.success) throw new Error(match.error)

    // Stäng mars
    db.prepare('UPDATE accounting_periods SET is_closed = 1 WHERE period_number = 3 AND fiscal_year_id = ?').run(s.fyId)

    const result = unmatchBankTransaction(db, { bank_transaction_id: txId })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('PERIOD_CLOSED')
  })

  it('7. Unmatch av redan-korrigerat fee-verifikat → ENTRY_ALREADY_CORRECTED', () => {
    // Vi använder fee-match (ingen payment → trg_no_correct_with_payments gäller inte)
    // så vi kan markera JE:n som corrected manuellt utan att trigger-blockeras.
    const s = seed(db)
    const txId = insertBankTx(db, s, -5_000)
    const feeResult = db.transaction(() =>
      _createBankFeeEntryTx(db, {
        bank_transaction_id: txId,
        classification: {
          type: 'bank_fee',
          account: '6570',
          series: 'B',
          score: 100,
          confidence: 'HIGH',
          reasons: ['CHRG'],
          method: 'auto_fee',
        },
        payment_account: '1930',
      }),
    )()

    // Markera fee-JE som redan korrigerad (legitimt scenario: någon har kört manuell C-serie på den)
    db.prepare(
      "UPDATE journal_entries SET corrected_by_id = id, status = 'corrected' WHERE id = ?",
    ).run(feeResult.journal_entry_id)

    const result = unmatchBankTransaction(db, { bank_transaction_id: txId })
    expect(result.success).toBe(false)
    if (result.success) return
    expect(result.code).toBe('ENTRY_ALREADY_CORRECTED')
  })

  it('8. Atomicitet: om createCorrectionEntry failar → allt rullas tillbaka', () => {
    const s = seed(db)
    const inv = createUnpaidInvoice(db, s, 10_000)
    const txId = insertBankTx(db, s, inv.totalOre)
    const match = matchBankTransaction(db, {
      bank_transaction_id: txId,
      matched_entity_type: 'invoice',
      matched_entity_id: inv.id,
      payment_account: '1930',
    })
    if (!match.success) throw new Error(match.error)

    // Stäng hela FY så correction-service avvisar med YEAR_IS_CLOSED
    db.prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?').run(s.fyId)

    const result = unmatchBankTransaction(db, { bank_transaction_id: txId })
    expect(result.success).toBe(false)

    // Öppna FY igen för verifiering
    db.prepare('UPDATE fiscal_years SET is_closed = 0 WHERE id = ?').run(s.fyId)

    // State ska vara oförändrat
    const payment = db.prepare('SELECT 1 FROM invoice_payments WHERE id=?').get(match.data.payment_id)
    expect(payment).toBeDefined() // payment-raden ska finnas kvar

    const rec = db.prepare('SELECT 1 FROM bank_reconciliation_matches WHERE bank_transaction_id=?').get(txId)
    expect(rec).toBeDefined() // reconciliation-raden ska finnas kvar

    const tx = db.prepare('SELECT reconciliation_status FROM bank_transactions WHERE id=?').get(txId) as { reconciliation_status: string }
    expect(tx.reconciliation_status).toBe('matched') // TX ska fortfarande vara matched
  })
})
