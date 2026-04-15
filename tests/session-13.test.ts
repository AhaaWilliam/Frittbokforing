import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
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
import { getDashboardSummary } from '../src/main/services/dashboard-service'

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

function seedAll(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const customer = createCounterparty(testDb, {
    name: 'Kund AB',
    type: 'customer',
  })
  if (!customer.success) throw new Error('Customer creation failed')
  const supplier = createCounterparty(testDb, {
    name: 'Leverantör AB',
    type: 'supplier',
  })
  if (!supplier.success) throw new Error('Supplier creation failed')

  const vatCodeOut = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const vatCodeIn = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    name: 'Konsult',
    default_price_ore: 100_000,
    vat_code_id: vatCodeOut.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')

  const companyId = (
    testDb.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
  ).id

  return {
    fiscalYearId: fy.id,
    companyId,
    customerId: customer.data.id,
    supplierId: supplier.data.id,
    vatCodeOutId: vatCodeOut.id,
    vatCodeInId: vatCodeIn.id,
    productId: product.data.id,
  }
}

let invoiceCounter = 0

function createInvoiceDraft(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: { quantity?: number; unitPrice?: number },
) {
  invoiceCounter++
  const result = saveDraft(testDb, {
    counterparty_id: seed.customerId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: '2025-03-15',
    due_date: '2099-12-31',
    lines: [
      {
        product_id: seed.productId,
        description: `Konsult ${invoiceCounter}`,
        quantity: opts?.quantity ?? 10,
        unit_price_ore: opts?.unitPrice ?? 100_000,
        vat_code_id: seed.vatCodeOutId,
        sort_order: 0,
      },
    ],
  })
  if (!result.success) throw new Error('Invoice draft failed: ' + result.error)
  return result.data
}

function createBookedInvoice(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: { quantity?: number; unitPrice?: number },
) {
  const draft = createInvoiceDraft(testDb, seed, opts)
  const fin = finalizeDraft(testDb, draft.id)
  if (!fin.success) throw new Error('Invoice finalize failed: ' + fin.error)
  return fin.data
}

let expenseCounter = 0

// M92: line_total_ore = quantity * unit_price_ore (ingen /100-division)
// qty=1, unit_price_ore=100_000 → line_total=100_000 öre (1000 kr), vat=25_000 öre, total=125_000 öre
function createExpenseDraft(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: { unitPriceOre?: number; quantity?: number },
) {
  expenseCounter++
  const result = saveExpenseDraft(testDb, {
    fiscal_year_id: seed.fiscalYearId,
    counterparty_id: seed.supplierId,
    expense_date: '2025-03-15',
    description: `Expense ${expenseCounter}`,
    payment_terms: 30,
    supplier_invoice_number: `EXP-${expenseCounter}`,
    notes: '',
    lines: [
      {
        description: 'Test line',
        account_number: '5010',
        quantity: opts?.quantity ?? 1,
        unit_price_ore: opts?.unitPriceOre ?? 100_000,
        vat_code_id: seed.vatCodeInId,
      },
    ],
  })
  if (!result.success) throw new Error('Expense draft failed: ' + result.error)
  return result.data.id
}

function createBookedExpense(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  opts?: { unitPriceOre?: number; quantity?: number },
) {
  const id = createExpenseDraft(testDb, seed, opts)
  const fin = finalizeExpense(testDb, id)
  if (!fin.success) throw new Error('Expense finalize failed: ' + fin.error)
  return id
}

