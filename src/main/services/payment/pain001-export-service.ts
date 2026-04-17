import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { create } from 'xmlbuilder2'
import type { IpcResult, PaymentExportValidation } from '../../../shared/types'
import { normalizeBankgiro } from '../../../shared/bankgiro-validation'
import { getNow } from '../../utils/now'

// ═══ Types ═══

interface BatchRow {
  id: number
  batch_type: string
  payment_date: string
  account_number: string
  status: string
  exported_at: string | null
}

interface PaymentRow {
  id: number
  source_id: number
  amount_ore: number
  counterparty_id: number
  counterparty_name: string
  bankgiro: string | null
  plusgiro: string | null
  bank_account: string | null
  bank_clearing: string | null
  remittance_ref: string | null
}

interface CompanyRow {
  name: string
  org_number: string
  bankgiro: string | null
}

// ═══ Helpers ═══

function oreToDecimal(ore: number): string {
  const kr = Math.floor(ore / 100)
  const oren = Math.abs(ore % 100)
  return `${kr}.${String(oren).padStart(2, '0')}`
}

function todayISO(): string {
  return getNow().toISOString().slice(0, 19)
}

// ═══ Public API ═══

export function validateBatchForExport(
  db: Database.Database,
  batchId: number,
): IpcResult<PaymentExportValidation> {
  const batch = db
    .prepare('SELECT * FROM payment_batches WHERE id = ?')
    .get(batchId) as BatchRow | undefined

  if (!batch) {
    return { success: false, error: 'Batch hittades inte', code: 'NOT_FOUND' }
  }

  const result: PaymentExportValidation = { valid: true, issues: [] }

  if (batch.status === 'cancelled') {
    result.valid = false
    result.batchIssue = 'cancelled'
    return { success: true, data: result }
  }

  if (batch.exported_at) {
    result.valid = false
    result.batchIssue = 'already_exported'
    return { success: true, data: result }
  }

  const company = db
    .prepare('SELECT name, org_number, bankgiro FROM companies LIMIT 1')
    .get() as CompanyRow | undefined

  if (!company?.bankgiro) {
    result.valid = false
    result.batchIssue = 'company_missing_bankgiro'
    return { success: true, data: result }
  }

  // Check all counterparties in this batch
  const payments = getPaymentsForBatch(db, batchId, batch.batch_type)

  for (const p of payments) {
    if (!p.bankgiro && !p.plusgiro && !p.bank_account) {
      result.valid = false
      result.issues.push({
        counterpartyId: p.counterparty_id,
        counterpartyName: p.counterparty_name,
        issue: 'missing_all_payment_info',
      })
    }
  }

  return { success: true, data: result }
}

