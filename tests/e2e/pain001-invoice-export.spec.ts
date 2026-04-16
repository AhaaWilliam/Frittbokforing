/**
 * S50 — Pain.001 export för invoice-batch E2E (F6 vakt).
 *
 * Speglar pain001-export.spec.ts (expense-sidan) men för invoice-batch.
 * Symmetri M112–M114: invoice_payments.payment_batch_id finns redan,
 * backend polymorft via batch.batch_type. UI:n låste ut export för
 * invoice-batchar — denna test vaktar att låset är släppt.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import { launchAppWithFreshDb } from './helpers/launch-app'
import { seedCustomer } from './helpers/seed'

test('Pain.001 invoice-batch: bulk-pay kreditfaktura → XML fil på disk', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    // Seed company (CreateCompanyInputSchema accepterar inte bankgiro)
    const companyResult = (await ctx.window.evaluate(async () => {
      return await (
        window as unknown as {
          api: { createCompany: (d: unknown) => Promise<unknown> }
        }
      ).api.createCompany({
        name: 'Invoice Pain Test AB',
        org_number: '556036-0793',
        fiscal_rule: 'K2',
        share_capital: 2500000,
        registration_date: '2020-01-15',
        fiscal_year_start: '2026-01-01',
        fiscal_year_end: '2026-12-31',
      })
    })) as { success: boolean; data: { id: number } }
    expect(companyResult.success).toBe(true)

    // Set company bankgiro
    const updateResult = (await ctx.window.evaluate(async () => {
      return await (
        window as unknown as {
          api: { updateCompany: (d: unknown) => Promise<unknown> }
        }
      ).api.updateCompany({ bankgiro: '5050-1055' })
    })) as { success: boolean; error?: string }
    if (!updateResult.success) throw new Error(`updateCompany: ${updateResult.error}`)

    const fyResult = (await ctx.window.evaluate(async () => {
      return await (
        window as unknown as {
          api: { listFiscalYears: () => Promise<unknown> }
        }
      ).api.listFiscalYears()
    })) as { success: boolean; data: Array<{ id: number }> }
    const fyId = fyResult.data[0].id

    // Customer with bankgiro (nödvändigt för att pain.001 ska validera)
    const customerId = await seedCustomer(ctx.window, 'Pain Kund AB')
    const updateCpResult = (await ctx.window.evaluate(async (id) => {
      return await (
        window as unknown as {
          api: { updateCounterparty: (d: unknown) => Promise<unknown> }
        }
      ).api.updateCounterparty({ id, bankgiro: '1234-5678' })
    }, customerId)) as { success: boolean; error?: string }
    if (!updateCpResult.success) throw new Error(`updateCounterparty: ${updateCpResult.error}`)

    // Seed + finalize invoice (kreditfaktura/refund-scenario)
    const vatCodeId = await ctx.window.evaluate(async () => {
      const result = await (
        window as unknown as {
          api: { listVatCodes: (d: { direction: string }) => Promise<unknown> }
        }
      ).api.listVatCodes({ direction: 'outgoing' })
      const r = result as { success: boolean; data: Array<{ id: number; code: string }> }
      return r.data.find((c) => c.code === 'MP1')!.id
    })

    const draftResult = (await ctx.window.evaluate(async (input) => {
      return await (
        window as unknown as {
          api: { saveDraft: (d: unknown) => Promise<unknown> }
        }
      ).api.saveDraft(input)
    }, {
      counterparty_id: customerId,
      fiscal_year_id: fyId,
      invoice_date: '2026-03-15',
      due_date: '2026-04-14',
      lines: [
        {
          product_id: null,
          description: 'Pain E2E test',
          quantity: 1,
          unit_price_ore: 10000,
          vat_code_id: vatCodeId,
          sort_order: 0,
          account_number: '3002',
        },
      ],
    })) as { success: boolean; data: { id: number }; error?: string }
    if (!draftResult.success) throw new Error(`saveDraft: ${draftResult.error}`)

    const finalRes = (await ctx.window.evaluate(async (id) => {
      return await (
        window as unknown as {
          api: { finalizeInvoice: (d: { id: number }) => Promise<unknown> }
        }
      ).api.finalizeInvoice({ id })
    }, draftResult.data.id)) as { success: boolean; error?: string }
    if (!finalRes.success) throw new Error(`finalizeInvoice: ${finalRes.error}`)

    // Bulk-pay invoice → creates invoice-batch
    const bulkRes = (await ctx.window.evaluate(async (input) => {
      return await (
        window as unknown as {
          api: { payInvoicesBulk: (d: unknown) => Promise<unknown> }
        }
      ).api.payInvoicesBulk(input)
    }, {
      payments: [
        {
          invoice_id: draftResult.data.id,
          amount_ore: 12500, // 100 + 25% moms
        },
      ],
      payment_date: '2026-03-20',
      account_number: '1930',
      bank_fee_ore: 0,
    })) as {
      success: boolean
      data: { batch_id: number | null; status: string }
      error?: string
    }
    if (!bulkRes.success) throw new Error(`payInvoicesBulk: ${bulkRes.error}`)
    expect(bulkRes.data.batch_id).not.toBeNull()

    // Export pain.001 — dialog bypass skriver till E2E_DOWNLOAD_DIR
    const exportRes = (await ctx.window.evaluate(async (batchId) => {
      return await (
        window as unknown as {
          api: { exportPain001: (d: { batch_id: number }) => Promise<unknown> }
        }
      ).api.exportPain001({ batch_id: batchId })
    }, bulkRes.data.batch_id!)) as {
      success: boolean
      data: { saved: boolean; filePath?: string }
      error?: string
    }
    if (!exportRes.success) throw new Error(`exportPain001: ${exportRes.error}`)
    expect(exportRes.data.saved).toBe(true)
    expect(exportRes.data.filePath).toBeTruthy()
    expect(exportRes.data.filePath!.startsWith(ctx.downloadDir)).toBe(true)

    const xml = fs.readFileSync(exportRes.data.filePath!, 'utf8')
    expect(xml).toContain('<PmtInf>')
    expect(xml).toContain('Pain Kund AB') // customer som creditor
    expect(xml).toMatch(/125\.00/) // 12500 öre
    // Remittance ref ska innehålla fakturanummer (format: "1")
    expect(xml).toMatch(/<Ustrd>\s*1\s*<\/Ustrd>/)
  } finally {
    await ctx.cleanup()
  }
})
