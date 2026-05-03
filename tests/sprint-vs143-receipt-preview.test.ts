/**
 * Sprint VS-143 — getReceiptAbsolutePath (service-nivå).
 *
 * Verifierar:
 *  - Happy path: relativ path under documents-roten → file://-URL.
 *  - Path-traversal blockad: `../../etc/passwd` → INVALID_PATH.
 *  - Absolut path som pekar utanför roten → INVALID_PATH.
 *  - NOT_FOUND: existerande relativ path där filen saknas på disk.
 *  - VALIDATION_ERROR vid tom string.
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-vs143-'))

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'documents') return tmpDocs
      throw new Error(`unexpected getPath: ${name}`)
    },
  },
}))

vi.mock('electron-log/main', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}))

import { getReceiptAbsolutePath } from '../src/main/services/receipt-service'

const ROOT = path.join(tmpDocs, 'Fritt Bokföring')

beforeEach(() => {
  fs.mkdirSync(path.join(ROOT, 'receipts-inbox'), { recursive: true })
})

afterEach(() => {
  fs.rmSync(ROOT, { recursive: true, force: true })
})

describe('VS-143 getReceiptAbsolutePath', () => {
  it('happy path — returnerar file://-URL för existerande fil', () => {
    const rel = path.join('receipts-inbox', 'a.pdf')
    fs.writeFileSync(path.join(ROOT, rel), 'PDF')

    const out = getReceiptAbsolutePath({ receipt_path: rel })
    expect(out.success).toBe(true)
    if (!out.success) return
    expect(out.data.url.startsWith('file://')).toBe(true)
    expect(out.data.url.endsWith('a.pdf')).toBe(true)
  })

  it('path-traversal blockad — relativ path med `..`', () => {
    const out = getReceiptAbsolutePath({
      receipt_path: '../../../../etc/passwd',
    })
    expect(out.success).toBe(false)
    if (out.success) return
    expect(out.code).toBe('VALIDATION_ERROR')
    expect(out.field).toBe('receipt_path')
  })

  it('path-traversal blockad — absolut path utanför documents-roten', () => {
    const out = getReceiptAbsolutePath({ receipt_path: '/etc/hosts' })
    expect(out.success).toBe(false)
    if (out.success) return
    expect(out.code).toBe('VALIDATION_ERROR')
  })

  it('NOT_FOUND — relativ path är inom roten men filen saknas', () => {
    const out = getReceiptAbsolutePath({
      receipt_path: 'receipts-inbox/saknas.pdf',
    })
    expect(out.success).toBe(false)
    if (out.success) return
    expect(out.code).toBe('NOT_FOUND')
  })

  it('VALIDATION_ERROR — tom path', () => {
    const out = getReceiptAbsolutePath({ receipt_path: '' })
    expect(out.success).toBe(false)
    if (out.success) return
    expect(out.code).toBe('VALIDATION_ERROR')
  })

  it('encodeURI — path med mellanslag escape:as', () => {
    const rel = path.join('receipts-inbox', 'kvitto med mellanslag.pdf')
    fs.writeFileSync(path.join(ROOT, rel), 'PDF')
    const out = getReceiptAbsolutePath({ receipt_path: rel })
    expect(out.success).toBe(true)
    if (!out.success) return
    expect(out.data.url).toContain('kvitto%20med%20mellanslag.pdf')
  })
})
