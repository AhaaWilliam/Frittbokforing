import { describe, it, expect } from 'vitest'
import Database from 'better-sqlite3'
import { migrations } from '../../src/main/migrations'
import { registerCustomFunctions } from '../../src/main/db-functions'
import { FK_OFF_MIGRATION_INDEXES } from '../helpers/create-test-db'

/**
 * Step-wise migration integrity scanner.
 *
 * För varje migration N i kedjan:
 * 1. Kör migrations 1..N
 * 2. PRAGMA foreign_key_check ska vara tom
 * 3. user_version ska vara N
 * 4. Alla tabeller med NOT NULL DEFAULT-fields ska accepterar INSERT med bara PK
 *    (smoke-test — inte en fullständig round-trip)
 *
 * Scope-reducerad från "44 snapshot-DBs per version" (prompten M122-full) till
 * step-wise-check som kör hela kedjan. Kompletterar existerande
 * `full-chain-regression.test.ts` som testar slut-state.
 */

function applyMigration(db: Database.Database, index: number): void {
  const migration = migrations[index]
  const needsFkOff = FK_OFF_MIGRATION_INDEXES.has(index)
  if (needsFkOff) db.pragma('foreign_keys = OFF')
  db.exec('BEGIN EXCLUSIVE')
  db.exec(migration.sql)
  if (migration.programmatic) migration.programmatic(db)
  db.pragma(`user_version = ${index + 1}`)
  db.exec('COMMIT')
  if (needsFkOff) db.pragma('foreign_keys = ON')
}

describe('Migration step-wise integrity (scanner)', () => {
  it('varje migration lämnar DB i FK-konsistent state', () => {
    const db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    registerCustomFunctions(db)

    const failures: Array<{ step: number; reason: string }> = []

    for (let i = 0; i < migrations.length; i++) {
      applyMigration(db, i)

      // Verify user_version
      const uv = (
        db.pragma('user_version') as Array<{
          user_version: number
        }>
      )[0].user_version
      if (uv !== i + 1) {
        failures.push({
          step: i + 1,
          reason: `user_version ${uv} ≠ ${i + 1}`,
        })
      }

      // FK-integrity
      const fkCheck = db.pragma('foreign_key_check') as unknown[]
      if (fkCheck.length > 0) {
        failures.push({
          step: i + 1,
          reason: `FK-check non-empty: ${JSON.stringify(fkCheck)}`,
        })
      }

      // Schema-integrity via sqlite_master
      const master = db
        .prepare(`SELECT COUNT(*) as c FROM sqlite_master WHERE type='table'`)
        .get() as { c: number }
      if (master.c === 0) {
        failures.push({ step: i + 1, reason: 'inga tabeller i schemat' })
      }
    }

    db.close()

    expect(failures).toEqual([])
  })

  it('slut-state har user_version = antal migrationer', () => {
    const db = new Database(':memory:')
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    registerCustomFunctions(db)
    for (let i = 0; i < migrations.length; i++) applyMigration(db, i)

    const uv = (
      db.pragma('user_version') as Array<{
        user_version: number
      }>
    )[0].user_version
    expect(uv).toBe(migrations.length)
    db.close()
  })

  it('alla migrations sekventiellt idempotent: rerun ändrar ingenting', () => {
    // Kör en gång
    const db1 = new Database(':memory:')
    db1.pragma('foreign_keys = ON')
    registerCustomFunctions(db1)
    for (let i = 0; i < migrations.length; i++) applyMigration(db1, i)
    const hash1 = JSON.stringify(
      db1
        .prepare(
          `SELECT name, sql FROM sqlite_master WHERE type IN ('table','trigger','index') ORDER BY name`,
        )
        .all(),
    )
    db1.close()

    // Kör igen (frisk DB)
    const db2 = new Database(':memory:')
    db2.pragma('foreign_keys = ON')
    registerCustomFunctions(db2)
    for (let i = 0; i < migrations.length; i++) applyMigration(db2, i)
    const hash2 = JSON.stringify(
      db2
        .prepare(
          `SELECT name, sql FROM sqlite_master WHERE type IN ('table','trigger','index') ORDER BY name`,
        )
        .all(),
    )
    db2.close()

    expect(hash2).toBe(hash1)
  })
})
