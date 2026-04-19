/**
 * Sprint MC3 — Stamdata-scoping per bolag (M145)
 *
 * Verifierar att counterparties/products/price_lists scopas korrekt per
 * bolag och att defense-in-depth-triggers fångar cross-bolag-överträdelser.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import {
  listCounterparties,
  createCounterparty,
  getCounterparty,
} from '../src/main/services/counterparty-service'
import {
  listProducts,
  createProduct,
  setCustomerPrice,
  getPriceForCustomer,
} from '../src/main/services/product-service'

let db: Database.Database

function makeCompany(name: string, orgNumber: string) {
  const res = createCompany(db, {
    name,
    org_number: orgNumber,
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  if (!res.success) throw new Error(`createCompany failed: ${res.error}`)
  const fy = db
    .prepare('SELECT id FROM fiscal_years WHERE company_id = ?')
    .get(res.data.id) as { id: number }
  return { companyId: res.data.id, fiscalYearId: fy.id }
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

describe('Sprint MC3 — counterparty isolation', () => {
  it('counterparty skapad i bolag A syns inte vid query med company_id = B', () => {
    const a = makeCompany('Bolag A AB', '556036-0793')
    const b = makeCompany('Bolag B AB', '559900-0006')

    const created = createCounterparty(db, {
      company_id: a.companyId,
      name: 'Acme AB',
      type: 'customer',
    })
    expect(created.success).toBe(true)

    const inA = listCounterparties(db, { company_id: a.companyId })
    const inB = listCounterparties(db, { company_id: b.companyId })

    expect(inA.length).toBe(1)
    expect(inA[0].name).toBe('Acme AB')
    expect(inB.length).toBe(0)
  })

  it('getCounterparty med fel company_id returnerar null', () => {
    const a = makeCompany('Bolag A AB', '556036-0793')
    const b = makeCompany('Bolag B AB', '559900-0006')

    const created = createCounterparty(db, {
      company_id: a.companyId,
      name: 'Acme AB',
      type: 'customer',
    })
    if (!created.success) throw new Error(created.error)

    expect(getCounterparty(db, created.data.id, a.companyId)).not.toBeNull()
    expect(getCounterparty(db, created.data.id, b.companyId)).toBeNull()
  })

  it('UNIQUE org_number är per bolag — två bolag kan ha samma kund-org', () => {
    const a = makeCompany('Bolag A AB', '556036-0793')
    const b = makeCompany('Bolag B AB', '559900-0006')

    const inA = createCounterparty(db, {
      company_id: a.companyId,
      name: 'Gemensam Kund AB',
      type: 'customer',
      org_number: '556036-0793',
    })
    const inB = createCounterparty(db, {
      company_id: b.companyId,
      name: 'Gemensam Kund AB',
      type: 'customer',
      org_number: '556036-0793',
    })

    expect(inA.success).toBe(true)
    expect(inB.success).toBe(true)
  })

  it('UNIQUE org_number inom samma bolag avvisas', () => {
    const a = makeCompany('Bolag A AB', '556036-0793')

    createCounterparty(db, {
      company_id: a.companyId,
      name: 'Kund 1',
      type: 'customer',
      org_number: '556036-0793',
    })
    const dup = createCounterparty(db, {
      company_id: a.companyId,
      name: 'Kund 2',
      type: 'customer',
      org_number: '556036-0793',
    })

    expect(dup.success).toBe(false)
    if (!dup.success) {
      expect(dup.code).toBe('DUPLICATE_ORG_NUMBER')
    }
  })
})

describe('Sprint MC3 — product isolation', () => {
  it('product skapad i bolag A syns inte i bolag B', () => {
    const a = makeCompany('Bolag A AB', '556036-0793')
    const b = makeCompany('Bolag B AB', '559900-0006')
    const vatCode = db
      .prepare("SELECT id FROM vat_codes WHERE vat_type = 'outgoing' LIMIT 1")
      .get() as { id: number }
    const account = db
      .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
      .get() as { id: number }

    createProduct(db, {
      company_id: a.companyId,
      name: 'Tjänst A',
      default_price_ore: 100000,
      vat_code_id: vatCode.id,
      account_id: account.id,
      article_type: 'service',
    })

    expect(listProducts(db, { company_id: a.companyId }).length).toBe(1)
    expect(listProducts(db, { company_id: b.companyId }).length).toBe(0)
  })
})

describe('Sprint MC3 — defense-in-depth-triggers', () => {
  it('INSERT invoice med counterparty från fel bolag → trigger ABORT', () => {
    const a = makeCompany('Bolag A AB', '556036-0793')
    const b = makeCompany('Bolag B AB', '559900-0006')

    // Counterparty i bolag A
    const cp = createCounterparty(db, {
      company_id: a.companyId,
      name: 'Acme AB',
      type: 'customer',
    })
    if (!cp.success) throw new Error(cp.error)

    // Försök INSERT invoice med fy från bolag B
    expect(() => {
      db.prepare(
        `INSERT INTO invoices (
          counterparty_id, fiscal_year_id, invoice_type, invoice_number,
          invoice_date, due_date, net_amount_ore, vat_amount_ore, total_amount_ore, status, payment_terms
        ) VALUES (?, ?, 'customer_invoice', '1', '2025-06-15', '2025-07-15', 100, 25, 125, 'unpaid', 30)`,
      ).run(cp.data.id, b.fiscalYearId)
    }).toThrow(/Motpart tillhör annat bolag/)
  })

  it('UPDATE invoice till counterparty från fel bolag → trigger ABORT', () => {
    const a = makeCompany('Bolag A AB', '556036-0793')
    const b = makeCompany('Bolag B AB', '559900-0006')

    const cpA = createCounterparty(db, {
      company_id: a.companyId,
      name: 'Kund A',
      type: 'customer',
    })
    const cpB = createCounterparty(db, {
      company_id: b.companyId,
      name: 'Kund B',
      type: 'customer',
    })
    if (!cpA.success || !cpB.success) throw new Error('seed failed')

    db.prepare(
      `INSERT INTO invoices (
        counterparty_id, fiscal_year_id, invoice_type, invoice_number,
        invoice_date, due_date, net_amount_ore, vat_amount_ore, total_amount_ore, status, payment_terms
      ) VALUES (?, ?, 'customer_invoice', '1', '2025-06-15', '2025-07-15', 100, 25, 125, 'draft', 30)`,
    ).run(cpA.data.id, a.fiscalYearId)
    const invoice = db
      .prepare('SELECT id FROM invoices WHERE counterparty_id = ?')
      .get(cpA.data.id) as { id: number }

    expect(() => {
      db.prepare(
        'UPDATE invoices SET counterparty_id = ? WHERE id = ?',
      ).run(cpB.data.id, invoice.id)
    }).toThrow(/Motpart tillhör annat bolag/)
  })

  it('counterparty.company_id immutability — UPDATE blockeras', () => {
    const a = makeCompany('Bolag A AB', '556036-0793')
    const b = makeCompany('Bolag B AB', '559900-0006')

    const cp = createCounterparty(db, {
      company_id: a.companyId,
      name: 'Acme AB',
      type: 'customer',
    })
    if (!cp.success) throw new Error(cp.error)

    expect(() => {
      db.prepare('UPDATE counterparties SET company_id = ? WHERE id = ?').run(
        b.companyId,
        cp.data.id,
      )
    }).toThrow(/company_id på counterparties får inte ändras/)
  })
})

describe('Sprint MC3 — customer-price isolation', () => {
  it('getPriceForCustomer respekterar company_id-scope', () => {
    const a = makeCompany('Bolag A AB', '556036-0793')
    const vatCode = db
      .prepare("SELECT id FROM vat_codes WHERE vat_type = 'outgoing' LIMIT 1")
      .get() as { id: number }
    const account = db
      .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
      .get() as { id: number }

    const prod = createProduct(db, {
      company_id: a.companyId,
      name: 'Tjänst',
      default_price_ore: 100000,
      vat_code_id: vatCode.id,
      account_id: account.id,
      article_type: 'service',
    })
    const cp = createCounterparty(db, {
      company_id: a.companyId,
      name: 'Kund',
      type: 'customer',
    })
    if (!prod.success || !cp.success) throw new Error('seed failed')

    setCustomerPrice(db, {
      company_id: a.companyId,
      product_id: prod.data.id,
      counterparty_id: cp.data.id,
      price_ore: 80000,
    })

    const result = getPriceForCustomer(db, {
      company_id: a.companyId,
      product_id: prod.data.id,
      counterparty_id: cp.data.id,
    })
    expect(result.price_ore).toBe(80000)
    expect(result.source).toBe('customer')
  })
})
