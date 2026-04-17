/**
 * Sprint 56 C1: pagination för listInvoices + listExpenses.
 * 5 unit-tester: limit/offset slices, total_items reflekterar filter,
 * counts oförändrat (FY-totalt), drift-test mellan total_items och items.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft as saveInvoiceDraft,
  finalizeDraft as finalizeInvoice,
  listInvoices,
} from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  listExpenses,
} from '../src/main/services/expense-service'

interface Seeded {
  fyId: number
  custId: number
  suppId: number
  vatOutId: number
  vatInId: number
}

function seed(db: Database.Database): Seeded {
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule)
      VALUES (1, '559000-1234', 'Pag AB', 'K2');
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
    name: 'Kund AB', type: 'customer', org_number: null, default_payment_terms: 30,
  })
  if (!cust.success) throw new Error(cust.error)
  const supp = createCounterparty(db, {
    name: 'Lev AB', type: 'supplier', org_number: null, default_payment_terms: 30,
  })
  if (!supp.success) throw new Error(supp.error)
  const vatOut = db.prepare("SELECT id FROM vat_codes WHERE code='MP1'").get() as { id: number }
  const vatIn = db.prepare("SELECT id FROM vat_codes WHERE code='IP1'").get() as { id: number }
  return { fyId: 1, custId: cust.data.id, suppId: supp.data.id, vatOutId: vatOut.id, vatInId: vatIn.id }
}

function createInvoices(db: Database.Database, s: Seeded, count: number): void {
  for (let i = 0; i < count; i++) {
    const draft = saveInvoiceDraft(db, {
      counterparty_id: s.custId,
      fiscal_year_id: s.fyId,
      invoice_date: '2026-03-01',
      due_date: '2026-03-31',
      lines: [{
        product_id: null,
        description: `Tjänst ${i}`,
        quantity: 1,
        unit_price_ore: 100_00,
        vat_code_id: s.vatOutId,
        sort_order: 0,
        account_number: '3002',
      }],
    })
    if (!draft.success) throw new Error(draft.error)
    const fin = finalizeInvoice(db, draft.data.id)
    if (!fin.success) throw new Error(fin.error)
  }
}

function createExpenses(db: Database.Database, s: Seeded, count: number): void {
  for (let i = 0; i < count; i++) {
    const draft = saveExpenseDraft(db, {
      fiscal_year_id: s.fyId,
      counterparty_id: s.suppId,
      expense_date: '2026-03-05',
      due_date: '2026-04-05',
      description: `Kostnad ${i}`,
      lines: [{
        description: 'Pennor',
        account_number: '6110',
        quantity: 1,
        unit_price_ore: 100_00,
        vat_code_id: s.vatInId,
      }],
    })
    if (!draft.success) throw new Error(draft.error)
    const fin = finalizeExpense(db, draft.data.id)
    if (!fin.success) throw new Error(fin.error)
  }
}

describe('S56 C1: pagination', () => {
  let db: Database.Database
  beforeEach(() => { db = createTestDb() })

  it('1. limit=10 + offset=0 → 10 items', () => {
    const s = seed(db)
    createInvoices(db, s, 25)
    const r = listInvoices(db, { fiscal_year_id: s.fyId, limit: 10, offset: 0 })
    expect(r.items).toHaveLength(10)
    expect(r.total_items).toBe(25)
  })

  it('2. offset=10, limit=10 → items 11–20 (skip first 10)', () => {
    const s = seed(db)
    createInvoices(db, s, 25)
    const all = listInvoices(db, { fiscal_year_id: s.fyId, limit: 50, offset: 0 })
    const page2 = listInvoices(db, { fiscal_year_id: s.fyId, limit: 10, offset: 10 })
    expect(page2.items).toHaveLength(10)
    expect(page2.items[0].id).toBe(all.items[10].id)
    expect(page2.items[9].id).toBe(all.items[19].id)
  })

  it('3. counts[total] oförändrat oavsett pagination (FY-totalt)', () => {
    const s = seed(db)
    createInvoices(db, s, 25)
    const r1 = listInvoices(db, { fiscal_year_id: s.fyId, limit: 5, offset: 0 })
    const r2 = listInvoices(db, { fiscal_year_id: s.fyId, limit: 50, offset: 0 })
    expect(r1.counts.total).toBe(25)
    expect(r2.counts.total).toBe(25)
    expect(r1.counts.total).toBe(r2.counts.total)
  })

  it('4. V5 invariant: total_items === items.length när total ≤ limit', () => {
    const s = seed(db)
    createInvoices(db, s, 7)
    const r = listInvoices(db, { fiscal_year_id: s.fyId, limit: 50, offset: 0 })
    expect(r.total_items).toBe(7)
    expect(r.items.length).toBe(7)
    expect(r.total_items).toBe(r.items.length)
  })

  it('5. V5 drift-test: total_items reflekterar search-filter (inte FY-totalt)', () => {
    const s = seed(db)
    createInvoices(db, s, 10)
    // Ingen invoice matchar "ZZZ" i nummer eller counterparty-namn
    const r = listInvoices(db, {
      fiscal_year_id: s.fyId,
      search: 'ZZZ',
      limit: 50,
      offset: 0,
    })
    expect(r.total_items).toBe(0)
    expect(r.items).toHaveLength(0)
    // counts oförändrat — visar FY-totalt
    expect(r.counts.total).toBe(10)
  })

  it('6. expense pagination: identisk semantik', () => {
    const s = seed(db)
    createExpenses(db, s, 12)
    const r = listExpenses(db, { fiscal_year_id: s.fyId, limit: 5, offset: 0 })
    expect(r.expenses).toHaveLength(5)
    expect(r.total_items).toBe(12)
    expect(r.counts.total).toBe(12)
  })
})
