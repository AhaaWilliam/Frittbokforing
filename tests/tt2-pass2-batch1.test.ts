/**
 * TT-2 Pass 2 Batch 1 — invariant-tester för 10 M-principer.
 *
 * Mix av runtime-tester (M92, M110/M111, M121, M123, M127) och statiska
 * code-review-tester (M102, M122, M128, M129, M132).
 *
 * Var och en kommenterad med vilken princip den skyddar.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import {
  saveDraft,
  finalizeDraft,
  payInvoice,
} from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
  payExpense,
} from '../src/main/services/expense-service'

function ok<T>(
  r:
    | { success: true; data: T }
    | { success: false; error: string; code?: string },
): T {
  if (!r.success) throw new Error(`${r.code}: ${r.error}`)
  return r.data
}

function seedCompany(type: 'customer' | 'supplier' = 'customer') {
  const db = createTestDb()
  ok(
    createCompany(db, {
      name: 'Test AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2',
      share_capital: 2_500_000,
      registration_date: '2025-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    }),
  )
  const companyId = (
    db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }
  ).id
  const fyId = (
    db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
  ).id
  const cp = ok(
    createCounterparty(db, { company_id: companyId, name: 'Part AB', type }),
  )
  return { db, companyId, fyId, cpId: cp.id }
}

const SRC = path.join(process.cwd(), 'src')

function* walkTs(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) yield* walkTs(full)
    else if (
      entry.endsWith('.ts') ||
      entry.endsWith('.tsx')
    )
      yield full
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// M92 — quantity × unit_price_ore = line_total_ore (ingen /100-division)
// ─────────────────────────────────────────────────────────────────────────────

describe('M92 — quantity × unit_price_ore = line_total_ore', () => {
  it('expense_lines.line_total_ore = quantity * unit_price_ore (ingen /100-bug)', () => {
    const { db, fyId, cpId } = seedCompany('supplier')
    const exp = ok(
      saveExpenseDraft(db, {
        fiscal_year_id: fyId,
        counterparty_id: cpId,
        expense_date: '2026-02-01',
        due_date: '2026-03-01',
        description: 'Test',
        lines: [
          {
            description: 'X',
            quantity: 3,
            unit_price_ore: 12500, // 125 kr
            vat_code_id: 4,
            sort_order: 0,
            account_number: '6110',
          },
        ],
      }),
    )
    const row = db
      .prepare(
        'SELECT quantity, unit_price_ore, line_total_ore FROM expense_lines WHERE expense_id = ?',
      )
      .get(exp.id) as {
      quantity: number
      unit_price_ore: number
      line_total_ore: number
    }
    expect(row.line_total_ore).toBe(row.quantity * row.unit_price_ore)
    expect(row.line_total_ore).toBe(37500)
  })

  it('invoice_lines: samma formel (qty × unit_price_ore)', () => {
    const { db, fyId, cpId } = seedCompany('customer')
    const inv = ok(
      saveDraft(db, {
        fiscal_year_id: fyId,
        counterparty_id: cpId,
        invoice_date: '2026-02-01',
        due_date: '2026-03-01',
        lines: [
          {
            product_id: null,
            description: 'X',
            quantity: 2,
            unit_price_ore: 25000,
            vat_code_id: 4,
            sort_order: 0,
            account_number: '3001',
          },
        ],
      }),
    )
    const row = db
      .prepare(
        'SELECT quantity, unit_price_ore, line_total_ore FROM invoice_lines WHERE invoice_id = ?',
      )
      .get(inv.id) as {
      quantity: number
      unit_price_ore: number
      line_total_ore: number
    }
    // F44: line_total via heltalsaritmetik. För integer qty är detta = qty*unit_price_ore.
    expect(row.line_total_ore).toBe(50000)
    expect(row.line_total_ore).toBe(row.quantity * row.unit_price_ore)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// M102 — ref-baserad isDirty + memoizerade rad-callbacks
// ─────────────────────────────────────────────────────────────────────────────

describe('M102 — useEntityForm: isDirty är ref-baserad', () => {
  it('useEntityForm använder useRef för dirty-tracking, ingen JSON.stringify', () => {
    const file = path.join(SRC, 'renderer/lib/use-entity-form.ts')
    const content = readFileSync(file, 'utf8')
    expect(content).toMatch(/useRef\s*\(\s*false\s*\)/)
    expect(content).toMatch(/dirtyRef\.current\s*=\s*true/)
    expect(content).toMatch(/dirtyRef\.current\s*=\s*false/)
    // Ingen JSON.stringify-baserad jämförelse
    expect(content).not.toMatch(/JSON\.stringify\([^)]*formData/)
  })

  it('rad-komponenter använder React.memo (InvoiceLineRow + ExpenseLineRow)', () => {
    const inv = readFileSync(
      path.join(SRC, 'renderer/components/invoices/InvoiceLineRow.tsx'),
      'utf8',
    )
    const exp = readFileSync(
      path.join(SRC, 'renderer/components/expenses/ExpenseLineRow.tsx'),
      'utf8',
    )
    expect(inv).toMatch(/\bmemo\s*\(/)
    expect(exp).toMatch(/\bmemo\s*\(/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// M110/M111 — bank-fee storage + journal mapping
// ─────────────────────────────────────────────────────────────────────────────

describe('M110/M111 — bank-fee bokförs på 6570, paid_amount oförändrad', () => {
  it('invoice payment med bank-fee: D bank (belopp-fee), D 6570 (fee), K 1510 (fullt)', () => {
    const { db, fyId, cpId } = seedCompany('customer')
    const inv = ok(
      saveDraft(db, {
        fiscal_year_id: fyId,
        counterparty_id: cpId,
        invoice_date: '2026-02-01',
        due_date: '2026-03-01',
        lines: [
          {
            product_id: null,
            description: 'P',
            quantity: 1,
            unit_price_ore: 100000,
            vat_code_id: 4,
            sort_order: 0,
            account_number: '3001',
          },
        ],
      }),
    )
    ok(finalizeDraft(db, inv.id))
    const total = (
      db
        .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
        .get(inv.id) as { total_amount_ore: number }
    ).total_amount_ore

    const FEE = 1500
    ok(
      payInvoice(db, {
        invoice_id: inv.id,
        amount_ore: total,
        payment_date: '2026-02-15',
        payment_method: 'bank',
        account_number: '1930',
        bank_fee_ore: FEE,
      }),
    )

    // M110: paid_amount = total (fee påverkar INTE paid_amount)
    const invRow = db
      .prepare(
        'SELECT paid_amount_ore, total_amount_ore FROM invoices WHERE id = ?',
      )
      .get(inv.id) as { paid_amount_ore: number; total_amount_ore: number }
    expect(invRow.paid_amount_ore).toBe(invRow.total_amount_ore)

    // M110: payment har bank_fee_ore + bank_fee_account
    const pay = db
      .prepare(
        'SELECT bank_fee_ore, bank_fee_account FROM invoice_payments WHERE invoice_id = ?',
      )
      .get(inv.id) as { bank_fee_ore: number; bank_fee_account: string }
    expect(pay.bank_fee_ore).toBe(FEE)
    expect(pay.bank_fee_account).toBe('6570')

    // M111: journal-rader — D 6570 = FEE, D 1930 = total - FEE, K 1510 = total
    const jeId = (
      db
        .prepare(
          'SELECT journal_entry_id FROM invoice_payments WHERE invoice_id = ?',
        )
        .get(inv.id) as { journal_entry_id: number }
    ).journal_entry_id
    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ?',
      )
      .all(jeId) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>

    const fee = lines.find((l) => l.account_number === '6570')
    const bank = lines.find((l) => l.account_number === '1930')
    const ar = lines.find((l) => l.account_number === '1510')
    expect(fee?.debit_ore).toBe(FEE)
    expect(bank?.debit_ore).toBe(total - FEE)
    expect(ar?.credit_ore).toBe(total)
  })

  it('expense payment med bank-fee: D 2440 (fullt), D 6570 (fee), K bank (belopp+fee)', () => {
    const { db, fyId, cpId } = seedCompany('supplier')
    const exp = ok(
      saveExpenseDraft(db, {
        fiscal_year_id: fyId,
        counterparty_id: cpId,
        expense_date: '2026-02-01',
        due_date: '2026-03-01',
        description: 'Mat',
        lines: [
          {
            description: 'Mat',
            quantity: 1,
            unit_price_ore: 50000,
            vat_code_id: 4,
            sort_order: 0,
            account_number: '6110',
          },
        ],
      }),
    )
    ok(finalizeExpense(db, exp.id))
    const total = (
      db
        .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
        .get(exp.id) as { total_amount_ore: number }
    ).total_amount_ore

    const FEE = 800
    ok(
      payExpense(db, {
        expense_id: exp.id,
        amount_ore: total,
        payment_date: '2026-02-15',
        payment_method: 'bank',
        account_number: '1930',
        bank_fee_ore: FEE,
      }),
    )

    const expRow = db
      .prepare(
        'SELECT paid_amount_ore, total_amount_ore FROM expenses WHERE id = ?',
      )
      .get(exp.id) as { paid_amount_ore: number; total_amount_ore: number }
    // Fee påverkar INTE paid_amount
    expect(expRow.paid_amount_ore).toBe(expRow.total_amount_ore)

    const jeId = (
      db
        .prepare(
          'SELECT journal_entry_id FROM expense_payments WHERE expense_id = ?',
        )
        .get(exp.id) as { journal_entry_id: number }
    ).journal_entry_id
    const lines = db
      .prepare(
        'SELECT account_number, debit_ore, credit_ore FROM journal_entry_lines WHERE journal_entry_id = ?',
      )
      .all(jeId) as Array<{
      account_number: string
      debit_ore: number
      credit_ore: number
    }>
    const fee = lines.find((l) => l.account_number === '6570')
    const bank = lines.find((l) => l.account_number === '1930')
    const ap = lines.find((l) => l.account_number === '2440')
    expect(fee?.debit_ore).toBe(FEE)
    expect(bank?.credit_ore).toBe(total + FEE)
    expect(ap?.debit_ore).toBe(total)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// M121 — table-recreate bevarar inte triggers (verifiera trigger-survival)
// ─────────────────────────────────────────────────────────────────────────────

describe('M121 — kritiska triggers överlever alla migrationer', () => {
  it('immutability- och balance-triggers finns efter full migrations-run', () => {
    const db = createTestDb()
    const triggers = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger'")
      .all() as Array<{ name: string }>
    const names = new Set(triggers.map((t) => t.name))
    // Klassiska triggers som kunde tappats vid table-recreate
    for (const required of [
      'trg_immutable_booked_entry_update',
      'trg_immutable_booked_entry_delete',
      'trg_immutable_booked_line_update',
      'trg_immutable_booked_line_delete',
      'trg_immutable_booked_line_insert',
      'trg_check_balance_on_booking',
    ]) {
      expect(names.has(required), `saknar trigger ${required}`).toBe(true)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// M122 — table-recreate inkommande FK-mönster
// ─────────────────────────────────────────────────────────────────────────────

describe('M122 — table-recreate FK-helper FK_OFF_MIGRATION_INDEXES', () => {
  it('foreign_keys är ON efter slutförda migrationer (PRAGMA-state är konsekvent)', () => {
    const db = createTestDb()
    const fk = db.pragma('foreign_keys', { simple: true }) as number
    expect(fk).toBe(1)
  })

  it('foreign_key_check är tom efter alla migrationer (defense-in-depth)', () => {
    const db = createTestDb()
    const violations = db.pragma('foreign_key_check') as unknown[]
    expect(violations).toEqual([])
  })

  it('FK_OFF_MIGRATION_INDEXES är icke-tom (M122 används aktivt)', () => {
    // Importeras för att verifiera att helpern faktiskt deklarerar några
    // recreate-migrationer — om setet töms av misstag försvinner skyddet
    const helper = readFileSync(
      path.join(process.cwd(), 'tests/helpers/create-test-db.ts'),
      'utf8',
    )
    const m = helper.match(/new Set\(\[([^\]]+)\]\)/)
    expect(m).not.toBeNull()
    if (!m) return
    const items = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    expect(items.length).toBeGreaterThan(3)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// M123 — invoice_lines.account_number NULL för produktrader
// ─────────────────────────────────────────────────────────────────────────────

describe('M123 — invoice_lines.account_number NULL by design', () => {
  it('kolumnen är NOT NULL-fri på schema-nivå (NOT NULL-constraint får aldrig läggas)', () => {
    const db = createTestDb()
    const cols = db.pragma('table_info(invoice_lines)') as Array<{
      name: string
      notnull: number
    }>
    const col = cols.find((c) => c.name === 'account_number')
    expect(col, 'invoice_lines.account_number saknas').toBeDefined()
    expect(
      col!.notnull,
      'M123: account_number får inte vara NOT NULL',
    ).toBe(0)
  })

  it('finalize-trigger blockerar freeform-rader utan konto', () => {
    const db = createTestDb()
    const triggers = db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE type='trigger' AND name LIKE '%account_number_on_finalize%'",
      )
      .all() as Array<{ name: string; sql: string }>
    expect(triggers.length).toBeGreaterThan(0)
    // Triggern måste filtrera på product_id IS NULL (annars blockerar
    // den produktrader felaktigt — exakt buggen M123 förbjuder)
    const sql = triggers.map((t) => t.sql).join('\n')
    expect(sql).toMatch(/product_id\s+IS\s+NULL/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// M127 — ADD COLUMN constraint limits (statisk kontroll)
// ─────────────────────────────────────────────────────────────────────────────

describe('M127 — ADD COLUMN inga non-constant DEFAULT', () => {
  it('inga ALTER TABLE ADD COLUMN ... DEFAULT (datetime|CURRENT_TIMESTAMP|...) i migrationer', () => {
    const file = path.join(SRC, 'main/migrations.ts')
    const content = readFileSync(file, 'utf8')
    // Splitta på rader, sök efter "ADD COLUMN ... DEFAULT (datetime" på samma rad
    // eller "DEFAULT CURRENT_TIMESTAMP" i ADD COLUMN-kontext.
    const lines = content.split('\n')
    const violations: Array<{ line: number; text: string }> = []
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i]
      if (!/ADD\s+COLUMN/i.test(ln)) continue
      // Tillåt DEFAULT på konstanter (siffror, strängar, NULL).
      // Förbjud non-constant: datetime(...), CURRENT_TIMESTAMP, CURRENT_DATE,
      // CURRENT_TIME.
      if (
        /DEFAULT\s*\(\s*datetime\s*\(/i.test(ln) ||
        /DEFAULT\s+CURRENT_(TIMESTAMP|DATE|TIME)/i.test(ln)
      ) {
        violations.push({ line: i + 1, text: ln.trim() })
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `M127 violations:\n${violations
          .map((v) => `  migrations.ts:${v.line}: ${v.text}`)
          .join('\n')}`,
      )
    }
    expect(violations).toEqual([])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// M128 — handler error-pattern (ingen generisk TRANSACTION_ERROR-catch)
// ─────────────────────────────────────────────────────────────────────────────

describe('M128 — IPC-handlers: ingen kollaps till TRANSACTION_ERROR', () => {
  it('inga catch-block i src/main/ipc kastar/returnerar generisk TRANSACTION_ERROR', () => {
    const ipcDir = path.join(SRC, 'main/ipc')
    const violations: Array<{ file: string; line: number; text: string }> = []
    for (const file of walkTs(ipcDir)) {
      const content = readFileSync(file, 'utf8')
      const lines = content.split('\n')
      for (let i = 0; i < lines.length; i++) {
        const ln = lines[i]
        if (!/TRANSACTION_ERROR/.test(ln)) continue
        // Skippa kommentarer
        if (/^\s*(\*|\/\/|\/\*)/.test(ln)) continue
        violations.push({
          file: path.relative(process.cwd(), file),
          line: i + 1,
          text: ln.trim(),
        })
      }
    }
    if (violations.length > 0) {
      throw new Error(
        `M128 violations (TRANSACTION_ERROR i ipc-lager):\n${violations
          .map((v) => `  ${v.file}:${v.line}: ${v.text}`)
          .join('\n')}`,
      )
    }
    expect(violations).toEqual([])
  })

  it('wrapIpcHandler finns och hanterar zod-validering + strukturerade fel', () => {
    const file = path.join(SRC, 'main/ipc/wrap-ipc-handler.ts')
    const content = readFileSync(file, 'utf8')
    expect(content).toMatch(/isStructuredError/)
    expect(content).toMatch(/VALIDATION_ERROR/)
    expect(content).toMatch(/UNEXPECTED_ERROR/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// M129 — form-totals som separerad komponent
// ─────────────────────────────────────────────────────────────────────────────

describe('M129 — InvoiceTotals + ExpenseTotals är separerade komponenter', () => {
  it('båda totals-komponenter finns som egna filer', () => {
    const inv = path.join(
      SRC,
      'renderer/components/invoices/InvoiceTotals.tsx',
    )
    const exp = path.join(
      SRC,
      'renderer/components/expenses/ExpenseTotals.tsx',
    )
    expect(statSync(inv).isFile()).toBe(true)
    expect(statSync(exp).isFile()).toBe(true)
  })

  it('formulären importerar Totals-komponenterna istället för inline-beräkning', () => {
    const invForm = readFileSync(
      path.join(SRC, 'renderer/components/invoices/InvoiceForm.tsx'),
      'utf8',
    )
    const expForm = readFileSync(
      path.join(SRC, 'renderer/components/expenses/ExpenseForm.tsx'),
      'utf8',
    )
    expect(invForm).toMatch(/InvoiceTotals/)
    expect(expForm).toMatch(/ExpenseTotals/)
  })

  it('båda Totals-komponenter använder multiplyKrToOre (M131)', () => {
    const inv = readFileSync(
      path.join(SRC, 'renderer/components/invoices/InvoiceTotals.tsx'),
      'utf8',
    )
    const exp = readFileSync(
      path.join(SRC, 'renderer/components/expenses/ExpenseTotals.tsx'),
      'utf8',
    )
    expect(inv).toMatch(/multiplyKrToOre|multiplyDecimalByOre/)
    expect(exp).toMatch(/multiplyKrToOre|multiplyDecimalByOre/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// M132 — cross-schema-gränser i shared constants
// ─────────────────────────────────────────────────────────────────────────────

describe('M132 — MAX_QTY-gränser delas via src/shared/constants.ts', () => {
  it('konstanter finns i shared/constants.ts', async () => {
    const m = await import('../src/shared/constants')
    expect(typeof m.MAX_QTY_INVOICE).toBe('number')
    expect(typeof m.MAX_QTY_EXPENSE).toBe('number')
    expect(typeof m.ERR_MSG_MAX_QTY_INVOICE).toBe('string')
    expect(typeof m.ERR_MSG_MAX_QTY_EXPENSE).toBe('string')
  })

  it('både ipc-schemas och form-schemas importerar från shared/constants', () => {
    const ipc = readFileSync(
      path.join(SRC, 'shared/ipc-schemas.ts'),
      'utf8',
    )
    const invForm = readFileSync(
      path.join(SRC, 'renderer/lib/form-schemas/invoice.ts'),
      'utf8',
    )
    const expForm = readFileSync(
      path.join(SRC, 'renderer/lib/form-schemas/expense.ts'),
      'utf8',
    )
    // ipc-schemas är i shared/ → './constants'; renderer-form-schemas är
    // djupare → '../../../shared/constants'. Matcha bara att path slutar
    // med '/constants' eller './constants'.
    expect(ipc).toMatch(/from\s+['"][^'"]*constants['"]/)
    expect(invForm).toMatch(/from\s+['"][^'"]*\/shared\/constants['"]/)
    expect(expForm).toMatch(/from\s+['"][^'"]*\/shared\/constants['"]/)
    // Och de använder konstanterna, inte hårdkodade magic numbers
    expect(ipc).toMatch(/MAX_QTY_(INVOICE|EXPENSE)/)
    expect(invForm).toMatch(/MAX_QTY_INVOICE/)
    expect(expForm).toMatch(/MAX_QTY_EXPENSE/)
  })

  it('inga hårdkodade 9999.99 / 9999 magic numbers i form- eller ipc-schemas', () => {
    const files = [
      'shared/ipc-schemas.ts',
      'renderer/lib/form-schemas/invoice.ts',
      'renderer/lib/form-schemas/expense.ts',
    ]
    for (const rel of files) {
      const content = readFileSync(path.join(SRC, rel), 'utf8')
      // Filtrera kommentarer
      const code = content
        .split('\n')
        .filter((l) => !/^\s*(\*|\/\/)/.test(l))
        .join('\n')
      expect(code, `${rel}: hårdkodat 9999.99`).not.toMatch(/9999\.99/)
      // För 9999 — tillåt om inom test/exempel-strängar; här ska den inte
      // vara en magic-number i en .max(...)-call
      expect(code, `${rel}: hårdkodat 9999 i max()`).not.toMatch(
        /\.max\s*\(\s*9999\b/,
      )
    }
  })
})
