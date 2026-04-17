/**
 * IPC schema validation tests for accrual channels.
 */
import { describe, it, expect } from 'vitest'
import {
  AccrualCreateSchema,
  AccrualListSchema,
  AccrualExecuteSchema,
  AccrualExecuteAllSchema,
  AccrualDeactivateSchema,
} from '../src/shared/ipc-schemas'

describe('AccrualCreateSchema', () => {
  const valid = {
    fiscal_year_id: 1,
    description: 'Förutbetald hyra',
    accrual_type: 'prepaid_expense' as const,
    balance_account: '1710',
    result_account: '5010',
    total_amount_ore: 120000,
    period_count: 6,
    start_period: 1,
  }

  it('accepts valid input', () => {
    expect(AccrualCreateSchema.safeParse(valid).success).toBe(true)
  })

  it('accepts all 4 accrual types', () => {
    for (const t of [
      'prepaid_expense',
      'accrued_expense',
      'prepaid_income',
      'accrued_income',
    ]) {
      expect(
        AccrualCreateSchema.safeParse({ ...valid, accrual_type: t }).success,
      ).toBe(true)
    }
  })

  it('rejects invalid accrual_type', () => {
    expect(
      AccrualCreateSchema.safeParse({ ...valid, accrual_type: 'invalid' })
        .success,
    ).toBe(false)
  })

  it('rejects start_period + period_count > 12', () => {
    expect(
      AccrualCreateSchema.safeParse({
        ...valid,
        start_period: 8,
        period_count: 6,
      }).success,
    ).toBe(false)
  })

  it('accepts start_period + period_count = 12', () => {
    expect(
      AccrualCreateSchema.safeParse({
        ...valid,
        start_period: 7,
        period_count: 6,
      }).success,
    ).toBe(true)
  })

  it('rejects period_count < 2', () => {
    expect(
      AccrualCreateSchema.safeParse({ ...valid, period_count: 1 }).success,
    ).toBe(false)
  })

  it('rejects total_amount_ore <= 0', () => {
    expect(
      AccrualCreateSchema.safeParse({ ...valid, total_amount_ore: 0 }).success,
    ).toBe(false)
  })
})

describe('AccrualListSchema', () => {
  it('accepts valid input', () => {
    expect(AccrualListSchema.safeParse({ fiscal_year_id: 1 }).success).toBe(
      true,
    )
  })
})

describe('AccrualExecuteSchema', () => {
  it('accepts valid input', () => {
    expect(
      AccrualExecuteSchema.safeParse({ schedule_id: 1, period_number: 3 })
        .success,
    ).toBe(true)
  })

  it('rejects period_number > 12', () => {
    expect(
      AccrualExecuteSchema.safeParse({ schedule_id: 1, period_number: 13 })
        .success,
    ).toBe(false)
  })
})

describe('AccrualExecuteAllSchema', () => {
  it('accepts valid input', () => {
    expect(
      AccrualExecuteAllSchema.safeParse({ fiscal_year_id: 1, period_number: 6 })
        .success,
    ).toBe(true)
  })
})

describe('AccrualDeactivateSchema', () => {
  it('accepts valid input', () => {
    expect(AccrualDeactivateSchema.safeParse({ schedule_id: 1 }).success).toBe(
      true,
    )
  })

  it('rejects missing schedule_id', () => {
    expect(AccrualDeactivateSchema.safeParse({}).success).toBe(false)
  })
})
