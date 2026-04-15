import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { saveDraft, finalizeDraft } from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
} from '../src/main/services/expense-service'
import { getVatReport } from '../src/main/services/vat-report-service'

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

interface Seed {
  companyId: number
  fiscalYearId: number
  customerId: number
  supplierId: number
  vatCode25Id: number
  vatCode12Id: number
  vatCode6Id: number
  vatCode0Id: number
  vatCodeInId: number
  productId: number
  account3002Id: number
}

function seedAll(testDb: Database.Database): Seed {
  createCompany(testDb, VALID_COMPANY)
  const company = testDb.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }

  const customer = createCounterparty(testDb, {
    name: 'Kund AB',
    type: 'customer',
  })
  if (!customer.success) throw new Error('Customer creation failed')
  const supplier = createCounterparty(testDb, {
    name: 'Lev AB',
    type: 'supplier',
  })
  if (!supplier.success) throw new Error('Supplier creation failed')

  const vatCode25 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const vatCode12 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP2'")
    .get() as { id: number }
  const vatCode6 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP3'")
    .get() as { id: number }
  const vatCode0 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MF'")
    .get() as { id: number }
  const vatCodeIn = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
    .get() as { id: number }

  const account3002 = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }

  const product = createProduct(testDb, {
    name: 'Konsult',
    default_price_ore: 100_000,
    vat_code_id: vatCode25.id,
    account_id: account3002.id,
  })
  if (!product.success) throw new Error('Product creation failed')

  return {
    companyId: company.id,
    fiscalYearId: fy.id,
    customerId: customer.data.id,
    supplierId: supplier.data.id,
    vatCode25Id: vatCode25.id,
    vatCode12Id: vatCode12.id,
    vatCode6Id: vatCode6.id,
    vatCode0Id: vatCode0.id,
    vatCodeInId: vatCodeIn.id,
    productId: product.data.id,
    account3002Id: account3002.id,
  }
}

let seed: Seed
let invoiceCounter = 0
let expenseCounter = 0

function bookInvoice(
  testDb: Database.Database,
  opts: {
    invoiceDate: string
    lines: {
      quantity: number
      unitPrice: number
      vatCodeId: number
    }[]
  },
) {
  invoiceCounter++
  const result = saveDraft(testDb, {
    counterparty_id: seed.customerId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: opts.invoiceDate,
    due_date: '2099-12-31',
    lines: opts.lines.map((l, i) => ({
      product_id: seed.productId,
      description: `Line ${invoiceCounter}-${i}`,
      quantity: l.quantity,
      unit_price_ore: l.unitPrice,
      vat_code_id: l.vatCodeId,
      sort_order: i,
    })),
  })
  if (!result.success) throw new Error('Invoice draft failed: ' + result.error)
  const fin = finalizeDraft(testDb, result.data.id)
  if (!fin.success) throw new Error('Invoice finalize failed: ' + fin.error)
  return fin.data
}

function bookExpense(
  testDb: Database.Database,
  opts: {
    expenseDate: string
    unitPriceOre: number
    quantity?: number
  },
) {
  expenseCounter++
  const result = saveExpenseDraft(testDb, {
    fiscal_year_id: seed.fiscalYearId,
    counterparty_id: seed.supplierId,
    expense_date: opts.expenseDate,
    description: `Expense ${expenseCounter}`,
    payment_terms: 30,
    supplier_invoice_number: `EXP-${expenseCounter}`,
    notes: '',
    lines: [
      {
        description: 'Test line',
        account_number: '5010',
        quantity: opts.quantity ?? 1,
        unit_price_ore: opts.unitPriceOre,
        vat_code_id: seed.vatCodeInId,
      },
    ],
  })
  if (!result.success) throw new Error('Expense draft failed: ' + result.error)
  const fin = finalizeExpense(testDb, result.data.id)
  if (!fin.success) throw new Error('Expense finalize failed: ' + fin.error)
  return result.data.id
}

