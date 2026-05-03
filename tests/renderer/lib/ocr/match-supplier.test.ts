/**
 * Sprint VS-145c — matchSupplier pure-tester.
 *
 * Verifierar fuzzy-match-algoritm: substring-träff, suffix-strip,
 * Levenshtein-fallback, threshold, deterministisk multi-match.
 */
import { describe, it, expect } from 'vitest'
import {
  matchSupplier,
  normalizeSupplierName,
  levenshtein,
} from '../../../../src/renderer/lib/ocr/match-supplier'

describe('normalizeSupplierName', () => {
  it('lowercase + trim + strip AB', () => {
    expect(normalizeSupplierName('Acme AB')).toBe('acme')
    expect(normalizeSupplierName('  ACME ab  ')).toBe('acme')
  })
  it('strip Aktiebolag', () => {
    expect(normalizeSupplierName('Acme Aktiebolag')).toBe('acme')
  })
  it('strip interpunktion', () => {
    expect(normalizeSupplierName('Acme, AB.')).toBe('acme')
  })
  it('multi-word bevaras', () => {
    expect(normalizeSupplierName('Acme Sverige AB')).toBe('acme sverige')
  })
})

describe('levenshtein', () => {
  it('lika strängar → 0', () => {
    expect(levenshtein('acme', 'acme')).toBe(0)
  })
  it('en sub → 1', () => {
    expect(levenshtein('acme', 'acmd')).toBe(1)
  })
  it('en insertion → 1', () => {
    expect(levenshtein('acme', 'acmee')).toBe(1)
  })
  it('helt olika', () => {
    expect(levenshtein('abc', 'xyz')).toBe(3)
  })
})

describe('matchSupplier', () => {
  const candidates = [
    { id: 1, name: 'Acme AB' },
    { id: 2, name: 'Beta Corp' },
    { id: 3, name: 'Gamma Sverige Aktiebolag' },
  ]

  it('exact match (case-insensitive)', () => {
    const r = matchSupplier('ACME AB', candidates)
    expect(r).not.toBeNull()
    expect(r!.id).toBe(1)
    expect(r!.score).toBe(1.0)
  })

  it('substring: hint matchar längre namn', () => {
    const r = matchSupplier('Gamma', candidates)
    expect(r).not.toBeNull()
    expect(r!.id).toBe(3)
    expect(r!.score).toBe(1.0)
  })

  it('substring: namn matchar längre hint', () => {
    const r = matchSupplier('Acme Sverige Filial', candidates)
    expect(r).not.toBeNull()
    expect(r!.id).toBe(1)
    expect(r!.score).toBe(1.0)
  })

  it('suffix-strip: AB matchar Aktiebolag', () => {
    const r = matchSupplier('Gamma Sverige AB', candidates)
    expect(r).not.toBeNull()
    expect(r!.id).toBe(3)
  })

  it('typo (1-char-diff) över threshold', () => {
    // "acmee" vs "acme" → dist 1, max 5 → 0.8 ≥ 0.7
    const r = matchSupplier('Acmee AB', candidates)
    expect(r).not.toBeNull()
    expect(r!.id).toBe(1)
  })

  it('för stor distans → null', () => {
    const r = matchSupplier('Helt Annat Företag XYZ', candidates)
    expect(r).toBeNull()
  })

  it('tom kandidat-lista → null', () => {
    expect(matchSupplier('Acme', [])).toBeNull()
  })

  it('tom hint → null', () => {
    expect(matchSupplier('', candidates)).toBeNull()
  })

  it('för kort hint efter normalisering → null', () => {
    // "AB" → normaliserat "" (stripped som suffix). < 3 chars → null
    expect(matchSupplier('AB', candidates)).toBeNull()
  })

  it('för kort kandidat-namn skippas', () => {
    // Kandidat normaliserad < 3 chars → skippas, andra kandidater bedöms.
    const r = matchSupplier('Acme', [
      { id: 99, name: 'AB' }, // skippas
      { id: 1, name: 'Acme AB' },
    ])
    expect(r).not.toBeNull()
    expect(r!.id).toBe(1)
  })

  it('multi-match: deterministiskt val (alfabetisk första)', () => {
    // Båda kandidater matchar exakt via substring (score 1.0).
    // "alpha" < "beta" lexikografiskt → alpha vinner.
    const r = matchSupplier('Foo', [
      { id: 10, name: 'Beta Foo AB' },
      { id: 11, name: 'Alpha Foo AB' },
    ])
    expect(r).not.toBeNull()
    expect(r!.id).toBe(11)
    expect(r!.name).toBe('Alpha Foo AB')
  })

  // VS-145d: org-nr-prioritet
  describe('org-nr override (VS-145d)', () => {
    const candidatesWithOrg = [
      { id: 1, name: 'Acme AB', org_number: '556074-3089' },
      { id: 2, name: 'Beta Corp', org_number: '5567037485' },
      { id: 3, name: 'Gamma AB', org_number: null },
    ]

    it('exakt org-nr-match override:ar dålig hint-match', () => {
      // Hint matchar inget bra, men org-nr matchar Acme exakt.
      const r = matchSupplier('Helt Annat XYZ', candidatesWithOrg, {
        orgNumber: '556074-3089',
      })
      expect(r).not.toBeNull()
      expect(r!.id).toBe(1)
      expect(r!.score).toBe(1.0)
    })

    it('org-nr-match utan hint alls fungerar', () => {
      const r = matchSupplier('', candidatesWithOrg, {
        orgNumber: '556074-3089',
      })
      expect(r).not.toBeNull()
      expect(r!.id).toBe(1)
    })

    it('normaliserar bindestreck-skillnad mellan OCR och DB', () => {
      // OCR: med bindestreck. DB: utan bindestreck (Beta Corp).
      const r = matchSupplier('', candidatesWithOrg, {
        orgNumber: '556703-7485',
      })
      expect(r).not.toBeNull()
      expect(r!.id).toBe(2)
    })

    it('org-nr utan match i kandidater → fallback till hint', () => {
      // 559999-9994 finns inte i listan → fallthrough till hint-match på "Beta".
      const r = matchSupplier('Beta', candidatesWithOrg, {
        orgNumber: '559999-9994',
      })
      expect(r).not.toBeNull()
      expect(r!.id).toBe(2) // matchad via hint, inte org
    })

    it('org-nr-mismatch i flera kandidater → exakt match väljs', () => {
      const r = matchSupplier('Beta', candidatesWithOrg, {
        orgNumber: '556074-3089',
      })
      // Acme matchar via org-nr, Beta via hint — org-nr vinner.
      expect(r).not.toBeNull()
      expect(r!.id).toBe(1)
    })

    it('kandidater utan org_number ignoreras i org-nr-fas', () => {
      // Gamma har null. Org-nr-match ska inte krasha.
      const r = matchSupplier('Gamma', candidatesWithOrg, {
        orgNumber: '556074-3089',
      })
      // Acme via org-nr (1.0), Gamma via hint (1.0) → Acme vinner via org-prio.
      expect(r!.id).toBe(1)
    })
  })
})
