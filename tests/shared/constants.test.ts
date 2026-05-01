import { describe, it, expect } from 'vitest'
import {
  formatSwedishNumber,
  MAX_QTY_INVOICE,
  MAX_QTY_EXPENSE,
  ERR_MSG_MAX_QTY_INVOICE,
  ERR_MSG_MAX_QTY_EXPENSE,
  BFL_ALLOWED_START_MONTHS,
  ERR_MSG_INVALID_FY_START_MONTH,
  MAX_FEE_HEURISTIC_ORE,
  FEE_SCORE_HIGH,
  FEE_SCORE_MEDIUM,
} from '../../src/shared/constants'

describe('formatSwedishNumber', () => {
  it('default 0 decimaler', () => {
    expect(formatSwedishNumber(1234)).toMatch(/1\s?234/)
  })

  it('1 decimal', () => {
    expect(formatSwedishNumber(12.5, 1)).toBe('12,5')
  })

  it('2 decimaler', () => {
    expect(formatSwedishNumber(9999.99, 2)).toMatch(/9\s?999,99/)
  })

  it('komma som decimaltecken (sv-SE)', () => {
    expect(formatSwedishNumber(1.5, 1)).toBe('1,5')
  })

  it('0 → "0"', () => {
    expect(formatSwedishNumber(0)).toBe('0')
  })

  it('negativa belopp', () => {
    const out = formatSwedishNumber(-100, 0)
    expect(out).toContain('100')
    // sv-SE använder Unicode minus
    expect(out.startsWith('−') || out.startsWith('-')).toBe(true)
  })
})

describe('MAX_QTY-konstanter', () => {
  it('MAX_QTY_INVOICE = 9999.99 (decimal)', () => {
    expect(MAX_QTY_INVOICE).toBe(9999.99)
  })

  it('MAX_QTY_EXPENSE = 9999 (integer)', () => {
    expect(MAX_QTY_EXPENSE).toBe(9999)
  })

  it('error-meddelanden inkluderar formaterat max-värde', () => {
    expect(ERR_MSG_MAX_QTY_INVOICE).toMatch(/9\s?999,99/)
    expect(ERR_MSG_MAX_QTY_EXPENSE).toMatch(/9\s?999/)
  })
})

describe('BFL_ALLOWED_START_MONTHS', () => {
  it('exakt 5 månader: 1, 5, 7, 9, 11', () => {
    expect(BFL_ALLOWED_START_MONTHS).toEqual([1, 5, 7, 9, 11])
  })

  it('error-meddelandet innehåller alla månadsnamn', () => {
    expect(ERR_MSG_INVALID_FY_START_MONTH).toContain('jan')
    expect(ERR_MSG_INVALID_FY_START_MONTH).toContain('maj')
    expect(ERR_MSG_INVALID_FY_START_MONTH).toContain('jul')
    expect(ERR_MSG_INVALID_FY_START_MONTH).toContain('sep')
    expect(ERR_MSG_INVALID_FY_START_MONTH).toContain('nov')
  })

  it('error-meddelandet refererar BFL 3 kap 1§', () => {
    expect(ERR_MSG_INVALID_FY_START_MONTH).toContain('BFL 3 kap 1§')
  })
})

describe('Bank-fee-classifier-konstanter (M153)', () => {
  it('MAX_FEE_HEURISTIC_ORE = 100 000 öre (1000 kr)', () => {
    expect(MAX_FEE_HEURISTIC_ORE).toBe(100_000)
  })

  it('FEE_SCORE_HIGH = 100 (heltal — M153)', () => {
    expect(FEE_SCORE_HIGH).toBe(100)
    expect(Number.isInteger(FEE_SCORE_HIGH)).toBe(true)
  })

  it('FEE_SCORE_MEDIUM = 50 (heltal — M153)', () => {
    expect(FEE_SCORE_MEDIUM).toBe(50)
    expect(Number.isInteger(FEE_SCORE_MEDIUM)).toBe(true)
  })

  it('HIGH > MEDIUM (sortering-invariant)', () => {
    expect(FEE_SCORE_HIGH).toBeGreaterThan(FEE_SCORE_MEDIUM)
  })
})
