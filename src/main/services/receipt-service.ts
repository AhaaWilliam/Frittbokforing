import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import archiver from 'archiver'
import type Database from 'better-sqlite3'
import { app } from 'electron'
import log from 'electron-log/main'
import type { z } from 'zod'
import type {
  IpcResult,
  ErrorCode,
  Receipt,
  ReceiptCounts,
} from '../../shared/types'
import {
  ReceiptListInputSchema,
  CreateReceiptInputSchema,
  UpdateReceiptNotesInputSchema,
  ArchiveReceiptInputSchema,
  BulkArchiveReceiptInputSchema,
  ReceiptCountsInputSchema,
  LinkReceiptToExpenseInputSchema,
  GetReceiptAbsolutePathInputSchema,
} from '../ipc-schemas'
import { validateWithZod } from './validate-with-zod'
import {
  mapUniqueConstraintError,
  type UniqueConstraintMapping,
} from './error-helpers'
import { getNow } from '../utils/now'

/**
 * Receipt-service (Sprint VS-107).
 *
 * Hanterar Inkorgen-domänen — kvitton som väntar på bokföring. Manuell
 * strategi (ingen OCR): användaren släpper PDF/bild i drop-zone, raden
 * får status='inbox'. Vid bokföring kopplas raden till en expense och
 * flyttas till status='booked' (linkReceiptToExpense). Direkt arkivering
 * tillgänglig (archiveReceipt) — t.ex. för dubbletter eller ej-relevanta
 * dokument.
 *
 * Filer lagras under <documents>/Fritt Bokföring/receipts-inbox/.
 * SHA-256-hash beräknas innan kopiering — UNIQUE (company_id, file_hash)
 * blockerar dubbel-upload av identisk fil. Hash-prefix på destinationsfilen
 * garanterar unikhet på disk när två original-namn råkar vara samma men
 * innehållet skiljer sig.
 *
 * Ingen FY-scoping (M14-undantag analogt med stamdata): kvitton är
 * input-buffert per bolag, inte transaktionsdata. När de bokförs som
 * expense tar expense-raden över FY-scope.
 */

const ROOT_FOLDER_NAME = 'Fritt Bokföring'
const INBOX_DIR = 'receipts-inbox'

const RECEIPT_UNIQUE_MAPPINGS: UniqueConstraintMapping[] = [
  {
    messageContains: ['receipts', 'file_hash'],
    code: 'RECEIPT_DUPLICATE_HASH',
    field: 'file_hash',
    error: 'Den här filen har redan laddats upp.',
  },
]

function getInboxRootDir(): string {
  return path.join(app.getPath('documents'), ROOT_FOLDER_NAME, INBOX_DIR)
}

function relativizePath(absolutePath: string): string {
  const root = path.join(app.getPath('documents'), ROOT_FOLDER_NAME)
  return path.relative(root, absolutePath)
}

function sanitizeBasename(name: string): string {
  const base = path.basename(name)
  let safe = base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
  if (safe === '' || /^\.+$/.test(safe)) safe = '_' + (safe || 'file')
  return safe
}

function hashFile(filePath: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

function detectMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const map: Record<string, string> = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.heic': 'image/heic',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.tiff': 'image/tiff',
    '.tif': 'image/tiff',
  }
  return map[ext] ?? 'application/octet-stream'
}

function mapRow(row: Record<string, unknown>): Receipt {
  return {
    id: row.id as number,
    company_id: row.company_id as number,
    file_path: row.file_path as string,
    original_filename: row.original_filename as string,
    file_hash: row.file_hash as string,
    file_size_bytes: row.file_size_bytes as number,
    mime_type: row.mime_type as string,
    uploaded_at: row.uploaded_at as string,
    status: row.status as Receipt['status'],
    expense_id: (row.expense_id as number | null) ?? null,
    notes: (row.notes as string | null) ?? null,
    archived_at: (row.archived_at as string | null) ?? null,
  }
}

/** Try-validate: vid fail returnerar IpcResult-fail; annars data. */
function parseOrFail<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; result: IpcResult<never> } {
  try {
    return { ok: true, data: validateWithZod(schema, input) }
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: string; error: string; field?: string }
      return {
        ok: false,
        result: {
          success: false,
          code: e.code as ErrorCode,
          error: e.error,
          ...(e.field ? { field: e.field } : {}),
        },
      }
    }
    throw err
  }
}

