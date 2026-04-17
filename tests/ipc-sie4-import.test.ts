/**
 * IPC schema validation tests for SIE4 import channels.
 */
import { describe, it, expect } from 'vitest'
import {
  Sie4SelectFileSchema,
  Sie4ValidateSchema,
  Sie4ImportSchema,
} from '../src/shared/ipc-schemas'

describe('Sie4SelectFileSchema', () => {
  it('accepts empty object', () => {
    expect(Sie4SelectFileSchema.safeParse({}).success).toBe(true)
  })

  it('rejects extra properties', () => {
    expect(Sie4SelectFileSchema.safeParse({ extra: 1 }).success).toBe(false)
  })
})

describe('Sie4ValidateSchema', () => {
  it('accepts valid filePath', () => {
    expect(Sie4ValidateSchema.safeParse({ filePath: '/tmp/test.se' }).success).toBe(true)
  })

  it('rejects empty filePath', () => {
    expect(Sie4ValidateSchema.safeParse({ filePath: '' }).success).toBe(false)
  })

  it('rejects missing filePath', () => {
    expect(Sie4ValidateSchema.safeParse({}).success).toBe(false)
  })
})

// Sprint 57 B3a: Sie4ImportSchema.conflict_resolutions
describe('Sie4ImportSchema conflict_resolutions (S57 B3a)', () => {
  it('accepts valid conflict_resolutions map', () => {
    const res = Sie4ImportSchema.safeParse({
      filePath: '/tmp/test.se',
      strategy: 'merge',
      conflict_resolutions: { '1930': 'overwrite', '1240': 'keep', '2081': 'skip' },
    })
    expect(res.success).toBe(true)
  })

  it('rejects invalid resolution-enum value', () => {
    const res = Sie4ImportSchema.safeParse({
      filePath: '/tmp/test.se',
      strategy: 'merge',
      conflict_resolutions: { '1930': 'replace' },
    })
    expect(res.success).toBe(false)
  })

  it('omitting conflict_resolutions is allowed (backward-compat)', () => {
    const res = Sie4ImportSchema.safeParse({
      filePath: '/tmp/test.se',
      strategy: 'merge',
    })
    expect(res.success).toBe(true)
  })
})
