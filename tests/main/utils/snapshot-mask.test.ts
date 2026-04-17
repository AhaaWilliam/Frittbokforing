/**
 * Unit-tester för snapshot-maskers (M151).
 * Verifierar determinism: flera körningar med olika tid ger identisk masked output.
 */
import { describe, it, expect } from 'vitest'
import {
  maskSie4,
  maskSie5,
  maskPain001,
  maskGeneric,
} from '../../../tests/e2e/helpers/snapshot-mask'

describe('maskSie4', () => {
  it('maskerar #GEN, #PROGRAM och #KSUMMA', () => {
    const input = [
      '#FLAGGA 0',
      '#PROGRAM "Fritt Bokföring" "0.1.0"',
      '#GEN 20250615 testsig',
      '#KSUMMA 1234567',
      '#VER A 1 20250301 "text"',
    ].join('\n')
    const out = maskSie4(input)
    expect(out).toContain('#GEN <DATE>')
    expect(out).toContain('#PROGRAM <PROGRAM>')
    expect(out).toContain('#KSUMMA <CHECKSUM>')
    // Verifikationsrader rörs ej
    expect(out).toContain('#VER A 1 20250301')
  })

  it('är idempotent', () => {
    const input = '#GEN 20250615 sig1\n#KSUMMA 42'
    expect(maskSie4(maskSie4(input))).toBe(maskSie4(input))
  })

  it('ger identisk output för olika tider', () => {
    const a = maskSie4('#GEN 20250101\n#KSUMMA 100')
    const b = maskSie4('#GEN 20261231\n#KSUMMA 999')
    expect(a).toBe(b)
  })
})

describe('maskSie5', () => {
  it('maskerar Date-attribut och ISO-timestamps', () => {
    const xml =
      '<Sie Date="2025-06-15T12:00:00Z"><FileCreated="2025-06-15T12:00:00Z"/></Sie>'
    const out = maskSie5(xml)
    expect(out).toContain('Date="<DATE>"')
    expect(out).not.toContain('2025-06-15')
  })
})

describe('maskPain001', () => {
  it('maskerar CreDtTm, MsgId och UUID:er', () => {
    const xml = `<Document><MsgId>abc-def-123</MsgId><CreDtTm>2025-06-15T12:00:00</CreDtTm><Id>550e8400-e29b-41d4-a716-446655440000</Id></Document>`
    const out = maskPain001(xml)
    expect(out).toContain('<MsgId><MSGID></MsgId>')
    expect(out).toContain('<CreDtTm><DATETIME></CreDtTm>')
    expect(out).toContain('<UUID>')
  })
})

describe('maskGeneric', () => {
  it('maskerar ISO datetimes och UUID:er', () => {
    const input =
      'At 2025-06-15T12:00:00.123Z user 550e8400-e29b-41d4-a716-446655440000 did X'
    const out = maskGeneric(input)
    expect(out).toBe('At <DATETIME> user <UUID> did X')
  })
})
