import type Database from 'better-sqlite3'
import { todayLocal } from '../../shared/date-utils'
import { validateAccountsActive } from './account-service'
import type {
  Invoice,
  InvoiceLine,
  InvoiceWithLines,
  InvoiceListItem,
  InvoiceStatusCounts,
  InvoicePayment,
  IpcResult,
  ErrorCode,
  FinalizedInvoice,
  FinalizedInvoiceLine,
} from '../../shared/types'
import log from 'electron-log'
import { SaveDraftInputSchema, UpdateDraftInputSchema } from '../ipc-schemas'

function getDraftInternal(
  db: Database.Database,
  id: number,
): InvoiceWithLines | null {
  const invoice = db
    .prepare(
      `SELECT i.*, cp.name AS counterparty_name
     FROM invoices i
     JOIN counterparties cp ON cp.id = i.counterparty_id
     WHERE i.id = ?`,
    )
    .get(id) as (Invoice & { counterparty_name: string }) | undefined

  if (!invoice) return null

  const lines = db
    .prepare(
      'SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY sort_order ASC',
    )
    .all(id) as InvoiceLine[]

  return { ...invoice, lines }
}

function processLines(
  db: Database.Database,
  lines: {
    product_id: number | null
    description: string
    quantity: number
    unit_price_ore: number
    vat_code_id: number
    sort_order: number
    account_number?: string | null
  }[],
) {
  // Pre-fetch ALL vat codes to a Map (avoid N+1)
  const allVatCodes = db
    .prepare('SELECT id, rate_percent FROM vat_codes')
    .all() as { id: number; rate_percent: number }[]
  const vatRateMap = new Map(allVatCodes.map((vc) => [vc.id, vc.rate_percent]))

  let totalAmount = 0
  let vatAmount = 0
  const processed = lines.map((line) => {
    const lineTotal = Math.round(line.quantity * line.unit_price_ore)
    const rate = vatRateMap.get(line.vat_code_id) ?? 0
    // rate_percent is stored as 25, 12, 6, 0 — convert to decimal
    const effectiveRate = rate / 100
    const lineVat = Math.round(lineTotal * effectiveRate)
    totalAmount += lineTotal
    vatAmount += lineVat
    return { ...line, line_total_ore: lineTotal, vat_amount_ore: lineVat }
  })

  return { processed, totalAmount, vatAmount }
}

