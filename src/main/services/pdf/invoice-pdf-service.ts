import PDFDocument from 'pdfkit'
import type Database from 'better-sqlite3'
import { calculateOCR } from './ocr'
import { getCompany } from '../company-service'
import { getFinalized } from '../invoice-service'
import type {
  Company,
  FinalizedInvoice,
  FinalizedInvoiceLine,
} from '../../../shared/types'

// Konstanter
const PAGE_WIDTH = 595.28
const PAGE_HEIGHT = 841.89
const MARGIN = 50
const CONTENT_WIDTH = PAGE_WIDTH - 2 * MARGIN
const FONT_NORMAL = 'Helvetica'
const FONT_BOLD = 'Helvetica-Bold'
const FONT_SIZE_NORMAL = 9
const FONT_SIZE_SMALL = 8
const FONT_SIZE_HEADER = 18
const FONT_SIZE_LABEL = 7
const FOOTER_Y = PAGE_HEIGHT - 60

// Kolumnbredd för fakturarader
const COL = {
  description: { x: MARGIN, width: 220 },
  quantity: { x: MARGIN + 225, width: 55 },
  unitPrice: { x: MARGIN + 285, width: 80 },
  vatRate: { x: MARGIN + 370, width: 50 },
  amount: { x: MARGIN + 425, width: CONTENT_WIDTH - 425 + MARGIN },
}
const ROW_HEIGHT = 16

export async function generateInvoicePdf(
  db: Database.Database,
  invoiceId: number,
): Promise<Buffer> {
  const company = getCompany(db)
  if (!company) throw new Error('Company not configured — cannot generate PDF')

  const invoice = getFinalized(db, invoiceId)

  const vatSummary = calculateVatSummary(invoice.lines)
  const totalAmount = vatSummary.reduce(
    (sum, v) => sum + v.netAmount + v.vatAmount,
    0,
  )

  const ocr = calculateOCR(`${invoice.invoice_number}`)

  return renderPdf({ company, invoice, vatSummary, totalAmount, ocr })
}

// --- Formatering ---
function formatKronor(ore: number): string {
  const kr = ore / 100
  return kr
    .toLocaleString('sv-SE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
    .replace(/\s/g, '\u00A0') // Non-breaking space som tusentalsavskiljare
}

// --- VAT-summering ---
interface VatGroup {
  vatRate: number // procent (25, 12, 6, 0)
  netAmount: number // öre
  vatAmount: number // öre
}

function calculateVatSummary(lines: FinalizedInvoiceLine[]): VatGroup[] {
  const groups = new Map<number, VatGroup>()
  for (const line of lines) {
    const rate = line.vat_rate
    const existing = groups.get(rate) || {
      vatRate: rate,
      netAmount: 0,
      vatAmount: 0,
    }
    existing.netAmount += line.line_total
    existing.vatAmount += line.vat_amount
    groups.set(rate, existing)
  }
  return Array.from(groups.values()).sort((a, b) => b.vatRate - a.vatRate)
}

// --- PDF-rendering ---
interface RenderData {
  company: Company
  invoice: FinalizedInvoice
  vatSummary: VatGroup[]
  totalAmount: number
  ocr: string
}

function renderPdf(data: RenderData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN })
    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    let y = MARGIN
    y = renderHeader(doc, data.company, y)
    y = renderCustomerAddress(doc, data.invoice, y)
    y = renderInvoiceMeta(doc, data.invoice, y)
    y = renderLineItemsHeader(doc, y)
    y = renderLineItems(doc, data.invoice.lines, y)
    y = renderSummary(doc, data.vatSummary, data.totalAmount, y)
    renderPaymentInfo(doc, data.company, data.ocr, data.totalAmount, y)
    renderFooter(doc, data.company)

    doc.end()
  })
}

// --- Sektionsritare ---

