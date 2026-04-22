/**
 * Tests for Fynd 8 helpers: validateWithZod + ensureFyScope.
 *
 * Demonstrerar den förväntade API-kontrakten för framtida services.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import BetterSqlite3 from 'better-sqlite3'
import { z } from 'zod'
import { validateWithZod } from '../src/main/services/validate-with-zod'
import { ensureFyScope } from '../src/main/services/ensure-fy-scope'

describe('validateWithZod', () => {
  const schema = z.object({
    name: z.string().min(1, 'Namn krävs'),
    age: z.number().int().min(0),
  })

  it('returnerar parsat data vid giltig input', () => {
    const result = validateWithZod(schema, { name: 'Alice', age: 30 })
    expect(result).toEqual({ name: 'Alice', age: 30 })
  })

  it('kastar strukturerat fel vid ogiltig input (med field)', () => {
    try {
      validateWithZod(schema, { name: '', age: 30 })
      throw new Error('Should have thrown')
    } catch (err) {
      expect(err).toMatchObject({
        code: 'VALIDATION_ERROR',
        error: 'Namn krävs',
        field: 'name',
      })
    }
  })

  it('kastar strukturerat fel utan field om path saknas', () => {
    // Root-level schema utan field-path
    const rootSchema = z.number()
    try {
      validateWithZod(rootSchema, 'not a number')
      throw new Error('Should have thrown')
    } catch (err) {
      expect(err).toMatchObject({ code: 'VALIDATION_ERROR' })
      expect((err as { field?: string }).field).toBeUndefined()
    }
  })
})

describe('ensureFyScope', () => {
  let db: BetterSqlite3.Database

  beforeEach(() => {
    db = new BetterSqlite3(':memory:')
    db.exec(`
      CREATE TABLE companies (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE fiscal_years (
        id INTEGER PRIMARY KEY,
        company_id INTEGER NOT NULL REFERENCES companies(id)
      );
      INSERT INTO companies (id, name) VALUES (1, 'Acme'), (2, 'Other');
      INSERT INTO fiscal_years (id, company_id) VALUES (10, 1), (20, 2);
    `)
  })

  afterEach(() => {
    db.close()
  })

  it('returnerar void när fy tillhör expected company', () => {
    expect(() => ensureFyScope(db, 10, 1)).not.toThrow()
    expect(() => ensureFyScope(db, 20, 2)).not.toThrow()
  })

  it('kastar NOT_FOUND om fy inte finns', () => {
    try {
      ensureFyScope(db, 999, 1)
      throw new Error('Should have thrown')
    } catch (err) {
      expect(err).toMatchObject({
        code: 'NOT_FOUND',
        field: 'fiscal_year_id',
      })
    }
  })

  it('kastar VALIDATION_ERROR vid företags-mismatch', () => {
    try {
      ensureFyScope(db, 10, 2) // fy 10 är company 1, inte 2
      throw new Error('Should have thrown')
    } catch (err) {
      expect(err).toMatchObject({
        code: 'VALIDATION_ERROR',
        field: 'fiscal_year_id',
      })
    }
  })
})
