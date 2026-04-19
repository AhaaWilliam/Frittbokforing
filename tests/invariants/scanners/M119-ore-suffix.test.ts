import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../helpers/create-test-db'

/**
 * M119 — Ore-suffix obligatoriskt.
 *
 * Alla INTEGER-kolumner i SQLite som representerar pengar i ore ska ha
 * `_ore`-suffix. Inga undantag. Historiskt: Sprint 15 F1 fixade 8 befintliga
 * kolumner. Denna scanner säkerställer ingen regression.
 *
 * Strategi: skanna schemat efter kolumn-namn som ser ut som belopp
 * (amount, price, fee, balance, cost, value, total, sum, net, vat,
 * gross, paid, residual) och verifiera att de antingen:
 * 1. Slutar på `_ore`, ELLER
 * 2. Är i en känd whitelist av icke-monetära kolumner (t.ex. `quantity`,
 *    `account_number`, `invoice_number`).
 */

// Kolumnnamn som ser monetära ut men INTE är belopp
const NON_MONETARY_MONEY_LIKE = new Set<string>([
  // Nummer/identifierare
  'account_number',
  'invoice_number',
  'verification_number',
  'ocr_number',
  'org_number',
  'supplier_invoice_number',
  'bank_transaction_number',
  'kontonummer', // sv
  // Kvantitet (inte belopp)
  'quantity',
  'useful_life_months',
  // Procent/rate
  'rate_percent',
  'interest_rate',
  'vat_rate_percent',
  // Sort-order
  'sort_order',
  'line_number',
  'period_number',
])

// Token som indikerar monetärt innehåll
const MONEY_TOKENS = [
  'amount',
  'price',
  'fee',
  'cost',
  'total',
  'balance',
  'net',
  'gross',
  'paid',
  'residual',
  'vat',
  'rounding',
  'salary',
  'wage',
]

function looksLikeMoney(columnName: string, type: string): boolean {
  const lower = columnName.toLowerCase()
  if (NON_MONETARY_MONEY_LIKE.has(lower)) return false
  // TEXT-kolumner är aldrig belopp (belopp lagras som INTEGER öre)
  if (type.toUpperCase() !== 'INTEGER') return false
  // Referenser och metadata
  if (lower.includes('_rate') && !lower.includes('_rate_ore')) return false
  if (lower.endsWith('_id') || lower.endsWith('_code')) return false
  if (lower.endsWith('_type') || lower.endsWith('_status')) return false
  if (lower.endsWith('_account') || lower.endsWith('_number')) return false
  return MONEY_TOKENS.some((t) => lower.includes(t))
}

describe('M119 — _ore-suffix scanner', () => {
  it('alla pengar-liknande INTEGER-kolumner slutar på _ore', () => {
    const db = createTestDb()
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'`,
      )
      .all() as { name: string }[]

    const violations: string[] = []

    for (const { name: table } of tables) {
      const cols = db.pragma(`table_info(${table})`) as Array<{
        name: string
        type: string
      }>
      for (const col of cols) {
        if (!looksLikeMoney(col.name, col.type)) continue
        if (!/_ore(_|$)/.test(col.name)) {
          violations.push(
            `${table}.${col.name} (${col.type}) saknar _ore-suffix`,
          )
        }
      }
    }

    if (violations.length > 0) {
      throw new Error(
        `M119-regression:\n${violations.map((v) => '  ' + v).join('\n')}`,
      )
    }
    expect(violations).toEqual([])
  })

  it('alla _ore-kolumner är INTEGER', () => {
    const db = createTestDb()
    const tables = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '%_fts%'`,
      )
      .all() as { name: string }[]

    const violations: string[] = []

    for (const { name: table } of tables) {
      const cols = db.pragma(`table_info(${table})`) as Array<{
        name: string
        type: string
      }>
      for (const col of cols) {
        if (!/_ore(_|$)/.test(col.name)) continue
        if (col.type !== 'INTEGER') {
          violations.push(`${table}.${col.name} — förväntad INTEGER, är ${col.type}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
