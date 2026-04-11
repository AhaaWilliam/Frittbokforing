import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../src/main/migrations'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
} from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  payExpense,
} from '../src/main/services/expense-service'
import {
  validateAccountsActive,
} from '../src/main/services/account-service'
import {
  saveManualEntryDraft,
  finalizeManualEntry,
} from '../src/main/services/manual-entry-service'

let db: Database.Database

function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  for (let i = 0; i < migrations.length; i++) {
    const m = migrations[i]
    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(m.sql)
    if (m.programmatic) m.programmatic(testDb)
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')
  }
  return testDb
}

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

function seedInvoice(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const cp = createCounterparty(testDb, { name: 'Kund AB', type: 'customer' })
  if (!cp.success) throw new Error('CP failed')
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    name: 'Konsult',
    default_price: 100000,
    vat_code_id: vatCode.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')
  return {
    fiscalYearId: fy.id,
    cpId: cp.data.id,
    vatCodeId: vatCode.id,
    productId: product.data.id,
  }
}

function seedExpense(testDb: Database.Database) {
  createCompany(testDb, VALID_COMPANY)
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const supplier = createCounterparty(testDb, {
    name: 'Leverantör AB',
    type: 'supplier',
  })
  if (!supplier.success) throw new Error('Supplier failed')
  const vatCode = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
    .get() as { id: number }
  return {
    fiscalYearId: fy.id,
    supplierId: supplier.data.id,
    vatCodeId: vatCode.id,
  }
}

function createUnpaidInvoice(
  testDb: Database.Database,
  seed: ReturnType<typeof seedInvoice>,
) {
  const result = saveDraft(testDb, {
    counterparty_id: seed.cpId,
    fiscal_year_id: seed.fiscalYearId,
    invoice_date: '2025-03-15',
    due_date: '2099-12-31',
    lines: [
      {
        product_id: seed.productId,
        description: 'Konsult',
        quantity: 10,
        unit_price_ore: 100000,
        vat_code_id: seed.vatCodeId,
        sort_order: 0,
      },
    ],
  })
  if (!result.success) throw new Error('Draft failed: ' + result.error)
  const fResult = finalizeDraft(testDb, result.data.id)
  if (!fResult.success) throw new Error('Finalize failed: ' + fResult.error)
  return fResult.data
}

function createUnpaidExpense(
  testDb: Database.Database,
  seed: ReturnType<typeof seedExpense>,
) {
  const draftResult = saveExpenseDraft(testDb, {
    fiscal_year_id: seed.fiscalYearId,
    counterparty_id: seed.supplierId,
    expense_date: '2025-03-01',
    description: 'Test expense',
    payment_terms: 30,
    notes: '',
    lines: [
      {
        description: 'Test line',
        account_number: '5010',
        quantity: 1,
        unit_price_ore: 125000,
        vat_code_id: seed.vatCodeId,
      },
    ],
  })
  if (!draftResult.success)
    throw new Error('Draft failed: ' + draftResult.error)
  const expenseId = draftResult.data.id
  const finalizeResult = finalizeExpense(testDb, expenseId)
  if (!finalizeResult.success)
    throw new Error('Finalize failed: ' + finalizeResult.error)
  return expenseId
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  db.close()
})

// ═══ F3: Invoice rounding tests ═══

