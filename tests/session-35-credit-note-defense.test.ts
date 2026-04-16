/**
 * Session 35 — Credit note defense tests (M137/M138/M139)
 *
 * Complements session-credit-note.test.ts and session-expense-credit-note.test.ts
 * with deeper coverage: sign-flip arithmetic, 4-layer defense, cross-reference,
 * and expense parity.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  createCreditNoteDraft,
} from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  createExpenseCreditNoteDraft,
} from '../src/main/services/expense-service'

let db: Database.Database
let fyId: number
let vatCodeOutId: number
let vatCodeInId: number

function seedBase() {
  createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2026-01-15',
    fiscal_year_start: '2026-01-01',
    fiscal_year_end: '2026-12-31',
  })
  fyId = (db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }).id
  vatCodeOutId = (db.prepare("SELECT id FROM vat_codes WHERE code = 'MP1'").get() as { id: number }).id
  vatCodeInId = (db.prepare("SELECT id FROM vat_codes WHERE code = 'IP1'").get() as { id: number }).id
}

function makeCustomer(name: string): number {
  const r = createCounterparty(db, { name, type: 'customer' })
  if (!r.success) throw new Error(r.error)
  return r.data.id
}

function makeSupplier(name: string): number {
  const r = createCounterparty(db, { name, type: 'supplier' })
  if (!r.success) throw new Error(r.error)
  return r.data.id
}

function makeInvoice(customerId: number, date: string): number {
  const draft = saveDraft(db, {
    counterparty_id: customerId,
    fiscal_year_id: fyId,
    invoice_date: date,
    due_date: '2026-04-30',
    lines: [{
      product_id: null, description: 'Tjänst', quantity: 1,
      unit_price_ore: 10000, vat_code_id: vatCodeOutId, sort_order: 0, account_number: '3002',
    }],
  })
  if (!draft.success) throw new Error(draft.error)
  const fin = finalizeDraft(db, draft.data.id)
  if (!fin.success) throw new Error(fin.error)
  return draft.data.id
}

function makeExpense(supplierId: number, date: string): number {
  const draft = saveExpenseDraft(db, {
    fiscal_year_id: fyId,
    counterparty_id: supplierId,
    expense_date: date,
    due_date: '2026-04-30',
    description: 'Testkostnad',
    lines: [{
      description: 'Material', account_number: '6110', quantity: 1,
      unit_price_ore: 10000, vat_code_id: vatCodeInId,
    }],
  })
  if (!draft.success) throw new Error(draft.error)
  const fin = finalizeExpense(db, draft.data.id)
  if (!fin.success) throw new Error(fin.error)
  return draft.data.id
}

function getJE(invOrExpId: number, table: 'invoices' | 'expenses') {
  const row = db.prepare(`SELECT journal_entry_id FROM ${table} WHERE id = ?`).get(invOrExpId) as { journal_entry_id: number }
  return db.prepare('SELECT * FROM journal_entries WHERE id = ?').get(row.journal_entry_id) as {
    id: number; description: string; verification_series: string; verification_number: number
  }
}

function getLines(jeId: number) {
  return db.prepare(`
    SELECT account_number, debit_ore, credit_ore
    FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number
  `).all(jeId) as Array<{ account_number: string; debit_ore: number; credit_ore: number }>
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
  db = createTestDb()
  seedBase()
})

afterEach(() => {
  db.close()
  vi.useRealTimers()
})

// ── Invoice credit note ──────────────────────────────────────────────

describe('Invoice credit note — sign-flip (M137)', () => {
  it('credit note JE has identical amounts with inverted D/K per account', () => {
    const custId = makeCustomer('Kund A')
    const invId = makeInvoice(custId, '2026-03-15')
    const origLines = getLines(getJE(invId, 'invoices').id)

    const cn = createCreditNoteDraft(db, { original_invoice_id: invId, fiscal_year_id: fyId })
    expect(cn.success).toBe(true)
    if (!cn.success) return
    finalizeDraft(db, cn.data.id)

    const cnLines = getLines(getJE(cn.data.id, 'invoices').id)

    for (const orig of origLines) {
      const cnLine = cnLines.find(l => l.account_number === orig.account_number)
      expect(cnLine).toBeDefined()
      if (!cnLine) continue
      expect(cnLine.debit_ore).toBe(orig.credit_ore)
      expect(cnLine.credit_ore).toBe(orig.debit_ore)
    }
  })

  it('no negative amounts in credit note JE', () => {
    const custId = makeCustomer('Kund B')
    const invId = makeInvoice(custId, '2026-03-15')

    const cn = createCreditNoteDraft(db, { original_invoice_id: invId, fiscal_year_id: fyId })
    expect(cn.success).toBe(true)
    if (!cn.success) return
    finalizeDraft(db, cn.data.id)

    for (const line of getLines(getJE(cn.data.id, 'invoices').id)) {
      expect(line.debit_ore).toBeGreaterThanOrEqual(0)
      expect(line.credit_ore).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('Invoice credit note — 4-layer defense (M138)', () => {
  it('second credit note on same invoice blocked', () => {
    const custId = makeCustomer('Kund C')
    const invId = makeInvoice(custId, '2026-03-15')

    const cn1 = createCreditNoteDraft(db, { original_invoice_id: invId, fiscal_year_id: fyId })
    expect(cn1.success).toBe(true)
    if (!cn1.success) return
    finalizeDraft(db, cn1.data.id)

    const cn2 = createCreditNoteDraft(db, { original_invoice_id: invId, fiscal_year_id: fyId })
    expect(cn2.success).toBe(false)
  })

  it('credit note on credit note blocked', () => {
    const custId = makeCustomer('Kund D')
    const invId = makeInvoice(custId, '2026-03-15')

    const cn = createCreditNoteDraft(db, { original_invoice_id: invId, fiscal_year_id: fyId })
    expect(cn.success).toBe(true)
    if (!cn.success) return
    finalizeDraft(db, cn.data.id)

    const cn2 = createCreditNoteDraft(db, { original_invoice_id: cn.data.id, fiscal_year_id: fyId })
    expect(cn2.success).toBe(false)
  })

  it('credits_invoice_id populated on credit note', () => {
    const custId = makeCustomer('Kund E')
    const invId = makeInvoice(custId, '2026-03-15')

    const cn = createCreditNoteDraft(db, { original_invoice_id: invId, fiscal_year_id: fyId })
    expect(cn.success).toBe(true)
    if (!cn.success) return

    const row = db.prepare('SELECT credits_invoice_id, invoice_type FROM invoices WHERE id = ?')
      .get(cn.data.id) as { credits_invoice_id: number; invoice_type: string }
    expect(row.credits_invoice_id).toBe(invId)
    expect(row.invoice_type).toBe('credit_note')
  })

  it('has_credit_note flag set on original', () => {
    const custId = makeCustomer('Kund F')
    const invId = makeInvoice(custId, '2026-03-15')

    const cn = createCreditNoteDraft(db, { original_invoice_id: invId, fiscal_year_id: fyId })
    expect(cn.success).toBe(true)
    if (!cn.success) return
    finalizeDraft(db, cn.data.id)

    const row = db.prepare(`
      SELECT (SELECT 1 FROM invoices cn WHERE cn.credits_invoice_id = i.id LIMIT 1) as hcn
      FROM invoices i WHERE i.id = ?
    `).get(invId) as { hcn: number | null }
    expect(row.hcn).toBe(1)
  })
})

describe('Invoice credit note — cross-reference (M139)', () => {
  it('JE description contains original invoice number', () => {
    const custId = makeCustomer('Kund G')
    const invId = makeInvoice(custId, '2026-03-15')
    const origNum = (db.prepare('SELECT invoice_number FROM invoices WHERE id = ?').get(invId) as { invoice_number: string }).invoice_number

    const cn = createCreditNoteDraft(db, { original_invoice_id: invId, fiscal_year_id: fyId })
    expect(cn.success).toBe(true)
    if (!cn.success) return
    finalizeDraft(db, cn.data.id)

    const je = getJE(cn.data.id, 'invoices')
    expect(je.description).toContain(`faktura #${origNum}`)
  })

  it('JE description contains counterparty name', () => {
    const custId = makeCustomer('CrossRef AB')
    const invId = makeInvoice(custId, '2026-03-15')

    const cn = createCreditNoteDraft(db, { original_invoice_id: invId, fiscal_year_id: fyId })
    expect(cn.success).toBe(true)
    if (!cn.success) return
    finalizeDraft(db, cn.data.id)

    expect(getJE(cn.data.id, 'invoices').description).toContain('CrossRef AB')
  })
})

// ── Expense credit note (parity) ────────────────────────────────────

describe('Expense credit note — sign-flip (M137 parity)', () => {
  it('credit note JE has inverted D/K per account', () => {
    const suppId = makeSupplier('Lev A')
    const expId = makeExpense(suppId, '2026-03-15')
    const origLines = getLines(getJE(expId, 'expenses').id)

    const cn = createExpenseCreditNoteDraft(db, { original_expense_id: expId, fiscal_year_id: fyId })
    expect(cn.success).toBe(true)
    if (!cn.success) return
    finalizeExpense(db, cn.data.id)

    const cnLines = getLines(getJE(cn.data.id, 'expenses').id)

    for (const orig of origLines) {
      const cnLine = cnLines.find(l => l.account_number === orig.account_number)
      expect(cnLine).toBeDefined()
      if (!cnLine) continue
      expect(cnLine.debit_ore).toBe(orig.credit_ore)
      expect(cnLine.credit_ore).toBe(orig.debit_ore)
    }
  })
})

describe('Expense credit note — 4-layer defense (M138 parity)', () => {
  it('second credit note on same expense blocked', () => {
    const suppId = makeSupplier('Lev B')
    const expId = makeExpense(suppId, '2026-03-15')

    const cn1 = createExpenseCreditNoteDraft(db, { original_expense_id: expId, fiscal_year_id: fyId })
    expect(cn1.success).toBe(true)
    if (!cn1.success) return
    finalizeExpense(db, cn1.data.id)

    const cn2 = createExpenseCreditNoteDraft(db, { original_expense_id: expId, fiscal_year_id: fyId })
    expect(cn2.success).toBe(false)
  })

  it('credits_expense_id populated', () => {
    const suppId = makeSupplier('Lev C')
    const expId = makeExpense(suppId, '2026-03-15')

    const cn = createExpenseCreditNoteDraft(db, { original_expense_id: expId, fiscal_year_id: fyId })
    expect(cn.success).toBe(true)
    if (!cn.success) return

    const row = db.prepare('SELECT credits_expense_id, expense_type FROM expenses WHERE id = ?')
      .get(cn.data.id) as { credits_expense_id: number; expense_type: string }
    expect(row.credits_expense_id).toBe(expId)
    expect(row.expense_type).toBe('credit_note')
  })
})

describe('Expense credit note — cross-reference (M139 parity)', () => {
  it('JE description contains counterparty name and reference', () => {
    const suppId = makeSupplier('CrossRef Lev AB')
    const expId = makeExpense(suppId, '2026-03-15')

    const cn = createExpenseCreditNoteDraft(db, { original_expense_id: expId, fiscal_year_id: fyId })
    expect(cn.success).toBe(true)
    if (!cn.success) return
    finalizeExpense(db, cn.data.id)

    const je = getJE(cn.data.id, 'expenses')
    expect(je.description).toContain('CrossRef Lev AB')
    expect(je.description).toContain('avser')
  })
})
