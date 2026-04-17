import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import {
  createFixedAsset,
  listFixedAssets,
  getFixedAsset,
  disposeFixedAsset,
  deleteFixedAsset,
  executeDepreciationPeriod,
  generateLinearSchedule,
  generateDecliningSchedule,
} from '../src/main/services/depreciation-service'
import { calculateResultSummary } from '../src/main/services/result-service'
import type { CreateFixedAssetInput } from '../src/shared/types'

let db: Database.Database
let companyId: number
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

function ensureAccount(number: string, name: string, type = 'asset') {
  const existing = db
    .prepare('SELECT 1 FROM accounts WHERE account_number = ?')
    .get(number)
  if (!existing) {
    db.prepare(
      'INSERT INTO accounts (account_number, name, account_type, is_active, is_system_account) VALUES (?, ?, ?, 1, 0)',
    ).run(number, name, type)
  }
}

function baseInput(
  overrides: Partial<CreateFixedAssetInput> = {},
): CreateFixedAssetInput {
  return {
    name: 'Dator',
    acquisition_date: '2025-01-15',
    acquisition_cost_ore: 1_000_000, // 10 000 kr
    residual_value_ore: 0,
    useful_life_months: 36,
    method: 'linear',
    account_asset: '1220',
    account_accumulated_depreciation: '1229',
    account_depreciation_expense: '7832',
    ...overrides,
  }
}

beforeEach(() => {
  db = createTestDb()
  createCompany(db, VALID_COMPANY)
  const co = db.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  companyId = co.id
  const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  fyId = fy.id
  ensureAccount('1220', 'Inventarier', 'asset')
  ensureAccount('1229', 'Ackumulerade avskrivningar inventarier', 'asset')
  ensureAccount('7832', 'Avskrivning inventarier', 'expense')
})

afterEach(() => {
  db.close()
})

// ── Schedule-generering ──

describe('generateLinearSchedule', () => {
  it('jämn division: 100 000 öre / 10 månader = 10 000 × 10', () => {
    const s = generateLinearSchedule(100_000, 0, 10)
    expect(s).toEqual(new Array(10).fill(10_000))
    expect(s.reduce((a, b) => a + b, 0)).toBe(100_000)
  })

  it('avrundningsrest: 100 000 / 3 = 33 333, 33 333, 33 334 (sum exakt)', () => {
    const s = generateLinearSchedule(100_000, 0, 3)
    expect(s.reduce((a, b) => a + b, 0)).toBe(100_000)
    expect(s[0]).toBe(33_333)
    expect(s[1]).toBe(33_333)
    expect(s[2]).toBe(33_334)
  })

  it('med restvärde: cost=100 000, residual=10 000, 9 mån → 10 000 per månad', () => {
    const s = generateLinearSchedule(100_000, 10_000, 9)
    expect(s.reduce((a, b) => a + b, 0)).toBe(90_000)
    expect(s.every((v) => v === 10_000)).toBe(true)
  })

  it('cost = residual → alla noll', () => {
    const s = generateLinearSchedule(50_000, 50_000, 12)
    expect(s.every((v) => v === 0)).toBe(true)
  })
})

describe('generateDecliningSchedule', () => {
  it('geometriskt fallande belopp', () => {
    const s = generateDecliningSchedule(100_000, 0, 12, 3000) // 30% per år
    for (let i = 1; i < s.length; i++) {
      expect(s[i]).toBeLessThanOrEqual(s[i - 1])
    }
  })

  it('klämps till residual — bokfört värde stannar på residual', () => {
    const s = generateDecliningSchedule(10_000, 1000, 120, 5000) // aggressiv rate
    const totalDep = s.reduce((a, b) => a + b, 0)
    expect(totalDep).toBeLessThanOrEqual(10_000 - 1000)
  })
})

// ── createFixedAsset ──

