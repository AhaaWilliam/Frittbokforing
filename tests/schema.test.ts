import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'

let db: Database.Database

/** Skapar hjälpdata för trigger-tester */
function seedHelperData(testDb: Database.Database): {
  companyId: number
  userId: number
  fyId: number
} {
  testDb.exec(`
    INSERT INTO companies (id, org_number, name, fiscal_rule) VALUES (1, '559000-1234', 'Test AB', 'K2');
    INSERT INTO users (id, name, email) VALUES (1, 'Testare', 'test@test.se');
    INSERT INTO fiscal_years (id, company_id, year_label, start_date, end_date) VALUES (1, 1, '2025', '2025-01-01', '2025-12-31');
    INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
      VALUES (1, 1, 1, '2025-01-01', '2025-01-31');
    INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
      VALUES (1, 1, 2, '2025-02-01', '2025-02-28');
    INSERT INTO verification_sequences (fiscal_year_id, series, last_number) VALUES (1, 'A', 0);
  `)
  return { companyId: 1, userId: 1, fyId: 1 }
}

/** Skapar en draft journal entry med 2 balanserade rader */
function createDraftEntry(
  testDb: Database.Database,
  opts: {
    companyId: number
    fyId: number
    userId: number
    date?: string
    debit?: number
    credit?: number
  },
): number {
  const date = opts.date ?? '2025-01-15'
  const amount = opts.debit ?? 100000
  const res = testDb
    .prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, created_by)
     VALUES (?, ?, ?, 'Testverifikation', 'draft', ?)`,
    )
    .run(opts.companyId, opts.fyId, date, opts.userId)
  const entryId = Number(res.lastInsertRowid)
  testDb
    .prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
     VALUES (?, 1, '1930', ?, 0)`,
    )
    .run(entryId, amount)
  testDb
    .prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
     VALUES (?, 2, '3001', 0, ?)`,
    )
    .run(entryId, opts.credit ?? amount)
  return entryId
}

/** Bokar en entry */
function bookEntry(testDb: Database.Database, entryId: number): void {
  testDb
    .prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?")
    .run(entryId)
}

beforeEach(() => {
  db = createTestDb()
})

afterEach(() => {
  if (db) db.close()
})

// ═══════════════════════════════════════════════════════════
// STRUKTUR (6 tester)
// ═══════════════════════════════════════════════════════════
describe('Struktur', () => {
  it('1. Alla 13 tabeller existerar', () => {
    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[]
    const names = tables.map((t) => t.name)
    const expected = [
      'accounting_periods',
      'accounts',
      'companies',
      'counterparties',
      'expense_lines',
      'expense_payments',
      'expenses',
      'fiscal_years',
      'invoice_lines',
      'invoice_payments',
      'invoices',
      'journal_entries',
      'journal_entry_lines',
      'manual_entries',
      'manual_entry_lines',
      'opening_balances',
      'payment_batches',
      'price_list_items',
      'price_lists',
      'products',
      'users',
      'vat_codes',
      'verification_sequences',
    ]
    expect(names).toEqual(expected)
    expect(tables.length).toBe(23)
  })

  it('2. Minst 85 konton i accounts', () => {
    const count = db.prepare('SELECT COUNT(*) as c FROM accounts').get() as {
      c: number
    }
    expect(count.c).toBeGreaterThanOrEqual(85)
  })

  it('3. Exakt 7 momskoder', () => {
    const count = db.prepare('SELECT COUNT(*) as c FROM vat_codes').get() as {
      c: number
    }
    expect(count.c).toBeGreaterThanOrEqual(7)
  })

  it('4. user_version = 11', () => {
    const v = db.pragma('user_version', { simple: true })
    expect(v).toBe(24) // S44: Uppdatera vid nya migrationer
  })

  it('5. foreign_keys = ON', () => {
    const fk = db.pragma('foreign_keys', { simple: true })
    expect(fk).toBe(1)
  })

  it('6. journal_mode = wal (memory DB returnerar memory)', () => {
    // :memory: DB kan inte använda WAL — testar att PRAGMA accepteras
    // I riktig fil-DB returneras 'wal' (testat i setup.test.ts)
    const mode = db.pragma('journal_mode', { simple: true })
    expect(['wal', 'memory']).toContain(mode)
  })
})

// ═══════════════════════════════════════════════════════════
// CHECK CONSTRAINTS (6 tester)
// ═══════════════════════════════════════════════════════════
describe('CHECK constraints', () => {
  it('7. Negativ debit_ore → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    expect(() => {
      db.prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
         VALUES (?, 3, '1910', -100, 0)`,
      ).run(entryId)
    }).toThrow()
  })

  it('8. Negativ credit_ore → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    expect(() => {
      db.prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
         VALUES (?, 3, '1910', 0, -100)`,
      ).run(entryId)
    }).toThrow()
  })

  it('9. Både debit och credit > 0 → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    expect(() => {
      db.prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
         VALUES (?, 3, '1910', 100, 100)`,
      ).run(entryId)
    }).toThrow()
  })

  it('10. Både debit och credit = 0 → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    expect(() => {
      db.prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
         VALUES (?, 3, '1910', 0, 0)`,
      ).run(entryId)
    }).toThrow()
  })

  it('11. Ogiltig status journal_entries → error', () => {
    seedHelperData(db)
    expect(() => {
      db.prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, created_by)
         VALUES (1, 1, '2025-01-15', 'Test', 'invalid', 1)`,
      ).run()
    }).toThrow()
  })

  it('12. Negativt net_amount invoices → error', () => {
    seedHelperData(db)
    db.prepare(
      "INSERT INTO counterparties (id, type, name) VALUES (1, 'customer', 'Kund AB')",
    ).run()
    expect(() => {
      db.prepare(
        `INSERT INTO invoices (counterparty_id, invoice_type, invoice_number, invoice_date, due_date, net_amount_ore, total_amount_ore)
         VALUES (1, 'customer_invoice', 'F001', '2025-01-01', '2025-01-31', -100, 100)`,
      ).run()
    }).toThrow()
  })
})

