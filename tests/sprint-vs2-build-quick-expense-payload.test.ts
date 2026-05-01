/**
 * Sprint VS-2 — buildQuickExpensePayload (Vardag-sheets helper)
 *
 * Verifierar:
 *  - Netto-beräkning för 25%, 12%, 6%, 0% moms
 *  - Avrundning till heltal ören
 *  - due_date = expense_date + payment_terms
 *  - Resulterande payload validerar mot SaveExpenseDraftSchema
 *  - Edge cases: små belopp, momsfri (0%), defaults
 */
import { describe, it, expect } from 'vitest'
import {
  buildQuickExpensePayload,
  netFromInclVatOre,
} from '../src/renderer/lib/build-quick-expense-payload'
import { SaveExpenseDraftSchema } from '../src/shared/ipc-schemas'

const BASE: Parameters<typeof buildQuickExpensePayload>[0] = {
  fiscal_year_id: 1,
  expense_date: '2026-03-15',
  amount_incl_vat_ore: 12_500, // 125,00 kr
  vat_rate_percent: 25,
  counterparty_id: 7,
  description: 'Kontorsmaterial Staples',
  account_number: '6110',
  vat_code_id: 1,
}

describe('netFromInclVatOre', () => {
  it('25% moms: 125,00 kr → 100,00 kr netto', () => {
    expect(netFromInclVatOre(12_500, 25)).toBe(10_000)
  })

  it('12% moms: 1 120 öre → 1 000 öre netto', () => {
    expect(netFromInclVatOre(1_120, 12)).toBe(1_000)
  })

  it('6% moms: 10 600 öre → 10 000 öre netto', () => {
    expect(netFromInclVatOre(10_600, 6)).toBe(10_000)
  })

  it('0% moms: oförändrat (momsfri)', () => {
    expect(netFromInclVatOre(99_999, 0)).toBe(99_999)
  })

  it('avrundar till heltal ören (banker-style round)', () => {
    // 9999 * 100 / 125 = 7999.2 → 7999
    expect(netFromInclVatOre(9_999, 25)).toBe(7_999)
    // 10001 * 100 / 125 = 8000.8 → 8001
    expect(netFromInclVatOre(10_001, 25)).toBe(8_001)
  })

  it('kastar för negativt belopp', () => {
    expect(() => netFromInclVatOre(-1, 25)).toThrow()
  })

  it('hanterar 0 öre', () => {
    expect(netFromInclVatOre(0, 25)).toBe(0)
  })
})

describe('buildQuickExpensePayload', () => {
  it('25% moms: netto 100 kr, 1 rad, quantity=1', () => {
    const p = buildQuickExpensePayload(BASE)
    expect(p.lines).toHaveLength(1)
    expect(p.lines![0]).toMatchObject({
      description: 'Kontorsmaterial Staples',
      account_number: '6110',
      quantity: 1,
      unit_price_ore: 10_000,
      vat_code_id: 1,
      sort_order: 0,
    })
  })

  it('default payment_terms=30 → due_date = expense_date + 30 dagar', () => {
    const p = buildQuickExpensePayload(BASE)
    expect(p.expense_date).toBe('2026-03-15')
    expect(p.due_date).toBe('2026-04-14')
    expect(p.payment_terms).toBe(30)
  })

  it('custom payment_terms används för due_date', () => {
    const p = buildQuickExpensePayload({ ...BASE, payment_terms: 14 })
    expect(p.due_date).toBe('2026-03-29')
    expect(p.payment_terms).toBe(14)
  })

  it('momsfri (0%): unit_price_ore = totalbelopp', () => {
    const p = buildQuickExpensePayload({
      ...BASE,
      amount_incl_vat_ore: 50_000,
      vat_rate_percent: 0,
    })
    expect(p.lines![0].unit_price_ore).toBe(50_000)
  })

  it('expense_type alltid "normal" (sheets stödjer inte kreditfakturor)', () => {
    const p = buildQuickExpensePayload(BASE)
    expect(p.expense_type).toBe('normal')
  })

  it('supplier_invoice_number kan sättas', () => {
    const p = buildQuickExpensePayload({
      ...BASE,
      supplier_invoice_number: 'LF-12345',
    })
    expect(p.supplier_invoice_number).toBe('LF-12345')
  })

  it('supplier_invoice_number default null', () => {
    const p = buildQuickExpensePayload(BASE)
    expect(p.supplier_invoice_number).toBeNull()
  })

  it('resulterande payload validerar mot SaveExpenseDraftSchema', () => {
    const p = buildQuickExpensePayload(BASE)
    const result = SaveExpenseDraftSchema.safeParse(p)
    expect(result.success).toBe(true)
  })

  it('description i sheet-input speglas på radnivå', () => {
    const p = buildQuickExpensePayload({ ...BASE, description: 'Hyra mars' })
    expect(p.description).toBe('Hyra mars')
    expect(p.lines![0].description).toBe('Hyra mars')
  })

  it('helt belopp 0 ger giltig payload (radens unit_price_ore = 0)', () => {
    const p = buildQuickExpensePayload({ ...BASE, amount_incl_vat_ore: 0 })
    expect(p.lines![0].unit_price_ore).toBe(0)
    const result = SaveExpenseDraftSchema.safeParse(p)
    expect(result.success).toBe(true)
  })
})
