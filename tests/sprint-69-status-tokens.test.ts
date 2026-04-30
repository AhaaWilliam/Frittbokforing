/**
 * Sprint 69 — semantic status-tokens + utvidgad statuspaletten.
 *
 * Vakter:
 * 1. tokens.ts och index.css definierar samma {success,warning,danger,info}
 *    palettnumera (100/500/600/700).
 * 2. `statusOverdue` finns som semantisk alias.
 * 3. InvoiceListRow/ExpenseListRow använder `text-status-overdue`,
 *    inte raw `text-red-600`, för overdue-status.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const repoRoot = resolve(__dirname, '..')

const STATUS_PALETTE = ['success', 'warning', 'danger', 'info'] as const
const STATUS_TONES = ['100', '500', '600', '700'] as const

describe('Sprint 69 — status-token-paritet', () => {
  it.each(STATUS_PALETTE)(
    'index.css definierar 100/500/600/700 för %s',
    (name) => {
      const css = readFileSync(
        resolve(repoRoot, 'src/renderer/index.css'),
        'utf8',
      )
      for (const tone of STATUS_TONES) {
        const re = new RegExp(`--color-${name}-${tone}:\\s*[#a-zA-Z0-9()-]+`)
        expect(css).toMatch(re)
      }
    },
  )

  it.each(STATUS_PALETTE)(
    'tokens.ts definierar %s100/500/600/700',
    (name) => {
      const tokens = readFileSync(
        resolve(repoRoot, 'src/renderer/styles/tokens.ts'),
        'utf8',
      )
      for (const tone of STATUS_TONES) {
        const re = new RegExp(`${name}${tone}:\\s*['"]#`)
        expect(tokens).toMatch(re)
      }
    },
  )

  it('index.css har semantisk alias --color-status-overdue', () => {
    const css = readFileSync(
      resolve(repoRoot, 'src/renderer/index.css'),
      'utf8',
    )
    expect(css).toMatch(/--color-status-overdue:\s*var\(--color-danger-/)
  })

  it('tokens.ts har statusOverdue', () => {
    const tokens = readFileSync(
      resolve(repoRoot, 'src/renderer/styles/tokens.ts'),
      'utf8',
    )
    expect(tokens).toMatch(/statusOverdue:\s*['"]#/)
  })

  it.each([
    'src/renderer/components/invoices/InvoiceListRow.tsx',
    'src/renderer/components/expenses/ExpenseListRow.tsx',
  ])('%s — overdue använder text-status-overdue, inte text-red-600', (path) => {
    const src = readFileSync(resolve(repoRoot, path), 'utf8')
    // overdue-grenen ska inte längre använda text-red-XXX
    expect(src).not.toMatch(/overdue.*text-red-\d/)
    expect(src).toMatch(/overdue.*text-status-overdue/)
  })
})