export function listReceipts(
  db: Database.Database,
  rawInput: unknown,
): IpcResult<Receipt[]> {
  const v = parseOrFail(ReceiptListInputSchema, rawInput)
  if (!v.ok) return v.result
  const input = v.data

  let sql = 'SELECT * FROM receipts WHERE company_id = ?'
  const params: unknown[] = [input.company_id]
  if (input.status) {
    sql += ' AND status = ?'
    params.push(input.status)
  }
  sql += ' ORDER BY uploaded_at DESC, id DESC'

  const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>
  return { success: true, data: rows.map(mapRow) }
}

export function getReceiptCounts(
  db: Database.Database,
  rawInput: unknown,
): IpcResult<ReceiptCounts> {
  const v = parseOrFail(ReceiptCountsInputSchema, rawInput)
  if (!v.ok) return v.result
  const input = v.data

  const rows = db
    .prepare(
      `SELECT status, COUNT(*) AS cnt
       FROM receipts
       WHERE company_id = ?
       GROUP BY status`,
    )
    .all(input.company_id) as Array<{ status: string; cnt: number }>

  const counts: ReceiptCounts = { inbox: 0, booked: 0, archived: 0 }
  for (const r of rows) {
    if (r.status === 'inbox') counts.inbox = r.cnt
    else if (r.status === 'booked') counts.booked = r.cnt
    else if (r.status === 'archived') counts.archived = r.cnt
  }
  return { success: true, data: counts }
}

