/**
 * Sprint 57 A5 negative — SuggestedMatchesPanel empty state.
 *
 * Importera bank-TX som inte kan matchas (inga fakturor eller fel belopp)
 * → expandera panel → assert "Inga förslag hittades".
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'

const CAMT053 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>M</MsgId><CreDtTm>2026-03-20T10:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>STMT-EMPTY</Id>
      <CreDtTm>2026-03-20T10:00:00</CreDtTm>
      <Acct><Id><IBAN>SE4550000000058398257466</IBAN></Id><Ccy>SEK</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">999.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-15</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="SEK">999.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <ValDt><Dt>2026-03-15</Dt></ValDt>
        <AcctSvcrRef>REF-ORPHAN</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

test('S57 A5 empty: inga förslag → "Inga förslag hittades"', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { companyId, fiscalYearId } = await seedCompanyViaIPC(ctx.window)

    const importResult = await ctx.window.evaluate(
      async (p) => {
        return await (
          window as unknown as {
            api: {
              importBankStatement: (d: unknown) => Promise<{
                success: boolean
                data?: { statement_id: number }
              }>
            }
          }
        ).api.importBankStatement(p)
      },
      {
        company_id: companyId,
        fiscal_year_id: fiscalYearId,
        xml_content: CAMT053,
      },
    )
    expect(importResult.success).toBe(true)
    const stmtId = importResult.data!.statement_id

    await ctx.window.evaluate((id) => {
      location.hash = `#/bank-statements/${id}`
    }, stmtId)

    await ctx.window.getByTestId('suggested-matches-panel').click()

    await expect(ctx.window.getByTestId('suggested-matches-empty')).toBeVisible(
      { timeout: 10_000 },
    )
  } finally {
    await ctx.cleanup()
  }
})
