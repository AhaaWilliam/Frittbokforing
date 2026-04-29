/**
 * SIE4 import service — Fas 2.
 * Writes parsed SIE4 data to the database.
 *
 * Strategies:
 * - 'new': no existing company → create company + FY + accounts + entries
 * - 'merge': company exists → validate orgNr match, merge accounts, add missing FY, import entries as 'I' series
 *
 * Atomicity: all-or-nothing via db.transaction()
 * Verification series: 'I' (Import) to avoid collisions with A/B/C
 * status='booked' via direct INSERT (bypasses period-check trigger — M138-style exempt for historical data)
 */
import type Database from 'better-sqlite3'
import type { SieParseResult } from './sie4-import-parser'
import type { IpcResult } from '../../../shared/types'
import { localDateFromDate } from '../../utils/now'
import { safeRebuildSearchIndex } from '../search-service'
import { createCompany } from '../company-service'

export type ImportStrategy = 'new' | 'merge'

export type ConflictResolution = 'keep' | 'overwrite' | 'skip'

export interface ImportOptions {
  strategy: ImportStrategy
  /** If merge: target fiscal year (if absent, RAR 0 is matched by date range or created) */
  fiscalYearId?: number
  /**
   * If merge: which company to merge INTO. Sprint MC1: defaults till första
   * bolaget om utelämnad (single-company-bakåtkompatibel). Sprint MC2 sätter
   * detta från ActiveCompanyContext via IPC-handlern.
   */
  targetCompanyId?: number
  /**
   * Per-konto-resolution vid namnkonflikt (M148). Sprint 56 B2.
   * Saknad nyckel defaultar till 'keep' (tidigare tyst overwrite-beteende borttaget).
   * 'skip' på konto som refereras av importens verifikat → VALIDATION_ERROR.
   */
  conflict_resolutions?: Record<string, ConflictResolution>
}

export interface ImportResult {
  companyId: number
  fiscalYearId: number
  accountsAdded: number
  accountsUpdated: number
  entriesImported: number
  linesImported: number
  warnings: string[]
}

