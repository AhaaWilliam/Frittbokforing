import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { GlobalSearchSchema } from '../src/shared/ipc-schemas'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { saveDraft, finalizeDraft } from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
} from '../src/main/services/expense-service'
import { globalSearch } from '../src/main/services/search-service'
import type { GlobalSearchResponse } from '../src/shared/search-types'
import type { IpcResult } from '../src/shared/types'

function getData(
  result: IpcResult<GlobalSearchResponse>,
): GlobalSearchResponse {
  if (!result.success) throw new Error('Expected success: ' + result.error)
  return result.data
}

let db: Database.Database

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2026-01-15',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
}

function seedBase(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const cp = createCounterparty(testDb, {
    company_id: 1,
    name: 'Acme AB',
    type: 'customer',
    org_number: '556036-0793',
  })
  if (!cp.success) throw new Error('CP failed')
  const supplierCp = createCounterparty(testDb, {
    company_id: 1,
    name: 'Leverantör AB',
    type: 'supplier',
    org_number: '556789-1234',
  })
  if (!supplierCp.success) throw new Error('Supplier CP failed')
  const bothCp = createCounterparty(testDb, {
    company_id: 1,
    name: 'Rabatt 50% AB',
    type: 'both',
  })
  if (!bothCp.success) throw new Error('Both CP failed')
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const inVatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'IP1'")
    .get() as { id: number }
  const accountId = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3001'")
    .get() as { id: number }
  return {
    fiscalYearId: fy.id,
    cpId: cp.data.id,
    supplierCpId: supplierCp.data.id,
    bothCpId: bothCp.data.id,
    vatCodeId: vatCode.id,
    inVatCodeId: inVatCode.id,
    accountId: accountId.id,
  }
}

function bookInvoice(
  testDb: Database.Database,
  seed: ReturnType<typeof seedBase>,
  cpId: number,
  date: string,
) {
  const draft = saveDraft(testDb, {
    counterparty_id: cpId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: date,
    due_date: date,
    lines: [
      {
        product_id: null,
        description: 'Konsulttjänst',
        account_number: '3001',
        quantity: 1,
        unit_price_ore: 1250000,
        vat_code_id: seed.vatCodeId,
        sort_order: 0,
      },
    ],
  })
  if (!draft.success) throw new Error('Draft failed: ' + JSON.stringify(draft))
  const fin = finalizeDraft(testDb, draft.data.id)
  if (!fin.success) throw new Error('Finalize failed: ' + fin.error)
  return fin.data
}

function bookExpense(
  testDb: Database.Database,
  seed: ReturnType<typeof seedBase>,
  date: string,
) {
  const draft = saveExpenseDraft(testDb, {
    counterparty_id: seed.supplierCpId,
    fiscal_year_id: seed.fiscalYearId,
    expense_date: date,
    description: 'Kontorsmaterial',
    lines: [
      {
        description: 'Papper',
        account_number: '5410',
        quantity: 1,
        unit_price_ore: 500000,
        vat_code_id: seed.inVatCodeId,
        sort_order: 0,
      },
    ],
  })
  if (!draft.success)
    throw new Error('Expense draft failed: ' + JSON.stringify(draft))
  const fin = finalizeExpense(testDb, draft.data.id)
  if (!fin.success) throw new Error('Expense finalize failed: ' + fin.error)
  return fin.data
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  db.close()
})

