/**
 * SEC02 — Database constraints: triggers, CHECK, UNIQUE, FK enforcement.
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
  type SystemTestContext,
} from './helpers/security-test-context'
import {
  expectSqlError,
  rawInsert,
  rawGet,
  rawQuery,
} from './helpers/security-test-context'
import {
  seedAndFinalizeInvoice,
  seedAndFinalizeExpense,
  seedManualEntry,
} from '../system/helpers/system-test-context'

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

describe('Database constraints — defense in depth', () => {
  describe('Triggers — immutabilitet', () => {
    it('SEC02-TRIG-01: UPDATE blockeras på booked journal_entries', () => {
      const { invoiceId } = seedAndFinalizeInvoice(ctx, {
        invoiceDate: '2026-03-15',
      })
      const inv = ctx.db
        .prepare('SELECT journal_entry_id FROM invoices WHERE id = ?')
        .get(invoiceId) as any
      const jeId = inv.journal_entry_id

      // UPDATE journal_date → TRIGGER ska blockera
      const err = expectSqlError(
        ctx,
        'UPDATE journal_entries SET journal_date = ? WHERE id = ?',
        ['2026-04-01', jeId],
      )
      expect(err).not.toBeNull()
      expect(err).toContain('kan inte ändras')
    })

    it('SEC02-TRIG-02: DELETE blockeras på journal_entry_lines', () => {
      const { invoiceId } = seedAndFinalizeInvoice(ctx, {
        invoiceDate: '2026-03-15',
      })
      const inv = ctx.db
        .prepare('SELECT journal_entry_id FROM invoices WHERE id = ?')
        .get(invoiceId) as any
      const jeId = inv.journal_entry_id

      const line = ctx.db
        .prepare(
          'SELECT id FROM journal_entry_lines WHERE journal_entry_id = ? LIMIT 1',
        )
        .get(jeId) as any

      const err = expectSqlError(
        ctx,
        'DELETE FROM journal_entry_lines WHERE id = ?',
        [line.id],
      )
      expect(err).not.toBeNull()
      expect(err).toContain('kan inte raderas')
    })

    it('SEC02-TRIG-03: balansvalidering vid bokning', () => {
      // Insert a draft journal entry
      ctx.db
        .prepare(
          `
        INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
        VALUES (?, ?, '2026-03-15', 'Obalanserad', 'draft', 'manual')
      `,
        )
        .run(ctx.seed.companyId, ctx.seed.fiscalYearId)
      const jeId = (
        ctx.db.prepare('SELECT last_insert_rowid() as id').get() as any
      ).id

      // Insert unbalanced lines
      ctx.db
        .prepare(
          `
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
        VALUES (?, 1, '6210', 50000, 0)
      `,
        )
        .run(jeId)
      ctx.db
        .prepare(
          `
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
        VALUES (?, 2, '1930', 0, 49000)
      `,
        )
        .run(jeId)

      // Try to book — trigger should block
      const err = expectSqlError(
        ctx,
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
        [jeId],
      )
      expect(err).not.toBeNull()
      expect(err).toContain('balanserar inte')
    })

    it('SEC02-TRIG-04: periodvalidering — stängt FY blockerar bokning', () => {
      // Close the fiscal year
      ctx.db
        .prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = ?')
        .run(ctx.seed.fiscalYearId)

      // Insert draft
      ctx.db
        .prepare(
          `
        INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
        VALUES (?, ?, '2026-03-15', 'Test', 'draft', 'manual')
      `,
        )
        .run(ctx.seed.companyId, ctx.seed.fiscalYearId)
      const jeId = (
        ctx.db.prepare('SELECT last_insert_rowid() as id').get() as any
      ).id

      ctx.db
        .prepare(
          `
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
        VALUES (?, 1, '6210', 10000, 0), (?, 2, '1930', 0, 10000)
      `,
        )
        .run(jeId, jeId)

      const err = expectSqlError(
        ctx,
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
        [jeId],
      )
      expect(err).not.toBeNull()
      expect(err).toContain('stängt räkenskapsår')
    })

    it('SEC02-TRIG-05: organisationsnummer-trigger', () => {
      // Invalid format
      const err1 = expectSqlError(
        ctx,
        `
        INSERT INTO companies (org_number, name, fiscal_rule) VALUES ('12345', 'Bad', 'K2')
      `,
      )
      expect(err1).not.toBeNull()

      // Valid format
      const err2 = expectSqlError(
        ctx,
        `
        INSERT INTO companies (org_number, name, fiscal_rule) VALUES ('556677-8901', 'Good', 'K2')
      `,
      )
      // May fail on Luhn, but format should pass. Just check it's not a format error
      if (err2) {
        expect(err2).not.toContain('must be exactly 11')
      }
    })

    it('SEC02-TRIG-06: fakturaskydd — DELETE på non-draft blockeras', () => {
      seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' })
      const inv = ctx.db
        .prepare("SELECT id FROM invoices WHERE status = 'unpaid' LIMIT 1")
        .get() as any

      const err = expectSqlError(ctx, 'DELETE FROM invoices WHERE id = ?', [
        inv.id,
      ])
      expect(err).not.toBeNull()
      expect(err).toContain('kan inte raderas')
    })
  })

  describe('CHECK constraints', () => {
    it('SEC02-CHECK-01: fiscal_years.is_closed', () => {
      const err = expectSqlError(
        ctx,
        `
        INSERT INTO fiscal_years (company_id, year_label, start_date, end_date, is_closed)
        VALUES (${ctx.seed.companyId}, '2028', '2028-01-01', '2028-12-31', 2)
      `,
      )
      expect(err).not.toBeNull()
    })

    it('SEC02-CHECK-02: invoices.status', () => {
      const err = expectSqlError(
        ctx,
        `
        INSERT INTO invoices (counterparty_id, invoice_type, invoice_number, invoice_date, due_date, net_amount, vat_amount, total_amount, status)
        VALUES (1, 'customer_invoice', '999', '2026-01-01', '2026-02-01', 100, 25, 125, 'invalid_status')
      `,
      )
      expect(err).not.toBeNull()
    })

    it('SEC02-CHECK-03: journal_entry_lines debit/credit constraints', () => {
      // Both debit and credit > 0 → should fail
      ctx.db
        .prepare(
          `
        INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
        VALUES (?, ?, '2026-03-15', 'Test', 'draft', 'manual')
      `,
        )
        .run(ctx.seed.companyId, ctx.seed.fiscalYearId)
      const jeId = (
        ctx.db.prepare('SELECT last_insert_rowid() as id').get() as any
      ).id

      const err = expectSqlError(
        ctx,
        `
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
        VALUES (?, 1, '6210', 1000, 1000)
      `,
        [jeId],
      )
      expect(err).not.toBeNull()
    })
  })

  describe('UNIQUE constraints', () => {
    it('SEC02-UNIQUE-01: verification series/number per FY', () => {
      seedAndFinalizeInvoice(ctx, { invoiceDate: '2026-03-15' }) // A1

      // Try inserting duplicate A1
      const err = expectSqlError(
        ctx,
        `
        INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number, verification_series, journal_date, description, status, source_type)
        VALUES (?, ?, 1, 'A', '2026-03-16', 'Dup', 'booked', 'manual')
      `,
        [ctx.seed.companyId, ctx.seed.fiscalYearId],
      )
      expect(err).not.toBeNull()
    })

    it('SEC02-UNIQUE-02: companies org_number unique', () => {
      // Already have a company with org_number. Try duplicate
      const existingOrg = (
        ctx.db.prepare('SELECT org_number FROM companies LIMIT 1').get() as any
      ).org_number
      const err = expectSqlError(
        ctx,
        `
        INSERT INTO companies (org_number, name, fiscal_rule)
        VALUES ('${existingOrg}', 'Dup Company', 'K2')
      `,
      )
      expect(err).not.toBeNull()
    })
  })

  describe('Foreign Key enforcement', () => {
    it('SEC02-FK-01: FK enforcement is ON', () => {
      const fk = ctx.db.pragma('foreign_keys', { simple: true })
      expect(fk).toBe(1)
    })

    it('SEC02-FK-02: invoice with non-existent counterparty_id blocked', () => {
      const err = expectSqlError(
        ctx,
        `
        INSERT INTO invoices (counterparty_id, invoice_type, invoice_number, invoice_date, due_date, net_amount, vat_amount, total_amount, status)
        VALUES (99999, 'customer_invoice', '999', '2026-01-01', '2026-02-01', 100, 25, 125, 'draft')
      `,
      )
      expect(err).not.toBeNull()
    })

    it('SEC02-FK-03: journal_entry_line with non-existent journal_entry_id blocked', () => {
      const err = expectSqlError(
        ctx,
        `
        INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
        VALUES (99999, 1, '1930', 1000, 0)
      `,
      )
      expect(err).not.toBeNull()
    })
  })
})
