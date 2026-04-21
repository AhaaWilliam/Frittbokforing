#!/usr/bin/env node
/**
 * AST-check: förbjuder try/catch inne i `ipcMain.handle`-arrow-body
 * utanför en kort allowlist av infrastruktur-handlers.
 *
 * Motivering (M128): IPC-handlers ska följa antingen
 *   1. direkt delegation — `ipcMain.handle('ch', (_e, input) => svc(db, input))`
 *      där service returnerar IpcResult<T>, eller
 *   2. `wrapIpcHandler(schema, fn)` — som hanterar Zod, strukturerade fel,
 *      och unexpected errors enhetligt.
 *
 * Manuell try/catch i handler-body kollapsar ofta allt till TRANSACTION_ERROR
 * eller sväljer strukturerad fel-kontext. Regressionsvakt.
 *
 * Scope: src/main/ipc-handlers.ts. Allowlist: handlers som M144 explicit
 * listar som infrastruktur-undantag (health-check, opening-balance:re-transfer).
 *
 * Escape hatch: "// M128 exempt" på raden ovanför try-satsen.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import ts from 'typescript'

const TARGET = 'src/main/ipc-handlers.ts'
const CHANNEL_ALLOWLIST = new Set([
  'db:health-check',
  'opening-balance:re-transfer',
])

/**
 * @param {string} filePath
 * @param {string} sourceText
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
  /** @type {Array<{ file: string; line: number; channel: string; snippet: string }>} */
  const violations = []

  /**
   * Om call-expression är `ipcMain.handle('channel', handlerArg)`, returnera
   * { channel, handlerArg } — annars null.
   * @param {ts.Node} node
   */
  function matchIpcMainHandle(node) {
    if (!ts.isCallExpression(node)) return null
    const expr = node.expression
    if (
      !ts.isPropertyAccessExpression(expr) ||
      !ts.isIdentifier(expr.expression) ||
      expr.expression.text !== 'ipcMain' ||
      expr.name.text !== 'handle'
    )
      return null
    const [chArg, handlerArg] = node.arguments
    if (!chArg || !handlerArg) return null
    if (!ts.isStringLiteral(chArg) && !ts.isNoSubstitutionTemplateLiteral(chArg))
      return null
    return { channel: chArg.text, handlerArg }
  }

  /**
   * Hittar try-statements i en nod-underträ, men INTE inuti nested function/arrow
   * scope (för att inte fånga try i en funktion som i sin tur ligger under handler).
   * @param {ts.Node} root
   * @returns {ts.TryStatement[]}
   */
  function findDirectTries(root) {
    /** @type {ts.TryStatement[]} */
    const tries = []
    /** @param {ts.Node} n */
    function walk(n) {
      if (ts.isTryStatement(n)) {
        tries.push(n)
        return
      }
      if (
        n !== root &&
        (ts.isFunctionDeclaration(n) ||
          ts.isFunctionExpression(n) ||
          ts.isArrowFunction(n) ||
          ts.isMethodDeclaration(n))
      ) {
        return
      }
      ts.forEachChild(n, walk)
    }
    ts.forEachChild(root, walk)
    return tries
  }

  /** @param {ts.Node} node */
  function visit(node) {
    const m = matchIpcMainHandle(node)
    if (m) {
      const { channel, handlerArg } = m
      if (!CHANNEL_ALLOWLIST.has(channel)) {
        // wrapIpcHandler-call är per definition OK — skippa.
        const isWrap =
          ts.isCallExpression(handlerArg) &&
          ts.isIdentifier(handlerArg.expression) &&
          handlerArg.expression.text === 'wrapIpcHandler'
        if (!isWrap && ts.isArrowFunction(handlerArg)) {
          const tries = findDirectTries(handlerArg.body)
          for (const t of tries) {
            const { line } = src.getLineAndCharacterOfPosition(t.getStart())
            const prev = lines[line - 1] ?? ''
            if (prev.includes('M128 exempt')) continue
            violations.push({
              file: filePath,
              line: line + 1,
              channel,
              snippet: (lines[line] ?? '').trim().slice(0, 120),
            })
          }
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
      name: 'positive: try/catch in arrow body',
      src: `const ipcMain = {}
ipcMain.handle('x:do', (_e, input) => {
  try { return svc(input) } catch (e) { return { success: false } }
})`,
      expect: 1,
    },
    {
      name: 'negative: wrapIpcHandler call',
      src: `const ipcMain = {}
ipcMain.handle('x:do', wrapIpcHandler(Schema, (d) => svc(d)))`,
      expect: 0,
    },
    {
      name: 'negative: direct delegation',
      src: `const ipcMain = {}
ipcMain.handle('x:do', (_e, input) => svc(db, input))`,
      expect: 0,
    },
    {
      name: 'negative: channel on allowlist',
      src: `const ipcMain = {}
ipcMain.handle('db:health-check', () => { try { return a() } catch { return b() } })`,
      expect: 0,
    },
    {
      name: 'exempt: M128 exempt comment above',
      src: `const ipcMain = {}
ipcMain.handle('x:do', (_e) => {
  // M128 exempt — legacy reason
  try { return a() } catch { return b() }
})`,
      expect: 0,
    },
    {
      name: 'negative: try inside nested inner function is ignored',
      src: `const ipcMain = {}
ipcMain.handle('x:do', (_e) => {
  const inner = () => { try { return 1 } catch { return 2 } }
  return inner()
})`,
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
      for (const vi of v)
        console.log(
          `      → line ${vi.line} ch=${vi.channel}: ${vi.snippet}`,
        )
    }
  }
  if (failed > 0) {
    console.error(`❌ Self-test failed: ${failed}/${cases.length}`)
    process.exit(1)
  }
  console.log('✅ ipc-handler-patterns self-test OK')
}

selfTest()
if (process.argv.includes('--self-test')) process.exit(0)

const absPath = resolve(process.cwd(), TARGET)
let source
try {
  source = readFileSync(absPath, 'utf-8')
} catch (e) {
  console.error(`Kunde inte läsa ${TARGET}: ${e.message}`)
  process.exit(1)
}
const violations = scanSource(TARGET, source)

if (violations.length > 0) {
  console.error('❌ M128-brott — try/catch inne i ipcMain.handle arrow-body:')
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line} (channel "${v.channel}") — ${v.snippet}`)
  }
  console.error('')
  console.error(
    'Migrera till wrapIpcHandler(schema, fn) eller direkt delegation som returnerar IpcResult<T>.',
  )
  console.error(
    'Om genuin infrastruktur (M144): lägg channel i CHANNEL_ALLOWLIST eller "// M128 exempt — <skäl>" ovanför try.',
  )
  process.exit(1)
}
console.log(
  `✅ ipc-handler-patterns OK — 0 manuella try/catch i handlers (utanför ${CHANNEL_ALLOWLIST.size} M144-allowlist)`,
)
