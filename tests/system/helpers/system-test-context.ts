/**
 * System Test Context — Bootstrap + Seed Helpers
 *
 * Pattern: Template Database
 * - beforeAll: create ONE template DB with all migrations + seed data
 * - beforeEach: copy template to new temp file (fast: ~1ms)
 * - afterEach: close DB + delete temp file
 * - afterAll: delete template file
 *
 * All services share the SAME db instance (integration testing, not unit testing).
 * Disk-based SQLite (not :memory:) for WAL-mode compatibility.
 */

import Database from 'better-sqlite3'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { migrations } from '../../../src/main/migrations'
import { registerCustomFunctions } from '../../../src/main/db-functions'

// === Service imports ===
import {
  createCompany,
  getCompany,
  updateCompany,
} from '../../../src/main/services/company-service'
import {
  listFiscalYears,
  listFiscalPeriods,
  closePeriod,
  reopenPeriod,
  createNewFiscalYear,
} from '../../../src/main/services/fiscal-service'
import {
  listCounterparties,
  getCounterparty,
  createCounterparty,
  updateCounterparty,
  deactivateCounterparty,
} from '../../../src/main/services/counterparty-service'
import {
  listProducts,
  getProduct,
  createProduct,
  updateProduct,
  deactivateProduct,
  setCustomerPrice,
  removeCustomerPrice,
  getPriceForCustomer,
} from '../../../src/main/services/product-service'
import { listVatCodes } from '../../../src/main/services/vat-service'
import {
  listAccounts,
  listAllAccounts,
  createAccount,
  updateAccount,
  toggleAccountActive,
  validateAccountsActive,
} from '../../../src/main/services/account-service'
import {
  saveDraft,
  getDraft,
  updateDraft,
  deleteDraft,
  listDrafts,
  nextInvoiceNumber,
  finalizeDraft,
  listInvoices,
  payInvoice,
  getPayments,
  getFinalized,
  refreshInvoiceStatuses,
} from '../../../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  getExpenseDraft,
  updateExpenseDraft,
  deleteExpenseDraft,
  listExpenseDrafts,
  finalizeExpense,
  payExpense,
  getExpensePayments,
  getExpense,
  listExpenses,
  refreshExpenseStatuses,
} from '../../../src/main/services/expense-service'
import {
  saveManualEntryDraft,
  getManualEntry,
  updateManualEntryDraft,
  deleteManualEntryDraft,
  listManualEntryDrafts,
  listManualEntries,
  finalizeManualEntry,
} from '../../../src/main/services/manual-entry-service'
import { getDashboardSummary } from '../../../src/main/services/dashboard-service'
import { getTaxForecast } from '../../../src/main/services/tax-service'
import { getVatReport } from '../../../src/main/services/vat-report-service'
import {
  calculateNetResult,
  bookYearEndResult,
  createOpeningBalance,
  reTransferOpeningBalance,
} from '../../../src/main/services/opening-balance-service'
import {
  getIncomeStatement,
  getBalanceSheet,
} from '../../../src/main/services/report/report-service'
import { exportSie4 } from '../../../src/main/services/sie4/sie4-export-service'
import { exportSie5 } from '../../../src/main/services/sie5/sie5-export-service'
import { exportExcel } from '../../../src/main/services/excel/excel-export-service'
import { generateInvoicePdf } from '../../../src/main/services/pdf/invoice-pdf-service'

import type {
  FiscalPeriod,
  FiscalYear,
  Counterparty,
  Product,
  VatCode,
  InvoicePayment,
  ExpensePayment,
  JournalEntry,
} from '../../../src/shared/types'

// ============================================================
// Types
// ============================================================

export interface SystemTestContext {
  db: Database.Database
  dbPath: string