/** Create a manual booked journal entry with arbitrary lines (bypass triggers). */
function createManualBookedEntry(
  testDb: Database.Database,
  seed: ReturnType<typeof seedAll>,
  lines: { account_number: string; debit: number; credit: number }[],
) {
  // Insert as draft first (trigger blocks line inserts on booked entries)
  const jeId = testDb
    .prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
     VALUES (?, ?, '2025-06-01', 'Manual test entry', 'draft', 'manual')`,
    )
    .run(seed.companyId, seed.fiscalYearId).lastInsertRowid as number
  for (let i = 0; i < lines.length; i++) {
    testDb
      .prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        jeId,
        i + 1,
        lines[i].account_number,
        lines[i].debit,
        lines[i].credit,
      )
  }
  // Book it
  testDb
    .prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?")
    .run(jeId)
  return jeId
}

beforeEach(() => {
  db = createTestDb()
  invoiceCounter = 0
  expenseCounter = 0
})

afterEach(() => {
  db.close()
})

describe('Session 13: getDashboardSummary', () => {
  it('returnerar nollor för tomt räkenskapsår', () => {
    const seed = seedAll(db)
    const r = getDashboardSummary(db, seed.fiscalYearId)
    expect(r.revenueOre).toBe(0)
    expect(r.expensesOre).toBe(0)
    expect(r.operatingResultOre).toBe(0)
    expect(r.vatOutgoingOre).toBe(0)
    expect(r.vatIncomingOre).toBe(0)
    expect(r.vatNetOre).toBe(0)
    expect(r.unpaidReceivablesOre).toBe(0)
    expect(r.unpaidPayablesOre).toBe(0)
  })

  it('beräknar intäkter korrekt från bokförd kundfaktura', () => {
    const seed = seedAll(db)
    // 10 qty * 100_000 öre = 1_000_000 netto, 25% moms = 250_000
    createBookedInvoice(db, seed)
    const r = getDashboardSummary(db, seed.fiscalYearId)
    expect(r.revenueOre).toBe(1_000_000)
    expect(r.vatOutgoingOre).toBe(250_000)
  })

  // Fixed in Sprint 11 Fas 3: 3740 (öresutjämning) ingår nu korrekt i rörelseresultatet
  // via INCOME_STATEMENT_CONFIG (net_revenue 3000–3799 inkluderar 3740)
  it('inkluderar 3740-poster (öresutjämning) i intäkter', () => {
    const seed = seedAll(db)
    // Create a balanced manual entry with 3740 credit and matching debit
    createManualBookedEntry(db, seed, [
      { account_number: '3740', debit: 0, credit: 100 },
      { account_number: '1930', debit: 100, credit: 0 },
    ])
    const r = getDashboardSummary(db, seed.fiscalYearId)
    expect(r.revenueOre).toBe(100)
  })

  it('beräknar kostnader korrekt från bokförd leverantörsfaktura', () => {
    const seed = seedAll(db)
    // M92: qty=1, unit_price_ore=100_000 → line_total=100_000 öre (1000 kr), vat=25_000 öre
    createBookedExpense(db, seed)
    const r = getDashboardSummary(db, seed.fiscalYearId)
    expect(r.expensesOre).toBe(100_000)
    expect(r.vatIncomingOre).toBe(25_000)
  })

  it('beräknar moms netto korrekt (utgående minus ingående)', () => {
    const seed = seedAll(db)
    createBookedInvoice(db, seed) // vatOut = 250_000
    createBookedExpense(db, seed) // vatIn = 25_000 (M92)
    const r = getDashboardSummary(db, seed.fiscalYearId)
    expect(r.vatNetOre).toBe(r.vatOutgoingOre - r.vatIncomingOre)
    expect(r.vatNetOre).toBe(250_000 - 25_000)
  })

  it('summerar obetalda kundfordringar (unpaid + partial)', () => {
    const seed = seedAll(db)
    // Invoice 1: total 1_250_000, unpaid
    createBookedInvoice(db, seed)
    // Invoice 2: total 625_000, partially paid 100_000
    const inv2 = createBookedInvoice(db, seed, { quantity: 5 })
    payInvoice(db, {
      invoice_id: inv2.id,
      amount_ore: 100_000,
      payment_date: '2025-04-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    const r = getDashboardSummary(db, seed.fiscalYearId)
    // inv1 remaining = 1_250_000, inv2 remaining = 625_000 - 100_000 = 525_000
    expect(r.unpaidReceivablesOre).toBe(1_250_000 + 525_000)
  })

  it('exkluderar helt betalda fakturor från kundfordringar', () => {
    const seed = seedAll(db)
    const inv = createBookedInvoice(db, seed)
    payInvoice(db, {
      invoice_id: inv.id,
      amount_ore: inv.total_amount_ore,
      payment_date: '2025-04-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    const r = getDashboardSummary(db, seed.fiscalYearId)
    expect(r.unpaidReceivablesOre).toBe(0)
  })

  it('exkluderar draft-fakturor (ej bokförda) från alla metrics', () => {
    const seed = seedAll(db)
    createInvoiceDraft(db, seed)
    createExpenseDraft(db, seed)
    const r = getDashboardSummary(db, seed.fiscalYearId)
    expect(r.revenueOre).toBe(0)
    expect(r.expensesOre).toBe(0)
    expect(r.operatingResultOre).toBe(0)
    expect(r.vatOutgoingOre).toBe(0)
    expect(r.vatIncomingOre).toBe(0)
    expect(r.vatNetOre).toBe(0)
    expect(r.unpaidReceivablesOre).toBe(0)
    expect(r.unpaidPayablesOre).toBe(0)
  })

  it('hanterar negativt rörelseresultat korrekt', () => {
    const seed = seedAll(db)
    // Revenue: 1 * 100_000 = 100_000
    createBookedInvoice(db, seed, { quantity: 1 })
    // Expense: line_total = round(1 * 20_000_000 / 100) = 200_000
    createBookedExpense(db, seed, { unitPriceOre: 20_000_000 })
    const r = getDashboardSummary(db, seed.fiscalYearId)
    expect(r.operatingResultOre).toBeLessThan(0)
    expect(r.operatingResultOre).toBe(r.revenueOre - r.expensesOre)
  })

  it('exkluderar klass 8-konton (finansiella poster) från kostnader', () => {
    const seed = seedAll(db)
    // Manual entry with class 8 account (8410 = Räntekostnader, exists in seed)
    createManualBookedEntry(db, seed, [
      { account_number: '8410', debit: 50_000, credit: 0 },
      { account_number: '1930', debit: 0, credit: 50_000 },
    ])
    const r = getDashboardSummary(db, seed.fiscalYearId)
    // Class 8 should NOT appear in expenses (EBIT excludes class 8)
    expect(r.expensesOre).toBe(0)
  })

  it('scopas till aktivt räkenskapsår, exkluderar andra år', () => {
    const seed = seedAll(db)
    createBookedInvoice(db, seed) // year A

    // Create year B
    db.prepare(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date, is_closed)
       VALUES (?, '2026', '2026-01-01', '2026-12-31', 0)`,
    ).run(seed.companyId)
    const yearB = db
      .prepare('SELECT id FROM fiscal_years WHERE year_label = ?')
      .get('2026') as { id: number }
    // Generate periods for year B (accounting_periods requires company_id)
    for (let m = 1; m <= 12; m++) {
      const start = `2026-${String(m).padStart(2, '0')}-01`
      const lastDay = new Date(2026, m, 0).getDate()
      const end = `2026-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      db.prepare(
        `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date, is_closed)
         VALUES (?, ?, ?, ?, ?, 0)`,
      ).run(seed.companyId, yearB.id, m, start, end)
    }

    const rA = getDashboardSummary(db, seed.fiscalYearId)
    const rB = getDashboardSummary(db, yearB.id)
    expect(rA.revenueOre).toBe(1_000_000)
    expect(rB.revenueOre).toBe(0)
  })

  it('regression: user_version=10 och 20 tabeller oförändrat', () => {
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(28) // S48: Uppdatera vid nya migrationer
    const tables = db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .get() as { count: number }
    expect(tables.count).toBe(22)
  })

  it('operatingResultOre = revenueOre − expensesOre, vatNetOre = vatOut − vatIn', () => {
    const seed = seedAll(db)
    createBookedInvoice(db, seed)
    createBookedExpense(db, seed)
    const r = getDashboardSummary(db, seed.fiscalYearId)
    expect(r.operatingResultOre).toBe(r.revenueOre - r.expensesOre)
    expect(r.vatNetOre).toBe(r.vatOutgoingOre - r.vatIncomingOre)
    for (const key of Object.keys(r) as Array<keyof typeof r>) {
      expect(typeof r[key]).toBe('number')
    }
  })

  it('summerar obetalda leverantörsskulder korrekt', () => {
    const seed = seedAll(db)
    // Expense 1: unpaid (line_total=1000, vat=250, total=1250)
    const id1 = createBookedExpense(db, seed)
    // Expense 2: partially paid
    const id2 = createBookedExpense(db, seed, { unitPriceOre: 200_000 })
    const exp2 = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(id2) as { total_amount_ore: number }
    payExpense(db, {
      expense_id: id2,
      amount_ore: 500,
      payment_date: '2025-04-01',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    const exp1 = db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(id1) as { total_amount_ore: number }

    const r = getDashboardSummary(db, seed.fiscalYearId)
    expect(r.unpaidPayablesOre).toBe(
      exp1.total_amount_ore + (exp2.total_amount_ore - 500),
    )
  })
})
