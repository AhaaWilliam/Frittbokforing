/**
 * Sprint U1 — pain.008.001.02 (SEPA Direct Debit) export.
 *
 * Läser en payment_batch (batch_type='direct_debit') och tillhörande
 * sepa_dd_collections + sepa_dd_mandates, och genererar en ISO 20022
 * pain.008.001.02 XML-fil.
 *
 * Följer samma mönster som pain001-export-service (M146 polymorft).
 * Creditor = företaget, Debtor = kund (counterparty via mandat).
 */
import type Database from 'better-sqlite3'
import { randomUUID } from 'crypto'
import { create } from 'xmlbuilder2'
import type { IpcResult } from '../../../shared/types'
import { localTimestampFromNow } from '../../utils/now'

// ═══ Types ═══

interface BatchRow {
  id: number
  fiscal_year_id: number
  batch_type: string
  payment_date: string
  account_number: string
  status: string
  exported_at: string | null
}

interface CompanyRow {
  name: string
  org_number: string
  bankgiro: string | null
}

interface CollectionRow {
  collection_id: number
  amount_ore: number
  collection_date: string
  mandate_id: number
  mandate_reference: string
  signature_date: string
  sequence_type: 'OOFF' | 'FRST' | 'RCUR' | 'FNAL'
  iban: string
  bic: string | null
  mandate_status: 'active' | 'revoked'
  counterparty_id: number
  counterparty_name: string
  invoice_id: number | null
  invoice_number: string | null
}

// ═══ Helpers ═══

function oreToDecimal(ore: number): string {
  const kr = Math.floor(ore / 100)
  const oren = Math.abs(ore % 100)
  return `${kr}.${String(oren).padStart(2, '0')}`
}

function todayISO(): string {
  return localTimestampFromNow()
}

function getCollectionsForBatch(
  db: Database.Database,
  batchId: number,
): CollectionRow[] {
  return db
    .prepare(
      `SELECT
         c.id AS collection_id,
         c.amount_ore,
         c.collection_date,
         c.invoice_id,
         i.invoice_number AS invoice_number,
         m.id AS mandate_id,
         m.mandate_reference,
         m.signature_date,
         m.sequence_type,
         m.iban,
         m.bic,
         m.status AS mandate_status,
         cp.id AS counterparty_id,
         cp.name AS counterparty_name
       FROM sepa_dd_collections c
       JOIN sepa_dd_mandates m ON c.mandate_id = m.id
       JOIN counterparties cp ON m.counterparty_id = cp.id
       LEFT JOIN invoices i ON c.invoice_id = i.id
       WHERE c.payment_batch_id = ?
       ORDER BY m.sequence_type, c.id`,
    )
    .all(batchId) as CollectionRow[]
}

// ═══ Public API ═══

