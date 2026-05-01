import { describe, it, expect } from 'vitest'
import { escapeFtsQuery } from '../../src/shared/escape-fts'

describe('escapeFtsQuery (FTS5 phrase delimiter)', () => {
  it('lämnar oescaped sträng oförändrad', () => {
    expect(escapeFtsQuery('hello world')).toBe('hello world')
  })

  it('dubblerar enstaka citattecken', () => {
    expect(escapeFtsQuery('hello "world"')).toBe('hello ""world""')
  })

  it('flera citattecken — alla dubbleras', () => {
    expect(escapeFtsQuery('"a"b"c"')).toBe('""a""b""c""')
  })

  it('tom sträng → tom sträng', () => {
    expect(escapeFtsQuery('')).toBe('')
  })

  it('inga special-tecken förutom " (apostroph etc. lämnas)', () => {
    expect(escapeFtsQuery("it's a test")).toBe("it's a test")
  })
})
