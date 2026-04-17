/**
 * S58 B3 — E2E fee-auto-classify.
 *
 * Importera camt.053 med en TX som har BkTxCd SubFmlyCd=CHRG → suggester
 * returnerar fee-candidate → accept via createBankFeeEntry → B-serie-
 * verifikat (D 6570 / K 1930) + reconciliation med bank_fee.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { getJournalEntries } from './helpers/assertions'

const CAMT053_FEE = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>M</MsgId><CreDtTm>2026-03-20T10:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>STMT-FEE</Id>
      <CreDtTm>2026-03-20T10:00:00</CreDtTm>
      <Acct><Id><IBAN>SE4550000000058398257466</IBAN></Id><Ccy>SEK</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">50.00</Amt><CdtDbtInd>DBIT</CdtDbtInd>
        <Dt><Dt>2026-03-20</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="SEK">50.00</Amt>
        <CdtDbtInd>DBIT</CdtDbtInd>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <ValDt><Dt>2026-03-15</Dt></ValDt>
        <BkTxCd>
          <Domn><Cd>PMNT</Cd>
            <Fmly><Cd>NTAV</Cd><SubFmlyCd>CHRG</SubFmlyCd></Fmly>
          </Domn>
        </BkTxCd>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

test('S58 B3: CHRG-TX auto-klassas som bank_fee, accept skapar B-serie-verifikat', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { companyId, fiscalYearId } = await seedCompanyViaIPC(ctx.window)

    // Import
    const imp = await ctx.window.evaluate(
      async (p) => {
        return await (
          window as unknown as {
            api: {
              importBankStatement: (d: unknown) => Promise<{
                success: boolean
                data?: { statement_id: number }
                error?: string
              }>
            }
          }
        ).api.importBankStatement(p)
      },
      { company_id: companyId, fiscal_year_id: fiscalYearId, xml_content: CAMT053_FEE },
    )
    expect(imp.success).toBe(true)
    const stmtId = imp.data!.statement_id

    // Suggester ska returnera fee-candidate
    const suggest = await ctx.window.evaluate(async (id) => {
      return await (
        window as unknown as {
          api: {
            suggestBankMatches: (d: { statement_id: number }) => Promise<{
              success: boolean
              data?: Array<{
                bank_transaction_id: number
                candidates: Array<{
                  entity_type: string
                  account?: string
                  score: number
                  confidence: string
                }>
              }>
            }>
          }
        }
      ).api.suggestBankMatches({ statement_id: id })
    }, stmtId)
    expect(suggest.success).toBe(true)
    const sug = suggest.data!
    expect(sug).toHaveLength(1)
    const cand = sug[0].candidates[0]
    expect(cand.entity_type).toBe('bank_fee')
    expect(cand.account).toBe('6570')
    expect(cand.confidence).toBe('HIGH')
    expect(cand.score).toBe(100)

    const txId = sug[0].bank_transaction_id

    // Accept fee
    const feeRes = await ctx.window.evaluate(async (p) => {
      return await (
        window as unknown as {
          api: {
            createBankFeeEntry: (d: unknown) => Promise<{
              success: boolean
              data?: { journal_entry_id: number; match_id: number }
              error?: string
            }>
          }
        }
      ).api.createBankFeeEntry(p)
    }, { bank_transaction_id: txId, payment_account: '1930' })
    expect(feeRes.success).toBe(true)

    // Verifiera journal_entry: B-serie, 2 rader (D 6570 / K 1930)
    const { entries, lines } = await getJournalEntries(ctx.window, fiscalYearId)
    const feeEntry = entries.find((e) => e.id === feeRes.data!.journal_entry_id)
    expect(feeEntry).toBeDefined()
    expect(feeEntry!.verification_series).toBe('B')
    expect(feeEntry!.source_type).toBe('auto_bank_fee')

    const feeLines = lines.filter((l) => l.journal_entry_id === feeEntry!.id).sort((a, b) => a.line_number - b.line_number)
    expect(feeLines).toHaveLength(2)
    expect(feeLines[0]).toMatchObject({ account_number: '6570', debit_ore: 5000, credit_ore: 0 })
    expect(feeLines[1]).toMatchObject({ account_number: '1930', debit_ore: 0, credit_ore: 5000 })

    // Reconciliation-rad har matched_entity_type='bank_fee'
    const matches = await ctx.window.evaluate(async (id) => {
      return await (
        window as unknown as {
          api: {
            invoke: (ch: string, arg: unknown) => Promise<unknown>
          }
          __testApi?: { getReconciliationMatches: (stmtId: number) => Promise<unknown> }
        }
      ).__testApi!.getReconciliationMatches(id)
    }, stmtId)
    expect(Array.isArray(matches)).toBe(true)
    expect((matches as Array<{ matched_entity_type: string; fee_journal_entry_id: number | null }>)[0]).toMatchObject({
      matched_entity_type: 'bank_fee',
      fee_journal_entry_id: feeRes.data!.journal_entry_id,
    })
  } finally {
    await ctx.cleanup()
  }
})
