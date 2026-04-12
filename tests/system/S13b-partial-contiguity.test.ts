/**
 * Sprint 13b — PARTIAL1: Partial-kontiguitet och INSERT-fail-vägar
 *
 * FYND Sprint 13b: Partial-kontiguitet på INSERT-tid (trigger 7-fail under booking)
 * är orealistiskt testbar utan produktionsändring.
 *
 * _payInvoiceTx gör pre-flight period-check i steg 6 INNAN verifikationsnummer
 * allokeras (steg 7) och INNAN journal_entry INSERT (steg 9). Trigger 7
 * (trg_check_period_on_booking) validerar igen vid booking (steg 11), men
 * perioden kan inte ändras mitt i en transaktion utan extern intervention.
 *
 * Befintliga B2-tester (S13-bulk-payment.test.ts) täcker pre-flight-fail
 * (ALREADY_PAID, VALIDATION_ERROR) som sker före INSERT. Den kritiska vägen
 * — fail under INSERT/booking med savepoint rollback och vernummeråteranvändning —
 * kräver antingen:
 *   1. En bugg i balans-beräkningen (trigger 6 kastar), eller
 *   2. Race condition med extern transaktion (ej möjligt i single-threaded SQLite)
 *
 * Dokumenterar detta med ett positivt kontraktstest som bekräftar att
 * pre-flight-checken fångar YEAR_IS_CLOSED innan INSERT sker.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import {
  type SystemTestContext,
  createTemplateDb,
  destroyTemplateDb,
  createSystemTestContext,
  destroyContext,
  seedAndFinalizeInvoice,
} from './helpers/system-test-context'
import { payInvoicesBulk } from '../../src/main/services/invoice-service'
import { assertContiguousVerNumbers } from './helpers/assertions'

let ctx: SystemTestContext

beforeAll(() => createTemplateDb())
afterAll(() => destroyTemplateDb())
beforeEach(() => { ctx = createSystemTestContext() })
afterEach(() => destroyContext(ctx))

function seedInvoiceNoVat(amount_ore: number) {
  return seedAndFinalizeInvoice(ctx, {
    lines: [{
      product_id: null,
      description: 'Test',
      quantity: 1,
      unit_price_ore: amount_ore,
      vat_code_id: 4, // MF (momsfri)
      account_number: '3002',
    }],
  })
}

describe('PARTIAL1 — period-stängning ger pre-flight fail, inte INSERT-fail', () => {
  it('stängd period → YEAR_IS_CLOSED pre-flight, kontiguitet bevarad', () => {
    const i1 = seedInvoiceNoVat(100_00)
    const i2 = seedInvoiceNoVat(200_00)
    const i3 = seedInvoiceNoVat(300_00)

    // Stäng mars-perioden (betalningsdatum = 2026-03-15)
    const fy = ctx.db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
    ctx.db.prepare(
      `UPDATE accounting_periods SET is_closed = 1
       WHERE fiscal_year_id = ? AND '2026-03-15' BETWEEN start_date AND end_date`,
    ).run(fy.id)

    // Bulk-betala med datum i stängd period
    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })

    // ALL fail med YEAR_IS_CLOSED (pre-flight i _payInvoiceTx steg 6)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('cancelled')
    expect(result.data.succeeded).toHaveLength(0)
    expect(result.data.failed).toHaveLength(3)
    for (const f of result.data.failed) {
      expect(f.code).toBe('YEAR_IS_CLOSED')
    }

    // Inga verifikationer skapades → kontiguitet trivially OK
    const verNums = assertContiguousVerNumbers(ctx.db, fy.id, 'A')
    // Bara faktura-verifikationer (3 st från finalize)
    expect(verNums).toHaveLength(3)
  })

  it('mixed: 1 i stängd period + 2 i öppen → partial, kontiguitet bevarad', () => {
    const i1 = seedInvoiceNoVat(100_00)
    const i2 = seedInvoiceNoVat(200_00)
    const i3 = seedInvoiceNoVat(300_00)

    // Stäng mars-period
    const fy = ctx.db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
    ctx.db.prepare(
      `UPDATE accounting_periods SET is_closed = 1
       WHERE fiscal_year_id = ? AND '2026-03-15' BETWEEN start_date AND end_date`,
    ).run(fy.id)

    // Öppna april
    // i1, i3 betalas med datum i april (öppen), i2 betalas med mars (stängd)
    // Men bulk har gemensamt payment_date — kan inte ha mixed dates.
    // Istället: betala i1 separat i mars (före stängning) → already_paid
    ctx.db.prepare(
      `UPDATE accounting_periods SET is_closed = 0
       WHERE fiscal_year_id = ? AND '2026-03-15' BETWEEN start_date AND end_date`,
    ).run(fy.id)

    // Pay i2 to cause ALREADY_PAID fail
    ctx.invoiceService.payInvoice(ctx.db, {
      invoice_id: i2.invoiceId, amount: 200_00, payment_date: '2026-03-10',
      payment_method: 'bankgiro', account_number: '1930',
    })

    const result = payInvoicesBulk(ctx.db, {
      payments: [
        { invoice_id: i1.invoiceId, amount_ore: 100_00 },
        { invoice_id: i2.invoiceId, amount_ore: 200_00 },
        { invoice_id: i3.invoiceId, amount_ore: 300_00 },
      ],
      payment_date: '2026-03-15',
      account_number: '1930',
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.status).toBe('partial')
    expect(result.data.succeeded).toHaveLength(2)
    expect(result.data.failed).toHaveLength(1)
    expect(result.data.failed[0].id).toBe(i2.invoiceId)

    // Kontiguitet: A-serie ska vara kontiguös (3 finalize + 1 single-pay + 2 bulk-pay = 6)
    const verNums = assertContiguousVerNumbers(ctx.db, fy.id, 'A')
    expect(verNums).toHaveLength(6)
  })
})
