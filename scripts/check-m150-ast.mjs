#!/usr/bin/env node
/**
 * M150 AST-check (Fynd 7b).
 *
 * M150 kräver att main-process affärslogik läser tid via `getNow()` från
 * src/main/utils/now.ts, inte `new Date()` direkt. Detektorn scannar
 * alla .ts-filer i src/main/services efter `new Date()` utan argument.
 *
 * Undantag:
 *   - `new Date(<argument>)` — konverterar en sträng/number, inte aktuell tid.
 *   - Filer i ALLOWLIST (t.ex. now.ts självt).
 *
 * Escape hatch: "// M150 exempt" på samma rad.
 *
 * Self-test: --self-test validerar detektor-logiken.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

const REPO_ROOT = resolve(process.cwd())

// Filer som får använda new Date() direkt.
const ALLOWLIST = new Set([
  'src/main/utils/now.ts',
])

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
    ts.ScriptKind.TS,
  )
  const lines = sourceText.split('\n')

  /** @type {Array<{ file: string; line: number; snippet: string }>} */
  const violations = []

  /** @param {ts.Node} node */
  function visit(node) {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'Date' &&
      (!node.arguments || node.arguments.length === 0)
    ) {
      const { line } = src.getLineAndCharacterOfPosition(node.getStart())
      const srcLine = lines[line] ?? ''
      if (!srcLine.includes('M150 exempt')) {
        violations.push({
          file: filePath,
          line: line + 1,
          snippet: srcLine.trim().slice(0, 120),
        })
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
      name: 'positive: new Date() no args',
      src: `function a() { return new Date() }`,
      expect: 1,
    },
    {
      name: 'negative: new Date(str) — input conversion',
      src: `function b(x: string) { return new Date(x) }`,
      expect: 0,
    },
    {
      name: 'negative: new Date(ms) — number',
      src: `function c(ms: number) { return new Date(ms) }`,
      expect: 0,
    },
    {
      name: 'exempt: M150 exempt comment',
      src: `function d() { return new Date() // M150 exempt — infra log`,
      expect: 0,
    },
    {
      name: 'negative: unrelated new X()',
      src: `function e() { return new Map() }`,
      expect: 0,
    },
  ]

  let failed = 0
  for (const c of cases) {
    const v = scanSource('self-test.ts', c.src)
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
  console.log('✅ M150-AST self-test OK')
}

// ─── Main ───────────────────────────────────────────────────────────

selfTest()
if (process.argv.includes('--self-test')) process.exit(0)

const files = execSync(
  `find src/main/services -type f -name "*.ts" -not -path "*/node_modules/*"`,
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
  console.error('❌ M150-AST-brott — new Date() utan argument i main/services:')
  for (const v of allViolations) {
    console.error(`  ${relative(REPO_ROOT, v.file)}:${v.line} — ${v.snippet}`)
  }
  console.error('')
  console.error('Använd getNow() / todayLocalFromNow() från src/main/utils/now.ts.')
  process.exit(1)
}
console.log('✅ M150-AST OK')
