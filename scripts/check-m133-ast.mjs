#!/usr/bin/env node
/**
 * M133 AST-check (F49-b, Sprint B).
 *
 * Kompletterar check-m133.mjs (grep) med AST-detektion av error-rendering
 * som saknar role="alert". Grep klarar inte multi-line JSX eller whitespace-
 * varianter pålitligt.
 *
 * Heuristik (konservativ — false-positive-minimerande):
 *   Ett JSX-element E flaggas om ALLA:
 *     1. E:s tagName är p, span eller div
 *     2. E:s children innehåller en PropertyAccessExpression vars
 *        root-Identifier är i whitelist: errors, formErrors, fieldErrors
 *     3. E saknar JsxAttribute name="role" med value="alert"
 *
 * Scope: src/renderer/ ** / *.tsx (komponenter).
 *
 * Escape hatch: "// M133 exempt" på samma rad som element-starten
 *                ignoreras (konsekvent med check-m133.mjs).
 *
 * Self-test: --self-test validerar detektor-logiken mot in-memory-fixtures.
 *
 * Använder TS compiler API (ingen ts-morph eller tsx-dependency).
 */

import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import ts from 'typescript'

const ERROR_IDENTIFIERS = new Set(['errors', 'formErrors', 'fieldErrors'])
const FLAGGED_TAGS = new Set(['p', 'span', 'div'])

/**
 * @param {string} filePath
 * @param {string} sourceText
 * @returns {Array<{ file: string; line: number; tag: string; reason: string }>}
 */
