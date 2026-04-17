/**
 * Sprint 57 A5 partial-failure — SuggestedMatchesPanel bulk-accept delfel.
 *
 * Seed 3 fakturor (unika belopp) → importera 3 TX som matchar HIGH →
 * expandera panel (cachar 3 candidates) → flippa invoice#2 → 'paid' via
 * __testApi.setInvoiceStatus → klick bulk-accept → assert toast-warning
 * "2 av 3 accepterade" + failure-listan.
 */
import { test, expect } from '@playwright/test'
import { launchAppWithFreshDb, seedCompanyViaIPC } from './helpers/launch-app'
import { seedCustomer, seedAndFinalizeInvoice } from './helpers/seed'
import { getJournalEntries } from './helpers/assertions'

/**
 * 3 TXs, olika belopp (125.00, 250.00, 375.00) som matchar 3 fakturor
 * med motsvarande belopp. Alla samma datum → varje TX får 1 HIGH-candidate
 * (100 belopp-exakt + 30 samma-datum = 130, unik topp).
 */
const CAMT053 = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.08">
  <BkToCstmrStmt>
    <GrpHdr><MsgId>M</MsgId><CreDtTm>2026-03-20T10:00:00</CreDtTm></GrpHdr>
    <Stmt>
      <Id>STMT-PARTIAL</Id>
      <CreDtTm>2026-03-20T10:00:00</CreDtTm>
      <Acct><Id><IBAN>SE4550000000058398257466</IBAN></Id><Ccy>SEK</Ccy></Acct>
      <Bal>
        <Tp><CdOrPrtry><Cd>OPBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">0.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-01</Dt></Dt>
      </Bal>
      <Bal>
        <Tp><CdOrPrtry><Cd>CLBD</Cd></CdOrPrtry></Tp>
        <Amt Ccy="SEK">750.00</Amt><CdtDbtInd>CRDT</CdtDbtInd>
        <Dt><Dt>2026-03-15</Dt></Dt>
      </Bal>
      <Ntry>
        <Amt Ccy="SEK">125.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <ValDt><Dt>2026-03-15</Dt></ValDt>
        <AcctSvcrRef>REF-PF-1</AcctSvcrRef>
      </Ntry>
      <Ntry>
        <Amt Ccy="SEK">250.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <ValDt><Dt>2026-03-15</Dt></ValDt>
        <AcctSvcrRef>REF-PF-2</AcctSvcrRef>
      </Ntry>
      <Ntry>
        <Amt Ccy="SEK">375.00</Amt>
        <CdtDbtInd>CRDT</CdtDbtInd>
        <BookgDt><Dt>2026-03-15</Dt></BookgDt>
        <ValDt><Dt>2026-03-15</Dt></ValDt>
        <AcctSvcrRef>REF-PF-3</AcctSvcrRef>
      </Ntry>
    </Stmt>
  </BkToCstmrStmt>
</Document>`

test('S57 A5 partial: 1 av 3 failar → "2 av 3 accepterade" + failure-lista', async () => {
  const ctx = await launchAppWithFreshDb()
  try {
    const { companyId, fiscalYearId } = await seedCompanyViaIPC(ctx.window)
    const custId = await seedCustomer(ctx.window)

    // 3 fakturor, olika unit_price så totalerna blir 125/250/375 (×1.25 moms).
    const inv1 = await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: custId, fiscalYearId,
      invoiceDate: '2026-03-15', dueDate: '2026-04-14',
      unitPriceOre: 10000, quantity: 1,
    })
    const inv2 = await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: custId, fiscalYearId,
      invoiceDate: '2026-03-15', dueDate: '2026-04-14',
      unitPriceOre: 20000, quantity: 1,
    })
    const inv3 = await seedAndFinalizeInvoice(ctx.window, {
      counterpartyId: custId, fiscalYearId,
      invoiceDate: '2026-03-15', dueDate: '2026-04-14',
      unitPriceOre: 30000, quantity: 1,
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

    // Navigera till detail
    await ctx.window.evaluate((id) => {
      location.hash = `#/bank-statements/${id}`
    }, stmtId)

    // Expandera panel → fetchar + cachar 3 HIGH-candidates
    await ctx.window.getByTestId('suggested-matches-panel').click()
    const bulkBtn = ctx.window.getByTestId('suggested-matches-accept-all-high')
    await expect(bulkBtn).toBeVisible({ timeout: 10_000 })
    await expect(bulkBtn).toContainText('(3)')

    // Sabotage: flippa invoice#2 → 'paid' utan att lägga betalning.
    // _payInvoiceTx avvisar med "Kan inte registrera betalning på denna faktura."
    // Cachen i React Query är intakt eftersom ingen mutation körts än.
    await ctx.window.evaluate(
      (id) =>
        (
          window as unknown as {
            __testApi: { setInvoiceStatus: (id: number, s: string) => Promise<unknown> }
          }
        ).__testApi.setInvoiceStatus(id, 'paid'),
      inv2.invoiceId,
    )

    // Bulk-accept
    await bulkBtn.click()

    // Failure-sektionen visas med "2 av 3 accepterade"
    const failures = ctx.window.getByTestId('suggested-matches-failures')
    await expect(failures).toBeVisible({ timeout: 10_000 })
    await expect(failures).toContainText('2 av 3 accepterade')

    // Verifiera att exakt 2 A-serie-payment-verifikat skapades (utöver
    // de 3 finalize-verifikaten). Varje lyckad match lägger till 1 verifikat.
    const { entries } = await getJournalEntries(ctx.window, fiscalYearId)
    const aSeries = entries.filter((e) => e.verification_series === 'A')
    // 3 finalize + 2 lyckade matches = 5
    expect(aSeries.length).toBe(5)

    // Sanity: inv1 och inv3 ska vara paid; inv2 är fortfarande 'paid' (vår flip),
    // men paid_amount_ore = 0 (ingen verklig betalning).
    const invs = await ctx.window.evaluate(
      async (fyId) => {
        return await (
          window as unknown as {
            __testApi: { getInvoices: (id?: number) => Promise<Array<{ id: number; paid_amount_ore: number }>> }
          }
        ).__testApi.getInvoices(fyId)
      },
      fiscalYearId,
    )
    const row1 = invs.find((i) => i.id === inv1.invoiceId)!
    const row2 = invs.find((i) => i.id === inv2.invoiceId)!
    const row3 = invs.find((i) => i.id === inv3.invoiceId)!
    expect(row1.paid_amount_ore).toBeGreaterThan(0)
    expect(row3.paid_amount_ore).toBeGreaterThan(0)
    expect(row2.paid_amount_ore).toBe(0)
  } finally {
    await ctx.cleanup()
  }
})
