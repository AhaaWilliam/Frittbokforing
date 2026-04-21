/**
 * Sprint U1 — SEPA Direct Debit (pain.008) backend MVP.
 *
 * Hanterar mandat och uppsamlings-rader (collections) för SEPA DD där
 * företaget initierar dragning från kundens konto. Själva filen (pain.008)
 * genereras i pain008-export-service.ts.
 *
 * Batchar använder `payment_batches`-tabellen med `batch_type='direct_debit'`
 * (M146 polymorft mönster — samma table för invoice/expense/direct_debit).
 *
 * Backend-only MVP — ingen renderer-UI i denna sprint.
 */
import type Database from 'better-sqlite3'
import type { IpcResult, ErrorCode } from '../../../shared/types'
import log from 'electron-log'

// ═══ Types ═══

export type SepaSequenceType = 'OOFF' | 'FRST' | 'RCUR' | 'FNAL'
export type SepaMandateStatus = 'active' | 'revoked'
export type SepaCollectionStatus =
  | 'pending'
  | 'exported'
  | 'settled'
  | 'failed'

export interface SepaMandate {
  id: number
  counterparty_id: number
  mandate_reference: string
  signature_date: string
  sequence_type: SepaSequenceType
  iban: string
  bic: string | null
  status: SepaMandateStatus
  created_at: string
}

export interface SepaCollection {
  id: number
  fiscal_year_id: number
  mandate_id: number
  invoice_id: number | null
  amount_ore: number
  collection_date: string
  status: SepaCollectionStatus
  payment_batch_id: number | null
  created_at: string
}

export interface CreateMandateInput {
  counterparty_id: number
  mandate_reference: string
  signature_date: string
  sequence_type: SepaSequenceType
  iban: string
  bic?: string | null
}

export interface CreateCollectionInput {
  fiscal_year_id: number
  mandate_id: number
  invoice_id?: number | null
  amount_ore: number
  collection_date: string
}

export interface CreateDirectDebitBatchInput {
  fiscal_year_id: number
  collection_ids: number[]
  payment_date: string
  account_number: string
  user_note?: string | null
}

interface StructuredError {
  code: ErrorCode
  error: string
  field?: string
}

// ═══ Helpers ═══

function fail(code: ErrorCode, error: string, field?: string): never {
  const e: StructuredError = { code, error }
  if (field !== undefined) e.field = field
  throw e
}

function catchStructured<T>(
  fn: () => T,
  fallback: string,
): IpcResult<T> {
  try {
    return { success: true, data: fn() }
  } catch (err: unknown) {
    if (
      err != null &&
      typeof err === 'object' &&
      'code' in err &&
      'error' in err
    ) {
      const se = err as StructuredError
      return {
        success: false,
        code: se.code,
        error: se.error,
        ...(se.field != null ? { field: se.field } : {}),
      }
    }
    if (err instanceof Error) {
      log.error('sepa-dd-service unexpected error:', err)
      return { success: false, code: 'UNEXPECTED_ERROR', error: err.message }
    }
    log.error('sepa-dd-service unknown error:', err)
    return { success: false, code: 'UNEXPECTED_ERROR', error: fallback }
  }
}

// Basic IBAN sanity check — 15–34 alphanumeric, uppercase.
// Full mod-97 validering är backlog.
function normalizeIban(iban: string): string {
  return iban.replace(/\s+/g, '').toUpperCase()
}

function isValidIban(iban: string): boolean {
  const normalized = normalizeIban(iban)
  return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(normalized)
}

function isValidBic(bic: string): boolean {
  // 8 or 11 alphanumeric uppercase
  return /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic.toUpperCase())
}

// ═══ Public API ═══

export function createMandate(
  db: Database.Database,
  input: CreateMandateInput,
): IpcResult<SepaMandate> {
  return catchStructured(
    () =>
      db.transaction(() => {
        // Validate counterparty exists
        const cp = db
          .prepare('SELECT id FROM counterparties WHERE id = ?')
          .get(input.counterparty_id) as { id: number } | undefined
        if (!cp) {
          fail('COUNTERPARTY_NOT_FOUND', 'Motpart hittades inte')
        }

        if (!input.mandate_reference.trim()) {
          fail(
            'VALIDATION_ERROR',
            'Mandate-referens krävs',
            'mandate_reference',
          )
        }
        if (input.mandate_reference.length > 35) {
          fail(
            'VALIDATION_ERROR',
            'Mandate-referens får max vara 35 tecken (pain.008-begränsning)',
            'mandate_reference',
          )
        }

        const iban = normalizeIban(input.iban)
        if (!isValidIban(iban)) {
          fail('VALIDATION_ERROR', 'Ogiltigt IBAN-format', 'iban')
        }

        if (input.bic && !isValidBic(input.bic)) {
          fail('VALIDATION_ERROR', 'Ogiltigt BIC-format', 'bic')
        }

        // Check uniqueness (UNIQUE on mandate_reference → DB enforces, but
        // we give a nicer error).
        const existing = db
          .prepare(
            'SELECT id FROM sepa_dd_mandates WHERE mandate_reference = ?',
          )
          .get(input.mandate_reference) as { id: number } | undefined
        if (existing) {
          fail(
            'VALIDATION_ERROR',
            'Mandate-referens används redan',
            'mandate_reference',
          )
        }

        const result = db
          .prepare(
            `INSERT INTO sepa_dd_mandates
             (counterparty_id, mandate_reference, signature_date,
              sequence_type, iban, bic, status)
             VALUES (?, ?, ?, ?, ?, ?, 'active')`,
          )
          .run(
            input.counterparty_id,
            input.mandate_reference,
            input.signature_date,
            input.sequence_type,
            iban,
            input.bic ?? null,
          )

        const row = db
          .prepare('SELECT * FROM sepa_dd_mandates WHERE id = ?')
          .get(result.lastInsertRowid as number) as SepaMandate
        return row
      })(),
    'Kunde inte skapa mandat',
  )
}

