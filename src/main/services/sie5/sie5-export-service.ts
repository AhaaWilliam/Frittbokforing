import type Database from 'better-sqlite3'
import { create } from 'xmlbuilder2'
import type { XMLBuilder } from 'xmlbuilder2/lib/interfaces'
import { getNow } from '../../utils/now'
import { mapAccountType } from './account-type-mapper'
import { oreToSie5Amount, debitCreditToSie5Amount } from './amount-conversion'
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
  getCustomers,
  getSuppliers,
  getBookedInvoices,
  getInvoicePayments,
  getBookedExpenses,
  getExpensePayments,
} from './sie5-data-queries'
import type { PaymentInfo } from './sie5-data-queries'

const SIE5_NS = 'http://www.sie.se/sie5'
const XSI_NS = 'http://www.w3.org/2001/XMLSchema-instance'

export interface Sie5ExportOptions {
  fiscalYearId: number
}

// ═══ Period balance computation ═══

interface AccountPeriodBalance {
  month: string // YYYY-MM
  openingBalance: number // öre
  closingBalance: number // öre
}

function isBalanceSheetAccount(accountNumber: string): boolean {
  return accountNumber.startsWith('1') || accountNumber.startsWith('2')
}

function computePeriodBalances(
  accountNumber: string,
  months: string[],
  monthlyMap: Map<string, { debit: number; credit: number }>,
  ibFromPrevYear: number,
): AccountPeriodBalance[] {
  const isBs = isBalanceSheetAccount(accountNumber)
  const balances: AccountPeriodBalance[] = []
  let cumulative = 0

  for (const month of months) {
    const data = monthlyMap.get(month)
    const monthNet = data ? data.debit - data.credit : 0
    cumulative += monthNet

    const ob = isBs
      ? ibFromPrevYear + cumulative - monthNet
      : cumulative - monthNet
    const cb = isBs ? ibFromPrevYear + cumulative : cumulative

    balances.push({ month, openingBalance: ob, closingBalance: cb })
  }

  return balances
}

// ═══ Reskontra balance timeline ═══

function computeInvoiceBalances(
  invoiceDate: string,
  totalOre: number,
  payments: PaymentInfo[],
  fyEndDate: string,
): { month: string; amount: number }[] {
  const startMonth = invoiceDate.substring(0, 7)
  const endMonth = fyEndDate.substring(0, 7)
  const result: { month: string; amount: number }[] = []

  // Generate months from invoice date to FY end
  let currentDate = new Date(startMonth + '-01')
  const endDate = new Date(endMonth + '-01')

  while (currentDate <= endDate) {
    const m = currentDate.toISOString().substring(0, 7)
    // Sum payments up to end of this month
    let paidToDate = 0
    for (const p of payments) {
      if (p.payment_date.substring(0, 7) <= m) {
        paidToDate += p.amount_ore
      }
    }
    const balance = totalOre - paidToDate
    result.push({ month: m, amount: balance })

    // Stop if balance is 0 (but include the 0-month)
    if (balance === 0) break

    currentDate.setMonth(currentDate.getMonth() + 1)
  }

  return result
}

// ═══ Main export function ═══

