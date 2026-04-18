import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import {
  createFixedAsset,
  updateFixedAsset,
  getFixedAsset,
  executeDepreciationPeriod,
} from '../src/main/services/depreciation-service'
import type { CreateFixedAssetInput } from '../src/shared/types'

let db: Database.Database
let fyId: number

const VALID_COMPANY = {
  name: 'Test AB',
  org_number: '556036-0793',
  fiscal_rule: 'K2' as const,
  share_capital: 2_500_000,
  registration_date: '2025-01-15',
  fiscal_year_start: '2025-01-01',
  fiscal_year_end: '2025-12-31',
}

function ensureAccount(
  number: string,
  name: string,
  type = 'asset',
  active = 1,
) {
  const existing = db
    .prepare('SELECT 1 FROM accounts WHERE account_number = ?')
    .get(number)
  if (!existing) {
    db.prepare(
      'INSERT INTO accounts (account_number, name, account_type, is_active, is_system_account) VALUES (?, ?, ?, ?, 0)',
    ).run(number, name, type, active)
  }
}

function baseInput(
  overrides: Partial<CreateFixedAssetInput> = {},
): CreateFixedAssetInput {
  return {
    name: 'Dator',
    acquisition_date: '2025-01-15',
    acquisition_cost_ore: 1_000_000,
    residual_value_ore: 0,
    useful_life_months: 36,
    method: 'linear',
    account_asset: '1220',
    account_accumulated_depreciation: '1229',
    account_depreciation_expense: '7832',
    ...overrides,
  }
}

function createPristine(
  overrides: Partial<CreateFixedAssetInput> = {},
): number {
  const r = createFixedAsset(db, baseInput(overrides))
  if (!r.success) throw new Error('create failed: ' + r.error)
  return r.data.id
}

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  fyId = fy.id
  ensureAccount('1220', 'Inventarier', 'asset')
  ensureAccount('1229', 'Ackumulerade avskrivningar', 'asset')
  ensureAccount('7832', 'Avskrivning inventarier', 'expense')
})

afterEach(() => {
  db.close()
})

