/**
 * Tests for resolveDbPath — FRITT_DB_PATH guard logic.
 * Ensures FRITT_DB_PATH is only respected in test env (NODE_ENV=test or FRITT_TEST=1).
 */
import { describe, it, expect } from 'vitest'
import { resolveDbPath } from '../../src/main/db-path'

const DEFAULT = '/home/user/Documents/Fritt Bokföring/data.db'

describe('resolveDbPath', () => {
  it('returns FRITT_DB_PATH when NODE_ENV=test', () => {
    const result = resolveDbPath(
      { NODE_ENV: 'test', FRITT_DB_PATH: '/tmp/test.db' },
      DEFAULT,
    )
    expect(result).toBe('/tmp/test.db')
  })

  it('returns FRITT_DB_PATH when FRITT_TEST=1', () => {
    const result = resolveDbPath(
      { FRITT_TEST: '1', FRITT_DB_PATH: '/tmp/test2.db' },
      DEFAULT,
    )
    expect(result).toBe('/tmp/test2.db')
  })

  it('ignores FRITT_DB_PATH without test env flag', () => {
    const result = resolveDbPath(
      { FRITT_DB_PATH: '/tmp/sneaky.db' },
      DEFAULT,
    )
    expect(result).toBe(DEFAULT)
  })

  it('ignores FRITT_DB_PATH when NODE_ENV=production', () => {
    const result = resolveDbPath(
      { NODE_ENV: 'production', FRITT_DB_PATH: '/tmp/sneaky.db' },
      DEFAULT,
    )
    expect(result).toBe(DEFAULT)
  })

  it('falls back to DB_PATH (legacy) regardless of env', () => {
    const result = resolveDbPath(
      { DB_PATH: '/tmp/legacy.db' },
      DEFAULT,
    )
    expect(result).toBe('/tmp/legacy.db')
  })

  it('FRITT_DB_PATH takes priority over DB_PATH in test env', () => {
    const result = resolveDbPath(
      { NODE_ENV: 'test', FRITT_DB_PATH: '/tmp/fritt.db', DB_PATH: '/tmp/legacy.db' },
      DEFAULT,
    )
    expect(result).toBe('/tmp/fritt.db')
  })

  it('returns default path when no env vars set', () => {
    const result = resolveDbPath({}, DEFAULT)
    expect(result).toBe(DEFAULT)
  })
})