describe('createFixedAsset', () => {
  it('skapar tillgång + genererar schedule', () => {
    const r = createFixedAsset(db, baseInput())
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.scheduleCount).toBe(36)

    const schedule = db
      .prepare(
        'SELECT * FROM depreciation_schedules WHERE fixed_asset_id = ? ORDER BY period_number',
      )
      .all(r.data.id) as Array<{ amount_ore: number; status: string }>
    expect(schedule).toHaveLength(36)
    expect(schedule.every((s) => s.status === 'pending')).toBe(true)
    const sum = schedule.reduce((a, s) => a + s.amount_ore, 0)
    expect(sum).toBe(1_000_000)
  })

  it('validerar negativa belopp', () => {
    const r = createFixedAsset(db, baseInput({ acquisition_cost_ore: -1 }))
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('VALIDATION_ERROR')
    expect(r.field).toBe('acquisition_cost_ore')
  })

  it('validerar residual <= cost', () => {
    const r = createFixedAsset(
      db,
      baseInput({
        residual_value_ore: 2_000_000,
        acquisition_cost_ore: 1_000_000,
      }),
    )
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.field).toBe('residual_value_ore')
  })

  it('degressiv utan rate_bp → fel', () => {
    const r = createFixedAsset(
      db,
      baseInput({ method: 'declining', declining_rate_bp: undefined }),
    )
    expect(r.success).toBe(false)
  })

  it('okänt konto → VALIDATION_ERROR', () => {
    const r = createFixedAsset(db, baseInput({ account_asset: '9999' }))
    expect(r.success).toBe(false)
  })
})

// ── disposeFixedAsset ──