export function saveDraft(
  db: Database.Database,
  input: unknown,
): IpcResult<InvoiceWithLines> {
  const parsed = SaveDraftInputSchema.safeParse(input)
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
      const { processed, totalAmount, vatAmount } = processLines(db, data.lines)

      // INSERT invoice with status='draft', empty invoice_number
      const result = db
        .prepare(
          `INSERT INTO invoices (
          counterparty_id, fiscal_year_id, invoice_type, invoice_number,
          invoice_date, due_date, status, net_amount_ore, vat_amount_ore, total_amount_ore,
          currency, notes, payment_terms
        ) VALUES (?, ?, 'customer_invoice', '', ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          data.counterparty_id,
          data.fiscal_year_id,
          data.invoice_date,
          data.due_date,
          totalAmount,
          vatAmount,
          totalAmount + vatAmount,
          data.currency ?? 'SEK',
          data.notes ?? null,
          data.payment_terms,
        )
      const invoiceId = Number(result.lastInsertRowid)

      // INSERT invoice_lines
      const insertLine = db.prepare(
        `INSERT INTO invoice_lines (
          invoice_id, product_id, description, quantity,
          unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore, sort_order, account_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const line of processed) {
        insertLine.run(
          invoiceId,
          line.product_id,
          line.description,
          line.quantity,
          line.unit_price_ore,
          line.vat_code_id,
          line.line_total_ore,
          line.vat_amount_ore,
          line.sort_order,
          line.account_number ?? null,
        )
      }

      return { success: true as const, data: getDraftInternal(db, invoiceId)! }
    })()
  } catch (err) {
    log.error('[invoice-service] saveDraft failed:', err)
    return {
      success: false,
      error: 'Kunde inte spara fakturautkastet.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function getDraft(
  db: Database.Database,
  id: number,
): InvoiceWithLines | null {
  return getDraftInternal(db, id)
}

export function updateDraft(
  db: Database.Database,
  input: unknown,
): IpcResult<InvoiceWithLines> {
  const parsed = UpdateDraftInputSchema.safeParse(input)
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
      const existing = db
        .prepare('SELECT status FROM invoices WHERE id = ?')
        .get(data.id) as { status: string } | undefined
      if (!existing) {
        return {
          success: false as const,
          error: 'Fakturan hittades inte.',
          code: 'INVOICE_NOT_FOUND' as const,
        }
      }
      if (existing.status !== 'draft') {
        return {
          success: false as const,
          error: 'Bara utkast kan redigeras.',
          code: 'INVOICE_NOT_DRAFT' as const,
        }
      }

      const { processed, totalAmount, vatAmount } = processLines(db, data.lines)

      db.prepare(
        `UPDATE invoices SET
          counterparty_id = ?, invoice_date = ?, due_date = ?,
          net_amount_ore = ?, vat_amount_ore = ?, total_amount_ore = ?,
          notes = ?, payment_terms = ?, updated_at = datetime('now','localtime')
        WHERE id = ? AND status = 'draft'`,
      ).run(
        data.counterparty_id,
        data.invoice_date,
        data.due_date,
        totalAmount,
        vatAmount,
        totalAmount + vatAmount,
        data.notes ?? null,
        data.payment_terms,
        data.id,
      )

      // DELETE + INSERT invoice_lines
      db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(data.id)

      const insertLine = db.prepare(
        `INSERT INTO invoice_lines (
          invoice_id, product_id, description, quantity,
          unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore, sort_order, account_number
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const line of processed) {
        insertLine.run(
          data.id,
          line.product_id,
          line.description,
          line.quantity,
          line.unit_price_ore,
          line.vat_code_id,
          line.line_total_ore,
          line.vat_amount_ore,
          line.sort_order,
          line.account_number ?? null,
        )
      }

      return {
        success: true as const,
        data: getDraftInternal(db, data.id)!,
      }
    })()
  } catch (err) {
    log.error('[invoice-service] updateDraft failed:', err)
    return {
      success: false,
      error: 'Kunde inte uppdatera fakturautkastet.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function deleteDraft(
  db: Database.Database,
  id: number,
): IpcResult<undefined> {
  try {
    return db.transaction(() => {
      const existing = db
        .prepare('SELECT status FROM invoices WHERE id = ?')
        .get(id) as { status: string } | undefined
      if (!existing) {
        return {
          success: false as const,
          error: 'Fakturan hittades inte.',
          code: 'INVOICE_NOT_FOUND' as const,
        }
      }
      if (existing.status !== 'draft') {
        return {
          success: false as const,
          error: 'Bara utkast kan raderas.',
          code: 'INVOICE_NOT_DRAFT' as const,
        }
      }

      // Guard: verify no payments linked to draft
      const linkedPayments = db
        .prepare(
          'SELECT COUNT(*) as cnt FROM invoice_payments WHERE invoice_id = ?',
        )
        .get(id) as { cnt: number }
      if (linkedPayments.cnt > 0) {
        return {
          success: false as const,
          error: 'Fakturan har kopplade betalningar och kan inte raderas.',
          code: 'INVOICE_HAS_PAYMENTS' as const,
        }
      }

      db.prepare('DELETE FROM invoice_lines WHERE invoice_id = ?').run(id)
      db.prepare("DELETE FROM invoices WHERE id = ? AND status = 'draft'").run(
        id,
      )

      return { success: true as const, data: undefined }
    })()
  } catch (err) {
    log.error('[invoice-service] deleteDraft failed:', err)
    return {
      success: false,
      error: 'Kunde inte radera fakturautkastet.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function listDrafts(
  db: Database.Database,
  fiscalYearId: number,
): (Invoice & { counterparty_name: string })[] {
  return db
    .prepare(
      `SELECT i.*, cp.name AS counterparty_name
     FROM invoices i
     JOIN counterparties cp ON cp.id = i.counterparty_id
     WHERE i.fiscal_year_id = ? AND i.status = 'draft'
     ORDER BY i.created_at DESC`,
    )
    .all(fiscalYearId) as (Invoice & { counterparty_name: string })[]
}

export function nextInvoiceNumber(
  db: Database.Database,
  fiscalYearId: number,
): { preview: number } {
  const result = db
    .prepare(
      "SELECT COALESCE(MAX(CAST(invoice_number AS INTEGER)), 0) + 1 AS next FROM invoices WHERE fiscal_year_id = ? AND invoice_number != ''",
    )
    .get(fiscalYearId) as { next: number }
  return { preview: result.next }
}

// ═══════════════════════════════════════════════════════════
// FINALIZE (bokför) — Session 7
// ═══════════════════════════════════════════════════════════

interface AggregatedJournalLine {
  account_number: string
  debit_ore: number
  credit_ore: number
  description: string
}

function buildJournalLines(
  db: Database.Database,
  invoiceId: number,
  counterpartyName: string,
  invoiceNumber: string,
): AggregatedJournalLine[] {
  const desc = `Kundfaktura #${invoiceNumber} — ${counterpartyName}`
  const lines: AggregatedJournalLine[] = []

  // Aggregera intäkter per account_number med SQL GROUP BY
  // Hanterar produktbaserade (p.account_id → a.account_number) och friform (il.account_number)
  const revenueRows = db
    .prepare(
      `SELECT
      COALESCE(a.account_number, il.account_number) as acct_number,
      SUM(il.line_total_ore) as total_amount_ore
    FROM invoice_lines il
    LEFT JOIN products p ON il.product_id = p.id
    LEFT JOIN accounts a ON p.account_id = a.id
    WHERE il.invoice_id = ?
    GROUP BY COALESCE(a.account_number, il.account_number)`,
    )
    .all(invoiceId) as { acct_number: string; total_amount_ore: number }[]

  // Aggregera moms per vat_code_id
  const vatRows = db
    .prepare(
      `SELECT vc.vat_account as vat_account_number, SUM(il.vat_amount_ore) as total_vat
    FROM invoice_lines il
    JOIN vat_codes vc ON vc.id = il.vat_code_id
    WHERE il.invoice_id = ? AND il.vat_amount_ore > 0
    GROUP BY vc.vat_account`,
    )
    .all(invoiceId) as {
    vat_account_number: string | null
    total_vat: number
  }[]

  const totalRevenue = revenueRows.reduce((sum, r) => sum + r.total_amount_ore, 0)
  const totalVat = vatRows.reduce((sum, r) => sum + r.total_vat, 0)
  const totalInclVat = totalRevenue + totalVat

  // DEBET — Kundfordringar (1510)
  lines.push({
    account_number: '1510',
    debit_ore: totalInclVat,
    credit_ore: 0,
    description: desc,
  })

  // KREDIT — Intäktskonton
  for (const row of revenueRows) {
    lines.push({
      account_number: row.acct_number,
      debit_ore: 0,
      credit_ore: row.total_amount_ore,
      description: desc,
    })
  }

  // KREDIT — Momskonton
  for (const row of vatRows) {
    if (!row.vat_account_number || row.total_vat === 0) continue
    lines.push({
      account_number: row.vat_account_number,
      debit_ore: 0,
      credit_ore: row.total_vat,
      description: desc,
    })
  }

  // Öresutjämning (konto 3740)
  const totalDebit = lines.reduce((sum, l) => sum + l.debit_ore, 0)
  const totalCredit = lines.reduce((sum, l) => sum + l.credit_ore, 0)
  const diff = totalDebit - totalCredit

  if (diff !== 0) {
    if (Math.abs(diff) > 50) {
      throw new Error(
        `Balance error: debit ${totalDebit} - credit ${totalCredit} = ${diff} öre. Diff > 50 indicates a bug.`,
      )
    }
    lines.push({
      account_number: '3740',
      debit_ore: diff < 0 ? Math.abs(diff) : 0,
      credit_ore: diff > 0 ? diff : 0,
      description: desc,
    })
  }

  // Defense in depth: final balance check
  const finalDebit = lines.reduce((sum, l) => sum + l.debit_ore, 0)
  const finalCredit = lines.reduce((sum, l) => sum + l.credit_ore, 0)
  if (finalDebit !== finalCredit) {
    throw new Error(
      `CRITICAL: Balance still wrong after rounding. Debit ${finalDebit} !== Credit ${finalCredit}`,
    )
  }

  return lines
}

export function finalizeDraft(
  db: Database.Database,
  id: number,
): IpcResult<InvoiceWithLines> {
  try {
    db.transaction(() => {
      // 1. Hämta draft
      const invoice = db
        .prepare('SELECT * FROM invoices WHERE id = ?')
        .get(id) as Invoice | undefined
      if (!invoice) throw { code: 'INVOICE_NOT_FOUND', error: 'Faktura saknas' }
      if (invoice.status !== 'draft')
        throw {
          code: 'INVOICE_NOT_DRAFT',
          error: 'Fakturan är inte ett utkast',
        }

      // 2. Check lines exist
      const lineCount = db
        .prepare('SELECT COUNT(*) as c FROM invoice_lines WHERE invoice_id = ?')
        .get(id) as { c: number }
      if (lineCount.c === 0)
        throw { code: 'VALIDATION_ERROR', error: 'Fakturan har inga rader' }

      // 3. Validate friform rows have account_number
      const missingAccount = db
        .prepare(
          'SELECT COUNT(*) as c FROM invoice_lines WHERE invoice_id = ? AND product_id IS NULL AND account_number IS NULL',
        )
        .get(id) as { c: number }
      if (missingAccount.c > 0)
        throw {
          code: 'VALIDATION_ERROR',
          error: 'Friformrad saknar intäktskonto',
          field: 'account_number',
        }

      // 4. Validate period open
      const fy = db
        .prepare('SELECT * FROM fiscal_years WHERE id = ?')
        .get(invoice.fiscal_year_id) as {
        is_closed: number
        start_date: string
        end_date: string
      }
      if (fy.is_closed)
        throw {
          code: 'YEAR_IS_CLOSED',
          error: 'Räkenskapsåret är stängt',
        }
      if (
        invoice.invoice_date < fy.start_date ||
        invoice.invoice_date > fy.end_date
      )
        throw {
          code: 'VALIDATION_ERROR',
          error: 'Fakturadatum utanför räkenskapsårets intervall',
        }

      const period = db
        .prepare(
          'SELECT is_closed FROM accounting_periods WHERE fiscal_year_id = ? AND ? BETWEEN start_date AND end_date',
        )
        .get(invoice.fiscal_year_id, invoice.invoice_date) as
        | { is_closed: number }
        | undefined
      if (period && period.is_closed)
        throw { code: 'YEAR_IS_CLOSED', error: 'Perioden är stängd' }

      // 5. Allokera fakturanummer
      const nextNumResult = db
        .prepare(
          "SELECT COALESCE(MAX(CAST(invoice_number AS INTEGER)), 0) + 1 as next_num FROM invoices WHERE fiscal_year_id = ? AND invoice_number != ''",
        )
        .get(invoice.fiscal_year_id) as { next_num: number }
      const invoiceNumber = String(nextNumResult.next_num)

      // 6. Allokera verifikationsnummer
      const nextVerResult = db
        .prepare(
          "SELECT COALESCE(MAX(verification_number), 0) + 1 as next_ver FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'A'",
        )
        .get(invoice.fiscal_year_id) as { next_ver: number }
      const verificationNumber = nextVerResult.next_ver

      // 7. Kundnamn
      const counterparty = db
        .prepare('SELECT name FROM counterparties WHERE id = ?')
        .get(invoice.counterparty_id) as { name: string }

      // 8. Bygg journal lines
      const journalLines = buildJournalLines(
        db,
        id,
        counterparty.name,
        invoiceNumber,
      )

      // 8b. Validate all referenced accounts are active
      const allAccountNumbers = journalLines.map((l) => l.account_number)
      validateAccountsActive(db, allAccountNumbers)

      // 9. INSERT journal_entry (status='draft' first, then book)
      const entryResult = db
        .prepare(
          `INSERT INTO journal_entries (
          company_id, fiscal_year_id, verification_number, verification_series,
          journal_date, description, status, source_type, created_by
        ) VALUES (
          (SELECT id FROM companies LIMIT 1), ?, ?, 'A',
          ?, ?, 'draft', 'auto_invoice', NULL
        )`,
        )
        .run(
          invoice.fiscal_year_id,
          verificationNumber,
          invoice.invoice_date,
          `Kundfaktura #${invoiceNumber} — ${counterparty.name}`,
        )
      const journalEntryId = Number(entryResult.lastInsertRowid)

      // 10. INSERT journal_entry_lines
      const insertLine = db.prepare(
        `INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_number,
          debit_ore, credit_ore, description
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )
      journalLines.forEach((jl, idx) => {
        insertLine.run(
          journalEntryId,
          idx + 1,
          jl.account_number,
          jl.debit_ore,
          jl.credit_ore,
          jl.description,
        )
      })

      // 11. Book the journal entry (triggers validate balance)
      db.prepare(
        "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
      ).run(journalEntryId)

      // 12. UPDATE invoice: status → 'unpaid', assign number, link journal entry
      db.prepare(
        `UPDATE invoices SET
          status = 'unpaid', invoice_number = ?,
          journal_entry_id = ?,
          updated_at = datetime('now','localtime')
        WHERE id = ?`,
      ).run(invoiceNumber, journalEntryId, id)

      return { invoiceNumber, verificationNumber, journalEntryId }
    })()

    return { success: true, data: getDraftInternal(db, id)! }
  } catch (err: unknown) {
    const e = err as { code?: string; error?: string; field?: string }
    if (e.code) {
      return {
        success: false,
        error: e.error ?? 'Bokföring misslyckades',
        code: e.code as IpcResult<InvoiceWithLines> extends {
          success: false
        }
          ? IpcResult<InvoiceWithLines>['code']
          : never,
        field: e.field,
      }
    }
    log.error('[invoice-service] finalizeDraft failed:', err)
    return {
      success: false,
      error: 'Bokföring misslyckades.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

export function updateSentInvoice(
  db: Database.Database,
  input: {
    id: number
    notes?: string | null
    payment_terms?: number
    due_date?: string
  },
): IpcResult<Invoice> {
  try {
    const invoice = db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(input.id) as Invoice | undefined
    if (!invoice)
      return {
        success: false,
        error: 'Faktura saknas.',
        code: 'INVOICE_NOT_FOUND',
      }
    if (invoice.status === 'draft')
      return {
        success: false,
        error: 'Kan bara uppdatera bokförda fakturor.',
        code: 'INVOICE_NOT_DRAFT',
      }

    const updates: string[] = []
    const params: unknown[] = []
    if (input.notes !== undefined) {
      updates.push('notes = ?')
      params.push(input.notes)
    }
    if (input.payment_terms !== undefined) {
      updates.push('payment_terms = ?')
      params.push(input.payment_terms)
    }
    if (input.due_date !== undefined) {
      updates.push('due_date = ?')
      params.push(input.due_date)
    }
    if (updates.length === 0) return { success: true, data: invoice }

    updates.push("updated_at = datetime('now','localtime')")
    params.push(input.id)
    db.prepare(`UPDATE invoices SET ${updates.join(', ')} WHERE id = ?`).run(
      ...params,
    )

    const updated = db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(input.id) as Invoice
    return { success: true, data: updated }
  } catch (err) {
    log.error('[invoice-service] updateSentInvoice failed:', err)
    return {
      success: false,
      error: 'Uppdatering misslyckades.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Invoice List + Overdue — Session 8
// ═══════════════════════════════════════════════════════════

export function refreshInvoiceStatuses(db: Database.Database): number {
  const result = db
    .prepare(
      `UPDATE invoices
     SET status = 'overdue', updated_at = datetime('now','localtime')
     WHERE status = 'unpaid'
       AND due_date < date('now','localtime')`,
    )
    .run()
  return result.changes
}

export function ensureInvoiceIndexes(db: Database.Database): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_invoices_list
    ON invoices(fiscal_year_id, status, invoice_date)
  `)
}

export function listInvoices(
  db: Database.Database,
  input: {
    fiscal_year_id: number
    status?: string
    search?: string
    sort_by?: string
    sort_order?: string
  },
): { items: InvoiceListItem[]; counts: InvoiceStatusCounts } {
  refreshInvoiceStatuses(db)

  // Status counts
  const countRows = db
    .prepare(
      'SELECT status, COUNT(*) as count FROM invoices WHERE fiscal_year_id = ? GROUP BY status',
    )
    .all(input.fiscal_year_id) as { status: string; count: number }[]

  const counts: InvoiceStatusCounts = {
    total: 0,
    draft: 0,
    unpaid: 0,
    partial: 0,
    paid: 0,
    overdue: 0,
  }
  for (const row of countRows) {
    counts.total += row.count
    const key = row.status as keyof InvoiceStatusCounts
    if (key in counts && key !== 'total') {
      counts[key] = row.count
    }
  }

  // Build query
  const conditions: string[] = ['i.fiscal_year_id = ?']
  const params: (string | number)[] = [input.fiscal_year_id]

  if (input.status) {
    conditions.push('i.status = ?')
    params.push(input.status)
  }

  if (input.search) {
    conditions.push(
      "(c.name LIKE '%' || ? || '%' OR CAST(i.invoice_number AS TEXT) LIKE '%' || ? || '%')",
    )
    params.push(input.search, input.search)
  }

  const sortColumnMap: Record<string, string> = {
    invoice_date: 'i.invoice_date',
    due_date: 'i.due_date',
    invoice_number: 'CAST(i.invoice_number AS INTEGER)',
    total_amount: 'i.total_amount_ore',
    counterparty_name: 'c.name',
  }
  const sortCol =
    sortColumnMap[input.sort_by || 'invoice_date'] || 'i.invoice_date'
  const sortDir = input.sort_order === 'asc' ? 'ASC' : 'DESC'

  const items = db
    .prepare(
      `SELECT
      i.id, i.invoice_number, i.invoice_date, i.due_date,
      i.net_amount_ore, i.vat_amount_ore, i.total_amount_ore,
      i.status, i.payment_terms, i.journal_entry_id,
      c.name as counterparty_name,
      je.verification_number,
      i.paid_amount_ore as total_paid,
      (i.total_amount_ore - i.paid_amount_ore) as remaining
    FROM invoices i
    LEFT JOIN counterparties c ON i.counterparty_id = c.id
    LEFT JOIN journal_entries je ON i.journal_entry_id = je.id
    WHERE ${conditions.join(' AND ')}
    ORDER BY ${sortCol} ${sortDir}`,
    )
    .all(...params) as InvoiceListItem[]

  return { items, counts }
}

// ═══════════════════════════════════════════════════════════
// Pay Invoice — Session 9 (refactored Sprint 13: _payInvoiceTx extraction)
// ═══════════════════════════════════════════════════════════

interface PayInvoiceTxResult {
  invoice: Invoice
  payment: InvoicePayment
  journalEntryId: number
}

/**
 * Internal transaction variant — does NOT open its own transaction.
 * Throws structured { code, error, field? } on failure.
 * Returns journalEntryId for bulk batch linking.
 */
function _payInvoiceTx(
  db: Database.Database,
  input: {
    invoice_id: number
    amount_ore: number
    payment_date: string
    payment_method: string
    account_number: string
    bank_fee_ore?: number
  },
): PayInvoiceTxResult {
  // 1. Hämta faktura
  const invoice = db
    .prepare('SELECT * FROM invoices WHERE id = ?')
    .get(input.invoice_id) as Invoice | undefined
  if (!invoice) throw { code: 'INVOICE_NOT_FOUND', error: 'Faktura saknas' }

  // 2. Validera status
  const payableStatuses = ['unpaid', 'overdue', 'partial']
  if (!payableStatuses.includes(invoice.status)) {
    throw {
      code: 'VALIDATION_ERROR',
      error: 'Kan inte registrera betalning på denna faktura.',
    }
  }

  // 3. Beräkna remaining (total_amount already includes VAT in our schema)
  const paidResult = db
    .prepare(
      'SELECT COALESCE(SUM(amount_ore), 0) as total_paid FROM invoice_payments WHERE invoice_id = ?',
    )
    .get(input.invoice_id) as { total_paid: number }
  const remaining = invoice.total_amount_ore - paidResult.total_paid

  // 4. Öresutjämning
  const ROUNDING_THRESHOLD = 50
  const diff = input.amount_ore - remaining

  if (diff > ROUNDING_THRESHOLD) {
    throw {
      code: 'OVERPAYMENT',
      error: `Beloppet överstiger kvarstående med mer än ${ROUNDING_THRESHOLD} öre.`,
      field: 'amount_ore',
    }
  }

  const isAttemptedFullPayment =
    Math.abs(diff) <= ROUNDING_THRESHOLD && remaining > 0
  const needsRounding = isAttemptedFullPayment && diff !== 0
  const roundingAmount = needsRounding ? diff : 0

  const effectivePayment = input.amount_ore
  const actualReceivablesCredit = needsRounding ? remaining : input.amount_ore

  // 4b. Bankavgift
  const bankFeeOre = input.bank_fee_ore ?? 0
  const BANK_FEE_ACCOUNT = '6570'
  if (bankFeeOre > 0) {
    if (bankFeeOre >= effectivePayment) {
      throw {
        code: 'VALIDATION_ERROR',
        error: 'Bankavgiften kan inte vara lika med eller överstiga betalningsbeloppet.',
        field: 'bank_fee_ore',
      }
    }
    validateAccountsActive(db, [BANK_FEE_ACCOUNT])
  }

  // 5. Find fiscal year for payment date
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

  // 6. Validate period open
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

  // 7. Allokera verifikationsnummer
  const nextVerResult = db
    .prepare(
      "SELECT COALESCE(MAX(verification_number), 0) + 1 as next_ver FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'A'",
    )
    .get(paymentYear.id) as { next_ver: number }

  // 8. Kundnamn
  const counterparty = db
    .prepare('SELECT name FROM counterparties WHERE id = ?')
    .get(invoice.counterparty_id) as { name: string }

  const description = `Betalning faktura #${invoice.invoice_number} — ${counterparty.name}`

  // 9. INSERT journal_entry (as draft, then book)
  const entryResult = db
    .prepare(
      `INSERT INTO journal_entries (
        company_id, fiscal_year_id, verification_number, verification_series,
        journal_date, description, status, source_type
      ) VALUES (
        (SELECT id FROM companies LIMIT 1), ?, ?, 'A',
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

  // 10. INSERT journal_entry_lines
  let lineNum = 1
  const insertLine = db.prepare(
    `INSERT INTO journal_entry_lines (
        journal_entry_id, line_number, account_number,
        debit_ore, credit_ore, description
      ) VALUES (?, ?, ?, ?, ?, ?)`,
  )

  // DEBET: Bankkonto (betalning minus bankavgift)
  insertLine.run(
    journalEntryId,
    lineNum++,
    input.account_number,
    effectivePayment - bankFeeOre,
    0,
    description,
  )

  // DEBET: 6570 Bankkostnader (om avgift > 0)
  if (bankFeeOre > 0) {
    insertLine.run(
      journalEntryId,
      lineNum++,
      BANK_FEE_ACCOUNT,
      bankFeeOre,
      0,
      description,
    )
  }

  // DEBET: 3740 Öresutjämning (om kund betalade MINDRE)
  if (roundingAmount < 0) {
    insertLine.run(
      journalEntryId,
      lineNum++,
      '3740',
      Math.abs(roundingAmount),
      0,
      description,
    )
  }

  // KREDIT: 1510 Kundfordringar
  insertLine.run(
    journalEntryId,
    lineNum++,
    '1510',
    0,
    actualReceivablesCredit,
    description,
  )

  // KREDIT: 3740 Öresutjämning (om kund betalade MER)
  if (roundingAmount > 0) {
    insertLine.run(
      journalEntryId,
      lineNum++,
      '3740',
      0,
      roundingAmount,
      description,
    )
  }

  // 11. Book journal entry (triggers validate balance)
  db.prepare(
    "UPDATE journal_entries SET status = 'booked' WHERE id = ?",
  ).run(journalEntryId)

  // 12. INSERT invoice_payment (amount = actual receivables credit)
  const paymentResult = db
    .prepare(
      `INSERT INTO invoice_payments (
        invoice_id, journal_entry_id, payment_date, amount_ore,
        payment_method, account_number, bank_fee_ore, bank_fee_account
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.invoice_id,
      journalEntryId,
      input.payment_date,
      actualReceivablesCredit,
      input.payment_method,
      input.account_number,
      bankFeeOre > 0 ? bankFeeOre : null,
      bankFeeOre > 0 ? BANK_FEE_ACCOUNT : null,
    )

  // 13. UPDATE invoice paid_amount + status atomically from payments
  db.prepare(
    `UPDATE invoices SET
        paid_amount_ore = (SELECT COALESCE(SUM(amount_ore), 0) FROM invoice_payments WHERE invoice_id = invoices.id),
        status = CASE
          WHEN (SELECT COALESCE(SUM(amount_ore), 0) FROM invoice_payments WHERE invoice_id = invoices.id) >= total_amount_ore THEN 'paid'
          WHEN (SELECT COALESCE(SUM(amount_ore), 0) FROM invoice_payments WHERE invoice_id = invoices.id) > 0 THEN 'partial'
          ELSE status
        END,
        updated_at = datetime('now','localtime')
      WHERE id = ?`,
  ).run(input.invoice_id)

  return {
    invoice: db
      .prepare('SELECT * FROM invoices WHERE id = ?')
      .get(input.invoice_id) as Invoice,
    payment: db
      .prepare('SELECT * FROM invoice_payments WHERE id = ?')
      .get(Number(paymentResult.lastInsertRowid)) as InvoicePayment,
    journalEntryId,
  }
}

export function payInvoice(
  db: Database.Database,
  input: {
    invoice_id: number
    amount_ore: number
    payment_date: string
    payment_method: string
    account_number: string
    bank_fee_ore?: number
  },
): IpcResult<{ invoice: Invoice; payment: InvoicePayment }> {
  // Pre-flight: block future dates
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
    const result = db.transaction(() => _payInvoiceTx(db, input))()
    // Strip journalEntryId from public contract
    return { success: true, data: { invoice: result.invoice, payment: result.payment } }
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
    log.error('[invoice-service] payInvoice failed:', err)
    return {
      success: false,
      error: 'Betalning misslyckades.',
      code: 'TRANSACTION_ERROR',
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Bulk Pay Invoices — Sprint 13 (M94/M95/M96)
// ═══════════════════════════════════════════════════════════

import type { BulkPaymentResult } from '../../shared/types'

export interface BulkPayInvoicesInput {
  payments: Array<{ invoice_id: number; amount_ore: number }>
  payment_date: string
  account_number: string
  bank_fee_ore?: number
  user_note?: string
}

export function payInvoicesBulk(
  db: Database.Database,
  input: BulkPayInvoicesInput,
): IpcResult<BulkPaymentResult> {
  // Pre-flight validations (outside transaction)
  if (input.payments.length < 1) {
    return { success: false, error: 'Minst en betalning krävs.', code: 'VALIDATION_ERROR' }
  }

  // Unique invoice_ids
  const ids = input.payments.map(p => p.invoice_id)
  if (new Set(ids).size !== ids.length) {
    return { success: false, error: 'Dubbletter av faktura-id.', code: 'VALIDATION_ERROR' }
  }

  // Block future dates
  const today = todayLocal()
  if (input.payment_date > today) {
    return { success: false, error: 'Betalningsdatum kan inte vara i framtiden.', code: 'VALIDATION_ERROR', field: 'payment_date' }
  }

  // Find fiscal year for payment_date
  const paymentYear = db
    .prepare('SELECT id FROM fiscal_years WHERE start_date <= ? AND end_date >= ?')
    .get(input.payment_date, input.payment_date) as { id: number } | undefined
  if (!paymentYear) {
    return { success: false, error: 'Betalningsdatum faller inte i något räkenskapsår.', code: 'VALIDATION_ERROR', field: 'payment_date' }
  }

  const bankFeeOre = input.bank_fee_ore ?? 0
  if (bankFeeOre > 0) {
    const totalPayments = input.payments.reduce((sum, p) => sum + p.amount_ore, 0)
    if (bankFeeOre >= totalPayments) {
      return { success: false, error: 'Bankavgiften kan inte vara lika med eller överstiga summan av alla betalningar.', code: 'VALIDATION_ERROR', field: 'bank_fee_ore' }
    }
  }

  try {
    const result = db.transaction(() => {
      const succeeded: Array<{ id: number; payment_id: number; journal_entry_id: number }> = []
      const failed: Array<{ id: number; error: string; code: string }> = []

      // Per-payment savepoints
      for (const p of input.payments) {
        try {
          db.transaction(() => {
            const txResult = _payInvoiceTx(db, {
              invoice_id: p.invoice_id,
              amount_ore: p.amount_ore,
              payment_date: input.payment_date,
              payment_method: 'bank',
              account_number: input.account_number,
              bank_fee_ore: 0, // Bank fee handled at batch level
            })
            succeeded.push({
              id: p.invoice_id,
              payment_id: txResult.payment.id,
              journal_entry_id: txResult.journalEntryId,
            })
          })()
        } catch (e: unknown) {
          const err = e as { code?: string; error?: string }
          failed.push({
            id: p.invoice_id,
            error: err.error ?? 'Okänt fel',
            code: err.code ?? 'TRANSACTION_ERROR',
          })
        }
      }

      // If all failed → cancelled, no batch
      if (succeeded.length === 0) {
        return {
          batch_id: null,
          status: 'cancelled' as const,
          succeeded,
          failed,
          bank_fee_journal_entry_id: null,
        }
      }

      // Create batch
      const batchStatus: 'completed' | 'partial' = failed.length === 0 ? 'completed' : 'partial'
      const batchResult = db
        .prepare(
          `INSERT INTO payment_batches (
            fiscal_year_id, batch_type, payment_date, account_number,
            bank_fee_ore, bank_fee_journal_entry_id, status, user_note
          ) VALUES (?, 'invoice', ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          paymentYear.id,
          input.payment_date,
          input.account_number,
          bankFeeOre,
          batchStatus,
          input.user_note ?? null,
        )
      const batchId = Number(batchResult.lastInsertRowid)

      // Link payments to batch
      const updateBatch = db.prepare(
        'UPDATE invoice_payments SET payment_batch_id = ? WHERE id = ?',
      )
      for (const s of succeeded) {
        updateBatch.run(batchId, s.payment_id)
      }

      // Bank fee journal entry (if > 0 and at least 1 succeeded)
      let bankFeeJournalEntryId: number | null = null
      if (bankFeeOre > 0) {
        // Allocate A-series verification number
        const nextVer = db
          .prepare(
            "SELECT COALESCE(MAX(verification_number), 0) + 1 as next_ver FROM journal_entries WHERE fiscal_year_id = ? AND verification_series = 'A'",
          )
          .get(paymentYear.id) as { next_ver: number }

        const description = `Bankavgift bulk-betalning ${input.payment_date}`

        // INSERT as draft with source_type and source_reference already set
        const entryResult = db
          .prepare(
            `INSERT INTO journal_entries (
              company_id, fiscal_year_id, verification_number, verification_series,
              journal_date, description, status, source_type, source_reference
            ) VALUES (
              (SELECT id FROM companies LIMIT 1), ?, ?, 'A',
              ?, ?, 'draft', 'auto_bank_fee', ?
            )`,
          )
          .run(
            paymentYear.id,
            nextVer.next_ver,
            input.payment_date,
            description,
            `batch:${batchId}`,
          )
        bankFeeJournalEntryId = Number(entryResult.lastInsertRowid)

        // 2 journal lines: debet 6570, kredit bank account
        const insertLine = db.prepare(
          `INSERT INTO journal_entry_lines (
            journal_entry_id, line_number, account_number,
            debit_ore, credit_ore, description
          ) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        insertLine.run(bankFeeJournalEntryId, 1, '6570', bankFeeOre, 0, description)
        insertLine.run(bankFeeJournalEntryId, 2, input.account_number, 0, bankFeeOre, description)

        // Book (triggers validate balance)
        db.prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?").run(bankFeeJournalEntryId)

        // Link bank fee to batch
        db.prepare('UPDATE payment_batches SET bank_fee_journal_entry_id = ? WHERE id = ?').run(bankFeeJournalEntryId, batchId)
      }

      return {
        batch_id: batchId,
        status: batchStatus,
        succeeded,
        failed,
        bank_fee_journal_entry_id: bankFeeJournalEntryId,
      }
    })()

    return { success: true, data: result }
  } catch (err: unknown) {
    const e = err as { code?: string; error?: string; field?: string }
    if (e.code) {
      return { success: false, error: e.error ?? 'Bulk-betalning misslyckades.', code: e.code as ErrorCode, field: e.field }
    }
    log.error('[invoice-service] payInvoicesBulk failed:', err)
    return { success: false, error: 'Bulk-betalning misslyckades.', code: 'TRANSACTION_ERROR' }
  }
}

export function getPayments(
  db: Database.Database,
  invoiceId: number,
): InvoicePayment[] {
  return db
    .prepare(
      `SELECT ip.*
     FROM invoice_payments ip
     WHERE ip.invoice_id = ?
     ORDER BY ip.payment_date ASC, ip.id ASC`,
    )
    .all(invoiceId) as InvoicePayment[]
}

// ═══════════════════════════════════════════════════════════
// Get Finalized Invoice (for PDF) — Session 22
// ═══════════════════════════════════════════════════════════

export function getFinalized(
  db: Database.Database,
  invoiceId: number,
): FinalizedInvoice {
  const invoice = db
    .prepare(
      `SELECT i.*, c.name as customer_name, c.org_number as customer_org_number,
              c.address_line1 as customer_address, c.postal_code as customer_postal_code,
              c.city as customer_city
       FROM invoices i
       JOIN counterparties c ON i.counterparty_id = c.id
       WHERE i.id = ? AND i.status != 'draft'`,
    )
    .get(invoiceId) as (Invoice & Record<string, unknown>) | undefined

  if (!invoice) throw new Error(`Finalized invoice ${invoiceId} not found`)

  const lines = db
    .prepare(
      `SELECT il.*, vc.rate_percent as vat_rate, vc.code as vat_code_name
       FROM invoice_lines il
       JOIN vat_codes vc ON il.vat_code_id = vc.id
       WHERE il.invoice_id = ?
       ORDER BY il.id`,
    )
    .all(invoiceId) as FinalizedInvoiceLine[]

  return { ...invoice, lines } as unknown as FinalizedInvoice
}
