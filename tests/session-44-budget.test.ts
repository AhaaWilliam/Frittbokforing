/**
 * Session 44: Budget — service-level tests for budget-service.ts
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { saveDraft, finalizeDraft } from '../src/main/services/invoice-service'
import {
  getBudgetLines,
  getBudgetTargets,
  saveBudgetTargets,
  getBudgetVsActual,
  copyBudgetFromPreviousFy,
} from '../src/main/services/budget-service'

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

function seedCompanyAndFy(): number {
  createCompany(db, {
    name: 'Budget Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 50000_00,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  return (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
}

beforeAll(() => {
  db = createTestDb()
  fyId = seedCompanyAndFy()
})

afterAll(() => {
  if (db) db.close()
})

describe('S44: Budget service', () => {
  // ═══ getBudgetLines ═══

  it('B1: getBudgetLines returns 10 lines with correct metadata', () => {
    const result = getBudgetLines()
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data).toHaveLength(11)

    const netRevenue = result.data.find((l) => l.lineId === 'net_revenue')
    expect(netRevenue).toBeDefined()
    expect(netRevenue!.groupId).toBe('operating_income')
    expect(netRevenue!.signMultiplier).toBe(1)

    const materials = result.data.find((l) => l.lineId === 'materials')
    expect(materials).toBeDefined()
    expect(materials!.groupId).toBe('operating_expenses')
    expect(materials!.signMultiplier).toBe(-1)
  })

  // ═══ saveBudgetTargets ═══

  it('B2: saveBudgetTargets inserts new targets', () => {
    const result = saveBudgetTargets(db, fyId, [
      { line_id: 'net_revenue', period_number: 1, amount_ore: 100000_00 },
      { line_id: 'net_revenue', period_number: 2, amount_ore: 120000_00 },
      { line_id: 'materials', period_number: 1, amount_ore: -50000_00 },
    ])
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.count).toBe(3)
  })

  it('B3: saveBudgetTargets upserts existing targets', () => {
    const result = saveBudgetTargets(db, fyId, [
      { line_id: 'net_revenue', period_number: 1, amount_ore: 150000_00 },
    ])
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    const targets = getBudgetTargets(db, fyId)
    expect(targets.success).toBe(true)
    if (!targets.success) throw new Error(targets.error)

    const p1 = targets.data.find(
      (t) => t.line_id === 'net_revenue' && t.period_number === 1,
    )
    expect(p1?.amount_ore).toBe(150000_00)
  })

  it('B4: saveBudgetTargets rejects invalid line_id', () => {
    const result = saveBudgetTargets(db, fyId, [
      { line_id: 'nonexistent_line', period_number: 1, amount_ore: 100_00 },
    ])
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('VALIDATION_ERROR')
  })

  // ═══ getBudgetTargets ═══

  it('B5: getBudgetTargets returns all targets for FY', () => {
    const result = getBudgetTargets(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.length).toBeGreaterThanOrEqual(3)
  })

  it('B6: getBudgetTargets returns empty array for FY without budget', () => {
    const result = getBudgetTargets(db, 99999)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data).toHaveLength(0)
  })

  // ═══ getBudgetVsActual ═══

  it('B7: getBudgetVsActual returns 10 lines with 12 periods each', () => {
    const result = getBudgetVsActual(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.lines).toHaveLength(11)
    for (const line of result.data.lines) {
      expect(line.periods).toHaveLength(12)
    }
  })

  it('B8: getBudgetVsActual shows budget values correctly', () => {
    const result = getBudgetVsActual(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    const netRevLine = result.data.lines.find(
      (l) => l.lineId === 'net_revenue',
    )!
    expect(netRevLine.periods[0].budgetOre).toBe(150000_00) // upserted value
    expect(netRevLine.periods[1].budgetOre).toBe(120000_00)
  })

  it('B9: getBudgetVsActual variancePercent is null when budget is zero', () => {
    const result = getBudgetVsActual(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    // 'personnel' has no budget set
    const personnel = result.data.lines.find((l) => l.lineId === 'personnel')!
    expect(personnel.periods[0].variancePercent).toBeNull()
  })

  it('B10: getBudgetVsActual computes variance with booked entries', () => {
    // Create a finalized invoice → revenue booked in period 1 (Jan)
    const customer = createCounterparty(db, {
      name: 'Budgetkund',
      type: 'customer',
      org_number: '559999-0001',
    })
    if (!customer.success) throw new Error('Customer failed')

    const vatCode = db
      .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
      .get() as { id: number }
    const product = createProduct(db, {
      name: 'Budgetprodukt',
      default_price_ore: 50000_00,
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
      invoice_date: '2025-01-20',
      due_date: '2025-02-19',
      payment_terms: 30,
      lines: [
        {
          product_id: product.data.id,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 50000_00,
          vat_code_id: vatCode.id,
          sort_order: 0,
        },
      ],
    })
    if (!draft.success) throw new Error('Draft failed: ' + draft.error)

    const fin = finalizeDraft(db, draft.data.id)
    if (!fin.success) throw new Error('Finalize failed: ' + fin.error)

    // Now check variance — net_revenue P1 should have actual from booked invoice
    const result = getBudgetVsActual(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    const netRevLine = result.data.lines.find(
      (l) => l.lineId === 'net_revenue',
    )!
    // Invoice = 50000 öre net revenue, signMultiplier = 1, credit > debit → positive actual
    expect(netRevLine.periods[0].actualOre).toBeGreaterThan(0)
    // Variance = actual - budget
    expect(netRevLine.periods[0].varianceOre).toBe(
      netRevLine.periods[0].actualOre - netRevLine.periods[0].budgetOre,
    )
  })

  // ═══ copyBudgetFromPreviousFy ═══

  it('B11: copyBudgetFromPreviousFy copies targets', () => {
    // Create a second FY
    const secondFyId = (
      db
        .prepare(
          "INSERT INTO fiscal_years (company_id, year_label, start_date, end_date, is_closed) VALUES (1, '2026', '2026-01-01', '2026-12-31', 0) RETURNING id",
        )
        .get() as { id: number }
    ).id

    const result = copyBudgetFromPreviousFy(db, secondFyId, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)
    expect(result.data.count).toBeGreaterThan(0)

    // Verify targets exist in new FY
    const targets = getBudgetTargets(db, secondFyId)
    expect(targets.success).toBe(true)
    if (!targets.success) throw new Error(targets.error)
    expect(targets.data.length).toBeGreaterThan(0)
  })

  it('B12: copyBudgetFromPreviousFy returns NOT_FOUND for empty source', () => {
    const emptyFyId = (
      db
        .prepare(
          "INSERT INTO fiscal_years (company_id, year_label, start_date, end_date, is_closed) VALUES (1, '2027', '2027-01-01', '2027-12-31', 0) RETURNING id",
        )
        .get() as { id: number }
    ).id

    const result = copyBudgetFromPreviousFy(db, fyId, emptyFyId)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('Expected failure')
    expect(result.code).toBe('NOT_FOUND')
  })

  // ═══ Migration ═══

  it('B13: budget_targets table exists with correct schema', () => {
    const info = db
      .prepare(
        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'budget_targets'",
      )
      .get() as { sql: string }
    expect(info.sql).toContain('fiscal_year_id')
    expect(info.sql).toContain('line_id')
    expect(info.sql).toContain('period_number')
    expect(info.sql).toContain('amount_ore')
    expect(info.sql).toContain('UNIQUE')
  })

  it('B14: UNIQUE constraint prevents duplicate (fy, line_id, period)', () => {
    expect(() =>
      db
        .prepare(
          'INSERT INTO budget_targets (fiscal_year_id, line_id, period_number, amount_ore) VALUES (?, ?, ?, ?)',
        )
        .run(fyId, 'net_revenue', 1, 999),
    ).toThrow()
  })

  // ═══ Edge cases ═══

  it('B15: variance = -budget when line has budget but no transactions', () => {
    // 'depreciation' has budget set but no booked journal entries
    saveBudgetTargets(db, fyId, [
      { line_id: 'depreciation', period_number: 3, amount_ore: -25000_00 },
    ])

    const result = getBudgetVsActual(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    const depLine = result.data.lines.find((l) => l.lineId === 'depreciation')!
    expect(depLine.periods[2].budgetOre).toBe(-25000_00)
    expect(depLine.periods[2].actualOre).toBe(0)
    expect(depLine.periods[2].varianceOre).toBe(0 - -25000_00) // +25000_00
    expect(depLine.periods[2].variancePercent).toBe(100)
  })

  it('B16: variance with zero budget returns null variancePercent', () => {
    const result = getBudgetVsActual(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    // 'financial_income' has no budget set → budgetOre = 0
    const finIncome = result.data.lines.find(
      (l) => l.lineId === 'financial_income',
    )!
    expect(finIncome.periods[0].budgetOre).toBe(0)
    expect(finIncome.periods[0].variancePercent).toBeNull()
    expect(finIncome.totalVariancePercent).toBeNull()
  })

  it('B17: negative budget for cost line — favorable when actual is less negative', () => {
    // materials has budget -50000_00 from B2
    // No material transactions booked → actual = 0
    // Variance = 0 - (-50000_00) = +50000_00 (favorable: spent less than budgeted)
    const result = getBudgetVsActual(db, fyId)
    expect(result.success).toBe(true)
    if (!result.success) throw new Error(result.error)

    const materialsLine = result.data.lines.find(
      (l) => l.lineId === 'materials',
    )!
    const p1 = materialsLine.periods[0]
    expect(p1.budgetOre).toBe(-50000_00)
    expect(p1.actualOre).toBe(0)
    expect(p1.varianceOre).toBe(50000_00) // favorable
    expect(p1.varianceOre).toBeGreaterThan(0)
  })

  it('B18: concurrent FY — budget is scoped correctly', () => {
    // Second FY already created in B11, insert budget there
    const secondFyId = (
      db
        .prepare(
          "SELECT id FROM fiscal_years WHERE year_label = '2026' LIMIT 1",
        )
        .get() as { id: number }
    ).id

    saveBudgetTargets(db, secondFyId, [
      { line_id: 'net_revenue', period_number: 1, amount_ore: 999_00 },
    ])

    // Verify FY1 budget unchanged
    const fy1 = getBudgetVsActual(db, fyId)
    expect(fy1.success).toBe(true)
    if (!fy1.success) throw new Error(fy1.error)
    const fy1Rev = fy1.data.lines.find((l) => l.lineId === 'net_revenue')!
    expect(fy1Rev.periods[0].budgetOre).toBe(150000_00) // set in B3

    // Verify FY2 has its own budget
    const fy2 = getBudgetVsActual(db, secondFyId)
    expect(fy2.success).toBe(true)
    if (!fy2.success) throw new Error(fy2.error)
    const fy2Rev = fy2.data.lines.find((l) => l.lineId === 'net_revenue')!
    expect(fy2Rev.periods[0].budgetOre).toBe(999_00)
  })

  it('B19: saveBudgetTargets with amount_ore = 0 effectively clears a budget cell', () => {
    saveBudgetTargets(db, fyId, [
      { line_id: 'depreciation', period_number: 3, amount_ore: 0 },
    ])

    const targets = getBudgetTargets(db, fyId)
    expect(targets.success).toBe(true)
    if (!targets.success) throw new Error(targets.error)

    const dep3 = targets.data.find(
      (t) => t.line_id === 'depreciation' && t.period_number === 3,
    )
    expect(dep3?.amount_ore).toBe(0)
  })
})
