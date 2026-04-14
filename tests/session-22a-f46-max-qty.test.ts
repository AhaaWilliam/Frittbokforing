import { describe, it, expect } from 'vitest'
import {
  MAX_QTY_INVOICE,
  MAX_QTY_EXPENSE,
  ERR_MSG_MAX_QTY_INVOICE,
  ERR_MSG_MAX_QTY_EXPENSE,
} from '../src/shared/constants'
import { InvoiceLineFormSchema } from '../src/renderer/lib/form-schemas/invoice'
import { ExpenseLineFormSchema } from '../src/renderer/lib/form-schemas/expense'
import {
  InvoiceDraftLineSchema,
  ExpenseLineInputSchema,
} from '../src/shared/ipc-schemas'

const validInvoiceLineBase = {
  temp_id: 'tmp_1',
  product_id: null,
  description: 'Test',
  unit_price_kr: 100,
  vat_code_id: 1,
  vat_rate: 0.25,
  unit: 'styck',
  account_number: '3001',
}

const validExpenseLineBase = {
  temp_id: 'tmp_1',
  description: 'Test',
  unit_price_kr: 100,
  account_number: '5410',
  vat_code_id: 1,
  vat_rate: 0.25,
}

const validIpcInvoiceLine = {
  product_id: null,
  description: 'Test',
  quantity: 1,
  unit_price_ore: 10000,
  vat_code_id: 1,
  sort_order: 0,
  account_number: '3001',
}

const validIpcExpenseLine = {
  description: 'Test',
  account_number: '5410',
  quantity: 1,
  unit_price_ore: 10000,
  vat_code_id: 1,
  sort_order: 0,
}

describe('F46 — Invoice form max-qty', () => {
  it('Test 1: accepterar qty=9999.99 (gränsen inklusive)', () => {
    const r = InvoiceLineFormSchema.safeParse({
      ...validInvoiceLineBase,
      quantity: 9999.99,
    })
    expect(r.success).toBe(true)
  })

  it('Test 2: förkastar qty=10000 med exakt meddelande', () => {
    const r = InvoiceLineFormSchema.safeParse({
      ...validInvoiceLineBase,
      quantity: 10000,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const qtyIssue = r.error.issues.find(i => i.path.includes('quantity'))
      expect(qtyIssue).toBeDefined()
      expect(qtyIssue!.message).toBe(ERR_MSG_MAX_QTY_INVOICE)
      expect(qtyIssue!.code).toBe('too_big')
    }
  })

  it('Test 3: förkastar qty=9999.995 (IEEE-754 flyttals-edge)', () => {
    const r = InvoiceLineFormSchema.safeParse({
      ...validInvoiceLineBase,
      quantity: 9999.995,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const qtyIssue = r.error.issues.find(i => i.path.includes('quantity'))
      expect(qtyIssue!.code).toBe('too_big')
    }
  })

  it('Test 4: qty=0 → min-fel (inte max, inte decimal)', () => {
    const r = InvoiceLineFormSchema.safeParse({
      ...validInvoiceLineBase,
      quantity: 0,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const qtyIssue = r.error.issues.find(i => i.path.includes('quantity'))
      expect(qtyIssue!.code).toBe('too_small')
    }
  })
})

describe('F46 — Expense form max-qty', () => {
  it('Test 5: accepterar qty=9999', () => {
    const r = ExpenseLineFormSchema.safeParse({
      ...validExpenseLineBase,
      quantity: 9999,
    })
    expect(r.success).toBe(true)
  })

  it('Test 6: förkastar qty=10000 med exakt meddelande', () => {
    const r = ExpenseLineFormSchema.safeParse({
      ...validExpenseLineBase,
      quantity: 10000,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const qtyIssue = r.error.issues.find(i => i.path.includes('quantity'))
      expect(qtyIssue!.message).toBe(ERR_MSG_MAX_QTY_EXPENSE)
      expect(qtyIssue!.code).toBe('too_big')
    }
  })
})

describe('F46 — IPC-schema DRY-gate (testar schemat direkt, inte pipeline)', () => {
  it('Test 7: InvoiceDraftLineSchema.safeParse förkastar qty=10000', () => {
    const r = InvoiceDraftLineSchema.safeParse({
      ...validIpcInvoiceLine,
      quantity: 10000,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const qtyIssue = r.error.issues.find(i => i.path.includes('quantity'))
      expect(qtyIssue!.code).toBe('too_big')
    }
  })

  it('Test 8: ExpenseLineInputSchema.safeParse förkastar qty=10000', () => {
    const r = ExpenseLineInputSchema.safeParse({
      ...validIpcExpenseLine,
      quantity: 10000,
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const qtyIssue = r.error.issues.find(i => i.path.includes('quantity'))
      expect(qtyIssue!.code).toBe('too_big')
    }
  })
})

describe('F46 — Read-tolerans för existerande data', () => {
  it('Test 9: safeParse på line med qty=15000 returnerar fail utan att krascha', () => {
    const r = InvoiceDraftLineSchema.safeParse({
      ...validIpcInvoiceLine,
      quantity: 15000,
    })
    expect(r.success).toBe(false)
    expect(r).toHaveProperty('error')
  })
})
