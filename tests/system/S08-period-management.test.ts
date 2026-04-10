/**
 * S08 — Periodstängning och dess effekter.
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from 'vitest'
import {
  createTemplateDb,
  createSystemTestContext,
  destroyContext,
  destroyTemplateDb,
  seedAndFinalizeInvoice,
  closeAllPeriods,
  type SystemTestContext,
} from './helpers/system-test-context'

let ctx: SystemTestContext

beforeAll(() => {
  createTemplateDb()
})
afterAll(() => {
  destroyTemplateDb()
})
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
  ctx = createSystemTestContext()
})
afterEach(() => {
  destroyContext(ctx)
  vi.useRealTimers()
})

describe('Period- och årshantering', () => {
  it('S08-01: sekventiell stängning — kan inte stänga mars innan feb', () => {
    const periods = ctx.seed.periods

    // Stäng jan → OK
    const r1 = ctx.fiscalService.closePeriod(ctx.db, periods[0].id)
    expect(r1.success).toBe(true)

    // Försök stänga mar (period 3) → MISSLYCKAS (feb öppen)
    const r2 = ctx.fiscalService.closePeriod(ctx.db, periods[2].id)
    expect(r2.success).toBe(false)

    // Stäng feb → OK
    const r3 = ctx.fiscalService.closePeriod(ctx.db, periods[1].id)
    expect(r3.success).toBe(true)

    // Nu kan mars stängas
    const r4 = ctx.fiscalService.closePeriod(ctx.db, periods[2].id)
    expect(r4.success).toBe(true)
  })

  it('S08-02: öppna bakifrån', () => {
    const periods = ctx.seed.periods

    // Stäng jan+feb+mar
    ctx.fiscalService.closePeriod(ctx.db, periods[0].id)
    ctx.fiscalService.closePeriod(ctx.db, periods[1].id)
    ctx.fiscalService.closePeriod(ctx.db, periods[2].id)

    // Öppna feb → MISSLYCKAS (mar stängd)
    const r1 = ctx.fiscalService.reopenPeriod(ctx.db, periods[1].id)
    expect(r1.success).toBe(false)

    // Öppna mar → OK
    const r2 = ctx.fiscalService.reopenPeriod(ctx.db, periods[2].id)
    expect(r2.success).toBe(true)

    // Nu kan feb öppnas
    const r3 = ctx.fiscalService.reopenPeriod(ctx.db, periods[1].id)
    expect(r3.success).toBe(true)
  })

  it('S08-03: bokföring i stängd period blockeras', () => {
    const periods = ctx.seed.periods

    // Stäng januari
    ctx.fiscalService.closePeriod(ctx.db, periods[0].id)

    // Försök finalisera faktura daterad i januari → MISSLYCKAS
    const result1 = seedAndFinalizeInvoiceGuarded(ctx, '2026-01-15')
    expect(result1.success).toBe(false)

    // Faktura daterad i februari → OK
    const result2 = seedAndFinalizeInvoiceGuarded(ctx, '2026-02-15')
    expect(result2.success).toBe(true)
  })

  it('S08-04: stängt räkenskapsår blockerar all bokföring', () => {
    // Stäng alla perioder + stäng FY
    closeAllPeriods(ctx)
    ctx.db
      .prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?')
      .run(ctx.seed.fiscalYearId)

    // Försök finalisera → MISSLYCKAS
    const result = seedAndFinalizeInvoiceGuarded(ctx, '2026-06-15')
    expect(result.success).toBe(false)
  })
})

/** Helper: attempt to seed+finalize an invoice and return success/failure without throwing */
function seedAndFinalizeInvoiceGuarded(
  ctx: SystemTestContext,
  invoiceDate: string,
): { success: boolean } {
  try {
    seedAndFinalizeInvoice(ctx, { invoiceDate })
    return { success: true }
  } catch {
    return { success: false }
  }
}
