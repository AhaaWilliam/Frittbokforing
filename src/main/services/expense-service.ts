import type Database from 'better-sqlite3'
import { todayLocal, addDays } from '../../shared/date-utils'
import { validateAccountsActive } from './account-service'
import type {
  Expense,
  ExpenseLine,
  ExpenseWithLines,
  ExpenseDraftListItem,
  ExpenseListItem,
  ExpenseStatusCounts,
  ExpenseDetail,
  ExpensePayment,
  IpcResult,
  ErrorCode,
} from '../../shared/types'
import log from 'electron-log'
import {
  SaveExpenseDraftSchema,
  UpdateExpenseDraftSchema,
} from '../ipc-schemas'

function processExpenseLines(
  db: Database.Database,
  lines: {
    description: string
    account_number: string
    quantity: number
    unit_price_ore: number
    vat_code_id: number
  }[],
) {
  const allVatCodes = db
    .prepare(
      "SELECT id, rate_percent, vat_account FROM vat_codes WHERE vat_type = 'incoming'",
    )
    .all() as { id: number; rate_percent: number; vat_account: string | null }[]
  const vatMap = new Map(
    allVatCodes.map((vc) => [
      vc.id,
      { rate: vc.rate_percent, vat_account: vc.vat_account },
    ]),
  )

  let totalNet = 0
  let totalVat = 0
  const processed = lines.map((line) => {
    // M92: quantity * unit_price_ore = line_total_ore (heltal-aritmetik, ingen division)
    const lineTotal = line.quantity * line.unit_price_ore
    const vatInfo = vatMap.get(line.vat_code_id)
    const vatAmount = vatInfo ? Math.round((lineTotal * vatInfo.rate) / 100) : 0
    totalNet += lineTotal
    totalVat += vatAmount
    return {
      ...line,
      line_total_ore: lineTotal,
      vat_amount_ore: vatAmount,
    }
  })

  return { processed, totalNet, totalVat, totalInclVat: totalNet + totalVat }
}

