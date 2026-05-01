import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { app } from 'electron'
import log from 'electron-log/main'
import type { IpcResult, ErrorCode } from '../../shared/types'
import { getNow } from '../utils/now'

/**
 * Receipt-storage-service (VS-1).
 *
 * Ansvar: kopiera kvitto-fil till
 *   <documents>/Fritt Bokföring/receipts/<expense_id>/<basename>
 * och uppdatera `expenses.receipt_path` med relativ path mot
 * <documents>/Fritt Bokföring/.
 *
 * BFL 7 kap arkivering: filerna ligger utanför DB men under samma
 * Documents/Fritt Bokföring/-rot som backup-tjänsten. Backup täcker dem
 * implicit om användaren backar upp hela mappen.
 *
 * Best-effort: om receipt-attach failar (disk full, fil saknas) lämnas
 * draft kvar utan receipt_path — fakturan blir bokförd ändå.
 *
 * Tid via getNow() (M150) för deterministisk dedup-prefix vid test.
 */

const ROOT_FOLDER_NAME = 'Fritt Bokföring'
const RECEIPTS_DIR = 'receipts'

export function getReceiptsRootDir(): string {
  return path.join(app.getPath('documents'), ROOT_FOLDER_NAME, RECEIPTS_DIR)
}

function relativizePath(absolutePath: string): string {
  const root = path.join(app.getPath('documents'), ROOT_FOLDER_NAME)
  return path.relative(root, absolutePath)
}

/**
 * Sanera basename: behåll alfanum, bindestreck, understreck, punkt.
 * Andra tecken → '_'. Förhindrar path-traversal och konstiga filnamn.
 */
function sanitizeBasename(name: string): string {
  const base = path.basename(name)
  return base.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 200)
}

/**
 * Returnerar målpath, lägger till timestamp-prefix om filen redan finns.
 */
function resolveTargetPath(targetDir: string, sourceName: string): string {
  const safe = sanitizeBasename(sourceName)
  const candidate = path.join(targetDir, safe)
  if (!fs.existsSync(candidate)) return candidate
  const ts = getNow().getTime()
  const ext = path.extname(safe)
  const stem = safe.slice(0, safe.length - ext.length)
  return path.join(targetDir, `${stem}-${ts}${ext}`)
}

export function saveReceiptFile(
  db: Database.Database,
  input: { expense_id: number; source_file_path: string },
): IpcResult<{ receipt_path: string }> {
  try {
    const expense = db
      .prepare('SELECT id, status FROM expenses WHERE id = ?')
      .get(input.expense_id) as { id: number; status: string } | undefined
    if (!expense) {
      return {
        success: false,
        error: 'Kostnaden hittades inte.',
        code: 'EXPENSE_NOT_FOUND' as ErrorCode,
      }
    }

    if (!fs.existsSync(input.source_file_path)) {
      return {
        success: false,
        error: 'Källfilen kunde inte läsas.',
        code: 'VALIDATION_ERROR',
        field: 'source_file_path',
      }
    }

    const targetDir = path.join(getReceiptsRootDir(), String(expense.id))
    fs.mkdirSync(targetDir, { recursive: true })

    const targetPath = resolveTargetPath(
      targetDir,
      path.basename(input.source_file_path),
    )
    fs.copyFileSync(input.source_file_path, targetPath)

    const relativePath = relativizePath(targetPath)
    db.prepare('UPDATE expenses SET receipt_path = ? WHERE id = ?').run(
      relativePath,
      expense.id,
    )

    return { success: true, data: { receipt_path: relativePath } }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      return { success: false, error: e.error, code: e.code, field: e.field }
    }
    log.error('[receipt-storage] saveReceiptFile:', err)
    return {
      success: false,
      error: 'Det gick inte att spara kvittot.',
      code: 'UNEXPECTED_ERROR',
    }
  }
}
