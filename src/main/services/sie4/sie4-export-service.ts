import type Database from 'better-sqlite3'
import * as iconv from 'iconv-lite'
import { todayLocal } from '../../../shared/date-utils'
import { mapSie4AccountType } from './sie4-account-type-mapper'
import { oreToSie4Amount } from './sie4-amount'
import { calculateKsumma } from './sie4-checksum'
import {
  getCompanyInfo,
  getFiscalYear,
  getPreviousFiscalYearId,
  getPeriods,
  getUsedAccounts,
  getOpeningBalancesFromPreviousYear,
  getMonthlyTotals,
  getBookedJournalEntries,
  getAllJournalEntryLines,
} from '../export/export-data-queries'

export interface Sie4ExportOptions {
  fiscalYearId: number
}

export interface Sie4ExportResult {
  content: Buffer
  filename: string
}

function dateToSie4(isoDate: string): string {
  return isoDate.replace(/-/g, '')
}

function escapeText(text: string): string {
  // Remove control characters, escape quotes
  return text.replace(/[\x00-\x1f\x7f]/g, '').replace(/"/g, '\\"')
}

function quoteField(text: string): string {
  return `"${escapeText(text)}"`
}

function isBalanceSheetAccount(accountNumber: string): boolean {
  return accountNumber.startsWith('1') || accountNumber.startsWith('2')
}

export function exportSie4(
  db: Database.Database,
  options: Sie4ExportOptions,
): Sie4ExportResult {
  const { fiscalYearId } = options

  // Fetch all data
  const company = getCompanyInfo(db)
  const fy = getFiscalYear(db, fiscalYearId)
  const periods = getPeriods(db, fiscalYearId)
  const accounts = getUsedAccounts(db, fiscalYearId)
  const prevFyId = getPreviousFiscalYearId(db, fiscalYearId)
  const ibMap = prevFyId
    ? getOpeningBalancesFromPreviousYear(db, prevFyId)
    : new Map<string, number>()
  const monthlyTotals = getMonthlyTotals(db, fiscalYearId)
  const entries = getBookedJournalEntries(db, fiscalYearId)
  const linesMap = getAllJournalEntryLines(db, fiscalYearId)

  // Previous year data (for #RAR -1, #IB -1, #UB -1, #RES -1)
  let prevFy: { start_date: string; end_date: string } | null = null
  let prevYearTotals: Map<string, number> = new Map()
  if (prevFyId) {
    prevFy = getFiscalYear(db, prevFyId)
    // Calculate previous year totals per account (debit - credit)
    const prevMonthly = getMonthlyTotals(db, prevFyId)
    for (const mt of prevMonthly) {
      const existing = prevYearTotals.get(mt.account_number) ?? 0
      prevYearTotals.set(
        mt.account_number,
        existing + (mt.total_debit - mt.total_credit),
      )
    }
  }

  // Current year totals per account
  const currentYearTotals = new Map<string, number>()
  for (const mt of monthlyTotals) {
    const existing = currentYearTotals.get(mt.account_number) ?? 0
    currentYearTotals.set(
      mt.account_number,
      existing + (mt.total_debit - mt.total_credit),
    )
  }

  // Monthly totals map: account → month → net (debit-credit)
  const acctMonthlyNet = new Map<string, Map<string, number>>()
  for (const mt of monthlyTotals) {
    if (!acctMonthlyNet.has(mt.account_number)) {
      acctMonthlyNet.set(mt.account_number, new Map())
    }
    acctMonthlyNet
      .get(mt.account_number)!
      .set(mt.month, mt.total_debit - mt.total_credit)
  }

  // Previous year IB (for #IB -1): IB of previous year = UB of year before that
  // For simplicity, #IB -1 = 0 (we'd need year-2 data). We'll use ibMap for #IB 0.
  // #UB -1 = closing balance of previous year = IB of current year = ibMap

  const genDate = dateToSie4(todayLocal())

  const lines: string[] = []

  // ═══ Header ═══
  lines.push('#FLAGGA 0')
  lines.push(`#PROGRAM "Fritt Bokföring" "1.0.0"`)
  lines.push('#FORMAT PC8')
  lines.push(`#GEN ${genDate}`)
  lines.push('#SIETYP 4')
  lines.push('#PROSA "Exporterad från Fritt Bokföring"')
  lines.push('#FTYP AB')
  lines.push('#FNR 1')
  lines.push(`#ORGNR ${company.org_number}`)
  lines.push(`#FNAMN ${quoteField(company.name)}`)
  lines.push(`#RAR 0 ${dateToSie4(fy.start_date)} ${dateToSie4(fy.end_date)}`)
  if (prevFy) {
    lines.push(
      `#RAR -1 ${dateToSie4(prevFy.start_date)} ${dateToSie4(prevFy.end_date)}`,
    )
  }
  lines.push('#KPTYP BAS2014')
  lines.push('#VALUTA SEK')
  lines.push('')

  // ═══ Chart of accounts ═══
  for (const acct of accounts) {
    lines.push(`#KONTO ${acct.account_number} ${quoteField(acct.name)}`)
    lines.push(
      `#KTYP ${acct.account_number} ${mapSie4AccountType(acct.account_number)}`,
    )
  }
  lines.push('')

  // ═══ IB / UB (balance sheet accounts only) ═══
  for (const acct of accounts) {
    if (!isBalanceSheetAccount(acct.account_number)) continue

    const ib0 = ibMap.get(acct.account_number) ?? 0
    const yearNet = currentYearTotals.get(acct.account_number) ?? 0
    const ub0 = ib0 + yearNet

    if (ib0 !== 0) {
      lines.push(`#IB 0 ${acct.account_number} ${oreToSie4Amount(ib0)}`)
    }
    if (ub0 !== 0) {
      lines.push(`#UB 0 ${acct.account_number} ${oreToSie4Amount(ub0)}`)
    }

    // Previous year IB/UB
    if (prevFyId) {
      const prevYearNet = prevYearTotals.get(acct.account_number) ?? 0
      // IB -1: we don't have year-2 data, so IB of prev year = 0 for first year
      // UB -1 = ibMap value (which IS the closing balance of prev year)
      const ub_1 = ibMap.get(acct.account_number) ?? 0
      if (ub_1 !== 0) {
        lines.push(`#UB -1 ${acct.account_number} ${oreToSie4Amount(ub_1)}`)
      }
      // IB -1 = UB -1 minus prev year activity
      const ib_1 = ub_1 - prevYearNet
      if (ib_1 !== 0) {
        lines.push(`#IB -1 ${acct.account_number} ${oreToSie4Amount(ib_1)}`)
      }
    }
  }
  lines.push('')

  // ═══ RES (income statement accounts only) ═══
  for (const acct of accounts) {
    if (isBalanceSheetAccount(acct.account_number)) continue

    const net0 = currentYearTotals.get(acct.account_number) ?? 0
    if (net0 !== 0) {
      lines.push(`#RES 0 ${acct.account_number} ${oreToSie4Amount(net0)}`)
    }

    if (prevFyId) {
      const net_1 = prevYearTotals.get(acct.account_number) ?? 0
      if (net_1 !== 0) {
        lines.push(`#RES -1 ${acct.account_number} ${oreToSie4Amount(net_1)}`)
      }
    }
  }
  lines.push('')

  // ═══ PSALDO (period balances) ═══
  const allMonths = periods.map((p) => p.start_date.substring(0, 7))
  for (const acct of accounts) {
    const monthMap = acctMonthlyNet.get(acct.account_number)
    if (!monthMap) continue

    for (const month of allMonths) {
      const net = monthMap.get(month)
      if (net && net !== 0) {
        const period = month.replace('-', '')
        lines.push(
          `#PSALDO 0 ${period} ${acct.account_number} {} ${oreToSie4Amount(net)}`,
        )
      }
    }
  }
  lines.push('')

  // ═══ Verifikationer ═══
  // Group by series
  const seriesMap = new Map<string, typeof entries>()
  for (const e of entries) {
    const series = e.verification_series || 'A'
    if (!seriesMap.has(series)) seriesMap.set(series, [])
    seriesMap.get(series)!.push(e)
  }

  for (const [, seriesEntries] of seriesMap) {
    for (const entry of seriesEntries) {
      const series = entry.verification_series || 'A'
      const verDate = dateToSie4(entry.journal_date)
      const regDate = dateToSie4(entry.created_at.substring(0, 10))
      lines.push(
        `#VER "${series}" ${entry.verification_number} ${verDate} ${quoteField(entry.description)} ${regDate}`,
      )
      lines.push('{')

      const entryLines = linesMap.get(entry.id) ?? []
      for (const line of entryLines) {
        const amount = oreToSie4Amount(line.debit_amount - line.credit_amount)
        const transDate = verDate
        const text = line.description
          ? quoteField(line.description)
          : quoteField(entry.description)
        lines.push(
          `#TRANS ${line.account_number} {} ${amount} ${transDate} ${text}`,
        )
      }

      lines.push('}')
    }
  }

  // ═══ KSUMMA ═══
  const contentWithoutKsumma = lines.join('\r\n') + '\r\n'
  const ksumma = calculateKsumma(contentWithoutKsumma)
  lines.push(`#KSUMMA ${ksumma}`)

  const fullContent = lines.join('\r\n') + '\r\n'
  const cp437Buffer = iconv.encode(fullContent, 'cp437')

  // Filename: CompanyName_YYYYMMDD.se
  const safeName = company.name.replace(/[^a-zA-ZåäöÅÄÖ0-9]/g, '_')
  const filename = `${safeName}_${genDate}.se`

  return { content: cp437Buffer, filename }
}
