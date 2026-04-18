import type Database from 'better-sqlite3'
import type { Account, IpcResult } from '../../shared/types'
import {
  mapUniqueConstraintError,
  ACCOUNT_UNIQUE_MAPPINGS,
} from './error-helpers'

export function listAccounts(
  db: Database.Database,
  input: { fiscal_rule: 'K2' | 'K3'; class?: number; is_active?: boolean },
): Account[] {
  let sql = 'SELECT * FROM accounts WHERE 1=1'
  const params: unknown[] = []

  // K2/K3-filtrering (princip #13)
  if (input.fiscal_rule === 'K2') {
    sql += ' AND k2_allowed = 1'
  }
  // K3 ser alla konton

  // Kontoklass-filter (klass = första siffran i account_number)
  if (input.class) {
    const low = String(input.class * 1000)
    const high = String((input.class + 1) * 1000)
    sql +=
      ' AND CAST(account_number AS INTEGER) >= ? AND CAST(account_number AS INTEGER) < ?'
    params.push(low, high)
  }

  // is_active filter
  if (input.is_active !== undefined) {
    sql += ' AND is_active = ?'
    params.push(input.is_active ? 1 : 0)
  }

  sql += ' ORDER BY CAST(account_number AS INTEGER) ASC'
  return db.prepare(sql).all(...params) as Account[]
}

export function listAllAccounts(
  db: Database.Database,
  input: { is_active?: boolean },
): Account[] {
  let sql = 'SELECT * FROM accounts WHERE 1=1'
  const params: unknown[] = []

  if (input.is_active !== undefined) {
    sql += ' AND is_active = ?'
    params.push(input.is_active ? 1 : 0)
  }

  sql += ' ORDER BY CAST(account_number AS INTEGER) ASC'
  return db.prepare(sql).all(...params) as Account[]
}

interface CreateAccountInput {
  account_number: string
  name: string
  k2_allowed: boolean
  k3_only: boolean
}

export function createAccount(
  db: Database.Database,
  input: CreateAccountInput,
): IpcResult<{ account_number: string }> {
  // Validate account_number format
  if (!/^\d{4,6}$/.test(input.account_number)) {
    return {
      success: false,
      error: 'Kontonummer måste vara 4–6 siffror.',
      code: 'VALIDATION_ERROR',
    }
  }

  // Derive account_type from first digit
  const firstDigit = parseInt(input.account_number[0])
  let accountType: string
  if (firstDigit === 1) accountType = 'asset'
  else if (firstDigit === 2) accountType = 'liability'
  else if (firstDigit >= 3 && firstDigit <= 3) accountType = 'revenue'
  else if (firstDigit >= 4 && firstDigit <= 7) accountType = 'expense'
  else if (firstDigit === 8) {
    const num = parseInt(input.account_number.substring(0, 4))
    const isRevenue =
      (num >= 8000 && num <= 8099) ||
      (num >= 8100 && num <= 8199) ||
      (num >= 8300 && num <= 8399)
    accountType = isRevenue ? 'revenue' : 'expense'
  } else accountType = 'expense'

  try {
    db.prepare(
      `INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_active, is_system_account)
       VALUES (?, ?, ?, ?, ?, 1, 0)`,
    ).run(
      input.account_number,
      input.name,
      accountType,
      input.k2_allowed ? 1 : 0,
      input.k3_only ? 1 : 0,
    )
    return { success: true, data: { account_number: input.account_number } }
  } catch (err: unknown) {
    const mapped = mapUniqueConstraintError(err, ACCOUNT_UNIQUE_MAPPINGS)
    if (mapped) return { success: false, ...mapped }
    throw err
  }
}

interface UpdateAccountInput {
  account_number: string
  name: string
  k2_allowed: boolean
  k3_only: boolean
}

export function updateAccount(
  db: Database.Database,
  input: UpdateAccountInput,
): IpcResult<{ success: true }> {
  const result = db
    .prepare(
      `UPDATE accounts SET name = ?, k2_allowed = ?, k3_only = ? WHERE account_number = ?`,
    )
    .run(
      input.name,
      input.k2_allowed ? 1 : 0,
      input.k3_only ? 1 : 0,
      input.account_number,
    )

  if (result.changes === 0) {
    return {
      success: false,
      error: `Konto ${input.account_number} hittades inte.`,
      code: 'ACCOUNT_NOT_FOUND',
    }
  }

  return { success: true, data: { success: true } }
}

interface ToggleAccountActiveInput {
  account_number: string
  is_active: boolean
}

export function toggleAccountActive(
  db: Database.Database,
  input: ToggleAccountActiveInput,
): IpcResult<{ success: true }> {
  // When deactivating, check constraints
  if (!input.is_active) {
    // Check is_system_account
    const account = db
      .prepare(
        'SELECT is_system_account FROM accounts WHERE account_number = ?',
      )
      .get(input.account_number) as { is_system_account: number } | undefined

    if (!account) {
      return {
        success: false,
        error: `Konto ${input.account_number} hittades inte.`,
        code: 'ACCOUNT_NOT_FOUND',
      }
    }

    if (account.is_system_account === 1) {
      return {
        success: false,
        error: `Systemkonto ${input.account_number} kan inte inaktiveras.`,
        code: 'SYSTEM_ACCOUNT',
      }
    }

    // Check journal_entry_lines (all fiscal years)
    const hasEntries = db
      .prepare(
        'SELECT 1 FROM journal_entry_lines WHERE account_number = ? LIMIT 1',
      )
      .get(input.account_number)

    if (hasEntries) {
      return {
        success: false,
        error: `Konto ${input.account_number} har bokförda verifikationer och kan inte inaktiveras.`,
        code: 'ACCOUNT_HAS_ENTRIES',
      }
    }
  }

  const result = db
    .prepare('UPDATE accounts SET is_active = ? WHERE account_number = ?')
    .run(input.is_active ? 1 : 0, input.account_number)

  if (result.changes === 0) {
    return {
      success: false,
      error: `Konto ${input.account_number} hittades inte.`,
      code: 'ACCOUNT_NOT_FOUND',
    }
  }

  return { success: true, data: { success: true } }
}

export function validateAccountsActive(
  db: Database.Database,
  accountNumbers: string[],
): void {
  if (!accountNumbers || accountNumbers.length === 0) return

  const unique = [...new Set(accountNumbers)]
  const placeholders = unique.map(() => '?').join(',')
  const inactive = db
    .prepare(
      `SELECT account_number FROM accounts WHERE account_number IN (${placeholders}) AND is_active = 0`,
    )
    .all(...unique) as { account_number: string }[]

  if (inactive.length > 0) {
    const list = inactive.map((a) => a.account_number).join(', ')
    // M100: strukturerat fel, inte plain Error
    throw {
      code: 'INACTIVE_ACCOUNT' as const,
      error: `Konto ${list} är inaktivt. Välj ett annat konto innan du bokför.`,
      field: 'account_number',
    }
  }
}
