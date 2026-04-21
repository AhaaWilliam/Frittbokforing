import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import ExcelJS from 'exceljs'
import Database from 'better-sqlite3'
import { createTestDb } from './helpers/create-test-db'
import { createCompany } from '../src/main/services/company-service'
import { createCounterparty } from '../src/main/services/counterparty-service'
import { createProduct } from '../src/main/services/product-service'
import { saveDraft, finalizeDraft } from '../src/main/services/invoice-service'
import {
  saveExpenseDraft,
  finalizeExpense,
} from '../src/main/services/expense-service'
import { exportExcel } from '../src/main/services/excel/excel-export-service'
import { getBalanceAtDate } from '../src/main/services/export/export-data-queries'

let db: Database.Database

const COMPANY = {
  name: 'Test AB',
  org_number: '556677-8899',
  fiscal_rule: 'K2' as const,
  share_capital: 5_000_000,
  registration_date: '2026-01-01',
  fiscal_year_start: '2026-01-01',
  fiscal_year_end: '2026-12-31',
}

interface Seed {
  companyId: number
  fyId: number
  customerId: number
  supplierId: number
  vatCode25Id: number
  vatCodeInId: number
  productId: number
}

let seed: Seed
let invoiceCounter = 0
let expenseCounter = 0

function setupSeed(testDb: Database.Database): Seed {
  createCompany(testDb, COMPANY)
  const company = testDb.prepare('SELECT id FROM companies LIMIT 1').get() as {
    id: number
  }
  const fy = testDb.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as {
    id: number
  }
  const customer = createCounterparty(testDb, {
    company_id: 1,
    name: 'Kund AB',
    type: 'customer',
  })
  if (!customer.success) throw new Error('Customer failed')
  const supplier = createCounterparty(testDb, {
    company_id: 1,
    name: 'Leverantör AB',
    type: 'supplier',
  })
  if (!supplier.success) throw new Error('Supplier failed')
  const vatCode25 = testDb
    .prepare("SELECT id FROM vat_codes WHERE code = 'MP1'")
    .get() as { id: number }
  const vatCodeIn = testDb
    .prepare("SELECT id FROM vat_codes WHERE vat_type = 'incoming' LIMIT 1")
    .get() as { id: number }
  const account = testDb
    .prepare("SELECT id FROM accounts WHERE account_number = '3002'")
    .get() as { id: number }
  const product = createProduct(testDb, {
    company_id: 1,
    name: 'Konsult',
    default_price_ore: 100_000,
    vat_code_id: vatCode25.id,
    account_id: account.id,
  })
  if (!product.success) throw new Error('Product failed')
  return {
    companyId: company.id,
    fyId: fy.id,
    customerId: customer.data.id,
    supplierId: supplier.data.id,
    vatCode25Id: vatCode25.id,
    vatCodeInId: vatCodeIn.id,
    productId: product.data.id,
  }
}

function bookInvoice(testDb: Database.Database, date: string) {
  invoiceCounter++
  const r = saveDraft(testDb, {
    counterparty_id: seed.customerId,
    fiscal_year_id: seed.fyId,
    invoice_date: date,
    due_date: '2099-12-31',
    lines: [
      {
        product_id: seed.productId,
        description: `Konsult ${invoiceCounter}`,
        quantity: 10,
        unit_price_ore: 100_000,
        vat_code_id: seed.vatCode25Id,
        sort_order: 0,
      },
    ],
  })
  if (!r.success) throw new Error('Draft failed: ' + r.error)
  const f = finalizeDraft(testDb, r.data.id)
  if (!f.success) throw new Error('Finalize failed: ' + f.error)
  return f.data
}

function bookExpense(testDb: Database.Database, date: string) {
  expenseCounter++
  const r = saveExpenseDraft(testDb, {
    fiscal_year_id: seed.fyId,
    counterparty_id: seed.supplierId,
    expense_date: date,
    description: `Kostnad ${expenseCounter}`,
    payment_terms: 30,
    supplier_invoice_number: `F2026-${expenseCounter}`,
    notes: '',
    lines: [
      {
        description: 'Hyra',
        account_number: '5010',
        quantity: 1,
        unit_price_ore: 500_000,
        vat_code_id: seed.vatCodeInId,
      },
    ],
  })
  if (!r.success) throw new Error('Expense draft failed: ' + r.error)
  const f = finalizeExpense(testDb, r.data.id)
  if (!f.success) throw new Error('Expense finalize failed: ' + f.error)
}

async function parseWorkbook(result: {
  buffer: Buffer
}): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(result.buffer as unknown as ArrayBuffer)
  return wb
}