export function listMandates(
  db: Database.Database,
  counterpartyId: number,
): IpcResult<SepaMandate[]> {
  return catchStructured(
    () =>
      db
        .prepare(
          `SELECT * FROM sepa_dd_mandates
           WHERE counterparty_id = ?
           ORDER BY created_at DESC`,
        )
        .all(counterpartyId) as SepaMandate[],
    'Kunde inte hämta mandat',
  )
}

export function revokeMandate(
  db: Database.Database,
  mandateId: number,
): IpcResult<{ id: number }> {
  return catchStructured(
    () =>
      db.transaction(() => {
        const mandate = db
          .prepare('SELECT status FROM sepa_dd_mandates WHERE id = ?')
          .get(mandateId) as { status: SepaMandateStatus } | undefined
        if (!mandate) {
          fail('NOT_FOUND', 'Mandat hittades inte')
        }
        if (mandate.status === 'revoked') {
          fail('VALIDATION_ERROR', 'Mandat är redan återkallat')
        }
        db.prepare(
          "UPDATE sepa_dd_mandates SET status = 'revoked' WHERE id = ?",
        ).run(mandateId)
        return { id: mandateId }
      })(),
    'Kunde inte återkalla mandat',
  )
}

export function createCollection(
  db: Database.Database,
  input: CreateCollectionInput,
): IpcResult<SepaCollection> {
  return catchStructured(
    () =>
      db.transaction(() => {
        // Validate mandate exists + active
        const mandate = db
          .prepare('SELECT status FROM sepa_dd_mandates WHERE id = ?')
          .get(input.mandate_id) as { status: SepaMandateStatus } | undefined
        if (!mandate) {
          fail('NOT_FOUND', 'Mandat hittades inte', 'mandate_id')
        }
        if (mandate.status !== 'active') {
          fail(
            'VALIDATION_ERROR',
            'Mandatet är inte aktivt',
            'mandate_id',
          )
        }

        // Validate fiscal year exists
        const fy = db
          .prepare('SELECT id FROM fiscal_years WHERE id = ?')
          .get(input.fiscal_year_id) as { id: number } | undefined
        if (!fy) {
          fail('NOT_FOUND', 'Räkenskapsår hittades inte', 'fiscal_year_id')
        }

        if (input.invoice_id != null) {
          const inv = db
            .prepare('SELECT id FROM invoices WHERE id = ?')
            .get(input.invoice_id) as { id: number } | undefined
          if (!inv) {
            fail('INVOICE_NOT_FOUND', 'Faktura hittades inte', 'invoice_id')
          }
        }

        if (!Number.isInteger(input.amount_ore) || input.amount_ore <= 0) {
          fail(
            'VALIDATION_ERROR',
            'Belopp måste vara ett positivt heltal (öre)',
            'amount_ore',
          )
        }

        const result = db
          .prepare(
            `INSERT INTO sepa_dd_collections
             (fiscal_year_id, mandate_id, invoice_id, amount_ore,
              collection_date, status)
             VALUES (?, ?, ?, ?, ?, 'pending')`,
          )
          .run(
            input.fiscal_year_id,
            input.mandate_id,
            input.invoice_id ?? null,
            input.amount_ore,
            input.collection_date,
          )

        const row = db
          .prepare('SELECT * FROM sepa_dd_collections WHERE id = ?')
          .get(result.lastInsertRowid as number) as SepaCollection
        return row
      })(),
    'Kunde inte skapa SEPA-uppsamling',
  )
}

export interface SepaCollectionWithJoins extends SepaCollection {
  mandate_reference: string
  counterparty_id: number
  counterparty_name: string
  invoice_number: number | null
}

export interface SepaDirectDebitBatch {
  id: number
  fiscal_year_id: number
  payment_date: string
  account_number: string
  status: string
  user_note: string | null
  exported_at: string | null
  export_format: string | null
  export_filename: string | null
  created_at: string
  collection_count: number
  total_amount_ore: number
}