describe('F3: invoice rounding with small remaining', () => {
  it('fullbetalning av faktura med restbelopp = 99 öre bokförs korrekt', () => {
    const seed = seedInvoice(db)
    const invoice = createUnpaidInvoice(db, seed)
    db.prepare('UPDATE invoices SET total_amount_ore = ? WHERE id = ?').run(
      99,
      invoice.id,
    )

    const result = payInvoice(db, {
      invoice_id: invoice.id,
      amount: 100,
      payment_date: '2025-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    const lines = db
      .prepare(
        `SELECT account_number, debit_amount, credit_amount
         FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE je.fiscal_year_id = ? AND je.source_type = 'auto_payment'
         ORDER BY jel.journal_entry_id DESC, jel.line_number`,
      )
      .all(seed.fiscalYearId) as {
      account_number: string
      debit_amount: number
      credit_amount: number
    }[]

    // Bank debit = 100, receivables credit = 99, rounding credit = 1
    const bankLine = lines.find(
      (l) => l.account_number === '1930' && l.debit_amount > 0,
    )
    expect(bankLine?.debit_amount).toBe(100)

    const receivablesLine = lines.find(
      (l) => l.account_number === '1510' && l.credit_amount > 0,
    )
    expect(receivablesLine?.credit_amount).toBe(99)

    const roundingLine = lines.find((l) => l.account_number === '3740')
    expect(roundingLine).toBeDefined()
    expect(roundingLine!.credit_amount).toBe(1)

    // Invariant: paid_amount === total_amount
    const updated = db
      .prepare('SELECT total_amount_ore, status FROM invoices WHERE id = ?')
      .get(invoice.id) as { total_amount_ore: number; status: string }
    expect(updated.status).toBe('paid')
    const payments = db
      .prepare(
        'SELECT SUM(amount) as total FROM invoice_payments WHERE invoice_id = ?',
      )
      .get(invoice.id) as { total: number }
    expect(payments.total).toBe(updated.total_amount_ore)
  })

  it('fullbetalning av faktura med restbelopp = 50 öre (gränsfall)', () => {
    const seed = seedInvoice(db)
    const invoice = createUnpaidInvoice(db, seed)
    db.prepare('UPDATE invoices SET total_amount_ore = ? WHERE id = ?').run(
      50,
      invoice.id,
    )

    // M99: 50-öres öresutjämning på en 50-öres faktura är matematiskt korrekt
    // (|diff| ≤ 50 && remaining > 0) även om förhållandet 50/100 är ovanligt.
    const result = payInvoice(db, {
      invoice_id: invoice.id,
      amount: 100,
      payment_date: '2025-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    const updated = db
      .prepare('SELECT status FROM invoices WHERE id = ?')
      .get(invoice.id) as { status: string }
    expect(updated.status).toBe('paid')

    const payments = db
      .prepare(
        'SELECT SUM(amount) as total FROM invoice_payments WHERE invoice_id = ?',
      )
      .get(invoice.id) as { total: number }
    expect(payments.total).toBe(50)
  })

  it('exakt betalning av faktura med restbelopp = 50 — ingen öresutjämning', () => {
    const seed = seedInvoice(db)
    const invoice = createUnpaidInvoice(db, seed)
    db.prepare('UPDATE invoices SET total_amount_ore = ? WHERE id = ?').run(
      50,
      invoice.id,
    )

    const result = payInvoice(db, {
      invoice_id: invoice.id,
      amount: 50,
      payment_date: '2025-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    // No 3740 line expected
    if (result.success) {
      const jeId = result.data.payment.journal_entry_id
      const roundingLine = db
        .prepare(
          "SELECT 1 FROM journal_entry_lines WHERE journal_entry_id = ? AND account_number = '3740'",
        )
        .get(jeId)
      expect(roundingLine).toBeUndefined()
    }

    const updated = db
      .prepare('SELECT status FROM invoices WHERE id = ?')
      .get(invoice.id) as { status: string }
    expect(updated.status).toBe('paid')
  })

  it('kontrollgrupp: restbelopp = 500 öre, amount = 501 (normal rounding)', () => {
    const seed = seedInvoice(db)
    const invoice = createUnpaidInvoice(db, seed)
    db.prepare('UPDATE invoices SET total_amount_ore = ? WHERE id = ?').run(
      500,
      invoice.id,
    )

    const result = payInvoice(db, {
      invoice_id: invoice.id,
      amount: 501,
      payment_date: '2025-03-20',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    if (result.success) {
      const jeId = result.data.payment.journal_entry_id
      const lines = db
        .prepare(
          'SELECT account_number, debit_amount, credit_amount FROM journal_entry_lines WHERE journal_entry_id = ?',
        )
        .all(jeId) as {
        account_number: string
        debit_amount: number
        credit_amount: number
      }[]
      expect(lines.find((l) => l.account_number === '1930')?.debit_amount).toBe(
        501,
      )
      expect(
        lines.find((l) => l.account_number === '1510')?.credit_amount,
      ).toBe(500)
      const rounding = lines.find((l) => l.account_number === '3740')
      expect(rounding).toBeDefined()
      expect(rounding!.credit_amount).toBe(1)
    }
  })
})

// ═══ F3: Expense rounding tests ═══

describe('F3: expense rounding with small remaining', () => {
  it('fullbetalning av kostnad med restbelopp = 99 öre', () => {
    const seed = seedExpense(db)
    const expenseId = createUnpaidExpense(db, seed)
    db.prepare('UPDATE expenses SET total_amount_ore = ? WHERE id = ?').run(
      99,
      expenseId,
    )

    const result = payExpense(db, {
      expense_id: expenseId,
      amount: 100,
      payment_date: '2025-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    if (result.success) {
      const jeId = result.data.payment.journal_entry_id
      const lines = db
        .prepare(
          'SELECT account_number, debit_amount, credit_amount FROM journal_entry_lines WHERE journal_entry_id = ?',
        )
        .all(jeId) as {
        account_number: string
        debit_amount: number
        credit_amount: number
      }[]
      // Payables debit = 99, rounding debit = 1, bank credit = 100
      expect(lines.find((l) => l.account_number === '2440')?.debit_amount).toBe(
        99,
      )
      expect(lines.find((l) => l.account_number === '3740')?.debit_amount).toBe(
        1,
      )
      expect(
        lines.find((l) => l.account_number === '1930')?.credit_amount,
      ).toBe(100)

      // Balance check
      const totalDebit = lines.reduce((s, l) => s + l.debit_amount, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit_amount, 0)
      expect(totalDebit).toBe(totalCredit)
    }

    const updated = db
      .prepare('SELECT status FROM expenses WHERE id = ?')
      .get(expenseId) as { status: string }
    expect(updated.status).toBe('paid')

    // Invariant: paid_amount === total_amount_ore
    const payments = db
      .prepare(
        'SELECT SUM(amount) as total FROM expense_payments WHERE expense_id = ?',
      )
      .get(expenseId) as { total: number }
    expect(payments.total).toBe(99)
  })

  it('fullbetalning av kostnad med restbelopp = 50 öre (gränsfall)', () => {
    const seed = seedExpense(db)
    const expenseId = createUnpaidExpense(db, seed)
    db.prepare('UPDATE expenses SET total_amount_ore = ? WHERE id = ?').run(
      50,
      expenseId,
    )

    // M99: diff = 50, |50| ≤ 50 && remaining > 0 → rounding aktiveras
    const result = payExpense(db, {
      expense_id: expenseId,
      amount: 100,
      payment_date: '2025-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    if (result.success) {
      const jeId = result.data.payment.journal_entry_id
      const lines = db
        .prepare(
          'SELECT account_number, debit_amount FROM journal_entry_lines WHERE journal_entry_id = ?',
        )
        .all(jeId) as { account_number: string; debit_amount: number }[]
      expect(lines.find((l) => l.account_number === '2440')?.debit_amount).toBe(
        50,
      )
      expect(lines.find((l) => l.account_number === '3740')?.debit_amount).toBe(
        50,
      )
    }

    const updated = db
      .prepare('SELECT status FROM expenses WHERE id = ?')
      .get(expenseId) as { status: string }
    expect(updated.status).toBe('paid')
  })

  it('exakt betalning av kostnad — ingen öresutjämning', () => {
    const seed = seedExpense(db)
    const expenseId = createUnpaidExpense(db, seed)
    db.prepare('UPDATE expenses SET total_amount_ore = ? WHERE id = ?').run(
      50,
      expenseId,
    )

    const result = payExpense(db, {
      expense_id: expenseId,
      amount: 50,
      payment_date: '2025-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    if (result.success) {
      const jeId = result.data.payment.journal_entry_id
      const roundingLine = db
        .prepare(
          "SELECT 1 FROM journal_entry_lines WHERE journal_entry_id = ? AND account_number = '3740'",
        )
        .get(jeId)
      expect(roundingLine).toBeUndefined()
    }
  })

  it('kontrollgrupp expense: restbelopp = 500, amount = 501', () => {
    const seed = seedExpense(db)
    const expenseId = createUnpaidExpense(db, seed)
    db.prepare('UPDATE expenses SET total_amount_ore = ? WHERE id = ?').run(
      500,
      expenseId,
    )

    const result = payExpense(db, {
      expense_id: expenseId,
      amount: 501,
      payment_date: '2025-03-15',
      payment_method: 'bank',
      account_number: '1930',
    })
    expect(result.success).toBe(true)

    if (result.success) {
      const jeId = result.data.payment.journal_entry_id
      const lines = db
        .prepare(
          'SELECT account_number, debit_amount FROM journal_entry_lines WHERE journal_entry_id = ?',
        )
        .all(jeId) as { account_number: string; debit_amount: number }[]
      expect(lines.find((l) => l.account_number === '3740')?.debit_amount).toBe(
        1,
      )
    }
  })
})

// ═══ F9: Structured error tests ═══

describe('F9: validateAccountsActive structured error', () => {
  it('kastar strukturerat objekt med INACTIVE_ACCOUNT-kod', () => {
    db.prepare(
      "INSERT INTO accounts (account_number, name, account_type, is_active, is_system_account) VALUES ('9040', 'Test inactive', 'expense', 0, 0)",
    ).run()

    try {
      validateAccountsActive(db, ['9040'])
      expect.fail('Should have thrown')
    } catch (err) {
      const e = err as { code: string; error: string; field: string }
      expect(e.code).toBe('INACTIVE_ACCOUNT')
      expect(e.field).toBe('account_number')
      expect(typeof e.error).toBe('string')
      expect(e.error).toContain('9040')
      // Not an instanceof Error
      expect(err instanceof Error).toBe(false)
    }
  })
})

describe('F9: finalize returns INACTIVE_ACCOUNT', () => {
  // Före Sprint 11 Fas 4 (F9) returnerade detta code: 'TRANSACTION_ERROR'
  // med generic text 'Bokföring misslyckades' — användaren fick ingen indikation
  // på vilket konto som var inaktivt.

  it('invoice-service.finalizeDraft returnerar INACTIVE_ACCOUNT', () => {
    const seed = seedInvoice(db)
    // Create a draft with a friform line using account 3002
    const result = saveDraft(db, {
      counterparty_id: seed.cpId,
      fiscal_year_id: seed.fiscalYearId,
      invoice_date: '2025-03-15',
      due_date: '2099-12-31',
      lines: [
        {
          product_id: seed.productId,
          description: 'Konsult',
          quantity: 10,
          unit_price_ore: 100000,
          vat_code_id: seed.vatCodeId,
          sort_order: 0,
        },
      ],
    })
    expect(result.success).toBe(true)
    if (!result.success) return

    // Inactivate 3002 (the account used by the product)
    // First need to remove is_system_account check — 3002 is not system, but may have entries
    // Actually, use a fresh non-system account: deactivate 1510 instead which is used as receivables
    // No, finalize uses validateAccountsActive on all accounts in the journal lines
    // The invoice product uses 3002. Let's deactivate it — but it may have the system flag.
    const acct = db
      .prepare(
        'SELECT is_system_account FROM accounts WHERE account_number = ?',
      )
      .get('3002') as { is_system_account: number }
    if (acct.is_system_account === 1) {
      // Can't deactivate system accounts normally, force it for test
      db.prepare(
        "UPDATE accounts SET is_active = 0 WHERE account_number = '3002'",
      ).run()
    } else {
      db.prepare(
        "UPDATE accounts SET is_active = 0 WHERE account_number = '3002'",
      ).run()
    }

    const fResult = finalizeDraft(db, result.data.id)
    expect(fResult.success).toBe(false)
    if (!fResult.success) {
      expect(fResult.code).toBe('INACTIVE_ACCOUNT')
      expect(fResult.error).toContain('3002')
      expect(fResult.field).toBe('account_number')
    }
  })

  it('expense-service.finalizeExpense returnerar INACTIVE_ACCOUNT med field', () => {
    const seed = seedExpense(db)
    const draftResult = saveExpenseDraft(db, {
      fiscal_year_id: seed.fiscalYearId,
      counterparty_id: seed.supplierId,
      expense_date: '2025-03-01',
      description: 'Test expense',
      payment_terms: 30,
      notes: '',
      lines: [
        {
          description: 'Test line',
          account_number: '5010',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: seed.vatCodeId,
        },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) return

    // Deactivate 5010
    db.prepare(
      "UPDATE accounts SET is_active = 0 WHERE account_number = '5010'",
    ).run()

    const fResult = finalizeExpense(db, draftResult.data.id)
    expect(fResult.success).toBe(false)
    if (!fResult.success) {
      expect(fResult.code).toBe('INACTIVE_ACCOUNT')
      expect(fResult.error).toContain('5010')
      // Steg 2b fix: field must be preserved
      expect(fResult.field).toBe('account_number')
    }
  })

  it('manual-entry-service.finalizeManualEntry returnerar INACTIVE_ACCOUNT', () => {
    createCompany(db, VALID_COMPANY)
    const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
      id: number
    }

    const draftResult = saveManualEntryDraft(db, {
      fiscal_year_id: fy.id,
      entry_date: '2025-03-15',
      description: 'Test',
      lines: [
        { account_number: '1930', debit_amount: 10000, credit_amount: 0 },
        { account_number: '5010', debit_amount: 0, credit_amount: 10000 },
      ],
    })
    expect(draftResult.success).toBe(true)
    if (!draftResult.success) return

    // Deactivate 5010
    db.prepare(
      "UPDATE accounts SET is_active = 0 WHERE account_number = '5010'",
    ).run()

    const fResult = finalizeManualEntry(db, draftResult.data.id, fy.id)
    expect(fResult.success).toBe(false)
    if (!fResult.success) {
      expect(fResult.code).toBe('INACTIVE_ACCOUNT')
      expect(fResult.error).toContain('5010')
      expect(fResult.field).toBe('account_number')
    }
  })
})
