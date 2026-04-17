/**
 * S49 — Pain.001-export E2E (F4 vakt).
 *
 * Flow: seed company + supplier + expense + batch via IPC →
 * export pain.001 via IPC (dialog-bypass skriver till E2E_DOWNLOAD_DIR) →
 * verify filen är valid XML med rätt belopp.
 *
 * Varför IPC istället för UI-klick: pain.001-exportknappen ligger i
 * BulkPaymentResultDialog (transient). Full UI-flöde kräver seeding
 * av bankgiro-berättigad leverantör + expense + bulk-pay via knappar,
 * vilket duplicerar bulk-payment.spec.ts. Här vaktar vi själva
 * pain.001-contractet + dialog-bypass.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { launchAppWithFreshDb } from './helpers/launch-app'

test('Pain.001 export: batch → XML fil på disk', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    // Seed company (CreateCompanyInputSchema doesn't accept bankgiro — set via update)
    const companyResult = (await ctx.window.evaluate(async () => {
      return await (
        window as unknown as {
          api: { createCompany: (d: unknown) => Promise<unknown> }
        }
      ).api.createCompany({
        name: 'Pain001 Test AB',
        org_number: '556036-0793',
        fiscal_rule: 'K2',
        share_capital: 2500000,
        registration_date: '2020-01-15',
        fiscal_year_start: '2026-01-01',
        fiscal_year_end: '2026-12-31',
      })
    })) as { success: boolean; data: { id: number } }
    expect(companyResult.success).toBe(true)

    // Set bankgiro via update (required by pain.001)
    const updateResult = (await ctx.window.evaluate(async () => {
      return await (
        window as unknown as {
          api: { updateCompany: (d: unknown) => Promise<unknown> }
        }
      ).api.updateCompany({ bankgiro: '5050-1055' })
    })) as { success: boolean; error?: string }
    if (!updateResult.success)
      throw new Error(`updateCompany: ${updateResult.error}`)

    const fyResult = (await ctx.window.evaluate(async () => {
      return await (
        window as unknown as {
          api: { listFiscalYears: () => Promise<unknown> }
        }
      ).api.listFiscalYears()
    })) as { success: boolean; data: Array<{ id: number }> }
    const fyId = fyResult.data[0].id

    // Seed supplier with bankgiro
    const supplierResult = (await ctx.window.evaluate(async () => {
      return await (
        window as unknown as {
          api: { createCounterparty: (d: unknown) => Promise<unknown> }
        }
      ).api.createCounterparty({
        name: 'Pain Supplier AB',
        type: 'supplier',
        org_number: '559999-0001',
        default_payment_terms: 30,
        bankgiro: '1234-5678',
      })
    })) as { success: boolean; data: { id: number } }
    expect(supplierResult.success).toBe(true)
    const supplierId = supplierResult.data.id

    // Get incoming 25% VAT code
    const vatCodeId = await ctx.window.evaluate(async () => {
      const result = await (
        window as unknown as {
          api: { listVatCodes: (d: { direction: string }) => Promise<unknown> }
        }
      ).api.listVatCodes({ direction: 'incoming' })
      const r = result as {
        success: boolean
        data: Array<{ id: number; code: string }>
      }
      return r.data[0].id
    })

    // Seed + finalize expense via IPC
    const expenseDraft = (await ctx.window.evaluate(
      async (input) => {
        return await (
          window as unknown as {
            api: { saveExpenseDraft: (d: unknown) => Promise<unknown> }
          }
        ).api.saveExpenseDraft(input)
      },
      {
        counterparty_id: supplierId,
        fiscal_year_id: fyId,
        expense_date: '2026-03-15',
        due_date: '2026-04-14',
        description: 'E2E pain fakturanr 1',
        lines: [
          {
            description: 'E2E pain test',
            quantity: 1,
            unit_price_ore: 50000,
            vat_code_id: vatCodeId,
            account_number: '6110',
            sort_order: 0,
          },
        ],
      },
    )) as { success: boolean; data: { id: number }; error?: string }
    if (!expenseDraft.success)
      throw new Error(`saveExpenseDraft: ${expenseDraft.error}`)

    const finalRes = (await ctx.window.evaluate(async (id) => {
      return await (
        window as unknown as {
          api: { finalizeExpense: (d: { id: number }) => Promise<unknown> }
        }
      ).api.finalizeExpense({ id })
    }, expenseDraft.data.id)) as { success: boolean; error?: string }
    expect(finalRes.success).toBe(true)

    // Bulk-pay expense to create batch
    const bulkRes = (await ctx.window.evaluate(
      async (input) => {
        return await (
          window as unknown as {
            api: { payExpensesBulk: (d: unknown) => Promise<unknown> }
          }
        ).api.payExpensesBulk(input)
      },
      {
        payments: [
          {
            expense_id: expenseDraft.data.id,
            amount_ore: 62500, // 500 kr + 25% moms
          },
        ],
        payment_date: '2026-03-20',
        account_number: '1930',
        bank_fee_ore: 0,
      },
    )) as {
      success: boolean
      data: { batch_id: number | null; status: string }
      error?: string
    }
    if (!bulkRes.success) throw new Error(`payExpensesBulk: ${bulkRes.error}`)
    expect(bulkRes.data.batch_id).not.toBeNull()

    // Export pain.001 — dialog bypass writes to E2E_DOWNLOAD_DIR
    const exportRes = (await ctx.window.evaluate(async (batchId) => {
      return await (
        window as unknown as {
          api: {
            exportPain001: (d: { batch_id: number }) => Promise<unknown>
          }
        }
      ).api.exportPain001({ batch_id: batchId })
    }, bulkRes.data.batch_id!)) as {
      success: boolean
      data: { saved: boolean; filePath?: string }
      error?: string
    }
    expect(exportRes.success).toBe(true)
    expect(exportRes.data.saved).toBe(true)
    expect(exportRes.data.filePath).toBeTruthy()

    // Verify file on disk in downloadDir
    expect(exportRes.data.filePath!.startsWith(ctx.downloadDir)).toBe(true)
    expect(fs.existsSync(exportRes.data.filePath!)).toBe(true)

    const xml = fs.readFileSync(exportRes.data.filePath!, 'utf8')
    expect(xml).toContain('<PmtInf>')
    expect(xml).toContain('Pain Supplier AB')
    // Amount: 625 kr (500 + 25% moms) = 625.00 in ISO 20022
    expect(xml).toMatch(/625\.00/)
  } finally {
    await ctx.cleanup()
  }
})
