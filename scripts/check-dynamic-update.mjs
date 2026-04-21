#!/usr/bin/env node
/**
 * AST-check: förbjuder dynamiskt konstruerade `UPDATE`-template-strings
 * utanför `src/main/utils/build-update.ts`.
 *
 * Motivering: SQL-kolumnnamn kan inte parametriseras via `?`. Whitelist-
 * mönstret (ALLOWED_*_COLUMNS.has(key)) är säkert men skört — en framtida
 * refactor som tar bort whitelisten öppnar för SQL-injection via input-
 * nyckelnamn. Helpern i build-update.ts är den enda plats där detta mönster
 * får finnas; alla callsites går via den.
 *
 * Heuristik: leta efter TemplateExpression vars head-text börjar med
 * mönstret `UPDATE `, exklusive allowlist.
 *
 * Escape hatch: "// dynamic-update exempt" på samma rad.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

const ALLOWLIST = new Set(['src/main/utils/build-update.ts'])
const REPO_ROOT = resolve(process.cwd())

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
    if (ts.isTemplateExpression(node)) {
      const head = node.head.text
      if (/^\s*UPDATE\s+/i.test(head)) {
        const { line } = src.getLineAndCharacterOfPosition(node.getStart())
        const srcLine = lines[line] ?? ''
        const prevLine = line > 0 ? (lines[line - 1] ?? '') : ''
        const exempt =
          srcLine.includes('dynamic-update exempt') ||
          prevLine.includes('dynamic-update exempt')
        if (!exempt) {
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

function selfTest() {
  const cases = [
    {
      name: 'positive: UPDATE template with dynamic SET',
      src: "function x() { const sets = ['a=?']; db.prepare(`UPDATE foo SET ${sets.join(',')} WHERE id = ?`) }",
      expect: 1,
    },
    {
      name: 'positive: UPDATE with single interpolation',
      src: 'function y(cols) { return `UPDATE bar SET ${cols}` }',
      expect: 1,
    },
    {
      name: 'negative: static UPDATE string (no template expr)',
      src: "function z() { db.prepare('UPDATE foo SET a = ? WHERE id = ?') }",
      expect: 0,
    },
    {
      name: 'negative: SELECT template is irrelevant',
      src: 'function w(t) { return `SELECT * FROM ${t}` }',
      expect: 0,
    },
    {
      name: 'exempt: comment on same line',
      src: 'function v(s) { return `UPDATE foo SET ${s}` /* dynamic-update exempt — test */ }',
      expect: 0,
    },
    {
      name: 'exempt: comment on line above',
      src: `function vv(s) {
  // dynamic-update exempt — polymorf
  return \`UPDATE foo SET \${s}\`
}`,
      expect: 0,
    },
    {
      name: 'negative: UPDATE inside regular string literal with interp elsewhere',
      src: 'function u(id) { const msg = `User ${id}`; return msg }',
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
    if (!ok) {
      failed++
      for (const vi of v) console.log(`      → line ${vi.line}: ${vi.snippet}`)
    }
  }
  if (failed > 0) {
    console.error(`❌ Self-test failed: ${failed}/${cases.length}`)
    process.exit(1)
  }
  console.log('✅ dynamic-update self-test OK')
}

selfTest()
if (process.argv.includes('--self-test')) process.exit(0)

const files = execSync(
  `find src -type f -name "*.ts" -not -path "*/node_modules/*"`,
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
  console.error(
    '❌ Dynamisk UPDATE-template utanför src/main/utils/build-update.ts:',
  )
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line} — ${v.snippet}`)
  }
  console.error('')
  console.error('Använd buildUpdate() från src/main/utils/build-update.ts.')
  console.error(
    'Om callsite genuint inte kan migreras: "// dynamic-update exempt — <skäl>" på samma rad.',
  )
  process.exit(1)
}
console.log(
  `✅ dynamic-update OK — ${files.length} filer, 0 dynamiska UPDATE-templates utanför helpern`,
)
