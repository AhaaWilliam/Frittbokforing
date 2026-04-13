import Database from 'better-sqlite3'
import { migrations } from '../../src/main/migrations'
import { createCompany } from '../../src/main/services/company-service'
import { createCounterparty } from '../../src/main/services/counterparty-service'
import { createProduct } from '../../src/main/services/product-service'
import {
  saveDraft,
  finalizeDraft,
} from '../../src/main/services/invoice-service'

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(m.sql)
    if (m.programmatic) m.programmatic(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')
  }
  return testDb
}

export function createTestDbWithFinalizedInvoice() {
  const db = createTestDb()

  // Seed: testföretag
  createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })

  // Uppdatera företag med betalningsuppgifter
  db.prepare(
    `UPDATE companies SET
      vat_number = 'SE556036079301',
      address_line1 = 'Testgatan 1',
      postal_code = '11122',
      city = 'Stockholm',
      bankgiro = '1234-5678'
    WHERE id = (SELECT id FROM companies LIMIT 1)`,
  ).run()

  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }

  // Seed: testkund
  const customer = createCounterparty(db, {
    name: 'Testkund AB',
    type: 'customer',
    org_number: '559987-6543',
    address_line1: 'Kundvägen 5',
    postal_code: '11133',
    city: 'Göteborg',
  })
  if (!customer.success) throw new Error('Customer creation failed')

  // Seed: VAT-koder
  const vatCode25 = db
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const vatCode12 = db
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP2'")
    .get() as { id: number }
  const account = db
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }

  // Seed: produkter
  const product25 = createProduct(db, {
    name: 'Konsulttjänst',
    default_price_ore: 10000,
    vat_code_id: vatCode25.id,
    account_id: account.id,
  })
  if (!product25.success) throw new Error('Product 25% failed')

  // Seed: bokförd faktura (A0001) med 2 rader, olika momssatser
  // Rad 1: 10000 öre netto, 25% moms (2500 öre)
  // Rad 2: 5000 öre netto, 12% moms (600 öre)
  const draft = saveDraft(db, {
    counterparty_id: customer.data.id,
    fiscal_year_id: fy.id,
    invoice_date: '2025-03-15',
    due_date: '2025-04-14',
    payment_terms: 30,
    lines: [
      {
        product_id: product25.data.id,
        description: 'Konsulttjänst',
        quantity: 1,
        unit_price_ore: 10000,
        vat_code_id: vatCode25.id,
        sort_order: 0,
      },
      {
        product_id: null,
        description: 'Livsmedel',
        quantity: 1,
        unit_price_ore: 5000,
        vat_code_id: vatCode12.id,
        sort_order: 1,
        account_number: '3002',
      },
    ],
  })
  if (!draft.success) throw new Error('Draft failed: ' + draft.error)

  const finalizeResult = finalizeDraft(db, draft.data.id)
  if (!finalizeResult.success)
    throw new Error('Finalize failed: ' + finalizeResult.error)

  // Seed: ett draft-utkast (för negativ-test)
  const draftOnly = saveDraft(db, {
    counterparty_id: customer.data.id,
    fiscal_year_id: fy.id,
    invoice_date: '2025-03-20',
    due_date: '2025-04-19',
    payment_terms: 30,
    lines: [
      {
        product_id: product25.data.id,
        description: 'Ej bokförd',
        quantity: 1,
        unit_price_ore: 5000,
        vat_code_id: vatCode25.id,
        sort_order: 0,
      },
    ],
  })
  if (!draftOnly.success) throw new Error('Draft-only failed')

  return {
    db,
    invoiceId: draft.data.id,
    draftInvoiceId: draftOnly.data.id,
  }
}