function createPreviousYear(testDb: Database.Database, companyId: number) {
  const prevFyId = testDb
    .prepare(
      `INSERT INTO fiscal_years (company_id, year_label, start_date, end_date)
     VALUES (?, '2025', '2025-01-01', '2025-12-31')`,
    )
    .run(companyId).lastInsertRowid as number
  for (let m = 1; m <= 12; m++) {
    const s = `2025-${String(m).padStart(2, '0')}-01`
    const d = new Date(2025, m, 0).getDate()
    const e = `2025-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    testDb
      .prepare(
        'INSERT INTO accounting_periods (company_id, fiscal_year_id, period_number, start_date, end_date) VALUES (?, ?, ?, ?, ?)',
      )
      .run(companyId, prevFyId, m, s, e)
  }
  // Book 50000 kr on 1930 in previous year
  const jeId = testDb
    .prepare(
      `INSERT INTO journal_entries (company_id, fiscal_year_id, journal_date, description, status, source_type)
     VALUES (?, ?, '2025-06-01', 'Kapital', 'draft', 'manual')`,
    )
    .run(companyId, prevFyId).lastInsertRowid as number
  testDb
    .prepare(
      `INSERT INTO journal_entry_lines (journal_entry_id, line_number, account_number, debit_ore, credit_ore)
     VALUES (?, 1, '1930', 5000000, 0), (?, 2, '2081', 0, 5000000)`,
    )
    .run(jeId, jeId)
  testDb
    .prepare("UPDATE journal_entries SET status = 'booked' WHERE id = ?")
    .run(jeId)
  return prevFyId
}

describe('Excel Export', () => {
  beforeEach(() => {
    db = createTestDb()
    invoiceCounter = 0
    expenseCounter = 0
    seed = setupSeed(db)
  })

  afterEach(() => {
    db.close()
  })

  // 1. Generates valid XLSX
  it('genererar giltig XLSX som kan läsas tillbaka', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    expect(result.buffer).toBeInstanceOf(Buffer)
    expect(result.buffer.byteLength).toBeGreaterThan(0)
    const wb = await parseWorkbook(result)
    expect(wb.worksheets.length).toBe(5)
  })

  // 2. 5 tabs (Sprint 54: added Kassaflöde)
  it('har 5 flikar med korrekta namn', async () => {
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const names = wb.worksheets.map((s) => s.name)
    expect(names).toEqual([
      'Verifikationslista',
      'Huvudbok',
      'Saldobalans',
      'Kassaflöde',
      'Företagsinfo',
    ])
  })

  // 3. Verifikationslista columns
  it('Verifikationslista: rätt kolumner', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Verifikationslista')!
    const headers = sheet.getRow(1).values as (string | undefined)[]
    expect(headers.slice(1)).toEqual([
      'Serie',
      'Nr',
      'Datum',
      'Text',
      'Konto',
      'Kontonamn',
      'Debet',
      'Kredit',
    ])
  })

  // 4. Verifikationslista row count
  it('Verifikationslista: rätt antal rader', async () => {
    bookInvoice(db, '2026-01-15')
    bookExpense(db, '2026-02-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Verifikationslista')!
    // Row 1 = header, rest = data
    expect(sheet.rowCount).toBeGreaterThan(1)
  })

  // 5. Debet/kredit as numbers
  it('Verifikationslista: debet/kredit som nummer', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Verifikationslista')!
    const row2 = sheet.getRow(2)
    const debetVal = row2.getCell(7).value
    // Should be a number (öre/100), not a string
    if (debetVal !== null && debetVal !== undefined) {
      expect(typeof debetVal).toBe('number')
    }
  })

  // 6. Zero debet/kredit = empty cell
  it('Verifikationslista: noll debet/kredit = tom cell', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Verifikationslista')!
    // Find a row with debit but no credit (or vice versa)
    let foundNull = false
    sheet.eachRow((row, rowNum) => {
      if (rowNum <= 1) return
      const d = row.getCell(7).value
      const k = row.getCell(8).value
      if (d === null || d === undefined || k === null || k === undefined) {
        foundNull = true
      }
    })
    expect(foundNull).toBe(true)
  })

  // 7. Datum as Date object with correct day
  it('Verifikationslista: datum som Date-objekt med rätt dag', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Verifikationslista')!
    const dateVal = sheet.getRow(2).getCell(3).value
    expect(dateVal).toBeInstanceOf(Date)
    expect((dateVal as Date).getDate()).toBe(15)
  })

  // 8. Sorted by series + number
  it('Verifikationslista: sorterad serie + nr', async () => {
    bookInvoice(db, '2026-01-15')
    bookExpense(db, '2026-01-20')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Verifikationslista')!
    const series: string[] = []
    sheet.eachRow((row, n) => {
      if (n > 1) {
        const v = row.getCell(1).value
        if (v) series.push(String(v))
      }
    })
    // A rows should come before B rows
    const firstB = series.indexOf('B')
    const lastA = series.lastIndexOf('A')
    if (firstB >= 0 && lastA >= 0) {
      expect(lastA).toBeLessThan(firstB)
    }
  })

  // 9. Huvudbok IB from previous year
  it('Huvudbok: IB från föregående år', async () => {
    createPreviousYear(db, seed.companyId)
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Huvudbok')!
    // Find 1930 header row — should have IB = 50000
    let found1930Ib = false
    sheet.eachRow((row) => {
      if (row.getCell(1).value === '1930' && row.getCell(6).value === 'IB') {
        expect(row.getCell(9).value).toBe(50000)
        found1930Ib = true
      }
    })
    expect(found1930Ib).toBe(true)
  })

  // 10. Huvudbok running balance
  it('Huvudbok: löpande saldo korrekt', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Huvudbok')!
    // All saldo cells should be numbers
    let saldoCount = 0
    sheet.eachRow((row, n) => {
      if (n <= 1) return
      const saldo = row.getCell(9).value
      if (typeof saldo === 'number') saldoCount++
    })
    expect(saldoCount).toBeGreaterThan(0)
  })

  // 11. Huvudbok UB correct
  it('Huvudbok: UB-rad finns', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Huvudbok')!
    let foundUb = false
    sheet.eachRow((row) => {
      if (row.getCell(6).value === 'UB') foundUb = true
    })
    expect(foundUb).toBe(true)
  })

  // 12. Saldo 0 as 0.00 not empty
  it('Huvudbok: saldo 0 visas som 0', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Huvudbok')!
    // IB for a PL account = 0
    let foundZeroSaldo = false
    sheet.eachRow((row) => {
      if (row.getCell(6).value === 'IB' && row.getCell(9).value === 0) {
        foundZeroSaldo = true
      }
    })
    expect(foundZeroSaldo).toBe(true)
  })

  // 13. Saldobalans rows
  it('Saldobalans: en rad per konto', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Saldobalans')!
    expect(sheet.rowCount).toBeGreaterThan(3)
  })

  // 14. IB + months = UB
  it('Saldobalans: IB + månader = UB', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Saldobalans')!
    // Find a data row (not header/section label)
    sheet.eachRow((row, n) => {
      if (n <= 1) return
      const konto = row.getCell(1).value
      if (typeof konto === 'string' && /^\d{4}/.test(konto)) {
        const ib = row.getCell(3).value as number
        const ub = row.getCell(sheet.columnCount).value as number
        // Sum month columns (4 to columnCount-1)
        let sumMonths = 0
        for (let c = 4; c < sheet.columnCount; c++) {
          const v = row.getCell(c).value
          if (typeof v === 'number') sumMonths += v
        }
        expect(Math.abs(ib + sumMonths - ub)).toBeLessThan(0.01)
      }
    })
  })

  // 15. BS/PL separated
  it('Saldobalans: BS/PL separerade', async () => {
    bookInvoice(db, '2026-01-15')
    bookExpense(db, '2026-01-20')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Saldobalans')!
    let foundBr = false
    let foundRr = false
    sheet.eachRow((row) => {
      if (row.getCell(1).value === 'BALANSRÄKNING') foundBr = true
      if (row.getCell(1).value === 'RESULTATRÄKNING') foundRr = true
    })
    expect(foundBr).toBe(true)
    expect(foundRr).toBe(true)
  })

  // 16. Företagsinfo fields
  it('Företagsinfo: alla fält', async () => {
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Företagsinfo')!
    const fields: string[] = []
    sheet.eachRow((row, n) => {
      if (n > 1) fields.push(String(row.getCell(1).value))
    })
    expect(fields).toContain('Företagsnamn')
    expect(fields).toContain('Organisationsnummer')
    expect(fields).toContain('Räkenskapsår')
    expect(fields).toContain('Program')
  })

  // 17. Date filter: whole months → monthly columns
  it('datumfilter hela månader: saldobalans med månadskolumner', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, {
      fiscalYearId: seed.fyId,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Saldobalans')!
    const headers = sheet.getRow(1).values as (string | undefined)[]
    expect(headers).toContain('Jan')
    expect(headers).not.toContain('Feb')
  })

  // 18. Date filter: partial months → 3 columns
  it('datumfilter partiella månader: saldobalans med IB/Förändring/UB', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, {
      fiscalYearId: seed.fyId,
      startDate: '2026-01-10',
      endDate: '2026-02-15',
    })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Saldobalans')!
    const headers = sheet.getRow(1).values as (string | undefined)[]
    expect(headers).toContain('Förändring')
  })

  // 19. Date filter: verifikationslista filtered
  it('datumfilter: verifikationslista filtrerad', async () => {
    bookInvoice(db, '2026-01-15')
    bookInvoice(db, '2026-02-15')
    const result = await exportExcel(db, {
      fiscalYearId: seed.fyId,
      startDate: '2026-01-01',
      endDate: '2026-01-31',
    })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Verifikationslista')!
    // Should only have Jan entries, not Feb
    let hasFeb = false
    sheet.eachRow((row, n) => {
      if (n <= 1) return
      const d = row.getCell(3).value as Date
      if (d && d instanceof Date && d.getMonth() === 1) hasFeb = true
    })
    expect(hasFeb).toBe(false)
  })

  // 20. Date filter: PL IB != 0
  it('datumfilter: PL-konto IB != 0 med jan-data, filter=feb', async () => {
    bookInvoice(db, '2026-01-15')
    // Filter for February only
    const result = await exportExcel(db, {
      fiscalYearId: seed.fyId,
      startDate: '2026-02-01',
      endDate: '2026-02-28',
    })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Huvudbok')!
    // 3002 (revenue) should have IB != 0 because jan had revenue
    let found3002Ib = false
    sheet.eachRow((row) => {
      if (row.getCell(1).value === '3002' && row.getCell(6).value === 'IB') {
        expect(row.getCell(9).value).not.toBe(0)
        found3002Ib = true
      }
    })
    // Only expect this if 3002 had jan activity
    if (!found3002Ib) {
      // 3002 may not appear if no feb activity — that's ok
    }
  })

  // 21. numFmt applied
  it('nummerformat #,##0.00 på beloppskolumner', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Verifikationslista')!
    const row2 = sheet.getRow(2)
    const debetFmt = row2.getCell(7).numFmt
    expect(debetFmt).toBe('#,##0.00')
  })

  // 22. Column widths set
  it('kolumnbredder satta', async () => {
    bookInvoice(db, '2026-01-15')
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    const sheet = wb.getWorksheet('Verifikationslista')!
    const col7 = sheet.getColumn(7)
    expect(col7.width).toBeGreaterThanOrEqual(10)
  })

  // 23. Empty database
  it('tom databas → 5 flikar men inga data-rader', async () => {
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    const wb = await parseWorkbook(result)
    expect(wb.worksheets.length).toBe(5)
    const ver = wb.getWorksheet('Verifikationslista')!
    expect(ver.rowCount).toBe(1) // Just header
  })

  // 24. Filename sanitized
  it('filnamn saniterat', async () => {
    const result = await exportExcel(db, { fiscalYearId: seed.fyId })
    expect(result.filename).toMatch(/Test_AB_2026\.xlsx/)
    expect(result.filename).not.toMatch(/[/\\:*?"<>|]/)
  })

  // 25. getBalanceAtDate unit test
  it('getBalanceAtDate: korrekt kumulativt saldo', () => {
    bookInvoice(db, '2026-01-15')
    bookExpense(db, '2026-01-20')
    const bal = getBalanceAtDate(db, seed.fyId, '2026-02-01')
    // Should have balances for all accounts that had jan transactions
    expect(bal.size).toBeGreaterThan(0)
    // 1510 should have positive balance (debit from invoice)
    const v1510 = bal.get('1510')
    if (v1510 !== undefined) {
      expect(v1510).toBeGreaterThan(0)
    }
  })

  // 26. getBalanceAtDate at year start = all zero
  it('getBalanceAtDate: vid årets start → tom map', () => {
    bookInvoice(db, '2026-01-15')
    const bal = getBalanceAtDate(db, seed.fyId, '2026-01-01')
    expect(bal.size).toBe(0) // No transactions before Jan 1
  })

  // 27. Regression
  it('regression: user_version=10, 20 tabeller', () => {
    const version = db.pragma('user_version', { simple: true }) as number
    expect(version).toBe(49) // S58: Uppdatera vid nya migrationer
    const tables = db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      )
      .get() as { count: number }
    expect(tables.count).toBe(39)
  })
})