function renderHeader(
  doc: PDFKit.PDFDocument,
  company: Company,
  startY: number,
): number {
  // "FAKTURA" vänster
  doc.font(FONT_BOLD).fontSize(FONT_SIZE_HEADER)
  doc.text('FAKTURA', MARGIN, startY)

  // Företagsnamn top-right
  doc.font(FONT_BOLD).fontSize(11)
  doc.text(company.name, MARGIN, startY, {
    width: CONTENT_WIDTH,
    align: 'right',
  })

  // Under företagsnamnet (höger): orgnr, VAT-nummer, adress
  let infoY = startY + 16
  doc.font(FONT_NORMAL).fontSize(FONT_SIZE_SMALL)

  const infoLines: string[] = []
  infoLines.push(`Org.nr: ${company.org_number}`)
  if (company.vat_number) infoLines.push(`VAT: ${company.vat_number}`)
  if (company.address_line1) infoLines.push(company.address_line1)
  if (company.postal_code || company.city) {
    infoLines.push(
      [company.postal_code, company.city].filter(Boolean).join(' '),
    )
  }

  for (const line of infoLines) {
    doc.text(line, MARGIN, infoY, { width: CONTENT_WIDTH, align: 'right' })
    infoY += 11
  }

  return Math.max(startY + 30, infoY + 10)
}

function renderCustomerAddress(
  doc: PDFKit.PDFDocument,
  invoice: FinalizedInvoice,
  startY: number,
): number {
  // Fönsterkuvert-position ~130pt från topp
  let y = Math.max(startY, 130)
  doc.font(FONT_NORMAL).fontSize(FONT_SIZE_NORMAL)

  doc.text(invoice.customer_name, MARGIN, y)
  y += 14
  if (invoice.customer_address) {
    doc.text(invoice.customer_address, MARGIN, y)
    y += 14
  }
  if (invoice.customer_postal_code || invoice.customer_city) {
    doc.text(
      [invoice.customer_postal_code, invoice.customer_city]
        .filter(Boolean)
        .join(' '),
      MARGIN,
      y,
    )
    y += 14
  }
  if (invoice.customer_org_number) {
    doc.text(`Org.nr: ${invoice.customer_org_number}`, MARGIN, y)
    y += 14
  }

  return y + 10
}

function renderInvoiceMeta(
  doc: PDFKit.PDFDocument,
  invoice: FinalizedInvoice,
  startY: number,
): number {
  const metaX = MARGIN + CONTENT_WIDTH - 180
  let y = startY

  doc.font(FONT_NORMAL).fontSize(FONT_SIZE_LABEL)
  const meta: [string, string][] = [
    ['Fakturanummer', invoice.invoice_number],
    ['Fakturadatum', invoice.invoice_date],
    ['Förfallodatum', invoice.due_date],
    ['Betalningsvillkor', `${invoice.payment_terms} dagar`],
  ]

  for (const [label, value] of meta) {
    doc.font(FONT_NORMAL).fontSize(FONT_SIZE_LABEL)
    doc.text(label, metaX, y)
    doc.font(FONT_BOLD).fontSize(FONT_SIZE_NORMAL)
    doc.text(value, metaX + 90, y)
    y += 16
  }

  return y + 15
}

function renderLineItemsHeader(
  doc: PDFKit.PDFDocument,
  startY: number,
): number {
  doc.font(FONT_BOLD).fontSize(FONT_SIZE_SMALL)
  doc.text('Beskrivning', COL.description.x, startY)
  doc.text('Antal', COL.quantity.x, startY, {
    width: COL.quantity.width,
    align: 'right',
  })
  doc.text('À-pris', COL.unitPrice.x, startY, {
    width: COL.unitPrice.width,
    align: 'right',
  })
  doc.text('Moms', COL.vatRate.x, startY, {
    width: COL.vatRate.width,
    align: 'center',
  })
  doc.text('Belopp', COL.amount.x, startY, {
    width: COL.amount.width,
    align: 'right',
  })

  const lineY = startY + 12
  doc
    .moveTo(MARGIN, lineY)
    .lineTo(MARGIN + CONTENT_WIDTH, lineY)
    .lineWidth(0.5)
    .stroke()

  return lineY + 4
}

