import { describe, it, expect } from 'vitest'
import { todayLocal } from '../src/shared/date-utils'

describe('todayLocal (shared)', () => {
  it('returns a string in YYYY-MM-DD format', () => {
    const result = todayLocal()
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('returns exactly 10 characters', () => {
    expect(todayLocal()).toHaveLength(10)
  })

  it('matches local Date components (not UTC)', () => {
    const result = todayLocal()
    const d = new Date()
    const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(result).toBe(expected)
  })
})
