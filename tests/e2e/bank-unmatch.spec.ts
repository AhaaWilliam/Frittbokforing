/**
 * S58 D2 — E2E unmatch happy + batch-blocked.
 *
 * 1. Happy: match invoice → unmatch via IPC → reconciliation borta,
 *    korrigeringsverifikat i C, invoice.paid_amount=0, TX=unmatched.
 * 2. Batch-blocked: länka payment till fake payment_batch_id → unmatch avvisas
 *    med BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED.
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
      <Id>STMT-UNMATCH</Id>
      <CreDtTm>2026-03-20T10:00:00</CreDtTm>
      <Acct><Id><IBAN>SE4550000000058398257466</IBAN></Id><Ccy>SEK</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">125.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-20</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="SEK">125.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-18</Dt></BookgDt>
        <ValDt><Dt>2026-03-18</Dt></ValDt>
        <AcctSvcrRef>REF-U-1</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

test('S58 D2 happy: unmatch invoice-match skapar C-serie-korrigering + återställer paid_amount', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { companyId, fiscalYearId } = await seedCompanyViaIPC(ctx.window)
    const custId = await seedCustomer(ctx.window)
    const { invoiceId } = await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: custId,
      fiscalYearId,
      invoiceDate: '2026-03-15',
      dueDate: '2026-04-14',
      unitPriceOre: 10000,
      quantity: 1,
    })

    // Import + match
    const imp = await ctx.window.evaluate(
      async (p) => (window as unknown as { api: { importBankStatement: (d: unknown) => Promise<{ success: boolean; data?: { statement_id: number } }> } }).api.importBankStatement(p),
      { company_id: companyId, fiscal_year_id: fiscalYearId, xml_content: CAMT053 },
    )
    const stmtId = imp.data!.statement_id
    const detail = await ctx.window.evaluate(
      async (id) => (window as unknown as { api: { getBankStatement: (d: { statement_id: number }) => Promise<{ data?: { transactions: Array<{ id: number }> } }> } }).api.getBankStatement({ statement_id: id }),
      stmtId,
    )
    const txId = detail.data!.transactions[0].id

    const match = await ctx.window.evaluate(
      async (p) => (window as unknown as { api: { matchBankTransaction: (d: unknown) => Promise<{ success: boolean; data?: { payment_id: number; journal_entry_id: number } }> } }).api.matchBankTransaction(p),
      { bank_transaction_id: txId, matched_entity_type: 'invoice', matched_entity_id: invoiceId, payment_account: '1930' },
    )
    expect(match.success).toBe(true)

    // Unmatch via IPC
    const unmatch = await ctx.window.evaluate(
      async (p) => (window as unknown as { api: { unmatchBankTransaction: (d: unknown) => Promise<{ success: boolean; data?: { correction_journal_entry_id: number } }> } }).api.unmatchBankTransaction(p),
      { bank_transaction_id: txId },
    )
    expect(unmatch.success).toBe(true)
    const corrId = unmatch.data!.correction_journal_entry_id

    // Reconciliation-rad borta
    const matches = await ctx.window.evaluate(
      async (id) => (window as unknown as { __testApi: { getReconciliationMatches: (i: number) => Promise<unknown[]> } }).__testApi.getReconciliationMatches(id),
      stmtId,
    )
    expect(matches).toHaveLength(0)

    // C-serie-verifikat finns
    const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
    const corr = entries.find((e) => e.id === corrId)
    expect(corr).toBeDefined()
    expect(corr!.verification_series).toBe('C')

    // Invoice paid_amount=0, status=unpaid
    const invoices = await ctx.window.evaluate(
      async (fy) => (window as unknown as { __testApi: { getInvoices: (f: number) => Promise<Array<{ id: number; paid_amount_ore: number; status: string }>> } }).__testApi.getInvoices(fy),
      fiscalYearId,
    )
    const inv = invoices.find((i) => i.id === invoiceId)
    expect(inv!.paid_amount_ore).toBe(0)
    expect(inv!.status).toBe('unpaid')
  } finally {
    await ctx.cleanup()
  }
})

test('S58 D2 batch-blocked: unmatch av batch-payment avvisas med BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { companyId, fiscalYearId } = await seedCompanyViaIPC(ctx.window)
    const custId = await seedCustomer(ctx.window)
    const { invoiceId } = await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: custId,
      fiscalYearId,
      invoiceDate: '2026-03-15',
      dueDate: '2026-04-14',
      unitPriceOre: 10000,
      quantity: 1,
    })

    // Bulk-pay (skapar payment_batch + payment)
    const bulk = await ctx.window.evaluate(
      async (p) => (window as unknown as { api: { payInvoicesBulk: (d: unknown) => Promise<{ success: boolean; data?: { succeeded: Array<{ payment_id: number }> } }> } }).api.payInvoicesBulk(p),
      {
        fiscal_year_id: fiscalYearId,
        payment_date: '2026-03-18',
        account_number: '1930',
        bank_fee_ore: null,
        items: [{ invoice_id: invoiceId, amount_ore: 12500 }],
      },
    )
    expect(bulk.success).toBe(true)
    const paymentId = bulk.data!.succeeded[0].payment_id

    // Importera TX + länka manuellt
    const imp = await ctx.window.evaluate(
      async (p) => (window as unknown as { api: { importBankStatement: (d: unknown) => Promise<{ success: boolean; data?: { statement_id: number } }> } }).api.importBankStatement(p),
      { company_id: companyId, fiscal_year_id: fiscalYearId, xml_content: CAMT053 },
    )
    const stmtId = imp.data!.statement_id
    const detail = await ctx.window.evaluate(
      async (id) => (window as unknown as { api: { getBankStatement: (d: { statement_id: number }) => Promise<{ data?: { transactions: Array<{ id: number }> } }> } }).api.getBankStatement({ statement_id: id }),
      stmtId,
    )
    const txId = detail.data!.transactions[0].id

    // Länka batch-payment till TX via __testApi
    await ctx.window.evaluate(
      async ({ pid, tid }) => (window as unknown as { __testApi: { linkPaymentToBankTx: (p: number, t: number, e: 'invoice' | 'expense') => Promise<unknown> } }).__testApi.linkPaymentToBankTx(pid, tid, 'invoice'),
      { pid: paymentId, tid: txId },
    )

    // Unmatch ska avvisas
    const unmatch = await ctx.window.evaluate(
      async (p) => (window as unknown as { api: { unmatchBankTransaction: (d: unknown) => Promise<{ success: boolean; code?: string; error?: string }> } }).api.unmatchBankTransaction(p),
      { bank_transaction_id: txId },
    )
    expect(unmatch.success).toBe(false)
    expect(unmatch.code).toBe('BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED')
  } finally {
    await ctx.cleanup()
  }
})
