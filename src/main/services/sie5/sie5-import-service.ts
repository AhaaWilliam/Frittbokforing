/**
 * SIE5 import service — spegling av SIE4 import-service.
 *
 * Återanvänder `importSie4` eftersom `parseSie5` returnerar samma
 * `SieParseResult`-struktur. Fördelen: all affärslogik (strategier,
 * I-serie, konto-merge, conflict resolution, FY-matchning, partial
 * success) delas exakt med SIE4 — ingen drift mellan format.
 *
 * M145-paritet:
 * - Strategier: 'new' | 'merge'
 * - I-serien för importerade verifikationer
 * - Partial success (obalanserade hoppas över med warning)
 * - Sign handling: positivt = debit, negativt = credit
 */
import type Database from 'better-sqlite3'
import type { SieParseResult } from '../sie4/sie4-import-parser'
import type { IpcResult } from '../../../shared/types'
import {
  importSie4,
  type ImportOptions,
  type ImportResult,
} from '../sie4/sie4-import-service'

export type { ImportOptions, ImportResult, ConflictResolution } from '../sie4/sie4-import-service'
export type { ImportStrategy } from '../sie4/sie4-import-service'

export function importSie5(
  db: Database.Database,
  parseResult: SieParseResult,
  options: ImportOptions,
): IpcResult<ImportResult> {
  return importSie4(db, parseResult, options)
}
