import { describe, it, expect } from 'vitest'
import {
  BK_TX_CODE_MAP,
  type BkTxCd,
} from '../../src/main/services/bank/mt940-bktxcd-mapping'

describe('BK_TX_CODE_MAP', () => {
  it('innehåller alla MT940-koder som classifier behöver', () => {
    // Subset som förväntas finnas (från sprint Q T3.d):
    expect(BK_TX_CODE_MAP).toHaveProperty('NCHG')
    expect(BK_TX_CODE_MAP).toHaveProperty('NINT')
    expect(BK_TX_CODE_MAP).toHaveProperty('NTRF')
    expect(BK_TX_CODE_MAP).toHaveProperty('NDDT')
    expect(BK_TX_CODE_MAP).toHaveProperty('NMSC')
    expect(BK_TX_CODE_MAP).toHaveProperty('NCOM')
  })

  it('NCHG (charge) mappas till PMNT/CCRD/CHRG (bank-fee classifier)', () => {
    expect(BK_TX_CODE_MAP.NCHG).toEqual({
      domain: 'PMNT',
      family: 'CCRD',
      subfamily: 'CHRG',
    })
  })

  it('NINT (interest) mappas till PMNT/CCRD/INTR', () => {
    expect(BK_TX_CODE_MAP.NINT).toEqual({
      domain: 'PMNT',
      family: 'CCRD',
      subfamily: 'INTR',
    })
  })

  it('NTRF (standing order credit) mappas till ACMT/RCDT/STDO', () => {
    expect(BK_TX_CODE_MAP.NTRF.subfamily).toBe('STDO')
  })

  it('NDDT (direct debit) mappas till ACMT/DD/PMDD', () => {
    expect(BK_TX_CODE_MAP.NDDT.family).toBe('DD')
  })

  it('alla värden är giltiga BkTxCd-strukturer', () => {
    for (const code of Object.keys(BK_TX_CODE_MAP)) {
      const v: BkTxCd = BK_TX_CODE_MAP[code]
      expect(v.domain).toMatch(/^[A-Z]{4}$/)
      expect(v.family).toMatch(/^[A-Z]{2,4}$/)
      expect(v.subfamily).toMatch(/^[A-Z]{4}$/)
    }
  })

  it('okända MT940-koder ska INTE finnas i mappen', () => {
    expect(BK_TX_CODE_MAP).not.toHaveProperty('NXXX')
    expect(BK_TX_CODE_MAP).not.toHaveProperty('UNKNOWN')
  })
})
