/**
 * S55 A7c — full-stack bank match to verifikat.
 *
 * Seed company + invoice → importera camt.053 med matchande belopp →
 * matcha via IPC → verifiera A-serie-verifikat bokfört.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedCustomer, seedAndFinalizeInvoice } from './helpers/seed'
import { getJournalEntries } from './helpers/assertions'

// Specialfixtur: opening 0, en TX på exakt 12500, closing 12500 — matchar
// invoice från seedAndFinalizeInvoice (unit_price_ore 10000 × 1.25 moms = 12500).
const CAMT053 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>M</MsgId><CreDtTm>2026-03-20T10:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>STMT-MATCH</Id>
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
        <AcctSvcrRef>REF-MATCH-1</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

test('S55 A7c: full-stack match skapar A-serie-verifikat', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { companyId, fiscalYearId } = await seedCompanyViaIPC(ctx.window)
    const custId = await seedCustomer(ctx.window)
    const { invoiceId } = await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: custId,
      fiscalYearId,
      invoiceDate: '2026-03-15',
      dueDate: '2026-04-14',
      unitPriceOre: 10000, // 100.00 netto → 125.00 total med 25% moms
      quantity: 1,
    })

    // Importera bank-statement
    const importResult = await ctx.window.evaluate(
      async (p) => {
        return await (window as unknown as { api: { importBankStatement: (d: unknown) => Promise<{ success: boolean; data?: { statement_id: number; transaction_count: number }; error?: string }> } }).api.importBankStatement(p)
      },
      { company_id: companyId, fiscal_year_id: fiscalYearId, xml_content: CAMT053 },
    )
    expect(importResult.success).toBe(true)
    const stmtId = importResult.data!.statement_id

    // Läs ut bank_transaction_id
    const detail = await ctx.window.evaluate(
      async (id) => {
        return await (window as unknown as { api: { getBankStatement: (d: { statement_id: number }) => Promise<{ success: boolean; data?: { transactions: Array<{ id: number; amount_ore: number }> } }> } }).api.getBankStatement({ statement_id: id })
      },
      stmtId,
    )
    const txs = detail.data!.transactions
    expect(txs.length).toBe(1)
    expect(txs[0].amount_ore).toBe(12_500)
    const txId = txs[0].id

    // Matcha
    const matchResult = await ctx.window.evaluate(
      async (p) => {
        return await (window as unknown as { api: { matchBankTransaction: (d: unknown) => Promise<{ success: boolean; data?: { payment_id: number; journal_entry_id: number }; error?: string }> } }).api.matchBankTransaction(p)
      },
      {
        bank_transaction_id: txId,
        matched_entity_type: 'invoice' as const,
        matched_entity_id: invoiceId,
        payment_account: '1930',
      },
    )
    expect(matchResult.success).toBe(true)
    const journalEntryId = matchResult.data!.journal_entry_id

    // Verifiera A-serie-verifikat
    const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
    const matchEntry = entries.find((e) => e.id === journalEntryId)
    expect(matchEntry).toBeDefined()
    expect(matchEntry!.verification_series).toBe('A')
  } finally {
    await ctx.cleanup()
  }
})