function scanSource(filePath, sourceText) {
  const src = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const lines = sourceText.split('\n')
  /** @type {Array<{ file: string; line: number; tag: string; reason: string }>} */
  const violations = []

  /** @param {ts.Node} node */
  function visit(node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const opening = ts.isJsxElement(node) ? node.openingElement : node
      const tagName = opening.tagName
      if (ts.isIdentifier(tagName) && FLAGGED_TAGS.has(tagName.text)) {
        // Gå endast vidare om children innehåller error-ref (endast JsxElement har children)
        if (ts.isJsxElement(node) && containsErrorReference(node.children)) {
          // Escape hatch: "// M133 exempt" på startraden
          const { line } = src.getLineAndCharacterOfPosition(node.getStart())
          const srcLine = lines[line] ?? ''
          if (srcLine.includes('M133 exempt')) {
            ts.forEachChild(node, visit)
            return
          }

          if (!hasRoleAlert(opening.attributes)) {
            violations.push({
              file: filePath,
              line: line + 1,
              tag: tagName.text,
              reason: 'error-rendering utan role="alert"',
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

/**
 * @param {ts.NodeArray<ts.JsxChild>} children
 *
 * Flagga endast om ett direkt-barn är en JsxExpression som renderar
 * errors.xxx UTAN en inbäddad JsxElement (då antas den inre JSX-noden
 * hantera role="alert").
 */
function containsErrorReference(children) {
  for (const child of children) {
    if (!ts.isJsxExpression(child) || !child.expression) continue
    if (containsJsxElement(child.expression)) continue
    if (exprReferencesError(child.expression)) return true
  }
  return false
}

/** @param {ts.Node} node */
function containsJsxElement(node) {
  if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
    return true
  }
  let found = false
  ts.forEachChild(node, (child) => {
    if (found) return
    if (containsJsxElement(child)) found = true
  })
  return found
}

/**
 * Rekursiv kontroll: returnerar true om uttrycket innehåller en
 * PropertyAccessExpression vars root-Identifier är i ERROR_IDENTIFIERS,
 * UTAN att passera ett JsxElement/JsxSelfClosingElement på vägen.
 *
 * Detta undviker false positives där en wrapper-`<div>` innehåller ett
 * inre korrekt-märkt `<p role="alert">{errors.xxx}</p>` — vi vill bara
 * flagga elementet som renderar error-texten direkt, inte dess ancestors.
 *
 * @param {ts.Node} expr
 * @returns {boolean}
 */
function exprReferencesError(expr) {
  if (ts.isJsxElement(expr) || ts.isJsxSelfClosingElement(expr)) return false
  if (ts.isPropertyAccessExpression(expr)) {
    let root = expr.expression
    while (ts.isPropertyAccessExpression(root)) root = root.expression
    if (ts.isIdentifier(root) && ERROR_IDENTIFIERS.has(root.text)) return true
  }
  if (ts.isElementAccessExpression(expr)) {
    let root = expr.expression
    while (
      ts.isElementAccessExpression(root) ||
      ts.isPropertyAccessExpression(root)
    ) {
      root = root.expression
    }
    if (ts.isIdentifier(root) && ERROR_IDENTIFIERS.has(root.text)) return true
  }
  let found = false
  ts.forEachChild(expr, (child) => {
    if (found) return
    if (exprReferencesError(child)) found = true
  })
  return found
}

/** @param {ts.JsxAttributes} attrs */
function hasRoleAlert(attrs) {
  for (const attr of attrs.properties) {
    if (!ts.isJsxAttribute(attr)) continue
    if (!ts.isIdentifier(attr.name) || attr.name.text !== 'role') continue
    const init = attr.initializer
    if (!init) continue
    if (ts.isStringLiteral(init) && init.text === 'alert') return true
    if (ts.isJsxExpression(init) && init.expression) {
      const e = init.expression
      if (ts.isStringLiteral(e) && e.text === 'alert') return true
      if (ts.isNoSubstitutionTemplateLiteral(e) && e.text === 'alert') return true
    }
  }
  return false
}

// ─── Self-test ──────────────────────────────────────────────────────

function selfTest() {
  const good = `
    export function A() {
      return <p role="alert">{errors.name}</p>
    }
  `
  const bad = `
    export function B() {
      return (
        <p className="err">
          {errors.name}
        </p>
      )
    }
  `
  const exempt = `
    export function C() {
      return <p>{errors.stack}</p> // M133 exempt — debug only
    }
  `
  const unrelated = `
    export function D() {
      return <p>{err.message}</p>
    }
  `
  const nested = `
    export function E() {
      return <p>{isSet && errors.name}</p>
    }
  `
  const withRoleExpr = `
    export function F() {
      return <p role={"alert"}>{errors.name}</p>
    }
  `

  const cases = [
    { name: 'positive: role=alert', src: good, expect: 0 },
    { name: 'negative: missing role', src: bad, expect: 1 },
    { name: 'exempt comment on start line', src: exempt, expect: 0 },
    { name: 'unrelated `err.message`', src: unrelated, expect: 0 },
    { name: 'nested conditional with errors.*', src: nested, expect: 1 },
    { name: 'role={"alert"} expression', src: withRoleExpr, expect: 0 },
  ]

  let failed = 0
  for (const c of cases) {
    const v = scanSource('self-test.tsx', c.src)
    const ok = v.length === c.expect
    console.log(`${ok ? '  ✓' : '  ✗'} ${c.name} (got ${v.length}, expected ${c.expect})`)
    if (!ok) failed++
  }
  if (failed > 0) {
    console.error(`❌ Self-test failed: ${failed}/${cases.length}`)
    process.exit(1)
  }
  console.log('✅ M133-AST self-test OK')
}

// ─── Main ───────────────────────────────────────────────────────────

if (process.argv.includes('--self-test')) {
  selfTest()
  process.exit(0)
}

const files = execSync(
  `find src/renderer -name "*.tsx" -type f`,
  { encoding: 'utf-8' },
)
  .trim()
  .split('\n')
  .filter(Boolean)

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
  console.error('❌ M133-AST-brott:')
  for (const v of allViolations) {
    console.error(`  ${v.file}:${v.line} — <${v.tag}> ${v.reason}`)
  }
  process.exit(1)
}
console.log('✅ M133-AST OK')