  // Services (bound to ctx.db)
  companyService: {
    createCompany: typeof createCompany
    getCompany: typeof getCompany
    updateCompany: typeof updateCompany
  }
  fiscalService: {
    listFiscalYears: typeof listFiscalYears
    listFiscalPeriods: typeof listFiscalPeriods
    closePeriod: typeof closePeriod
    reopenPeriod: typeof reopenPeriod
    createNewFiscalYear: typeof createNewFiscalYear
  }
  counterpartyService: {
    listCounterparties: typeof listCounterparties
    getCounterparty: typeof getCounterparty
    createCounterparty: typeof createCounterparty
    updateCounterparty: typeof updateCounterparty
    deactivateCounterparty: typeof deactivateCounterparty
  }
  productService: {
    listProducts: typeof listProducts
    getProduct: typeof getProduct
    createProduct: typeof createProduct
    updateProduct: typeof updateProduct
    deactivateProduct: typeof deactivateProduct
    setCustomerPrice: typeof setCustomerPrice
    removeCustomerPrice: typeof removeCustomerPrice
    getPriceForCustomer: typeof getPriceForCustomer
  }
  vatService: {
    listVatCodes: typeof listVatCodes
  }
  accountService: {
    listAccounts: typeof listAccounts
    listAllAccounts: typeof listAllAccounts
    createAccount: typeof createAccount
    updateAccount: typeof updateAccount
    toggleAccountActive: typeof toggleAccountActive
    validateAccountsActive: typeof validateAccountsActive
  }
  invoiceService: {
    saveDraft: typeof saveDraft
    getDraft: typeof getDraft
    updateDraft: typeof updateDraft
    deleteDraft: typeof deleteDraft
    listDrafts: typeof listDrafts
    nextInvoiceNumber: typeof nextInvoiceNumber
    finalizeDraft: typeof finalizeDraft
    listInvoices: typeof listInvoices
    payInvoice: typeof payInvoice
    getPayments: typeof getPayments
    getFinalized: typeof getFinalized
    refreshInvoiceStatuses: typeof refreshInvoiceStatuses
  }
  expenseService: {
    saveExpenseDraft: typeof saveExpenseDraft
    getExpenseDraft: typeof getExpenseDraft
    updateExpenseDraft: typeof updateExpenseDraft
    deleteExpenseDraft: typeof deleteExpenseDraft
    listExpenseDrafts: typeof listExpenseDrafts
    finalizeExpense: typeof finalizeExpense
    payExpense: typeof payExpense
    getExpensePayments: typeof getExpensePayments
    getExpense: typeof getExpense
    listExpenses: typeof listExpenses
    refreshExpenseStatuses: typeof refreshExpenseStatuses
  }
  manualEntryService: {
    saveManualEntryDraft: typeof saveManualEntryDraft
    getManualEntry: typeof getManualEntry
    updateManualEntryDraft: typeof updateManualEntryDraft
    deleteManualEntryDraft: typeof deleteManualEntryDraft
    listManualEntryDrafts: typeof listManualEntryDrafts
    listManualEntries: typeof listManualEntries
    finalizeManualEntry: typeof finalizeManualEntry
  }
  dashboardService: {
    getDashboardSummary: typeof getDashboardSummary
  }
  taxService: {
    getTaxForecast: typeof getTaxForecast
  }
  vatReportService: {
    getVatReport: typeof getVatReport
  }
  openingBalanceService: {
    calculateNetResult: typeof calculateNetResult
    bookYearEndResult: typeof bookYearEndResult
    createOpeningBalance: typeof createOpeningBalance
    reTransferOpeningBalance: typeof reTransferOpeningBalance
  }
  reportService: {
    getIncomeStatement: typeof getIncomeStatement
    getBalanceSheet: typeof getBalanceSheet
  }
  sie4ExportService: {
    exportSie4: typeof exportSie4
  }
  sie5ExportService: {
    exportSie5: typeof exportSie5
  }
  excelExportService: {
    exportExcel: typeof exportExcel
  }
  pdfService: {
    generateInvoicePdf: typeof generateInvoicePdf
  }

  // Seeded data
  seed: {
    companyId: number
    fiscalYearId: number
    periods: FiscalPeriod[]
  }
}

