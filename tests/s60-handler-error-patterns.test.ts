/**
 * Sprint 16 S60 — Handler error-pattern regression tests
 *
 * Verifies that migrated handlers (from TRANSACTION_ERROR catch to
 * wrapIpcHandler) maintain correct behavior. Tests representative
 * services called by the 15 migrated handlers.
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
} from 'vitest'
import {
  type SystemTestContext,
  createTemplateDb,
  destroyTemplateDb,
  createSystemTestContext,
  destroyContext,
} from './system/helpers/system-test-context'
import { listInvoices, getPayments } from '../src/main/services/invoice-service'
import {
  listExpenses,
  getExpensePayments,
} from '../src/main/services/expense-service'
import { getDashboardSummary } from '../src/main/services/dashboard-service'
import { getVatReport } from '../src/main/services/vat-report-service'
import { getTaxForecast } from '../src/main/services/tax-service'
import {
  getIncomeStatement,
  getBalanceSheet,
} from '../src/main/services/report/report-service'
import { exportSie4 } from '../src/main/services/sie4/sie4-export-service'
import { exportSie5 } from '../src/main/services/sie5/sie5-export-service'

let ctx: SystemTestContext

beforeAll(() => createTemplateDb())
afterAll(() => destroyTemplateDb())
beforeEach(() => {
  ctx = createSystemTestContext()
})
afterEach(() => destroyContext(ctx))

describe('Migrated handler services return expected data shapes', () => {
  it('listInvoices returns items array', () => {
    const result = listInvoices(ctx.db, {
      fiscal_year_id: ctx.seed.fiscalYearId,
      status: 'all',
    })
    expect(result).toHaveProperty('items')
    expect(Array.isArray(result.items)).toBe(true)
  })

  it('listExpenses returns expenses array', () => {
    const result = listExpenses(ctx.db, {
      fiscal_year_id: ctx.seed.fiscalYearId,
      status: 'all',
    })
    expect(result).toHaveProperty('expenses')
    expect(Array.isArray(result.expenses)).toBe(true)
  })

  it('getDashboardSummary returns revenue and operating result', () => {
    const summary = getDashboardSummary(ctx.db, ctx.seed.fiscalYearId)
    expect(summary).toHaveProperty('revenueOre')
    expect(summary).toHaveProperty('operatingResultOre')
    expect(typeof summary.revenueOre).toBe('number')
  })

  it('getVatReport returns quarters', () => {
    const report = getVatReport(ctx.db, ctx.seed.fiscalYearId)
    expect(report).toHaveProperty('quarters')
    expect(Array.isArray(report.quarters)).toBe(true)
  })

  it('getTaxForecast returns operating profit', () => {
    const forecast = getTaxForecast(ctx.db, ctx.seed.fiscalYearId)
    expect(forecast).toHaveProperty('operatingProfitOre')
    expect(typeof forecast.operatingProfitOre).toBe('number')
  })

  it('getIncomeStatement returns groups and netResult', () => {
    const result = getIncomeStatement(ctx.db, ctx.seed.fiscalYearId)
    expect(result).toHaveProperty('groups')
    expect(result).toHaveProperty('netResult')
  })

  it('getBalanceSheet returns assets and equity sections', () => {
    const result = getBalanceSheet(ctx.db, ctx.seed.fiscalYearId)
    expect(result).toHaveProperty('assets')
    expect(result).toHaveProperty('equityAndLiabilities')
  })

  it('exportSie4 returns content buffer and filename', () => {
    const result = exportSie4(ctx.db, { fiscalYearId: ctx.seed.fiscalYearId })
    expect(result).toHaveProperty('content')
    expect(result).toHaveProperty('filename')
    expect(result.filename).toMatch(/\.se$/)
  })

  it('exportSie5 returns XML string', () => {
    const xml = exportSie5(ctx.db, { fiscalYearId: ctx.seed.fiscalYearId })
    expect(typeof xml).toBe('string')
    expect(xml).toContain('<?xml')
  })

  it('getPayments returns empty array for nonexistent invoice', () => {
    const payments = getPayments(ctx.db, 999999)
    expect(Array.isArray(payments)).toBe(true)
    expect(payments).toHaveLength(0)
  })

  it('getExpensePayments returns empty array for nonexistent expense', () => {
    const payments = getExpensePayments(ctx.db, 999999)
    expect(Array.isArray(payments)).toBe(true)
    expect(payments).toHaveLength(0)
  })
})
