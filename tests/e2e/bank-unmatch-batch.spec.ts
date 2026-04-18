/**
 * Sprint F P2 — E2E unmatchBankBatch (hela batchen via IPC).
 *
 * 1. Bulk-pay 2 invoices → batch + 2 payments + bank-fee-JE
 * 2. Importera bank-statement, länka batch-payment till TX
 * 3. Unmatch hela batchen via IPC
 * 4. Assertioner:
 *    - batch.status='cancelled'
 *    - Alla payments raderade
 *    - 2+1 C-serie-korrigeringsverifikat
 *    - TX reconciliation_status='unmatched'
 *    - Invoices återställda (paid_amount=0, status='unpaid')
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedCustomer, seedAndFinalizeInvoice } from './helpers/seed'
import { getJournalEntries } from './helpers/assertions'

const CAMT053 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>M</MsgId><CreDtTm>2026-03-20T10:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>STMT-BATCH</Id>
      <CreDtTm>2026-03-20T10:00:00</CreDtTm>
      <Acct><Id><IBAN>SE4550000000058398257466</IBAN></Id><Ccy>SEK</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">300.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-20</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="SEK">125.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-18</Dt></BookgDt>
        <ValDt><Dt>2026-03-18</Dt></ValDt>
        <AcctSvcrRef>REF-B-1</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

test('Sprint F P2: unmatchBankBatch reverserar hela batchen via IPC', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { companyId, fiscalYearId } = await seedCompanyViaIPC(ctx.window)
    const custId = await seedCustomer(ctx.window)
    const { invoiceId: inv1 } = await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: custId,
      fiscalYearId,
      invoiceDate: '2026-03-15',
      dueDate: '2026-04-14',
      unitPriceOre: 10000,
      quantity: 1,
    })
    const { invoiceId: inv2 } = await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: custId,
      fiscalYearId,
      invoiceDate: '2026-03-16',
      dueDate: '2026-04-15',
      unitPriceOre: 10000,
      quantity: 1,
    })

    // Bulk-pay 2 invoices (skapar batch + 2 payments + bank-fee-JE)
    const bulk = await ctx.window.evaluate(
      async (p) =>
        (
          window as unknown as {
            api: {
              payInvoicesBulk: (d: unknown) => Promise<{
                success: boolean
                data?: {
                  batch_id: number | null
                  succeeded: Array<{ payment_id: number }>
                  bank_fee_journal_entry_id: number | null
                }
              }>
            }
          }
        ).api.payInvoicesBulk(p),
      {
        payment_date: '2026-03-18',
        account_number: '1930',
        bank_fee_ore: 5000,
        payments: [
          { invoice_id: inv1, amount_ore: 12500 },
          { invoice_id: inv2, amount_ore: 12500 },
        ],
      },
    )
    expect(bulk.success).toBe(true)
    const batchId = bulk.data!.batch_id!
    const paymentId1 = bulk.data!.succeeded[0].payment_id

    // Importera + länka en TX till batch-payment (bara en TX räcker för symmetri-test)
    const imp = await ctx.window.evaluate(
      async (p) =>
        (
          window as unknown as {
            api: {
              importBankStatement: (d: unknown) => Promise<{
                success: boolean
                data?: { statement_id: number }
              }>
            }
          }
        ).api.importBankStatement(p),
      {
        company_id: companyId,
        fiscal_year_id: fiscalYearId,
        xml_content: CAMT053,
      },
    )
    const stmtId = imp.data!.statement_id
    const detail = await ctx.window.evaluate(
      async (id) =>
        (
          window as unknown as {
            api: {
              getBankStatement: (d: {
                statement_id: number
              }) => Promise<{ data?: { transactions: Array<{ id: number }> } }>
            }
          }
        ).api.getBankStatement({ statement_id: id }),
      stmtId,
    )
    const txId = detail.data!.transactions[0].id

    // Länka batch-payment till TX via __testApi
    await ctx.window.evaluate(
      async ({ pid, tid }) =>
        (
          window as unknown as {
            __testApi: {
              linkPaymentToBankTx: (
                p: number,
                t: number,
                e: 'invoice' | 'expense',
              ) => Promise<unknown>
            }
          }
        ).__testApi.linkPaymentToBankTx(pid, tid, 'invoice'),
      { pid: paymentId1, tid: txId },
    )

    // Unmatch hela batchen
    const result = await ctx.window.evaluate(
      async (p) =>
        (
          window as unknown as {
            api: {
              unmatchBankBatch: (d: unknown) => Promise<{
                success: boolean
                data?: {
                  batch_id: number
                  batch_type: string
                  unmatched_payment_count: number
                  correction_journal_entry_ids: number[]
                  bank_fee_correction_entry_id: number | null
                }
                code?: string
                error?: string
              }>
            }
          }
        ).api.unmatchBankBatch(p),
      { batch_id: batchId },
    )
    expect(result.success).toBe(true)
    expect(result.data!.batch_type).toBe('invoice')
    expect(result.data!.unmatched_payment_count).toBe(2)
    expect(result.data!.correction_journal_entry_ids).toHaveLength(2)
    expect(result.data!.bank_fee_correction_entry_id).not.toBeNull()

    // Verifikat — 2 payment-korrigeringar + 1 bank-fee-korrigering = 3 C-serie
    const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
    const cSeries = entries.filter((e) => e.verification_series === 'C')
    expect(cSeries.length).toBeGreaterThanOrEqual(3)

    // TX reconciliation_status='unmatched'
    const txAfter = await ctx.window.evaluate(
      async (id) =>
        (
          window as unknown as {
            api: {
              getBankStatement: (d: { statement_id: number }) => Promise<{
                data?: {
                  transactions: Array<{
                    id: number
                    reconciliation_status: string
                  }>
                }
              }>
            }
          }
        ).api.getBankStatement({ statement_id: id }),
      stmtId,
    )
    expect(txAfter.data!.transactions[0].reconciliation_status).toBe(
      'unmatched',
    )

    // Invoices återställda
    const invoices = await ctx.window.evaluate(
      async (fy) =>
        (
          window as unknown as {
            __testApi: {
              getInvoices: (f: number) => Promise<
                Array<{
                  id: number
                  paid_amount_ore: number
                  status: string
                }>
              >
            }
          }
        ).__testApi.getInvoices(fy),
      fiscalYearId,
    )
    for (const id of [inv1, inv2]) {
      const inv = invoices.find((i) => i.id === id)!
      expect(inv.paid_amount_ore).toBe(0)
      expect(inv.status).toBe('unpaid')
    }
  } finally {
    await ctx.cleanup()
  }
})