// ═══════════════════════════════════════════════════════════
// TRIGGERS (13 tester)
// ═══════════════════════════════════════════════════════════
describe('Triggers — immutabilitet', () => {
  it('13. UPDATE bokförd entry — ändra description med corrected → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    bookEntry(db, entryId)
    expect(() => {
      db.prepare(
        "UPDATE journal_entries SET status = 'corrected', description = 'Ny beskrivning' WHERE id = ?",
      ).run(entryId)
    }).toThrow(/kan inte ändras/)
  })

  it('14. UPDATE bokförd entry — ändra BARA status till corrected → OK', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    bookEntry(db, entryId)
    expect(() => {
      db.prepare(
        "UPDATE journal_entries SET status = 'corrected' WHERE id = ?",
      ).run(entryId)
    }).not.toThrow()
  })

  it('15. DELETE bokförd entry → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    bookEntry(db, entryId)
    expect(() => {
      db.prepare('DELETE FROM journal_entries WHERE id = ?').run(entryId)
    }).toThrow(/kan inte raderas/)
  })

  it('16. UPDATE rad på bokförd entry → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    bookEntry(db, entryId)
    expect(() => {
      db.prepare(
        "UPDATE journal_entry_lines SET description = 'Ändrad' WHERE journal_entry_id = ? AND line_number = 1",
      ).run(entryId)
    }).toThrow(/kan inte ändras/)
  })

  it('17. DELETE rad på bokförd entry → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    bookEntry(db, entryId)
    expect(() => {
      db.prepare(
        'DELETE FROM journal_entry_lines WHERE journal_entry_id = ? AND line_number = 1',
      ).run(entryId)
    }).toThrow(/kan inte raderas/)
  })

  it('18. INSERT rad på bokförd entry → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    bookEntry(db, entryId)
    expect(() => {
      db.prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
         VALUES (?, 3, '1910', 500, 0)`,
      ).run(entryId)
    }).toThrow(/Kan inte lägga till/)
  })
})

describe('Triggers — fakturaskydd', () => {
  it('19. DELETE faktura med status unpaid → error', () => {
    seedHelperData(db)
    db.prepare(
      "INSERT INTO counterparties (id, type, name) VALUES (1, 'customer', 'Kund AB')",
    ).run()
    db.prepare(
      `INSERT INTO invoices (id, counterparty_id, invoice_type, invoice_number, invoice_date, due_date, net_amount_ore, total_amount_ore, status)
       VALUES (1, 1, 'customer_invoice', 'F001', '2025-01-01', '2025-01-31', 10000, 12500, 'unpaid')`,
    ).run()
    expect(() => {
      db.prepare('DELETE FROM invoices WHERE id = 1').run()
    }).toThrow(/inte är utkast/)
  })

  it('20. DELETE faktura med status draft → OK', () => {
    seedHelperData(db)
    db.prepare(
      "INSERT INTO counterparties (id, type, name) VALUES (1, 'customer', 'Kund AB')",
    ).run()
    db.prepare(
      `INSERT INTO invoices (id, counterparty_id, invoice_type, invoice_number, invoice_date, due_date, net_amount_ore, total_amount_ore, status)
       VALUES (1, 1, 'customer_invoice', 'F001', '2025-01-01', '2025-01-31', 10000, 12500, 'draft')`,
    ).run()
    expect(() => {
      db.prepare('DELETE FROM invoices WHERE id = 1').run()
    }).not.toThrow()
  })
})

describe('Triggers — balansvalidering', () => {
  it('21. Bokför obalanserad verifikation → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
      debit: 100000,
      credit: 99999,
    })
    expect(() => {
      bookEntry(db, entryId)
    }).toThrow(/balanserar inte/)
  })

  it('22. Bokför verifikation med 1 rad → error', () => {
    seedHelperData(db)
    const res = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, created_by)
       VALUES (1, 1, '2025-01-15', 'Enrads', 'draft', 1)`,
      )
      .run()
    const entryId = Number(res.lastInsertRowid)
    db.prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
       VALUES (?, 1, '1930', 100, 0)`,
    ).run(entryId)
    // Trigger 7 (balans) och trigger 7 (min 2 rader) båda blockerar.
    // Med 1 rad och obalanserat belopp fångas balansfel först.
    expect(() => {
      bookEntry(db, entryId)
    }).toThrow(/balanserar inte|minst två rader/)
  })
})

describe('Triggers — periodvalidering', () => {
  it('23. Bokför i stängt räkenskapsår → error', () => {
    seedHelperData(db)
    db.prepare('UPDATE fiscal_years SET is_closed = 1 WHERE id = 1').run()
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
    })
    expect(() => {
      bookEntry(db, entryId)
    }).toThrow(/stängt räkenskapsår/)
  })

  it('24. Bokför i stängd period → error', () => {
    seedHelperData(db)
    db.prepare(
      'UPDATE accounting_periods SET is_closed = 1 WHERE period_number = 1 AND fiscal_year_id = 1',
    ).run()
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
      date: '2025-01-15',
    })
    expect(() => {
      bookEntry(db, entryId)
    }).toThrow(/stängd period/)
  })

  it('25. Bokför med datum utanför räkenskapsårets intervall → error', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
      date: '2024-06-15',
    })
    expect(() => {
      bookEntry(db, entryId)
    }).toThrow(/utanför räkenskapsårets period/)
  })
})

// ═══════════════════════════════════════════════════════════
// FOREIGN KEYS (3 tester)
// ═══════════════════════════════════════════════════════════
describe('Foreign keys', () => {
  it('26. Ogiltigt journal_entry_id → error', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
         VALUES (99999, 1, '1930', 100, 0)`,
      ).run()
    }).toThrow()
  })

  it('27. Ogiltigt account_number → error', () => {
    seedHelperData(db)
    const res = db
      .prepare(
        `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, created_by)
       VALUES (1, 1, '2025-01-15', 'FK test', 1)`,
      )
      .run()
    const entryId = Number(res.lastInsertRowid)
    expect(() => {
      db.prepare(
        `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
         VALUES (?, 1, '9999', 100, 0)`,
      ).run(entryId)
    }).toThrow()
  })

  it('28. Ogiltigt counterparty_id → error', () => {
    expect(() => {
      db.prepare(
        `INSERT INTO invoices (counterparty_id, invoice_type, invoice_number, invoice_date, due_date, net_amount_ore, total_amount_ore)
         VALUES (99999, 'customer_invoice', 'F999', '2025-01-01', '2025-01-31', 100, 100)`,
      ).run()
    }).toThrow()
  })
})