export function generatePain008(
  db: Database.Database,
  batchId: number,
): IpcResult<{ xml: string; filename: string }> {
  const batch = db
    .prepare('SELECT * FROM payment_batches WHERE id = ?')
    .get(batchId) as BatchRow | undefined

  if (!batch) {
    return { success: false, error: 'Batch hittades inte', code: 'NOT_FOUND' }
  }

  if (batch.batch_type !== 'direct_debit') {
    return {
      success: false,
      error: 'Batchen är inte av typen direct_debit',
      code: 'VALIDATION_ERROR',
    }
  }

  const company = db
    .prepare(
      `SELECT c.name, c.org_number, c.bankgiro
         FROM companies c
         JOIN fiscal_years fy ON fy.company_id = c.id
        WHERE fy.id = ?`,
    )
    .get(batch.fiscal_year_id) as CompanyRow | undefined

  if (!company) {
    return {
      success: false,
      error: 'Företag hittades inte för batchen',
      code: 'NOT_FOUND',
    }
  }

  const collections = getCollectionsForBatch(db, batchId)

  if (collections.length === 0) {
    return {
      success: false,
      error: 'Inga uppsamlingar i batchen',
      code: 'VALIDATION_ERROR',
    }
  }

  // Validate all mandates are active + have iban
  for (const c of collections) {
    if (c.mandate_status !== 'active') {
      return {
        success: false,
        error: `Mandat ${c.mandate_reference} är inte aktivt`,
        code: 'VALIDATION_ERROR',
      }
    }
    if (!c.iban) {
      return {
        success: false,
        error: `Mandat ${c.mandate_reference} saknar IBAN`,
        code: 'VALIDATION_ERROR',
      }
    }
  }

  const msgId = randomUUID()
  const totalOre = collections.reduce((s, c) => s + c.amount_ore, 0)

  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Document', {
      xmlns: 'urn:iso:std:iso:20022:tech:xsd:pain.008.001.02',
      'xmlns:xsi': 'http://www.w3.org/2001/XMLSchema-instance',
    })
    .ele('CstmrDrctDbtInitn')

  // Group Header
  const grpHdr = doc.ele('GrpHdr')
  grpHdr.ele('MsgId').txt(msgId)
  grpHdr.ele('CreDtTm').txt(todayISO())
  grpHdr.ele('NbOfTxs').txt(String(collections.length))
  grpHdr.ele('CtrlSum').txt(oreToDecimal(totalOre))
  const initgPty = grpHdr.ele('InitgPty')
  initgPty.ele('Nm').txt(company.name)
  initgPty.ele('Id').ele('OrgId').ele('Othr').ele('Id').txt(company.org_number)

  // Group collections by sequence_type — pain.008 kräver separata PmtInf per
  // sequence type (FRST, RCUR, OOFF, FNAL).
  const bySeq = new Map<string, CollectionRow[]>()
  for (const c of collections) {
    const arr = bySeq.get(c.sequence_type) ?? []
    arr.push(c)
    bySeq.set(c.sequence_type, arr)
  }

  let pmtInfCounter = 0
  for (const [seqType, rows] of bySeq.entries()) {
    pmtInfCounter += 1
    const pmtInf = doc.ele('PmtInf')
    const pmtSum = rows.reduce((s, r) => s + r.amount_ore, 0)

    pmtInf.ele('PmtInfId').txt(`BATCH-${batchId}-${seqType}`)
    pmtInf.ele('PmtMtd').txt('DD')
    pmtInf.ele('BtchBookg').txt('true')
    pmtInf.ele('NbOfTxs').txt(String(rows.length))
    pmtInf.ele('CtrlSum').txt(oreToDecimal(pmtSum))

    const pmtTpInf = pmtInf.ele('PmtTpInf')
    pmtTpInf.ele('SvcLvl').ele('Cd').txt('SEPA')
    pmtTpInf.ele('LclInstrm').ele('Cd').txt('CORE')
    pmtTpInf.ele('SeqTp').txt(seqType)

    pmtInf.ele('ReqdColltnDt').txt(batch.payment_date)

    // Creditor (the company)
    const cdtr = pmtInf.ele('Cdtr')
    cdtr.ele('Nm').txt(company.name)

    const cdtrAcct = pmtInf.ele('CdtrAcct')
    // Company IBAN placeholder — using bankgiro som Othr/Id (svenska
    // företag har ofta inte IBAN per se; fallback till bankgiro).
    cdtrAcct
      .ele('Id')
      .ele('Othr')
      .ele('Id')
      .txt(company.bankgiro ?? `SE-BG-UNKNOWN-${company.org_number}`)

    pmtInf
      .ele('CdtrAgt')
      .ele('FinInstnId')
      .ele('Othr')
      .ele('Id')
      .txt('NOTPROVIDED')

    // CreditorSchemeId — svenska företag saknar ofta officiellt SEPA CID.
    // Använd org_number som placeholder (SE + org_number).
    const cdtrSchmeId = pmtInf.ele('CdtrSchmeId')
    const schmeIdOthr = cdtrSchmeId.ele('Id').ele('PrvtId').ele('Othr')
    schmeIdOthr.ele('Id').txt(`SE${company.org_number.replace(/\D/g, '')}`)
    schmeIdOthr.ele('SchmeNm').ele('Prtry').txt('SEPA')

    // Direct Debit Transactions
    for (const r of rows) {
      const txInf = pmtInf.ele('DrctDbtTxInf')

      const pmtId = txInf.ele('PmtId')
      pmtId.ele('EndToEndId').txt(`COLL-${r.collection_id}`)

      txInf.ele('InstdAmt', { Ccy: 'SEK' }).txt(oreToDecimal(r.amount_ore))

      // Mandate-info
      const drctDbtTx = txInf.ele('DrctDbtTx')
      const mndtRltdInf = drctDbtTx.ele('MndtRltdInf')
      mndtRltdInf.ele('MndtId').txt(r.mandate_reference)
      mndtRltdInf.ele('DtOfSgntr').txt(r.signature_date)

      txInf
        .ele('DbtrAgt')
        .ele('FinInstnId')
        .ele('Othr')
        .ele('Id')
        .txt(r.bic ?? 'NOTPROVIDED')

      // Debtor (customer)
      const dbtr = txInf.ele('Dbtr')
      dbtr.ele('Nm').txt(r.counterparty_name)

      const dbtrAcct = txInf.ele('DbtrAcct')
      dbtrAcct.ele('Id').ele('IBAN').txt(r.iban)

      // Remittance — reference the invoice if linked
      if (r.invoice_number) {
        const rmtInf = txInf.ele('RmtInf')
        rmtInf.ele('Ustrd').txt(`Faktura ${r.invoice_number}`)
      } else {
        const rmtInf = txInf.ele('RmtInf')
        rmtInf.ele('Ustrd').txt(`Uppsamling ${r.collection_id}`)
      }
    }
  }

  // Silence unused counter warning (used for clarity above)
  void pmtInfCounter

  const xml = doc.end({ prettyPrint: true })
  const filename = `PAIN008_${batchId}_${batch.payment_date}.xml`

  return { success: true, data: { xml, filename } }
}
