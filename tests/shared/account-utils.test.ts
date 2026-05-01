import { describe, it, expect } from 'vitest'
import { compareAccountNumbers } from '../../src/shared/account-number'
import {
  isBalanceSheetAccount,
  isIncomeStatementAccount,
  BALANCE_SHEET_CLASS_MIN,
  BALANCE_SHEET_CLASS_MAX,
  INCOME_STATEMENT_CLASS_MIN,
  INCOME_STATEMENT_CLASS_MAX,
  BALANCE_SHEET_SQL_RANGE,
} from '../../src/shared/account-ranges'

describe('compareAccountNumbers (M98 — F4)', () => {
  it('numerisk ordning, inte lexikografisk', () => {
    // Lexikografiskt: '30000' > '4000'. Numeriskt: 30000 > 4000 (samma).
    // Verklig F4-regression: '8999' < '89991' lexikografiskt, men 8999 < 89991 numeriskt.
    expect(compareAccountNumbers('8999', '89991')).toBeLessThan(0)
  })

  it('1930 < 2440', () => {
    expect(compareAccountNumbers('1930', '2440')).toBeLessThan(0)
  })

  it('lika konton ger 0', () => {
    expect(compareAccountNumbers('1930', '1930')).toBe(0)
  })

  it('sortable som kompator', () => {
    const arr = ['8999', '1930', '89991', '4000']
    arr.sort(compareAccountNumbers)
    expect(arr).toEqual(['1930', '4000', '8999', '89991'])
  })
})

describe('isBalanceSheetAccount', () => {
  it('1xxx → true', () => {
    expect(isBalanceSheetAccount('1930')).toBe(true)
    expect(isBalanceSheetAccount('1230')).toBe(true)
  })

  it('2xxx → true', () => {
    expect(isBalanceSheetAccount('2440')).toBe(true)
  })

  it('3xxx-8xxx → false', () => {
    expect(isBalanceSheetAccount('3000')).toBe(false)
    expect(isBalanceSheetAccount('8999')).toBe(false)
  })

  it('5-siffriga underkonton matchar (M98)', () => {
    expect(isBalanceSheetAccount('19305')).toBe(true)
    expect(isBalanceSheetAccount('29991')).toBe(true)
    expect(isBalanceSheetAccount('30001')).toBe(false)
  })
})

describe('isIncomeStatementAccount', () => {
  it('3xxx-8xxx → true', () => {
    expect(isIncomeStatementAccount('3000')).toBe(true)
    expect(isIncomeStatementAccount('8999')).toBe(true)
  })

  it('1xxx-2xxx → false', () => {
    expect(isIncomeStatementAccount('1930')).toBe(false)
    expect(isIncomeStatementAccount('2440')).toBe(false)
  })

  it('9xxx → false (utanför BAS)', () => {
    expect(isIncomeStatementAccount('9000')).toBe(false)
  })

  it('5-siffriga underkonton matchar (M98)', () => {
    expect(isIncomeStatementAccount('30001')).toBe(true)
    expect(isIncomeStatementAccount('89991')).toBe(true)
  })
})

describe('account-range konstanter', () => {
  it('BS: 1000–2999, IS: 3000–8999', () => {
    expect(BALANCE_SHEET_CLASS_MIN).toBe(1000)
    expect(BALANCE_SHEET_CLASS_MAX).toBe(2999)
    expect(INCOME_STATEMENT_CLASS_MIN).toBe(3000)
    expect(INCOME_STATEMENT_CLASS_MAX).toBe(8999)
  })

  it('SQL-range innehåller CAST + BETWEEN', () => {
    expect(BALANCE_SHEET_SQL_RANGE).toMatch(/CAST/)
    expect(BALANCE_SHEET_SQL_RANGE).toMatch(/BETWEEN 1000 AND 2999/)
  })
})
