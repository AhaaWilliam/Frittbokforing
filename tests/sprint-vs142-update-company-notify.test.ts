/**
 * Sprint VS-142 — updateCompany accepterar notify_vat_deadline-fältet.
 *
 * Paritet med VS-121-mönstret. Säkerställer att Zod-schema, service-
 * lagrets ALLOWED_UPDATE_FIELDS och DB-CHECK accepterar/avvisar värden.
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
  getCompany,
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

describe('VS-142 updateCompany — notify_vat_deadline', () => {
  it('default-värdet är 0', () => {
    setup()
    const c = getCompany(db)
    expect(c).not.toBeNull()
    expect(c!.notify_vat_deadline).toBe(0)
  })

  it('uppdaterar till 1 (opt-in)', () => {
    setup()
    const r = updateCompany(db, { notify_vat_deadline: 1 })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.notify_vat_deadline).toBe(1)
  })

  it('uppdaterar tillbaka till 0 (opt-out)', () => {
    setup()
    updateCompany(db, { notify_vat_deadline: 1 })
    const r = updateCompany(db, { notify_vat_deadline: 0 })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.notify_vat_deadline).toBe(0)
  })

  it('avvisar värde utanför 0/1', () => {
    setup()
    const r = updateCompany(db, { notify_vat_deadline: 2 })
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
  })

  it('uppdaterar samtidigt med vat_frequency', () => {
    setup()
    const r = updateCompany(db, {
      notify_vat_deadline: 1,
      vat_frequency: 'monthly',
    })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.notify_vat_deadline).toBe(1)
    expect(r.data.vat_frequency).toBe('monthly')
  })
})
