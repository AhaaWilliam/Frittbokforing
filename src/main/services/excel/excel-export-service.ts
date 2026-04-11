import type Database from 'better-sqlite3'
import ExcelJS from 'exceljs'
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
  getBalanceAtDate,
  type ExportDateRange,
  type AccountInfo,
} from '../export/export-data-queries'

export interface ExcelExportOptions {
  fiscalYearId: number
  startDate?: string
  endDate?: string
}

export interface ExcelExportResult {
  buffer: Buffer
  filename: string
}

const SWEDISH_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Maj',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Okt',
  'Nov',
  'Dec',
]

const AMOUNT_FMT = '#,##0.00'
const DATE_FMT = 'yyyy-mm-dd'

function localDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function isLastDayOfMonth(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  return d === lastDay
}

function oreToKr(ore: number): number {
  return ore / 100
}

function isBalanceSheet(accountNumber: string): boolean {
  return accountNumber.startsWith('1') || accountNumber.startsWith('2')
}

function sanitizeFilename(name: string): string {
  return name
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 100)
}

export async function exportExcel(
  db: Database.Database,
  options: ExcelExportOptions,
): Promise<ExcelExportResult> {
  const { fiscalYearId, startDate, endDate } = options

  const company = getCompanyInfo(db)
  const fy = getFiscalYear(db, fiscalYearId)
  const periods = getPeriods(db, fiscalYearId)
  const accounts = getUsedAccounts(db, fiscalYearId)
  const prevFyId = getPreviousFiscalYearId(db, fiscalYearId)
  const prevYearIb = prevFyId
    ? getOpeningBalancesFromPreviousYear(db, prevFyId)
    : new Map<string, number>()

  // Validate date range
  if (startDate && startDate < fy.start_date)
    throw new Error('startDate is before fiscal year start')
  if (endDate && endDate > fy.end_date)
    throw new Error('endDate is after fiscal year end')

  const dateRange: ExportDateRange | undefined =
    startDate || endDate ? { startDate, endDate } : undefined
  const hasDateFilter = !!dateRange

  // Filtered data
  const entries = getBookedJournalEntries(db, fiscalYearId, dateRange)
  const linesMap = getAllJournalEntryLines(db, fiscalYearId, dateRange)
  const monthlyTotals = getMonthlyTotals(db, fiscalYearId, dateRange)

  // Full year data (for IB calculation when date-filtered)
  const fullYearMonthly = hasDateFilter
    ? getMonthlyTotals(db, fiscalYearId)
    : monthlyTotals

  // IB for date-filtered exports
  const dateFilterIb =
    hasDateFilter && startDate
      ? getBalanceAtDate(db, fiscalYearId, startDate)
      : new Map<string, number>()

  // Account name lookup
  const accountNameMap = new Map<string, string>()
  for (const a of accounts) {
    accountNameMap.set(a.account_number, a.name)
  }

  // Build account totals for saldobalans
  const acctMonthlyNet = new Map<string, Map<string, number>>()
  for (const mt of monthlyTotals) {
    if (!acctMonthlyNet.has(mt.account_number))
      acctMonthlyNet.set(mt.account_number, new Map())
    acctMonthlyNet
      .get(mt.account_number)!
      .set(mt.month, mt.total_debit - mt.total_credit)
  }

  // Full year totals per account
  const fullYearTotals = new Map<string, number>()
  for (const mt of fullYearMonthly) {
    const existing = fullYearTotals.get(mt.account_number) ?? 0
    fullYearTotals.set(
      mt.account_number,
      existing + (mt.total_debit - mt.total_credit),
    )
  }

  // ═══ Compute IB per account ═══
  function getIbForAccount(acctNum: string): number {
    if (hasDateFilter && startDate) {
      // IB = prev year UB (BS only) + year-to-date before startDate
      const prevUb = isBalanceSheet(acctNum)
        ? (prevYearIb.get(acctNum) ?? 0)
        : 0
      const ytd = dateFilterIb.get(acctNum) ?? 0
      return prevUb + ytd
    }
    // Full year: IB = prev year UB for BS, 0 for PL
    return isBalanceSheet(acctNum) ? (prevYearIb.get(acctNum) ?? 0) : 0
  }

  const workbook = new ExcelJS.Workbook()

  // ═══ FLIK 1: Verifikationslista ═══
  const sheetVer = workbook.addWorksheet('Verifikationslista')
  sheetVer.columns = [
    { header: 'Serie', key: 'serie', width: 8 },
    { header: 'Nr', key: 'nr', width: 8 },
    { header: 'Datum', key: 'datum', width: 12 },
    { header: 'Text', key: 'text', width: 40 },
    { header: 'Konto', key: 'konto', width: 10 },
    { header: 'Kontonamn', key: 'kontonamn', width: 35 },
    { header: 'Debet', key: 'debet', width: 15 },
    { header: 'Kredit', key: 'kredit', width: 15 },
  ]

  for (const entry of entries) {
    const lines = linesMap.get(entry.id) ?? []
    for (const line of lines) {
      const debet = oreToKr(line.debit_ore)
      const kredit = oreToKr(line.credit_ore)
      const row = sheetVer.addRow({
        serie: entry.verification_series,
        nr: entry.verification_number,
        datum: localDate(entry.journal_date),
        text: entry.description,
        konto: line.account_number,
        kontonamn: accountNameMap.get(line.account_number) ?? '',
        debet: debet > 0 ? debet : undefined,
        kredit: kredit > 0 ? kredit : undefined,
      })
      row.getCell('datum').numFmt = DATE_FMT
      row.getCell('debet').numFmt = AMOUNT_FMT
      row.getCell('kredit').numFmt = AMOUNT_FMT
    }
  }

  // ═══ FLIK 2: Huvudbok ═══
  const sheetHb = workbook.addWorksheet('Huvudbok')
  sheetHb.columns = [
    { header: 'Konto', key: 'konto', width: 10 },
    { header: 'Kontonamn', key: 'kontonamn', width: 35 },
    { header: 'Datum', key: 'datum', width: 12 },
    { header: 'Serie', key: 'serie', width: 8 },
    { header: 'Nr', key: 'nr', width: 8 },
    { header: 'Text', key: 'text', width: 35 },
    { header: 'Debet', key: 'debet', width: 15 },
    { header: 'Kredit', key: 'kredit', width: 15 },
    { header: 'Saldo', key: 'saldo', width: 15 },
  ]

  // Build per-account transaction lists
  const acctTransactions = new Map<
    string,
    {
      date: string
      series: string
      verNum: number
      text: string
      debit: number
      credit: number
    }[]
  >()
  for (const entry of entries) {
    const lines = linesMap.get(entry.id) ?? []
    for (const line of lines) {
      if (!acctTransactions.has(line.account_number))
        acctTransactions.set(line.account_number, [])
      acctTransactions.get(line.account_number)!.push({
        date: entry.journal_date,
        series: entry.verification_series,
        verNum: entry.verification_number,
        text: line.description || entry.description,
        debit: line.debit_ore,
        credit: line.credit_ore,
      })
    }
  }

  // Active accounts = accounts that have IB or transactions
  const activeAccounts = accounts.filter(
    (a) =>
      acctTransactions.has(a.account_number) ||
      getIbForAccount(a.account_number) !== 0,
  )

  for (const acct of activeAccounts) {
    const ib = getIbForAccount(acct.account_number)
    let runningBalance = ib

    // Header row
    const headerRow = sheetHb.addRow({
      konto: acct.account_number,
      kontonamn: acct.name,
      text: 'IB',
      saldo: oreToKr(ib),
    })
    headerRow.getCell('saldo').numFmt = AMOUNT_FMT

    // Transaction rows
    const txns = acctTransactions.get(acct.account_number) ?? []
    for (const txn of txns) {
      runningBalance += txn.debit - txn.credit
      const debet = oreToKr(txn.debit)
      const kredit = oreToKr(txn.credit)
      const row = sheetHb.addRow({
        datum: localDate(txn.date),
        serie: txn.series,
        nr: txn.verNum,
        text: txn.text,
        debet: debet > 0 ? debet : undefined,
        kredit: kredit > 0 ? kredit : undefined,
        saldo: oreToKr(runningBalance),
      })
      row.getCell('datum').numFmt = DATE_FMT
      row.getCell('debet').numFmt = AMOUNT_FMT
      row.getCell('kredit').numFmt = AMOUNT_FMT
      row.getCell('saldo').numFmt = AMOUNT_FMT
    }

    // UB row
    const ubRow = sheetHb.addRow({
      text: 'UB',
      saldo: oreToKr(runningBalance),
    })
    ubRow.getCell('saldo').numFmt = AMOUNT_FMT

    // Empty row between accounts
    sheetHb.addRow({})
  }

  // ═══ FLIK 3: Saldobalans ═══
  const sheetSb = workbook.addWorksheet('Saldobalans')

  // Determine if date filter uses whole months
  const isWholeMonthFilter =
    hasDateFilter &&
    startDate &&
    endDate &&
    startDate.endsWith('-01') &&
    isLastDayOfMonth(endDate)

  const useMonthlyColumns = !hasDateFilter || isWholeMonthFilter

  if (useMonthlyColumns) {
    // Monthly columns — filter to relevant months
    const relevantPeriods =
      hasDateFilter && startDate && endDate
        ? periods.filter(
            (p) => p.start_date >= startDate && p.end_date <= endDate,
          )
        : periods

    const monthHeaders = relevantPeriods.map((p) => {
      const monthIdx = parseInt(p.start_date.substring(5, 7), 10) - 1
      return SWEDISH_MONTHS[monthIdx]
    })
    const monthKeys = relevantPeriods.map((p) => p.start_date.substring(0, 7))

    const columns: Partial<ExcelJS.Column>[] = [
      { header: 'Konto', key: 'konto', width: 10 },
      { header: 'Kontonamn', key: 'kontonamn', width: 35 },
      { header: 'IB', key: 'ib', width: 15 },
    ]
    for (let i = 0; i < monthHeaders.length; i++) {
      columns.push({
        header: monthHeaders[i],
        key: `m_${monthKeys[i]}`,
        width: 15,
      })
    }
    columns.push({ header: 'UB', key: 'ub', width: 15 })
    sheetSb.columns = columns

    function addSbAccountRows(
      filteredAccounts: AccountInfo[],
      sectionLabel?: string,
    ) {
      if (sectionLabel) {
        sheetSb.addRow({ konto: sectionLabel })
      }

      let sumIb = 0
      let sumUb = 0
      const sumMonths = new Map<string, number>()

      for (const acct of filteredAccounts) {
        const ib = getIbForAccount(acct.account_number)
        const monthMap = acctMonthlyNet.get(acct.account_number)

        // Skip if no activity and IB = 0
        const hasActivity = monthMap && monthMap.size > 0
        if (!hasActivity && ib === 0) continue

        let ub = ib
        const rowData: Record<string, string | number> = {
          konto: acct.account_number,
          kontonamn: acct.name,
          ib: oreToKr(ib),
        }
        sumIb += ib

        for (const mk of monthKeys) {
          const net = monthMap?.get(mk) ?? 0
          rowData[`m_${mk}`] = oreToKr(net)
          ub += net
          sumMonths.set(mk, (sumMonths.get(mk) ?? 0) + net)
        }

        rowData['ub'] = oreToKr(ub)
        sumUb += ub

        const row = sheetSb.addRow(rowData)
        // Apply numFmt to all amount cells
        row.getCell('ib').numFmt = AMOUNT_FMT
        for (const mk of monthKeys) {
          row.getCell(`m_${mk}`).numFmt = AMOUNT_FMT
        }
        row.getCell('ub').numFmt = AMOUNT_FMT
      }

      return { sumIb, sumUb, sumMonths }
    }

    // BS accounts
    const bsAccounts = accounts.filter((a) => isBalanceSheet(a.account_number))
    sheetSb.addRow({ konto: 'BALANSRÄKNING' })
    addSbAccountRows(bsAccounts)
    sheetSb.addRow({})

    // PL accounts
    const plAccounts = accounts.filter((a) => !isBalanceSheet(a.account_number))
    sheetSb.addRow({ konto: 'RESULTATRÄKNING' })
    addSbAccountRows(plAccounts)
  } else {
    // Partial months → 3-column mode: IB, Förändring, UB
    sheetSb.columns = [
      { header: 'Konto', key: 'konto', width: 10 },
      { header: 'Kontonamn', key: 'kontonamn', width: 35 },
      { header: 'IB', key: 'ib', width: 15 },
      { header: 'Förändring', key: 'change', width: 15 },
      { header: 'UB', key: 'ub', width: 15 },
    ]

    // Filtered totals per account
    const filteredTotals = new Map<string, number>()
    for (const mt of monthlyTotals) {
      const existing = filteredTotals.get(mt.account_number) ?? 0
      filteredTotals.set(
        mt.account_number,
        existing + (mt.total_debit - mt.total_credit),
      )
    }

    function addPartialRows(filteredAccounts: AccountInfo[]) {
      for (const acct of filteredAccounts) {
        const ib = getIbForAccount(acct.account_number)
        const change = filteredTotals.get(acct.account_number) ?? 0
        if (ib === 0 && change === 0) continue
        const ub = ib + change
        const row = sheetSb.addRow({
          konto: acct.account_number,
          kontonamn: acct.name,
          ib: oreToKr(ib),
          change: oreToKr(change),
          ub: oreToKr(ub),
        })
        row.getCell('ib').numFmt = AMOUNT_FMT
        row.getCell('change').numFmt = AMOUNT_FMT
        row.getCell('ub').numFmt = AMOUNT_FMT
      }
    }

    sheetSb.addRow({ konto: 'BALANSRÄKNING' })
    addPartialRows(accounts.filter((a) => isBalanceSheet(a.account_number)))
    sheetSb.addRow({})
    sheetSb.addRow({ konto: 'RESULTATRÄKNING' })
    addPartialRows(accounts.filter((a) => !isBalanceSheet(a.account_number)))
  }

  // ═══ FLIK 4: Företagsinfo ═══
  const sheetInfo = workbook.addWorksheet('Företagsinfo')
  sheetInfo.columns = [
    { header: 'Fält', key: 'field', width: 25 },
    { header: 'Värde', key: 'value', width: 50 },
  ]

  const exportPeriod =
    startDate && endDate ? `${startDate} — ${endDate}` : 'Hela året'
  const verCount = entries.length
  const acctCount = accounts.length
  const now = new Date()
  const exportDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

  sheetInfo.addRow({ field: 'Företagsnamn', value: company.name })
  sheetInfo.addRow({ field: 'Organisationsnummer', value: company.org_number })
  sheetInfo.addRow({
    field: 'Räkenskapsår',
    value: `${fy.start_date} — ${fy.end_date}`,
  })
  sheetInfo.addRow({ field: 'Exportperiod', value: exportPeriod })
  sheetInfo.addRow({ field: 'Exportdatum', value: exportDate })
  sheetInfo.addRow({ field: 'Program', value: 'Fritt Bokföring 1.0.0' })
  sheetInfo.addRow({ field: 'Antal verifikationer', value: verCount })
  sheetInfo.addRow({ field: 'Antal konton', value: acctCount })

  // Generate buffer
  const arrayBuffer = await workbook.xlsx.writeBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Filename
  const safeName = sanitizeFilename(company.name)
  const yearLabel = fy.start_date.substring(0, 4)
  const dateSuffix = startDate && endDate ? `_${startDate}_${endDate}` : ''
  const filename = `${safeName}_${yearLabel}${dateSuffix}.xlsx`

  return { buffer, filename }
}