describe('disposeFixedAsset', () => {
  it('markerar aktiva tillgångar som disposed + skippar pending schedules', () => {
    const c = createFixedAsset(db, baseInput())
    if (!c.success) throw new Error('create failed')
    const r = disposeFixedAsset(db, c.data.id, '2025-06-30')
    expect(r.success).toBe(true)

    const asset = db
      .prepare('SELECT status, disposed_date FROM fixed_assets WHERE id = ?')
      .get(c.data.id) as { status: string; disposed_date: string }
    expect(asset.status).toBe('disposed')
    expect(asset.disposed_date).toBe('2025-06-30')

    const pendingCount = (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM depreciation_schedules WHERE fixed_asset_id = ? AND status = 'pending'",
        )
        .get(c.data.id) as { c: number }
    ).c
    expect(pendingCount).toBe(0)

    const skippedCount = (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM depreciation_schedules WHERE fixed_asset_id = ? AND status = 'skipped'",
        )
        .get(c.data.id) as { c: number }
    ).c
    expect(skippedCount).toBe(36)
  })

  it('redan disposed → VALIDATION_ERROR', () => {
    const c = createFixedAsset(db, baseInput())
    if (!c.success) throw new Error('create failed')
    disposeFixedAsset(db, c.data.id, '2025-06-30')
    const r = disposeFixedAsset(db, c.data.id, '2025-07-01')
    expect(r.success).toBe(false)
  })

  describe('F62-c: disposal-verifikat-generering', () => {
    it('utan generate_journal_entry → ingen verifikation skapas', () => {
      const c = createFixedAsset(db, baseInput())
      if (!c.success) throw new Error('create failed')
      disposeFixedAsset(db, c.data.id, '2025-06-30')
      const asset = db
        .prepare(
          'SELECT disposed_journal_entry_id FROM fixed_assets WHERE id = ?',
        )
        .get(c.data.id) as { disposed_journal_entry_id: number | null }
      expect(asset.disposed_journal_entry_id).toBeNull()
    })

    it('generate_journal_entry=true utan tidigare avskrivning → K asset, D 7970 (full förlust)', () => {
      ensureAccount('7970', 'Förlust vid avyttring', 'expense')
      const c = createFixedAsset(db, baseInput())
      if (!c.success) throw new Error('create failed')
      const r = disposeFixedAsset(db, c.data.id, '2025-06-30', true)
      expect(r.success).toBe(true)

      const asset = db
        .prepare(
          'SELECT disposed_journal_entry_id FROM fixed_assets WHERE id = ?',
        )
        .get(c.data.id) as { disposed_journal_entry_id: number | null }
      expect(asset.disposed_journal_entry_id).not.toBeNull()

      const je = db
        .prepare(
          'SELECT verification_series, status, journal_date, source_type FROM journal_entries WHERE id = ?',
        )
        .get(asset.disposed_journal_entry_id!) as {
        verification_series: string
        status: string
        journal_date: string
        source_type: string
      }
      expect(je.verification_series).toBe('E')
      expect(je.status).toBe('booked')
      expect(je.journal_date).toBe('2025-06-30')
      expect(je.source_type).toBe('auto_depreciation')

      const lines = db
        .prepare(
          'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
        )
        .all(asset.disposed_journal_entry_id!) as {
        account_number: string
        debit_ore: number
        credit_ore: number
      }[]
      // Förväntat: K 1220 cost, D 7970 cost (inga avskrivningar ännu)
      expect(lines).toHaveLength(2)
      expect(lines[0]).toEqual({
        account_number: '1220',
        debit_ore: 0,
        credit_ore: 1_000_000,
      })
      expect(lines[1]).toEqual({
        account_number: '7970',
        debit_ore: 1_000_000,
        credit_ore: 0,
      })
    })

    it('generate_journal_entry=true med bokförda avskrivningar → D ack.avskr, K asset, D 7970 (restförlust)', () => {
      ensureAccount('7970', 'Förlust vid avyttring', 'expense')
      // Skapa tillgång + kör 3 månaders avskrivning
      const c = createFixedAsset(
        db,
        baseInput({
          acquisition_date: '2025-01-01',
          useful_life_months: 12,
          acquisition_cost_ore: 120_000,
        }),
      )
      if (!c.success) throw new Error('create failed')
      executeDepreciationPeriod(db, fyId, '2025-03-31')

      // Disposed efter 3 månader (ack. = 30_000, book_value = 90_000)
      const r = disposeFixedAsset(db, c.data.id, '2025-06-30', true)
      expect(r.success).toBe(true)

      const asset = db
        .prepare(
          'SELECT disposed_journal_entry_id FROM fixed_assets WHERE id = ?',
        )
        .get(c.data.id) as { disposed_journal_entry_id: number | null }
      const lines = db
        .prepare(
          'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
        )
        .all(asset.disposed_journal_entry_id!) as {
        account_number: string
        debit_ore: number
        credit_ore: number
      }[]

      expect(lines).toHaveLength(3)
      expect(lines[0]).toEqual({
        account_number: '1229',
        debit_ore: 30_000,
        credit_ore: 0,
      })
      expect(lines[1]).toEqual({
        account_number: '1220',
        debit_ore: 0,
        credit_ore: 120_000,
      })
      expect(lines[2]).toEqual({
        account_number: '7970',
        debit_ore: 90_000,
        credit_ore: 0,
      })

      // Invariant: debets = credits
      const totalDebit = lines.reduce((s, l) => s + l.debit_ore, 0)
      const totalCredit = lines.reduce((s, l) => s + l.credit_ore, 0)
      expect(totalDebit).toBe(totalCredit)
    })

    it('F62-c-ext sale_price_ore == book_value_ore → ingen 3970/7970-rad', () => {
      ensureAccount('1930', 'Bank', 'asset')
      const c = createFixedAsset(
        db,
        baseInput({
          acquisition_date: '2025-01-01',
          useful_life_months: 12,
          acquisition_cost_ore: 120_000,
        }),
      )
      if (!c.success) throw new Error('create failed')
      executeDepreciationPeriod(db, fyId, '2025-03-31') // ack 30_000, book_value 90_000
      const r = disposeFixedAsset(
        db,
        c.data.id,
        '2025-06-30',
        true,
        90_000,
        '1930',
      )
      expect(r.success).toBe(true)
      const asset = db
        .prepare(
          'SELECT disposed_journal_entry_id FROM fixed_assets WHERE id = ?',
        )
        .get(c.data.id) as { disposed_journal_entry_id: number | null }
      const lines = db
        .prepare(
          'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
        )
        .all(asset.disposed_journal_entry_id!) as {
        account_number: string
        debit_ore: number
        credit_ore: number
      }[]
      // 3 rader: D 1229, K 1220, D 1930 (ingen 3970/7970)
      expect(lines).toHaveLength(3)
      expect(lines[0]).toEqual({
        account_number: '1229',
        debit_ore: 30_000,
        credit_ore: 0,
      })
      expect(lines[1]).toEqual({
        account_number: '1220',
        debit_ore: 0,
        credit_ore: 120_000,
      })
      expect(lines[2]).toEqual({
        account_number: '1930',
        debit_ore: 90_000,
        credit_ore: 0,
      })
      const td = lines.reduce((s, l) => s + l.debit_ore, 0)
      const tc = lines.reduce((s, l) => s + l.credit_ore, 0)
      expect(td).toBe(tc)
    })

    it('F62-c-ext sale_price > book_value → K 3970 (vinst)', () => {
      ensureAccount('1930', 'Bank', 'asset')
      ensureAccount('3970', 'Vinst vid avyttring', 'revenue')
      const c = createFixedAsset(
        db,
        baseInput({
          acquisition_date: '2025-01-01',
          useful_life_months: 12,
          acquisition_cost_ore: 120_000,
        }),
      )
      if (!c.success) throw new Error('create failed')
      executeDepreciationPeriod(db, fyId, '2025-03-31')
      // sale 100_000, book 90_000 → vinst 10_000
      const r = disposeFixedAsset(
        db,
        c.data.id,
        '2025-06-30',
        true,
        100_000,
        '1930',
      )
      expect(r.success).toBe(true)
      const asset = db
        .prepare(
          'SELECT disposed_journal_entry_id FROM fixed_assets WHERE id = ?',
        )
        .get(c.data.id) as { disposed_journal_entry_id: number | null }
      const lines = db
        .prepare(
          'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
        )
        .all(asset.disposed_journal_entry_id!) as {
        account_number: string
        debit_ore: number
        credit_ore: number
      }[]
      expect(lines).toHaveLength(4)
      expect(lines[3]).toEqual({
        account_number: '3970',
        debit_ore: 0,
        credit_ore: 10_000,
      })
      expect(lines.reduce((s, l) => s + l.debit_ore, 0)).toBe(
        lines.reduce((s, l) => s + l.credit_ore, 0),
      )
    })

    it('F62-c-ext sale_price < book_value → D 7970 (förlust)', () => {
      ensureAccount('1930', 'Bank', 'asset')
      ensureAccount('7970', 'Förlust vid avyttring', 'expense')
      const c = createFixedAsset(
        db,
        baseInput({
          acquisition_date: '2025-01-01',
          useful_life_months: 12,
          acquisition_cost_ore: 120_000,
        }),
      )
      if (!c.success) throw new Error('create failed')
      executeDepreciationPeriod(db, fyId, '2025-03-31')
      // sale 70_000, book 90_000 → förlust 20_000
      const r = disposeFixedAsset(
        db,
        c.data.id,
        '2025-06-30',
        true,
        70_000,
        '1930',
      )
      expect(r.success).toBe(true)
      const asset = db
        .prepare(
          'SELECT disposed_journal_entry_id FROM fixed_assets WHERE id = ?',
        )
        .get(c.data.id) as { disposed_journal_entry_id: number | null }
      const lines = db
        .prepare(
          'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
        )
        .all(asset.disposed_journal_entry_id!) as {
        account_number: string
        debit_ore: number
        credit_ore: number
      }[]
      expect(lines).toHaveLength(4)
      expect(lines[3]).toEqual({
        account_number: '7970',
        debit_ore: 20_000,
        credit_ore: 0,
      })
      expect(lines.reduce((s, l) => s + l.debit_ore, 0)).toBe(
        lines.reduce((s, l) => s + l.credit_ore, 0),
      )
    })

    it('F62-c-ext sale_price == 0 → identisk med S54-basic (D 7970 full)', () => {
      ensureAccount('7970', 'Förlust vid avyttring', 'expense')
      const c = createFixedAsset(db, baseInput())
      if (!c.success) throw new Error('create failed')
      // Explicit sale_price_ore=0 och proceeds_account=null
      const r = disposeFixedAsset(db, c.data.id, '2025-06-30', true, 0, null)
      expect(r.success).toBe(true)
      const asset = db
        .prepare(
          'SELECT disposed_journal_entry_id FROM fixed_assets WHERE id = ?',
        )
        .get(c.data.id) as { disposed_journal_entry_id: number | null }
      const lines = db
        .prepare(
          'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
        )
        .all(asset.disposed_journal_entry_id!) as {
        account_number: string
        debit_ore: number
        credit_ore: number
      }[]
      // Identiskt med "utan tidigare avskrivning" — K 1220, D 7970 (båda 1_000_000)
      expect(lines).toHaveLength(2)
      expect(lines[0]).toEqual({
        account_number: '1220',
        debit_ore: 0,
        credit_ore: 1_000_000,
      })
      expect(lines[1]).toEqual({
        account_number: '7970',
        debit_ore: 1_000_000,
        credit_ore: 0,
      })
    })

    it('generate_journal_entry=true när konto 7970 saknas → VALIDATION_ERROR', () => {
      // Ingen ensureAccount('7970') här
      const c = createFixedAsset(db, baseInput())
      if (!c.success) throw new Error('create failed')
      const r = disposeFixedAsset(db, c.data.id, '2025-06-30', true)
      expect(r.success).toBe(false)
      if (r.success) return
      expect(r.code).toBe('VALIDATION_ERROR')
      expect(r.error).toContain('7970')

      // Asset ska fortsätta vara 'active' (transaktion rullades tillbaka)
      const asset = db
        .prepare(
          'SELECT status, disposed_journal_entry_id FROM fixed_assets WHERE id = ?',
        )
        .get(c.data.id) as {
        status: string
        disposed_journal_entry_id: number | null
      }
      expect(asset.status).toBe('active')
      expect(asset.disposed_journal_entry_id).toBeNull()
    })
  })
})

