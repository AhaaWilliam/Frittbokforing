/**
 * Sprint VS-4 — buildQuickInvoicePayload (Vardag-sheets faktura-helper)
 */
import { describe, it, expect } from 'vitest'
import { buildQuickInvoicePayload } from '../src/renderer/lib/build-quick-invoice-payload'
import { SaveDraftInputSchema } from '../src/shared/ipc-schemas'

const BASE: Parameters<typeof buildQuickInvoicePayload>[0] = {
  fiscal_year_id: 1,
  counterparty_id: 7,
  invoice_date: '2026-03-15',
  description: 'Konsulttimmar mars',
  unit_price_ore: 100_000,
  vat_code_id: 1,
  account_number: '3001',
}

describe('buildQuickInvoicePayload', () => {
  it('default quantity=1, payment_terms=30, due_date=+30d', () => {
    const p = buildQuickInvoicePayload(BASE)
    expect(p.lines[0].quantity).toBe(1)
    expect(p.payment_terms).toBe(30)
    expect(p.invoice_date).toBe('2026-03-15')
    expect(p.due_date).toBe('2026-04-14')
  })

  it('custom payment_terms styr due_date', () => {
    const p = buildQuickInvoicePayload({ ...BASE, payment_terms: 14 })
    expect(p.due_date).toBe('2026-03-29')
    expect(p.payment_terms).toBe(14)
  })

  it('custom quantity propageras (1.5 timmar)', () => {
    const p = buildQuickInvoicePayload({ ...BASE, quantity: 1.5 })
    expect(p.lines[0].quantity).toBe(1.5)
  })

  it('1 rad, product_id=null, sort_order=0', () => {
    const p = buildQuickInvoicePayload(BASE)
    expect(p.lines).toHaveLength(1)
    expect(p.lines[0]).toMatchObject({
      product_id: null,
      description: 'Konsulttimmar mars',
      unit_price_ore: 100_000,
      vat_code_id: 1,
      account_number: '3001',
      sort_order: 0,
    })
  })

  it('account_number default null när ej satt', () => {
    const { account_number: _ignored, ...rest } = BASE
    void _ignored
    const p = buildQuickInvoicePayload(rest)
    expect(p.lines[0].account_number).toBeNull()
  })

  it('payload validerar mot SaveDraftInputSchema', () => {
    const p = buildQuickInvoicePayload(BASE)
    const result = SaveDraftInputSchema.safeParse(p)
    expect(result.success).toBe(true)
  })

  it('notes default null', () => {
    const p = buildQuickInvoicePayload(BASE)
    expect(p.notes).toBeNull()
  })
})
