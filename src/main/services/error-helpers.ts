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
 *
 * ── Hur nya mappningar läggs till ────────────────────────────────────
 *
 * 1. Hitta UNIQUE-index-definitionen i migrations.ts. Notera tabellnamn
 *    och alla kolumnnamn som ingår (både single och compound).
 *
 * 2. Skapa en ny `MAPPINGS`-konstant nedanför:
 *    ```
 *    export const MY_TABLE_UNIQUE_MAPPINGS: UniqueConstraintMapping[] = [
 *      {
 *        messageContains: ['my_table', 'my_column'],  // ALLA måste matcha
 *        code: 'MY_NEW_ERROR_CODE',                   // lägg till i ErrorCode-typen
 *        field: 'my_column',                          // för useEntityForm-fältfel
 *        error: 'Svenskt felmeddelande.',
 *      },
 *    ]
 *    ```
 *
 * 3. Compound-index: lista samtliga kolumner i `messageContains`. Ordning
 *    spelar ingen roll (substring-match), men alla måste vara med.
 *    Exempel: `['counterparties', 'company_id', 'org_number']` för
 *    `UNIQUE(company_id, org_number)` — men det räcker ofta med
 *    `['counterparties', 'org_number']` om `org_number` bara finns
 *    i det ena UNIQUE-indexet på tabellen.
 *
 * 4. Anropa från service-catch-block som första steg:
 *    ```
 *    const mapped = mapUniqueConstraintError(err, MY_TABLE_UNIQUE_MAPPINGS)
 *    if (mapped) return { success: false, ...mapped }
 *    ```
 *
 * 5. Lägg till regressions-test som triggar UNIQUE och verifierar att
 *    rätt `code` returneras (se `tests/s46-unique-mappings.test.ts` för
 *    mönster).
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

export const ACCRUAL_UNIQUE_MAPPINGS: UniqueConstraintMapping[] = [
  {
    messageContains: ['accrual_entries', 'accrual_schedule_id'],
    code: 'ACCRUAL_ALREADY_EXECUTED',
    error:
      'Periodiseringen har redan exekverats för denna period. Ingen dubblett skapades.',
  },
]
