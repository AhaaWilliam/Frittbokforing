import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createTestDb } from '../helpers/create-test-db'
import { migrations } from '../../src/main/migrations'
import { registerCustomFunctions } from '../../src/main/db-functions'
import { createCompany } from '../../src/main/services/company-service'
import { createCounterparty } from '../../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
} from '../../src/main/services/invoice-service'

/**
 * TT-5 — Migration snapshot-roundtrip (pragmatisk subset).
 *
 * Fullständig matris (44 PRAGMA-snapshots per version) kräver Electron-
 * IPC för historisk seeding (M115) och ligger kvar i backlog. Denna
 * delivery täcker en mer pragmatisk invariant:
 *
 * 1. Seeda full-schema-DB med service-funktioner
 * 2. Skriv DB till disk (.stryker-tmp/... via fs)
 * 3. Öppna igen och verifiera:
 *    - PRAGMA integrity_check = 'ok'
 *    - FK-integrity
 *    - user_version = slut-migration
 *    - Alla verifikationer balanserar (SUM(debit)=SUM(credit))
 *    - paid_amount_ore = SUM(invoice_payments.amount_ore)
 * 4. Re-run migrations mot redan-migrerad DB → ingen ändring
 *
 * Detta fångar regressioner där migration-kedjan eller data-layout
 * muteras i efterhand.
 */

function ok<T>(
  r:
    | { success: true; data: T }
    | { success: false; error: string; code?: string },
): T {
  if (!r.success) throw new Error(`${r.code}: ${r.error}`)
  return r.data
}

