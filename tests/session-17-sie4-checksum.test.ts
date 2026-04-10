import { describe, it, expect } from 'vitest'
import { crc32 } from 'node:zlib'
import { calculateKsumma } from '../src/main/services/sie4/sie4-checksum'

describe('SIE4 Checksum (KSUMMA)', () => {
  it('node:zlib crc32 producerar känt värde för "123456789"', () => {
    const result = crc32(Buffer.from('123456789'))
    // 0xCBF43926 = 3421780262 unsigned
    expect(result).toBe(0xcbf43926)
  })

  it('unsigned → signed konvertering korrekt', () => {
    // 0xCBF43926 unsigned = -873187034 signed
    const signed = 0xcbf43926 | 0
    expect(signed).toBe(-873187034)
  })

  it('calculateKsumma returnerar signed 32-bit', () => {
    const result = calculateKsumma('test')
    expect(typeof result).toBe('number')
    // Should be a valid signed 32-bit integer
    expect(result).toBeGreaterThanOrEqual(-2147483648)
    expect(result).toBeLessThanOrEqual(2147483647)
  })

  it('CP437 med svenska tecken ger deterministisk checksumma', () => {
    const content = '#FNAMN "Fritt Bokföring ÅÄÖ"\r\n'
    const r1 = calculateKsumma(content)
    const r2 = calculateKsumma(content)
    expect(r1).toBe(r2)
    expect(r1).not.toBe(0) // Non-trivial
  })

  it('mini SIE4-innehåll ger icke-noll checksumma', () => {
    const content = [
      '#FLAGGA 0',
      '#PROGRAM "Test" "1.0"',
      '#FORMAT PC8',
      '#SIETYP 4',
      '',
    ].join('\r\n')
    const ksumma = calculateKsumma(content)
    expect(ksumma).not.toBe(0)
  })

  it('CRLF vs LF ger olika checksumma', () => {
    const crlf = '#FLAGGA 0\r\n#FORMAT PC8\r\n'
    const lf = '#FLAGGA 0\n#FORMAT PC8\n'
    expect(calculateKsumma(crlf)).not.toBe(calculateKsumma(lf))
  })
})
