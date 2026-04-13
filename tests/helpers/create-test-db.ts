import Database from 'better-sqlite3'
import { migrations } from '../../src/main/migrations'

// Migration indexes (0-based) that require PRAGMA foreign_keys = OFF outside
// the transaction due to table-recreate on tables with inbound FK. See M122 in CLAUDE.md.
export const FK_OFF_MIGRATION_INDEXES: ReadonlySet<number> = new Set([21, 22])

/**
 * Creates a fresh in-memory DB with all migrations applied.
 * Handles PRAGMA foreign_keys OFF/ON for table-recreate migrations (M122).
 */
export function createTestDb(): Database.Database {
  const testDb = new Database(':memory:')
  testDb.pragma('journal_mode = WAL')
  testDb.pragma('foreign_keys = ON')
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
        throw new Error(`Migration ${i + 1} FK check failed: ${JSON.stringify(fkCheck)}`)
      }
    }
  }
  return testDb
}
