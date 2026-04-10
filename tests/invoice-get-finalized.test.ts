import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type Database from 'better-sqlite3'
import { getFinalized } from '../src/main/services/invoice-service'
import { createTestDbWithFinalizedInvoice } from './helpers/pdf-test-setup'

describe('getFinalized', () => {
  let db: Database.Database
  let invoiceId: number
  let draftInvoiceId: number

  beforeAll(() => {
    const setup = createTestDbWithFinalizedInvoice()
    db = setup.db
    invoiceId = setup.invoiceId
    draftInvoiceId = setup.draftInvoiceId
  })

  afterAll(() => {
    if (db) db.close()
  })

  it('returns finalized invoice with lines', () => {
    const result = getFinalized(db, invoiceId)
    expect(result.status).not.toBe('draft')
    expect(result.lines.length).toBeGreaterThan(0)
    expect(result.lines[0]).toHaveProperty('vat_rate')
    expect(result.lines[0]).toHaveProperty('line_total')
    expect(result.lines[0]).toHaveProperty('vat_amount')
  })

  it('includes customer data from JOIN', () => {
    const result = getFinalized(db, invoiceId)
    expect(result.customer_name).toBe('Testkund AB')
    expect(result.customer_org_number).toBe('559987-6543')
  })

  it('throws for draft invoice', () => {
    expect(() => getFinalized(db, draftInvoiceId)).toThrow()
  })

  it('throws for non-existent invoice', () => {
    expect(() => getFinalized(db, 99999)).toThrow()
  })
})
