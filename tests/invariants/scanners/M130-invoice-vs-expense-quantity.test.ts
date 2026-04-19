import { describe, it, expect } from 'vitest'
import { createTestDb } from '../../helpers/create-test-db'

/**
 * M130 — invoice quantity REAL, expense quantity INTEGER.
 * Avsiktlig divergens. Fakturor kan ha fraktionell qty (konsulttimmar),
 * kostnader har styckantal (heltal).
 */

describe('M130 — invoice vs expense quantity-typer', () => {
  it('invoice_lines.quantity är REAL', () => {
    const db = createTestDb()
    const cols = db.pragma('table_info(invoice_lines)') as Array<{
      name: string
      type: string
    }>
    const qty = cols.find((c) => c.name === 'quantity')
    expect(qty).toBeDefined()
    expect(qty?.type).toBe('REAL')
  })

  it('expense_lines.quantity är INTEGER', () => {
    const db = createTestDb()
    const cols = db.pragma('table_info(expense_lines)') as Array<{
      name: string
      type: string
    }>
    const qty = cols.find((c) => c.name === 'quantity')
    expect(qty).toBeDefined()
    expect(qty?.type).toBe('INTEGER')
  })
})