export interface CreateContextOptions {
  fiscalRule?: 'K2' | 'K3'
  startDate?: string // default '2026-01-01'
  endDate?: string // default '2026-12-31'
}

// ============================================================
// Template Database Management
// ============================================================

let templateDbPath: string | null = null

/**
 * Create the template database (call once in beforeAll).
 * Runs all 13 migrations + seeds a company with FY and periods.
 */
export function createTemplateDb(options?: CreateContextOptions): void {
  const fiscalRule = options?.fiscalRule ?? 'K2'
  const startDate = options?.startDate ?? '2026-01-01'
  const endDate = options?.endDate ?? '2026-12-31'

  templateDbPath = path.join(
    os.tmpdir(),
    `fritt-template-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  )
  const db = new Database(templateDbPath)

  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  registerCustomFunctions(db)

  // Run all migrations
  for (let i = 0; i < migrations.length; i++) {
    db.exec('BEGIN EXCLUSIVE')
    try {
      db.exec(migrations[i].sql)
      if (migrations[i].programmatic) {
        migrations[i].programmatic!(db)
      }
      db.pragma(`user_version = ${i + 1}`)
      db.exec('COMMIT')
    } catch (err) {
      db.exec('ROLLBACK')
      throw err
    }
  }

  // Seed company
  const orgNumber = '559123-4560'
  db.prepare(
    `
    INSERT INTO companies (org_number, name, fiscal_rule, share_capital, registration_date)
    VALUES (?, 'Testföretag AB', ?, 2500000, '2020-01-15')
  `,
  ).run(orgNumber, fiscalRule)

  const company = db.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }

  // Seed fiscal year
  const yearLabel = startDate.substring(0, 4)
  db.prepare(
    `
    INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
    VALUES (?, ?, ?, ?)
  `,
  ).run(company.id, yearLabel, startDate, endDate)

  const fy = db
    .prepare(
      'SELECT id FROM fiscal_years WHERE company_id = ? ORDER BY id DESC LIMIT 1',
    )
    .get(company.id) as { id: number }

  // Generate periods (12 months)
  const start = new Date(startDate)
  const end = new Date(endDate)
  let periodNum = 1
  const cursor = new Date(start)
  while (cursor <= end && periodNum <= 12) {
    const pStart = cursor.toISOString().split('T')[0]
    const nextMonth = new Date(cursor)
    nextMonth.setMonth(nextMonth.getMonth() + 1)
    nextMonth.setDate(0) // last day of current month
    let pEnd = nextMonth.toISOString().split('T')[0]
    if (new Date(pEnd) > end) pEnd = endDate

    db.prepare(
      `
      INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date)
      VALUES (?, ?, ?, ?, ?)
    `,
    ).run(company.id, fy.id, periodNum, pStart, pEnd)

    periodNum++
    cursor.setMonth(cursor.getMonth() + 1)
    cursor.setDate(1)
  }

  // verification_sequences table dropped in migration 028 (F7)

  db.close()
}

/**
 * Create a fresh test context by copying the template database.
 */
export function createSystemTestContext(): SystemTestContext {
  if (!templateDbPath || !fs.existsSync(templateDbPath)) {
    throw new Error(
      'Template DB not created. Call createTemplateDb() in beforeAll.',
    )
  }

  const dbPath = path.join(
    os.tmpdir(),
    `fritt-test-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
  )
  fs.copyFileSync(templateDbPath, dbPath)

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  registerCustomFunctions(db)

  // Read seeded data
  const company = db.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  const fy = db
    .prepare(
      'SELECT * FROM fiscal_years WHERE company_id = ? ORDER BY id LIMIT 1',
    )
    .get(company.id) as FiscalYear
  const periods = db
    .prepare(
      'SELECT * FROM accounting_periods WHERE fiscal_year_id = ? ORDER BY period_number',
    )
    .all(fy.id) as FiscalPeriod[]

  return {
    db,
    dbPath,
    companyService: { createCompany, getCompany, updateCompany },
    fiscalService: {
      listFiscalYears,
      listFiscalPeriods,
      closePeriod,
      reopenPeriod,
      createNewFiscalYear,
    },
    counterpartyService: {
      listCounterparties,
      getCounterparty,
      createCounterparty,
      updateCounterparty,
      deactivateCounterparty,
    },
    productService: {
      listProducts,
      getProduct,
      createProduct,
      updateProduct,
      deactivateProduct,
      setCustomerPrice,
      removeCustomerPrice,
      getPriceForCustomer,
    },
    vatService: { listVatCodes },
    accountService: {
      listAccounts,
      listAllAccounts,
      createAccount,
      updateAccount,
      toggleAccountActive,
      validateAccountsActive,
    },
    invoiceService: {
      saveDraft,
      getDraft,
      updateDraft,
      deleteDraft,
      listDrafts,
      nextInvoiceNumber,
      finalizeDraft,
      listInvoices,
      payInvoice,
      getPayments,
      getFinalized,
      refreshInvoiceStatuses,
    },
    expenseService: {
      saveExpenseDraft,
      getExpenseDraft,
      updateExpenseDraft,
      deleteExpenseDraft,
      listExpenseDrafts,
      finalizeExpense,
      payExpense,
      getExpensePayments,
      getExpense,
      listExpenses,
      refreshExpenseStatuses,
    },
    manualEntryService: {
      saveManualEntryDraft,
      getManualEntry,
      updateManualEntryDraft,
      deleteManualEntryDraft,
      listManualEntryDrafts,
      listManualEntries,
      finalizeManualEntry,
    },
    dashboardService: { getDashboardSummary },
    taxService: { getTaxForecast },
    vatReportService: { getVatReport },
    openingBalanceService: {
      calculateNetResult,
      bookYearEndResult,
      createOpeningBalance,
      reTransferOpeningBalance,
    },
    reportService: { getIncomeStatement, getBalanceSheet },
    sie4ExportService: { exportSie4 },
    sie5ExportService: { exportSie5 },
    excelExportService: { exportExcel },
    pdfService: { generateInvoicePdf },
    seed: {
      companyId: company.id,
      fiscalYearId: fy.id,
      periods,
    },
  }
}

