# Sprint 20 — Steg 0 Output

## 0.1 Baseline
- Branch: main
- HEAD: aec5621 ("docs: F42 omklassad till designdivergens + M130")
- Tester: 1449 passed | 2 skipped (123 filer)
- Git status: clean

## 0.2 F45-ytor
- ExpenseForm.tsx: 388 rader
- InvoiceForm.tsx: 324 rader
- ExpenseForm datum: `expenseDate` (rad 248 value, rad 175 setField)
- InvoiceForm datum: `invoiceDate` (rad 202 value, rad 128 setField)
- Ingen error-rendering för datum-fält i någondera form

## 0.2b Hårdkodade 14998/18748-värden
Alla träffar i InvoiceTotals.test.tsx (planerad fil). Inga träffar utanför. OK.

## 0.3 F45-testytor
### ExpenseForm
- C8.2 (rad 398): "submit utan expenseDate → valideringsfel, IPC ej anropad"
- Kommentar rad 425: "expenseDate error not rendered in UI"
- Assertar BARA `not.toHaveBeenCalled()` — inte error-rendering

### InvoiceForm
- **INGEN motsvarande C8.2 för datum-validering.** C8 = Delete-flow.
- Validation-sektionen = C6 (C6.1: utan kund, C6.2: utan kund+lines, C6.3: tom lines)
- F45-tester för InvoiceForm numreras C6.4/C6.4b/C6.4c (ny nummering)

### Befintliga error-rendering-tester
- ExpenseForm C8.1: testar leverantör-error → `screen.getByText('Välj en leverantör')`
- InvoiceForm C6.1: testar kund-error → verifierar felmeddelande visas
- Mönster: `screen.getByText(errorMessage)` — enkel text-matchning

## 0.3b React-hook-form mode
**Inte react-hook-form.** Custom `useEntityForm` hook (src/renderer/lib/use-entity-form.ts).
- Validering: **onSubmit** (rad 87-133, `formSchema.safeParse` vid `handleSubmit`)
- `setField` (rad 75-83) **clearar field-error** vid fältändring (rad 78-82: `delete next[name]`)
- C8.2b-konsekvens: Variant B — "fyll i datum → error borta direkt" (setField clearar,
  ingen re-submit krävs)

## 0.4 F45-UI-renderingsmönster
Befintligt error-mönster (supplier, description, lines):
```tsx
{form.errors._supplier && (
  <p className="mt-1 text-xs text-red-600">{form.errors._supplier}</p>
)}
```

**Inga a11y-attribut** i befintlig error-rendering:
- Inget `role="alert"`
- Inget `aria-describedby`
- Inget `aria-invalid`
- Inget `data-testid`

F45-fix: Följer planens a11y-specifikation (role="alert" + aria-describedby) för datum-fält.
Inkonsistens med övriga fält noteras som framtida a11y-sprint-kandidat (out of scope).

## 0.5 F44-ytor
- InvoiceTotals.tsx: 62 rader. Formel rad 11: `toOre(line.quantity * line.unit_price_kr)`
- ExpenseTotals.tsx: 46 rader. Formel rad 14: `toOre(line.quantity * line.unit_price_kr)`
- Alt B = ~1-rads ändring i varje. Ingen strukturell refaktor.

## 0.5b M131-relevanta beräkningar utanför Totals

| Fil | Rad | Formel | Risk | Åtgärd |
|---|---|---|---|---|
| InvoiceTotals.tsx:11 | `toOre(qty * price_kr)` | Sprint 20 | Fix i S67b-3 |
| ExpenseTotals.tsx:14 | `toOre(qty * price_kr)` | Sprint 20 | Fix i S67b-3 |
| InvoiceLineRow.tsx:63 | `toOre(qty * price_kr)` | Display | F47 |
| ExpenseLineRow.tsx:26 | `qty * price_kr` | Display (int qty) | F47 (låg) |
| invoice-service.ts:64 | `Math.round(qty * unit_price_ore)` | **Bokföring** | **F47 kritisk** |
| expense-service.ts:50 | `qty * unit_price_ore` | Bokföring (int×int) | Ej F47 |

**F47 bekräftat.** invoice-service.ts:64 är Alt A-ekvivalent (0.089% fel).
expense-service.ts:50 är int×int (qty INTEGER) — inget F44-problem.

## 0.6 Invoice Zod-schema för quantity
- Form-schema (invoice.ts:9): `quantity: z.number()` — ingen precision-begränsning
- IPC-schema (ipc-schemas.ts:259): `quantity: z.number().positive()` — ingen refine/multipleOf
- Ingen befintlig .refine() eller .multipleOf() på quantity
- unit_price_kr: `z.number()` (form), `unit_price_ore: z.number().int().min(0)` (IPC) — inga
  extra invarianter behövs (öre-konvertering sker i transform)

## 0.6b IPC-lager-tester för quantity
- ipc-contract.test.ts rad 213-214: testar zero-rejection (`quantity: 0`)
- Inget test för decimal-precision (t.ex. qty=1.333 förkastas)
- **F48 bekräftat**: gap i IPC-lagret efter Zod-refine-addition

