/**
 * Sprint VS-141 — exportReceiptsZipBundle (service-nivå).
 *
 * Verifierar:
 *  - Zip skapas på destination-path med korrekt filnamn
 *  - metadata.csv finns i roten med samma data som VS-123
 *  - Fysiska kvittofiler bundlas under receipts/<expense_id>/<basename>
 *  - Best-effort när fysisk fil saknas på disk (warning + fortsätter)
 *  - NOT_FOUND vid okänt company_id
 *  - buildZipBundleFilename sanerar bolagsnamn
 */
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execSync } from 'node:child_process'

const tmpDocs = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-vs141-'))

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

import type Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import {
  createReceipt,
  exportReceiptsZipBundle,
  buildZipBundleFilename,
} from '../src/main/services/receipt-service'

let db: Database.Database
let zipDir: string

function setup(): { companyId: number } {
  const r = createCompany(db, {
    name: 'Test AB',
    org_number: '556036-0793',
    fiscal_rule: 'K2',
    share_capital: 2_500_000,
    registration_date: '2025-01-15',
    fiscal_year_start: '2025-01-01',
    fiscal_year_end: '2025-12-31',
  })
  if (!r.success) throw new Error(r.error)
  return { companyId: r.data.id }
}

function writeSrcFile(name: string, content: string): string {
  const p = path.join(tmpDocs, name)
  fs.writeFileSync(p, content)
  return p
}

beforeEach(() => {
  db = createTestDb()
  zipDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-vs141-zip-'))
})

afterEach(() => {
  if (db) db.close()
  if (zipDir && fs.existsSync(zipDir))
    fs.rmSync(zipDir, { recursive: true, force: true })
})

describe('VS-141 exportReceiptsZipBundle', () => {
  it('skapar zip med metadata.csv + fysiska filer', async () => {
    const { companyId } = setup()
    const f1 = writeSrcFile('source-a.pdf', 'PDF-A')
    const f2 = writeSrcFile('source-b.pdf', 'PDF-B')
    const r1 = createReceipt(db, {
      company_id: companyId,
      source_path: f1,
      original_filename: 'kvitto-a.pdf',
    })
    const r2 = createReceipt(db, {
      company_id: companyId,
      source_path: f2,
      original_filename: 'kvitto-b.pdf',
    })
    if (!r1.success || !r2.success) throw new Error('seed failed')

    const dest = path.join(zipDir, 'bundle.zip')
    const out = await exportReceiptsZipBundle(db, {
      company_id: companyId,
      destinationPath: dest,
    })
    expect(out.success).toBe(true)
    if (!out.success) return
    expect(out.data.filename).toBe('bundle.zip')
    expect(fs.existsSync(dest)).toBe(true)

    // Lista zip-innehåll via unzip -l (ingen ny dep behövs).
    const listing = execSync(`unzip -l "${dest}"`).toString()
    expect(listing).toContain('metadata.csv')
    expect(listing).toContain('receipts/unbooked/kvitto-a.pdf')
    expect(listing).toContain('receipts/unbooked/kvitto-b.pdf')
  })

  it('placerar bokförda kvitton under receipts/<expense_id>/', async () => {
    const { companyId } = setup()
    const f = writeSrcFile('src.pdf', 'X')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: f,
      original_filename: 'bokfort.pdf',
    })
    if (!r.success) throw new Error('seed')
    // Direkt UPDATE för att simulera bokförd status (undviker hela
    // expense-create-flödet i denna service-test). Stäng FK temporärt
    // för att referera ett expense_id som inte finns i denna test-DB.
    db.pragma('foreign_keys = OFF')
    db.prepare(
      "UPDATE receipts SET status='booked', expense_id=42 WHERE id=?",
    ).run(r.data.id)
    db.pragma('foreign_keys = ON')

    const dest = path.join(zipDir, 'bundle.zip')
    const out = await exportReceiptsZipBundle(db, {
      company_id: companyId,
      destinationPath: dest,
    })
    expect(out.success).toBe(true)
    const listing = execSync(`unzip -l "${dest}"`).toString()
    expect(listing).toContain('receipts/42/bokfort.pdf')
  })

  it('best-effort: saknad fysisk fil → metadata-rad finns ändå', async () => {
    const { companyId } = setup()
    const f = writeSrcFile('src.pdf', 'X')
    const r = createReceipt(db, {
      company_id: companyId,
      source_path: f,
      original_filename: 'ghost.pdf',
    })
    if (!r.success) throw new Error('seed')
    // Radera fysiska filen — DB-rad finns kvar.
    const row = db
      .prepare('SELECT file_path FROM receipts WHERE id=?')
      .get(r.data.id) as { file_path: string }
    const absolute = path.resolve(
      tmpDocs,
      'Fritt Bokföring',
      row.file_path,
    )
    fs.unlinkSync(absolute)

    const dest = path.join(zipDir, 'bundle.zip')
    const out = await exportReceiptsZipBundle(db, {
      company_id: companyId,
      destinationPath: dest,
    })
    expect(out.success).toBe(true)
    const listing = execSync(`unzip -l "${dest}"`).toString()
    expect(listing).toContain('metadata.csv')
    // Inga receipts/-poster eftersom enda filen saknades på disk
    expect(listing).not.toContain('ghost.pdf')

    // Verifiera att CSV i zip:en innehåller filnamnet
    const tmpExtract = fs.mkdtempSync(path.join(os.tmpdir(), 'fritt-vs141-x-'))
    try {
      execSync(`unzip -o "${dest}" -d "${tmpExtract}"`)
      const csv = fs.readFileSync(
        path.join(tmpExtract, 'metadata.csv'),
        'utf8',
      )
      expect(csv).toContain('ghost.pdf')
    } finally {
      fs.rmSync(tmpExtract, { recursive: true, force: true })
    }
  })

  it('returnerar NOT_FOUND för okänt company_id', async () => {
    const dest = path.join(zipDir, 'bundle.zip')
    const out = await exportReceiptsZipBundle(db, {
      company_id: 99999,
      destinationPath: dest,
    })
    expect(out.success).toBe(false)
    if (out.success) return
    expect(out.code).toBe('NOT_FOUND')
  })
})

describe('VS-141 buildZipBundleFilename', () => {
  it('sanerar mellanslag och specialtecken', () => {
    const name = buildZipBundleFilename('Acme & Sons AB')
    expect(name).toMatch(/^receipts-Acme_Sons_AB-\d{8}\.zip$/)
  })

  it('faller tillbaka till "bolag" om allt saneras bort', () => {
    const name = buildZipBundleFilename('???')
    expect(name).toMatch(/^receipts-bolag-\d{8}\.zip$/)
  })
})
