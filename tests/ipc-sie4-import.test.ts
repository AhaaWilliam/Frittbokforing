/**
 * IPC schema validation tests for SIE4 import channels.
 */
import { describe, it, expect } from 'vitest'
import {
  Sie4SelectFileSchema,
  Sie4ValidateSchema,
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
