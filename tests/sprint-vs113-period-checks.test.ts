/**
 * Sprint VS-113 — Månadsstängnings-checks (advisory).
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { getPeriodChecks } from '../src/main/services/period-checks-service'

let db: Database.Database

function setupCompanyAndPeriod(): {
  companyId: number
  fiscalYearId: number
  periodId: number
  start: string
  end: string
} {
  const res = createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  if (!res.success) throw new Error(`createCompany failed: ${res.error}`)
  const fy = db
    .prepare('SELECT id FROM fiscal_years WHERE company_id = ?')
    .get(res.data.id) as { id: number }
  const period = db
    .prepare(
      'SELECT id, start_date, end_date FROM accounting_periods WHERE fiscal_year_id = ? AND period_number = 3',
    )
    .get(fy.id) as { id: number; start_date: string; end_date: string }
  return {
    companyId: res.data.id,
    fiscalYearId: fy.id,
    periodId: period.id,
    start: period.start_date,
    end: period.end_date,
  }
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

describe('VS-113 getPeriodChecks (advisory)', () => {
  it('returnerar grundstrukturen med fyra checks + allOk', () => {
    const { periodId } = setupCompanyAndPeriod()
    const r = getPeriodChecks(db, { period_id: periodId })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data).toHaveProperty('bankReconciliation')
    expect(r.data).toHaveProperty('salaryBooked')
    expect(r.data).toHaveProperty('vatReportReady')
    expect(r.data).toHaveProperty('supplierPayments')
    expect(typeof r.data.allOk).toBe('boolean')
  })

  it('bankReconciliation = na när inga statements importerade', () => {
    const { periodId } = setupCompanyAndPeriod()
    const r = getPeriodChecks(db, { period_id: periodId })
    if (!r.success) return
    expect(r.data.bankReconciliation.status).toBe('na')
  })

  it('vatReportReady = warning när det finns draft-fakturor', () => {
    const { companyId, fiscalYearId, periodId, start } = setupCompanyAndPeriod()
    const cp = db
      .prepare(
        `INSERT INTO counterparties (company_id, name, type)
         VALUES (?, 'Kund', 'customer')`,
      )
      .run(companyId)
    db.prepare(
      `INSERT INTO invoices
        (fiscal_year_id, counterparty_id, invoice_type, invoice_number,
         invoice_date, due_date,
         net_amount_ore, vat_amount_ore, total_amount_ore, paid_amount_ore,
         status, payment_terms)
       VALUES (?, ?, 'customer_invoice', 'TEST-1', ?, ?, 0, 0, 0, 0, 'draft', 30)`,
    ).run(fiscalYearId, cp.lastInsertRowid, start, start)

    const r = getPeriodChecks(db, { period_id: periodId })
    if (!r.success) return
    expect(r.data.vatReportReady.status).toBe('warning')
    expect(r.data.vatReportReady.count).toBe(1)
    expect(r.data.allOk).toBe(false)
  })

  it('supplierPayments = warning när unpaid expense förfallen', () => {
    const { companyId, fiscalYearId, periodId, end } = setupCompanyAndPeriod()
    const cp = db
      .prepare(
        `INSERT INTO counterparties (company_id, name, type)
         VALUES (?, 'Lev', 'supplier')`,
      )
      .run(companyId)
    db.prepare(
      `INSERT INTO expenses
        (fiscal_year_id, counterparty_id, expense_date, due_date,
         description, status, payment_terms, total_amount_ore, paid_amount_ore)
       VALUES (?, ?, ?, ?, 'Test', 'unpaid', 30, 100000, 0)`,
    ).run(fiscalYearId, cp.lastInsertRowid, '2025-02-15', end)

    const r = getPeriodChecks(db, { period_id: periodId })
    if (!r.success) return
    expect(r.data.supplierPayments.status).toBe('warning')
    expect(r.data.supplierPayments.count).toBeGreaterThanOrEqual(1)
  })

  it('returnerar NOT_FOUND för okänt period_id', () => {
    setupCompanyAndPeriod()
    const r = getPeriodChecks(db, { period_id: 99999 })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('NOT_FOUND')
  })

  it('returnerar VALIDATION_ERROR vid ogiltig input', () => {
    setupCompanyAndPeriod()
    const r = getPeriodChecks(db, { period_id: -1 })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
  })

  // VS-120: has_employees-flagga differentierar 'na' vs 'warning' för
  // salary-checken.
  it('VS-120 salaryBooked = na när has_employees=0 (default solo-bolag)', () => {
    const { periodId } = setupCompanyAndPeriod()
    const r = getPeriodChecks(db, { period_id: periodId })
    if (!r.success) return
    expect(r.data.salaryBooked.status).toBe('na')
  })

  it('VS-120 salaryBooked = warning när has_employees=1 och inga lönerader', () => {
    const { companyId, periodId } = setupCompanyAndPeriod()
    db.prepare('UPDATE companies SET has_employees = 1 WHERE id = ?').run(
      companyId,
    )
    const r = getPeriodChecks(db, { period_id: periodId })
    if (!r.success) return
    expect(r.data.salaryBooked.status).toBe('warning')
    expect(r.data.salaryBooked.detail).toMatch(/anställda/)
  })
})
