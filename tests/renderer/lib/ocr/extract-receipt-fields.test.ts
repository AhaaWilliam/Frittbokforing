import { describe, it, expect } from 'vitest'
import {
  extractAmountKr,
  extractDate,
  extractSupplierHint,
  extractReceiptFields,
} from '../../../../src/renderer/lib/ocr/extract-receipt-fields'

describe('extractAmountKr', () => {
  it('parsar svenskt komma-format med tusentals-separator', () => {
    const result = extractAmountKr('Total: 1 234,50 kr')
    expect(result.value).toBe(1234.5)
    expect(result.confidence).toBe(100) // keyword "Total"
  })

  it('parsar punkt-decimal-format', () => {
    const result = extractAmountKr('1234.50 kr')
    expect(result.value).toBe(1234.5)
    expect(result.confidence).toBe(80) // currency utan keyword
  })

  it('parsar belopp utan decimaler med kr-suffix', () => {
    const result = extractAmountKr('Att betala 5 678 kr')
    expect(result.value).toBe(5678)
    expect(result.confidence).toBe(100) // keyword "Att betala"
  })

  it('väljer största beloppet vid flera kandidater utan keyword', () => {
    const text = '50,00 kr\nMoms 12,50 kr\nNetto 200,00 kr'
    const result = extractAmountKr(text)
    expect(result.value).toBe(200)
  })

  it('föredrar keyword-rad över större belopp utan keyword', () => {
    const text = 'Något 9999,99 kr\nSumma: 100,00 kr'
    const result = extractAmountKr(text)
    expect(result.value).toBe(100)
    expect(result.confidence).toBe(100)
  })

  it('returnerar confidence 0 för tom text', () => {
    expect(extractAmountKr('')).toEqual({ confidence: 0 })
    expect(extractAmountKr('   ')).toEqual({ confidence: 0 })
  })

  it('hoppar över rena heltal utan currency eller keyword (org-nr-skydd)', () => {
    const result = extractAmountKr('556677-8899\n123456')
    expect(result.value).toBeUndefined()
    expect(result.confidence).toBe(0)
  })

  it('hanterar :- suffix', () => {
    const result = extractAmountKr('Totalsumma 450:-')
    expect(result.value).toBe(450)
  })
})

describe('extractDate', () => {
  it('parsar ISO-format yyyy-mm-dd', () => {
    const result = extractDate('Datum: 2026-05-03')
    expect(result.value).toBe('2026-05-03')
    expect(result.confidence).toBe(100) // keyword
  })

  it('parsar slash-format dd/mm/yyyy', () => {
    const result = extractDate('Köpdatum 03/05/2026')
    expect(result.value).toBe('2026-05-03')
    expect(result.confidence).toBe(100)
  })

  it('parsar punkt-format dd.mm.yyyy', () => {
    const result = extractDate('03.05.2026')
    expect(result.value).toBe('2026-05-03')
    expect(result.confidence).toBe(80) // utan keyword
  })

  it('parsar svenskt månadsnamn', () => {
    const result = extractDate('3 maj 2026')
    expect(result.value).toBe('2026-05-03')
  })

  it('parsar förkortat svenskt månadsnamn', () => {
    const result = extractDate('15 dec 2026')
    expect(result.value).toBe('2026-12-15')
  })

  it('avvisar ogiltigt datum (månad 13)', () => {
    const result = extractDate('2026-13-01')
    expect(result.value).toBeUndefined()
  })

  it('returnerar confidence 0 för tom text', () => {
    expect(extractDate('')).toEqual({ confidence: 0 })
  })

  it('expanderar tvåsiffrigt år till 20xx', () => {
    const result = extractDate('03/05/26')
    expect(result.value).toBe('2026-05-03')
  })
})

describe('extractSupplierHint', () => {
  it('väljer första icke-tomma rad som inte är belopp/datum', () => {
    const text = 'ICA Maxi Stockholm\nDatum 2026-05-03\nTotal 250 kr'
    const result = extractSupplierHint(text)
    expect(result.value).toBe('ICA Maxi Stockholm')
    expect(result.confidence).toBe(80)
  })

  it('hoppar över rena nummer-rader', () => {
    const text = '12345\n556677-8899\nApoteket Hjärtat'
    const result = extractSupplierHint(text)
    expect(result.value).toBe('Apoteket Hjärtat')
  })

  it('truncar till 60 tecken', () => {
    const longName = 'A'.repeat(80)
    const result = extractSupplierHint(longName)
    expect(result.value?.length).toBe(60)
  })

  it('returnerar confidence 0 för tom text', () => {
    expect(extractSupplierHint('')).toEqual({ confidence: 0 })
  })

  it('hoppar över rader med belopp-keyword', () => {
    const text = 'Summa 100\nClas Ohlson AB'
    const result = extractSupplierHint(text)
    expect(result.value).toBe('Clas Ohlson AB')
  })
})

describe('extractReceiptFields (komposition)', () => {
  it('returnerar alla tre fält när OCR-confidence är hög', () => {
    const text = 'ICA Maxi\nDatum 2026-05-03\nTotal: 1 234,50 kr'
    const result = extractReceiptFields(text, 95)
    expect(result.amount_kr).toBe(1234.5)
    expect(result.date).toBe('2026-05-03')
    expect(result.supplier_hint).toBe('ICA Maxi')
    expect(result.confidence).toBe(95)
  })

  it('returnerar inga fält när ocrConfidence < 70', () => {
    const text = 'ICA Maxi\nDatum 2026-05-03\nTotal: 1 234,50 kr'
    const result = extractReceiptFields(text, 50)
    expect(result.amount_kr).toBeUndefined()
    expect(result.date).toBeUndefined()
    expect(result.supplier_hint).toBeUndefined()
    expect(result.confidence).toBe(50)
  })

  it('släpper bara fält som klarar threshold individuellt', () => {
    // OCR ger 75 — clamp gör att fält med regex-quality 60 (rena belopp utan
    // currency/keyword) kommer under 70 och utesluts.
    const text = 'ICA Maxi\nDatum 2026-05-03\n1234.50 kr'
    const result = extractReceiptFields(text, 75)
    expect(result.amount_kr).toBe(1234.5) // 80 -> clamp 75 OK
    expect(result.date).toBe('2026-05-03') // keyword 100 -> clamp 75 OK
    expect(result.supplier_hint).toBe('ICA Maxi') // 80 -> clamp 75 OK
  })

  it('hanterar tom text utan att krascha', () => {
    const result = extractReceiptFields('', 0)
    expect(result.amount_kr).toBeUndefined()
    expect(result.date).toBeUndefined()
    expect(result.supplier_hint).toBeUndefined()
    expect(result.confidence).toBe(0)
  })
})
