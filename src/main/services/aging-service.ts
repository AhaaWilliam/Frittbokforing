import type Database from 'better-sqlite3'
import { todayLocalFromNow } from '../utils/now'

export interface AgingItem {
  id: number
  identifier: string
  counterpartyName: string
  totalAmountOre: number
  paidAmountOre: number
  remainingOre: number
  dueDate: string
  daysOverdue: number
}

export interface AgingBucket {
  label: string
  items: AgingItem[]
  totalRemainingOre: number
}

export interface AgingReport {
  buckets: AgingBucket[]
  totalRemainingOre: number
  asOfDate: string
  /** Expenses without due_date (excluded from buckets) */
  itemsWithoutDueDate?: AgingItem[]
}

const BUCKET_DEFS = [
  { label: 'Ej förfallet', min: -Infinity, max: 0 },
  { label: '1–30 dagar', min: 1, max: 30 },
  { label: '31–60 dagar', min: 31, max: 60 },
  { label: '61–90 dagar', min: 61, max: 90 },
  { label: '90+ dagar', min: 91, max: Infinity },
] as const

interface RawRow {
  id: number
  identifier: string
  counterparty_name: string
  total_amount_ore: number
  paid_amount_ore: number
  remaining_ore: number
  due_date: string
  days_overdue: number
}

interface NoDueDateRow {
  id: number
  identifier: string
  counterparty_name: string
  total_amount_ore: number
  paid_amount_ore: number
  remaining_ore: number
}

function bucketize(rows: RawRow[]): AgingBucket[] {
  const buckets: AgingBucket[] = BUCKET_DEFS.map((def) => ({
    label: def.label,
    items: [],
    totalRemainingOre: 0,
  }))

  for (const row of rows) {
    const item: AgingItem = {
      id: row.id,
      identifier: row.identifier,
      counterpartyName: row.counterparty_name,
      totalAmountOre: row.total_amount_ore,
      paidAmountOre: row.paid_amount_ore,
      remainingOre: row.remaining_ore,
      dueDate: row.due_date,
      daysOverdue: row.days_overdue,
    }

    for (let i = 0; i < BUCKET_DEFS.length; i++) {
      const def = BUCKET_DEFS[i]
      if (row.days_overdue >= def.min && row.days_overdue <= def.max) {
        buckets[i].items.push(item)
        buckets[i].totalRemainingOre += row.remaining_ore
        break
      }
    }
  }

  return buckets
}

export function getAgingReceivables(
  db: Database.Database,
  fiscalYearId: number,
  asOfDate?: string,
): AgingReport {
  const date = asOfDate ?? todayLocalFromNow()

  const rows = db
    .prepare(
      `SELECT
        i.id,
        i.invoice_number AS identifier,
        cp.name AS counterparty_name,
        i.total_amount_ore,
        i.paid_amount_ore,
        (i.total_amount_ore - i.paid_amount_ore) AS remaining_ore,
        i.due_date,
        CAST(julianday(:asOfDate) - julianday(i.due_date) AS INTEGER) AS days_overdue
      FROM invoices i
      JOIN counterparties cp ON cp.id = i.counterparty_id
      WHERE i.fiscal_year_id = :fiscalYearId
        AND i.status IN ('unpaid', 'partial', 'overdue')
        AND i.invoice_type != 'credit_note'
      ORDER BY i.due_date ASC`,
    )
    .all({ asOfDate: date, fiscalYearId }) as RawRow[]

  const buckets = bucketize(rows)
  const totalRemainingOre = buckets.reduce(
    (sum, b) => sum + b.totalRemainingOre,
    0,
  )

  return { buckets, totalRemainingOre, asOfDate: date }
}

export function getAgingPayables(
  db: Database.Database,
  fiscalYearId: number,
  asOfDate?: string,
): AgingReport {
  const date = asOfDate ?? todayLocalFromNow()

  // Expenses WITH due_date → bucketized
  const rows = db
    .prepare(
      `SELECT
        e.id,
        COALESCE(e.supplier_invoice_number, '#' || e.id) AS identifier,
        cp.name AS counterparty_name,
        e.total_amount_ore,
        e.paid_amount_ore,
        (e.total_amount_ore - e.paid_amount_ore) AS remaining_ore,
        e.due_date,
        CAST(julianday(:asOfDate) - julianday(e.due_date) AS INTEGER) AS days_overdue
      FROM expenses e
      JOIN counterparties cp ON cp.id = e.counterparty_id
      WHERE e.fiscal_year_id = :fiscalYearId
        AND e.status IN ('unpaid', 'partial', 'overdue')
        AND e.due_date IS NOT NULL
      ORDER BY e.due_date ASC`,
    )
    .all({ asOfDate: date, fiscalYearId }) as RawRow[]

  // Expenses WITHOUT due_date → separate group
  const noDueDateRows = db
    .prepare(
      `SELECT
        e.id,
        COALESCE(e.supplier_invoice_number, '#' || e.id) AS identifier,
        cp.name AS counterparty_name,
        e.total_amount_ore,
        e.paid_amount_ore,
        (e.total_amount_ore - e.paid_amount_ore) AS remaining_ore
      FROM expenses e
      JOIN counterparties cp ON cp.id = e.counterparty_id
      WHERE e.fiscal_year_id = :fiscalYearId
        AND e.status IN ('unpaid', 'partial', 'overdue')
        AND e.due_date IS NULL
      ORDER BY e.id ASC`,
    )
    .all({ fiscalYearId }) as NoDueDateRow[]

  const buckets = bucketize(rows)
  const totalRemainingOre = buckets.reduce(
    (sum, b) => sum + b.totalRemainingOre,
    0,
  )

  const itemsWithoutDueDate: AgingItem[] = noDueDateRows.map((r) => ({
    id: r.id,
    identifier: r.identifier,
    counterpartyName: r.counterparty_name,
    totalAmountOre: r.total_amount_ore,
    paidAmountOre: r.paid_amount_ore,
    remainingOre: r.remaining_ore,
    dueDate: '',
    daysOverdue: 0,
  }))

  return {
    buckets,
    totalRemainingOre,
    asOfDate: date,
    ...(itemsWithoutDueDate.length > 0 ? { itemsWithoutDueDate } : {}),
  }
}
