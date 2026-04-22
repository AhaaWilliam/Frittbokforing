import Database from 'better-sqlite3'
import { migrations, NEEDS_FK_OFF } from '../../src/main/migrations'
import { registerCustomFunctions } from '../../src/main/db-functions'

// Single source of truth: NEEDS_FK_OFF i migrations.ts (importerad).
// Testhelper använde tidigare en hårdkodad lista som glömde nya
// migrations — orsakade silent breakage när nya migrations med
// inbound FK lades till. Sprint M (2026-04-22): bytt till import
// av NEEDS_FK_OFF. Historisk not: index 20 (migration 021 journal_entries
// CHECK-rebuild) var tidigare "intentionally omitted" — nu inkluderat
// från NEEDS_FK_OFF eftersom testhelpern ska matcha produktions-
// migrationskörare.
export const FK_OFF_MIGRATION_INDEXES: ReadonlySet<number> = NEEDS_FK_OFF

/**
 * Creates a fresh in-memory DB with all migrations applied.
 * Handles PRAGMA foreign_keys OFF/ON for table-recreate migrations (M122).
 */
export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
  registerCustomFunctions(testDb)
  for (let i = 0; i < migrations.length; i++) {
    const migration = migrations[i]

    // M122: table-recreate on tables with inbound FK requires FK off outside transaction
    const needsFkOff = FK_OFF_MIGRATION_INDEXES.has(i)
    if (needsFkOff) testDb.pragma('foreign_keys = OFF')

    testDb.exec('BEGIN EXCLUSIVE')
    testDb.exec(migration.sql)
    if (migration.programmatic) {
      migration.programmatic(testDb)
    }
    testDb.pragma(`user_version = ${i + 1}`)
    testDb.exec('COMMIT')

    if (needsFkOff) {
      testDb.pragma('foreign_keys = ON')
      const fkCheck = testDb.pragma('foreign_key_check') as unknown[]
      if (fkCheck.length > 0) {
        throw new Error(
          `Migration ${i + 1} FK check failed: ${JSON.stringify(fkCheck)}`,
        )
      }
    }
  }
  return testDb
}
