import { describe, it, expect } from 'vitest'
import { detectFormat } from '../src/main/services/bank/bank-statement-service'

describe('Sprint Q — detectFormat (autodetektion)', () => {
  it('camt.053 XML → detekterad', () => {
    const xml =
      '<?xml version="1.0"?>\n<Document><BkToCstmrStmt>...</BkToCstmrStmt></Document>'
    expect(detectFormat(xml)).toBe('camt.053')
  })

  it('camt.054 XML → detekterad', () => {
    const xml =
      '<?xml version="1.0"?>\n<Document><BkToCstmrDbtCdtNtfctn>...</BkToCstmrDbtCdtNtfctn></Document>'
    expect(detectFormat(xml)).toBe('camt.054')
  })

  it('XML utan BkToCstmr-* → PARSE_ERROR', () => {
    expect(() => detectFormat('<?xml version="1.0"?><Foo/>')).toThrow()
  })

  it('MT940 med SWIFT-block → detekterad', () => {
    const mt940 = '{1:F01BANKSESSXXXX}\n:20:REF\n:25:SE\n:60F:C\n:62F:C'
    expect(detectFormat(mt940)).toBe('mt940')
  })

  it('MT940 utan SWIFT-header (börjar med :20:) → detekterad', () => {
    const mt940 =
      ':20:REF123\n:25:SE1234\n:60F:C250101SEK100,00\n:62F:C250131SEK100,00'
    expect(detectFormat(mt940)).toBe('mt940')
  })

  it('BGMAX (börjar med "01" + 10+ siffror) → detekterad', () => {
    const bgmax = '01202501151200000000001234SEK' + ' '.repeat(50)
    expect(detectFormat(bgmax)).toBe('bgmax')
  })

  it('BOM i början tolereras (camt.053)', () => {
    const xml =
      '\uFEFF<?xml version="1.0"?>\n<Document><BkToCstmrStmt>...</BkToCstmrStmt></Document>'
    expect(detectFormat(xml)).toBe('camt.053')
  })

  it('Leading whitespace tolereras (MT940)', () => {
    const mt940 = '\n\n   :20:REF\n:25:SE\n:60F:C\n:62F:C'
    expect(detectFormat(mt940)).toBe('mt940')
  })

  it('Okänt format → PARSE_ERROR', () => {
    expect(() => detectFormat('Slumpmässig text utan format-markör')).toThrow()
  })

  it('Tom fil → PARSE_ERROR', () => {
    expect(() => detectFormat('')).toThrow()
  })
})
