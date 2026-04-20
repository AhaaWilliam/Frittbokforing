import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../../src/main/migrations'
import { registerCustomFunctions } from '../../src/main/db-functions'
import { FK_OFF_MIGRATION_INDEXES } from '../helpers/create-test-db'

/**
 * TT-5 utvidgning — multi-version snapshot-matrix.
 *
 * Kompletterar `snapshot-roundtrip.test.ts` (full-schema-seed + serialize)
 * med pragmatisk multi-version-täckning:
 *
 *   1. Öppna in-memory DB utan migrationer
 *   2. Kör migrationer 1..V (stop-tidigt vid boundary V)
 *   3. INSERT minimal data med V:s schema-shape (NOT services, eftersom
 *      services antar nuvarande schema)
 *   4. Kör migrationer V+1..head för att verifiera att data överlever
 *      hela migrationskedjan
 *   5. Verifiera integritet: integrity_check, foreign_key_check,
 *      user_version, balansinvarianter, paid_amount-spegling
 *
 * Boundary-versioner valda där schema-shape ändras materialt
 * (table-recreate, kolumn-rename, nya CHECK/FK):
 *
 *   - v=4   — baseline efter BAS-konton + vat_codes (migration 001-004).
 *             Schema: invoices.net_amount/total_amount, journal_entry_lines.debit_amount.
 *   - v=14  — efter triggers + ackumulerade ändringar, FÖRE öre-renames
 *             (migration 016-019 renamar belopp-kolumner).
 *   - v=21  — efter öre-renames + bank-fee + payment_batches, FÖRE
 *             öre-suffix-renames i migration 022 (table-recreate på
 *             invoices/invoice_payments/expense_payments med M122).
 *
 * Detta fångar regressioner i kolumn-rename, table-recreate-data-bevarande,
 * FK-backfills, och defense-in-depth-trigger-introduktion.
 *
 * Korsreferens: M115 (E2E-IPC-seeding är inte krav i system-lagret),
 * M121/M122 (table-recreate), M119 (öre-suffix).
 */

function pragma_user_version(db: Database.Database): number {
  return (db.pragma('user_version') as Array<{ user_version: number }>)[0]
    .user_version
}

/**
 * Utvidgad FK-off set för matris-testerna. Inkluderar baseline (M122-tabeller
 * som createTestDb redan hanterar) PLUS migration 012 (index 11) och migration
 * 021 (index 20). Båda är table-recreate på journal_entries där FK från
 * journal_entry_lines bryts om DB är icke-tom — createTestDb-baselinen är
 * tom så de behövs inte där, men matris-testerna seedar JEL-rader.
 */
const MATRIX_FK_OFF: ReadonlySet<number> = new Set([
  ...FK_OFF_MIGRATION_INDEXES,
  11, // migration 012 — journal_entries CHECK-utökning
  20, // migration 021 — journal_entries CHECK-rebuild + payment_batches
])

/**
 * Kör migrationer från index `from` (0-based, inklusive) till `to` (exklusive).
 * Hanterar M122-FK-off för specifika migrations-index.
 * Idempotent: hoppar över redan-applicerade migrationer.
 */
function applyMigrationsRange(
  db: Database.Database,
  from: number,
  to: number,
): void {
  for (let i = from; i < to; i++) {
    const cur = pragma_user_version(db)
    if (cur >= i + 1) continue
    const m = migrations[i]
    const needsFkOff = MATRIX_FK_OFF.has(i)
    if (needsFkOff) db.pragma('foreign_keys = OFF')
    db.exec('BEGIN EXCLUSIVE')
    db.exec(m.sql)
    if (m.programmatic) m.programmatic(db)
    db.pragma(`user_version = ${i + 1}`)
    db.exec('COMMIT')
    if (needsFkOff) {
      db.pragma('foreign_keys = ON')
      const fk = db.pragma('foreign_key_check') as unknown[]
      if (fk.length > 0) {
        throw new Error(
          `Migration ${i + 1} FK check failed: ${JSON.stringify(fk)}`,
        )
      }
    }
  }
}

function freshDb(): Database.Database {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  registerCustomFunctions(db)
  return db
}