describe('updateFixedAsset', () => {
  it('happy path: ändra name + cost → schedule regenereras', () => {
    const id = createPristine()
    const r = updateFixedAsset(
      db,
      id,
      baseInput({ name: 'MacBook', acquisition_cost_ore: 2_000_000 }),
    )
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.scheduleCount).toBe(36)

    const asset = getFixedAsset(db, id)
    expect(asset.success).toBe(true)
    if (!asset.success) return
    expect(asset.data.name).toBe('MacBook')
    expect(asset.data.acquisition_cost_ore).toBe(2_000_000)
    expect(asset.data.schedule.reduce((s, l) => s + l.amount_ore, 0)).toBe(
      2_000_000,
    )
  })

  it('ändrar useful_life_months 36 → 24 → ny schedule har 24 rader', () => {
    const id = createPristine()
    const r = updateFixedAsset(db, id, baseInput({ useful_life_months: 24 }))
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.scheduleCount).toBe(24)
  })

  it('residual_value > cost → VALIDATION_ERROR', () => {
    const id = createPristine()
    const r = updateFixedAsset(
      db,
      id,
      baseInput({ residual_value_ore: 2_000_000 }),
    )
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
  })

  it('NOT_FOUND om id inte existerar', () => {
    const r = updateFixedAsset(db, 99999, baseInput())
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('NOT_FOUND')
  })

  it('M155 Alt A: edit efter executed bevarar historik + regenererar pending', () => {
    const id = createPristine()
    const exec = executeDepreciationPeriod(db, fyId, '2025-02-28')
    expect(exec.success).toBe(true)
    if (!exec.success) return
    expect(exec.data.succeeded.length).toBeGreaterThan(0)

    const executedBefore = db
      .prepare(
        `SELECT period_number, amount_ore FROM depreciation_schedules
         WHERE fixed_asset_id = ? AND status = 'executed' ORDER BY period_number`,
      )
      .all(id) as Array<{ period_number: number; amount_ore: number }>
    const executedCount = executedBefore.length
    expect(executedCount).toBeGreaterThan(0)

    const r = updateFixedAsset(
      db,
      id,
      baseInput({ name: 'Ändrad', useful_life_months: 48 }),
    )
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.scheduleCount).toBe(48)

    // Executed-rader oförändrade
    const executedAfter = db
      .prepare(
        `SELECT period_number, amount_ore FROM depreciation_schedules
         WHERE fixed_asset_id = ? AND status = 'executed' ORDER BY period_number`,
      )
      .all(id) as Array<{ period_number: number; amount_ore: number }>
    expect(executedAfter).toEqual(executedBefore)

    // Pending: (48 - executedCount) rader
    const pending = db
      .prepare(
        `SELECT COUNT(*) as n FROM depreciation_schedules
         WHERE fixed_asset_id = ? AND status = 'pending'`,
      )
      .get(id) as { n: number }
    expect(pending.n).toBe(48 - executedCount)

    // Total schedule-length = 48
    const all = db
      .prepare(
        `SELECT COUNT(*) as n FROM depreciation_schedules
         WHERE fixed_asset_id = ?`,
      )
      .get(id) as { n: number }
    expect(all.n).toBe(48)
  })

  it('M155 Alt A: VALIDATION_ERROR om ny useful_life <= executedCount', () => {
    const id = createPristine()
    const exec = executeDepreciationPeriod(db, fyId, '2025-02-28')
    expect(exec.success).toBe(true)
    if (!exec.success) return

    const r = updateFixedAsset(db, id, baseInput({ useful_life_months: 1 }))
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
    expect(r.error).toMatch(/Ny nyttjandetid/)
  })

  it('M155 Alt A: VALIDATION_ERROR om nytt residual > bookValueAfterExecuted', () => {
    const id = createPristine()
    const exec = executeDepreciationPeriod(db, fyId, '2025-02-28')
    expect(exec.success).toBe(true)
    if (!exec.success) return

    // Exec-period-1: cost 1_000_000 / 36 ≈ 27_778 öre.
    // Book value after executed ≈ 1_000_000 - 27_778 = 972_222.
    // Sätt nytt residual = 990_000 → överstiger book value.
    const r = updateFixedAsset(
      db,
      id,
      baseInput({ residual_value_ore: 990_000 }),
    )
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
    expect(r.error).toMatch(/restvärde/i)
  })

  it('M155 Alt A: remaining-fördelning summerar till new_cost - new_residual - executed_acc', () => {
    const id = createPristine()
    const exec = executeDepreciationPeriod(db, fyId, '2025-02-28')
    expect(exec.success).toBe(true)
    if (!exec.success) return

    const executedAccOre = (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount_ore), 0) as acc FROM depreciation_schedules
           WHERE fixed_asset_id = ? AND status = 'executed'`,
        )
        .get(id) as { acc: number }
    ).acc

    // Edit: nytt cost 2_000_000, residual 200_000, useful_life 24
    const r = updateFixedAsset(
      db,
      id,
      baseInput({
        acquisition_cost_ore: 2_000_000,
        residual_value_ore: 200_000,
        useful_life_months: 24,
      }),
    )
    expect(r.success).toBe(true)

    const pendingSum = (
      db
        .prepare(
          `SELECT COALESCE(SUM(amount_ore), 0) as sum FROM depreciation_schedules
           WHERE fixed_asset_id = ? AND status = 'pending'`,
        )
        .get(id) as { sum: number }
    ).sum

    // Pending ska fördela (2_000_000 - 200_000 - executedAccOre) över 23 perioder
    const expected = 2_000_000 - 200_000 - executedAccOre
    expect(pendingSum).toBe(expected)
  })

  it('VALIDATION_ERROR om asset.status = disposed', () => {
    const id = createPristine()
    db.prepare(`UPDATE fixed_assets SET status = 'disposed' WHERE id = ?`).run(
      id,
    )
    const r = updateFixedAsset(db, id, baseInput({ name: 'x' }))
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
    expect(r.error).toMatch(/aktiva/)
  })

  it('method linear → declining → ny schedule respekterar rate_bp', () => {
    const id = createPristine()
    const r = updateFixedAsset(
      db,
      id,
      baseInput({ method: 'declining', declining_rate_bp: 3000 }),
    )
    expect(r.success).toBe(true)
    const asset = getFixedAsset(db, id)
    if (!asset.success) return
    expect(asset.data.method).toBe('declining')
    expect(asset.data.declining_rate_bp).toBe(3000)
  })

  it('saknat declining_rate_bp med method=declining → VALIDATION_ERROR', () => {
    const id = createPristine()
    const r = updateFixedAsset(db, id, baseInput({ method: 'declining' }))
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
  })

  it('okänt konto — ändrat → ACCOUNT_NOT_FOUND', () => {
    const id = createPristine()
    const r = updateFixedAsset(db, id, baseInput({ account_asset: '9999' }))
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('ACCOUNT_NOT_FOUND')
  })

  it('inaktivt konto — oförändrat → SUCCESS', () => {
    const id = createPristine()
    // Deactivate the asset account after create
    db.prepare(
      `UPDATE accounts SET is_active = 0 WHERE account_number = '1220'`,
    ).run()
    const r = updateFixedAsset(db, id, baseInput({ name: 'Ändrad' }))
    expect(r.success).toBe(true)
  })

  it('inaktivt konto — ändrat → INACTIVE_ACCOUNT', () => {
    const id = createPristine()
    ensureAccount('1221', 'Annan asset', 'asset', 0)
    const r = updateFixedAsset(db, id, baseInput({ account_asset: '1221' }))
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('INACTIVE_ACCOUNT')
  })

  it('update preserverar asset.id', () => {
    const id = createPristine()
    updateFixedAsset(db, id, baseInput({ name: 'Ny' }))
    const row = db
      .prepare('SELECT id FROM fixed_assets WHERE id = ?')
      .get(id) as { id: number } | undefined
    expect(row?.id).toBe(id)
  })

  it('UPDATE rör inte created_at, uppdaterar updated_at', () => {
    const id = createPristine()
    const before = db
      .prepare('SELECT created_at, updated_at FROM fixed_assets WHERE id = ?')
      .get(id) as { created_at: string; updated_at: string }
    // Simulate clock tick by forcing updated_at slightly earlier
    db.prepare(
      `UPDATE fixed_assets SET updated_at = '2020-01-01' WHERE id = ?`,
    ).run(id)
    updateFixedAsset(db, id, baseInput({ name: 'Senare' }))
    const after = db
      .prepare('SELECT created_at, updated_at FROM fixed_assets WHERE id = ?')
      .get(id) as { created_at: string; updated_at: string }
    expect(after.created_at).toBe(before.created_at)
    expect(after.updated_at).not.toBe('2020-01-01')
  })

  it('M155 Alt A: skipped-perioder räknas som låsta och bevaras', () => {
    const id = createPristine()
    db.prepare(
      `UPDATE depreciation_schedules SET status = 'skipped' WHERE fixed_asset_id = ? AND period_number = 1`,
    ).run(id)
    const r = updateFixedAsset(db, id, baseInput({ name: 'x' }))
    expect(r.success).toBe(true)
    if (!r.success) return

    // Skipped kvar
    const skipped = db
      .prepare(
        `SELECT period_number FROM depreciation_schedules
         WHERE fixed_asset_id = ? AND status = 'skipped'`,
      )
      .all(id) as Array<{ period_number: number }>
    expect(skipped).toEqual([{ period_number: 1 }])
  })
})
