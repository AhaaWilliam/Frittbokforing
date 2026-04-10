/**
 * Security Test Context — extends system test context with raw DB access helpers
 * for testing constraints, triggers, and defense-in-depth mechanisms.
 */

import Database from 'better-sqlite3'
import {
  createTemplateDb,
  createSystemTestContext,
  destroyContext,
  destroyTemplateDb,
  type SystemTestContext,
  type CreateContextOptions,
} from '../../system/helpers/system-test-context'

export {
  createTemplateDb,
  createSystemTestContext,
  destroyContext,
  destroyTemplateDb,
  type SystemTestContext,
  type CreateContextOptions,
}

/**
 * Get direct database access for bypassing service-layer validation.
 * Used to test trigger/constraint enforcement.
 */
export function getDbDirectly(ctx: SystemTestContext): Database.Database {
  return ctx.db
}

/**
 * Directly insert or modify data bypassing service validation.
 * Used to test that DB triggers catch invalid operations.
 */
export function corruptData(
  ctx: SystemTestContext,
  table: string,
  id: number,
  column: string,
  value: unknown,
): void {
  ctx.db
    .prepare(`UPDATE ${table} SET ${column} = ? WHERE id = ?`)
    .run(value, id)
}

/**
 * Direct SQL insert for testing constraints.
 * Throws if the DB rejects the insert (trigger/CHECK/UNIQUE/FK).
 */
export function rawInsert(
  ctx: SystemTestContext,
  sql: string,
  params: unknown[] = [],
): Database.RunResult {
  return ctx.db.prepare(sql).run(...params)
}

/**
 * Direct SQL query for verifying constraint effects.
 */
export function rawQuery<T = unknown>(
  ctx: SystemTestContext,
  sql: string,
  params: unknown[] = [],
): T[] {
  return ctx.db.prepare(sql).all(...params) as T[]
}

/**
 * Direct SQL single row query.
 */
export function rawGet<T = unknown>(
  ctx: SystemTestContext,
  sql: string,
  params: unknown[] = [],
): T | undefined {
  return ctx.db.prepare(sql).get(...params) as T | undefined
}

/**
 * Attempt a raw SQL operation and expect it to fail with a specific error message.
 * Returns the error message if the operation fails, null if it succeeds.
 */
export function expectSqlError(
  ctx: SystemTestContext,
  sql: string,
  params: unknown[] = [],
): string | null {
  try {
    ctx.db.prepare(sql).run(...params)
    return null // no error — operation succeeded
  } catch (err) {
    return (err as Error).message
  }
}
