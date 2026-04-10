import { describe, it, expect } from 'vitest'
import { calculateOCR } from '../src/main/services/pdf/ocr'

describe('calculateOCR', () => {
  it('strips non-digits and pads to 4', () => {
    const result = calculateOCR('A1')
    // "1" → padded "0001" → Luhn kontrollsiffra 8
    expect(result).toMatch(/^\d{5}$/)
  })

  it('handles pure number input', () => {
    const result = calculateOCR('1234')
    expect(result).toMatch(/^\d{5}$/)
  })

  it('golden reference: A0001 → 00018', () => {
    expect(calculateOCR('A0001')).toBe('00018')
  })

  it('golden reference: A0002 → 00026', () => {
    expect(calculateOCR('A0002')).toBe('00026')
  })

  it('different inputs give different OCRs', () => {
    const ocr1 = calculateOCR('A0001')
    const ocr2 = calculateOCR('A0002')
    expect(ocr1).not.toBe(ocr2)
  })

  it('result is always only digits', () => {
    const result = calculateOCR('A12B34')
    expect(result).toMatch(/^\d+$/)
  })

  it('validates Luhn: check digit makes total sum divisible by 10', () => {
    const ocr = calculateOCR('A0001')
    // Standard Luhn-validering: iterera hela OCR (inkl kontrollsiffra)
    let sum = 0
    const digits = ocr.split('').map(Number)
    for (let i = 0; i < digits.length; i++) {
      let d = digits[digits.length - 1 - i]
      if (i % 2 === 1) {
        d *= 2
        if (d > 9) d -= 9
      }
      sum += d
    }
    expect(sum % 10).toBe(0)
  })
})