## 0.7 Expense quantity-invariant
- Form-schema: `z.number().int()` ✓
- IPC-schema: `z.number().int().min(1)` ✓
- Redan låst. Ingen ändring krävs.

## 0.8 F44-karakterisering (reproducerbar scan)
Script: `scripts/characterize-totals.mjs`

Domän: qty ∈ [0.01, 5.00] × price_kr ∈ [0.01, 200.00], 10 000 000 kombinationer

| Formel | Fel | Frekvens | Max delta |
|---|---|---|---|
| Gammal: `Math.round(qty * price_kr * 100)` | 34 591 | 0.346% | ±1 öre |
| Alt A: `Math.round(qty * Math.round(price_kr * 100))` | 8 860 | 0.089% | ±1 öre |
| **Alt B: heltalsaritmetik** | **0** | **0.000%** | **0** |

Alt B go-beslut bekräftat.

## 0.8b B2.5-värden

Spikat: **qty=0.5, price_kr=64.99**
- Gammal formel: `Math.round(0.5 * 64.99 * 100)` = `Math.round(3249.4999...)` = 3249
- Alt B: `Math.round(Math.round(50) * Math.round(6499) / 100)` = `Math.round(3249.5)` = 3250
- Referens: 3250
- Divergens bekräftad: 3249 ≠ 3250
- VAT (25%): Math.round(3250 * 0.25) = 813
- Total: 3250 + 813 = 4063

Val-motivering: qty=0.5 (halvtimme/halvmeter), price_kr=64.99 (realistiskt), skilt
från B2.4 (1.5, 99.99) i IEEE754-felrymden (0.5×X.X9 vs 1.5×X.X9 som underliggande
float-representation).

## 0.9 Zod-refine-konvention
Befintliga refine-meddelanden är svenska:
- "Välj en kund", "Välj en leverantör"
- F44-refine följer: "Quantity kan ha högst 2 decimaler"

Befintliga refine-mönster: `.refine(v => predicate, 'meddelande')`

## 0.10 M-nummer
Sista använda: M130 (Sprint 19, F42-omklassning)
Nästa ledigt: **M131** ✓

## Spikade testnamn och nummering

### S67a — F45

**ExpenseForm.test.tsx** (C8-grupp):
- C8.2 (uppdaterad in-place): "submit utan expenseDate → valideringsfel, IPC ej anropad + felmeddelande renderas"
- C8.2b (ny): "expenseDate-felmeddelande försvinner när datum fylls i"
- C8.2c (ny): "expenseDate-felmeddelande har role=alert och aria-koppling"

**InvoiceForm.test.tsx** (C6-grupp):
- C6.4 (ny): "submit utan invoiceDate → valideringsfel, IPC ej anropad + felmeddelande renderas"
- C6.4b (ny): "invoiceDate-felmeddelande försvinner när datum fylls i"
- C6.4c (ny): "invoiceDate-felmeddelande har role=alert och aria-koppling"

### S67b — F44

**form-schemas/invoice.test.ts** (6 nya):
- qty=1 → OK, qty=1.5 → OK, qty=1.33 → OK
- qty=1.333 → ZodError, qty=0.01 → OK, qty=0.001 → ZodError

**InvoiceTotals.test.tsx**:
- B2.4 uppdaterad: net 14999, vat 3750, total 18749
- B2.5 (ny): qty=0.5, price_kr=64.99 → net 3250, vat 813, total 4063
- B2.6 (ny): qty=1.33, price_kr=99.99 → net 13299, vat 3325

**ExpenseTotals.test.tsx**:
- B2.4 oförändrad aritmetiskt, kommentar uppdaterad

## Commit-kedja (slutgiltig, 8 commits)
1. fix(forms): F45 ExpenseForm → 1449 → 1451
2. fix(forms): F45 InvoiceForm → 1451 → 1454
3. docs: F44 karakterisering → 1454
4. fix(schema): Zod-refine → 1454 → 1460
5. fix(totals): F44 Alt B + M131 → 1460 → 1462
6. fix(service): F47 invoice-service → 1462 → 1464
7. docs(backlog): F44+F47 stängda, F46/F48/F49 tillagda → 1464
8. Sprint 20 avslut → 1464

Totalt: +15 tester. Slutbaslinje: 1464 passed | 2 skipped.

## Backlog-tillägg
- **F47 (NY)**: M131-efterlevnad i invoice-service.ts:64, InvoiceLineRow.tsx:63,
  ExpenseLineRow.tsx:26. Prioritet medium (invoice-service.ts:64 är kritisk —
  bokföringsgenerering).
- **F48 (NY)**: IPC-lager-test för quantity ≤2 decimaler saknas efter Zod-refine.
  Prioritet låg.

## Avvikelser från plan
1. InvoiceForm-tester numreras C6.4/C6.4b/C6.4c (inte "motsvarande C8.2")
2. Befintligt error-mönster saknar a11y — F45 lägger till a11y ENBART för datum-fält
3. Alt A-felfrekvens: 0.089% (plan: 0.101%) — scanvärden exakta, plan var approximation
4. S67a InvoiceForm: +3 nya tester (inte +2), eftersom C6.4 är helt nytt (inte in-place uppdatering)
5. Totalt: +13 nya tester (inte +12) pga InvoiceForm-korrigering. 1449 → 1462.
