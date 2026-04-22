#!/usr/bin/env node
/**
 * M119-check (Fynd 7c).
 *
 * M119 kräver att INTEGER-kolumner i SQLite som representerar pengar i öre
 * har `_ore`-suffix. Heuristik-scan av migrations.ts + eventuella
 * sql-fragment — fångar nyintroducerade kolumner i ADD COLUMN / CREATE TABLE
 * vars namn innehåller pengar-relaterade tokens men saknar `_ore`.
 *
 * Tokens som indikerar monetär semantik: amount, price, fee, cost, balance,
 * total, sum, vat (som belopp).
 *
 * Escape hatch: `-- M119 exempt` eller `// M119 exempt` på samma rad.
 *
 * Self-test: --self-test validerar detektor-logiken.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { relative, resolve } from 'node:path'

const REPO_ROOT = resolve(process.cwd())

const MONEY_TOKENS = [
  'amount',
  'price',
  'fee',
  'balance',
  'total',
  // 'cost' är ibland inte ett belopp (ex. acquisition_cost_ore) — men i våra
  // tabeller är det alltid öre → inkludera.
  'cost',
]

// Exakta kolumnamnsmönster som är tokens men INTE monetära → undantag.
const TOKEN_NON_MONEY = new Set([
  'vat_amount_note', // hypothetic example; kept for future use
])

/**
 * @param {string} sourceText
 * @returns {Array<{ line: number; match: string; column: string }>}
 */
function scanText(sourceText) {
  const lines = sourceText.split('\n')
  /** @type {Array<{ line: number; match: string; column: string }>} */
  const violations = []

  // Pattern: identifier "INTEGER" där identifier har en av MONEY_TOKENS
  // (ord-gräns). Fångar både `foo_amount INTEGER` och `"foo_amount" INTEGER`.
  // Case-insensitive.
  // Vi scannar rad för rad.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.includes('M119 exempt')) continue

    // Enkel regex: hitta `<ident> INTEGER`
    const re = /([a-zA-Z_][a-zA-Z0-9_]*)\s+INTEGER\b/g
    let m
    while ((m = re.exec(line)) !== null) {
      const col = m[1]
      const lower = col.toLowerCase()
      // Skip om namnet redan slutar på _ore eller INT är suffix (sequence-id)
      if (lower.endsWith('_ore')) continue
      if (lower.endsWith('_id')) continue // FK, inte belopp
      if (lower === 'integer') continue
      if (TOKEN_NON_MONEY.has(lower)) continue
      // Skip om det är PRIMARY KEY ... INTEGER eller typ-deklarationer
      // (identifier är 'INTEGER' själv). Hanterat ovan.
      const hasMoneyToken = MONEY_TOKENS.some((t) => {
        // word-boundary: token är del av identifier men som "ord"
        // Dela upp på _ och kolla om någon del matchar.
        const parts = lower.split('_')
        return parts.includes(t)
      })
      if (hasMoneyToken) {
        violations.push({ line: i + 1, match: m[0], column: col })
      }
    }
  }
  return violations
}

// ─── Self-test ──────────────────────────────────────────────────────

function selfTest() {
  const cases = [
    {
      name: 'positive: amount INTEGER without _ore',
      src: `CREATE TABLE foo (\n  total_amount INTEGER NOT NULL\n);`,
      expect: 1,
    },
    {
      name: 'negative: amount_ore INTEGER',
      src: `CREATE TABLE foo (\n  total_amount_ore INTEGER NOT NULL\n);`,
      expect: 0,
    },
    {
      name: 'negative: id INTEGER (not money)',
      src: `CREATE TABLE foo (\n  id INTEGER PRIMARY KEY\n);`,
      expect: 0,
    },
    {
      name: 'positive: price INTEGER',
      src: `ALTER TABLE bar ADD COLUMN unit_price INTEGER DEFAULT 0;`,
      expect: 1,
    },
    {
      name: 'positive: fee INTEGER',
      src: `ALTER TABLE x ADD COLUMN bank_fee INTEGER;`,
      expect: 1,
    },
    {
      name: 'exempt: M119 exempt comment',
      src: `ALTER TABLE x ADD COLUMN legacy_amount INTEGER; -- M119 exempt — historic`,
      expect: 0,
    },
    {
      name: 'negative: period_number INTEGER (non-money)',
      src: `period_number INTEGER NOT NULL,`,
      expect: 0,
    },
  ]

  let failed = 0
  for (const c of cases) {
    const v = scanText(c.src)
    const ok = v.length === c.expect
    console.log(
      `${ok ? '  ✓' : '  ✗'} ${c.name} (got ${v.length}, expected ${c.expect})`,
    )
    if (!ok) failed++
  }
  if (failed > 0) {
    console.error(`❌ Self-test failed: ${failed}/${cases.length}`)
    process.exit(1)
  }
  console.log('✅ M119-migration self-test OK')
}

// ─── Main ───────────────────────────────────────────────────────────

selfTest()
if (process.argv.includes('--self-test')) process.exit(0)

// Scanna migrations.ts (och framtida migrations/**/*.sql).
const files = execSync(
  `find src/main -type f \\( -name "migrations.ts" -o -name "migrations" -type d \\) -not -path "*/node_modules/*"`,
  { encoding: 'utf-8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)

// Ta även sql-filer om de finns
let sqlFiles = []
try {
  sqlFiles = execSync(
    `find src/main -type f -name "*.sql" -not -path "*/node_modules/*"`,
    { encoding: 'utf-8' },
  )
    .trim()
    .split('\n')
    .filter(Boolean)
} catch {
  /* no sql files */
}

const allFiles = [...files, ...sqlFiles]

/** @type {Array<{ file: string; line: number; match: string; column: string }>} */
const allViolations = []
for (const f of allFiles) {
  try {
    const source = readFileSync(f, 'utf-8')
    const v = scanText(source)
    for (const vi of v) allViolations.push({ file: f, ...vi })
  } catch (e) {
    console.error(`Kunde inte läsa ${f}: ${e.message}`)
    process.exit(1)
  }
}

if (allViolations.length > 0) {
  console.error(
    '❌ M119-brott — INTEGER-kolumn med monetärt namn saknar _ore-suffix:',
  )
  for (const v of allViolations) {
    console.error(
      `  ${relative(REPO_ROOT, v.file)}:${v.line} — kolumn=${v.column} (${v.match})`,
    )
  }
  console.error('')
  console.error('Lägg till _ore-suffix eller markera med -- M119 exempt.')
  process.exit(1)
}
console.log('✅ M119-migration OK')
