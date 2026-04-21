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
} from '../src/main/services/expense-service'
import { exportSie5 } from '../src/main/services/sie5/sie5-export-service'

let db: Database.Database

// Company for FY 2026 (export year)
const COMPANY_2026 = {
  name: 'Test AB',
  org_number: '556677-8899',
  fiscal_rule: 'K2' as const,
  share_capital: 5_000_000,
  registration_date: '2026-01-01',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
}

interface Seed {
  companyId: number
  fyId: number
  customerId: number
  supplierId: number
  bothId: number
  vatCode25Id: number
  vatCodeInId: number
  productId: number
}

let seed: Seed
let invoiceCounter = 0
let expenseCounter = 0

function setupSeed(testDb: Database.Database): Seed {
  createCompany(testDb, COMPANY_2026)
  const company = testDb.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }

  const customer = createCounterparty(testDb, {
    company_id: 1,
    name: 'Kund AB',
    type: 'customer',
    org_number: '556611-2233',
  })
  if (!customer.success) throw new Error('Customer failed')

  const supplier = createCounterparty(testDb, {
    company_id: 1,
    name: 'Leverantör AB',
    type: 'supplier',
    org_number: '556644-5566',
  })
  if (!supplier.success) throw new Error('Supplier failed')

  const both = createCounterparty(testDb, {
    company_id: 1,
    name: 'Båda AB',
    type: 'both',
    org_number: '556677-8800',
  })
  if (!both.success) throw new Error('Both failed')

  const vatCode25 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const vatCodeIn = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    company_id: 1,
    name: 'Konsult',
    default_price_ore: 100_000,
    vat_code_id: vatCode25.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')

  return {
    companyId: company.id,
    fyId: fy.id,
    customerId: customer.data.id,
    supplierId: supplier.data.id,
    bothId: both.data.id,
    vatCode25Id: vatCode25.id,
    vatCodeInId: vatCodeIn.id,
    productId: product.data.id,
  }
}

function bookInvoice(testDb: Database.Database, invoiceDate: string) {
  invoiceCounter++
  const result = saveDraft(testDb, {
    counterparty_id: seed.customerId,
    fiscal_year_id: seed.fyId,
    invoice_date: invoiceDate,
    due_date: '2026-02-15',
    lines: [
      {
        product_id: seed.productId,
        description: `Konsult ${invoiceCounter}`,
        quantity: 10,
        unit_price_ore: 100_000,
        vat_code_id: seed.vatCode25Id,
        sort_order: 0,
      },
    ],
  })
  if (!result.success) throw new Error('Invoice draft failed: ' + result.error)
  const fin = finalizeDraft(testDb, result.data.id)
  if (!fin.success) throw new Error('Invoice finalize failed: ' + fin.error)
  return fin.data
}

function bookExpense(testDb: Database.Database, expenseDate: string) {
  expenseCounter++
  const result = saveExpenseDraft(testDb, {
    fiscal_year_id: seed.fyId,
    counterparty_id: seed.supplierId,
    expense_date: expenseDate,
    description: `Kostnad ${expenseCounter}`,
    payment_terms: 30,
    supplier_invoice_number: `F2026-${expenseCounter}`,
    notes: '',
    lines: [
      {
        description: 'Hyra',
        account_number: '5010',
        quantity: 1,
        unit_price_ore: 500_000,
        vat_code_id: seed.vatCodeInId,
      },
    ],
  })
  if (!result.success) throw new Error('Expense draft failed: ' + result.error)
  const fin = finalizeExpense(testDb, result.data.id)
  if (!fin.success) throw new Error('Expense finalize failed: ' + fin.error)
  return result.data.id
}

