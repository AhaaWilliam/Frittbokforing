/**
 * Sprint VS-121 — updateCompany accepterar vat_frequency + has_employees.
 *
 * Verifierar att de nya fälten kan uppdateras via service-lagret. UI-testet
 * (PageSettings) görs separat — denna fil säkerställer att service-kontraktet
 * och Zod-validering släpper igenom korrekta värden och avvisar ogiltiga.
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import {
  createCompany,
  updateCompany,
} from '../src/main/services/company-service'

let db: Database.Database

function setup(): number {
  const r = createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  if (!r.success) throw new Error(r.error)
  return r.data.id
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

describe('VS-121 updateCompany — vat_frequency + has_employees', () => {
  it('uppdaterar vat_frequency monthly', () => {
    setup()
    const r = updateCompany(db, { vat_frequency: 'monthly' })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.vat_frequency).toBe('monthly')
  })

  it('uppdaterar vat_frequency yearly', () => {
    setup()
    const r = updateCompany(db, { vat_frequency: 'yearly' })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.vat_frequency).toBe('yearly')
  })

  it('avvisar ogiltigt vat_frequency-värde', () => {
    setup()
    const r = updateCompany(db, {
      vat_frequency: 'biennial' as 'monthly',
    })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
  })

  it('uppdaterar has_employees=1', () => {
    setup()
    const r = updateCompany(db, { has_employees: 1 })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.has_employees).toBe(1)
  })

  it('avvisar has_employees utanför 0/1', () => {
    setup()
    const r = updateCompany(db, { has_employees: 2 })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
  })

  it('uppdaterar både vat_frequency och has_employees i samma anrop', () => {
    setup()
    const r = updateCompany(db, {
      vat_frequency: 'monthly',
      has_employees: 1,
    })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.vat_frequency).toBe('monthly')
    expect(r.data.has_employees).toBe(1)
  })
})