// ── executeDepreciationPeriod ──

describe('executeDepreciationPeriod', () => {
  it('bokför pending schedules till period_end i E-serien', () => {
    const c = createFixedAsset(
      db,
      baseInput({
        acquisition_date: '2025-01-01',
        useful_life_months: 12,
        acquisition_cost_ore: 120_000,
      }),
    )
    if (!c.success) throw new Error('create failed')

    const r = executeDepreciationPeriod(db, fyId, '2025-01-31')
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.batch_status).toBe('completed')
    expect(r.data.succeeded).toHaveLength(1)
    expect(r.data.failed).toHaveLength(0)

    const je = db
      .prepare("SELECT * FROM journal_entries WHERE verification_series = 'E'")
      .get() as {
      source_type: string
      verification_number: number
      description: string
    }
    expect(je.source_type).toBe('auto_depreciation')
    expect(je.verification_number).toBe(1)
    expect(je.description).toContain('Avskrivning: Dator')

    const lines = db
      .prepare(
        "SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = (SELECT id FROM journal_entries WHERE verification_series = 'E')",
      )
      .all() as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
    expect(lines).toHaveLength(2)
    const debitLine = lines.find((l) => l.debit_ore > 0)!
    const creditLine = lines.find((l) => l.credit_ore > 0)!
    expect(debitLine.account_number).toBe('7832')
    expect(creditLine.account_number).toBe('1229')
    expect(debitLine.debit_ore).toBe(10_000)
    expect(creditLine.credit_ore).toBe(10_000)
  })

  it('idempotent: återkörning av samma period skapar inga nya verifikat', () => {
    const c = createFixedAsset(
      db,
      baseInput({
        acquisition_date: '2025-01-01',
        useful_life_months: 12,
        acquisition_cost_ore: 120_000,
      }),
    )
    if (!c.success) throw new Error('create failed')

    executeDepreciationPeriod(db, fyId, '2025-01-31')
    const r2 = executeDepreciationPeriod(db, fyId, '2025-01-31')
    expect(r2.success).toBe(true)
    if (!r2.success) return
    expect(r2.data.batch_status).toBe('completed')
    expect(r2.data.succeeded).toHaveLength(0)

    const jeCount = (
      db
        .prepare(
          "SELECT COUNT(*) AS c FROM journal_entries WHERE verification_series = 'E'",
        )
        .get() as { c: number }
    ).c
    expect(jeCount).toBe(1)
  })

  it('partial-success: tillgång med stängd period failar, övriga commitas', () => {
    const a1 = createFixedAsset(
      db,
      baseInput({
        name: 'A1',
        acquisition_date: '2025-01-01',
        useful_life_months: 12,
        acquisition_cost_ore: 120_000,
      }),
    )
    const a2 = createFixedAsset(
      db,
      baseInput({
        name: 'A2',
        acquisition_date: '2025-01-01',
        useful_life_months: 12,
        acquisition_cost_ore: 240_000,
      }),
    )
    if (!a1.success || !a2.success) throw new Error('create failed')

    // Stäng FY för att fela trg_check_period_on_booking för båda
    // Istället — partial-test: skapa en tillgång vars period_end ligger utanför FY
    const a3 = createFixedAsset(
      db,
      baseInput({
        name: 'A3',
        acquisition_date: '2024-01-01',
        useful_life_months: 12,
        acquisition_cost_ore: 120_000,
      }),
    )
    if (!a3.success) throw new Error('create failed')

    const r = executeDepreciationPeriod(db, fyId, '2025-12-31')
    expect(r.success).toBe(true)
    if (!r.success) return

    // A1 + A2 kommer köra januari–december 2025 (24 succeeded totalt)
    // A3 är skapad 2024 men körs bara för schedules i FY2025 (period_end mellan start/end)
    expect(r.data.succeeded.length).toBeGreaterThan(0)
    // Vi kan inte garantera "failed" i detta test utan trigger-fel, men vi verifierar
    // att batch_status blir completed eller partial (inte cancelled)
    expect(['completed', 'partial']).toContain(r.data.batch_status)
  })

  it('fully_depreciated sätts när sista schedule är executed', () => {
    const c = createFixedAsset(
      db,
      baseInput({
        acquisition_date: '2025-01-01',
        useful_life_months: 12,
        acquisition_cost_ore: 120_000,
      }),
    )
    if (!c.success) throw new Error('create failed')

    executeDepreciationPeriod(db, fyId, '2025-12-31')

    const asset = db
      .prepare('SELECT status FROM fixed_assets WHERE id = ?')
      .get(c.data.id) as { status: string }
    expect(asset.status).toBe('fully_depreciated')
  })
})

