// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import {
  transformExpenseForm,
  ExpenseFormStateSchema,
  EXPENSE_DEFAULTS,
  type ExpenseFormState,
} from '../../../../src/renderer/lib/form-schemas/expense'

// ── Helpers ──────────────────────────────────────────────────────────

function makeForm(overrides?: Partial<ExpenseFormState>): ExpenseFormState {
  return {
    _supplier: { id: 3, name: 'Leverantör Ett AB' },
    expense_type: 'normal',
    credits_expense_id: null,
    supplierInvoiceNumber: 'INV-001',
    expenseDate: '2026-01-15',
    paymentTerms: 30,
    dueDate: '2026-02-14',
    description: 'Kontorsmaterial',
    notes: 'Testnotering',
    lines: [
      {
        temp_id: 'tmp_1',
        description: 'Penna',
        account_number: '5410',
        quantity: 1,
        unit_price_kr: 1250,
        vat_code_id: 1,
        vat_rate: 0.25,
      },
    ],
    ...overrides,
  }
}

// ── A1: Struktur ────────────────────────────────────────────────────

describe('transformExpenseForm — struktur', () => {
  it('A1.1: _-prefixade fält strippas', () => {
    const payload = transformExpenseForm(makeForm(), 1)

    expect(payload).not.toHaveProperty('_supplier')
    expect(payload).not.toHaveProperty('supplierInvoiceNumber')
    expect(payload.counterparty_id).toBe(3)
  })

  it('A1.2: sort_order sätts per index', () => {
    const form = makeForm({
      lines: [
        {
          temp_id: 'a',
          description: 'Rad A',
          account_number: '5410',
          quantity: 1,
          unit_price_kr: 100,
          vat_code_id: 1,
          vat_rate: 0.25,
        },
        {
          temp_id: 'b',
          description: 'Rad B',
          account_number: '5420',
          quantity: 2,
          unit_price_kr: 200,
          vat_code_id: 1,
          vat_rate: 0.25,
        },
      ],
    })
    const payload = transformExpenseForm(form, 1)

    expect(payload.lines[0].sort_order).toBe(0)
    expect(payload.lines[1].sort_order).toBe(1)
  })

  it('A1.3: fiscal_year_id propageras', () => {
    const payload = transformExpenseForm(makeForm(), 42)

    expect(payload.fiscal_year_id).toBe(42)
  })

  it('A1.4: notes default tom string, description propageras ordagrant', () => {
    const form = makeForm({ notes: '  ', description: '  Kontors  ' })
    const payload = transformExpenseForm(form, 1)

    expect(payload.notes).toBe('')
    expect(payload.description).toBe('Kontors')
  })
})

// ── A2: toOre-precondition ──────────────────────────────────────────

describe('transformExpenseForm — toOre-precondition', () => {
  it('A2.1: jämn 1250 kr → 125000 öre', () => {
    const form = makeForm({
      lines: [
        {
          temp_id: 'a',
          description: 'X',
          account_number: '5410',
          quantity: 1,
          unit_price_kr: 1250,
          vat_code_id: 1,
          vat_rate: 0.25,
        },
      ],
    })
    const payload = transformExpenseForm(form, 1)

    expect(payload.lines[0].unit_price_ore).toBe(125000)
  })

  it('A2.2: decimal 123.45 kr → 12345 öre', () => {
    const form = makeForm({
      lines: [
        {
          temp_id: 'a',
          description: 'X',
          account_number: '5410',
          quantity: 1,
          unit_price_kr: 123.45,
          vat_code_id: 1,
          vat_rate: 0.25,
        },
      ],
    })
    const payload = transformExpenseForm(form, 1)

    expect(payload.lines[0].unit_price_ore).toBe(12345)
  })

  it('A2.3: edge 0.99 kr → 99 öre', () => {
    const form = makeForm({
      lines: [
        {
          temp_id: 'a',
          description: 'X',
          account_number: '5410',
          quantity: 1,
          unit_price_kr: 0.99,
          vat_code_id: 1,
          vat_rate: 0.25,
        },
      ],
    })
    const payload = transformExpenseForm(form, 1)

    expect(payload.lines[0].unit_price_ore).toBe(99)
  })
})

// ── A3: Defensiv + Zod-validering ───────────────────────────────────

describe('transformExpenseForm — defensiv', () => {
  it('A3.1: lines: [] → payload har tom lines-array (Zod blockerar i prod)', () => {
    const form = makeForm({ lines: [] as ExpenseFormState['lines'] })
    const payload = transformExpenseForm(form, 1)

    expect(payload.lines).toEqual([])
  })

  it('A3.2: _supplier: null → TypeError vid .id-access', () => {
    const form = makeForm({
      _supplier: null as unknown as ExpenseFormState['_supplier'],
    })

    expect(() => transformExpenseForm(form, 1)).toThrow(TypeError)
  })

  it('A3.3: description: "" → ExpenseFormStateSchema rejects', () => {
    const formData = {
      ...makeForm(),
      description: '',
    }
    const result = ExpenseFormStateSchema.safeParse(formData)

    expect(result.success).toBe(false)
    if (!result.success) {
      const descErr = result.error.issues.find(
        (i) => i.path[0] === 'description',
      )
      expect(descErr).toBeDefined()
    }
  })
})
