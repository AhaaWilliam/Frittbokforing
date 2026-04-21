/**
 * IPC schema validation tests for SIE5 import channels.
 */
import { describe, it, expect } from 'vitest'
import {
  Sie5SelectFileSchema,
  Sie5ValidateSchema,
  Sie5ImportSchema,
} from '../src/shared/ipc-schemas'

describe('Sie5SelectFileSchema', () => {
  it('accepts empty object', () => {
    expect(Sie5SelectFileSchema.safeParse({}).success).toBe(true)
  })

  it('rejects extra properties', () => {
    expect(Sie5SelectFileSchema.safeParse({ extra: 1 }).success).toBe(false)
  })
})

describe('Sie5ValidateSchema', () => {
  it('accepts valid filePath', () => {
    expect(
      Sie5ValidateSchema.safeParse({ filePath: '/tmp/test.sie' }).success,
    ).toBe(true)
  })

  it('rejects empty filePath', () => {
    expect(Sie5ValidateSchema.safeParse({ filePath: '' }).success).toBe(false)
  })

  it('rejects missing filePath', () => {
    expect(Sie5ValidateSchema.safeParse({}).success).toBe(false)
  })

  it('rejects extra property', () => {
    expect(
      Sie5ValidateSchema.safeParse({ filePath: '/tmp/x', extra: 1 }).success,
    ).toBe(false)
  })
})

describe('Sie5ImportSchema', () => {
  it('accepts minimal new-import', () => {
    expect(
      Sie5ImportSchema.safeParse({
        filePath: '/tmp/test.sie',
        strategy: 'new',
      }).success,
    ).toBe(true)
  })

  it('accepts merge with fiscal_year_id', () => {
    expect(
      Sie5ImportSchema.safeParse({
        filePath: '/tmp/test.sie',
        strategy: 'merge',
        fiscal_year_id: 3,
      }).success,
    ).toBe(true)
  })

  it('accepts conflict_resolutions map', () => {
    const res = Sie5ImportSchema.safeParse({
      filePath: '/tmp/test.sie',
      strategy: 'merge',
      conflict_resolutions: {
        '1930': 'overwrite',
        '3001': 'keep',
        '2081': 'skip',
      },
    })
    expect(res.success).toBe(true)
  })

  it('rejects invalid strategy enum', () => {
    expect(
      Sie5ImportSchema.safeParse({
        filePath: '/tmp/test.sie',
        strategy: 'replace',
      }).success,
    ).toBe(false)
  })

  it('rejects invalid conflict_resolution value', () => {
    expect(
      Sie5ImportSchema.safeParse({
        filePath: '/tmp/test.sie',
        strategy: 'merge',
        conflict_resolutions: { '1930': 'overwriteeee' },
      }).success,
    ).toBe(false)
  })

  it('rejects non-positive fiscal_year_id', () => {
    expect(
      Sie5ImportSchema.safeParse({
        filePath: '/tmp/test.sie',
        strategy: 'merge',
        fiscal_year_id: 0,
      }).success,
    ).toBe(false)
  })
})
