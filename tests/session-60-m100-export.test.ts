/**
 * Sprint D C3 — M100-compliant structured errors i export-lagret.
 *
 * Täcker de två tidigare `throw new Error(...)`-call-sites i:
 *   - export-data-queries.ts (getCompanyInfo + getFiscalYear)
 *   - excel-export-service.ts (startDate/endDate-validering)
 *
 * Regressionsvakt mot M100-återfall (strukturerade { code, error, field? }
 * istället för plain Error).
 */
import { describe, it, expect, beforeEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import {
  getCompanyInfo,
  getFiscalYear,
} from '../src/main/services/export/export-data-queries'
import { exportExcel } from '../src/main/services/excel/excel-export-service'

function seedCompanyAndFy(db: Database.Database): {
  companyId: number
  fyId: number
} {
  db.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule)
      VALUES (1, '559000-1234', 'Test AB', 'K2');
    INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date)
      VALUES (1, 1, '2026', '2026-01-01', '2026-12-31');
  `)
  return { companyId: 1, fyId: 1 }
}

describe('Sprint D C3 — M100 strukturerade fel i export-lagret', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  it('getCompanyInfo kastar NOT_FOUND vid okänt fiscalYearId (Sprint MC1)', () => {
    expect(() => getCompanyInfo(db, 999)).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    )
    try {
      getCompanyInfo(db, 999)
    } catch (err) {
      expect(err).toHaveProperty('code', 'NOT_FOUND')
      expect((err as { error: string }).error).toMatch(/företag/i)
    }
  })

  it('getFiscalYear kastar NOT_FOUND vid okänt fiscalYearId', () => {
    seedCompanyAndFy(db)
    expect(() => getFiscalYear(db, 999)).toThrow(
      expect.objectContaining({ code: 'NOT_FOUND' }),
    )
    try {
      getFiscalYear(db, 999)
    } catch (err) {
      expect(err).toHaveProperty('code', 'NOT_FOUND')
      expect((err as { error: string }).error).toMatch(/räkenskapsår/i)
    }
  })

  it('exportExcel kastar VALIDATION_ERROR med field=startDate när startDate ligger före FY-start', async () => {
    const { fyId } = seedCompanyAndFy(db)
    await expect(
      exportExcel(db, {
        fiscalYearId: fyId,
        startDate: '2025-12-01', // före 2026-01-01
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        field: 'startDate',
      }),
    )
  })

  it('exportExcel kastar VALIDATION_ERROR med field=endDate när endDate ligger efter FY-slut', async () => {
    const { fyId } = seedCompanyAndFy(db)
    await expect(
      exportExcel(db, {
        fiscalYearId: fyId,
        endDate: '2027-01-15', // efter 2026-12-31
      }),
    ).rejects.toEqual(
      expect.objectContaining({
        code: 'VALIDATION_ERROR',
        field: 'endDate',
      }),
    )
  })
})