/**
 * Cleanup: close db and delete temp file.
 */
export function destroyContext(ctx: SystemTestContext): void {
  try {
    ctx.db.close()
  } catch {
    /* already closed */
  }
  try {
    if (fs.existsSync(ctx.dbPath)) fs.unlinkSync(ctx.dbPath)
    // Also clean WAL/SHM files
    for (const ext of ['-wal', '-shm']) {
      const f = ctx.dbPath + ext
      if (fs.existsSync(f)) fs.unlinkSync(f)
    }
  } catch {
    /* best effort */
  }
}

/**
 * Cleanup template database (call in afterAll).
 */
export function destroyTemplateDb(): void {
  if (templateDbPath) {
    try {
      if (fs.existsSync(templateDbPath)) fs.unlinkSync(templateDbPath)
      for (const ext of ['-wal', '-shm']) {
        const f = templateDbPath + ext
        if (fs.existsSync(f)) fs.unlinkSync(f)
      }
    } catch {
      /* best effort */
    }
    templateDbPath = null
  }
}

// ============================================================
// Seed Helpers — common test data operations
// ============================================================

/** Get the outgoing 25% VAT code (MP1) */
export function getVatCode25Out(ctx: SystemTestContext): VatCode {
  return ctx.db
    .prepare("SELECT * FROM vat_codes WHERE code = 'MP1'")
    .get() as VatCode
}

/** Get the incoming 25% VAT code (IP1) */
export function getVatCode25In(ctx: SystemTestContext): VatCode {
  return ctx.db
    .prepare("SELECT * FROM vat_codes WHERE code = 'IP1'")
    .get() as VatCode
}

