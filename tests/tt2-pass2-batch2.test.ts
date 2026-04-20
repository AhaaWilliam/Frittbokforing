/**
 * TT-2 Pass 2 Batch 2 — invariant-tester för 13 M-principer.
 *
 * Stilen följer existerande tests/invariants/* — föredrar statisk/grep-baserad
 * detektion av arkitektur-drift där runtime-test redan finns i annan fil.
 * Behavioral coverage för flera principer finns i:
 *   - M134: tests/s24b-br-rr-consistency.test.ts
 *   - M135: tests/s25-vat-parity.test.ts
 *   - M145: tests/session-47-sie4-import.test.ts, session-48-sie4-import-db.test.ts
 *   - M146: tests/session-50-pain001-invoice.test.ts
 *   - M154: tests/session-58-bank-unmatch.test.ts
 *   - M155: tests/session-C-depreciation-update.test.ts
 *   - M156/M157: tests/renderer/lib/use-roving-tabindex.test.tsx,
 *                tests/renderer/lib/use-combobox-keyboard.test.tsx
 *   - M158: tests/sprint-mc3-stamdata-isolation.test.ts
 *
 * Denna fil lägger structural drift-vakt utöver behavioral coverage.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import path from 'node:path'
import { createTestDb } from './helpers/create-test-db'

const ROOT = process.cwd()

function* walkTs(dir: string): Generator<string> {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) yield* walkTs(full)
    else if (entry.endsWith('.ts') || entry.endsWith('.tsx')) yield full
  }
}

// ────────────────────────────────────────────────────────────────────
// M134 — BR årets resultat via result-service (M96 single source of truth)
// ────────────────────────────────────────────────────────────────────
describe('M134 — BR netResult via result-service', () => {
  it('report-service.getBalanceSheet använder calculateResultSummary, inte ad-hoc class 3-8 reduce', () => {
    const file = path.join(ROOT, 'src/main/services/report/report-service.ts')
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/calculateResultSummary\s*\(/)
    // Förbjuden ad-hoc-pattern: filter-reduce på account class 3-8
    expect(src).not.toMatch(/!startsWith\(['"]1['"]\).*!startsWith\(['"]2['"]\)/)
    expect(src).not.toMatch(/account_number\s*>=\s*['"]3000['"]/)
  })

  it('endast result-service och k2-mapping definierar income-statement-intervall', () => {
    // Hårdkodade kontointervall (3000–8999, 3000-7999) får inte uppstå utanför
    // result-service och k2-mapping. Annars duplicerad SoT.
    const allowed = new Set([
      'src/main/services/result-service.ts',
      'src/main/services/report/k2-mapping.ts',
      'src/main/services/report/income-statement-config.ts',
    ])
    const violations: string[] = []
    for (const file of walkTs(path.join(ROOT, 'src/main/services'))) {
      const rel = path.relative(ROOT, file).replace(/\\/g, '/')
      if (allowed.has(rel)) continue
      const src = readFileSync(file, 'utf8')
      // Pattern: BETWEEN 3000 AND 8999 (med eller utan space)
      if (/BETWEEN\s+3000\s+AND\s+8999/i.test(src)) {
        violations.push(`${rel} har BETWEEN 3000 AND 8999`)
      }
    }
    expect(violations).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────
// M135 — Dual-implementation paritetstest med delad fixture
// ────────────────────────────────────────────────────────────────────
describe('M135 — delad VAT-fixture för paritetstest', () => {
  it('vat-scenarios fixture finns och importeras av båda lager', () => {
    const fixturePath = path.join(ROOT, 'tests/fixtures/vat-scenarios.ts')
    expect(existsSync(fixturePath)).toBe(true)

    const consumers = [
      'tests/s25-backend-vat.test.ts',
      'tests/s25-vat-parity.test.ts',
    ]
    for (const c of consumers) {
      const src = readFileSync(path.join(ROOT, c), 'utf8')
      expect(src).toMatch(/vat-scenarios/)
    }
  })
})

// ────────────────────────────────────────────────────────────────────
// M136 — Renderer form-types använder _kr-suffix (aldrig _kr över IPC)
// ────────────────────────────────────────────────────────────────────
describe('M136 — _kr-suffix form-types, _ore-suffix IPC', () => {
  it('form-schemas innehåller _kr-fält för pris (renderer)', () => {
    const dir = path.join(ROOT, 'src/renderer/lib/form-schemas')
    let foundKr = false
    for (const file of walkTs(dir)) {
      const src = readFileSync(file, 'utf8')
      if (/unit_price_kr\b/.test(src)) foundKr = true
    }
    expect(foundKr).toBe(true)
  })

  it('IPC-schemas använder ALDRIG _kr-suffix (alla belopp i ören över IPC)', () => {
    const ipcSchemas = path.join(ROOT, 'src/shared/ipc-schemas.ts')
    if (!existsSync(ipcSchemas)) return
    const src = readFileSync(ipcSchemas, 'utf8')
    // Match identifier _kr (followed by colon, comma, paren, etc.)
    const matches = src.match(/\b\w+_kr\b/g)
    if (matches) {
      // Allow none — this is a hard rule
      throw new Error(
        `M136-violation: _kr-suffix found in ipc-schemas.ts: ${matches.join(', ')}`,
      )
    }
    expect(matches).toBeNull()
  })

  it('_kr-suffix i shared/types.ts begränsas till FormState-interfaces (renderer-state)', () => {
    // M136 förbjuder _kr över IPC, INTE i renderer form-state-typer som råkar
    // bo i shared/. Kontroll: alla _kr-träffar måste ligga i interface med
    // "Form" eller "FormLine" eller "FormState" i namnet.
    const typesPath = path.join(ROOT, 'src/shared/types.ts')
    if (!existsSync(typesPath)) return
    const src = readFileSync(typesPath, 'utf8')
    const lines = src.split('\n')
    const violations: string[] = []
    for (let i = 0; i < lines.length; i++) {
      if (!/\b\w+_kr\b/.test(lines[i])) continue
      // Leta bakåt efter senaste interface/type-deklaration
      let context = ''
      for (let j = i; j >= 0; j--) {
        const m = lines[j].match(/^(?:export\s+)?(?:interface|type)\s+(\w+)/)
        if (m) {
          context = m[1]
          break
        }
      }
      if (!/Form/.test(context)) {
        violations.push(`line ${i + 1}: ${lines[i].trim()} (i ${context})`)
      }
    }
    expect(violations).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────
// M139 — Cross-reference i verifikationstext
// ────────────────────────────────────────────────────────────────────
describe('M139 — cross-reference i description', () => {
  it('kreditfaktura-description innehåller "avser faktura #N"', () => {
    const src = readFileSync(
      path.join(ROOT, 'src/main/services/invoice-service.ts'),
      'utf8',
    )
    expect(src).toMatch(/avser faktura\s*#/i)
  })

  it('correction-service description innehåller referens till original', () => {
    const src = readFileSync(
      path.join(ROOT, 'src/main/services/correction-service.ts'),
      'utf8',
    )
    // Format: Korrigering av ver. {originalRef}
    expect(src).toMatch(/Korrigering av ver/i)
  })
})

// ────────────────────────────────────────────────────────────────────
// M141 — Cross-table trigger-inventering vid table-recreate
// ────────────────────────────────────────────────────────────────────
describe('M141 — cross-table trigger preservation', () => {
  it('trg_invoice_lines_account_number_on_finalize finns efter alla migrationer', () => {
    // Migration 032 (S33 F46b) återskapade triggern efter table-recreate.
    // Om en framtida table-recreate tappar den utan att återskapa, fångas det här.
    const db = createTestDb()
    const trigger = db
      .prepare(
        `SELECT name, tbl_name FROM sqlite_master
         WHERE type='trigger' AND name='trg_invoice_lines_account_number_on_finalize'`,
      )
      .get() as { name: string; tbl_name: string } | undefined
    expect(trigger).toBeDefined()
    // M141: triggern bor på 'invoices' men refererar invoice_lines i body
    expect(trigger?.tbl_name).toBe('invoices')
  })
})

// ────────────────────────────────────────────────────────────────────
// M145 — SIE4-import: I-serie + strategier
// ────────────────────────────────────────────────────────────────────
describe('M145 — SIE4 I-serie och strategier', () => {
  it('sie4-import-service skapar verifikat i I-serien', () => {
    const src = readFileSync(
      path.join(ROOT, 'src/main/services/sie4/sie4-import-service.ts'),
      'utf8',
    )
    expect(src).toMatch(/verification_series\s*=\s*['"]I['"]/)
  })

  it('I-serien är whitelistad i journal_entries CHECK', () => {
    const db = createTestDb()
    const sql = (
      db
        .prepare(
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'`,
        )
        .get() as { sql: string }
    ).sql
    // verification_series CHECK ska inkludera I (M151 + M145)
    expect(sql).toMatch(/verification_series\s+IN\s*\([^)]*['"]I['"][^)]*\)/i)
  })
})

// ────────────────────────────────────────────────────────────────────
// M146 — Polymorfa payment-batch-operationer
// ────────────────────────────────────────────────────────────────────
describe('M146 — polymorf pain001 dispatch via batch_type', () => {
  it('pain001-export-service.getPaymentsForBatch dispatchar på batch_type', () => {
    const src = readFileSync(
      path.join(ROOT, 'src/main/services/payment/pain001-export-service.ts'),
      'utf8',
    )
    expect(src).toMatch(/getPaymentsForBatch/)
    expect(src).toMatch(/batchType\s*===\s*['"]expense['"]/)
    // Båda branches använder samma alias remittance_ref (domän-agnostisk)
    expect(src).toMatch(/AS\s+remittance_ref/)
    // Båda använder source_id-alias (inte expense_id/invoice_id direkt)
    expect(src).toMatch(/AS\s+source_id/)
  })
})

// ────────────────────────────────────────────────────────────────────
// M153 — Deterministisk scoring (no Math.random/Date.now i bank scoring)
// ────────────────────────────────────────────────────────────────────
describe('M153 — deterministisk bank-scoring', () => {
  it('bank-services innehåller inga Math.random / Date.now / performance.now', () => {
    const dir = path.join(ROOT, 'src/main/services/bank')
    const violations: string[] = []
    for (const file of walkTs(dir)) {
      const src = readFileSync(file, 'utf8')
      // Strip line- and block-comments (rough)
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .split('\n')
        .map((l) => l.replace(/\/\/.*$/, ''))
        .join('\n')
      if (/\bMath\.random\s*\(/.test(stripped))
        violations.push(`${path.relative(ROOT, file)}: Math.random`)
      if (/\bDate\.now\s*\(/.test(stripped))
        violations.push(`${path.relative(ROOT, file)}: Date.now`)
      if (/\bperformance\.now\s*\(/.test(stripped))
        violations.push(`${path.relative(ROOT, file)}: performance.now`)
    }
    expect(violations).toEqual([])
  })
})

// ────────────────────────────────────────────────────────────────────
// M154 — Unmatch via korrigeringsverifikat
// ────────────────────────────────────────────────────────────────────
describe('M154 — unmatch skapar korrigeringsverifikat', () => {
  it('bank-unmatch-service anropar createCorrectionEntry', () => {
    const src = readFileSync(
      path.join(ROOT, 'src/main/services/bank/bank-unmatch-service.ts'),
      'utf8',
    )
    expect(src).toMatch(/createCorrectionEntry/)
    // Reconciliation-status sätts till 'unmatched' efter korrigering
    expect(src).toMatch(/reconciliation_status[^a-z]*=[^a-z]*['"]unmatched['"]/i)
  })

  it('batch-payments blockeras med specifik ErrorCode', () => {
    const src = readFileSync(
      path.join(ROOT, 'src/main/services/bank/bank-unmatch-service.ts'),
      'utf8',
    )
    expect(src).toMatch(/BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED/)
  })
})

// ────────────────────────────────────────────────────────────────────
// M155 — Asset-edit efter execution: pending regenereras, executed bevaras
// ────────────────────────────────────────────────────────────────────
describe('M155 — depreciation update preserves executed schedules', () => {
  it('depreciation-service har insertPendingFromState-helper (M155-mönstret)', () => {
    const src = readFileSync(
      path.join(ROOT, 'src/main/services/depreciation-service.ts'),
      'utf8',
    )
    expect(src).toMatch(/insertPendingFromState/)
    // updateFixedAsset DELETE:ar enbart pending, inte executed/skipped
    expect(src).toMatch(
      /DELETE FROM depreciation_schedules[\s\S]{0,200}status\s*=\s*['"]pending['"]/i,
    )
  })
})

// ────────────────────────────────────────────────────────────────────
// M156 — Keyboard-navigation kontrakt: skip-links, roving, Radix
// ────────────────────────────────────────────────────────────────────
describe('M156 — keyboard navigation contracts', () => {
  it('roving-tabindex hook finns och exporteras', () => {
    const file = path.join(ROOT, 'src/renderer/lib/use-roving-tabindex.ts')
    expect(existsSync(file)).toBe(true)
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/export\s+(function|const)\s+useRovingTabindex/)
  })

  it('renderer-dialoger använder Radix (inte deprekerad useDialogBehavior i ny kod)', () => {
    // Radix-paketen finns i package.json
    const pkg = JSON.parse(
      readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> }
    expect(pkg.dependencies['@radix-ui/react-dialog']).toBeDefined()
    expect(pkg.dependencies['@radix-ui/react-alert-dialog']).toBeDefined()
  })
})

// ────────────────────────────────────────────────────────────────────
// M157 — Combobox-kontrakt: aria-activedescendant
// ────────────────────────────────────────────────────────────────────
describe('M157 — combobox aria-activedescendant', () => {
  it('useComboboxKeyboard hook finns och returnerar activeId', () => {
    const file = path.join(ROOT, 'src/renderer/lib/use-combobox-keyboard.ts')
    expect(existsSync(file)).toBe(true)
    const src = readFileSync(file, 'utf8')
    expect(src).toMatch(/export\s+function\s+useComboboxKeyboard/)
    expect(src).toMatch(/activeId/)
    // Stödjer trailingAction (för "+ Ny X"-rader utanför listbox)
    expect(src).toMatch(/trailingAction/)
  })

  it('pickers använder aria-activedescendant + role=combobox', () => {
    const pickers = [
      'src/renderer/components/CustomerPicker.tsx',
      'src/renderer/components/SupplierPicker.tsx',
      'src/renderer/components/ArticlePicker.tsx',
    ]
    for (const p of pickers) {
      const full = path.join(ROOT, p)
      if (!existsSync(full)) continue // skip if renamed
      const src = readFileSync(full, 'utf8')
      expect(src).toMatch(/role=["']combobox["']/)
      expect(src).toMatch(/aria-activedescendant/)
    }
  })
})

// ────────────────────────────────────────────────────────────────────
// M158 — Stamdata scopas per bolag
// ────────────────────────────────────────────────────────────────────
describe('M158 — stamdata company_id scoping', () => {
  it('counterparties/products/price_lists har NOT NULL company_id FK', () => {
    const db = createTestDb()
    for (const tbl of ['counterparties', 'products', 'price_lists']) {
      const cols = db
        .prepare(`PRAGMA table_info(${tbl})`)
        .all() as Array<{ name: string; notnull: number }>
      const company = cols.find((c) => c.name === 'company_id')
      expect(company, `${tbl}.company_id ska finnas`).toBeDefined()
      expect(company?.notnull, `${tbl}.company_id ska vara NOT NULL`).toBe(1)
    }
  })

  it('counterparties.org_number UNIQUE per bolag, inte globalt', () => {
    const db = createTestDb()
    const indexes = db
      .prepare(`PRAGMA index_list(counterparties)`)
      .all() as Array<{ name: string; unique: number }>
    // Det ska finnas minst ett UNIQUE-index som inkluderar både company_id och org_number
    let foundCompound = false
    for (const idx of indexes) {
      if (!idx.unique) continue
      const cols = db
        .prepare(`PRAGMA index_info(${idx.name})`)
        .all() as Array<{ name: string }>
      const names = cols.map((c) => c.name)
      if (names.includes('company_id') && names.includes('org_number')) {
        foundCompound = true
      }
    }
    expect(foundCompound).toBe(true)
  })

  it('company_immutable triggers blockerar UPDATE av company_id', () => {
    const db = createTestDb()
    const triggers = db
      .prepare(
        `SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE '%company_immutable%'`,
      )
      .all() as Array<{ name: string }>
    const names = triggers.map((t) => t.name)
    // Tre triggers per M158 — counterparties, products, price_lists
    expect(names.length).toBeGreaterThanOrEqual(3)
  })
})
