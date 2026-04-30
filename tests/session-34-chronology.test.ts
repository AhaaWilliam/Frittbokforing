/**
 * Session 34 — Kronologisk datumordning (B8)
 *
 * Verifierar att verifikationer i samma serie MÅSTE ha icke-minskande datum.
 * checkChronology enforced i finalizeDraft (A), finalizeExpense (B),
 * finalizeManualEntry (C), _payInvoiceTx (A), _payExpenseTx (B).
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
  seedCustomer,
  seedSupplier,
  seedAndFinalizeInvoice,
  seedAndFinalizeExpense,
  seedManualEntry,
  createSecondFiscalYear,
  getVatCode25Out,
  getVatCode25In,
  type SystemTestContext,
} from './system/helpers/system-test-context'
import { checkChronology } from '../src/main/services/chronology-guard'
import { payInvoicesBulk } from '../src/main/services/invoice-service'
import Database from 'better-sqlite3'

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

describe('Kronologisk datumordning — A-serie (fakturor)', () => {
  it('samma-dag är tillåten (2026-03-15 efter 2026-03-15 → OK)', () => {
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })
    // Should not throw — same day is OK
    const r2 = seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })
    expect(r2.invoiceId).toBeGreaterThan(0)
  })

  it('senare datum accepteras (2026-03-20 efter 2026-03-15 → OK)', () => {
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })
    const r2 = seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-20' })
    expect(r2.invoiceId).toBeGreaterThan(0)
  })

  it('tom serie → inget fel (första posten)', () => {
    const r = seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })
    expect(r.invoiceId).toBeGreaterThan(0)
  })

  it('finalize avvisar datum före senaste bokförda', () => {
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })

    const customer = seedCustomer(ctx, { name: 'Kronologi-kund' })
    const vatCode = getVatCode25Out(ctx)
    const draft = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-10',
      due_date: '2026-04-30',
      lines: [
        {
          product_id: null,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return

    const r = ctx.invoiceService.finalizeDraft(ctx.db, draft.data.id)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.code).toBe('VALIDATION_ERROR')
    }
  })

  it('payInvoice avvisar datum före senaste bokförda i A-serien', () => {
    // Finalisera + betala en faktura (ger A1 + A2 med datum 2026-03-15 resp 2026-03-20)
    const { invoiceId: id1 } = seedAndFinalizeInvoice(ctx, {
      invoiceDate: '2026-03-15',
    })
    const inv1 = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(id1) as { total_amount_ore: number }
    const pay1 = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: id1,
      amount_ore: inv1.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(pay1.success).toBe(true)

    // Skapa + finalisera en ny faktura
    const { invoiceId: id2 } = seedAndFinalizeInvoice(ctx, {
      invoiceDate: '2026-03-25',
    })
    const inv2 = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(id2) as { total_amount_ore: number }

    // Försök betala med datum före senaste A-serien (2026-03-25)
    const pay2 = ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: id2,
      amount_ore: inv2.total_amount_ore,
      payment_date: '2026-03-18',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(pay2.success).toBe(false)
  })

  it('A1=2026-03-15, A2=2026-03-15, A3=2026-03-14 → A3 avvisas (MAX, inte LAST insert)', () => {
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })
    seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })

    const customer = seedCustomer(ctx, { name: 'Max-test' })
    const vatCode = getVatCode25Out(ctx)
    const draft = ctx.invoiceService.saveDraft(ctx.db, {
      counterparty_id: customer.id,
      fiscal_year_id: ctx.seed.fiscalYearId,
      invoice_date: '2026-03-14',
      due_date: '2026-04-30',
      lines: [
        {
          product_id: null,
          description: 'Test',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return

    const r = ctx.invoiceService.finalizeDraft(ctx.db, draft.data.id)
    expect(r.success).toBe(false)
  })
})

describe('Kronologisk datumordning — B-serie (kostnader)', () => {
  it('expense finalize: datum före senaste → avvisas', () => {
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-03-15' })

    const supplier = seedSupplier(ctx, { name: 'Kronologi-lev' })
    const vatCode = getVatCode25In(ctx)
    const draft = ctx.expenseService.saveExpenseDraft(ctx.db, {
      fiscal_year_id: ctx.seed.fiscalYearId,
      counterparty_id: supplier.id,
      expense_date: '2026-03-10',
      due_date: '2026-04-14',
      description: 'Test-kostnad',
      lines: [
        {
          description: 'Test',
          account_number: '6110',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
        },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return

    const r = ctx.expenseService.finalizeExpense(ctx.db, draft.data.id)
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.code).toBe('VALIDATION_ERROR')
    }
  })

  it('payExpense: beteendeidentiskt efter migration till delad helper', () => {
    const { expenseId } = seedAndFinalizeExpense(ctx, {
      expenseDate: '2026-03-15',
    })
    const exp = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(expenseId) as { total_amount_ore: number }

    // Betala med datum 2026-03-20 → B2
    const pay1 = ctx.expenseService.payExpense(ctx.db, {
      expense_id: expenseId,
      amount_ore: exp.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(pay1.success).toBe(true)

    // Skapa ny kostnad med datum 2026-03-25
    const { expenseId: id2 } = seedAndFinalizeExpense(ctx, {
      expenseDate: '2026-03-25',
    })
    const exp2 = ctx.db
      .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
      .get(id2) as { total_amount_ore: number }

    // Betala med datum före senaste B-serien (2026-03-25) → avvisas
    const pay2 = ctx.expenseService.payExpense(ctx.db, {
      expense_id: id2,
      amount_ore: exp2.total_amount_ore,
      payment_date: '2026-03-18',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(pay2.success).toBe(false)
  })
})

describe('Kronologisk datumordning — C-serie (manuella bokföringsordrar)', () => {
  it('manual entry finalize: datum före senaste → avvisas', () => {
    seedManualEntry(
      ctx,
      [
        { account_number: '1930', debit_ore: 10000, credit_ore: 0 },
        { account_number: '3001', debit_ore: 0, credit_ore: 10000 },
      ],
      { entryDate: '2026-03-15' },
    )

    // Försök med tidigare datum
    const draft = ctx.manualEntryService.saveManualEntryDraft(ctx.db, {
      fiscal_year_id: ctx.seed.fiscalYearId,
      entry_date: '2026-03-10',
      description: 'Kronologi-test',
      lines: [
        {
          account_number: '1930',
          debit_ore: 5000,
          credit_ore: 0,
          description: '',
        },
        {
          account_number: '3001',
          debit_ore: 0,
          credit_ore: 5000,
          description: '',
        },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return

    const r = ctx.manualEntryService.finalizeManualEntry(
      ctx.db,
      draft.data.id,
      ctx.seed.fiscalYearId,
    )
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.code).toBe('VALIDATION_ERROR')
    }
  })
})

describe('Kronologisk datumordning — cross-FY', () => {
  it('FY2027 B-serie tom → inga kronologi-fel (FY-scopad)', () => {
    // Skapa kostnad i FY2026 (ger B1 med 2026-03-15)
    vi.setSystemTime(new Date('2026-12-20T10:00:00'))
    seedAndFinalizeExpense(ctx, { expenseDate: '2026-12-15' })

    // Skapa FY2027
    const fy2 = createSecondFiscalYear(ctx)

    // Skapa ny kostnad i FY2027 med datum i jan 2027 (före dec-2026 i absoluta termer)
    // Men B-serien i FY2027 är tom → inget kronologi-fel
    vi.setSystemTime(new Date('2027-02-01T10:00:00'))
    const supplier = seedSupplier(ctx, { name: 'FY2027-lev' })
    const vatCode = getVatCode25In(ctx)
    const draft = ctx.expenseService.saveExpenseDraft(ctx.db, {
      fiscal_year_id: fy2.fiscalYear.id,
      counterparty_id: supplier.id,
      expense_date: '2027-01-10',
      due_date: '2027-02-10',
      description: 'FY2027-kostnad',
      lines: [
        {
          description: 'Test',
          account_number: '6110',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCode.id,
        },
      ],
    })
    expect(draft.success).toBe(true)
    if (!draft.success) return

    const r = ctx.expenseService.finalizeExpense(ctx.db, draft.data.id)
    expect(r.success).toBe(true)
  })
})

describe('Kronologisk datumordning — bulk', () => {
  it('payInvoicesBulk batch-check avvisar före loop-start', () => {
    // Finalisera 2 fakturor
    const { invoiceId: id1 } = seedAndFinalizeInvoice(ctx, {
      invoiceDate: '2026-03-15',
    })
    const { invoiceId: id2 } = seedAndFinalizeInvoice(ctx, {
      invoiceDate: '2026-03-15',
    })

    // Betala id1 med datum 2026-03-20 → skapar A3 (efter A1, A2 från finalize)
    const inv1 = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(id1) as { total_amount_ore: number }
    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: id1,
      amount_ore: inv1.total_amount_ore,
      payment_date: '2026-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })

    // Finalisera en tredje faktura (A4 med datum 2026-03-25)
    const { invoiceId: id3 } = seedAndFinalizeInvoice(ctx, {
      invoiceDate: '2026-03-25',
    })

    // Bulk-betala med datum före senaste A-serien
    const inv2 = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(id2) as { total_amount_ore: number }
    const inv3 = ctx.db
      .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
      .get(id3) as { total_amount_ore: number }

    const bulkResult = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: id2, amount_ore: inv2.total_amount_ore },
        { invoice_id: id3, amount_ore: inv3.total_amount_ore },
      ],
      payment_date: '2026-03-18', // Före A4 (2026-03-25)
      account_number: '1930',
    })
    expect(bulkResult.success).toBe(false)
  })
})

describe('checkChronology — guard', () => {
  it('kastar om anropad utanför transaktion', () => {
    // Skapa en standalone in-memory db
    const memDb = new Database(':memory:')
    memDb.exec(`CREATE TABLE journal_entries (
      id INTEGER PRIMARY KEY,
      fiscal_year_id INTEGER,
      verification_series TEXT,
      verification_number INTEGER,
      journal_date TEXT
    )`)

    expect(() => {
      checkChronology(memDb, 1, 'A', '2026-03-15')
    }).toThrow('checkChronology must be called within a transaction')

    memDb.close()
  })

  // Sprint 60 — kill StringLiteral mutant on `field: 'date'`. Tidigare
  // tester assertade på error-meddelande men aldrig på `err.field`.
  it('strukturerat fel innehåller code/error/field=date vid violation', () => {
    const memDb = new Database(':memory:')
    memDb.exec(`CREATE TABLE journal_entries (
      id INTEGER PRIMARY KEY,
      fiscal_year_id INTEGER,
      verification_series TEXT,
      verification_number INTEGER,
      journal_date TEXT
    )`)
    memDb
      .prepare(
        `INSERT INTO journal_entries (fiscal_year_id, verification_series, verification_number, journal_date)
         VALUES (1, 'A', 1, '2026-06-15')`,
      )
      .run()

    let captured: unknown = null
    const tx = memDb.transaction(() => {
      try {
        checkChronology(memDb, 1, 'A', '2026-03-15')
      } catch (err) {
        captured = err
        throw err
      }
    })

    expect(() => tx()).toThrow()
    expect(captured).toMatchObject({
      code: 'VALIDATION_ERROR',
      field: 'date',
    })
    expect((captured as { error: string }).error).toContain('2026-03-15')
    expect((captured as { error: string }).error).toContain('2026-06-15')
    expect((captured as { error: string }).error).toContain('A-serien')

    memDb.close()
  })
})