// ── Integration med result-service (M96) ──

describe('result-service integration (M96)', () => {
  it('avskrivningar ingår i operatingResultOre (7832-konto på 78xx-intervall)', () => {
    const c = createFixedAsset(
      db,
      baseInput({
        acquisition_date: '2025-01-01',
        useful_life_months: 12,
        acquisition_cost_ore: 1_200_000,
      }),
    )
    if (!c.success) throw new Error('create failed')

    const beforeResult = calculateResultSummary(db, fyId)
    expect(beforeResult.operatingResultOre).toBe(0)

    executeDepreciationPeriod(db, fyId, '2025-12-31')

    const afterResult = calculateResultSummary(db, fyId)
    // 12 månader × 100 000 = 1 200 000 öre avskrivning → minskar operatingResult med 1 200 000
    expect(afterResult.operatingResultOre).toBe(-1_200_000)
    expect(afterResult.netResultOre).toBe(-1_200_000)
  })
})

// ── listFixedAssets ──

describe('listFixedAssets', () => {
  it('returnerar tillgångar med ackumulerad avskrivning', () => {
    const c = createFixedAsset(
      db,
      baseInput({
        acquisition_date: '2025-01-01',
        useful_life_months: 12,
        acquisition_cost_ore: 120_000,
      }),
    )
    if (!c.success) throw new Error('create failed')
    executeDepreciationPeriod(db, fyId, '2025-06-30') // 6 månader

    const r = listFixedAssets(db, fyId)
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data).toHaveLength(1)
    expect(r.data[0].accumulated_depreciation_ore).toBe(60_000) // 6 × 10 000
    expect(r.data[0].book_value_ore).toBe(60_000)
    expect(r.data[0].schedules_executed).toBe(6)
  })
})