/** Get the outgoing 12% VAT code (MP2) */
export function getVatCode12Out(ctx: SystemTestContext): VatCode {
  return ctx.db
    .prepare("SELECT * FROM vat_codes WHERE code = 'MP2'")
    .get() as VatCode
}

/** Get the exempt VAT code (MF) */
export function getVatCodeExempt(ctx: SystemTestContext): VatCode {
  return ctx.db
    .prepare("SELECT * FROM vat_codes WHERE code = 'MF'")
    .get() as VatCode
}

/** Get incoming exempt VAT code (MF0) */
export function getVatCodeInExempt(ctx: SystemTestContext): VatCode {
  return ctx.db
    .prepare("SELECT * FROM vat_codes WHERE code = 'MF0'")
    .get() as VatCode
}

/** Seed a customer counterparty */
export function seedCustomer(
  ctx: SystemTestContext,
  overrides?: Partial<{ name: string; org_number: string }>,
): Counterparty {
  const result = createCounterparty(ctx.db, {
    company_id: ctx.seed.companyId,
    name: overrides?.name ?? 'Testkund AB',
    type: 'customer',
    org_number: overrides?.org_number ?? null,
    default_payment_terms: 30,
  })
  if (!result.success) throw new Error(`seedCustomer failed: ${result.error}`)
  return result.data
}

/** Seed a supplier counterparty */
export function seedSupplier(
  ctx: SystemTestContext,
  overrides?: Partial<{ name: string; org_number: string }>,
): Counterparty {
  const result = createCounterparty(ctx.db, {
    company_id: ctx.seed.companyId,
    name: overrides?.name ?? 'Testleverantör AB',
    type: 'supplier',
    org_number: overrides?.org_number ?? null,
    default_payment_terms: 30,
  })
  if (!result.success) throw new Error(`seedSupplier failed: ${result.error}`)
  return result.data
}

/** Seed a product (service type, 25% VAT, default price 100 kr = 10000 öre) */
export function seedProduct(
  ctx: SystemTestContext,
  overrides?: Partial<{
    name: string
    default_price_ore: number
    vat_code_id: number
    article_type: 'service' | 'goods' | 'expense'
  }>,
): Product {
  const vatCode = overrides?.vat_code_id ?? getVatCode25Out(ctx).id
  // Get the account_id for default service account 3002
  const account = ctx.db
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }

  const result = createProduct(ctx.db, {
    company_id: ctx.seed.companyId,
    name: overrides?.name ?? 'Konsulttjänst',
    default_price_ore: overrides?.default_price_ore ?? 10000, // 100 kr
    vat_code_id: vatCode,
    account_id: account.id,
    article_type: overrides?.article_type ?? 'service',
  })
  if (!result.success) throw new Error(`seedProduct failed: ${result.error}`)
  return result.data
}

/** Seed and finalize a customer invoice. Returns { invoice, journalEntry } */
export function seedAndFinalizeInvoice(
  ctx: SystemTestContext,
  overrides?: Partial<{
    counterpartyId: number
    invoiceDate: string
    dueDate: string
    lines: Array<{
      product_id: number | null
      description: string
      quantity: number
      unit_price_ore: number
      vat_code_id: number
      account_number?: string | null
    }>
  }>,
): { invoiceId: number; verificationNumber: number } {
  const customer = overrides?.counterpartyId
    ? (ctx.db
        .prepare('SELECT * FROM counterparties WHERE id = ?')
        .get(overrides.counterpartyId) as Counterparty)
    : seedCustomer(ctx, { name: `Kund ${Date.now()}` })

  const vatCode = getVatCode25Out(ctx)
  const invoiceDate = overrides?.invoiceDate ?? '2026-03-15'
  const dueDate = overrides?.dueDate ?? '2026-04-14'

  const lines = overrides?.lines ?? [
    {
      product_id: null,
      description: 'Tjänst',
      quantity: 1,
      unit_price_ore: 10000, // 100 kr
      vat_code_id: vatCode.id,
      sort_order: 0,
      account_number: '3002',
    },
  ]

  const draft = saveDraft(ctx.db, {
    counterparty_id: customer.id,
    fiscal_year_id: ctx.seed.fiscalYearId,
    invoice_date: invoiceDate,
    due_date: dueDate,
    lines: lines.map((l, i) => ({ ...l, sort_order: i })),
  })
  if (!draft.success) throw new Error(`saveDraft failed: ${draft.error}`)

  const result = finalizeDraft(ctx.db, draft.data.id)
  if (!result.success) throw new Error(`finalizeDraft failed: ${result.error}`)

  // finalizeDraft returns InvoiceWithLines — get verification_number from linked journal_entry
  const je = ctx.db
    .prepare(
      'SELECT verification_number FROM journal_entries WHERE id = (SELECT journal_entry_id FROM invoices WHERE id = ?)',
    )
    .get(draft.data.id) as { verification_number: number }

  return {
    invoiceId: draft.data.id,
    verificationNumber: je.verification_number,
  }
}

