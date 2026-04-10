import { describe, it, expect } from 'vitest'
import * as iconv from 'iconv-lite'

describe('CP437 encoding', () => {
  it('å → 0x86', () => {
    const buf = iconv.encode('å', 'cp437')
    expect(buf[0]).toBe(0x86)
  })

  it('ä → 0x84', () => {
    const buf = iconv.encode('ä', 'cp437')
    expect(buf[0]).toBe(0x84)
  })

  it('ö → 0x94', () => {
    const buf = iconv.encode('ö', 'cp437')
    expect(buf[0]).toBe(0x94)
  })

  it('Å → 0x8F', () => {
    const buf = iconv.encode('Å', 'cp437')
    expect(buf[0]).toBe(0x8f)
  })

  it('Ä → 0x8E', () => {
    const buf = iconv.encode('Ä', 'cp437')
    expect(buf[0]).toBe(0x8e)
  })

  it('Ö → 0x99', () => {
    const buf = iconv.encode('Ö', 'cp437')
    expect(buf[0]).toBe(0x99)
  })

  it('ASCII text oförändrad', () => {
    const text = 'Hello World 123'
    const buf = iconv.encode(text, 'cp437')
    expect(buf.toString('ascii')).toBe(text)
  })

  it('"Fritt Bokföring" roundtrip', () => {
    const original = 'Fritt Bokföring'
    const encoded = iconv.encode(original, 'cp437')
    const decoded = iconv.decode(encoded, 'cp437')
    expect(decoded).toBe(original)
  })
})