export function saveExpenseDraft(
  db: Database.Database,
  input: unknown,
): IpcResult<{ id: number }> {
  const parsed = SaveExpenseDraftSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
      code: 'VALIDATION_ERROR',
    }
  }
  const data = parsed.data

  try {
    return db.transaction(() => {
      // Verify counterparty is supplier/both
      const cp = db
        .prepare('SELECT type FROM counterparties WHERE id = ?')
        .get(data.counterparty_id) as { type: string } | undefined
      if (!cp || (cp.type !== 'supplier' && cp.type !== 'both')) {
        return {
          success: false as const,
          error: 'Motparten är inte en leverantör.',
          code: 'INVALID_COUNTERPARTY_TYPE' as const,
        }
      }

      // Duplicate check
      if (data.supplier_invoice_number) {
        const dup = db
          .prepare(
            'SELECT id FROM expenses WHERE counterparty_id = ? AND supplier_invoice_number = ?',
          )
          .get(data.counterparty_id, data.supplier_invoice_number)
        if (dup) {
          return {
            success: false as const,
            error: 'Leverantörsfakturanumret finns redan registrerat.',
            code: 'DUPLICATE_SUPPLIER_INVOICE' as const,
          }
        }
      }

      const { processed, totalInclVat } = processExpenseLines(db, data.lines)
      const dueDate =
        data.due_date ?? addDays(data.expense_date, data.payment_terms)

      const result = db
        .prepare(
          `INSERT INTO expenses (
          fiscal_year_id, counterparty_id, supplier_invoice_number,
          expense_date, due_date, description, status, payment_terms,
          total_amount_ore, notes
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`,
        )
        .run(
          data.fiscal_year_id,
          data.counterparty_id,
          data.supplier_invoice_number ?? null,
          data.expense_date,
          dueDate,
          data.description,
          data.payment_terms,
          totalInclVat,
          data.notes,
        )
      const expenseId = Number(result.lastInsertRowid)

      const insertLine = db.prepare(
        `INSERT INTO expense_lines (
          expense_id, description, account_number, quantity,
          unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const line of processed) {
        insertLine.run(
          expenseId,
          line.description,
          line.account_number,
          line.quantity,
          line.unit_price_ore,
          line.vat_code_id,
          line.line_total_ore,
          line.vat_amount_ore,
        )
      }

      return { success: true as const, data: { id: expenseId } }
    })()
  } catch (err) {
    log.error('[expense-service] saveExpenseDraft failed:', err)
    return {
      success: false,
      error: 'Kunde inte spara kostnadsutkastet.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function getExpenseDraft(
  db: Database.Database,
  id: number,
): IpcResult<ExpenseWithLines | null> {
  const expense = db
    .prepare(
      `SELECT e.*, c.name as counterparty_name FROM expenses e
     LEFT JOIN counterparties c ON e.counterparty_id = c.id
     WHERE e.id = ?`,
    )
    .get(id) as (Expense & { counterparty_name: string }) | undefined

  if (!expense) return { success: true, data: null }

  const lines = db
    .prepare('SELECT * FROM expense_lines WHERE expense_id = ?')
    .all(id) as ExpenseLine[]

  return { success: true, data: { ...expense, lines } }
}

export function updateExpenseDraft(
  db: Database.Database,
  input: unknown,
): IpcResult<{ id: number }> {
  const parsed = UpdateExpenseDraftSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
      code: 'VALIDATION_ERROR',
    }
  }
  const { id, ...data } = parsed.data

  try {
    return db.transaction(() => {
      const existing = db
        .prepare('SELECT status FROM expenses WHERE id = ?')
        .get(id) as { status: string } | undefined
      if (!existing)
        return {
          success: false as const,
          error: 'Kostnad hittades inte.',
          code: 'EXPENSE_NOT_FOUND' as const,
        }
      if (existing.status !== 'draft')
        return {
          success: false as const,
          error: 'Bara utkast kan redigeras.',
          code: 'VALIDATION_ERROR' as const,
        }

      const { processed, totalInclVat } = processExpenseLines(db, data.lines)
      const dueDate =
        data.due_date ?? addDays(data.expense_date, data.payment_terms)

      db.prepare(
        `UPDATE expenses SET
          counterparty_id = ?, supplier_invoice_number = ?,
          expense_date = ?, due_date = ?, description = ?,
          payment_terms = ?, total_amount_ore = ?, notes = ?,
          updated_at = datetime('now','localtime')
        WHERE id = ?`,
      ).run(
        data.counterparty_id,
        data.supplier_invoice_number ?? null,
        data.expense_date,
        dueDate,
        data.description,
        data.payment_terms,
        totalInclVat,
        data.notes,
        id,
      )

      db.prepare('DELETE FROM expense_lines WHERE expense_id = ?').run(id)
      const insertLine = db.prepare(
        `INSERT INTO expense_lines (
          expense_id, description, account_number, quantity,
          unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const line of processed) {
        insertLine.run(
          id,
          line.description,
          line.account_number,
          line.quantity,
          line.unit_price_ore,
          line.vat_code_id,
          line.line_total_ore,
          line.vat_amount_ore,
        )
      }

      return { success: true as const, data: { id } }
    })()
  } catch (err) {
    log.error('[expense-service] updateExpenseDraft failed:', err)
    return {
      success: false,
      error: 'Kunde inte uppdatera kostnaden.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function deleteExpenseDraft(
  db: Database.Database,
  id: number,
): IpcResult<undefined> {
  const existing = db
    .prepare('SELECT status FROM expenses WHERE id = ?')
    .get(id) as { status: string } | undefined
  if (!existing)
    return {
      success: false,
      error: 'Kostnad hittades inte.',
      code: 'EXPENSE_NOT_FOUND',
    }
  if (existing.status !== 'draft')
    return {
      success: false,
      error: 'Bara utkast kan raderas.',
      code: 'VALIDATION_ERROR',
    }

  db.prepare('DELETE FROM expenses WHERE id = ?').run(id) // CASCADE deletes lines
  return { success: true, data: undefined }
}

export function listExpenseDrafts(
  db: Database.Database,
  fiscalYearId: number,
): IpcResult<ExpenseDraftListItem[]> {
  const items = db
    .prepare(
      `SELECT e.id, c.name as counterparty_name,
      e.supplier_invoice_number, e.expense_date, e.description,
      e.total_amount_ore, e.created_at
    FROM expenses e
    LEFT JOIN counterparties c ON e.counterparty_id = c.id
    WHERE e.fiscal_year_id = ? AND e.status = 'draft'
    ORDER BY e.expense_date DESC`,
    )
    .all(fiscalYearId) as ExpenseDraftListItem[]
  return { success: true, data: items }
}

export function finalizeExpense(
  db: Database.Database,
  id: number,
): IpcResult<{ id: number; verification_number: number }> {
  try {
    return db.transaction(() => {
      // 1. Hämta expense
      const expense = db
        .prepare('SELECT * FROM expenses WHERE id = ?')
        .get(id) as Expense | undefined
      if (!expense)
        throw { code: 'EXPENSE_NOT_FOUND', error: 'Kostnad hittades inte' }
      if (expense.status !== 'draft')
        throw { code: 'VALIDATION_ERROR', error: 'Bara utkast kan bokföras' }

      // 2. Lines
      const lines = db
        .prepare('SELECT * FROM expense_lines WHERE expense_id = ?')
        .all(id) as ExpenseLine[]
      if (lines.length === 0)
        throw { code: 'VALIDATION_ERROR', error: 'Kostnaden har inga rader' }

      // 3. Verify counterparty still supplier
      const cp = db
        .prepare('SELECT type, name FROM counterparties WHERE id = ?')
        .get(expense.counterparty_id) as
        | { type: string; name: string }
        | undefined
      if (!cp || (cp.type !== 'supplier' && cp.type !== 'both'))
        throw {
          code: 'INVALID_COUNTERPARTY_TYPE',
          error: 'Motparten är inte en leverantör',
        }

      // 4. Validate period open
      const fy = db
        .prepare('SELECT is_closed FROM fiscal_years WHERE id = ?')
        .get(expense.fiscal_year_id) as { is_closed: number }
      if (fy.is_closed)
        throw { code: 'YEAR_IS_CLOSED', error: 'Räkenskapsåret är stängt' }

      const period = db
        .prepare(
          'SELECT is_closed FROM accounting_periods WHERE fiscal_year_id = ? AND ? BETWEEN start_date AND end_date',
        )
        .get(expense.fiscal_year_id, expense.expense_date) as
        | { is_closed: number }
        | undefined
      if (period && period.is_closed)
        throw { code: 'YEAR_IS_CLOSED', error: 'Perioden är stängd' }

      // 5. Block future dates
      const today = todayLocal()
      if (expense.expense_date > today)
        throw {
          code: 'VALIDATION_ERROR',
          error: 'Kostnadsdatum kan inte vara i framtiden',
        }

      // 6. Allokera B-serie verifikationsnummer
      const maxVer = db
        .prepare(
          "SELECT COALESCE(MAX(verification_number), 0) as max_num FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'B'",
        )
        .get(expense.fiscal_year_id) as { max_num: number }
      const nextVer = maxVer.max_num + 1

      // 7. Build journal lines
      const { processed, totalInclVat } = processExpenseLines(db, lines)

      // Aggregera per kostnadskonto
      const costTotals = new Map<string, number>()
      const vatTotals = new Map<string, number>()
      for (const line of processed) {
        costTotals.set(
          line.account_number,
          (costTotals.get(line.account_number) ?? 0) + line.line_total_ore,
        )
        if (line.vat_amount_ore > 0) {
          // All incoming VAT goes to 2640
          vatTotals.set(
            '2640',
            (vatTotals.get('2640') ?? 0) + line.vat_amount_ore,
          )
        }
      }

      // Validate all referenced accounts are active
      const allExpenseAccounts = [
        ...costTotals.keys(),
        ...vatTotals.keys(),
        '2440', // Leverantörsskulder
      ]
      validateAccountsActive(db, allExpenseAccounts)

      let totalDebit = 0
      for (const v of costTotals.values()) totalDebit += v
      for (const v of vatTotals.values()) totalDebit += v

      // Öresutjämning
      const diff = totalInclVat - totalDebit
      if (Math.abs(diff) > 50) {
        throw {
          code: 'VALIDATION_ERROR',
          error: 'Avrundning överstiger 50 öre',
        }
      }

      // 8. INSERT journal_entry
      const description = `Leverantörsfaktura — ${cp.name}`
      const entryResult = db
        .prepare(
          `INSERT INTO journal_entries (
          company_id, fiscal_year_id, verification_number, verification_series,
          journal_date, description, status, source_type
        ) VALUES (
          (SELECT id FROM companies LIMIT 1), ?, ?, 'B',
          ?, ?, 'draft', 'auto_expense'
        )`,
        )
        .run(expense.fiscal_year_id, nextVer, expense.expense_date, description)
      const journalEntryId = Number(entryResult.lastInsertRowid)

      // 9. INSERT journal_entry_lines
      let lineNum = 1
      const insertLine = db.prepare(
        `INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_number,
          debit_ore, credit_ore, description
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )

      // DEBET: kostnadskonton
      for (const [acctNum, amount] of costTotals) {
        insertLine.run(
          journalEntryId,
          lineNum++,
          acctNum,
          amount,
          0,
          description,
        )
      }

      // DEBET: momskonton (ingående moms → 2640)
      for (const [acctNum, amount] of vatTotals) {
        insertLine.run(
          journalEntryId,
          lineNum++,
          acctNum,
          amount,
          0,
          description,
        )
      }

      // Öresutjämning 3740
      if (diff > 0) {
        insertLine.run(journalEntryId, lineNum++, '3740', diff, 0, description)
        totalDebit += diff
      } else if (diff < 0) {
        insertLine.run(
          journalEntryId,
          lineNum++,
          '3740',
          0,
          Math.abs(diff),
          description,
        )
      }

      // KREDIT: 2440 Leverantörsskulder
      insertLine.run(
        journalEntryId,
        lineNum++,
        '2440',
        0,
        totalInclVat,
        description,
      )

      // 10. Book journal entry
      db.prepare(
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
      ).run(journalEntryId)

      // 11. Update expense
      db.prepare(
        `UPDATE expenses SET
          status = 'unpaid', journal_entry_id = ?,
          total_amount_ore = ?, updated_at = datetime('now','localtime')
        WHERE id = ?`,
      ).run(journalEntryId, totalInclVat, id)

      return {
        success: true as const,
        data: { id, verification_number: nextVer },
      }
    })()
  } catch (err: unknown) {
    const e = err as { code?: string; error?: string; message?: string; field?: string }
    if (e.code && e.error) {
      return {
        success: false,
        error: e.error,
        code: e.code as ErrorCode,
        field: e.field, // M100: bevara field-information från strukturerade fel
      }
    }
    if (err instanceof Error) {
      log.error('[expense-service] finalizeExpense failed:', err.message)
      return {
        success: false,
        error: err.message,
        code: 'TRANSACTION_ERROR' as ErrorCode,
      }
    }
    log.error('[expense-service] finalizeExpense failed:', err)
    return {
      success: false,
      error: 'Bokföring av kostnad misslyckades.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

// ════════════════════════════════════════════════════════════
// payExpense — mirrors payInvoice() exactly (inverted accounts)
// DEBET 2440 Leverantörsskulder / KREDIT bank, B-serie
// ════════════════════════════════════════════════════════════
export function payExpense(
  db: Database.Database,
  input: {
    expense_id: number
    amount: number
    payment_date: string
    payment_method: string
    account_number: string
  },
): IpcResult<{ expense: Expense; payment: ExpensePayment }> {
  // Pre-flight: block future dates (M9)
  const today = todayLocal()
  if (input.payment_date > today) {
    return {
      success: false,
      error: 'Betalningsdatum kan inte vara i framtiden.',
      code: 'VALIDATION_ERROR',
      field: 'payment_date',
    }
  }

  try {
    const result = db.transaction(() => {
      // 1. Hämta expense
      const expense = db
        .prepare('SELECT * FROM expenses WHERE id = ?')
        .get(input.expense_id) as Expense | undefined
      if (!expense)
        throw { code: 'EXPENSE_NOT_FOUND', error: 'Kostnad hittades inte' }

      // 2. Validera status (unpaid, overdue, partial)
      const payableStatuses = ['unpaid', 'overdue', 'partial']
      if (!payableStatuses.includes(expense.status)) {
        throw {
          code: 'EXPENSE_NOT_PAYABLE',
          error: 'Kan inte registrera betalning på denna kostnad.',
        }
      }

      // 3. Betaldatum före kostnadsdatum blockeras
      if (input.payment_date < expense.expense_date) {
        throw {
          code: 'PAYMENT_BEFORE_EXPENSE',
          error: 'Betaldatum kan inte vara före kostnadsdatum.',
          field: 'payment_date',
        }
      }

      // 4. Beräkna remaining
      const paidResult = db
        .prepare(
          'SELECT COALESCE(SUM(amount), 0) as total_paid FROM expense_payments WHERE expense_id = ?',
        )
        .get(input.expense_id) as { total_paid: number }
      const remaining = expense.total_amount_ore - paidResult.total_paid

      // 5. Öresutjämning (M99) — mirror payInvoice exactly
      const ROUNDING_THRESHOLD = 50
      const diff = input.amount - remaining

      if (diff > ROUNDING_THRESHOLD) {
        throw {
          code: 'OVERPAYMENT',
          error: `Beloppet överstiger kvarstående med mer än ${ROUNDING_THRESHOLD} öre.`,
          field: 'amount',
        }
      }

      // M99: Öresutjämning aktiveras när |diff| ≤ 50 öre och kostnaden har kvarstående belopp.
      // Tidigare fanns ett villkor `remaining > ROUNDING_THRESHOLD * 2` som blockerade
      // fullbetalning av kostnader med restbelopp ≤ 100 öre och orsakade tyst datakorruption.
      // Fixad i Sprint 11 Fas 4 (F3).
      const isAttemptedFullPayment =
        Math.abs(diff) <= ROUNDING_THRESHOLD && remaining > 0
      const needsRounding = isAttemptedFullPayment && diff !== 0
      const roundingAmount = needsRounding ? diff : 0

      const effectivePayment = input.amount
      const actualPayablesDebit = needsRounding ? remaining : input.amount

      // 6. Find fiscal year for payment date (M8)
      const paymentYear = db
        .prepare(
          'SELECT id FROM fiscal_years WHERE start_date <= ? AND end_date >= ?',
        )
        .get(input.payment_date, input.payment_date) as
        | { id: number }
        | undefined
      if (!paymentYear) {
        throw {
          code: 'VALIDATION_ERROR',
          error: 'Betalningsdatum faller inte i något räkenskapsår.',
          field: 'payment_date',
        }
      }

      // 7. Validate period open
      const period = db
        .prepare(
          'SELECT is_closed FROM accounting_periods WHERE fiscal_year_id = ? AND ? BETWEEN start_date AND end_date',
        )
        .get(paymentYear.id, input.payment_date) as
        | { is_closed: number }
        | undefined
      if (period && period.is_closed) {
        throw {
          code: 'YEAR_IS_CLOSED',
          error: 'Perioden är stängd.',
        }
      }

      // 8. Kronologisk datumordning (M6) — B-serie
      const lastEntry = db
        .prepare(
          `SELECT journal_date FROM journal_entries
           WHERE fiscal_year_id = ? AND verification_series = 'B'
           ORDER BY verification_number DESC LIMIT 1`,
        )
        .get(paymentYear.id) as { journal_date: string } | undefined

      if (lastEntry && input.payment_date < lastEntry.journal_date) {
        throw {
          code: 'VALIDATION_ERROR',
          error: 'Datum före senaste verifikation i B-serien.',
          field: 'payment_date',
        }
      }

      // 9. Allokera verifikationsnummer B-serie
      const nextVerResult = db
        .prepare(
          "SELECT COALESCE(MAX(verification_number), 0) + 1 as next_ver FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'B'",
        )
        .get(paymentYear.id) as { next_ver: number }

      // 10. Leverantörsnamn
      const counterparty = db
        .prepare('SELECT name FROM counterparties WHERE id = ?')
        .get(expense.counterparty_id) as { name: string } | undefined
      const counterpartyName = counterparty?.name ?? 'Okänd leverantör'

      const description = `Betalning leverantörsfaktura — ${counterpartyName}`

      // 11. INSERT journal_entry (B-serie)
      const entryResult = db
        .prepare(
          `INSERT INTO journal_entries (
          company_id, fiscal_year_id, verification_number, verification_series,
          journal_date, description, status, source_type
        ) VALUES (
          (SELECT id FROM companies LIMIT 1), ?, ?, 'B',
          ?, ?, 'draft', 'auto_payment'
        )`,
        )
        .run(
          paymentYear.id,
          nextVerResult.next_ver,
          input.payment_date,
          description,
        )
      const journalEntryId = Number(entryResult.lastInsertRowid)

      // 12. INSERT journal_entry_lines
      let lineNum = 1
      const insertLine = db.prepare(
        `INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_number,
          debit_ore, credit_ore, description
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )

      // DEBET: 2440 Leverantörsskulder (minskar skulden)
      insertLine.run(
        journalEntryId,
        lineNum++,
        '2440',
        actualPayablesDebit,
        0,
        description,
      )

      // DEBET: 3740 Öresutjämning (om vi betalar MER än skulden)
      if (roundingAmount > 0) {
        insertLine.run(
          journalEntryId,
          lineNum++,
          '3740',
          roundingAmount,
          0,
          description,
        )
      }

      // KREDIT: Bankkonto (pengar lämnar företaget)
      insertLine.run(
        journalEntryId,
        lineNum++,
        input.account_number,
        0,
        effectivePayment,
        description,
      )

      // KREDIT: 3740 Öresutjämning (om vi betalar MINDRE)
      if (roundingAmount < 0) {
        insertLine.run(
          journalEntryId,
          lineNum++,
          '3740',
          0,
          Math.abs(roundingAmount),
          description,
        )
      }

      // 13. Book journal entry
      db.prepare(
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
      ).run(journalEntryId)

      // 14. INSERT expense_payment (amount = actualPayablesDebit)
      const paymentResult = db
        .prepare(
          `INSERT INTO expense_payments (
          expense_id, journal_entry_id, payment_date, amount,
          payment_method, account_number
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.expense_id,
          journalEntryId,
          input.payment_date,
          actualPayablesDebit,
          input.payment_method,
          input.account_number,
        )

      // 15. UPDATE expense paid_amount + status atomically from payments (M66)
      db.prepare(
        `UPDATE expenses SET
          paid_amount = (SELECT COALESCE(SUM(amount), 0) FROM expense_payments WHERE expense_id = expenses.id),
          status = CASE
            WHEN (SELECT COALESCE(SUM(amount), 0) FROM expense_payments WHERE expense_id = expenses.id) >= total_amount_ore THEN 'paid'
            WHEN (SELECT COALESCE(SUM(amount), 0) FROM expense_payments WHERE expense_id = expenses.id) > 0 THEN 'partial'
            ELSE status
          END,
          updated_at = datetime('now','localtime')
        WHERE id = ?`,
      ).run(input.expense_id)

      return {
        expense: db
          .prepare('SELECT * FROM expenses WHERE id = ?')
          .get(input.expense_id) as Expense,
        payment: db
          .prepare('SELECT * FROM expense_payments WHERE id = ?')
          .get(Number(paymentResult.lastInsertRowid)) as ExpensePayment,
      }
    })()

    return { success: true, data: result }
  } catch (err: unknown) {
    const e = err as {
      code?: string
      error?: string
      field?: string
    }
    if (e.code) {
      return {
        success: false,
        error: e.error ?? 'Betalning misslyckades.',
        code: e.code as ErrorCode,
        field: e.field,
      }
    }
    log.error('[expense-service] payExpense failed:', err)
    return {
      success: false,
      error: 'Betalning misslyckades.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

// ════════════════════════════════════════════════════════════
// refreshExpenseStatuses — marks overdue expenses
// ════════════════════════════════════════════════════════════
export function refreshExpenseStatuses(db: Database.Database): number {
  const result = db
    .prepare(
      `UPDATE expenses
     SET status = 'overdue', updated_at = datetime('now','localtime')
     WHERE status = 'unpaid'
       AND due_date IS NOT NULL
       AND due_date != ''
       AND due_date < date('now','localtime')`,
    )
    .run()
  return result.changes
}

// ════════════════════════════════════════════════════════════
// ensureExpenseIndexes
// ════════════════════════════════════════════════════════════
export function ensureExpenseIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_expenses_fiscal_year_status
    ON expenses(fiscal_year_id, status, expense_date)
  `)
}

// ════════════════════════════════════════════════════════════
// listExpenses — filter, search, sort, status counts
// ════════════════════════════════════════════════════════════
export function listExpenses(
  db: Database.Database,
  input: {
    fiscal_year_id: number
    status?: string
    search?: string
    sort_by?: string
    sort_order?: string
  },
): {
  expenses: ExpenseListItem[]
  counts: ExpenseStatusCounts
} {
  refreshExpenseStatuses(db)

  // Status counts
  const countRows = db
    .prepare(
      'SELECT status, COUNT(*) as count FROM expenses WHERE fiscal_year_id = ? GROUP BY status',
    )
    .all(input.fiscal_year_id) as { status: string; count: number }[]

  const counts: ExpenseStatusCounts = {
    total: 0,
    draft: 0,
    unpaid: 0,
    partial: 0,
    paid: 0,
    overdue: 0,
  }
  for (const row of countRows) {
    counts.total += row.count
    const key = row.status as keyof ExpenseStatusCounts
    if (key in counts && key !== 'total') {
      counts[key] = row.count
    }
  }

  // Build query
  const conditions: string[] = ['e.fiscal_year_id = ?']
  const params: (string | number)[] = [input.fiscal_year_id]

  if (input.status) {
    conditions.push('e.status = ?')
    params.push(input.status)
  }

  if (input.search) {
    conditions.push(
      "(c.name LIKE '%' || ? || '%' OR e.description LIKE '%' || ? || '%' OR e.supplier_invoice_number LIKE '%' || ? || '%')",
    )
    params.push(input.search, input.search, input.search)
  }

  const sortColumnMap: Record<string, string> = {
    expense_date: 'e.expense_date',
    due_date: 'e.due_date',
    description: 'e.description',
    total_amount: 'e.total_amount_ore',
    counterparty_name: 'c.name',
    status: 'e.status',
    supplier_invoice_number: 'e.supplier_invoice_number',
  }
  const sortCol =
    sortColumnMap[input.sort_by || 'expense_date'] || 'e.expense_date'
  const sortDir = input.sort_order === 'asc' ? 'ASC' : 'DESC'

  const rows = db
    .prepare(
      `SELECT
      e.id, e.expense_date, e.due_date, e.description,
      e.supplier_invoice_number, e.status, e.total_amount_ore,
      e.journal_entry_id,
      COALESCE(c.name, 'Okänd leverantör') as counterparty_name,
      je.verification_number, je.verification_series,
      e.paid_amount as total_paid
    FROM expenses e
    LEFT JOIN counterparties c ON e.counterparty_id = c.id
    LEFT JOIN journal_entries je ON e.journal_entry_id = je.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${sortCol} ${sortDir}`,
    )
    .all(...params) as (ExpenseListItem & { total_paid: number })[]

  // Compute remaining in TypeScript
  const expenses: ExpenseListItem[] = rows.map((row) => ({
    ...row,
    remaining: row.total_amount_ore - row.total_paid,
  }))

  return { expenses, counts }
}

// ════════════════════════════════════════════════════════════
// getExpensePayments
// ════════════════════════════════════════════════════════════
export function getExpensePayments(
  db: Database.Database,
  expenseId: number,
): ExpensePayment[] {
  return db
    .prepare(
      `SELECT id, expense_id, amount, payment_date, payment_method,
              account_number, journal_entry_id, created_at
       FROM expense_payments
       WHERE expense_id = ?
       ORDER BY payment_date ASC, id ASC`,
    )
    .all(expenseId) as ExpensePayment[]
}

// ════════════════════════════════════════════════════════════
// getExpense — like getExpenseDraft but without status filter,
// includes total_paid + remaining for PayExpenseDialog
// ════════════════════════════════════════════════════════════
export function getExpense(
  db: Database.Database,
  id: number,
): IpcResult<ExpenseDetail | null> {
  const expense = db
    .prepare(
      `SELECT e.*, c.name as counterparty_name FROM expenses e
     LEFT JOIN counterparties c ON e.counterparty_id = c.id
     WHERE e.id = ?`,
    )
    .get(id) as (Expense & { counterparty_name: string }) | undefined

  if (!expense) return { success: true, data: null }

  const lines = db
    .prepare('SELECT * FROM expense_lines WHERE expense_id = ?')
    .all(id) as ExpenseLine[]

  return {
    success: true,
    data: {
      ...expense,
      lines,
      total_paid: expense.paid_amount,
      remaining: expense.total_amount_ore - expense.paid_amount,
    },
  }
}
