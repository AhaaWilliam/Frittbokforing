import { describe, it, expect } from 'vitest'
import { mapAccountType } from '../../src/main/services/sie5/account-type-mapper'

describe('mapAccountType', () => {
  describe('klass 1 — Tillgångar', () => {
    it('1010 → asset', () => {
      expect(mapAccountType('1010')).toBe('asset')
    })
    it('1930 → asset', () => {
      expect(mapAccountType('1930')).toBe('asset')
    })
    it('1999 → asset', () => {
      expect(mapAccountType('1999')).toBe('asset')
    })
  })

  describe('klass 2 — Eget kapital + Skulder', () => {
    it('2010 (≤2099) → equity', () => {
      expect(mapAccountType('2010')).toBe('equity')
    })
    it('2099 → equity', () => {
      expect(mapAccountType('2099')).toBe('equity')
    })
    it('2100 → liability', () => {
      expect(mapAccountType('2100')).toBe('liability')
    })
    it('2440 → liability', () => {
      expect(mapAccountType('2440')).toBe('liability')
    })
  })

  describe('klass 3 — Intäkter', () => {
    it('3000 → income', () => {
      expect(mapAccountType('3000')).toBe('income')
    })
    it('3999 → income', () => {
      expect(mapAccountType('3999')).toBe('income')
    })
  })

  describe('klass 4-7 — Kostnader', () => {
    it('4000 → cost', () => {
      expect(mapAccountType('4000')).toBe('cost')
    })
    it('5010 → cost', () => {
      expect(mapAccountType('5010')).toBe('cost')
    })
    it('6230 → cost', () => {
      expect(mapAccountType('6230')).toBe('cost')
    })
    it('7832 → cost', () => {
      expect(mapAccountType('7832')).toBe('cost')
    })
  })

  describe('klass 8 — Finansiella poster (komplex)', () => {
    it('8000-8069 → income', () => {
      expect(mapAccountType('8010')).toBe('income')
      expect(mapAccountType('8069')).toBe('income')
    })

    it('8070-8089 → cost (avyttring)', () => {
      expect(mapAccountType('8070')).toBe('cost')
      expect(mapAccountType('8089')).toBe('cost')
    })

    it('8090-8399 → income', () => {
      expect(mapAccountType('8090')).toBe('income')
      expect(mapAccountType('8399')).toBe('income')
    })

    it('8400+ → cost', () => {
      expect(mapAccountType('8400')).toBe('cost')
      expect(mapAccountType('8999')).toBe('cost')
    })
  })

  describe('valideringsfel', () => {
    it('< 4 siffror kastar fel', () => {
      expect(() => mapAccountType('123')).toThrow(/Invalid BAS/)
    })

    it('icke-numerisk kastar fel', () => {
      expect(() => mapAccountType('abcd')).toThrow(/Invalid BAS/)
    })

    it('tom string kastar fel', () => {
      expect(() => mapAccountType('')).toThrow(/Invalid BAS/)
    })

    it('9xxx → kastar fel (utanför BAS standard)', () => {
      expect(() => mapAccountType('9000')).toThrow(/Cannot map/)
    })
  })

  describe('5-siffriga underkonton', () => {
    it('19305 → asset', () => {
      expect(mapAccountType('19305')).toBe('asset')
    })

    it('80891 → cost (8089-bandet)', () => {
      expect(mapAccountType('8089')).toBe('cost')
    })
  })
})
