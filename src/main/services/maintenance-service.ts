import type Database from 'better-sqlite3'
import type { IpcResult } from '../../shared/types'
import log from 'electron-log/main'

export interface VacuumResult {
  before_bytes: number
  after_bytes: number
}

/**
 * Kör VACUUM på databasen och returnerar storlek före/efter (E2).
 *
 * WAL-checkpoint körs först för att committa alla WAL-sidor till
 * huvud-databasen, sedan VACUUM för att kompaktera. Resultatet inkluderar
 * exakta byte-storlekar.
 */
export function vacuumDatabase(db: Database.Database): IpcResult<VacuumResult> {
  try {
    // 1. Hämta storlek FÖRE VACUUM
    const pageSizeBefore = db.pragma('page_size', { simple: true }) as number
    const pageCountBefore = db.pragma('page_count', { simple: true }) as number
    const beforeBytes = pageSizeBefore * pageCountBefore

    // 2. WAL-checkpoint: flushar WAL till huvud-DB för exakt VACUUM-effekt
    db.pragma('wal_checkpoint(TRUNCATE)')

    // 3. VACUUM
    db.exec('VACUUM')

    // 4. Hämta storlek EFTER VACUUM
    const pageSizeAfter = db.pragma('page_size', { simple: true }) as number
    const pageCountAfter = db.pragma('page_count', { simple: true }) as number
    const afterBytes = pageSizeAfter * pageCountAfter

    log.info(
      `[maintenance] VACUUM klar: ${beforeBytes} → ${afterBytes} bytes ` +
        `(frigjorde ${beforeBytes - afterBytes} bytes)`,
    )

    return {
      success: true,
      data: { before_bytes: beforeBytes, after_bytes: afterBytes },
    }
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && 'error' in err) {
      const e = err as { code: string; error: string }
      log.error('[maintenance] vacuumDatabase strukturerat fel:', e.error)
      return {
        success: false,
        code: e.code as import('../../shared/types').ErrorCode,
        error: e.error,
      }
    }
    if (err instanceof Error) {
      log.error('[maintenance] vacuumDatabase fel:', err)
      return {
        success: false,
        code: 'UNEXPECTED_ERROR',
        error: 'VACUUM misslyckades',
      }
    }
    log.error('[maintenance] vacuumDatabase okänt fel:', err)
    return {
      success: false,
      code: 'UNEXPECTED_ERROR',
      error: 'VACUUM misslyckades',
    }
  }
}
