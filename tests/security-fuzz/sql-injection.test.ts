import { describe, it, expect } from 'vitest'
import { createTestDb } from '../helpers/create-test-db'
import { createCounterparty } from '../../src/main/services/counterparty-service'
import { createCompany } from '../../src/main/services/company-service'

/**
 * SQL-injection-audit.
 *
 * Kör klassiska payloads mot text-fält via service-lagret och verifierar:
 * 1. Ingen service krashar okontrollerat
 * 2. `PRAGMA integrity_check` förblir `ok` efter varje försök
 * 3. `sqlite_master` förblir intakt (inga dropped tables, inga nya objekt)
 */

const INJECTION_PAYLOADS = [
  `'; DROP TABLE companies; --`,
  `' OR '1'='1`,
  `' OR 1=1 --`,
  `'; INSERT INTO users (id, display_name) VALUES (9999, 'evil'); --`,
  `"; DELETE FROM invoices; --`,
  `\\'; DROP TABLE invoices; --`,
  `%`, // LIKE escape
  `_`, // LIKE wildcard
  `\u0000`, // null byte
  `\u200B\u200C\u200D`, // zero-width
  `'); UPDATE companies SET name='hacked';--`,
  `1' UNION SELECT * FROM users--`,
  `admin'/*`,
  `' OR EXISTS(SELECT * FROM sqlite_master)--`,
  `'|| (SELECT hex(randomblob(16)))||'`,
  `') OR (1=1`,
]

describe('SQL-injection-fuzz — text-fält via service-lagret', () => {
  it('counterparty.name med alla payloads → integrity bevarad', () => {
    const db = createTestDb()
    const company = createCompany(db, {
      name: 'Host AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    })
    if (!company.success) throw new Error('company seed failed')
    const companyId = (
      db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
    ).id

    const initialSchema = JSON.stringify(
      db
        .prepare(
          `SELECT name, type FROM sqlite_master WHERE type IN ('table','trigger','index') ORDER BY name`,
        )
        .all(),
    )

    for (const payload of INJECTION_PAYLOADS) {
      // Försök skapa counterparty med payload som namn
      const r = createCounterparty(db, {
        company_id: companyId,
        name: payload,
        type: 'customer',
      })
      // Service får antingen validera bort eller lagra payload sanerat —
      // men får aldrig exekvera det som SQL
      expect(typeof r).toBe('object')

      // Integritet bevarad
      const integrity = db.pragma('integrity_check') as Array<{
        integrity_check: string
      }>
      expect(integrity[0].integrity_check).toBe('ok')

      // Schema oförändrat
      const nowSchema = JSON.stringify(
        db
          .prepare(
            `SELECT name, type FROM sqlite_master WHERE type IN ('table','trigger','index') ORDER BY name`,
          )
          .all(),
      )
      expect(nowSchema).toBe(initialSchema)
    }
  })

  it('payload stored as literal — inget SQL-exec vid retrieve', () => {
    const db = createTestDb()
    createCompany(db, {
      name: 'Host AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    })
    const companyId = (
      db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
    ).id

    const payload = `'; DROP TABLE companies; --`
    const r = createCounterparty(db, {
      company_id: companyId,
      name: payload,
      type: 'customer',
    })
    expect(r.success).toBe(true)

    // Hämta tillbaka via prepared statement — payload ska returneras literal
    const stored = db
      .prepare('SELECT name FROM counterparties WHERE type = ? LIMIT 1')
      .get('customer') as { name: string }
    expect(stored.name).toBe(payload)

    // Integrity efter retrieve
    const integrity = db.pragma('integrity_check') as Array<{
      integrity_check: string
    }>
    expect(integrity[0].integrity_check).toBe('ok')
  })
})