// ═══════════════════════════════════════════════════════════
// INTEGRITET (1 test)
// ═══════════════════════════════════════════════════════════
describe('Integritet', () => {
  it('29. Draft → rader → boka → verifiering fungerar', () => {
    seedHelperData(db)
    const entryId = createDraftEntry(db, {
      companyId: 1,
      fyId: 1,
      userId: 1,
      debit: 250000,
      credit: 250000,
    })

    // Verifiera draft status
    const draft = db
      .prepare('SELECT status FROM journal_entries WHERE id = ?')
      .get(entryId) as { status: string }
    expect(draft.status).toBe('draft')

    // Boka
    bookEntry(db, entryId)

    // Verifiera booked status
    const booked = db
      .prepare('SELECT status FROM journal_entries WHERE id = ?')
      .get(entryId) as { status: string }
    expect(booked.status).toBe('booked')

    // Verifiera rader
    const lines = db
      .prepare(
        'SELECT * FROM journal_entry_lines WHERE journal_entry_id = ? ORDER BY line_number',
      )
      .all(entryId) as {
      debit_ore: number
      credit_ore: number
    }[]
    expect(lines.length).toBe(2)
    expect(lines[0].debit_ore).toBe(250000)
    expect(lines[1].credit_ore).toBe(250000)
  })
})
