/**
 * Sprint F P4 — CRUD för bank_tx_code_mappings.
 *
 * Globala ISO 20022 BkTxCd-mappningar som styr bank-fee-classifier.
 * Scope-lås per Sprint F: ingen IBAN-prefix-parsning — alla mappningar
 * gäller hela installationen. M153-deterministisk: classifier-cache
 * invalideras explicit efter upsert/delete så nästa scoring-körning
 * läser fresh mappningar.
 */
import type Database from 'better-sqlite3'
import log from 'electron-log'
import type { ErrorCode, IpcResult } from '../../../shared/types'
import {
  mapUniqueConstraintError,
  type UniqueConstraintMapping,
} from '../error-helpers'
import { invalidateClassifierCache } from './bank-fee-classifier'

export type BankTxMappingClassification = 'bank_fee' | 'interest' | 'ignore'

export interface BankTxMapping {
  id: number
  domain: string
  family: string
  subfamily: string
  classification: BankTxMappingClassification
  account_number: string | null
  created_at: string
}

export interface UpsertBankTxMappingInput {
  id?: number
  domain: string
  family: string
  subfamily: string
  classification: BankTxMappingClassification
  account_number?: string | null
}

const BANK_TX_MAPPING_UNIQUE_MAPPINGS: UniqueConstraintMapping[] = [
  {
    messageContains: ['UNIQUE constraint failed', 'bank_tx_code_mappings'],
    code: 'VALIDATION_ERROR',
    error: 'En mappning för samma Domain/Family/SubFamily finns redan.',
    field: 'subfamily',
  },
]

export function listBankTxMappings(
  db: Database.Database,
): IpcResult<BankTxMapping[]> {
  try {
    const rows = db
      .prepare(
        `SELECT id, domain, family, subfamily, classification, account_number, created_at
         FROM bank_tx_code_mappings
         ORDER BY domain, family, subfamily`,
      )
      .all() as BankTxMapping[]
    return { success: true, data: rows }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(`[bank-tx-mapping] list: ${message}`)
    return { success: false, code: 'UNEXPECTED_ERROR', error: message }
  }
}

export function upsertBankTxMapping(
  db: Database.Database,
  input: UpsertBankTxMappingInput,
): IpcResult<BankTxMapping> {
  try {
    const result = db.transaction((): BankTxMapping => {
      const accountNumber = input.account_number ?? null

      let id: number
      if (input.id !== undefined) {
        const existing = db
          .prepare('SELECT id FROM bank_tx_code_mappings WHERE id = ?')
          .get(input.id) as { id: number } | undefined
        if (!existing) {
          throw {
            code: 'NOT_FOUND' as ErrorCode,
            error: 'Mappningen hittades inte.',
          }
        }
        db.prepare(
          `UPDATE bank_tx_code_mappings
           SET domain = ?, family = ?, subfamily = ?,
               classification = ?, account_number = ?
           WHERE id = ?`,
        ).run(
          input.domain,
          input.family,
          input.subfamily,
          input.classification,
          accountNumber,
          input.id,
        )
        id = input.id
      } else {
        const r = db
          .prepare(
            `INSERT INTO bank_tx_code_mappings
             (domain, family, subfamily, classification, account_number)
             VALUES (?, ?, ?, ?, ?)`,
          )
          .run(
            input.domain,
            input.family,
            input.subfamily,
            input.classification,
            accountNumber,
          )
        id = Number(r.lastInsertRowid)
      }

      const row = db
        .prepare(
          `SELECT id, domain, family, subfamily, classification, account_number, created_at
           FROM bank_tx_code_mappings WHERE id = ?`,
        )
        .get(id) as BankTxMapping
      return row
    })()

    invalidateClassifierCache(db)
    return { success: true, data: result }
  } catch (err: unknown) {
    const mapped = mapUniqueConstraintError(
      err,
      BANK_TX_MAPPING_UNIQUE_MAPPINGS,
    )
    if (mapped) {
      return {
        success: false,
        code: mapped.code,
        error: mapped.error,
        field: mapped.field,
      }
    }
    if (err && typeof err === 'object' && 'code' in err) {
      const e = err as { code: ErrorCode; error: string; field?: string }
      log.error(`[bank-tx-mapping] upsert: ${e.code}: ${e.error}`)
      return { success: false, code: e.code, error: e.error, field: e.field }
    }
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(`[bank-tx-mapping] upsert unexpected: ${message}`)
    return { success: false, code: 'UNEXPECTED_ERROR', error: message }
  }
}

export function deleteBankTxMapping(
  db: Database.Database,
  input: { id: number },
): IpcResult<void> {
  try {
    const r = db
      .prepare('DELETE FROM bank_tx_code_mappings WHERE id = ?')
      .run(input.id)
    if (r.changes === 0) {
      return {
        success: false,
        code: 'NOT_FOUND',
        error: 'Mappningen hittades inte.',
      }
    }
    invalidateClassifierCache(db)
    return { success: true, data: undefined }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Okänt fel'
    log.error(`[bank-tx-mapping] delete: ${message}`)
    return { success: false, code: 'UNEXPECTED_ERROR', error: message }
  }
}
