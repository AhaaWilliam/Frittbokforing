/**
 * Sprint VS-145d — extractOrgNumber + Luhn-validering.
 *
 * Verifierar svenska org-nr-format (med/utan bindestreck), Luhn-checksum,
 * inbäddat i löpande text, ogiltiga och multipla.
 */
import { describe, it, expect } from 'vitest'
import {
  extractOrgNumber,
  isValidSwedishOrgNumber,
  normalizeOrgNumber,
} from '../../../../src/renderer/lib/ocr/extract-org-number'

describe('isValidSwedishOrgNumber', () => {
  it('accepterar känt giltigt org-nr (Volvo Personvagnar 556074-3089)', () => {
    expect(isValidSwedishOrgNumber('5560743089')).toBe(true)
  })

  it('accepterar känt giltigt org-nr (Spotify 556703-7485)', () => {
    expect(isValidSwedishOrgNumber('5567037485')).toBe(true)
  })

  it('avvisar ogiltig kontrollsiffra', () => {
    expect(isValidSwedishOrgNumber('5560743080')).toBe(false)
  })

  it('avvisar för kort sträng', () => {
    expect(isValidSwedishOrgNumber('123456789')).toBe(false)
  })

  it('avvisar icke-siffror', () => {
    expect(isValidSwedishOrgNumber('556074308a')).toBe(false)
  })
})

describe('extractOrgNumber', () => {
  it('format med bindestreck', () => {
    const r = extractOrgNumber('Org.nr: 556074-3089')
    expect(r.value).toBe('556074-3089')
    expect(r.confidence).toBe(100)
  })

  it('format utan bindestreck', () => {
    const r = extractOrgNumber('Företaget AB 5560743089 Stockholm')
    expect(r.value).toBe('556074-3089')
    expect(r.confidence).toBe(100)
  })

  it('inbäddat i text med VAT-nr efter', () => {
    const r = extractOrgNumber(
      'Acme AB\nOrg.nr: 556074-3089 / Vatnr SE556074308901',
    )
    expect(r.value).toBe('556074-3089')
  })

  it('ogiltig Luhn → ingen match', () => {
    const r = extractOrgNumber('Org.nr: 556074-3080')
    expect(r.value).toBeUndefined()
    expect(r.confidence).toBe(0)
  })

  it('för kort siffersekvens → ingen match', () => {
    const r = extractOrgNumber('Tel: 12345-67')
    expect(r.value).toBeUndefined()
  })

  it('multipla giltiga → första vinner (typiskt överst på kvitto)', () => {
    // 556074-3089 (giltigt) före 556703-7485 (också giltigt)
    const r = extractOrgNumber('Org.nr 556074-3089\nKundnr 556703-7485')
    expect(r.value).toBe('556074-3089')
  })

  it('ogiltig + giltig → giltig vinner även om kommer senare', () => {
    const r = extractOrgNumber('Ref 5560743080 Org.nr 556074-3089')
    expect(r.value).toBe('556074-3089')
  })

  it('telefon-/postnummer i samma längd matchar inte (Luhn-gate)', () => {
    // 0701234567 är ett möjligt mobilnummer, validera att Luhn rensar.
    const r = extractOrgNumber('Tel 0701234567')
    expect(r.value).toBeUndefined()
  })

  it('tom text', () => {
    expect(extractOrgNumber('').confidence).toBe(0)
  })

  it('11-siffrig sekvens kring matchen exkluderas av guard', () => {
    // 12345607430899 — vill inte att en delsekvens råkar matcha.
    const r = extractOrgNumber('12345607430899')
    expect(r.value).toBeUndefined()
  })
})

describe('normalizeOrgNumber', () => {
  it('lägger på bindestreck', () => {
    expect(normalizeOrgNumber('5560743089')).toBe('556074-3089')
  })
  it('behåller bindestreck', () => {
    expect(normalizeOrgNumber('556074-3089')).toBe('556074-3089')
  })
  it('null vid fel längd', () => {
    expect(normalizeOrgNumber('123')).toBeNull()
    expect(normalizeOrgNumber(null)).toBeNull()
    expect(normalizeOrgNumber('')).toBeNull()
  })
})
