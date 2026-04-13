/**
 * Full-chain regression test — migrations 1→24
 *
 * Runs the complete migration chain against a seeded DB with representative data.
 * Protects against future migrations that break previous assumptions.
 *
 * Seed strategy: service functions called directly with db param (M62 pattern).
 * Inline SQL only for bootstrap (company, FY, periods) and opening_balances
 * (no service exists for direct OB insert without a previous FY).
 */

import { describe, it, expect, afterEach } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import Database from 'better-sqlite3'
import { createCounterparty } from '../../src/main/services/counterparty-service'
import { createProduct } from '../../src/main/services/product-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
  payInvoicesBulk,
} from '../../src/main/services/invoice-service'
import type { BulkPayInvoicesInput } from '../../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  payExpense,
} from '../../src/main/services/expense-service'
import {
  saveManualEntryDraft,
  finalizeManualEntry,
} from '../../src/main/services/manual-entry-service'

let db: Database.Database

afterEach(() => {
  if (db) db.close()
})

describe('Full-chain regression (migrations 1→24)', () => {
  it('seeded data passes all integrity invariants', () => {
    db = createTestDb()

    // === Bootstrap: company, FY, periods, verification sequences ===
    db.exec(`
      INSERT INTO companies (id, org_number, name, fiscal_rule, share_capital, registration_date)
        VALUES (1, '559123-4560', 'Regressions AB', 'K2', 2500000, '2020-01-15');
      INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
        VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
    `)

    // 12 monthly periods
    for (let m = 1; m <= 12; m++) {
      const start = `2026-${String(m).padStart(2, '0')}-01`
      const endDay = new Date(2026, m, 0).getDate()
      const end = `2026-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      db.prepare(
        'INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date) VALUES (1, 1, ?, ?, ?)'
      ).run(m, start, end)
    }

    for (const series of ['A', 'B', 'C', 'O']) {
      db.prepare(
        'INSERT OR IGNORE INTO verification_sequences (fiscal_year_id, series, last_number) VALUES (1, ?, 0)'
      ).run(series)
    }

    // === Seed counterparties ===
    const cust1 = createCounterparty(db, { name: 'Kund Alfa AB', type: 'customer', org_number: null, default_payment_terms: 30 })
    if (!cust1.success) throw new Error(cust1.error)
    const cust2 = createCounterparty(db, { name: 'Kund Beta AB', type: 'customer', org_number: null, default_payment_terms: 30 })
    if (!cust2.success) throw new Error(cust2.error)
    const supp1 = createCounterparty(db, { name: 'Leverantör Gamma AB', type: 'supplier', org_number: null, default_payment_terms: 30 })
    if (!supp1.success) throw new Error(supp1.error)
    const supp2 = createCounterparty(db, { name: 'Leverantör Delta AB', type: 'supplier', org_number: null, default_payment_terms: 30 })
    if (!supp2.success) throw new Error(supp2.error)

    // === Seed products ===
    const serviceAccount = db.prepare("SELECT id FROM accounts WHERE account_number = '3002'").get() as { id: number }
    const goodsAccount = db.prepare("SELECT id FROM accounts WHERE account_number = '3001'").get() as { id: number }
    const vatOut25 = db.prepare("SELECT id FROM vat_codes WHERE code = 'MP1'").get() as { id: number }
    const vatIn25 = db.prepare("SELECT id FROM vat_codes WHERE code = 'IP1'").get() as { id: number }

    const prod1 = createProduct(db, { name: 'Konsulttjänst', default_price_ore: 10000, vat_code_id: vatOut25.id, account_id: serviceAccount.id, article_type: 'service' })
    if (!prod1.success) throw new Error(prod1.error)
    const prod2 = createProduct(db, { name: 'Skruvar', default_price_ore: 5000, vat_code_id: vatOut25.id, account_id: goodsAccount.id, article_type: 'goods' })
    if (!prod2.success) throw new Error(prod2.error)

    // === Invoice 1: finalized + paid with bank fee (product-based line) ===
    const draft1 = saveDraft(db, {
      counterparty_id: cust1.data.id,
      fiscal_year_id: 1,
      invoice_date: '2026-01-15',
      due_date: '2026-02-14',
      lines: [{ product_id: prod1.data.id, description: 'Konsulttjänst', quantity: 2, unit_price_ore: 10000, vat_code_id: vatOut25.id, sort_order: 0, account_number: null }],
    })
    if (!draft1.success) throw new Error(draft1.error)
    const fin1 = finalizeDraft(db, draft1.data.id)
    if (!fin1.success) throw new Error(fin1.error)

    const inv1Total = (db.prepare('SELECT total_amount_ore FROM invoices WHERE id = ?').get(draft1.data.id) as { total_amount_ore: number }).total_amount_ore
    const pay1 = payInvoice(db, { invoice_id: draft1.data.id, amount_ore: inv1Total, payment_date: '2026-01-20', payment_method: 'bank', account_number: '1930', bank_fee_ore: 500 })
    if (!pay1.success) throw new Error(pay1.error)

    // === Invoice 2: draft with freeform line ===
    const draft2 = saveDraft(db, {
      counterparty_id: cust2.data.id,
      fiscal_year_id: 1,
      invoice_date: '2026-02-01',
      due_date: '2026-03-03',
      lines: [{ product_id: null, description: 'Freeform-tjänst', quantity: 1, unit_price_ore: 8000, vat_code_id: vatOut25.id, sort_order: 0, account_number: '3002' }],
    })
    if (!draft2.success) throw new Error(draft2.error)

    // === Invoices 3 & 4: for bulk payment ===
    const draft3 = saveDraft(db, {
      counterparty_id: cust1.data.id,
      fiscal_year_id: 1,
      invoice_date: '2026-02-10',
      due_date: '2026-03-12',
      lines: [{ product_id: null, description: 'Bulk-tjänst A', quantity: 1, unit_price_ore: 6000, vat_code_id: vatOut25.id, sort_order: 0, account_number: '3002' }],
    })
    if (!draft3.success) throw new Error(draft3.error)
    const fin3 = finalizeDraft(db, draft3.data.id)
    if (!fin3.success) throw new Error(fin3.error)

    const draft4 = saveDraft(db, {
      counterparty_id: cust1.data.id,
      fiscal_year_id: 1,
      invoice_date: '2026-02-10',
      due_date: '2026-03-12',
      lines: [{ product_id: null, description: 'Bulk-tjänst B', quantity: 1, unit_price_ore: 4000, vat_code_id: vatOut25.id, sort_order: 0, account_number: '3002' }],
    })
    if (!draft4.success) throw new Error(draft4.error)
    const fin4 = finalizeDraft(db, draft4.data.id)
    if (!fin4.success) throw new Error(fin4.error)

    const inv3Total = (db.prepare('SELECT total_amount_ore FROM invoices WHERE id = ?').get(draft3.data.id) as { total_amount_ore: number }).total_amount_ore
    const inv4Total = (db.prepare('SELECT total_amount_ore FROM invoices WHERE id = ?').get(draft4.data.id) as { total_amount_ore: number }).total_amount_ore

    const bulkResult = payInvoicesBulk(db, {
      payments: [
        { invoice_id: draft3.data.id, amount_ore: inv3Total },
        { invoice_id: draft4.data.id, amount_ore: inv4Total },
      ],
      payment_date: '2026-02-20',
      account_number: '1930',
      bank_fee_ore: 300,
    })
    if (!bulkResult.success) throw new Error(bulkResult.error)

    // === Expense 1: finalized + paid ===
    const expDraft1 = saveExpenseDraft(db, {
      fiscal_year_id: 1,
      counterparty_id: supp1.data.id,
      expense_date: '2026-01-10',
      due_date: '2026-02-10',
      description: 'Kontorsmaterial',
      lines: [{ description: 'Pennor', account_number: '6110', quantity: 1, unit_price_ore: 15000, vat_code_id: vatIn25.id }],
    })
    if (!expDraft1.success) throw new Error(expDraft1.error)
    const expFin1 = finalizeExpense(db, expDraft1.data.id)
    if (!expFin1.success) throw new Error(expFin1.error)

    const exp1Total = (db.prepare('SELECT total_amount_ore FROM expenses WHERE id = ?').get(expDraft1.data.id) as { total_amount_ore: number }).total_amount_ore
    const expPay1 = payExpense(db, { expense_id: expDraft1.data.id, amount_ore: exp1Total, payment_date: '2026-01-25', payment_method: 'bank', account_number: '1930' })
    if (!expPay1.success) throw new Error(expPay1.error)

    // === Manual entry (finalized) ===
    const meDraft = saveManualEntryDraft(db, {
      fiscal_year_id: 1,
      entry_date: '2026-01-31',
      description: 'Periodisering',
      lines: [
        { account_number: '1790', debit_ore: 5000, credit_ore: 0, description: 'Förutbetald kostnad' },
        { account_number: '6110', debit_ore: 0, credit_ore: 5000, description: 'Kontorsmaterial' },
      ],
    })
    if (!meDraft.success) throw new Error(meDraft.error)
    const meFin = finalizeManualEntry(db, meDraft.data.id, 1)
    if (!meFin.success) throw new Error(meFin.error)

    // === Opening balance (direct SQL — no service for standalone OB insert) ===
    db.exec(`
      INSERT INTO opening_balances (fiscal_year_id, account_number, balance_ore)
        VALUES (1, '1930', 100000), (1, '2081', -100000);
    `)

    // ================================================================
    // VERIFICATION BLOCK
    // ================================================================

    // 1. PRAGMA foreign_key_check — no FK violations
    const fkCheck = db.pragma('foreign_key_check') as unknown[]
    expect(fkCheck, 'FK violations found').toHaveLength(0)

    // 2. PRAGMA integrity_check — database is consistent
    const integrityResult = db.pragma('integrity_check', { simple: true }) as string
    expect(integrityResult).toBe('ok')

    // 3. Trigger count = 12 (backstop — primary owner is trigger-inventory.test.ts)
    const triggerCount = (db.prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'").get() as { cnt: number }).cnt
    expect(triggerCount).toBe(12)

    // 4. All journal_entries balance (SUM debit = SUM credit per entry)
    const unbalanced = db.prepare(`
      SELECT je.id, SUM(jel.debit_ore) as total_debit, SUM(jel.credit_ore) as total_credit
      FROM journal_entries je
      JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
      GROUP BY je.id
      HAVING SUM(jel.debit_ore) != SUM(jel.credit_ore)
    `).all()
    expect(unbalanced, 'Unbalanced journal entries found').toHaveLength(0)

    // 5. paid_amount_ore on invoices matches SUM of payments.amount_ore (M101)
    const invoicePaidMismatch = db.prepare(`
      SELECT i.id, i.paid_amount_ore, COALESCE(SUM(ip.amount_ore), 0) as sum_payments
      FROM invoices i
      LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
      GROUP BY i.id
      HAVING i.paid_amount_ore != COALESCE(SUM(ip.amount_ore), 0)
    `).all()
    expect(invoicePaidMismatch, 'Invoice paid_amount_ore mismatch').toHaveLength(0)

    // 6. paid_amount_ore on expenses matches SUM of payments.amount_ore (M101)
    const expensePaidMismatch = db.prepare(`
      SELECT e.id, e.paid_amount_ore, COALESCE(SUM(ep.amount_ore), 0) as sum_payments
      FROM expenses e
      LEFT JOIN expense_payments ep ON ep.expense_id = e.id
      GROUP BY e.id
      HAVING e.paid_amount_ore != COALESCE(SUM(ep.amount_ore), 0)
    `).all()
    expect(expensePaidMismatch, 'Expense paid_amount_ore mismatch').toHaveLength(0)

    // 7. M123 invariant: no finalized invoice_lines with product_id IS NULL AND account_number IS NULL
    const m123Violations = db.prepare(`
      SELECT il.id
      FROM invoice_lines il
      JOIN invoices i ON i.id = il.invoice_id
      WHERE i.status != 'draft'
        AND il.product_id IS NULL
        AND il.account_number IS NULL
    `).all()
    expect(m123Violations, 'M123 violation: freeform line without account_number on finalized invoice').toHaveLength(0)
  })
})
