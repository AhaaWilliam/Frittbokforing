import type Database from 'better-sqlite3'

/**
 * Register all custom SQLite functions. Called from db.ts (production)
 * and create-test-db.ts (test). Single source of truth — adding a
 * function here covers all Database instances.
 *
 * If you create a new Database instance anywhere, you MUST call this.
 */
export function registerCustomFunctions(db: Database.Database): void {
  // Unicode-aware LOWER for Swedish åäö (stock SQLite LOWER is ASCII-only).
  // Uses JS toLowerCase() which is locale-independent in V8.
  // DO NOT change to toLocaleLowerCase — it's locale-sensitive (Turkish İ → ı).
  // Full Unicode normalization (NFKD + accent-strip) is FTS5's job, not this.
  db.function('lower_unicode', { deterministic: true }, (s: unknown) =>
    typeof s === 'string' ? s.toLowerCase() : s,
  )
}