export function importSie4(
  db: Database.Database,
  parseResult: SieParseResult,
  options: ImportOptions,
): IpcResult<ImportResult> {
  try {
    return db.transaction(() => {
      const warnings: string[] = []

      // ═══ 1. Company ═══
      // 'new'-strategin avvisar import om DB redan har ett bolag (för att
      // undvika oavsiktlig duplicering vid första-gång-flödet). Multi-company
      // kräver i framtiden att 'new'-strategin tillåts även när andra bolag
      // finns — det är en MC2-fråga, inte MC1.
      const anyCompany = db
        .prepare('SELECT id, org_number FROM companies ORDER BY id LIMIT 1')
        .get() as { id: number; org_number: string } | undefined

      // Merge-strategi: prioritera targetCompanyId om angiven (MC2-redo),
      // annars fall tillbaka till första bolaget (MC1 single-company).
      let mergeTarget: { id: number; org_number: string } | undefined =
        anyCompany
      if (options.targetCompanyId) {
        const target = db
          .prepare('SELECT id, org_number FROM companies WHERE id = ?')
          .get(options.targetCompanyId) as
          | { id: number; org_number: string }
          | undefined
        if (target) mergeTarget = target
      }

      let companyId: number
      if (options.strategy === 'new') {
        if (anyCompany) {
          throw {
            code: 'VALIDATION_ERROR',
            error: 'Databasen har redan ett företag. Använd merge-strategi.',
          }
        }
        if (!parseResult.header.companyName || !parseResult.header.orgNumber) {
          throw {
            code: 'VALIDATION_ERROR',
            error: 'SIE4-filen saknar företagsnamn eller orgNr',
          }
        }
        const rar0 = parseResult.header.fiscalYears.find((fy) => fy.index === 0)
        if (!rar0) {
          throw {
            code: 'VALIDATION_ERROR',
            error: 'SIE4-filen saknar räkenskapsår (RAR 0)',
          }
        }
        const cpRes = createCompany(db, {
          name: parseResult.header.companyName,
          org_number: parseResult.header.orgNumber,
          fiscal_rule: 'K2',
          share_capital: 2500000,
          registration_date: rar0.from,
          fiscal_year_start: rar0.from,
          fiscal_year_end: rar0.to,
        })
        if (!cpRes.success) {
          throw { code: 'VALIDATION_ERROR', error: cpRes.error }
        }
        companyId = cpRes.data.id
      } else {
        if (!mergeTarget) {
          throw {
            code: 'VALIDATION_ERROR',
            error: 'Inget företag i databasen. Använd new-strategi.',
          }
        }
        if (
          parseResult.header.orgNumber &&
          parseResult.header.orgNumber !== mergeTarget.org_number
        ) {
          throw {
            code: 'VALIDATION_ERROR',
            error: `Orgnummer i SIE4 (${parseResult.header.orgNumber}) matchar inte målbolagets (${mergeTarget.org_number})`,
          }
        }
        companyId = mergeTarget.id
      }

      // ═══ 2. Fiscal year ═══
      const rar0 = parseResult.header.fiscalYears.find((fy) => fy.index === 0)
      if (!rar0) {
        throw { code: 'VALIDATION_ERROR', error: 'SIE4-filen saknar RAR 0' }
      }

      let fiscalYearId: number
      if (options.fiscalYearId) {
        fiscalYearId = options.fiscalYearId
      } else {
        // Match or create FY based on date range
        const existing = db
          .prepare(
            'SELECT id FROM fiscal_years WHERE company_id = ? AND start_date = ? AND end_date = ?',
          )
          .get(companyId, rar0.from, rar0.to) as { id: number } | undefined

        if (existing) {
          fiscalYearId = existing.id
        } else {
          // Only happens for merge strategy adding a new FY
          const yearLabel = rar0.from.slice(0, 4)
          const res = db
            .prepare(
              `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date, is_closed)
               VALUES (?, ?, ?, ?, 0)`,
            )
            .run(companyId, yearLabel, rar0.from, rar0.to)
          fiscalYearId = Number(res.lastInsertRowid)

          // Create monthly periods
          seedMonthlyPeriods(db, companyId, fiscalYearId, rar0.from, rar0.to)
        }
      }

      // ═══ 3. Accounts — merge by account_number (Sprint 56 B2 conflict_resolutions) ═══
      let accountsAdded = 0
      let accountsUpdated = 0

      const existingAccounts = new Map(
        (
          db
            .prepare('SELECT account_number, name FROM accounts')
            .all() as Array<{
            account_number: string
            name: string
          }>
        ).map((a) => [a.account_number, a.name]),
      )

      // Pre-flight: validera 'skip' inte refererar verifikat (defense-in-depth, V6).
      const resolutions = options.conflict_resolutions ?? {}
      for (const [accNum, resolution] of Object.entries(resolutions)) {
        if (resolution === 'skip') {
          const refCount = parseResult.entries.reduce(
            (s, e) =>
              s +
              e.transactions.filter((t) => t.accountNumber === accNum).length,
            0,
          )
          if (refCount > 0) {
            throw {
              code: 'VALIDATION_ERROR',
              error: `Kan inte skippa konto ${accNum} — det används av ${refCount} verifikat-rader i importen.`,
              field: `conflict_resolutions.${accNum}`,
            }
          }
        }
      }

      for (const acc of parseResult.accounts) {
        const existing = existingAccounts.get(acc.number)
        if (existing === undefined) {
          // Add new account
          const accountType = mapSieTypeToAccountType(acc.type, acc.number)
          db.prepare(
            `INSERT INTO accounts (account_number, name, account_type, is_active) VALUES (?, ?, ?, 1)`,
          ).run(acc.number, acc.name, accountType)
          accountsAdded++
        } else if (existing !== acc.name) {
          // Konflikt: läs resolution (default 'keep')
          const resolution = resolutions[acc.number] ?? 'keep'
          if (resolution === 'overwrite') {
            db.prepare(
              'UPDATE accounts SET name = ? WHERE account_number = ?',
            ).run(acc.name, acc.number)
            accountsUpdated++
          }
          // 'keep' / 'skip' → ingen UPDATE
        }
      }

      // ═══ 4. Journal entries — 'I' series ═══
      const nextImportVer = (
        db
          .prepare(
            `SELECT COALESCE(MAX(verification_number), 0) + 1 AS next_ver
           FROM journal_entries
           WHERE fiscal_year_id = ? AND verification_series = 'I'`,
          )
          .get(fiscalYearId) as { next_ver: number }
      ).next_ver

      let verCounter = nextImportVer
      let entriesImported = 0
      let linesImported = 0

      const insertJe = db.prepare(
        `INSERT INTO journal_entries (
          company_id, fiscal_year_id, verification_number, verification_series,
          journal_date, description, status, source_type, source_reference
        ) VALUES (?, ?, ?, 'I', ?, ?, 'draft', 'import', ?)`,
      )

      const insertJel = db.prepare(
        `INSERT INTO journal_entry_lines (
          journal_entry_id, line_number, account_number,
          debit_ore, credit_ore, description
        ) VALUES (?, ?, ?, ?, ?, ?)`,
      )

      const bookEntry = db.prepare(
        `UPDATE journal_entries SET status = 'booked' WHERE id = ?`,
      )

      const rar0From = rar0.from
      const rar0To = rar0.to

      for (const entry of parseResult.entries) {
        // Validate within fiscal year range
        if (entry.date < rar0From || entry.date > rar0To) {
          warnings.push(
            `Verifikat ${entry.series}${entry.number} (${entry.date}) utanför FY — hoppas över`,
          )
          continue
        }

        // Validate balance
        const sum = entry.transactions.reduce((s, t) => s + t.amountOre, 0)
        if (Math.abs(sum) > 1) {
          warnings.push(
            `Verifikat ${entry.series}${entry.number} obalanserat — hoppas över`,
          )
          continue
        }

        const sourceRef = `sie4:${entry.series}${entry.number}`
        const description = `[Import ${entry.series}${entry.number}] ${entry.description}`

        const jeResult = insertJe.run(
          companyId,
          fiscalYearId,
          verCounter,
          entry.date,
          description,
          sourceRef,
        )
        const journalEntryId = Number(jeResult.lastInsertRowid)
        verCounter++
        entriesImported++

        let lineNumber = 1
        for (const t of entry.transactions) {
          // Validate account exists (was either merged or is in existing DB)
          const accountExists = db
            .prepare('SELECT 1 FROM accounts WHERE account_number = ?')
            .get(t.accountNumber)
          if (!accountExists) {
            throw {
              code: 'VALIDATION_ERROR',
              error: `Konto ${t.accountNumber} saknas i kontoplanen (verifikat ${entry.series}${entry.number})`,
            }
          }

          // Sign handling: positive = debit, negative = credit
          const debit = t.amountOre > 0 ? t.amountOre : 0
          const credit = t.amountOre < 0 ? -t.amountOre : 0

          insertJel.run(
            journalEntryId,
            lineNumber,
            t.accountNumber,
            debit,
            credit,
            t.text ?? description,
          )
          lineNumber++
          linesImported++
        }

        // Book the entry now that lines are inserted
        bookEntry.run(journalEntryId)
      }

      // ═══ 5. FTS5 rebuild (M143) ═══
      safeRebuildSearchIndex(db)

      return {
        success: true as const,
        data: {
          companyId,
          fiscalYearId,
          accountsAdded,
          accountsUpdated,
          entriesImported,
          linesImported,
          warnings,
        },
      }
    })()
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && 'error' in err) {
      const e = err as { code: string; error: string; field?: string }
      return {
        success: false,
        error: e.error,
        code: e.code,
        field: e.field,
      } as IpcResult<ImportResult>
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Oväntat fel vid import',
      code: 'UNEXPECTED_ERROR',
    }
  }
}