describe('getVatReport', () => {
  beforeEach(() => {
    db = createTestDb()
    invoiceCounter = 0
    expenseCounter = 0
    seed = seedAll(db)
  })

  afterEach(() => {
    db.close()
  })

  // Test 1: Simple 25% invoice in Q1
  it('aggregerar 25% moms korrekt för en kundfaktura i Q1', () => {
    // 10 * 100_000 = 1_000_000 öre netto → 25% moms = 250_000 öre
    bookInvoice(db, {
      invoiceDate: '2025-01-15',
      lines: [
        { quantity: 10, unitPrice: 100_000, vatCodeId: seed.vatCode25Id },
      ],
    })
    const r = getVatReport(db, seed.fiscalYearId)
    expect(r.quarters[0].hasData).toBe(true)
    expect(r.quarters[0].vatOut25Ore).toBeGreaterThan(0)
    expect(r.quarters[0].vatInOre).toBe(0)
    expect(r.quarters[0].vatNetOre).toBeGreaterThan(0)
    expect(r.quarters[0].taxableBase25Ore).toBe(r.quarters[0].vatOut25Ore * 4)
  })

  // Test 2: Mixed VAT rates in same quarter
  it('hanterar 25% + 12% + 6% i samma kvartal', () => {
    bookInvoice(db, {
      invoiceDate: '2025-01-15',
      lines: [
        { quantity: 1, unitPrice: 100_000, vatCodeId: seed.vatCode25Id },
        { quantity: 1, unitPrice: 100_000, vatCodeId: seed.vatCode12Id },
        { quantity: 1, unitPrice: 100_000, vatCodeId: seed.vatCode6Id },
      ],
    })
    const q = getVatReport(db, seed.fiscalYearId).quarters[0]
    expect(q.vatOut25Ore).toBeGreaterThan(0)
    expect(q.vatOut12Ore).toBeGreaterThan(0)
    expect(q.vatOut6Ore).toBeGreaterThan(0)
    expect(q.vatOutTotalOre).toBe(q.vatOut25Ore + q.vatOut12Ore + q.vatOut6Ore)
  })

  // Test 3: Supplier invoice (incoming VAT)
  it('aggregerar ingående moms från leverantörsfaktura', () => {
    bookExpense(db, {
      expenseDate: '2025-01-15',
      unitPriceOre: 10_000_000,
    })
    const q = getVatReport(db, seed.fiscalYearId).quarters[0]
    expect(q.vatInOre).toBeGreaterThan(0)
  })

  // Test 4: Customer + supplier in same quarter
  it('beräknar vatNetOre = vatOutTotal - vatIn', () => {
    bookInvoice(db, {
      invoiceDate: '2025-01-15',
      lines: [
        { quantity: 10, unitPrice: 100_000, vatCodeId: seed.vatCode25Id },
      ],
    })
    bookExpense(db, {
      expenseDate: '2025-02-15',
      unitPriceOre: 5_000_000,
    })
    const q = getVatReport(db, seed.fiscalYearId).quarters[0]
    expect(q.vatOutTotalOre).toBeGreaterThan(0)
    expect(q.vatInOre).toBeGreaterThan(0)
    expect(q.vatNetOre).toBe(q.vatOutTotalOre - q.vatInOre)
  })

  // Test 5: Transactions in Q1 + Q3, Q2 empty
  it('visar tomma kvartal med hasData=false', () => {
    bookInvoice(db, {
      invoiceDate: '2025-01-15',
      lines: [{ quantity: 1, unitPrice: 100_000, vatCodeId: seed.vatCode25Id }],
    })
    bookInvoice(db, {
      invoiceDate: '2025-07-15',
      lines: [{ quantity: 1, unitPrice: 100_000, vatCodeId: seed.vatCode25Id }],
    })
    const r = getVatReport(db, seed.fiscalYearId)
    expect(r.quarters.length).toBe(4)
    expect(r.quarters[0].hasData).toBe(true)
    expect(r.quarters[1].hasData).toBe(false)
    expect(r.quarters[2].hasData).toBe(true)
    expect(r.quarters[3].hasData).toBe(false)
  })

  // Test 6: Empty year — always 4 quarters
  it('returnerar alltid 4 kvartal vid tomt år', () => {
    const r = getVatReport(db, seed.fiscalYearId)
    expect(r.quarters.length).toBe(4)
    expect(r.quarters.every((q) => !q.hasData)).toBe(true)
    expect(r.quarters.every((q) => q.vatOut25Ore === 0)).toBe(true)
    expect(r.yearTotal.hasData).toBe(false)
  })

  // Test 7: Year total = sum of quarters (algebraic invariant)
  it('årstotal = summa kvartal', () => {
    bookInvoice(db, {
      invoiceDate: '2025-02-15',
      lines: [{ quantity: 5, unitPrice: 100_000, vatCodeId: seed.vatCode25Id }],
    })
    bookInvoice(db, {
      invoiceDate: '2025-08-15',
      lines: [{ quantity: 3, unitPrice: 100_000, vatCodeId: seed.vatCode25Id }],
    })
    bookExpense(db, {
      expenseDate: '2025-05-15',
      unitPriceOre: 2_000_000,
    })
    const r = getVatReport(db, seed.fiscalYearId)
    expect(r.yearTotal.vatOut25Ore).toBe(
      r.quarters.reduce((s, q) => s + q.vatOut25Ore, 0),
    )
    expect(r.yearTotal.vatInOre).toBe(
      r.quarters.reduce((s, q) => s + q.vatInOre, 0),
    )
    expect(r.yearTotal.vatNetOre).toBe(
      r.quarters.reduce((s, q) => s + q.vatNetOre, 0),
    )
    expect(r.yearTotal.hasData).toBe(true)
  })

  // Test 8: 25% taxable base exact
  it('beräknar 25%-underlag exakt (vatOut * 4)', () => {
    bookInvoice(db, {
      invoiceDate: '2025-03-15',
      lines: [{ quantity: 7, unitPrice: 100_000, vatCodeId: seed.vatCode25Id }],
    })
    const r = getVatReport(db, seed.fiscalYearId)
    expect(r.quarters[0].taxableBase25Ore).toBe(r.quarters[0].vatOut25Ore * 4)
    expect(r.yearTotal.taxableBase25Ore).toBe(r.yearTotal.vatOut25Ore * 4)
  })

  // Test 9: 12% taxable base formula
  it('beräknar 12%-underlag med formel round(ore * 25 / 3)', () => {
    bookInvoice(db, {
      invoiceDate: '2025-01-15',
      lines: [{ quantity: 1, unitPrice: 100_000, vatCodeId: seed.vatCode12Id }],
    })
    const q = getVatReport(db, seed.fiscalYearId).quarters[0]
    expect(q.taxableBase12Ore).toBe(Math.round((q.vatOut12Ore * 25) / 3))
  })

  // Test 10: fiscal_year_id scoping
  it('scopas korrekt till räkenskapsår', () => {
    // Create a second fiscal year
    const fy2Id = db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2026', '2026-01-01', '2026-12-31')`,
      )
      .run(seed.companyId).lastInsertRowid as number
    for (let m = 1; m <= 12; m++) {
      const start = `2026-${String(m).padStart(2, '0')}-01`
      const endDay = new Date(2026, m, 0).getDate()
      const end = `2026-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      db.prepare(
        `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
       VALUES (?, ?, ?, ?, ?)`,
      ).run(seed.companyId, fy2Id, m, start, end)
    }

    // Book in year 1
    bookInvoice(db, {
      invoiceDate: '2025-01-15',
      lines: [
        { quantity: 10, unitPrice: 100_000, vatCodeId: seed.vatCode25Id },
      ],
    })

    const r1 = getVatReport(db, seed.fiscalYearId)
    const r2 = getVatReport(db, fy2Id)
    expect(r1.yearTotal.vatOut25Ore).toBeGreaterThan(0)
    expect(r2.yearTotal.vatOut25Ore).toBe(0)
  })

  // Test 11: 0% VAT doesn't appear
  it('0%-moms påverkar inte momsrapporten', () => {
    bookInvoice(db, {
      invoiceDate: '2025-01-15',
      lines: [{ quantity: 10, unitPrice: 100_000, vatCodeId: seed.vatCode0Id }],
    })
    const r = getVatReport(db, seed.fiscalYearId)
    // 0% VAT doesn't touch 2610/2620/2630/2640 → no data
    expect(r.quarters[0].vatOut25Ore).toBe(0)
    expect(r.quarters[0].vatOut12Ore).toBe(0)
    expect(r.quarters[0].vatOut6Ore).toBe(0)
    expect(r.quarters[0].vatInOre).toBe(0)
  })

  // Test 12: Regression — no migration
  it('regression: user_version=10, 20 tabeller', () => {
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(30) // S48: Uppdatera vid nya migrationer
    const tables = db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .get() as { count: number }
    expect(tables.count).toBe(22)
  })
})
