#!/usr/bin/env node
/**
 * M131 AST-check (Sprint S follow-up).
 *
 * Ersätter/kompletterar `scripts/m131-check.sh` (regex) med AST-detektion
 * av binär `*` där minst en operand refererar ett `_kr`-fält. M131 säger
 * att sådan multiplikation MÅSTE gå via `src/shared/money.ts`
 * (`multiplyKrToOre` eller `multiplyDecimalByOre`).
 *
 * Heuristik (per-fil, ingen cross-file-analys):
 *   1. Bygg fil-lokal alias-tabell: identifiers som tilldelas från en
 *      PropertyAccessExpression eller Identifier vars terminala namn
 *      slutar på `_kr`.
 *   2. Gå igenom alla BinaryExpression(*). Flagga om endera operand:
 *      - är en Identifier i alias-tabellen, eller
 *      - är en PropertyAccessExpression vars terminala namn slutar på `_kr`
 *      - är en Identifier vars namn slutar på `_kr`
 *
 * Allowlist: `src/shared/money.ts` (kanonisk plats för formeln).
 *
 * Escape hatch: "// M131 exempt" på samma rad som `*`-uttrycket.
 *
 * Self-test: --self-test validerar detektor-logiken mot in-memory-fixtures.
 * Körs alltid som första steg innan produktionsscan.
 *
 * Använder TS compiler API (ingen ny devDep), samma mönster som
 * `scripts/check-m133-ast.mjs`.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

const ALLOWLIST = new Set(['src/shared/money.ts'])
const REPO_ROOT = resolve(process.cwd())

/**
 * @param {string} name
 * @returns {boolean}
 */
function endsWithKr(name) {
  return name.endsWith('_kr')
}

/**
 * Returns the terminal identifier name for an Identifier or
 * PropertyAccessExpression, or null for other node types.
 *
 * @param {ts.Node} node
 * @returns {string | null}
 */
function terminalName(node) {
  if (ts.isIdentifier(node)) return node.text
  if (ts.isPropertyAccessExpression(node)) return node.name.text
  return null
}

/**
 * @param {string} filePath
 * @param {string} sourceText
 * @returns {Array<{ file: string; line: number; snippet: string }>}
 */
function scanSource(filePath, sourceText) {
  const src = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  )
  const lines = sourceText.split('\n')

  // Pass 1: bygg alias-tabell
  /** @type {Set<string>} */
  const aliases = new Set()
  /** @param {ts.Node} node */
  function collectAliases(node) {
    if (ts.isVariableDeclaration(node) && node.initializer && node.name) {
      if (ts.isIdentifier(node.name)) {
        const initName = terminalName(node.initializer)
        if (initName && endsWithKr(initName)) {
          aliases.add(node.name.text)
        }
      }
    }
    ts.forEachChild(node, collectAliases)
  }
  collectAliases(src)

  /** @param {ts.Expression} expr */
  function operandReferencesKr(expr) {
    const t = terminalName(expr)
    if (!t) return false
    if (endsWithKr(t)) return true
    if (ts.isIdentifier(expr) && aliases.has(expr.text)) return true
    return false
  }

  // Pass 2: flagga binär *
  /** @type {Array<{ file: string; line: number; snippet: string }>} */
  const violations = []
  /** @param {ts.Node} node */
  function visit(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.AsteriskToken
    ) {
      const lhsHit = operandReferencesKr(node.left)
      const rhsHit = operandReferencesKr(node.right)
      if (lhsHit || rhsHit) {
        const { line } = src.getLineAndCharacterOfPosition(node.getStart())
        const srcLine = lines[line] ?? ''
        if (!srcLine.includes('M131 exempt')) {
          violations.push({
            file: filePath,
            line: line + 1,
            snippet: srcLine.trim().slice(0, 120),
          })
        }
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(src)
  return violations
}

// ─── Self-test ──────────────────────────────────────────────────────

function selfTest() {
  const cases = [
    {
      name: 'positive: direct price_kr * qty',
      src: `export function a(line) { return line.unit_price_kr * line.quantity }`,
      expect: 1,
    },
    {
      name: 'positive: aliased price_kr',
      src: `export function b(line) { const p = line.unit_price_kr; return line.quantity * p }`,
      expect: 1,
    },
    {
      name: 'positive: priceKr identifier ending _kr (snake)',
      src: `export function c(price_kr, qty) { return price_kr * qty }`,
      expect: 1,
    },
    {
      name: 'negative: _ore multiplication is fine',
      src: `export function d(line) { return line.quantity * line.unit_price_ore }`,
      expect: 0,
    },
    {
      name: 'negative: unrelated scalar multiplication',
      src: `export function e() { return Math.round(rate * 100) }`,
      expect: 0,
    },
    {
      name: 'exempt: comment on same line',
      src: `export function f(line) { return line.unit_price_kr * 2 // M131 exempt — debug`,
      expect: 0,
    },
    {
      name: 'positive: alias via Identifier not PropertyAccess',
      src: `export function g(pkr) { const p = pkr_wrapper; return p * 2 }`.replace(
        'pkr_wrapper',
        'something_kr',
      ),
      expect: 1,
    },
  ]

  let failed = 0
  for (const c of cases) {
    const v = scanSource('self-test.tsx', c.src)
    const ok = v.length === c.expect
    console.log(
      `${ok ? '  ✓' : '  ✗'} ${c.name} (got ${v.length}, expected ${c.expect})`,
    )
    if (!ok) {
      failed++
      for (const vi of v) console.log(`      → line ${vi.line}: ${vi.snippet}`)
    }
  }
  if (failed > 0) {
    console.error(`❌ Self-test failed: ${failed}/${cases.length}`)
    process.exit(1)
  }
  console.log('✅ M131-AST self-test OK')
}

// ─── Main ───────────────────────────────────────────────────────────

// Self-test körs alltid först (säkerställer detektor-integritet).
selfTest()

if (process.argv.includes('--self-test')) process.exit(0)

const files = execSync(
  `find src -type f \\( -name "*.ts" -o -name "*.tsx" \\) -not -path "*/node_modules/*"`,
  { encoding: 'utf-8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)

/** @type {Array<{ file: string; line: number; snippet: string }>} */
const allViolations = []
for (const f of files) {
  const relPath = relative(REPO_ROOT, resolve(f))
  if (ALLOWLIST.has(relPath)) continue
  try {
    const source = readFileSync(f, 'utf-8')
    allViolations.push(...scanSource(f, source))
  } catch (e) {
    console.error(`Kunde inte läsa ${f}: ${e.message}`)
    process.exit(1)
  }
}

if (allViolations.length > 0) {
  console.error('❌ M131-AST-brott — multiplikation med _kr-operand utanför src/shared/money.ts:')
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line} — ${v.snippet}`)
  }
  console.error('')
  console.error('Använd multiplyKrToOre / multiplyDecimalByOre från src/shared/money.ts.')
  console.error('Om denna callsite genuint inte kan migreras, lägg "// M131 exempt — <skäl>" på samma rad.')
  process.exit(1)
}
console.log('✅ M131-AST OK')