/** Seed, finalize AND pay an invoice fully */
export function seedAndPayInvoice(
  ctx: SystemTestContext,
  overrides?: Partial<{
    counterpartyId: number
    invoiceDate: string
    paymentDate: string
    unitPrice: number
  }>,
): { invoiceId: number; payment: InvoicePayment } {
  const invoiceDate = overrides?.invoiceDate ?? '2026-03-15'
  const paymentDate = overrides?.paymentDate ?? '2026-03-20'
  const unitPrice = overrides?.unitPrice ?? 10000

  const customer = overrides?.counterpartyId
    ? undefined
    : seedCustomer(ctx, { name: `Kund ${Date.now()}` })

  const vatCode = getVatCode25Out(ctx)

  const { invoiceId } = seedAndFinalizeInvoice(ctx, {
    counterpartyId: overrides?.counterpartyId ?? customer!.id,
    invoiceDate,
    lines: [
      {
        product_id: null,
        description: 'Tjänst',
        quantity: 1,
        unit_price_ore: unitPrice,
        vat_code_id: vatCode.id,
        account_number: '3002',
      },
    ],
  })

  // Get total to pay
  const inv = ctx.db
    .prepare('SELECT total_amount_ore FROM invoices WHERE id = ?')
    .get(invoiceId) as { total_amount_ore: number }

  const payResult = payInvoice(ctx.db, {
    invoice_id: invoiceId,
    amount_ore: inv.total_amount_ore,
    payment_date: paymentDate,
    payment_method: 'bank',
    account_number: '1930',
  })
  if (!payResult.success)
    throw new Error(`payInvoice failed: ${payResult.error}`)

  return { invoiceId, payment: payResult.data.payment }
}

/** Seed and finalize an expense (B-series). Returns { expenseId, verificationNumber } */
export function seedAndFinalizeExpense(
  ctx: SystemTestContext,
  overrides?: Partial<{
    counterpartyId: number
    expenseDate: string
    dueDate: string
    lines: Array<{
      description: string
      account_number: string
      quantity: number
      unit_price_ore: number
      vat_code_id: number
    }>
  }>,
): { expenseId: number; verificationNumber: number } {
  const supplier = overrides?.counterpartyId
    ? (ctx.db
        .prepare('SELECT * FROM counterparties WHERE id = ?')
        .get(overrides.counterpartyId) as Counterparty)
    : seedSupplier(ctx, { name: `Leverantör ${Date.now()}` })

  const vatCode = getVatCode25In(ctx)
  const expenseDate = overrides?.expenseDate ?? '2026-03-15'
  const dueDate = overrides?.dueDate ?? '2026-04-14'

  const lines = overrides?.lines ?? [
    {
      description: 'Kontorsmaterial',
      account_number: '6110',
      quantity: 100, // expense quantity is in hundredths
      unit_price_ore: 10000,
      vat_code_id: vatCode.id,
    },
  ]

  const draft = saveExpenseDraft(ctx.db, {
    fiscal_year_id: ctx.seed.fiscalYearId,
    counterparty_id: supplier.id,
    expense_date: expenseDate,
    due_date: dueDate,
    description: 'Testkostnad',
    lines: lines.map((l) => ({
      description: l.description,
      account_number: l.account_number,
      quantity: l.quantity,
      unit_price_ore: l.unit_price_ore,
      vat_code_id: l.vat_code_id,
    })),
  })
  if (!draft.success) throw new Error(`saveExpenseDraft failed: ${draft.error}`)

  const result = finalizeExpense(ctx.db, draft.data.id)
  if (!result.success)
    throw new Error(`finalizeExpense failed: ${result.error}`)

  return {
    expenseId: draft.data.id,
    verificationNumber: result.data.verification_number,
  }
}

