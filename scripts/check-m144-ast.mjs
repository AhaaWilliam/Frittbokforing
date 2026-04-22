#!/usr/bin/env node
/**
 * M144 AST-check (Fynd 7a).
 *
 * M144 kräver IpcResult<T>-wrapper för alla affärsdata-kanaler. wrapIpcHandler
 * i src/main/ipc/wrap-ipc-handler.ts är kanoniskt verktyg. `wrapIpcHandler(null, …)`
 * tillåts endast för infrastruktur-kanaler (NO_SCHEMA_CHANNELS-whitelist).
 *
 * Detektor: hitta alla CallExpression med callee `wrapIpcHandler` där första
 * argumentet är `null`-literal. Matcha handler-kanalnamnet genom att gå uppåt
 * till närmast `ipcMain.handle(<kanal>, wrapIpcHandler(null, …))` och verifiera
 * att kanalen är whitelistad.
 *
 * Escape hatch: "// M144 exempt" på samma rad som wrapIpcHandler-anropet.
 *
 * Self-test: --self-test validerar detektor-logiken mot in-memory-fixtures.
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

const REPO_ROOT = resolve(process.cwd())

// Kanoniskt whitelist — speglar tests/setup/mock-ipc.ts NO_SCHEMA_CHANNELS
// + fyra argumentlösa infrastruktur-kanaler som tar `null`-schema i praktiken
// (M144 godkänner wrapIpcHandler(null, …) för infrastruktur-kanaler).
const NO_SCHEMA_CHANNELS = new Set([
  'db:health-check',
  'opening-balance:re-transfer',
  'backup:create',
  'backup:restore-dialog',
  'settings:get',
  'settings:set',
  // Argumentlösa kanaler (no input payload to validate)
  'company:get',
  'company:list',
  'fiscal-year:list',
  'maintenance:vacuum',
])

/**
 * @param {string} filePath
 * @param {string} sourceText
 * @returns {Array<{ file: string; line: number; channel: string | null; snippet: string }>}
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

  /** @type {Array<{ file: string; line: number; channel: string | null; snippet: string }>} */
  const violations = []

  /** @param {ts.Node} node */
  function visit(node) {
    // Hitta ipcMain.handle('channel', wrapIpcHandler(null, ...))
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'ipcMain' &&
      node.expression.name.text === 'handle' &&
      node.arguments.length >= 2
    ) {
      const first = node.arguments[0]
      const second = node.arguments[1]
      let channel = null
      if (ts.isStringLiteral(first)) channel = first.text

      // second: wrapIpcHandler(null, ...) eller wrapIpcHandler(Schema, ...)
      if (
        ts.isCallExpression(second) &&
        ts.isIdentifier(second.expression) &&
        second.expression.text === 'wrapIpcHandler' &&
        second.arguments.length >= 1 &&
        second.arguments[0].kind === ts.SyntaxKind.NullKeyword
      ) {
        const { line } = src.getLineAndCharacterOfPosition(second.getStart())
        const srcLine = lines[line] ?? ''
        const isExempt = srcLine.includes('M144 exempt')
        const isWhitelisted = channel && NO_SCHEMA_CHANNELS.has(channel)
        if (!isExempt && !isWhitelisted) {
          violations.push({
            file: filePath,
            line: line + 1,
            channel,
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
      name: 'positive: wrapIpcHandler(null, …) for non-whitelisted channel',
      src: `ipcMain.handle('invoice:list', wrapIpcHandler(null, () => []))`,
      expect: 1,
    },
    {
      name: 'negative: whitelisted channel (settings:get)',
      src: `ipcMain.handle('settings:get', wrapIpcHandler(null, () => ({})))`,
      expect: 0,
    },
    {
      name: 'negative: wrapIpcHandler with schema',
      src: `ipcMain.handle('invoice:list', wrapIpcHandler(Schema, () => []))`,
      expect: 0,
    },
    {
      name: 'exempt: M144 exempt comment',
      src: `ipcMain.handle('foo:bar', wrapIpcHandler(null, () => {})) // M144 exempt — reason`,
      expect: 0,
    },
    {
      name: 'negative: raw ipcMain.handle without wrapIpcHandler',
      src: `ipcMain.handle('foo:bar', (_e, x) => x)`,
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
  console.log('✅ M144-AST self-test OK')
}

// ─── Main ───────────────────────────────────────────────────────────

selfTest()
if (process.argv.includes('--self-test')) process.exit(0)

const files = execSync(
  `find src/main -type f -name "*.ts" -not -path "*/node_modules/*"`,
  { encoding: 'utf-8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)

/** @type {Array<{ file: string; line: number; channel: string | null; snippet: string }>} */
const allViolations = []
for (const f of files) {
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
    '❌ M144-AST-brott — wrapIpcHandler(null, …) för icke-whitelistad kanal:',
  )
  for (const v of allViolations) {
    console.error(
      `  ${relative(REPO_ROOT, v.file)}:${v.line} — kanal=${v.channel ?? '?'} — ${v.snippet}`,
    )
  }
  console.error('')
  console.error(
    'Affärsdata-kanaler ska ha Zod-schema. Se NO_SCHEMA_CHANNELS i tests/setup/mock-ipc.ts.',
  )
  process.exit(1)
}
console.log('✅ M144-AST OK')