function seedRepresentativeData(db: Database.Database): {
  companyId: number
  fyId: number
} {
  ok(
    createCompany(db, {
      name: 'Snapshot AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    }),
  )
  const companyId = (
    db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
  ).id
  const fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id

  const cp = ok(
    createCounterparty(db, {
      company_id: companyId,
      name: 'Kund AB',
      type: 'customer',
    }),
  )

  // Skapa 3 fakturor i olika status (draft, unpaid, partial)
  const invs: number[] = []
  for (let i = 0; i < 3; i++) {
    const inv = ok(
      saveDraft(db, {
        fiscal_year_id: fyId,
        counterparty_id: cp.id,
        invoice_date: '2026-02-01',
        due_date: '2026-03-03',
        lines: [
          {
            product_id: null,
            description: `Rad ${i + 1}`,
            quantity: 1,
            unit_price_ore: 100000 * (i + 1),
            vat_code_id: 5, // MF0
            sort_order: 0,
            account_number: '3001',
          },
        ],
      }),
    )
    invs.push(inv.id)
  }

  // Finalize första 2, betala andra
  ok(finalizeDraft(db, invs[0]))
  ok(finalizeDraft(db, invs[1]))
  ok(
    payInvoice(db, {
      invoice_id: invs[1],
      amount_ore: 50000, // partial
      payment_date: '2026-02-15',
      payment_method: 'bank',
      account_number: '1930',
    }),
  )

  return { companyId, fyId }
}

function assertIntegrity(db: Database.Database): void {
  // PRAGMA integrity_check
  const integrity = db.pragma('integrity_check') as Array<{
    integrity_check: string
  }>
  expect(integrity[0].integrity_check).toBe('ok')

  // FK-integrity
  const fk = db.pragma('foreign_key_check') as unknown[]
  expect(fk).toEqual([])

  // user_version = slut-migration
  const uv = (db.pragma('user_version') as Array<{ user_version: number }>)[0]
    .user_version
  expect(uv).toBe(migrations.length)

  // Alla booked entries balanserar
  const unbal = db
    .prepare(
      `SELECT je.id, SUM(jel.debit_ore) AS d, SUM(jel.credit_ore) AS c
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
       WHERE je.status = 'booked'
       GROUP BY je.id
       HAVING SUM(jel.debit_ore) != SUM(jel.credit_ore)`,
    )
    .all()
  expect(unbal).toEqual([])

  // paid_amount_ore speglar SUM(payments) (M101)
  const drift = db
    .prepare(
      `SELECT i.id, i.paid_amount_ore AS col, COALESCE(SUM(ip.amount_ore),0) AS sum
       FROM invoices i
       LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
       GROUP BY i.id
       HAVING i.paid_amount_ore != COALESCE(SUM(ip.amount_ore),0)`,
    )
    .all()
  expect(drift).toEqual([])
}

function applyMigrations(db: Database.Database): void {
  const FK_OFF = new Set([21, 22, 37, 42, 43, 44, 46])
  for (let i = 0; i < migrations.length; i++) {
    const cur = (
      db.pragma('user_version') as Array<{ user_version: number }>
    )[0].user_version
    if (cur >= i + 1) continue // redan applicerad
    const m = migrations[i]
    if (FK_OFF.has(i)) db.pragma('foreign_keys = OFF')
    db.exec('BEGIN EXCLUSIVE')
    db.exec(m.sql)
    if (m.programmatic) m.programmatic(db)
    db.pragma(`user_version = ${i + 1}`)
    db.exec('COMMIT')
    if (FK_OFF.has(i)) db.pragma('foreign_keys = ON')
  }
}

describe('Migration snapshot-roundtrip', () => {
  it('seed producerar förväntad struktur', () => {
    const db = createTestDb()
    seedRepresentativeData(db)
    const counts = {
      companies: (
        db.prepare('SELECT COUNT(*) c FROM companies').get() as { c: number }
      ).c,
      invoices: (
        db.prepare('SELECT COUNT(*) c FROM invoices').get() as { c: number }
      ).c,
      entries: (
        db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as {
          c: number
        }
      ).c,
      payments: (
        db.prepare('SELECT COUNT(*) c FROM invoice_payments').get() as {
          c: number
        }
      ).c,
    }
    expect(counts.companies).toBe(1)
    expect(counts.invoices).toBe(3)
    expect(counts.entries).toBeGreaterThanOrEqual(3)
    expect(counts.payments).toBe(1)
    assertIntegrity(db)
    db.close()
  })

  it('re-applicera migrations på färdig-migrerad DB är no-op', () => {
    const db = createTestDb()
    seedRepresentativeData(db)

    const beforeSchema = db
      .prepare(
        `SELECT name, sql FROM sqlite_master WHERE type IN ('table','trigger','index') ORDER BY name`,
      )
      .all()
    const beforeCounts = {
      inv: (
        db.prepare('SELECT COUNT(*) c FROM invoices').get() as { c: number }
      ).c,
      je: (
        db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as {
          c: number
        }
      ).c,
    }

    // Re-apply migrations — ska vara idempotent
    applyMigrations(db)

    const afterSchema = db
      .prepare(
        `SELECT name, sql FROM sqlite_master WHERE type IN ('table','trigger','index') ORDER BY name`,
      )
      .all()
    const afterCounts = {
      inv: (
        db.prepare('SELECT COUNT(*) c FROM invoices').get() as { c: number }
      ).c,
      je: (
        db.prepare('SELECT COUNT(*) c FROM journal_entries').get() as {
          c: number
        }
      ).c,
    }

    expect(afterSchema).toEqual(beforeSchema)
    expect(afterCounts).toEqual(beforeCounts)
    assertIntegrity(db)
    db.close()
  })

  it('representativ seed bevarar alla invarianter efter serialize/deserialize', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshot-sd-'))
    const dbPath = path.join(tmp, 'round.db')

    try {
      const src = createTestDb()
      seedRepresentativeData(src)

      // Backup API för att skriva ut på disk
      src.exec(`VACUUM INTO '${dbPath.replace(/'/g, "''")}'`)
      src.close()

      // Öppna som persistent DB
      const reopened = new Database(dbPath)
      reopened.pragma('foreign_keys = ON')
      registerCustomFunctions(reopened)

      assertIntegrity(reopened)

      // Specifika counts bevarade
      const inv = (
        reopened.prepare('SELECT COUNT(*) c FROM invoices').get() as {
          c: number
        }
      ).c
      expect(inv).toBe(3)
      reopened.close()
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })
})