/** Seed, finalize AND pay an expense fully */
export function seedAndPayExpense(
  ctx: SystemTestContext,
  overrides?: Partial<{
    counterpartyId: number
    expenseDate: string
    paymentDate: string
  }>,
): { expenseId: number; payment: ExpensePayment } {
  const paymentDate = overrides?.paymentDate ?? '2026-03-20'

  const { expenseId } = seedAndFinalizeExpense(ctx, {
    counterpartyId: overrides?.counterpartyId,
    expenseDate: overrides?.expenseDate,
  })

  const exp = ctx.db
    .prepare('SELECT total_amount_ore FROM expenses WHERE id = ?')
    .get(expenseId) as { total_amount_ore: number }

  const payResult = payExpense(ctx.db, {
    expense_id: expenseId,
    amount_ore: exp.total_amount_ore,
    payment_date: paymentDate,
    payment_method: 'bank',
    account_number: '1930',
  })
  if (!payResult.success)
    throw new Error(`payExpense failed: ${payResult.error}`)

  return { expenseId, payment: payResult.data.payment }
}

/** Seed a manual entry (C-series) and finalize it */
export function seedManualEntry(
  ctx: SystemTestContext,
  lines: Array<{
    account_number: string
    debit_ore: number
    credit_ore: number
    description?: string
  }>,
  overrides?: Partial<{ entryDate: string; description: string }>,
): {
  manualEntryId: number
  journalEntryId: number
  verificationNumber: number
} {
  const draft = saveManualEntryDraft(ctx.db, {
    fiscal_year_id: ctx.seed.fiscalYearId,
    entry_date: overrides?.entryDate ?? '2026-03-15',
    description: overrides?.description ?? 'Manuell verifikation',
    lines: lines.map((l, i) => ({
      line_number: i + 1,
      account_number: l.account_number,
      debit_ore: l.debit_ore,
      credit_ore: l.credit_ore,
      description: l.description ?? '',
    })),
  })
  if (!draft.success)
    throw new Error(`saveManualEntryDraft failed: ${draft.error}`)

  const result = finalizeManualEntry(
    ctx.db,
    draft.data.id,
    ctx.seed.fiscalYearId,
  )
  if (!result.success)
    throw new Error(`finalizeManualEntry failed: ${result.error}`)

  return {
    manualEntryId: draft.data.id,
    journalEntryId: result.data.journalEntryId,
    verificationNumber: result.data.verificationNumber,
  }
}

/** Close all 12 periods sequentially */
export function closeAllPeriods(ctx: SystemTestContext): void {
  for (const period of ctx.seed.periods) {
    const result = closePeriod(ctx.db, period.id)
    if (!result.success)
      throw new Error(`closePeriod(${period.id}) failed: ${result.error}`)
  }
}

/** Create a second fiscal year with opening balance transfer */
export function createSecondFiscalYear(ctx: SystemTestContext): {
  fiscalYear: FiscalYear
  openingBalance: JournalEntry
} {
  return createNewFiscalYear(
    ctx.db,
    ctx.seed.companyId,
    ctx.seed.fiscalYearId,
    {
      confirmBookResult: true,
      netResultOre: calculateNetResult(ctx.db, ctx.seed.fiscalYearId),
    },
  )
}