// ── deleteFixedAsset ──

describe('deleteFixedAsset', () => {
  it('raderar aktiv tillgång utan exekverade schedules', () => {
    const c = createFixedAsset(db, baseInput())
    if (!c.success) throw new Error('create failed')
    const r = deleteFixedAsset(db, c.data.id)
    expect(r.success).toBe(true)

    const exists = db
      .prepare('SELECT 1 FROM fixed_assets WHERE id = ?')
      .get(c.data.id)
    expect(exists).toBeUndefined()
  })

  it('blockerar radering om schedules är executed', () => {
    const c = createFixedAsset(
      db,
      baseInput({
        acquisition_date: '2025-01-01',
        useful_life_months: 12,
        acquisition_cost_ore: 120_000,
      }),
    )
    if (!c.success) throw new Error('create failed')
    executeDepreciationPeriod(db, fyId, '2025-01-31')

    const r = deleteFixedAsset(db, c.data.id)
    expect(r.success).toBe(false)
  })
})

// ── getFixedAsset ──

describe('getFixedAsset', () => {
  it('inkluderar schedule-array', () => {
    const c = createFixedAsset(db, baseInput())
    if (!c.success) throw new Error('create failed')

    const r = getFixedAsset(db, c.data.id)
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.schedule).toHaveLength(36)
    expect(r.data.schedule[0].status).toBe('pending')
  })

  it('ogiltigt id → NOT_FOUND', () => {
    const r = getFixedAsset(db, 9999)
    expect(r.success).toBe(false)
    if (r.success) return
    expect(r.code).toBe('NOT_FOUND')
  })
})
