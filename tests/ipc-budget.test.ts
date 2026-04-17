/**
 * IPC schema validation tests for budget channels.
 */
import { describe, it, expect } from 'vitest'
import {
  BudgetLinesSchema,
  BudgetGetSchema,
  BudgetSaveSchema,
  BudgetVarianceSchema,
  BudgetCopySchema,
} from '../src/shared/ipc-schemas'

describe('BudgetLinesSchema', () => {
  it('accepts empty object', () => {
    expect(BudgetLinesSchema.safeParse({}).success).toBe(true)
  })

  it('rejects extra props (strict)', () => {
    expect(BudgetLinesSchema.safeParse({ extra: 1 }).success).toBe(false)
  })
})

describe('BudgetGetSchema', () => {
  it('accepts valid fiscal_year_id', () => {
    expect(BudgetGetSchema.safeParse({ fiscal_year_id: 1 }).success).toBe(true)
  })

  it('rejects missing fiscal_year_id', () => {
    expect(BudgetGetSchema.safeParse({}).success).toBe(false)
  })
})

describe('BudgetSaveSchema', () => {
  it('accepts valid targets', () => {
    const result = BudgetSaveSchema.safeParse({
      fiscal_year_id: 1,
      targets: [
        { line_id: 'net_revenue', period_number: 1, amount_ore: 100000 },
        { line_id: 'materials', period_number: 6, amount_ore: -50000 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('allows negative amount_ore', () => {
    const result = BudgetSaveSchema.safeParse({
      fiscal_year_id: 1,
      targets: [
        { line_id: 'materials', period_number: 1, amount_ore: -999999 },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects empty targets array', () => {
    expect(
      BudgetSaveSchema.safeParse({ fiscal_year_id: 1, targets: [] }).success,
    ).toBe(false)
  })

  it('rejects period_number > 12', () => {
    expect(
      BudgetSaveSchema.safeParse({
        fiscal_year_id: 1,
        targets: [
          { line_id: 'net_revenue', period_number: 13, amount_ore: 100 },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects period_number < 1', () => {
    expect(
      BudgetSaveSchema.safeParse({
        fiscal_year_id: 1,
        targets: [
          { line_id: 'net_revenue', period_number: 0, amount_ore: 100 },
        ],
      }).success,
    ).toBe(false)
  })

  it('rejects non-integer amount_ore', () => {
    expect(
      BudgetSaveSchema.safeParse({
        fiscal_year_id: 1,
        targets: [
          { line_id: 'net_revenue', period_number: 1, amount_ore: 100.5 },
        ],
      }).success,
    ).toBe(false)
  })
})

describe('BudgetVarianceSchema', () => {
  it('accepts valid input', () => {
    expect(BudgetVarianceSchema.safeParse({ fiscal_year_id: 1 }).success).toBe(
      true,
    )
  })
})

describe('BudgetCopySchema', () => {
  it('accepts valid input', () => {
    expect(
      BudgetCopySchema.safeParse({
        target_fiscal_year_id: 2,
        source_fiscal_year_id: 1,
      }).success,
    ).toBe(true)
  })

  it('rejects missing source', () => {
    expect(
      BudgetCopySchema.safeParse({ target_fiscal_year_id: 2 }).success,
    ).toBe(false)
  })
})
