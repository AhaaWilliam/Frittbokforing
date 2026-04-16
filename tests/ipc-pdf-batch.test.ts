/**
 * IPC schema validation tests for PDF batch export channels.
 */
import { describe, it, expect } from 'vitest'
import {
  SelectDirectorySchema,
  SavePdfBatchSchema,
} from '../src/shared/ipc-schemas'

describe('SelectDirectorySchema', () => {
  it('S1: accepts empty object', () => {
    const result = SelectDirectorySchema.safeParse({})
    expect(result.success).toBe(true)
  })

  it('S2: rejects extra properties (strict)', () => {
    const result = SelectDirectorySchema.safeParse({ extra: 'value' })
    expect(result.success).toBe(false)
  })
})

describe('SavePdfBatchSchema', () => {
  it('S3: accepts valid input', () => {
    const result = SavePdfBatchSchema.safeParse({
      directory: '/tmp/pdfs',
      invoices: [
        { invoiceId: 1, fileName: 'Faktura_A0001.pdf' },
        { invoiceId: 2, fileName: 'Faktura_A0002.pdf' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('S4: rejects empty invoices array', () => {
    const result = SavePdfBatchSchema.safeParse({
      directory: '/tmp/pdfs',
      invoices: [],
    })
    expect(result.success).toBe(false)
  })

  it('S5: rejects missing directory', () => {
    const result = SavePdfBatchSchema.safeParse({
      invoices: [{ invoiceId: 1, fileName: 'test.pdf' }],
    })
    expect(result.success).toBe(false)
  })

  it('S6: rejects negative invoiceId', () => {
    const result = SavePdfBatchSchema.safeParse({
      directory: '/tmp',
      invoices: [{ invoiceId: -1, fileName: 'test.pdf' }],
    })
    expect(result.success).toBe(false)
  })

  it('S7: rejects empty fileName', () => {
    const result = SavePdfBatchSchema.safeParse({
      directory: '/tmp',
      invoices: [{ invoiceId: 1, fileName: '' }],
    })
    expect(result.success).toBe(false)
  })

  it('S8: rejects empty directory', () => {
    const result = SavePdfBatchSchema.safeParse({
      directory: '',
      invoices: [{ invoiceId: 1, fileName: 'test.pdf' }],
    })
    expect(result.success).toBe(false)
  })

  it('S9: rejects extra properties (strict)', () => {
    const result = SavePdfBatchSchema.safeParse({
      directory: '/tmp',
      invoices: [{ invoiceId: 1, fileName: 'test.pdf' }],
      extra: 'value',
    })
    expect(result.success).toBe(false)
  })
})
