/**
 * SIE4 import validator — validates parsed SIE4 data.
 * Returns blocking errors and non-blocking warnings.
 */
import type Database from 'better-sqlite3'
import type { SieParseResult } from './sie4-import-parser'

export interface AccountConflict {
  account_number: string
  existing_name: string
  new_name: string
  /** Antal verifikat-rader i SIE-filen som refererar detta konto. Används av UI för V6-varning (M148-mönstret). */
  referenced_by_entries: number
}

export interface SieValidationResult {
  valid: boolean
  errors: Array<{ code: string; message: string; context?: string }>
  warnings: Array<{ code: string; message: string; context?: string }>
  /** Konto-namnkonflikter (merge-strategi). Tom array vid 'new'-strategi. */
  conflicts: AccountConflict[]
  summary: {
    accounts: number
    entries: number
    lines: number
    fiscalYears: number
    sieType: number | null
    programName: string | null
    companyName: string | null
    orgNumber: string | null
  }
}

/**
 * Detekterar konto-namnkonflikter mellan SIE-filens accounts och DB:s
 * existerande accounts. Endast namn-divergens räknas som konflikt (M132-scope).
 *
 * @param db open database
 * @param parseResult SIE parse result
 * @returns lista över konflikter (tom vid inga konflikter)
 */
export function detectAccountConflicts(
  db: Database.Database,
  parseResult: SieParseResult,
): AccountConflict[] {
  const existing = new Map(
    (
      db.prepare('SELECT account_number, name FROM accounts').all() as Array<{
        account_number: string
        name: string
      }>
    ).map((a) => [a.account_number, a.name]),
  )

  const refCounts = new Map<string, number>()
  for (const e of parseResult.entries) {
    for (const t of e.transactions) {
      refCounts.set(t.accountNumber, (refCounts.get(t.accountNumber) ?? 0) + 1)
    }
  }

  const conflicts: AccountConflict[] = []
  for (const acc of parseResult.accounts) {
    const existingName = existing.get(acc.number)
    if (existingName !== undefined && existingName !== acc.name) {
      conflicts.push({
        account_number: acc.number,
        existing_name: existingName,
        new_name: acc.name,
        referenced_by_entries: refCounts.get(acc.number) ?? 0,
      })
    }
  }
  return conflicts
}