export function generatePain001(
  db: Database.Database,
  batchId: number,
): IpcResult<{ xml: string; filename: string }> {
  const batch = db
    .prepare('SELECT * FROM payment_batches WHERE id = ?')
    .get(batchId) as BatchRow | undefined

  if (!batch) {
    return { success: false, error: 'Batch hittades inte', code: 'NOT_FOUND' }
  }

  const company = db
    .prepare('SELECT name, org_number, bankgiro FROM companies LIMIT 1')
    .get() as CompanyRow

  if (!company?.bankgiro) {
    return {
      success: false,
      error: 'Företaget saknar bankgiro — krävs för betalfil',
      code: 'VALIDATION_ERROR',
    }
  }

  const payments = getPaymentsForBatch(db, batchId, batch.batch_type)

  if (payments.length === 0) {
    return {
      success: false,
      error: 'Inga betalningar i batchen',
      code: 'VALIDATION_ERROR',
    }
  }

  const msgId = randomUUID()
  const totalOre = payments.reduce((s, p) => s + p.amount_ore, 0)

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Document', {
      xmlns: 'urn:iso:std:iso:20022:tech:xsd:pain.001.001.03',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    })
    .ele('CstmrCdtTrfInitn')

  // Group Header
  const grpHdr = doc.ele('GrpHdr')
  grpHdr.ele('MsgId').txt(msgId)
  grpHdr.ele('CreDtTm').txt(todayISO())
  grpHdr.ele('NbOfTxs').txt(String(payments.length))
  grpHdr.ele('CtrlSum').txt(oreToDecimal(totalOre))
  const initgPty = grpHdr.ele('InitgPty')
  initgPty.ele('Nm').txt(company.name)
  initgPty.ele('Id').ele('OrgId').ele('Othr').ele('Id').txt(company.org_number)

  // Payment Information
  const pmtInf = doc.ele('PmtInf')
  pmtInf.ele('PmtInfId').txt(`BATCH-${batchId}`)
  pmtInf.ele('PmtMtd').txt('TRF')
  pmtInf.ele('BtchBookg').txt('true')
  pmtInf.ele('NbOfTxs').txt(String(payments.length))
  pmtInf.ele('CtrlSum').txt(oreToDecimal(totalOre))
  pmtInf.ele('ReqdExctnDt').txt(batch.payment_date)

  // Debtor (company)
  const dbtr = pmtInf.ele('Dbtr')
  dbtr.ele('Nm').txt(company.name)

  const dbtrAcct = pmtInf.ele('DbtrAcct')
  dbtrAcct
    .ele('Id')
    .ele('Othr')
    .ele('Id')
    .txt(normalizeBankgiro(company.bankgiro))

  // Credit Transfer Transactions
  for (const p of payments) {
    const txInf = pmtInf.ele('CdtTrfTxInf')

    const pmtId = txInf.ele('PmtId')
    pmtId.ele('EndToEndId').txt(`PAY-${p.id}`)

    const amt = txInf.ele('Amt')
    amt.ele('InstdAmt', { Ccy: 'SEK' }).txt(oreToDecimal(p.amount_ore))

    // Creditor (supplier)
    const cdtr = txInf.ele('Cdtr')
    cdtr.ele('Nm').txt(p.counterparty_name)

    // Creditor Account
    const cdtrAcct = txInf.ele('CdtrAcct')
    if (p.bankgiro) {
      cdtrAcct
        .ele('Id')
        .ele('Othr')
        .ele('Id')
        .txt(normalizeBankgiro(p.bankgiro))
    } else if (p.plusgiro) {
      cdtrAcct.ele('Id').ele('Othr').ele('Id').txt(p.plusgiro)
    } else if (p.bank_account && p.bank_clearing) {
      cdtrAcct
        .ele('Id')
        .ele('Othr')
        .ele('Id')
        .txt(p.bank_clearing + p.bank_account)
    }

    // Remittance Information
    if (p.remittance_ref) {
      const rmtInf = txInf.ele('RmtInf')
      rmtInf.ele('Ustrd').txt(p.remittance_ref)
    }
  }

  const xml = doc.end({ prettyPrint: true })
  const filename = `PAIN001_${batchId}_${batch.payment_date}.xml`

  return { success: true, data: { xml, filename } }
}

export function markBatchExported(
  db: Database.Database,
  batchId: number,
  format: string,
  filename: string,
): void {
  db.prepare(
    `UPDATE payment_batches SET exported_at = datetime('now'), export_format = ?, export_filename = ? WHERE id = ?`,
  ).run(format, filename, batchId)
}

// ═══ Internal ═══

function getPaymentsForBatch(
  db: Database.Database,
  batchId: number,
  batchType: string,
): PaymentRow[] {
  if (batchType === 'expense') {
    return db
      .prepare(
        `SELECT ep.id, ep.expense_id AS source_id, ep.amount_ore,
                e.counterparty_id, c.name AS counterparty_name,
                c.bankgiro, c.plusgiro, c.bank_account, c.bank_clearing,
                e.supplier_invoice_number AS remittance_ref
         FROM expense_payments ep
         JOIN expenses e ON ep.expense_id = e.id
         JOIN counterparties c ON e.counterparty_id = c.id
         WHERE ep.payment_batch_id = ?`,
      )
      .all(batchId) as PaymentRow[]
  }
  // Invoice batch — invoice_number as remittance ref
  return db
    .prepare(
      `SELECT ip.id, ip.invoice_id AS source_id, ip.amount_ore,
              i.counterparty_id, c.name AS counterparty_name,
              c.bankgiro, c.plusgiro, c.bank_account, c.bank_clearing,
              i.invoice_number AS remittance_ref
       FROM invoice_payments ip
       JOIN invoices i ON ip.invoice_id = i.id
       JOIN counterparties c ON i.counterparty_id = c.id
       WHERE ip.payment_batch_id = ?`,
    )
    .all(batchId) as PaymentRow[]
}