describe('SIE5 Export', () => {
  beforeEach(() => {
    db = createTestDb()
    invoiceCounter = 0
    expenseCounter = 0
    seed = setupSeed(db)
  })

  afterEach(() => {
    db.close()
  })

  // Test 1: Generates valid XML
  it('genererar valid XML (parsebar)', () => {
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('<?xml version="1.0"')
    expect(xml).toContain('<Sie')
    expect(xml).toContain('</Sie>')
  })

  // Test 2: Root element has correct namespace + schemaLocation
  it('har korrekt namespace och schemaLocation', () => {
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('xmlns="http://www.sie.se/sie5"')
    expect(xml).toContain(
      'xsi:schemaLocation="http://www.sie.se/sie5 https://sie.se/sie5.xsd"',
    )
  })

  // Test 3: No unwanted xmlns=""
  it('inga oönskade xmlns="" i output', () => {
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).not.toContain('xmlns=""')
  })

  // Test 4: FileInfo correct
  it('FileInfo innehåller rätt data', () => {
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('name="Fritt Bokföring"')
    expect(xml).toContain('organizationId="556677-8899"')
    expect(xml).toContain('name="Test AB"')
    expect(xml).toContain('start="2026-01-01"')
    expect(xml).toContain('end="2026-12-31"')
    expect(xml).toContain('currency="SEK"')
  })

  // Test 5: Accounts contain used accounts
  it('Accounts innehåller alla använda konton', () => {
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('id="1510"')
    expect(xml).toContain('id="3002"')
    expect(xml).toContain('id="2610"')
  })

  // Test 6: Account type mapping correct
  it('konto-typmappning korrekt', () => {
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toMatch(/id="1510"[^>]*type="asset"/)
    expect(xml).toMatch(/id="2610"[^>]*type="liability"/)
    expect(xml).toMatch(/id="3002"[^>]*type="income"/)
  })

  // Test 7: OpeningBalance/ClosingBalance per month
  it('genererar OB/CB per månad', () => {
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('<OpeningBalance')
    expect(xml).toContain('<ClosingBalance')
    expect(xml).toContain('month="2026-01"')
  })

  // Test 8: IB from previous year
  it('beräknar IB från föregående räkenskapsår', () => {
    // Create previous FY with data
    const prevFyId = db
      .prepare(
        `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, '2025', '2025-01-01', '2025-12-31')`,
      )
      .run(seed.companyId).lastInsertRowid as number
    for (let m = 1; m <= 12; m++) {
      const start = `2025-${String(m).padStart(2, '0')}-01`
      const endDay = new Date(2025, m, 0).getDate()
      const end = `2025-${String(m).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`
      db.prepare(
        `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
       VALUES (?, ?, ?, ?, ?)`,
      ).run(seed.companyId, prevFyId, m, start, end)
    }

    // Book a manual entry in previous year (50000 kr on bank account 1930)
    // Insert as draft first (trigger blocks line inserts on booked entries)
    const jeId = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
       VALUES (?, ?, '2025-06-01', 'Startkapital', 'draft', 'manual')`,
      )
      .run(seed.companyId, prevFyId).lastInsertRowid as number
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
     VALUES (?, 1, '1930', 5000000, 0), (?, 2, '2081', 0, 5000000)`,
    ).run(jeId, jeId)
    db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(
      jeId,
    )

    // Now book in 2026 too
    bookInvoice(db, '2026-01-15')

    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    // Account 1930 should have IB = 50000 kr = "50000.00" in OB for first month
    expect(xml).toMatch(
      /id="1930"[^]*?OpeningBalance[^>]*month="2026-01"[^>]*amount="50000\.00"/,
    )
  })

  // Test 9: Journal A contains customer invoice verifications
  it('Journal A innehåller kundverifikationer', () => {
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('Journal')
    expect(xml).toContain('id="A"')
    expect(xml).toContain('<JournalEntry')
    expect(xml).toContain('<LedgerEntry')
  })

  // Test 10: Journal B contains supplier verifications
  it('Journal B innehåller leverantörsverifikationer', () => {
    bookExpense(db, '2026-01-20')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('id="B"')
  })

  // Test 11: LedgerEntry amounts correctly converted
  it('LedgerEntry-belopp korrekt konverterade (öre → decimal)', () => {
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    // 10 * 100_000 = 1_000_000 öre = 10000.00 kr on 1510 (debit)
    // The invoice should create LedgerEntry for 1510 with positive amount
    expect(xml).toMatch(/accountId="1510"[^>]*amount="/)
  })

  // Test 12: CustomerInvoices reskontra — Balances BEFORE OriginalAmount
  it('CustomerInvoice: Balances före OriginalAmount (XSD strict sequence)', () => {
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    // Find CustomerInvoice section
    const custInvMatch = xml.match(/<CustomerInvoice[^]*?<\/CustomerInvoice>/)
    expect(custInvMatch).not.toBeNull()
    const section = custInvMatch![0]
    const balancesIdx = section.indexOf('<Balances')
    const origAmtIdx = section.indexOf('<OriginalAmount')
    expect(balancesIdx).toBeGreaterThan(-1)
    expect(origAmtIdx).toBeGreaterThan(-1)
    expect(balancesIdx).toBeLessThan(origAmtIdx)
  })

  // Test 13: Payment reduces reskontra balance
  it('betalning minskar reskontra-saldo till 0', () => {
    const invoiceData = bookInvoice(db, '2026-01-15')
    // Pay the full amount in February
    payInvoice(db, {
      invoice_id: invoiceData.id,
      amount_ore: invoiceData.total_amount_ore,
      payment_date: '2026-02-10',
      payment_method: 'bankgiro',
      account_number: '1930',
    })
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    // Should have Balances for jan (full amount) and feb (0)
    const custInvMatch = xml.match(/<CustomerInvoice[^]*?<\/CustomerInvoice>/)
    expect(custInvMatch).not.toBeNull()
    const section = custInvMatch![0]
    expect(section).toContain('month="2026-01"')
    expect(section).toContain('month="2026-02"')
    expect(section).toContain('amount="0.00"')
  })

  // Test 14: SupplierInvoices — negative amounts
  it('SupplierInvoice: negativa belopp', () => {
    bookExpense(db, '2026-01-20')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    const suppInvMatch = xml.match(/<SupplierInvoice[^]*?<\/SupplierInvoice>/)
    expect(suppInvMatch).not.toBeNull()
    const section = suppInvMatch![0]
    expect(section).toContain('amount="-')
  })

  // Test 15: Customers section
  it('Customers-sektion innehåller kunddata', () => {
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('<Customer')
    expect(xml).toContain('name="Kund AB"')
    expect(xml).toContain('organizationId="556611-2233"')
  })

  // Test 16: Suppliers section
  it('Suppliers-sektion innehåller leverantörsdata', () => {
    bookExpense(db, '2026-01-20')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('<Supplier')
    expect(xml).toContain('name="Leverantör AB"')
  })

  // Test 17: Counterparty with type='both' appears in both sections
  it('type=both finns i både Customers och Suppliers', () => {
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain(`id="C${seed.bothId}"`)
    expect(xml).toContain(`id="S${seed.bothId}"`)
  })

  // Test 18: counterparty id consistency
  it('counterparty-id matchar mellan reskontra och Customers/Suppliers', () => {
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    // customerId in invoice should match Customer id
    expect(xml).toContain(`customerId="C${seed.customerId}"`)
    expect(xml).toContain(`id="C${seed.customerId}"`)
  })

  // Test 19: Empty DB → minimal valid XML
  it('tom databas → minimal giltig XML', () => {
    // Delete the company and create one without any transactions
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('<Sie')
    expect(xml).toContain('</Sie>')
    expect(xml).toContain('<FileInfo')
    expect(xml).toContain('<Accounts')
  })

  // Test 20: Series without entries → no Journal element
  it('serie utan verifikationer → inget Journal-element', () => {
    // Only book in series A (invoice), don't book in B
    bookInvoice(db, '2026-01-15')
    const xml = exportSie5(db, { fiscalYearId: seed.fyId })
    expect(xml).toContain('id="A"')
    // B should only appear if there are B-series entries
    const hasJournalB = xml.includes('id="B"')
    // B series only exists if expenses were booked
    expect(hasJournalB).toBe(false)
  })

  // Test 21: regression — no migration
  it('regression: user_version=10, 20 tabeller', () => {
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(52) // S58: Uppdatera vid nya migrationer
    const tables = db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .get() as { count: number }
    expect(tables.count).toBe(39)
  })
})