export function validateSieParseResult(
  result: SieParseResult,
): SieValidationResult {
  const errors: SieValidationResult['errors'] = []
  const warnings: SieValidationResult['warnings'] = []

  // E6: Non-finite amounts (NaN/Infinity) i transactions eller balances.
  // sie4AmountToOre returnerar NaN för ogiltig amount-syntax (M145). Utan
  // denna check skulle NaN bypassa E1 (Math.abs(NaN) > 1 === false) och
  // skriva NaN-öre till DB vid import.
  for (const entry of result.entries) {
    for (const t of entry.transactions) {
      if (!Number.isFinite(t.amountOre)) {
        errors.push({
          code: 'E6',
          message: `Verifikat ${entry.series}${entry.number} har ogiltigt belopp för konto ${t.accountNumber}`,
          context: `${entry.series}${entry.number}`,
        })
      }
    }
  }
  for (const b of [
    ...result.openingBalances,
    ...result.closingBalances,
    ...result.results,
  ]) {
    if (!Number.isFinite(b.amountOre)) {
      errors.push({
        code: 'E6',
        message: `Ogiltigt belopp för konto ${b.accountNumber}`,
        context: b.accountNumber,
      })
    }
  }
  for (const pb of result.periodBalances) {
    if (!Number.isFinite(pb.amountOre)) {
      errors.push({
        code: 'E6',
        message: `Ogiltigt periodbelopp för konto ${pb.accountNumber}`,
        context: pb.accountNumber,
      })
    }
  }

  // E1: Unbalanced vouchers
  for (const entry of result.entries) {
    // SIE4 uses signed amounts: positive = debit, negative = credit
    // Balance check: sum of all amounts should be 0
    // Skip if any amount is non-finite (already flagged by E6)
    if (entry.transactions.some((t) => !Number.isFinite(t.amountOre))) continue
    const sum = entry.transactions.reduce((s, t) => s + t.amountOre, 0)
    if (Math.abs(sum) > 1) {
      errors.push({
        code: 'E1',
        message: `Verifikat ${entry.series}${entry.number} är obalanserat (diff: ${sum} öre)`,
        context: `${entry.series}${entry.number} ${entry.date}`,
      })
    }
  }

  // E2: Vouchers with < 2 transactions
  for (const entry of result.entries) {
    if (entry.transactions.length < 2) {
      errors.push({
        code: 'E2',
        message: `Verifikat ${entry.series}${entry.number} har färre än 2 transaktionsrader`,
        context: `${entry.series}${entry.number}`,
      })
    }
  }

  // E3: Duplicate account numbers
  const accountNumbers = result.accounts.map((a) => a.number)
  const duplicates = accountNumbers.filter(
    (n, i) => accountNumbers.indexOf(n) !== i,
  )
  if (duplicates.length > 0) {
    errors.push({
      code: 'E3',
      message: `Duplicerade kontonummer: ${[...new Set(duplicates)].join(', ')}`,
    })
  }

  // E4: KSUMMA mismatch
  if (result.checksum.expected !== null && !result.checksum.valid) {
    errors.push({
      code: 'E4',
      message: `KSUMMA-mismatch: förväntat ${result.checksum.expected}, beräknat ${result.checksum.computed}`,
    })
  }

  // E5: Missing RAR
  if (result.header.fiscalYears.length === 0) {
    errors.push({
      code: 'E5',
      message: 'Inget räkenskapsår definierat (#RAR saknas)',
    })
  }

  // W1: IB + movements ≠ UB per account (if UB exists)
  if (result.closingBalances.length > 0 && result.entries.length > 0) {
    const ibMap = new Map<string, number>()
    for (const ib of result.openingBalances.filter((b) => b.yearIndex === 0)) {
      ibMap.set(ib.accountNumber, ib.amountOre)
    }

    const movementMap = new Map<string, number>()
    for (const entry of result.entries) {
      for (const t of entry.transactions) {
        movementMap.set(
          t.accountNumber,
          (movementMap.get(t.accountNumber) ?? 0) + t.amountOre,
        )
      }
    }

    for (const ub of result.closingBalances.filter((b) => b.yearIndex === 0)) {
      const ib = ibMap.get(ub.accountNumber) ?? 0
      const movement = movementMap.get(ub.accountNumber) ?? 0
      const expected = ib + movement
      if (Math.abs(expected - ub.amountOre) > 1) {
        warnings.push({
          code: 'W1',
          message: `IB + rörelser ≠ UB för konto ${ub.accountNumber} (IB=${ib}, rörelse=${movement}, UB=${ub.amountOre})`,
          context: ub.accountNumber,
        })
      }
    }
  }

  // W2: Date outside RAR range
  const rar0 = result.header.fiscalYears.find((fy) => fy.index === 0)
  if (rar0) {
    for (const entry of result.entries) {
      if (entry.date < rar0.from || entry.date > rar0.to) {
        warnings.push({
          code: 'W2',
          message: `Verifikat ${entry.series}${entry.number} (${entry.date}) utanför RAR-intervall (${rar0.from}–${rar0.to})`,
          context: `${entry.series}${entry.number}`,
        })
      }
    }
  }

  // W3: SIETYP < 4 and no VER
  if (
    result.header.sieType !== null &&
    result.header.sieType < 4 &&
    result.entries.length === 0
  ) {
    warnings.push({
      code: 'W3',
      message: `SIETYP ${result.header.sieType} — inga verifikat (förväntat för typ < 4)`,
    })
  }

  // W5: Non-chronological vouchers per series
  const seriesMap = new Map<string, SieParseResult['entries']>()
  for (const entry of result.entries) {
    if (!seriesMap.has(entry.series)) seriesMap.set(entry.series, [])
    seriesMap.get(entry.series)!.push(entry)
  }
  for (const [series, seriesEntries] of seriesMap) {
    for (let i = 1; i < seriesEntries.length; i++) {
      if (seriesEntries[i].date < seriesEntries[i - 1].date) {
        warnings.push({
          code: 'W5',
          message: `Verifikat ${series}${seriesEntries[i].number} (${seriesEntries[i].date}) före ${series}${seriesEntries[i - 1].number} (${seriesEntries[i - 1].date})`,
          context: series,
        })
        break // One warning per series
      }
    }
  }

  // Propagate parser warnings
  for (const w of result.warnings) {
    warnings.push({ code: 'W0', message: w })
  }

  const totalLines = result.entries.reduce(
    (s, e) => s + e.transactions.length,
    0,
  )

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    conflicts: [],
    summary: {
      accounts: result.accounts.length,
      entries: result.entries.length,
      lines: totalLines,
      fiscalYears: result.header.fiscalYears.length,
      sieType: result.header.sieType,
      programName: result.header.program,
      companyName: result.header.companyName,
      orgNumber: result.header.orgNumber,
    },
  }
}