// ═══ Helpers ═══

function mapSieTypeToAccountType(
  sieType: string | null,
  accountNumber: string,
): string {
  // T = Tillgång, S = Skuld/EK, I = Intäkt, K = Kostnad
  if (sieType === 'T') return 'asset'
  if (sieType === 'S') {
    // 2xxx — distinguish between equity and liability
    return accountNumber.startsWith('20') ? 'equity' : 'liability'
  }
  if (sieType === 'I') return 'revenue'
  if (sieType === 'K') return 'expense'
  // Fallback: map by account number
  const first = accountNumber.charAt(0)
  if (first === '1') return 'asset'
  if (first === '2')
    return accountNumber.startsWith('20') ? 'equity' : 'liability'
  if (first === '3') return 'revenue'
  return 'expense'
}

function seedMonthlyPeriods(
  db: Database.Database,
  companyId: number,
  fiscalYearId: number,
  startDate: string,
  endDate: string,
): void {
  const start = new Date(startDate)
  const end = new Date(endDate)
  const insert = db.prepare(
    `INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date, is_closed)
     VALUES (?, ?, ?, ?, ?, 0)`,
  )

  let periodNumber = 1
  let current = new Date(start)
  // M161: FY kan ha 1–13 perioder (kortat/förlängt första FY per BFL 3:3).
  while (current <= end && periodNumber <= 13) {
    const periodStart = new Date(current)
    current.setMonth(current.getMonth() + 1)
    current.setDate(0) // Last day of the month
    const periodEnd = current > end ? end : current

    insert.run(
      companyId,
      fiscalYearId,
      periodNumber,
      localDateFromDate(periodStart),
      localDateFromDate(periodEnd),
    )
    periodNumber++
    current = new Date(periodEnd)
    current.setDate(current.getDate() + 1)
  }
}