export function listCollections(
  db: Database.Database,
  fiscalYearId: number,
): IpcResult<SepaCollectionWithJoins[]> {
  return catchStructured(
    () =>
      db
        .prepare(
          `SELECT c.*,
                  m.mandate_reference,
                  m.counterparty_id,
                  cp.name AS counterparty_name,
                  i.invoice_number AS invoice_number
           FROM sepa_dd_collections c
           JOIN sepa_dd_mandates m ON m.id = c.mandate_id
           JOIN counterparties cp ON cp.id = m.counterparty_id
           LEFT JOIN invoices i ON i.id = c.invoice_id
           WHERE c.fiscal_year_id = ?
           ORDER BY c.collection_date DESC, c.id DESC`,
        )
        .all(fiscalYearId) as SepaCollectionWithJoins[],
    'Kunde inte hämta SEPA-uppsamlingar',
  )
}

export function listDirectDebitBatches(
  db: Database.Database,
  fiscalYearId: number,
): IpcResult<SepaDirectDebitBatch[]> {
  return catchStructured(
    () =>
      db
        .prepare(
          `SELECT b.id, b.fiscal_year_id, b.payment_date, b.account_number,
                  b.status, b.user_note, b.exported_at, b.export_format,
                  b.export_filename, b.created_at,
                  COUNT(c.id) AS collection_count,
                  COALESCE(SUM(c.amount_ore), 0) AS total_amount_ore
           FROM payment_batches b
           LEFT JOIN sepa_dd_collections c ON c.payment_batch_id = b.id
           WHERE b.batch_type = 'direct_debit'
             AND b.fiscal_year_id = ?
           GROUP BY b.id
           ORDER BY b.payment_date DESC, b.id DESC`,
        )
        .all(fiscalYearId) as SepaDirectDebitBatch[],
    'Kunde inte hämta SEPA DD-batchar',
  )
}

export function createDirectDebitBatch(
  db: Database.Database,
  input: CreateDirectDebitBatchInput,
): IpcResult<{ batch_id: number; collection_count: number }> {
  return catchStructured(
    () =>
      db.transaction(() => {
        if (input.collection_ids.length === 0) {
          fail(
            'VALIDATION_ERROR',
            'Minst en uppsamling krävs',
            'collection_ids',
          )
        }

        // Validate fiscal year
        const fy = db
          .prepare('SELECT id FROM fiscal_years WHERE id = ?')
          .get(input.fiscal_year_id) as { id: number } | undefined
        if (!fy) {
          fail('NOT_FOUND', 'Räkenskapsår hittades inte', 'fiscal_year_id')
        }

        // Validate account
        const acct = db
          .prepare(
            'SELECT account_number FROM accounts WHERE account_number = ?',
          )
          .get(input.account_number) as { account_number: string } | undefined
        if (!acct) {
          fail(
            'ACCOUNT_NOT_FOUND',
            'Kontot hittades inte',
            'account_number',
          )
        }

        // Validate all collections exist + are pending + belong to fy
        const placeholders = input.collection_ids.map(() => '?').join(',')
        const rows = db
          .prepare(
            `SELECT id, status, fiscal_year_id, payment_batch_id
             FROM sepa_dd_collections
             WHERE id IN (${placeholders})`,
          )
          .all(...input.collection_ids) as {
          id: number
          status: SepaCollectionStatus
          fiscal_year_id: number
          payment_batch_id: number | null
        }[]

        if (rows.length !== input.collection_ids.length) {
          fail(
            'NOT_FOUND',
            'En eller flera uppsamlingar hittades inte',
            'collection_ids',
          )
        }
        for (const r of rows) {
          if (r.fiscal_year_id !== input.fiscal_year_id) {
            fail(
              'VALIDATION_ERROR',
              `Uppsamling ${r.id} tillhör annat räkenskapsår`,
              'collection_ids',
            )
          }
          if (r.status !== 'pending') {
            fail(
              'VALIDATION_ERROR',
              `Uppsamling ${r.id} har status '${r.status}' — endast 'pending' kan batchas`,
              'collection_ids',
            )
          }
          if (r.payment_batch_id != null) {
            fail(
              'VALIDATION_ERROR',
              `Uppsamling ${r.id} är redan kopplad till en batch`,
              'collection_ids',
            )
          }
        }

        const batchResult = db
          .prepare(
            `INSERT INTO payment_batches
             (fiscal_year_id, batch_type, payment_date, account_number,
              status, user_note)
             VALUES (?, 'direct_debit', ?, ?, 'completed', ?)`,
          )
          .run(
            input.fiscal_year_id,
            input.payment_date,
            input.account_number,
            input.user_note ?? null,
          )

        const batchId = batchResult.lastInsertRowid as number

        // Link collections → batch, mark as exported (will flip on file-gen)
        const updateStmt = db.prepare(
          `UPDATE sepa_dd_collections
           SET payment_batch_id = ?
           WHERE id = ?`,
        )
        for (const cid of input.collection_ids) {
          updateStmt.run(batchId, cid)
        }

        return {
          batch_id: batchId,
          collection_count: input.collection_ids.length,
        }
      })(),
    'Kunde inte skapa SEPA DD-batch',
  )
}
