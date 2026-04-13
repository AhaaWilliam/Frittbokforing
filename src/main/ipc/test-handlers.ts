/**
 * Test-only IPC handlers — registered ONLY when FRITT_TEST=1.
 * Prefixed with __test: to be unmistakable as non-production endpoints.
 * These expose raw DB reads + limited writes for E2E test assertions
 * and race-condition simulation.
 */
import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'

export function registerTestHandlers(db: Database.Database): void {
  ipcMain.handle('__test:getJournalEntries', (_event, fyId?: number) => {
    if (fyId) {
      const entries = db.prepare(
        'SELECT * FROM journal_entries WHERE fiscal_year_id = ? ORDER BY id',
      ).all(fyId)
      const lines = db.prepare(
        `SELECT jel.* FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE je.fiscal_year_id = ?
         ORDER BY jel.journal_entry_id, jel.line_number`,
      ).all(fyId)
      return { entries, lines }
    }
    const entries = db.prepare('SELECT * FROM journal_entries ORDER BY id').all()
    const lines = db.prepare(
      'SELECT * FROM journal_entry_lines ORDER BY journal_entry_id, line_number',
    ).all()
    return { entries, lines }
  })

  ipcMain.handle('__test:getInvoicePayments', (_event, invoiceId?: number) => {
    if (invoiceId) {
      return db.prepare(
        'SELECT * FROM invoice_payments WHERE invoice_id = ? ORDER BY id',
      ).all(invoiceId)
    }
    return db.prepare('SELECT * FROM invoice_payments ORDER BY id').all()
  })

  ipcMain.handle('__test:getPaymentBatches', () => {
    return db.prepare('SELECT * FROM payment_batches ORDER BY id').all()
  })

  ipcMain.handle('__test:getInvoices', (_event, fyId?: number) => {
    if (fyId) {
      return db.prepare(
        `SELECT i.*, (i.total_amount_ore - i.paid_amount_ore) as remaining
         FROM invoices i WHERE i.fiscal_year_id = ? ORDER BY i.id`,
      ).all(fyId)
    }
    return db.prepare(
      `SELECT i.*, (i.total_amount_ore - i.paid_amount_ore) as remaining
       FROM invoices i ORDER BY i.id`,
    ).all()
  })

  ipcMain.handle('__test:getExpenses', (_event, fyId?: number) => {
    if (fyId) {
      return db.prepare(
        'SELECT * FROM expenses WHERE fiscal_year_id = ? ORDER BY id',
      ).all(fyId)
    }
    return db.prepare('SELECT * FROM expenses ORDER BY id').all()
  })

  ipcMain.handle('__test:setInvoiceStatus', (_event, invoiceId: number, status: string) => {
    db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(status, invoiceId)
    return { ok: true }
  })

  ipcMain.handle('__test:createFiscalYear', (_event, opts: {
    companyId: number
    startDate: string
    endDate: string
    yearLabel: string
  }) => {
    const result = db.prepare(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
       VALUES (?, ?, ?, ?)`,
    ).run(opts.companyId, opts.yearLabel, opts.startDate, opts.endDate)
    const fyId = Number(result.lastInsertRowid)

    // Generate periods
    const start = new Date(opts.startDate)
    const end = new Date(opts.endDate)
    let periodNum = 1
    const cursor = new Date(start)
    while (cursor <= end && periodNum <= 12) {
      const pStart = cursor.toISOString().split('T')[0]
      const nextMonth = new Date(cursor)
      nextMonth.setMonth(nextMonth.getMonth() + 1)
      nextMonth.setDate(0)
      let pEnd = nextMonth.toISOString().split('T')[0]
      if (new Date(pEnd) > end) pEnd = opts.endDate

      db.prepare(
        `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(opts.companyId, fyId, periodNum, pStart, pEnd)

      periodNum++
      cursor.setMonth(cursor.getMonth() + 1)
      cursor.setDate(1)
    }

    // Verification sequences
    for (const series of ['A', 'B', 'C', 'O']) {
      db.prepare(
        `INSERT OR IGNORE INTO verification_sequences (fiscal_year_id, series, last_number)
         VALUES (?, ?, 0)`,
      ).run(fyId, series)
    }

    return { id: fyId }
  })
}