export function createReceipt(
  db: Database.Database,
  rawInput: unknown,
): IpcResult<Receipt> {
  const v = parseOrFail(CreateReceiptInputSchema, rawInput)
  if (!v.ok) return v.result
  const input = v.data

  try {
    if (!fs.existsSync(input.source_path)) {
      return {
        success: false,
        error: 'Källfilen kunde inte läsas.',
        code: 'VALIDATION_ERROR',
        field: 'source_path',
      }
    }

    const stat = fs.statSync(input.source_path)
    if (!stat.isFile() || stat.size === 0) {
      return {
        success: false,
        error: 'Källfilen är tom eller är inte en fil.',
        code: 'VALIDATION_ERROR',
        field: 'source_path',
      }
    }

    const hash = hashFile(input.source_path)
    const inboxDir = getInboxRootDir()
    fs.mkdirSync(inboxDir, { recursive: true })

    const safeName = sanitizeBasename(input.original_filename)
    const targetName = `${hash.slice(0, 16)}-${safeName}`
    const targetPath = path.join(inboxDir, targetName)
    const relativePath = relativizePath(targetPath)
    const mimeType = detectMimeType(input.original_filename)

    const tx = db.transaction(() => {
      const result = db
        .prepare(
          `INSERT INTO receipts
            (company_id, file_path, original_filename, file_hash,
             file_size_bytes, mime_type, status, notes)
           VALUES (?, ?, ?, ?, ?, ?, 'inbox', ?)`,
        )
        .run(
          input.company_id,
          relativePath,
          input.original_filename.slice(0, 512),
          hash,
          stat.size,
          mimeType,
          input.notes ?? null,
        )
      if (!fs.existsSync(targetPath)) {
        fs.copyFileSync(input.source_path, targetPath)
      }
      return result.lastInsertRowid as number | bigint
    })

    const id = Number(tx())
    const row = db
      .prepare('SELECT * FROM receipts WHERE id = ?')
      .get(id) as Record<string, unknown>
    return { success: true, data: mapRow(row) }
  } catch (err: unknown) {
    const mapped = mapUniqueConstraintError(err, RECEIPT_UNIQUE_MAPPINGS)
    if (mapped) {
      return {
        success: false,
        error: mapped.error,
        code: mapped.code,
        ...(mapped.field ? { field: mapped.field } : {}),
      }
    }
    if (err && typeof err === 'object' && 'code' in err && 'error' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      return { success: false, error: e.error, code: e.code, field: e.field }
    }
    log.error('[receipt-service] createReceipt:', err)
    return {
      success: false,
      error: 'Det gick inte att spara kvittot.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

export function updateReceiptNotes(
  db: Database.Database,
  rawInput: unknown,
): IpcResult<Receipt> {
  const v = parseOrFail(UpdateReceiptNotesInputSchema, rawInput)
  if (!v.ok) return v.result
  const input = v.data

  const result = db
    .prepare('UPDATE receipts SET notes = ? WHERE id = ? AND company_id = ?')
    .run(input.notes, input.id, input.company_id)
  if (result.changes === 0) {
    return {
      success: false,
      error: 'Kvittot hittades inte.',
      code: 'RECEIPT_NOT_FOUND',
    }
  }
  const row = db
    .prepare('SELECT * FROM receipts WHERE id = ?')
    .get(input.id) as Record<string, unknown>
  return { success: true, data: mapRow(row) }
}

export function archiveReceipt(
  db: Database.Database,
  rawInput: unknown,
): IpcResult<Receipt> {
  const v = parseOrFail(ArchiveReceiptInputSchema, rawInput)
  if (!v.ok) return v.result
  const input = v.data

  const row = db
    .prepare('SELECT * FROM receipts WHERE id = ? AND company_id = ?')
    .get(input.id, input.company_id) as Record<string, unknown> | undefined
  if (!row) {
    return {
      success: false,
      error: 'Kvittot hittades inte.',
      code: 'RECEIPT_NOT_FOUND',
    }
  }
  if (row.status === 'booked') {
    return {
      success: false,
      error:
        'Kvittot är bokfört och kan inte arkiveras. Avbokföra kostnaden först.',
      code: 'RECEIPT_BOOKED',
    }
  }
  db.prepare(
    `UPDATE receipts SET status = 'archived', archived_at = ?
     WHERE id = ?`,
  ).run(getNow().toISOString(), input.id)
  const updated = db
    .prepare('SELECT * FROM receipts WHERE id = ?')
    .get(input.id) as Record<string, unknown>
  return { success: true, data: mapRow(updated) }
}

export function bulkArchiveReceipts(
  db: Database.Database,
  rawInput: unknown,
): IpcResult<{
  succeeded: number[]
  failed: Array<{ id: number; code: ErrorCode; error: string }>
}> {
  const v = parseOrFail(BulkArchiveReceiptInputSchema, rawInput)
  if (!v.ok) return v.result
  const input = v.data

  const succeeded: number[] = []
  const failed: Array<{ id: number; code: ErrorCode; error: string }> = []

  const tx = db.transaction(() => {
    for (const id of input.ids) {
      const result = archiveReceipt(db, {
        id,
        company_id: input.company_id,
      })
      if (result.success) {
        succeeded.push(id)
      } else {
        failed.push({ id, code: result.code, error: result.error })
      }
    }
  })
  tx()

  return { success: true, data: { succeeded, failed } }
}

/**
 * Permanent radering — bara för rader med status='inbox' eller 'archived'.
 * Booked-rader är låsta tills expense-bokföringen är borttagen. Filen på
 * disk raderas best-effort efter DB-rad är borta.
 */
export function deleteReceipt(
  db: Database.Database,
  rawInput: unknown,
): IpcResult<{ deleted: boolean }> {
  const v = parseOrFail(ArchiveReceiptInputSchema, rawInput)
  if (!v.ok) return v.result
  const input = v.data

  const row = db
    .prepare(
      'SELECT id, status, file_path FROM receipts WHERE id = ? AND company_id = ?',
    )
    .get(input.id, input.company_id) as
    | { id: number; status: string; file_path: string }
    | undefined
  if (!row) {
    return {
      success: false,
      error: 'Kvittot hittades inte.',
      code: 'RECEIPT_NOT_FOUND',
    }
  }
  if (row.status === 'booked') {
    return {
      success: false,
      error: 'Bokförda kvitton kan inte raderas.',
      code: 'RECEIPT_BOOKED',
    }
  }
  db.prepare('DELETE FROM receipts WHERE id = ?').run(input.id)

  try {
    const root = path.join(app.getPath('documents'), ROOT_FOLDER_NAME)
    const absolute = path.resolve(root, row.file_path)
    if (absolute.startsWith(root) && fs.existsSync(absolute)) {
      fs.unlinkSync(absolute)
    }
  } catch (err) {
    log.warn('[receipt-service] deleteReceipt fil-cleanup:', err)
  }

  return { success: true, data: { deleted: true } }
}

/**
 * Publik: kopplar en inbox-receipt till en redan skapad expense och
 * uppdaterar expenses.receipt_path så att UI-flöden visar kvittot. Wrapper
 * runt _linkReceiptToExpenseTx — skapar en egen transaktion.
 */
export function linkReceiptToExpense(
  db: Database.Database,
  rawInput: unknown,
): IpcResult<{ linked: boolean }> {
  const v = parseOrFail(LinkReceiptToExpenseInputSchema, rawInput)
  if (!v.ok) return v.result
  const input = v.data

  try {
    db.transaction(() => {
      _linkReceiptToExpenseTx(
        db,
        input.receipt_id,
        input.company_id,
        input.expense_id,
      )
      // Spegla file_path till expenses.receipt_path så att existerande
      // expense-vyer (preview, PDF) hittar kvittot. Receipts behåller sin
      // kanoniska file_path; expenses.receipt_path duplicerar för bakåt-
      // kompatibilitet med VS-1-storage. När inbox-flödet är dominerande
      // kan duplicering tas bort.
      const r = db
        .prepare('SELECT file_path FROM receipts WHERE id = ?')
        .get(input.receipt_id) as { file_path: string } | undefined
      if (r) {
        db.prepare('UPDATE expenses SET receipt_path = ? WHERE id = ?').run(
          r.file_path,
          input.expense_id,
        )
      }
    })()
    return { success: true, data: { linked: true } }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && 'error' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      return { success: false, error: e.error, code: e.code, field: e.field }
    }
    log.error('[receipt-service] linkReceiptToExpense:', err)
    return {
      success: false,
      error: 'Kunde inte koppla kvittot till kostnaden.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

/**
 * Internt: kallas från expense-service när en expense skapas/bokförs från
 * en inbox-receipt. Sätter status='booked' och expense_id. Kastar
 * strukturerat fel (M100) om receipt inte finns eller redan är kopplad.
 *
 * Antar att caller redan är inom en db.transaction().
 */
export function _linkReceiptToExpenseTx(
  db: Database.Database,
  receiptId: number,
  companyId: number,
  expenseId: number,
): void {
  const row = db
    .prepare('SELECT id, status FROM receipts WHERE id = ? AND company_id = ?')
    .get(receiptId, companyId) as { id: number; status: string } | undefined
  if (!row) {
    throw {
      code: 'RECEIPT_NOT_FOUND' as ErrorCode,
      error: 'Kvittot hittades inte.',
    }
  }
  if (row.status !== 'inbox') {
    throw {
      code: 'VALIDATION_ERROR' as ErrorCode,
      error: 'Kvittot är inte i Inkorgen.',
      field: 'receipt_id',
    }
  }
  db.prepare(
    `UPDATE receipts
     SET status = 'booked', expense_id = ?
     WHERE id = ?`,
  ).run(expenseId, receiptId)
}

/**
 * Internt: kallas från expense-service när en expense raderas (utkast)
 * eller avbokförs. Återställer receipt till status='inbox'.
 */
export function _unlinkReceiptFromExpenseTx(
  db: Database.Database,
  expenseId: number,
): void {
  db.prepare(
    `UPDATE receipts
     SET status = 'inbox', expense_id = NULL
     WHERE expense_id = ? AND status = 'booked'`,
  ).run(expenseId)
}

/**
 * Sprint VS-123 — exportReceiptsCsv.
 *
 * Genererar CSV-export av alla receipts för ett bolag (alla statusar).
 * Format: ; som separator (svensk excel-kompatibilitet), CRLF radslut,
 * BOM för UTF-8-detektering. För revisor som vill ha lista över kvitton
 * (BFL 7 kap-arkivkrav).
 *
 * Returnerar `{ csv, filename }`. Skrivning till disk + dialog hanteras
 * i IPC-handlern.
 */
export function exportReceiptsCsv(
  db: Database.Database,
  input: { company_id: number },
): IpcResult<{ csv: string; filename: string }> {
  const company = db
    .prepare('SELECT id, name, org_number FROM companies WHERE id = ?')
    .get(input.company_id) as
    | { id: number; name: string; org_number: string }
    | undefined
  if (!company) {
    return {
      success: false,
      error: 'Bolaget hittades inte.',
      code: 'NOT_FOUND' as ErrorCode,
    }
  }

  const rows = db
    .prepare(
      `SELECT r.id, r.status, r.original_filename, r.file_size_bytes,
              r.mime_type, r.file_hash, r.expense_id, r.uploaded_at,
              r.archived_at, r.notes,
              e.supplier_invoice_number AS expense_invoice_number
       FROM receipts r
       LEFT JOIN expenses e ON e.id = r.expense_id
       WHERE r.company_id = ?
       ORDER BY r.uploaded_at DESC, r.id DESC`,
    )
    .all(input.company_id) as Array<{
    id: number
    status: string
    original_filename: string
    file_size_bytes: number
    mime_type: string
    file_hash: string
    expense_id: number | null
    uploaded_at: string
    archived_at: string | null
    notes: string | null
    expense_invoice_number: string | null
  }>

  const headers = [
    'ID',
    'Status',
    'Filnamn',
    'Storlek (bytes)',
    'MIME-typ',
    'SHA-256',
    'Expense-ID',
    'Leverantörsfaktura-nr',
    'Uppladdad',
    'Arkiverad',
    'Anteckningar',
  ]
  const lines = [headers.map(escapeCsv).join(';')]
  for (const r of rows) {
    lines.push(
      [
        r.id.toString(),
        r.status,
        r.original_filename,
        r.file_size_bytes.toString(),
        r.mime_type,
        r.file_hash,
        r.expense_id?.toString() ?? '',
        r.expense_invoice_number ?? '',
        r.uploaded_at,
        r.archived_at ?? '',
        r.notes ?? '',
      ]
        .map(escapeCsv)
        .join(';'),
    )
  }
  // BOM + CRLF för excel-kompatibilitet
  const csv = '﻿' + lines.join('\r\n') + '\r\n'

  // Filename: Kvitton_OrgNr_YYYYMMDD.csv
  const date = getNow()
  const ymd =
    date.getFullYear().toString() +
    String(date.getMonth() + 1).padStart(2, '0') +
    String(date.getDate()).padStart(2, '0')
  const safeOrg = company.org_number.replace(/[^0-9-]/g, '')
  const filename = `Kvitton_${safeOrg}_${ymd}.csv`

  return { success: true, data: { csv, filename } }
}

function escapeCsv(v: string): string {
  // Escape ", ;, CR, LF genom dubbla " + omslutande quotes
  if (/[";\r\n]/.test(v)) {
    return '"' + v.replace(/"/g, '""') + '"'
  }
  return v
}

/**
 * Sprint VS-141 — exportReceiptsZipBundle.
 *
 * BFL 7 kap-konform arkivexport. Bundlar metadata.csv (samma källa som
 * VS-123 exportReceiptsCsv) tillsammans med alla fysiska kvittofiler
 * under `receipts/<expense_id>/<basename>` i en ZIP. Streamar direkt till
 * disk via archiver; minnesfotavtryck oberoende av antal/storlek.
 *
 * Best-effort på filer som saknas på disk: metadata-raden finns ändå i
 * CSV:n, en varning loggas, exporten fortsätter.
 *
 * Filnamn: receipts-<saneratbolagsnamn>-<YYYYMMDD>.zip.
 *
 * Skrivning till disk + dialog hanteras i IPC-handlern. Denna funktion
 * tar destinationsväg och returnerar `{ filename }` (basenamnet, för
 * UI-bekräftelse).
 */
export async function exportReceiptsZipBundle(
  db: Database.Database,
  input: { company_id: number; destinationPath: string },
): Promise<IpcResult<{ filename: string }>> {
  const company = db
    .prepare('SELECT id, name, org_number FROM companies WHERE id = ?')
    .get(input.company_id) as
    | { id: number; name: string; org_number: string }
    | undefined
  if (!company) {
    return {
      success: false,
      error: 'Bolaget hittades inte.',
      code: 'NOT_FOUND' as ErrorCode,
    }
  }

  const csvResult = exportReceiptsCsv(db, { company_id: input.company_id })
  if (!csvResult.success) return csvResult

  const rows = db
    .prepare(
      `SELECT id, expense_id, original_filename, file_path
       FROM receipts
       WHERE company_id = ?
       ORDER BY id ASC`,
    )
    .all(input.company_id) as Array<{
    id: number
    expense_id: number | null
    original_filename: string
    file_path: string
  }>

  const documentsRoot = path.join(app.getPath('documents'), ROOT_FOLDER_NAME)
  const filename = path.basename(input.destinationPath)

  try {
    await new Promise<void>((resolve, reject) => {
      const output = fs.createWriteStream(input.destinationPath)
      const archive = archiver('zip', { zlib: { level: 9 } })

      output.on('close', () => resolve())
      output.on('error', (err) => reject(err))
      archive.on('error', (err) => reject(err))
      archive.on('warning', (err) => {
        log.warn('[receipt-service] zip-warning:', err)
      })

      archive.pipe(output)

      // metadata.csv i roten — samma rad-källa som VS-123.
      archive.append(Buffer.from(csvResult.data.csv, 'utf8'), {
        name: 'metadata.csv',
      })

      // Fysiska filer: receipts/<expense_id>/<basename>. Saknad expense_id
      // → "unbooked"-katalog så att struktur förblir deterministisk.
      for (const r of rows) {
        const absolute = path.resolve(documentsRoot, r.file_path)
        if (!absolute.startsWith(documentsRoot)) {
          log.warn(
            '[receipt-service] zip: file_path utanför documents-root:',
            r.file_path,
          )
          continue
        }
        if (!fs.existsSync(absolute)) {
          log.warn('[receipt-service] zip: fil saknas på disk:', absolute)
          continue
        }
        const folder = r.expense_id !== null ? String(r.expense_id) : 'unbooked'
        const basename = sanitizeBasename(r.original_filename)
        archive.file(absolute, {
          name: `receipts/${folder}/${basename}`,
        })
      }

      archive.finalize().catch(reject)
    })

    return { success: true, data: { filename } }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && 'error' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      return { success: false, error: e.error, code: e.code, field: e.field }
    }
    log.error('[receipt-service] exportReceiptsZipBundle:', err)
    return {
      success: false,
      error: 'Det gick inte att skapa ZIP-bundle.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

/**
 * Sprint VS-143 — getReceiptAbsolutePath.
 *
 * Resolverar en relativ receipt-path (mot <documents>/Fritt Bokföring/) till
 * en absolut `file://`-URL som renderer kan ladda i `<iframe>`/`<img>`.
 * Path-traversal-skydd: resultatet måste börja med documents-roten — annars
 * `INVALID_PATH`. Filen måste existera — annars `NOT_FOUND`.
 *
 * Samma resolutions-mönster som `exportReceiptsZipBundle` (path.resolve +
 * startsWith-guard). Renderer får aldrig konstruera file://-URL själv —
 * Electron säkerhets-mönstret är att main process äger filsystem-resolution.
 */
export function getReceiptAbsolutePath(
  rawInput: unknown,
): IpcResult<{ url: string }> {
  const v = parseOrFail(GetReceiptAbsolutePathInputSchema, rawInput)
  if (!v.ok) return v.result
  const input = v.data

  const documentsRoot = path.join(app.getPath('documents'), ROOT_FOLDER_NAME)
  const absolute = path.resolve(documentsRoot, input.receipt_path)

  // Path-traversal-skydd. Använd path.sep-medveten check via relative.
  const rel = path.relative(documentsRoot, absolute)
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return {
      success: false,
      error: 'Ogiltig kvitto-path.',
      code: 'VALIDATION_ERROR',
      field: 'receipt_path',
    }
  }

  if (!fs.existsSync(absolute)) {
    return {
      success: false,
      error: 'Kvittofilen kunde inte hittas på disk.',
      code: 'NOT_FOUND',
    }
  }

  // file://-URL: encodera path-segment per segment för att bevara `/`-
  // separatorer. På macOS/Linux är detta /a/b → file:///a/b. På Windows
  // C:\a\b → file:///C:/a/b efter konvertering.
  const normalized = absolute.split(path.sep).join('/')
  const prefix = normalized.startsWith('/') ? 'file://' : 'file:///'
  const url = prefix + normalized.split('/').map(encodeURIComponent).join('/')

  return { success: true, data: { url } }
}

/**
 * VS-141: bygger default-filnamn för zip-bundle baserat på bolagsnamn +
 * dagens datum. Renderer-callsites läser filnamnet från service-respons,
 * IPC-handler använder denna helper för dialog-default + E2E-bypass.
 */
export function buildZipBundleFilename(companyName: string): string {
  const safe =
    companyName
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 80) || 'bolag'
  const d = getNow()
  const ymd =
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0')
  return `receipts-${safe}-${ymd}.zip`
}