function renderLineItems(
  doc: PDFKit.PDFDocument,
  lines: FinalizedInvoiceLine[],
  startY: number,
): number {
  let y = startY
  doc.font(FONT_NORMAL).fontSize(FONT_SIZE_NORMAL)

  for (const line of lines) {
    // Sidbrytningscheck
    if (y + ROW_HEIGHT > FOOTER_Y - 100) {
      renderFooter(
        doc,
        null as unknown as Company,
      ) /* footer on current page rendered by main flow */
      doc.addPage()
      y = MARGIN
      y = renderLineItemsHeader(doc, y)
      doc.font(FONT_NORMAL).fontSize(FONT_SIZE_NORMAL)
    }

    doc.text(line.description, COL.description.x, y, {
      width: COL.description.width,
    })
    doc.text(String(line.quantity), COL.quantity.x, y, {
      width: COL.quantity.width,
      align: 'right',
    })
    doc.text(formatKronor(line.unit_price_ore), COL.unitPrice.x, y, {
      width: COL.unitPrice.width,
      align: 'right',
    })
    doc.text(`${line.vat_rate}%`, COL.vatRate.x, y, {
      width: COL.vatRate.width,
      align: 'center',
    })
    doc.text(formatKronor(line.line_total), COL.amount.x, y, {
      width: COL.amount.width,
      align: 'right',
    })

    y += ROW_HEIGHT
  }

  return y
}

function renderSummary(
  doc: PDFKit.PDFDocument,
  vatSummary: VatGroup[],
  totalAmount: number,
  startY: number,
): number {
  let y = startY + 8

  // Horisontell linje ovanför
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(0.5)
    .stroke()
  y += 10

  const rightX = MARGIN + CONTENT_WIDTH - 200

  doc.font(FONT_NORMAL).fontSize(FONT_SIZE_NORMAL)
  for (const group of vatSummary) {
    doc.text(`Netto ${group.vatRate}%:`, rightX, y)
    doc.text(formatKronor(group.netAmount), rightX + 100, y, {
      width: 100,
      align: 'right',
    })
    y += 14
    doc.text(`Moms ${group.vatRate}%:`, rightX, y)
    doc.text(formatKronor(group.vatAmount), rightX + 100, y, {
      width: 100,
      align: 'right',
    })
    y += 14
  }

  // Tjock linje
  y += 4
  doc
    .moveTo(rightX, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(1.5)
    .stroke()
  y += 8

  doc.font(FONT_BOLD).fontSize(FONT_SIZE_NORMAL + 1)
  doc.text('Att betala:', rightX, y)
  doc.text(formatKronor(totalAmount), rightX + 100, y, {
    width: 100,
    align: 'right',
  })
  y += 20

  return y
}

function renderPaymentInfo(
  doc: PDFKit.PDFDocument,
  company: Company,
  ocr: string,
  totalAmount: number,
  startY: number,
): void {
  let y = startY + 10

  doc.font(FONT_BOLD).fontSize(FONT_SIZE_NORMAL)
  doc.text('Betalningsuppgifter', MARGIN, y)
  y += 16

  doc.font(FONT_NORMAL).fontSize(FONT_SIZE_NORMAL)

  const hasPaymentInfo = company.bankgiro || company.plusgiro

  if (!hasPaymentInfo) {
    doc.text('Betalningsuppgifter saknas \u2014 kontakta oss.', MARGIN, y)
    y += 14
  } else {
    if (company.bankgiro) {
      doc.text(`Bankgiro: ${company.bankgiro}`, MARGIN, y)
      y += 14
    }
    if (company.plusgiro) {
      doc.text(`Plusgiro: ${company.plusgiro}`, MARGIN, y)
      y += 14
    }
  }

  doc.text(`OCR: ${ocr}`, MARGIN, y)
  y += 14
  doc.font(FONT_BOLD)
  doc.text(`Belopp att betala: ${formatKronor(totalAmount)}`, MARGIN, y)
}

function renderFooter(doc: PDFKit.PDFDocument, company: Company | null): void {
  if (!company) return

  const y = FOOTER_Y

  // Tunn horisontell linje
  doc
    .moveTo(MARGIN, y)
    .lineTo(MARGIN + CONTENT_WIDTH, y)
    .lineWidth(0.3)
    .stroke()

  doc.font(FONT_NORMAL).fontSize(FONT_SIZE_LABEL)

  // Godkänd för F-skatt
  // TODO: Gör konfigurerbart om systemet utökas till enskilda firmor
  let footerText = `${company.name} | Org.nr: ${company.org_number} | Godkänd för F-skatt`
  if (company.vat_number) {
    footerText += ` | VAT: ${company.vat_number}`
  }

  doc.text(footerText, MARGIN, y + 6, {
    width: CONTENT_WIDTH,
    align: 'center',
  })
}
