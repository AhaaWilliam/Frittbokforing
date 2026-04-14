// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  transformInvoiceForm,
  InvoiceFormStateSchema,
  type InvoiceFormState,
} from '../../../../src/renderer/lib/form-schemas/invoice'

// ── Helpers ──────────────────────────────────────────────────────────

function makeLine(overrides?: Partial<InvoiceFormState['lines'][0]>): InvoiceFormState['lines'][0] {
  return {
    temp_id: 'tmp_1',
    product_id: null,
    description: 'Rad',
    quantity: 1,
    unit_price_kr: 100,
    vat_code_id: 1,
    vat_rate: 0.25,
    unit: 'styck',
    account_number: '3001',
    ...overrides,
  }
}

function makeForm(overrides?: Partial<InvoiceFormState>): InvoiceFormState {
  return {
    _customer: { id: 1, name: 'Acme AB' },
    invoiceDate: '2026-01-15',
    paymentTerms: 30,
    dueDate: '2026-02-14',
    notes: '',
    lines: [makeLine()],
    ...overrides,
  }
}

// ── A1: Struktur ─────────────────────────────────────────────────────

describe('transformInvoiceForm — struktur', () => {
  it('A1.1: strippar _-prefixade fält och behåller counterparty_id', () => {
    const form = makeForm()
    const payload = transformInvoiceForm(form, 1)

    expect(payload.counterparty_id).toBe(1)
    expect(payload).not.toHaveProperty('_customer')
    // Lines ska inte ha temp_id, vat_rate, unit, unit_price_kr
    expect(payload.lines[0]).not.toHaveProperty('temp_id')
    expect(payload.lines[0]).not.toHaveProperty('vat_rate')
    expect(payload.lines[0]).not.toHaveProperty('unit')
    expect(payload.lines[0]).not.toHaveProperty('unit_price_kr')
  })

  it('A1.2: sort_order sätts per index (0, 1, 2)', () => {
    const form = makeForm({
      lines: [
        makeLine({ temp_id: 'a', description: 'Första' }),
        makeLine({ temp_id: 'b', description: 'Andra' }),
        makeLine({ temp_id: 'c', description: 'Tredje' }),
      ],
    })
    const payload = transformInvoiceForm(form, 1)

    expect(payload.lines[0].sort_order).toBe(0)
    expect(payload.lines[1].sort_order).toBe(1)
    expect(payload.lines[2].sort_order).toBe(2)
  })

  it('A1.3: fiscal_year_id propageras från argument', () => {
    const form = makeForm()
    const payload = transformInvoiceForm(form, 42)

    expect(payload.fiscal_year_id).toBe(42)
  })
})

// ── A2: toOre-precondition ───────────────────────────────────────────

describe('transformInvoiceForm — toOre-precondition', () => {
  it('A2.1: jämn — 1250 kr → 125000 öre', () => {
    const form = makeForm({ lines: [makeLine({ unit_price_kr: 1250 })] })
    const payload = transformInvoiceForm(form, 1)

    expect(payload.lines[0].unit_price_ore).toBe(125000)
  })

  it('A2.2: decimal — 123.45 kr → 12345 öre', () => {
    const form = makeForm({ lines: [makeLine({ unit_price_kr: 123.45 })] })
    const payload = transformInvoiceForm(form, 1)

    expect(payload.lines[0].unit_price_ore).toBe(12345)
  })

  it('A2.3: edge — 0.99 kr → 99 öre', () => {
    const form = makeForm({ lines: [makeLine({ unit_price_kr: 0.99 })] })
    const payload = transformInvoiceForm(form, 1)

    expect(payload.lines[0].unit_price_ore).toBe(99)
  })
})

// ── A2b: Quantity precision (F44 invariant) ─────────────────────────

describe('InvoiceFormStateSchema — quantity precision', () => {
  function parseWithQty(qty: number) {
    return InvoiceFormStateSchema.safeParse(makeForm({
      lines: [makeLine({ quantity: qty })],
    }))
  }

  it('A2b.1: qty=1 (heltal) accepteras', () => {
    expect(parseWithQty(1).success).toBe(true)
  })

  it('A2b.2: qty=1.5 (en decimal) accepteras', () => {
    expect(parseWithQty(1.5).success).toBe(true)
  })

  it('A2b.3: qty=1.33 (två decimaler) accepteras', () => {
    expect(parseWithQty(1.33).success).toBe(true)
  })

  it('A2b.4: qty=1.333 (tre decimaler) förkastas', () => {
    const result = parseWithQty(1.333)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/högst 2 decimaler/)
    }
  })

  it('A2b.5: qty=0.01 (minsta giltiga) accepteras', () => {
    expect(parseWithQty(0.01).success).toBe(true)
  })

  it('A2b.6: qty=0.001 förkastas (under min 0.01)', () => {
    const result = parseWithQty(0.001)
    expect(result.success).toBe(false)
    if (!result.success) {
      // 0.001 < 0.01 → min-check fires before decimal-refine (F46 refine-ordning)
      expect(result.error.issues[0].code).toBe('too_small')
    }
  })
})

// ── A3: Defensiv ─────────────────────────────────────────────────────

describe('transformInvoiceForm — defensiv', () => {
  it('A3.1: tom lines → returnerar lines: [] (Zod blockerar i prod)', () => {
    // defensive; Zod blocks this path in prod (lines min 1)
    const form = makeForm({ lines: [] })
    const payload = transformInvoiceForm(form, 1)

    expect(payload.lines).toEqual([])
  })

  it('A3.2: _customer: null → kastar TypeError (null-assertion)', () => {
    const form = makeForm({
      _customer: null as unknown as InvoiceFormState['_customer'],
    })

    expect(() => transformInvoiceForm(form, 1)).toThrow(TypeError)
  })
})
