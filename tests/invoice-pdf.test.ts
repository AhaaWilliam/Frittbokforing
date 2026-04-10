import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type Database from 'better-sqlite3'
import { generateInvoicePdf } from '../src/main/services/pdf/invoice-pdf-service'
import { createTestDbWithFinalizedInvoice } from './helpers/pdf-test-setup'

describe('generateInvoicePdf', () => {
  let db: Database.Database
  let invoiceId: number

  beforeAll(() => {
    const setup = createTestDbWithFinalizedInvoice()
    db = setup.db
    invoiceId = setup.invoiceId
  })

  afterAll(() => {
    if (db) db.close()
  })

  it('generates a non-empty PDF buffer', async () => {
    const buffer = await generateInvoicePdf(db, invoiceId)
    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.length).toBeGreaterThan(1000)
  })

  it('PDF starts with %PDF header', async () => {
    const buffer = await generateInvoicePdf(db, invoiceId)
    expect(buffer.toString('ascii', 0, 5)).toBe('%PDF-')
  })

  it('PDF ends with %%EOF', async () => {
    const buffer = await generateInvoicePdf(db, invoiceId)
    const tail = buffer.toString('ascii', buffer.length - 10)
    expect(tail).toContain('%%EOF')
  })

  it('generates consistent output for same invoice', async () => {
    const buf1 = await generateInvoicePdf(db, invoiceId)
    const buf2 = await generateInvoicePdf(db, invoiceId)
    // Same length (content should be identical modulo creation timestamp)
    expect(Math.abs(buf1.length - buf2.length)).toBeLessThan(100)
  })

  it('PDF is larger than minimal (contains actual content)', async () => {
    const buffer = await generateInvoicePdf(db, invoiceId)
    // A real invoice PDF with header, lines, footer should be > 2KB
    expect(buffer.length).toBeGreaterThan(2000)
  })

  it('throws for non-existent invoice', async () => {
    await expect(generateInvoicePdf(db, 99999)).rejects.toThrow()
  })
})
