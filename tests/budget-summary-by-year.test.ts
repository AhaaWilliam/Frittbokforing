/**
 * Tests for getBudgetSummaryByYear + BudgetSummaryByYearSchema
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { saveDraft, finalizeDraft } from '../src/main/services/invoice-service'
import {
  saveBudgetTargets,
  getBudgetSummaryByYear,
} from '../src/main/services/budget-service'
import { BudgetSummaryByYearSchema } from '../src/shared/ipc-schemas'

function createTestDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    db.exec('BEGIN EXCLUSIVE')
    if (m.sql) db.exec(m.sql)
    if (m.programmatic) m.programmatic(db)
    db.pragma(`user_version = ${i + 1}`)
    db.exec('COMMIT')
  }
  return db
}

let db: Database.Database
let fyId: number

beforeAll(() => {
  db = createTestDb()
  createCompany(db, {
    name: 'Summary Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 50000_00,
    registration_date: '2025-01-01',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
})

afterAll(() => {
  if (db) db.close()
})

// ═══ Schema validation ═══

describe('BudgetSummaryByYearSchema', () => {
  it('accepts valid fiscal_year_id', () => {
    expect(
      BudgetSummaryByYearSchema.safeParse({ fiscal_year_id: 1 }).success,
    ).toBe(true)
  })

  it('rejects missing fiscal_year_id', () => {
    expect(BudgetSummaryByYearSchema.safeParse({}).success).toBe(false)
  })

  it('rejects non-positive fiscal_year_id', () => {
    expect(
      BudgetSummaryByYearSchema.safeParse({ fiscal_year_id: 0 }).success,
    ).toBe(false)
  })

  it('rejects extra props (strict)', () => {
    expect(
      BudgetSummaryByYearSchema.safeParse({ fiscal_year_id: 1, extra: true })
        .success,
    ).toBe(false)
  })
})

// ═══ Service ═══

describe('getBudgetSummaryByYear', () => {
  it('BS1: returns zeros when FY has no budget and no transactions', () => {
    const result = getBudgetSummaryByYear(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.year_id).toBe(fyId)
    expect(result.data.total_budget_ore).toBe(0)
    expect(result.data.total_spent_ore).toBe(0)
  })

  it('BS2: total_budget_ore sums all targets across lines and periods', () => {
    saveBudgetTargets(db, fyId, [
      { line_id: 'net_revenue', period_number: 1, amount_ore: 100_000_00 },
      { line_id: 'net_revenue', period_number: 2, amount_ore: 200_000_00 },
      { line_id: 'materials', period_number: 1, amount_ore: -50_000_00 },
    ])

    const result = getBudgetSummaryByYear(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    // 100_000_00 + 200_000_00 + (-50_000_00) = 250_000_00
    expect(result.data.total_budget_ore).toBe(250_000_00)
  })

  it('BS3: total_spent_ore reflects booked journal entries mapped through income statement config', () => {
    const customer = createCounterparty(db, {
      company_id: 1,
      name: 'Summary Kund',
      type: 'customer',
      org_number: '559999-0099',
    })
    if (!customer.success) throw new Error('Customer failed')

    const vatCode = db
      .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
      .get() as { id: number }

    const product = createProduct(db, {
      company_id: 1,
      name: 'Summary Produkt',
      default_price_ore: 10_000_00,
      vat_code_id: vatCode.id,
      account_id: (
        db
          .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
          .get() as { id: number }
      ).id,
    })
    if (!product.success) throw new Error('Product failed')

    const draft = saveDraft(db, {
      counterparty_id: customer.data.id,
      fiscal_year_id: fyId,
      invoice_date: '2025-03-01',
      due_date: '2025-03-31',
      payment_terms: 30,
      lines: [
        {
          product_id: product.data.id,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 10_000_00,
          vat_code_id: vatCode.id,
          sort_order: 0,
        },
      ],
    })
    if (!draft.success) throw new Error('Draft failed: ' + draft.error)

    const fin = finalizeDraft(db, draft.data.id)
    if (!fin.success) throw new Error('Finalize failed: ' + fin.error)

    const result = getBudgetSummaryByYear(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    // net_revenue (3002) has signMultiplier = 1, credit > debit → positive
    expect(result.data.total_spent_ore).toBeGreaterThan(0)
  })

  it('BS4: year_id matches the input fiscal_year_id', () => {
    const result = getBudgetSummaryByYear(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.year_id).toBe(fyId)
  })

  it('BS5: unknown fiscal_year_id returns zeros without error', () => {
    const result = getBudgetSummaryByYear(db, 99999)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.year_id).toBe(99999)
    expect(result.data.total_budget_ore).toBe(0)
    expect(result.data.total_spent_ore).toBe(0)
  })
})
