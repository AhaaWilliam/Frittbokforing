# Sprint 50 — F6 Pain.001 för invoice-batchar (symmetri)

**Session:** S50  •  **Datum:** 2026-04-16  •  **Scope:** Ny feature (minimal — bygger på befintlig M112–M114 infrastruktur)

## Motivation

F4 (S46) levererade pain.001-export för expense-batchar (leverantörsbetalningar). M112–M114 etablerade `payment_batches` med `batch_type IN ('invoice', 'expense')` så invoice-sidan hade redan samma infrastruktur — men UI:n låste ut export-knappen och backend:ens `getPaymentsForBatch` invoice-branch hade `NULL` remittance.

F6 öppnar symmetrin.

## Resultat

| Metrik | Före | Efter |
|---|---|---|
| Vitest | 2247 pass | 2255 pass (+8) |
| E2E | 16 specs (15 pass) | 17 specs (16 pass) |
| TSC errors | 0 | 0 |
| PRAGMA user_version | 37 | 37 (ingen migration) |

## Ändringar

### Backend — `src/main/services/payment/pain001-export-service.ts`

Tre små ändringar:

1. **`PaymentRow` omdöpt till domän-agnostiska namn:**
   - `expense_id` → `source_id`
   - `supplier_invoice_number` → `remittance_ref`
2. **`getPaymentsForBatch` invoice-branch populerar remittance:**
   ```sql
   i.invoice_number AS remittance_ref
   ```
   Tidigare `NULL AS supplier_invoice_number`.
3. **`generatePain001` XML-generering:** byter `p.supplier_invoice_number` → `p.remittance_ref`. Samma kod för båda sidor.

`validateBatchForExport` var redan polymorf (läser `batch.batch_type`), ingen ändring.

### Frontend

**`BulkPaymentResultDialog.tsx`:**
```diff
-const canExport = batchType === 'expense' && ...
+const canExport = (batchType === 'expense' || batchType === 'invoice') && ...
```

**`InvoiceList.tsx`:**
```diff
-<BulkPaymentResultDialog ... result={bulkResult} />
+<BulkPaymentResultDialog ... result={bulkResult} batchType="invoice" />
```

## Tester

### System-nivå (8 nya) — `tests/session-50-pain001-invoice.test.ts`

Mirror av session-46 men för invoice-batch. Direkt DB-seeding (minimal setup) för att testa service-lagret i isolation.

| # | Assertion |
|---|---|
| I1 | `validateBatchForExport` lyckas för giltig invoice-batch |
| I2 | flaggar kund utan payment info (bankgiro/plusgiro/bank_account alla NULL) |
| I3 | `generatePain001` genererar giltigt XML för invoice-batch |
| I4 | XML innehåller kundnamn som creditor |
| I5 | XML remittance = `invoices.invoice_number` |
| I6 | Belopp korrekt konverterat öre → kronor |
| I7 | Filnamn-format `PAIN001_{batch}_{date}.xml` |
| I8 | `PmtInfId` = `BATCH-{batch_id}` |

### E2E (1 ny) — `tests/e2e/pain001-invoice-export.spec.ts`

Full stack: onboarding → seed kund med bankgiro → skapa + finalize faktura → `payInvoicesBulk` → `exportPain001` → assert XML på disk med kundnamn, belopp, och `<Ustrd>` med fakturanummer.

## Designval

**Enabled för alla invoice-batchar, inte bara credit_notes.** Pain.001 är tekniskt sett "Customer Credit Transfer" — meningsfullt när företaget betalar någon (t.ex. refund via kreditfaktura). För vanliga inkommande kundbetalningar är filen semantiskt meningslös men inte farlig (banken avvisar). Användaren avgör när filen är relevant — vi låser inte.

**Remittance = `invoice_number`, inte `description` eller liknande.** Matchar hur expense-sidan använder `supplier_invoice_number`. Kort, maskinläsbar, unik per räkenskapsår.

## Backlog

Ingen ny backlog. Kvarvarande pre-existing från S49:
- `bulk-payment.spec.ts:78` "Drafts/paid är icke-selectable" failar — paid-fakturor är nu selectable i InvoiceList select-all. Inte orsakat av S49 eller S50.
