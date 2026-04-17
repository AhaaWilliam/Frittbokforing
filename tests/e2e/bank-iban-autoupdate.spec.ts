/**
 * Sprint 57 D2 — F66-c counterparty.bank_account auto-update E2E.
 *
 * Seed customer utan IBAN + finalize:ad invoice → importera camt.053 med
 * counterparty_iban → manuell match via UI → assert counterparty.bank_account
 * är satt via __test:getCounterpartyById.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedCustomer, seedAndFinalizeInvoice } from './helpers/seed'

const TX_IBAN = 'SE45 5000 0000 0583 9825 7466'
const NORMALIZED_IBAN = 'SE4550000000058398257466'

const CAMT053 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>M</MsgId><CreDtTm>2026-03-20T10:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>STMT-IBAN</Id>
      <CreDtTm>2026-03-20T10:00:00</CreDtTm>
      <Acct><Id><IBAN>${NORMALIZED_IBAN}</IBAN></Id><Ccy>SEK</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">125.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-15</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="SEK">125.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <ValDt><Dt>2026-03-15</Dt></ValDt>
        <AcctSvcrRef>REF-IBAN-1</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <RltdPties>
            <Dbtr><Nm>Kund</Nm></Dbtr>
            <DbtrAcct><Id><IBAN>${TX_IBAN.replace(/\s/g, '')}</IBAN></Id></DbtrAcct>
          </RltdPties>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

test('S57 D2: manuell match → counterparty.bank_account uppdateras från TX-IBAN', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { companyId, fiscalYearId } = await seedCompanyViaIPC(ctx.window)
    const custId = await seedCustomer(ctx.window)
    await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: custId,
      fiscalYearId,
      invoiceDate: '2026-03-15',
      dueDate: '2026-04-14',
      unitPriceOre: 10000,
      quantity: 1,
    })

    // Verifiera att counterparty saknar IBAN initialt
    const before = await ctx.window.evaluate(
      async (id) => {
        return await (
          window as unknown as { __testApi: { getCounterpartyById: (i: number) => Promise<{ bank_account: string | null }> } }
        ).__testApi.getCounterpartyById(id)
      },
      custId,
    )
    expect(before?.bank_account).toBeNull()

    // Importera camt.053
    const importResult = await ctx.window.evaluate(
      async (p) => {
        return await (
          window as unknown as {
            api: { importBankStatement: (d: unknown) => Promise<{ success: boolean; data?: { statement_id: number } }> }
          }
        ).api.importBankStatement(p)
      },
      { company_id: companyId, fiscal_year_id: fiscalYearId, xml_content: CAMT053 },
    )
    expect(importResult.success).toBe(true)
    const stmtId = importResult.data!.statement_id

    // Hämta tx_id
    const detail = await ctx.window.evaluate(
      async (id) => {
        return await (
          window as unknown as {
            api: { getBankStatement: (d: { statement_id: number }) => Promise<{ success: boolean; data?: { transactions: Array<{ id: number }> } }> }
          }
        ).api.getBankStatement({ statement_id: id })
      },
      stmtId,
    )
    const txId = detail.data!.transactions[0].id

    // Match via IPC (snabbare och stabilare än UI för D2)
    const matchResult = await ctx.window.evaluate(
      async (p) => {
        return await (
          window as unknown as {
            api: { matchBankTransaction: (d: unknown) => Promise<{ success: boolean }> }
          }
        ).api.matchBankTransaction(p)
      },
      {
        bank_transaction_id: txId,
        matched_entity_type: 'invoice' as const,
        matched_entity_id: (await ctx.window.evaluate(
          async (fyId) => {
            const r = await (
              window as unknown as {
                __testApi: { getInvoices: (id?: number) => Promise<Array<{ id: number }>> }
              }
            ).__testApi.getInvoices(fyId)
            return r[0].id
          },
          fiscalYearId,
        )),
        payment_account: '1930',
      },
    )
    expect(matchResult.success).toBe(true)

    // Assert counterparty.bank_account är satt till normaliserad IBAN
    const after = await ctx.window.evaluate(
      async (id) => {
        return await (
          window as unknown as { __testApi: { getCounterpartyById: (i: number) => Promise<{ bank_account: string | null }> } }
        ).__testApi.getCounterpartyById(id)
      },
      custId,
    )
    expect(after?.bank_account).toBe(NORMALIZED_IBAN)
  } finally {
    await ctx.cleanup()
  }
})
