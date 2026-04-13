/**
 * S14 — invoice_lines.account_number NOT NULL guard vid finalize (M024).
 * Testar trigger + service-felmappning + negativ regression (draft tillåter NULL).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, afterAll, vi } from 'vitest'
import {
  createTemplateDb,
  createSystemTestContext,
  destroyContext,
  destroyTemplateDb,
  seedCustomer,
  getVatCode25Out,
  type SystemTestContext,
} from './helpers/system-test-context'
import { saveDraft, finalizeDraft } from '../../src/main/services/invoice-service'

let ctx: SystemTestContext

beforeAll(() => {
  createTemplateDb()
})

afterAll(() => {
  destroyTemplateDb()
})

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-06-15T10:00:00'))
  ctx = createSystemTestContext()
})

afterEach(() => {
  destroyContext(ctx)
  vi.useRealTimers()
})

describe('Invoice finalize — account_number guard (S14)', () => {
  it('S14-01: finalize fails when freeform line has NULL account (service-level)', () => {
    const customer = seedCustomer(ctx, { name: 'Kund S14-01' })
    const vatCode = getVatCode25Out(ctx)

    const draft = saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Freeform utan konto',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: null,
        },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) throw new Error('setup failed')

    const result = finalizeDraft(ctx.db, draft.data.id)
    expect(result.success).toBe(false)
    if (result.success) throw new Error('should have failed')
    // Service-level validation catches freeform (product_id IS NULL) rows first
    expect(result.code).toBe('VALIDATION_ERROR')
    expect(result.error).toContain('konto')
  })

  it('S14-01b: trigger blocks direct SQL status change when freeform line has NULL account', () => {
    const customer = seedCustomer(ctx, { name: 'Kund S14-01b' })
    const vatCode = getVatCode25Out(ctx)

    // Create a draft with freeform line (account_number set)
    const draft = saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Freeform med konto',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) throw new Error('setup failed')

    // Set account_number to NULL directly in DB
    ctx.db.prepare('UPDATE invoice_lines SET account_number = NULL WHERE invoice_id = ?')
      .run(draft.data.id)

    // Bypass service layer — direct SQL UPDATE triggers the DB-level defense
    expect(() => {
      ctx.db.prepare("UPDATE invoices SET status = 'unpaid' WHERE id = ?")
        .run(draft.data.id)
    }).toThrow('kontonummer')
  })

  it('S14-02: finalize succeeds when all lines have account_number', () => {
    const customer = seedCustomer(ctx, { name: 'Kund S14-02' })
    const vatCode = getVatCode25Out(ctx)

    const draft = saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Freeform med konto',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) throw new Error('setup failed')

    const result = finalizeDraft(ctx.db, draft.data.id)
    expect(result.success).toBe(true)
  })

  it('S14-03: draft invoice allows NULL account_number (negative regression)', () => {
    const customer = seedCustomer(ctx, { name: 'Kund S14-03' })
    const vatCode = getVatCode25Out(ctx)

    // Saving draft with NULL account_number should succeed
    const draft = saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Rad utan konto',
          quantity: 1,
          unit_price_ore: 5000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: null,
        },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) throw new Error('setup failed')

    // Verify the line is stored with NULL
    const line = ctx.db
      .prepare('SELECT account_number FROM invoice_lines WHERE invoice_id = ?')
      .get(draft.data.id) as { account_number: string | null }
    expect(line.account_number).toBeNull()

    // Updating other fields on the draft should not trigger the validation
    ctx.db.prepare("UPDATE invoices SET notes = 'test' WHERE id = ?").run(draft.data.id)
    const inv = ctx.db.prepare('SELECT status FROM invoices WHERE id = ?').get(draft.data.id) as { status: string }
    expect(inv.status).toBe('draft')
  })
})
