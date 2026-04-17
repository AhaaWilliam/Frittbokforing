/**
 * Sprint 57 A5 happy — SuggestedMatchesPanel bulk-accept.
 *
 * Seed customer + finalize:ad invoice → importera camt.053 med matchande
 * belopp + remittance-info → expandera panel → klick "Acceptera alla HIGH"
 * → assert att TX är matchad och A-serie-verifikat skapat.
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
      <Id>STMT-AUTO-1</Id>
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
        <Dt><Dt>2026-03-15</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="SEK">125.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <ValDt><Dt>2026-03-15</Dt></ValDt>
        <AcctSvcrRef>REF-1</AcctSvcrRef>
        <NtryDtls><TxDtls>
          <RmtInf><Ustrd>Betalning faktura 1</Ustrd></RmtInf>
        </TxDtls></NtryDtls>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

test('S57 A5 happy: bulk-accept HIGH skapar A-serie-verifikat', async () => {
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

    // Importera bank-statement
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

    // Navigera till bank-statement-detail
    await ctx.window.evaluate((id) => {
      location.hash = `#/bank-statements/${id}`
    }, stmtId)

    // Expandera SuggestedMatchesPanel
    await ctx.window.getByTestId('suggested-matches-panel').click()

    // Klicka bulk-accept
    const bulkBtn = ctx.window.getByTestId('suggested-matches-accept-all-high')
    await expect(bulkBtn).toBeVisible({ timeout: 10_000 })
    await bulkBtn.click()

    // Verifiera A-serie-verifikat
    await expect.poll(async () => {
      const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
      return entries.filter((e) => e.verification_series === 'A').length
    }, { timeout: 10_000 }).toBeGreaterThanOrEqual(2) // 1 finalize + 1 match
  } finally {
    await ctx.cleanup()
  }
})