function assertHeadIntegrity(db: Database.Database): void {
  // user_version = head
  expect(pragma_user_version(db)).toBe(migrations.length)

  // PRAGMA integrity_check
  const integrity = db.pragma('integrity_check') as Array<{
    integrity_check: string
  }>
  expect(integrity[0].integrity_check).toBe('ok')

  // FK-integrity
  const fk = db.pragma('foreign_key_check') as unknown[]
  expect(fk).toEqual([])

  // Alla bokförda verifikationer balanserar (öre-suffix efter migration 018)
  const unbal = db
    .prepare(
      `SELECT je.id
       FROM journal_entries je
       JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
       WHERE je.status = 'booked'
       GROUP BY je.id
       HAVING SUM(jel.debit_ore) != SUM(jel.credit_ore)`,
    )
    .all()
  expect(unbal).toEqual([])

  // M101 — paid_amount_ore = SUM(invoice_payments.amount_ore)
  const drift = db
    .prepare(
      `SELECT i.id
       FROM invoices i
       LEFT JOIN invoice_payments ip ON ip.invoice_id = i.id
       GROUP BY i.id
       HAVING i.paid_amount_ore != COALESCE(SUM(ip.amount_ore), 0)`,
    )
    .all()
  expect(drift).toEqual([])
}

/**
 * Seedar minimal company + fiscal_year + accounting_period vid v=4.
 * Returnerar ids. Tabell-shape: companies/fiscal_years/accounting_periods
 * är oförändrade sedan migration 001 (modulo company_id-backfill i 045).
 */
function seedCompanyAndFy(db: Database.Database): {
  companyId: number
  fyId: number
} {
  db.prepare(
    `INSERT INTO companies (name, org_number, fiscal_rule, share_capital, registration_date)
     VALUES ('Snapshot AB', '556036-0793', 'K2', 2500000, '2025-01-15')`,
  ).run()
  const companyId = (
    db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
  ).id

  db.prepare(
    `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
     VALUES (?, '2026', '2026-01-01', '2026-12-31')`,
  ).run(companyId)
  const fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id

  // Seed alla 12 perioder så period-trigger inte falerar
  for (let m = 1; m <= 12; m++) {
    const start = `2026-${String(m).padStart(2, '0')}-01`
    const end =
      m === 12
        ? '2026-12-31'
        : `2026-${String(m).padStart(2, '0')}-${m === 2 ? 28 : 30}`
    db.prepare(
      `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
       VALUES (?, ?, ?, ?, ?)`,
    ).run(companyId, fyId, m, start, end)
  }

  return { companyId, fyId }
}

