/**
 * S02 — Komplett kostnadsflöde: leverantörsfaktura (B-serie).
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
  vi,
} from 'vitest'
import {
  createTemplateDb,
  createSystemTestContext,
  destroyContext,
  destroyTemplateDb,
  seedSupplier,
  seedAndFinalizeExpense,
  getVatCode25In,
  type SystemTestContext,
} from './helpers/system-test-context'

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

describe('Komplett kostnadsflöde — leverantörsfaktura', () => {
  it('S02-01: draft → finaliserad → betald → alla subsystem', () => {
    const supplier = seedSupplier(ctx, { name: 'Leverantör S02-01' })
    const vatCode = getVatCode25In(ctx)

    const draftResult = ctx.expenseService.saveExpenseDraft(ctx.db, {
      fiscal_year_id: ctx.seed.fiscalYearId,
      counterparty_id: supplier.id,
      expense_date: '2026-03-15',
      due_date: '2026-04-14',
      description: 'Kontorsmaterial',
      lines: [
        {
          description: 'Pennor',
          account_number: '6110',
          quantity: 100,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) return

    // Finalisera
    const finalizeResult = ctx.expenseService.finalizeExpense(
      ctx.db,
      draftResult.data.id,
    )
    expect(finalizeResult.success).toBe(true)
    if (!finalizeResult.success) return

    const exp = ctx.db
      .prepare('SELECT * FROM expenses WHERE id = ?')
      .get(draftResult.data.id) as any
    expect(exp.status).toBe('unpaid')
    expect(exp.journal_entry_id).not.toBeNull()

    // B-serie verifikation
    const je = ctx.db
      .prepare('SELECT * FROM journal_entries WHERE id = ?')
      .get(exp.journal_entry_id) as any
    expect(je.verification_series).toBe('B')
    expect(je.verification_number).toBe(1)

    // Kontering: DEBET 6110 + DEBET 2640, KREDIT 2440
    const jels = ctx.db
      .prepare('SELECT * FROM journal_entry_lines WHERE journal_entry_id = ?')
      .all(je.id) as any[]
    const totalDebit = jels.reduce((s: number, l: any) => s + l.debit_ore, 0)
    const totalCredit = jels.reduce((s: number, l: any) => s + l.credit_ore, 0)
    expect(totalDebit).toBe(totalCredit)

    expect(
      jels.some((l: any) => l.account_number === '6110' && l.debit_ore > 0),
    ).toBe(true)
    expect(
      jels.some((l: any) => l.account_number === '2640' && l.debit_ore > 0),
    ).toBe(true)
    expect(
      jels.some((l: any) => l.account_number === '2440' && l.credit_ore > 0),
    ).toBe(true)

    // Betala
    const payResult = ctx.expenseService.payExpense(ctx.db, {
      expense_id: draftResult.data.id,
      amount_ore: exp.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(true)
    if (!payResult.success) return

    const paid = ctx.db
      .prepare('SELECT * FROM expenses WHERE id = ?')
      .get(draftResult.data.id) as any
    expect(paid.status).toBe('paid')

    // Dashboard
    const dashboard = ctx.dashboardService.getDashboardSummary(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(dashboard.expensesOre).toBeGreaterThan(0)

    // Momsrapport - ingående moms
    const vatReport = ctx.vatReportService.getVatReport(
      ctx.db,
      ctx.seed.fiscalYearId,
    )
    expect(vatReport.yearTotal.vatInOre).toBeGreaterThan(0)
  })

  it('S02-02: delbetalning + slutbetalning', () => {
    const { expenseId } = seedAndFinalizeExpense(ctx)

    const exp = ctx.db
      .prepare('SELECT * FROM expenses WHERE id = ?')
      .get(expenseId) as any
    const total = exp.total_amount_ore
    const half = Math.floor(total / 2)

    // Delbetala
    const pay1 = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount_ore: half,
      payment_date: '2026-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(pay1.success).toBe(true)
    const after1 = ctx.db
      .prepare('SELECT status FROM expenses WHERE id = ?')
      .get(expenseId) as any
    expect(after1.status).toBe('partial')

    // Slutbetala
    const pay2 = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount_ore: total - half,
      payment_date: '2026-03-25',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(pay2.success).toBe(true)
    const after2 = ctx.db
      .prepare('SELECT status FROM expenses WHERE id = ?')
      .get(expenseId) as any
    expect(after2.status).toBe('paid')
  })

  it('S02-03: dubblettkontroll leverantörsfakturanummer', () => {
    const supplierX = seedSupplier(ctx, { name: 'Leverantör X' })
    const supplierY = seedSupplier(ctx, { name: 'Leverantör Y' })
    const vatCode = getVatCode25In(ctx)
    const line = {
      description: 'Test',
      account_number: '6110',
      quantity: 100,
      unit_price_ore: 5000,
      vat_code_id: vatCode.id,
    }

    // Spara expense med supplier_invoice_number='F-001' för X
    const r1 = ctx.expenseService.saveExpenseDraft(ctx.db, {
      fiscal_year_id: ctx.seed.fiscalYearId,
      counterparty_id: supplierX.id,
      supplier_invoice_number: 'F-001',
      expense_date: '2026-03-15',
      description: 'Faktura 1',
      lines: [line],
    })
    expect(r1.success).toBe(true)

    // Samma supplier_invoice_number för samma leverantör → MISSLYCKAS
    const r2 = ctx.expenseService.saveExpenseDraft(ctx.db, {
      fiscal_year_id: ctx.seed.fiscalYearId,
      counterparty_id: supplierX.id,
      supplier_invoice_number: 'F-001',
      expense_date: '2026-03-16',
      description: 'Duplikat',
      lines: [line],
    })
    expect(r2.success).toBe(false)

    // Samma supplier_invoice_number för ANNAN leverantör → LYCKAS
    const r3 = ctx.expenseService.saveExpenseDraft(ctx.db, {
      fiscal_year_id: ctx.seed.fiscalYearId,
      counterparty_id: supplierY.id,
      supplier_invoice_number: 'F-001',
      expense_date: '2026-03-16',
      description: 'Annan leverantör',
      lines: [line],
    })
    expect(r3.success).toBe(true)
  })

  it('S02-04: betaldatum före fakturadatum blockeras', () => {
    const { expenseId } = seedAndFinalizeExpense(ctx, {
      expenseDate: '2026-03-15',
    })
    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as any

    const payResult = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount_ore: exp.total_amount_ore,
      payment_date: '2026-03-14', // Före fakturadatum!
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(false)
  })

  it('S02-05: framtidsdatum blockeras', () => {
    const { expenseId } = seedAndFinalizeExpense(ctx)
    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as any

    // Mocked "today" = 2026-06-15
    const payResult = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount_ore: exp.total_amount_ore,
      payment_date: '2026-06-16', // Framtiden!
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(payResult.success).toBe(false)
  })

  it('S02-06: B-serie oberoende av A-serie', () => {
    // Finalisera en kundfaktura → A1
    const { verificationNumber: _vn1 } = seedAndFinalizeExpense(ctx) // wait, this is B-series

    // Let me do invoice first for A-series
    const customer = ctx.db
      .prepare(
        "INSERT INTO counterparties (type, name, is_active) VALUES ('customer', 'A-kund', 1) RETURNING *",
      )
      .get() as any
    const vatCode = ctx.db
      .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
      .get() as any

    const invDraft = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'A',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(invDraft.success).toBe(true)
    if (!invDraft.success) return
    const invResult = ctx.invoiceService.finalizeDraft(ctx.db, invDraft.data.id)
    expect(invResult.success).toBe(true)

    // Now check A and B series numbers
    const aEntries = ctx.db
      .prepare(
        "SELECT * FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'A'",
      )
      .all(ctx.seed.fiscalYearId) as any[]
    const bEntries = ctx.db
      .prepare(
        "SELECT * FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'B'",
      )
      .all(ctx.seed.fiscalYearId) as any[]

    expect(aEntries.length).toBeGreaterThan(0)
    expect(bEntries.length).toBeGreaterThan(0)
    // Both start numbering at 1 independently
    expect(aEntries[0].verification_number).toBe(1)
    expect(bEntries[0].verification_number).toBe(1)
  })
})
