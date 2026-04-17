import type { ErrorCode } from '../../shared/types'

/**
 * M124: Mappning av SQLite UNIQUE constraint-fel till specifika ErrorCodes.
 *
 * better-sqlite3 kastar SqliteError med:
 *   - code: 'SQLITE_CONSTRAINT_UNIQUE' (eller 'SQLITE_CONSTRAINT_PRIMARYKEY')
 *   - message: 'UNIQUE constraint failed: <table>.<column>' (single)
 *              'UNIQUE constraint failed: <table>.<col1>, <table>.<col2>' (compound)
 *
 * Compound-index-meddelanden listar alla kolumner kommaseparerade.
 * Matchning sker via substring för att vara robust mot framtida SQLite-versioner.
 */

export interface UniqueConstraintMapping {
  /** Substring(s) som ska finnas i err.message. Alla måste matcha. */
  messageContains: string[]
  code: ErrorCode
  field?: string
  error: string
}

/**
 * Mappar en SqliteError (UNIQUE constraint) till ett strukturerat felsvar.
 * Returnerar null om felet inte matchar någon mapping.
 */
export function mapUniqueConstraintError(
  err: unknown,
  mappings: UniqueConstraintMapping[],
): { code: ErrorCode; error: string; field?: string } | null {
  if (!err || typeof err !== 'object') return null
  const e = err as { code?: string; message?: string }
  if (
    e.code !== 'SQLITE_CONSTRAINT_UNIQUE' &&
    e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY'
  ) {
    return null
  }
  const msg = e.message ?? ''
  for (const mapping of mappings) {
    if (mapping.messageContains.every((s) => msg.includes(s))) {
      return { code: mapping.code, error: mapping.error, field: mapping.field }
    }
  }
  return null
}

// === Per-service UNIQUE-mappningar ===

export const COUNTERPARTY_UNIQUE_MAPPINGS: UniqueConstraintMapping[] = [
  {
    messageContains: ['counterparties', 'org_number'],
    code: 'DUPLICATE_ORG_NUMBER',
    field: 'org_number',
    error: 'En motpart med detta organisationsnummer finns redan.',
  },
]

export const COMPANY_UNIQUE_MAPPINGS: UniqueConstraintMapping[] = [
  {
    messageContains: ['companies', 'org_number'],
    code: 'DUPLICATE_ORG_NUMBER',
    field: 'org_number',
    error: 'Ett företag med detta organisationsnummer finns redan.',
  },
]

export const ACCOUNT_UNIQUE_MAPPINGS: UniqueConstraintMapping[] = [
  {
    messageContains: ['accounts', 'account_number'],
    code: 'DUPLICATE_ACCOUNT',
    field: 'account_number',
    error: 'Ett konto med detta kontonummer finns redan.',
  },
]

export const EXPENSE_UNIQUE_MAPPINGS: UniqueConstraintMapping[] = [
  {
    messageContains: ['expenses', 'supplier_invoice_number'],
    code: 'DUPLICATE_SUPPLIER_INVOICE',
    field: 'supplier_invoice_number',
    error:
      'En kostnad med detta leverantörsfakturanummer finns redan för denna leverantör.',
  },
]
