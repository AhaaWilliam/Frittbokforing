/**
 * Unit tests for getNow()/todayLocalFromNow() — M150.
 *
 * Contract:
 * - In production (NODE_ENV !== 'test' && FRITT_TEST !== '1'), returns real time.
 * - In test env with FRITT_NOW set, returns the parsed override.
 * - Invalid FRITT_NOW falls back to real time (does not crash).
 * - Unset FRITT_NOW returns real time even in test env.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest'
import { getNow, todayLocalFromNow } from '../../../src/main/utils/now'

describe('getNow()', () => {
  const originalFrittNow = process.env.FRITT_NOW
  const originalNodeEnv = process.env.NODE_ENV
  const originalFrittTest = process.env.FRITT_TEST

  beforeEach(() => {
    // vitest sets NODE_ENV=test by default — rely on that.
    delete process.env.FRITT_NOW
  })

  afterEach(() => {
    if (originalFrittNow === undefined) delete process.env.FRITT_NOW
    else process.env.FRITT_NOW = originalFrittNow
    if (originalNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = originalNodeEnv
    if (originalFrittTest === undefined) delete process.env.FRITT_TEST
    else process.env.FRITT_TEST = originalFrittTest
  })

  it('returnerar riktig tid när FRITT_NOW är osatt', () => {
    const before = Date.now()
    const got = getNow().getTime()
    const after = Date.now()
    expect(got).toBeGreaterThanOrEqual(before)
    expect(got).toBeLessThanOrEqual(after)
  })

  it('returnerar parsad tid när FRITT_NOW är satt i test-env', () => {
    process.env.FRITT_NOW = '2025-06-15T12:00:00.000Z'
    expect(getNow().toISOString()).toBe('2025-06-15T12:00:00.000Z')
  })

  it('faller tillbaka till riktig tid vid invalid FRITT_NOW', () => {
    process.env.FRITT_NOW = 'not-a-date'
    const before = Date.now()
    const got = getNow().getTime()
    const after = Date.now()
    expect(got).toBeGreaterThanOrEqual(before)
    expect(got).toBeLessThanOrEqual(after)
  })

  it('ignorerar FRITT_NOW när NODE_ENV != test och FRITT_TEST != 1', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.FRITT_TEST
    process.env.FRITT_NOW = '2000-01-01T00:00:00.000Z'
    const got = getNow().getTime()
    expect(got).toBeGreaterThan(new Date('2020-01-01').getTime())
  })

  it('respekterar FRITT_NOW när FRITT_TEST=1 även utan NODE_ENV=test', () => {
    process.env.NODE_ENV = 'production'
    process.env.FRITT_TEST = '1'
    process.env.FRITT_NOW = '2025-06-15T12:00:00.000Z'
    expect(getNow().toISOString()).toBe('2025-06-15T12:00:00.000Z')
  })
})

describe('todayLocalFromNow()', () => {
  const originalFrittNow = process.env.FRITT_NOW

  afterEach(() => {
    if (originalFrittNow === undefined) delete process.env.FRITT_NOW
    else process.env.FRITT_NOW = originalFrittNow
  })

  it('returnerar YYYY-MM-DD i lokal tid', () => {
    // Use a UTC moment that is unambiguous across timezones (noon UTC).
    process.env.FRITT_NOW = '2025-06-15T12:00:00.000Z'
    const got = todayLocalFromNow()
    expect(got).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    // In Stockholm (UTC+1/+2), noon UTC is still 2025-06-15 local.
    // Assert the year/month since day can vary by TZ at UTC midnight — but noon is safe.
    expect(got.startsWith('2025-06-15')).toBe(true)
  })
})