export function exportSie5(
  db: Database.Database,
  options: Sie5ExportOptions,
): string {
  const { fiscalYearId } = options

  // Fetch all data
  const company = getCompanyInfo(db, fiscalYearId)
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
  const customers = getCustomers(db)
  const suppliers = getSuppliers(db)
  const invoices = getBookedInvoices(db, fiscalYearId)
  const expenses = getBookedExpenses(db, fiscalYearId)

  const invoicePayments = getInvoicePayments(
    db,
    invoices.map((i) => i.id),
  )
  const expensePayments = getExpensePayments(
    db,
    expenses.map((e) => e.id),
  )

  // Build monthly totals map: account → month → {debit, credit}
  const acctMonthlyMap = new Map<
    string,
    Map<string, { debit: number; credit: number }>
  >()
  for (const mt of monthlyTotals) {
    if (!acctMonthlyMap.has(mt.account_number)) {
      acctMonthlyMap.set(mt.account_number, new Map())
    }
    acctMonthlyMap
      .get(mt.account_number)!
      .set(mt.month, { debit: mt.total_debit, credit: mt.total_credit })
  }

  // All months from periods
  const allMonths = periods.map((p) => p.start_date.substring(0, 7))

  // Group entries by verification_series
  const seriesMap = new Map<string, typeof entries>()
  for (const e of entries) {
    const series = e.verification_series || 'A'
    if (!seriesMap.has(series)) seriesMap.set(series, [])
    seriesMap.get(series)!.push(e)
  }

  // Group payments by parent id
  const invoicePaymentsMap = new Map<number, PaymentInfo[]>()
  for (const p of invoicePayments) {
    if (!invoicePaymentsMap.has(p.parent_id))
      invoicePaymentsMap.set(p.parent_id, [])
    invoicePaymentsMap.get(p.parent_id)!.push(p)
  }
  const expensePaymentsMap = new Map<number, PaymentInfo[]>()
  for (const p of expensePayments) {
    if (!expensePaymentsMap.has(p.parent_id))
      expensePaymentsMap.set(p.parent_id, [])
    expensePaymentsMap.get(p.parent_id)!.push(p)
  }

  // ═══ Build XML ═══

  const now = getNow()
    .toISOString()
    .replace(/\.\d+Z$/, 'Z')

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
  const sie = doc
    .ele(SIE5_NS, 'Sie')
    .att(
      XSI_NS,
      'xsi:schemaLocation',
      'http://www.sie.se/sie5 https://sie.se/sie5.xsd',
    )

  // FileInfo
  const fileInfo = sie.ele(SIE5_NS, 'FileInfo')
  fileInfo
    .ele(SIE5_NS, 'SoftwareProduct')
    .att('name', 'Fritt Bokföring')
    .att('version', '1.0.0')
  fileInfo
    .ele(SIE5_NS, 'FileCreation')
    .att('time', now)
    .att('by', 'Fritt Bokföring')
  fileInfo
    .ele(SIE5_NS, 'Company')
    .att('organizationId', company.org_number)
    .att('name', company.name)

  const fiscalYears = fileInfo.ele(SIE5_NS, 'FiscalYears')
  fiscalYears
    .ele(SIE5_NS, 'FiscalYear')
    .att('start', fy.start_date)
    .att('end', fy.end_date)
    .att('primary', 'true')

  fileInfo.ele(SIE5_NS, 'AccountingCurrency').att('currency', 'SEK')

  // Accounts with period balances
  const accountsEl = sie.ele(SIE5_NS, 'Accounts')
  for (const acct of accounts) {
    const acctEl = accountsEl
      .ele(SIE5_NS, 'Account')
      .att('id', acct.account_number)
      .att('name', acct.name)
      .att('type', mapAccountType(acct.account_number))

    const monthMap = acctMonthlyMap.get(acct.account_number) ?? new Map()
    const ib = ibMap.get(acct.account_number) ?? 0
    const hasTransactions = monthMap.size > 0
    const hasIb = ib !== 0

    if (hasTransactions || hasIb) {
      const balances = computePeriodBalances(
        acct.account_number,
        allMonths,
        monthMap,
        ib,
      )

      // Determine which months to emit
      const activeMonths = new Set<string>()
      for (const m of monthMap.keys()) activeMonths.add(m)

      let minIdx = 0
      let maxIdx = allMonths.length - 1

      if (hasTransactions) {
        const monthIndices = allMonths
          .map((m, i) => (activeMonths.has(m) ? i : -1))
          .filter((i) => i >= 0)
        minIdx = monthIndices[0]
        maxIdx = monthIndices[monthIndices.length - 1]
      }

      // If IB != 0 but no transactions, still emit month 1
      if (hasIb && !hasTransactions) {
        minIdx = 0
        maxIdx = 0
      }
      // If IB != 0, ensure month 0 is included
      if (hasIb && minIdx > 0) {
        minIdx = 0
      }

      for (let i = minIdx; i <= maxIdx; i++) {
        const b = balances[i]
        acctEl
          .ele(SIE5_NS, 'OpeningBalance')
          .att('month', b.month)
          .att('amount', oreToSie5Amount(b.openingBalance))
        acctEl
          .ele(SIE5_NS, 'ClosingBalance')
          .att('month', b.month)
          .att('amount', oreToSie5Amount(b.closingBalance))
      }
    }
  }

  // CustomerInvoices
  if (invoices.length > 0) {
    const custInvEl = sie
      .ele(SIE5_NS, 'CustomerInvoices')
      .att('primaryAccountId', '1510')

    for (const inv of invoices) {
      const invEl = custInvEl
        .ele(SIE5_NS, 'CustomerInvoice')
        .att('id', `INV-${inv.id}`)
        .att('customerId', `C${inv.counterparty_id}`)
        .att('invoiceNumber', inv.invoice_number)
      if (inv.due_date) invEl.att('dueDate', inv.due_date)

      // Balances BEFORE OriginalAmount (strict sequence)
      const payments = invoicePaymentsMap.get(inv.id) ?? []
      const balTimeline = computeInvoiceBalances(
        inv.invoice_date,
        inv.total_amount_ore,
        payments,
        fy.end_date,
      )
      for (const b of balTimeline) {
        invEl
          .ele(SIE5_NS, 'Balances')
          .att('month', b.month)
          .att('amount', oreToSie5Amount(b.amount))
      }

      invEl
        .ele(SIE5_NS, 'OriginalAmount')
        .att('date', inv.invoice_date)
        .att('amount', oreToSie5Amount(inv.total_amount_ore))
    }
  }

  // SupplierInvoices
  if (expenses.length > 0) {
    const suppInvEl = sie
      .ele(SIE5_NS, 'SupplierInvoices')
      .att('primaryAccountId', '2440')

    for (const exp of expenses) {
      const expEl = suppInvEl
        .ele(SIE5_NS, 'SupplierInvoice')
        .att('id', `EXP-${exp.id}`)
        .att('supplierId', `S${exp.counterparty_id}`)
        .att('invoiceNumber', exp.supplier_invoice_number || `EXP-${exp.id}`)
      if (exp.due_date) expEl.att('dueDate', exp.due_date)

      // Balances BEFORE OriginalAmount (strict sequence)
      // Supplier invoices: negative amounts (credit on 2440)
      const payments = expensePaymentsMap.get(exp.id) ?? []
      const balTimeline = computeInvoiceBalances(
        exp.expense_date,
        exp.total_amount_ore,
        payments,
        fy.end_date,
      )
      for (const b of balTimeline) {
        expEl
          .ele(SIE5_NS, 'Balances')
          .att('month', b.month)
          .att('amount', oreToSie5Amount(-b.amount))
      }

      expEl
        .ele(SIE5_NS, 'OriginalAmount')
        .att('date', exp.expense_date)
        .att('amount', oreToSie5Amount(-exp.total_amount_ore))
    }
  }

  // Customers
  if (customers.length > 0) {
    const custEl = sie.ele(SIE5_NS, 'Customers')
    for (const c of customers) {
      const cEl = custEl
        .ele(SIE5_NS, 'Customer')
        .att('id', `C${c.id}`)
        .att('name', c.name)
      if (c.org_number) cEl.att('organizationId', c.org_number)
    }
  }

  // Suppliers
  if (suppliers.length > 0) {
    const suppEl = sie.ele(SIE5_NS, 'Suppliers')
    for (const s of suppliers) {
      const sEl = suppEl
        .ele(SIE5_NS, 'Supplier')
        .att('id', `S${s.id}`)
        .att('name', s.name)
      if (s.org_number) sEl.att('organizationId', s.org_number)
    }
  }

  // Journals — only emit series that have entries
  const seriesNames: Record<string, string> = {
    A: 'Kundfakturor',
    B: 'Leverantörsfakturor',
    C: 'Manuella verifikationer',
    E: 'Avskrivningar',
    I: 'Importerade verifikationer',
    O: 'Ingående balanser',
  }

  for (const [series, seriesEntries] of seriesMap) {
    if (seriesEntries.length === 0) continue

    const journalEl = sie
      .ele(SIE5_NS, 'Journal')
      .att('id', series)
      .att('name', seriesNames[series] || `Serie ${series}`)

    for (const entry of seriesEntries) {
      const entryEl = journalEl
        .ele(SIE5_NS, 'JournalEntry')
        .att('id', String(entry.verification_number))
        .att('journalDate', entry.journal_date)
        .att('text', entry.description)

      entryEl
        .ele(SIE5_NS, 'EntryInfo')
        .att('date', entry.created_at.substring(0, 10))
        .att('by', 'Fritt Bokföring')

      const lines = linesMap.get(entry.id) ?? []
      for (const line of lines) {
        ;(entryEl.ele(SIE5_NS, 'LedgerEntry') as XMLBuilder)
          .att('accountId', line.account_number)
          .att(
            'amount',
            debitCreditToSie5Amount(line.debit_ore, line.credit_ore),
          )
      }
    }
  }

  return doc.end({ prettyPrint: true })
}
