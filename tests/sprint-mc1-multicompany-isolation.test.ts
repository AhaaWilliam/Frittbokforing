/**
 * Sprint MC1 — Multicompany backend-isolation
 *
 * Verifierar att:
 *   1. Två bolag kan existera parallellt i samma DB.
 *   2. Verifikat (journal_entries) som skapas för bolag A:s FY hamnar
 *      med company_id = A — inte med "första bolaget" som tidigare.
 *   3. Verifikatnummer är scopade per FY oberoende av bolag.
 *   4. listCompanies returnerar alla bolag i id-ordning.
 *   5. getCompanyIdForFiscalYear härleder rätt bolag via fiscal_year_id.
 *   6. getActiveCompanyId respekterar settings.last_company_id med fallback
 *      till första bolaget.
 *
 * Detta test förhindrar regression till `(SELECT id FROM companies LIMIT 1)`-
 * mönstret som tidigare hårdkodade journal_entries.company_id till första
 * bolaget oavsett vilken FY verifikatet tillhörde.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import {
  createCompany,
  listCompanies,
  getCompanyById,
} from '../src/main/services/company-service'
import {
  getCompanyIdForFiscalYear,
  getActiveCompanyId,
} from '../src/main/utils/active-context'
import {
  saveManualEntryDraft,
  finalizeManualEntry,
} from '../src/main/services/manual-entry-service'

let db: Database.Database

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

function makeCompany(name: string, orgNumber: string, year: string) {
  const res = createCompany(db, {
    name,
    org_number: orgNumber,
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: `${year}-01-15`,
    fiscal_year_start: `${year}-01-01`,
    fiscal_year_end: `${year}-12-31`,
  })
  if (!res.success) throw new Error(`createCompany failed: ${res.error}`)
  const fy = db
    .prepare('SELECT id FROM fiscal_years WHERE company_id = ?')
    .get(res.data.id) as { id: number }
  return { companyId: res.data.id, fiscalYearId: fy.id }
}

describe('Sprint MC1 — multicompany backend isolation', () => {
  describe('listCompanies + getCompanyById', () => {
    it('returnerar tom lista när DB är tom', () => {
      expect(listCompanies(db)).toEqual([])
    })

    it('returnerar bolag i id-ordning när flera finns', () => {
      makeCompany('Bolag A AB', '556036-0793', '2025')
      makeCompany('Bolag B AB', '559900-0006', '2025')
      const list = listCompanies(db)
      expect(list).toHaveLength(2)
      expect(list[0].name).toBe('Bolag A AB')
      expect(list[1].name).toBe('Bolag B AB')
      expect(list[0].id).toBeLessThan(list[1].id)
    })

    it('getCompanyById returnerar null för icke-existerande id', () => {
      makeCompany('Bolag A AB', '556036-0793', '2025')
      expect(getCompanyById(db, 99999)).toBeNull()
    })
  })

  describe('getCompanyIdForFiscalYear', () => {
    it('härleder rätt bolag från FY även när flera bolag finns', () => {
      const a = makeCompany('Bolag A AB', '556036-0793', '2025')
      const b = makeCompany('Bolag B AB', '559900-0006', '2025')
      expect(getCompanyIdForFiscalYear(db, a.fiscalYearId)).toBe(a.companyId)
      expect(getCompanyIdForFiscalYear(db, b.fiscalYearId)).toBe(b.companyId)
    })

    it('kastar för icke-existerande fiscal_year_id', () => {
      expect(() => getCompanyIdForFiscalYear(db, 99999)).toThrow(/finns inte/)
    })
  })

  describe('getActiveCompanyId', () => {
    it('returnerar null när DB saknar bolag', () => {
      expect(getActiveCompanyId(db, {})).toBeNull()
    })

    it('returnerar första bolaget när settings saknar last_company_id', () => {
      const a = makeCompany('Bolag A AB', '556036-0793', '2025')
      makeCompany('Bolag B AB', '559900-0006', '2025')
      expect(getActiveCompanyId(db, {})).toBe(a.companyId)
    })

    it('respekterar last_company_id när bolaget existerar', () => {
      makeCompany('Bolag A AB', '556036-0793', '2025')
      const b = makeCompany('Bolag B AB', '559900-0006', '2025')
      expect(getActiveCompanyId(db, { last_company_id: b.companyId })).toBe(
        b.companyId,
      )
    })

    it('faller tillbaka till första bolaget när last_company_id pekar på borttaget bolag', () => {
      const a = makeCompany('Bolag A AB', '556036-0793', '2025')
      expect(getActiveCompanyId(db, { last_company_id: 99999 })).toBe(
        a.companyId,
      )
    })
  })

  describe('Verifikat-isolation (regressionsskydd för LIMIT 1-buggen)', () => {
    it('verifikat skapat i bolag B:s FY får company_id = B, inte A', () => {
      const a = makeCompany('Bolag A AB', '556036-0793', '2025')
      const b = makeCompany('Bolag B AB', '559900-0006', '2025')

      // Hämta två konton med klassificering så finalize fungerar
      const accountRows = db
        .prepare(
          "SELECT account_number FROM accounts WHERE account_number IN ('1930','1510') ORDER BY account_number",
        )
        .all() as { account_number: string }[]
      expect(accountRows).toHaveLength(2)

      // Skapa manuell verifikation i bolag B:s FY
      const draftRes = saveManualEntryDraft(db, {
        fiscal_year_id: b.fiscalYearId,
        entry_date: '2025-06-15',
        description: 'Test ME för bolag B',
        lines: [
          { account_number: '1930', debit_ore: 10000, credit_ore: 0 },
          { account_number: '1510', debit_ore: 0, credit_ore: 10000 },
        ],
      })
      if (!draftRes.success) {
        throw new Error(`saveDraft failed: ${draftRes.error}`)
      }

      const finalizeRes = finalizeManualEntry(
        db,
        draftRes.data.id,
        b.fiscalYearId,
      )
      if (!finalizeRes.success) {
        throw new Error(`finalize failed: ${finalizeRes.error}`)
      }

      const je = db
        .prepare(
          'SELECT company_id, fiscal_year_id FROM journal_entries WHERE id = ?',
        )
        .get(finalizeRes.data.journalEntryId) as {
        company_id: number
        fiscal_year_id: number
      }

      expect(je.fiscal_year_id).toBe(b.fiscalYearId)
      expect(je.company_id).toBe(b.companyId)
      expect(je.company_id).not.toBe(a.companyId)
    })

    it('verifikatnummer är scopade per FY oberoende av bolag', () => {
      const a = makeCompany('Bolag A AB', '556036-0793', '2025')
      const b = makeCompany('Bolag B AB', '559900-0006', '2025')

      function bookOne(fyId: number, dateOffset: number): number {
        const draft = saveManualEntryDraft(db, {
          fiscal_year_id: fyId,
          entry_date: `2025-06-${String(15 + dateOffset).padStart(2, '0')}`,
          description: `ME ${fyId}-${dateOffset}`,
          lines: [
            { account_number: '1930', debit_ore: 1000, credit_ore: 0 },
            { account_number: '1510', debit_ore: 0, credit_ore: 1000 },
          ],
        })
        if (!draft.success) throw new Error(draft.error)
        const fin = finalizeManualEntry(db, draft.data.id, fyId)
        if (!fin.success) throw new Error(fin.error)
        return fin.data.verificationNumber
      }

      const a1 = bookOne(a.fiscalYearId, 0)
      const a2 = bookOne(a.fiscalYearId, 1)
      const b1 = bookOne(b.fiscalYearId, 0)
      const b2 = bookOne(b.fiscalYearId, 1)

      expect(a1).toBe(1)
      expect(a2).toBe(2)
      expect(b1).toBe(1) // egen serie för B
      expect(b2).toBe(2)
    })
  })
})
