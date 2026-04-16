import { describe, it, expect } from 'vitest'
import { CreateCompanyInputSchema } from '../src/shared/ipc-schemas'
import { BFL_ALLOWED_START_MONTHS } from '../src/shared/constants'

function makeInput(startMonth: number) {
  const sm = String(startMonth).padStart(2, '0')
  // Compute end: 12 months from start_month, last day of prev month
  const endMonth = ((startMonth - 1 + 11) % 12) + 1
  const endYear = startMonth === 1 ? 2026 : 2027
  const endDay = new Date(endYear, endMonth, 0).getDate()
  const em = String(endMonth).padStart(2, '0')

  return {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2' as const,
    share_capital: 2_500_000,
    registration_date: '2020-01-01',
    fiscal_year_start: `2026-${sm}-01`,
    fiscal_year_end: `${endYear}-${em}-${String(endDay).padStart(2, '0')}`,
  }
}

describe('F61 — BFL start month validation', () => {
  it('rejects start_month=3 (mars)', () => {
    const result = CreateCompanyInputSchema.safeParse(makeInput(3))
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.includes('fiscal_year_start'),
      )
      expect(issue).toBeDefined()
      expect(issue?.message).toContain('BFL 3 kap 1§')
    }
  })

  it('rejects start_month=6 (juni)', () => {
    const result = CreateCompanyInputSchema.safeParse(makeInput(6))
    expect(result.success).toBe(false)
    if (!result.success) {
      const issue = result.error.issues.find((i) =>
        i.path.includes('fiscal_year_start'),
      )
      expect(issue).toBeDefined()
      expect(issue?.message).toContain('BFL 3 kap 1§')
    }
  })

  it('accepts start_month=7 (juli)', () => {
    const result = CreateCompanyInputSchema.safeParse(makeInput(7))
    expect(result.success).toBe(true)
  })

  it('accepts start_month=1 (standard FY, jan-dec)', () => {
    const result = CreateCompanyInputSchema.safeParse(makeInput(1))
    expect(result.success).toBe(true)
  })

  it('accepts start_month=9 (september)', () => {
    const result = CreateCompanyInputSchema.safeParse(makeInput(9))
    expect(result.success).toBe(true)
  })

  it('BFL_ALLOWED_START_MONTHS covers all 5 legal months', () => {
    expect([...BFL_ALLOWED_START_MONTHS].sort((a, b) => a - b)).toEqual([
      1, 5, 7, 9, 11,
    ])
  })

  it('rejects all non-allowed months', () => {
    const forbidden = [2, 3, 4, 6, 8, 10, 12]
    for (const month of forbidden) {
      const result = CreateCompanyInputSchema.safeParse(makeInput(month))
      expect(result.success, `month ${month} should be rejected`).toBe(false)
    }
  })
})