describe('globalSearch — service layer', () => {
  it('short query (<2 chars after trim) returns empty results', () => {
    const seed = seedBase(db)
    const result = globalSearch(db, {
      query: 'A',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    expect(getData(result).results).toHaveLength(0)
  })

  it('whitespace-only query returns empty results (F15)', () => {
    const seed = seedBase(db)
    const result = globalSearch(db, {
      query: '   ',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(getData(result).results).toHaveLength(0)
  })

  it('finds invoice by counterparty name (case-insensitive)', () => {
    const seed = seedBase(db)
    bookInvoice(db, seed, seed.cpId, '2026-03-01')
    const result = globalSearch(db, {
      query: 'Acme',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    const invoices = getData(result).results.filter((r) => r.type === 'invoice')
    expect(invoices.length).toBeGreaterThanOrEqual(1)
    expect(invoices[0].route).toMatch(/^\/income\/view\//)
  })

  it('finds customer by name (case-insensitive)', () => {
    const seed = seedBase(db)
    const result = globalSearch(db, {
      query: 'acme',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    const customers = getData(result).results.filter(
      (r) => r.type === 'customer',
    )
    expect(customers.length).toBeGreaterThanOrEqual(1)
    expect(customers[0].title).toBe('Acme AB')
    expect(customers[0].route).toMatch(/^\/customers\//)
  })

  it('supplier query returns only type IN (supplier, both) — D1', () => {
    const seed = seedBase(db)
    const result = globalSearch(db, {
      query: 'Leverantör',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    const suppliers = getData(result).results.filter(
      (r) => r.type === 'supplier',
    )
    expect(suppliers.length).toBeGreaterThanOrEqual(1)
    const customers = getData(result).results.filter(
      (r) => r.type === 'customer',
    )
    // Acme AB is customer-only, shouldn't appear when searching "Leverantör"
    expect(customers.every((c) => c.title !== 'Acme AB')).toBe(true)
  })

  it('customer query returns only type IN (customer, both) — D1', () => {
    const seed = seedBase(db)
    const result = globalSearch(db, {
      query: 'Acme',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    const suppliers = getData(result).results.filter(
      (r) => r.type === 'supplier',
    )
    // Acme AB is customer type, shouldn't appear in suppliers
    expect(suppliers.every((s) => s.title !== 'Acme AB')).toBe(true)
  })

  it('counterparty type=both appears in BOTH customer and supplier groups — D1', () => {
    const seed = seedBase(db)
    const result = globalSearch(db, {
      query: 'Rabatt',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    const customers = getData(result).results.filter(
      (r) => r.type === 'customer',
    )
    const suppliers = getData(result).results.filter(
      (r) => r.type === 'supplier',
    )
    expect(customers.some((c) => c.title === 'Rabatt 50% AB')).toBe(true)
    expect(suppliers.some((s) => s.title === 'Rabatt 50% AB')).toBe(true)
  })

  it('finds accounts by account_number + name', () => {
    const seed = seedBase(db)
    const result = globalSearch(db, {
      query: '1510',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    const accounts = getData(result).results.filter((r) => r.type === 'account')
    expect(accounts.length).toBeGreaterThanOrEqual(1)
    expect(accounts[0].title).toContain('1510')
    expect(accounts[0].route).toBe('/account-statement?account=1510')
  })

  it('FY-scoping: invoice from other FY does not appear', () => {
    const seed = seedBase(db)
    bookInvoice(db, seed, seed.cpId, '2026-03-01')
    // Search with a non-existent FY ID
    const result = globalSearch(db, { query: '1001', fiscal_year_id: 9999 })
    expect(result.success).toBe(true)
    const invoices = getData(result).results.filter((r) => r.type === 'invoice')
    expect(invoices).toHaveLength(0)
  })

  it('stamdata (products) are global regardless of FY — M14', () => {
    const seed = seedBase(db)
    const prod = createProduct(db, {
      company_id: 1,
      name: 'Konsulttimme',
      default_price_ore: 125000,
      vat_code_id: seed.vatCodeId,
      account_id: seed.accountId,
    })
    expect(prod.success).toBe(true)
    // Search with different FY ID — product should still appear
    const result = globalSearch(db, { query: 'Konsult', fiscal_year_id: 9999 })
    expect(result.success).toBe(true)
    const products = getData(result).results.filter((r) => r.type === 'product')
    expect(products.length).toBeGreaterThanOrEqual(1)
    expect(products[0].title).toBe('Konsulttimme')
  })

  it('LIKE-escape: search "50%" searches literal percent — F8', () => {
    const seed = seedBase(db)
    const result = globalSearch(db, {
      query: '50%',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    // "Rabatt 50% AB" should match
    const matches = getData(result).results.filter((r) =>
      r.title.includes('50%'),
    )
    expect(matches.length).toBeGreaterThanOrEqual(1)
  })

  it('limit is respected', () => {
    const seed = seedBase(db)
    // All accounts match "0" (many account_numbers contain 0)
    const result = globalSearch(db, {
      query: '00',
      fiscal_year_id: seed.fiscalYearId,
      limit: 3,
    })
    expect(result.success).toBe(true)
    expect(getData(result).results.length).toBeLessThanOrEqual(3)
  })

  it('routes: invoice → /income/view/{id}, account → /account-statement?account=', () => {
    const seed = seedBase(db)
    bookInvoice(db, seed, seed.cpId, '2026-03-01')
    const result = globalSearch(db, {
      query: 'Acme',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    const inv = getData(result).results.find((r) => r.type === 'invoice')
    expect(inv?.route).toMatch(/^\/income\/view\/\d+$/)
    const acct = globalSearch(db, {
      query: '1510',
      fiscal_year_id: seed.fiscalYearId,
    })
    const acctResult = getData(acct).results.find((r) => r.type === 'account')
    expect(acctResult?.route).toBe('/account-statement?account=1510')
  })

  it('case-insensitive: search "acme" matches "Acme AB"', () => {
    const seed = seedBase(db)
    const result = globalSearch(db, {
      query: 'acme',
      fiscal_year_id: seed.fiscalYearId,
    })
    expect(result.success).toBe(true)
    const customer = getData(result).results.find(
      (r) => r.type === 'customer' && r.title === 'Acme AB',
    )
    expect(customer).toBeDefined()
  })

  it('expense search by description and supplier name', () => {
    const seed = seedBase(db)
    bookExpense(db, seed, '2026-03-01')
    const byDesc = globalSearch(db, {
      query: 'Kontors',
      fiscal_year_id: seed.fiscalYearId,
    })
    const expenses = getData(byDesc).results.filter((r) => r.type === 'expense')
    expect(expenses.length).toBeGreaterThanOrEqual(1)
    expect(expenses[0].route).toMatch(/^\/expenses\/view\//)

    const bySupplier = globalSearch(db, {
      query: 'Leverantör',
      fiscal_year_id: seed.fiscalYearId,
    })
    const bySupplierExpenses = getData(bySupplier).results.filter(
      (r) => r.type === 'expense',
    )
    expect(bySupplierExpenses.length).toBeGreaterThanOrEqual(1)
  })

  it('åäö: same-case search works (Åke → Åke)', () => {
    const seed = seedBase(db)
    createCounterparty(db, {
      company_id: 1,
      name: 'Åke Andersson',
      type: 'customer',
    })
    const result = globalSearch(db, {
      query: 'Åke',
      fiscal_year_id: seed.fiscalYearId,
    })
    const found = getData(result).results.some(
      (r) => r.title === 'Åke Andersson',
    )
    expect(found).toBe(true)
  })

  it('åäö: cross-case search matches after F58 fix (regression F58)', () => {
    // Sprint 32: lower_unicode() registered via db-functions.ts replaces stock LOWER().
    const seed = seedBase(db)
    createCounterparty(db, {
      company_id: 1,
      name: 'Åke Andersson',
      type: 'customer',
    })
    const result = globalSearch(db, {
      query: 'åke',
      fiscal_year_id: seed.fiscalYearId,
    })
    const found = getData(result).results.some(
      (r) => r.title === 'Åke Andersson',
    )
    expect(found).toBe(true)
  })
})

describe('GlobalSearchSchema — IPC contract', () => {
  it('accepts valid input with min(2) query', () => {
    const result = GlobalSearchSchema.safeParse({
      query: 'AB',
      fiscal_year_id: 1,
    })
    expect(result.success).toBe(true)
  })

  it('rejects single-char query (min(2))', () => {
    const result = GlobalSearchSchema.safeParse({
      query: 'A',
      fiscal_year_id: 1,
    })
    expect(result.success).toBe(false)
  })

  it('rejects extra fields (strict)', () => {
    const result = GlobalSearchSchema.safeParse({
      query: 'test',
      fiscal_year_id: 1,
      extra: true,
    })
    expect(result.success).toBe(false)
  })

  it('accepts optional limit', () => {
    const result = GlobalSearchSchema.safeParse({
      query: 'test',
      fiscal_year_id: 1,
      limit: 10,
    })
    expect(result.success).toBe(true)
  })
})
