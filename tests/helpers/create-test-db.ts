import Database from 'better-sqlite3'
import { migrations } from '../../src/main/migrations'
import { registerCustomFunctions } from '../../src/main/db-functions'

// Migration indexes (0-based) that require PRAGMA foreign_keys = OFF outside
// the transaction due to table-recreate on tables with inbound FK. See M122 in CLAUDE.md.
// Note: intentionally does not include index 20 (migration 021 journal_entries
// CHECK-rebuild) — baseline test helper omitted it and tests have adapted.
// Index 37 = migration 038 (Sprint 53 F62: journal_entries verification_series
// CHECK-rebuild + fixed_assets + depreciation_schedules).
// Index 42 = migration 043 (Sprint F P6: bank_statements.source_format CHECK-utökning).
// Index 43 = migration 044 (Sprint Q T3.d: MT940+BGMAX source_format-utvidgning).
export const FK_OFF_MIGRATION_INDEXES: ReadonlySet<number> = new Set([
  21, 22, 37, 42, 43,
])

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