describe('Migration snapshot-matrix — multi-version', () => {
  it('migrations.length matchar PRAGMA-versionsantal i CLAUDE.md ±expected drift', () => {
    // Sanity check: vi förväntar minst 44 migrationer (CLAUDE.md baseline);
    // ny migrationer accepteras (assertion uppdateras vid behov).
    expect(migrations.length).toBeGreaterThanOrEqual(44)
  })

  it('v=4 seed (companies + fiscal_year) överlever hela migrationskedjan', () => {
    const db = freshDb()
    applyMigrationsRange(db, 0, 4)
    expect(pragma_user_version(db)).toBe(4)

    const { companyId, fyId } = seedCompanyAndFy(db)

    // Kör återstående migrationer till head
    applyMigrationsRange(db, 4, migrations.length)

    assertHeadIntegrity(db)

    // Bevarad data
    const c = db
      .prepare('SELECT name, org_number, fiscal_rule FROM companies WHERE id = ?')
      .get(companyId) as { name: string; org_number: string; fiscal_rule: string }
    expect(c.name).toBe('Snapshot AB')
    expect(c.org_number).toBe('556036-0793')
    expect(c.fiscal_rule).toBe('K2')

    const fy = db
      .prepare('SELECT company_id, year_label FROM fiscal_years WHERE id = ?')
      .get(fyId) as { company_id: number; year_label: string }
    expect(fy.company_id).toBe(companyId)
    expect(fy.year_label).toBe('2026')

    const periods = (
      db
        .prepare('SELECT COUNT(*) c FROM accounting_periods WHERE fiscal_year_id = ?')
        .get(fyId) as { c: number }
    ).c
    expect(periods).toBe(12)

    db.close()
  })

  it('v=4 seed med journal_entry (draft-status, legacy debit_amount) överlever rename till debit_ore', () => {
    const db = freshDb()
    applyMigrationsRange(db, 0, 4)
    const { companyId, fyId } = seedCompanyAndFy(db)

    // INSERT JE + lines med v=4-schema (debit_amount, credit_amount).
    // Status='draft' undviker balans/period-trigger på BEFORE UPDATE booked.
    // Efter migration 018 har kolumnerna renamats till debit_ore/credit_ore.
    const jeStmt = db.prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_series, journal_date, description, status)
       VALUES (?, ?, 'A', '2026-02-15', 'Snapshot v=4 draft', 'draft')`,
    )
    const jeRes = jeStmt.run(companyId, fyId)
    const jeId = Number(jeRes.lastInsertRowid)

    const lineStmt = db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
       VALUES (?, ?, ?, ?, ?)`,
    )
    lineStmt.run(jeId, 1, '1930', 100000, 0)
    lineStmt.run(jeId, 2, '3001', 0, 100000)

    applyMigrationsRange(db, 4, migrations.length)
    assertHeadIntegrity(db)

    // Verifiera att rader finns med rätt belopp (kolumnen heter nu debit_ore)
    const lines = db
      .prepare(
        `SELECT line_number, account_number, debit_ore, credit_ore
         FROM journal_entry_lines WHERE journal_entry_id = ?
         ORDER BY line_number`,
      )
      .all(jeId) as Array<{
      line_number: number
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({
      account_number: '1930',
      debit_ore: 100000,
      credit_ore: 0,
    })
    expect(lines[1]).toMatchObject({
      account_number: '3001',
      debit_ore: 0,
      credit_ore: 100000,
    })

    // Verifikatet är fortsatt draft
    const je = db
      .prepare('SELECT status, description FROM journal_entries WHERE id = ?')
      .get(jeId) as { status: string; description: string }
    expect(je.status).toBe('draft')
    expect(je.description).toBe('Snapshot v=4 draft')

    db.close()
  })

  it('v=8 seed (efter counterparties.updated_at + invoice_lines + invoice_payments.account_number) överlever öre-rename + M122 table-recreate', () => {
    // OBS: Vi kan inte seeda counterparties FÖRE migration 005 — den lägger
    // till counterparties.updated_at NOT NULL DEFAULT (datetime('now')) som
    // SQLite förbjuder via ADD COLUMN på icke-tom tabell (M127).
    // Vi seedar därför vid v=8 där alla relevanta kolumner finns.
    const db = freshDb()
    applyMigrationsRange(db, 0, 8)
    expect(pragma_user_version(db)).toBe(8)
    const { companyId, fyId } = seedCompanyAndFy(db)

    db.prepare(
      `INSERT INTO counterparties (type, name, org_number)
       VALUES ('customer', 'Kund AB', '556677-1234')`,
    ).run()
    const cpId = (
      db.prepare('SELECT id FROM counterparties LIMIT 1').get() as {
        id: number
      }
    ).id

    // invoices vid v=8: legacy belopp-namn (net_amount, vat_amount, total_amount,
    // paid_amount) och fiscal_year_id-kolumn finns sedan migration 006.
    const invRes = db
      .prepare(
        `INSERT INTO invoices (
           counterparty_id, fiscal_year_id, invoice_type, invoice_number,
           invoice_date, due_date, net_amount, vat_amount, total_amount,
           status, paid_amount
         ) VALUES (?, ?, 'customer_invoice', 'F1', '2026-02-01', '2026-03-03',
                   100000, 25000, 125000, 'draft', 0)`,
      )
      .run(cpId, fyId)
    const invId = Number(invRes.lastInsertRowid)

    // Kör resten av migrationerna. Täcker:
    //  - migration 016-018: rename av invoices.{net_amount,vat_amount,total_amount} → *_ore
    //  - migration 022: M122 table-recreate av invoices m. öre-suffix
    //  - migration 029: ADD COLUMN credits_invoice_id
    //  - migration 045: counterparties.company_id backfill
    //  - migration 048: idx_invoices_list
    applyMigrationsRange(db, 8, migrations.length)
    assertHeadIntegrity(db)

    // Verifiera att fakturan överlevde alla rename + recreate
    const inv = db
      .prepare(
        `SELECT invoice_number, total_amount_ore, net_amount_ore, vat_amount_ore,
                paid_amount_ore, status, counterparty_id
         FROM invoices WHERE id = ?`,
      )
      .get(invId) as {
      invoice_number: string
      total_amount_ore: number
      net_amount_ore: number
      vat_amount_ore: number
      paid_amount_ore: number
      status: string
      counterparty_id: number
    }
    expect(inv.invoice_number).toBe('F1')
    expect(inv.total_amount_ore).toBe(125000)
    expect(inv.net_amount_ore).toBe(100000)
    expect(inv.vat_amount_ore).toBe(25000)
    expect(inv.paid_amount_ore).toBe(0)
    expect(inv.status).toBe('draft')
    expect(inv.counterparty_id).toBe(cpId)

    // counterparty.company_id ska vara backfilld till seed-bolaget (045)
    const cp = db
      .prepare('SELECT company_id, name FROM counterparties WHERE id = ?')
      .get(cpId) as { company_id: number; name: string }
    expect(cp.company_id).toBe(companyId)
    expect(cp.name).toBe('Kund AB')

    db.close()
  })

  it('v=14 seed (efter triggers + Sprint 11) — booked JE överlever resten', () => {
    const db = freshDb()
    applyMigrationsRange(db, 0, 14)
    expect(pragma_user_version(db)).toBe(14)

    const { companyId, fyId } = seedCompanyAndFy(db)

    // Vid v=14 har debit_amount-kolumnen INTE renamats än (sker i migr 018).
    // Skapa balanserad draft-JE och boka via UPDATE → triggar balance-check.
    const jeRes = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_series, verification_number, journal_date, description, status, source_type)
         VALUES (?, ?, 'A', 1, '2026-03-15', 'Booked v=14', 'draft', 'manual')`,
      )
      .run(companyId, fyId)
    const jeId = Number(jeRes.lastInsertRowid)

    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
       VALUES (?, 1, '1930', 50000, 0)`,
    ).run(jeId)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_amount, credit_amount)
       VALUES (?, 2, '3001', 0, 50000)`,
    ).run(jeId)

    // Boka — triggar balance + period checks
    db.prepare(`UPDATE journal_entries SET status = 'booked' WHERE id = ?`).run(
      jeId,
    )

    // Migrera till head
    applyMigrationsRange(db, 14, migrations.length)
    assertHeadIntegrity(db)

    // Verifiera att bokfört verifikat är intakt och fortsatt balanserar
    const je = db
      .prepare(
        'SELECT status, verification_series, verification_number FROM journal_entries WHERE id = ?',
      )
      .get(jeId) as {
      status: string
      verification_series: string
      verification_number: number
    }
    expect(je.status).toBe('booked')
    expect(je.verification_series).toBe('A')
    expect(je.verification_number).toBe(1)

    const sums = db
      .prepare(
        `SELECT SUM(debit_ore) AS d, SUM(credit_ore) AS c
         FROM journal_entry_lines WHERE journal_entry_id = ?`,
      )
      .get(jeId) as { d: number; c: number }
    expect(sums.d).toBe(50000)
    expect(sums.c).toBe(50000)

    db.close()
  })

  it('v=21 seed (efter öre-rename + bank-fee, FÖRE M122 table-recreate i 022) — invoice + payment överlever', () => {
    const db = freshDb()
    applyMigrationsRange(db, 0, 21)
    expect(pragma_user_version(db)).toBe(21)

    const { companyId, fyId } = seedCompanyAndFy(db)

    // Vid v=21 har kolumnerna redan renamats till *_ore (migr 016-018, 022 ej än).
    db.prepare(
      `INSERT INTO counterparties (type, name) VALUES ('customer', 'Bulk Kund')`,
    ).run()
    const cpId = (
      db.prepare('SELECT id FROM counterparties LIMIT 1').get() as {
        id: number
      }
    ).id

    // Vid v=21: invoices har redan total_amount_ore m.fl.
    // (Migration 015 lade troligtvis till fiscal_year_id på invoices — kolla via PRAGMA)
    const invCols = (
      db.pragma('table_info(invoices)') as Array<{ name: string }>
    ).map((c) => c.name)
    const hasFy = invCols.includes('fiscal_year_id')
    const hasPaidAmountOre = invCols.includes('paid_amount_ore')

    const fyClause = hasFy ? ', fiscal_year_id' : ''
    const fyVal = hasFy ? ', ?' : ''
    const paidCol = hasPaidAmountOre ? 'paid_amount_ore' : 'paid_amount'

    const invRes = db
      .prepare(
        `INSERT INTO invoices (
           counterparty_id, invoice_type, invoice_number, invoice_date, due_date,
           net_amount_ore, vat_amount_ore, total_amount_ore, status, ${paidCol}${fyClause}
         ) VALUES (?, 'customer_invoice', 'F-V21', '2026-04-01', '2026-05-01', ?, ?, ?, 'draft', 0${fyVal})`,
      )
      .run(...(hasFy ? [cpId, 80000, 20000, 100000, fyId] : [cpId, 80000, 20000, 100000]))
    const invId = Number(invRes.lastInsertRowid)

    // Boka fakturan: skapa en draft JE först, balanserad, sätt journal_entry_id, sedan UPDATE booked
    const jeRes = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, verification_series, verification_number, journal_date, description, status, source_type)
         VALUES (?, ?, 'A', 1, '2026-04-01', 'Faktura F-V21', 'draft', 'auto_invoice')`,
      )
      .run(companyId, fyId)
    const jeId = Number(jeRes.lastInsertRowid)

    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, 1, '1510', 100000, 0)`,
    ).run(jeId)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, 2, '3001', 0, 80000)`,
    ).run(jeId)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, 3, '2610', 0, 20000)`,
    ).run(jeId)

    db.prepare(`UPDATE journal_entries SET status = 'booked' WHERE id = ?`).run(
      jeId,
    )

    // Knyt JE till invoice + status unpaid
    db.prepare(
      `UPDATE invoices SET status = 'unpaid', journal_entry_id = ? WHERE id = ?`,
    ).run(jeId, invId)

    // Migrera till head — täcker M122 table-recreate på invoices/invoice_payments
    applyMigrationsRange(db, 21, migrations.length)
    assertHeadIntegrity(db)

    // Verifiera att fakturan + verifikatet överlevde recreate
    const inv = db
      .prepare(
        `SELECT invoice_number, total_amount_ore, paid_amount_ore, status, journal_entry_id
         FROM invoices WHERE id = ?`,
      )
      .get(invId) as {
      invoice_number: string
      total_amount_ore: number
      paid_amount_ore: number
      status: string
      journal_entry_id: number
    }
    expect(inv.invoice_number).toBe('F-V21')
    expect(inv.total_amount_ore).toBe(100000)
    expect(inv.paid_amount_ore).toBe(0)
    expect(inv.status).toBe('unpaid')
    expect(inv.journal_entry_id).toBe(jeId)

    const sums = db
      .prepare(
        `SELECT SUM(debit_ore) AS d, SUM(credit_ore) AS c
         FROM journal_entry_lines WHERE journal_entry_id = ?`,
      )
      .get(jeId) as { d: number; c: number }
    expect(sums.d).toBe(100000)
    expect(sums.c).toBe(100000)

    db.close()
  })

  it('idempotens: kör hela kedjan två gånger på samma DB → no-op andra gången', () => {
    const db = freshDb()
    applyMigrationsRange(db, 0, migrations.length)
    expect(pragma_user_version(db)).toBe(migrations.length)

    const schemaBefore = db
      .prepare(
        `SELECT name, sql FROM sqlite_master
         WHERE type IN ('table','trigger','index') ORDER BY name`,
      )
      .all()

    // Andra körning — ska vara no-op (alla user_version >= i+1)
    applyMigrationsRange(db, 0, migrations.length)
    expect(pragma_user_version(db)).toBe(migrations.length)

    const schemaAfter = db
      .prepare(
        `SELECT name, sql FROM sqlite_master
         WHERE type IN ('table','trigger','index') ORDER BY name`,
      )
      .all()

    expect(schemaAfter).toEqual(schemaBefore)

    const integrity = db.pragma('integrity_check') as Array<{
      integrity_check: string
    }>
    expect(integrity[0].integrity_check).toBe('ok')

    db.close()
  })
})
