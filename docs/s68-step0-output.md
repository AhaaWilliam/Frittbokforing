# S68 Steg 0 — Preflight-resultat

## 0.1 Baseline
- Branch: main
- HEAD: 3c3d027 ("Sprint 20 S67a + S67b klar")
- Tests: 1464 passed | 2 skipped
- Status: clean

## 0.2 F47-ytor oförändrade
- `InvoiceLineRow.tsx:63`: `const lineNettoOre = toOre(line.quantity * line.unit_price_kr)` — gammal formel
- `ExpenseLineRow.tsx:26`: `const lineTotal = line.quantity * line.unit_price_kr` — gammal formel
- Ingen har `Math.round`-wrapping → sprinten har inte körts

## 0.3 IPC-channels
- `IPC_CREATE_CHANNEL` = `invoice:save-draft`
- `IPC_UPDATE_CHANNEL` = `invoice:update-draft`
- Handlers: direkt delegation till `saveDraft(db, input)` och `updateDraft(db, input)`
- Validering: `SaveDraftInputSchema.safeParse(input)` / `UpdateDraftInputSchema.safeParse(input)`
- Schema: `InvoiceDraftLineSchema` i `shared/ipc-schemas.ts:255-268`
  - `quantity: z.number().positive().refine(n => Math.abs(n*100 - Math.round(n*100)) < 1e-9)`

### F48-testfil
- Befintlig testfil: `tests/security/SEC01-input-validation.test.ts` testar schemas direkt
- Alternativt: `tests/session-45-fas5a-performance.test.ts` testar service-funktioner direkt
- **Beslut:** F48-tester läggs i `tests/session-68-ipc-precision.test.ts` (ny fil)
  som anropar `saveDraft(db, input)` och `updateDraft(db, input)` direkt (samma mönster
  som session-45 och system-tester). Schema-validering sker inne i dessa funktioner.

### IPC-test-helper (0.3d)
- Mönster: direkt import av `saveDraft`/`updateDraft` från service-filen
- Fixture: `createTestDb()` + company + counterparty + vatCode + product
- Anropet returnerar `IpcResult` — `.success: false` + `.code: 'VALIDATION_ERROR'` vid schema-brott

## 0.3b IPC-schema-validering
Bekräftat: `saveDraft` anropar `SaveDraftInputSchema.safeParse(input)` (rad 82).
`updateDraft` anropar `UpdateDraftInputSchema.safeParse(input)` (rad 169).
Båda schemas innehåller `InvoiceDraftLineSchema` med qty ≤2 dec refine.

## 0.3c Scope-sanity
- ✅ Schemas används i handlers
- ✅ Ingen befintlig precision-test
- 2 channels med line-data (save-draft, update-draft) — under tröskeln

## 0.3e Int-invariant-konsistens (expense qty)
- Form-schema (`expense.ts:9`): `z.number().int()` ✅
- IPC-schema (`ipc-schemas.ts:369`): `z.number().int().min(1)` ✅
- DB-schema: `quantity INTEGER` ✅
- **Alla tre lager: int. S68b är strikt defensiv.**

## 0.4 Testmönster och DOM-struktur

### InvoiceLineRow
- Per-rad `data-testid`: finns för inputs (description, quantity, price, vat, account) men **INTE** för netto-belopp
- Per-rad `data-value`: **saknas** på netto-cellen
- Netto renderas i `<td className="px-2 py-2 text-right text-sm">{formatKr(lineNettoOre)}</td>` (rad 138)
- **Åtgärd:** Lägg till `data-testid={`line-net-ore-${index}`}` och `data-value={lineNettoOre}` i commit 1
- Props: `{ line: InvoiceLineForm, index, counterpartyId, onUpdate, onRemove }`
- Test-setup: `renderWithProviders` wraps med providers, `<table><tbody>` wrapper krävs, `setupMockIpc` + `mockIpcResponse('vat-code:list', ...)` behövs (ArticlePicker-hook)

### InvoiceTotals
- `data-testid="total-net-ore"` med `data-value={totalNetto}` ✅
- `data-testid="total-vat-ore"` med `data-value={totalVat}` ✅
- `data-testid="total-sum-ore"` med `data-value={totalAtt}` ✅

### ExpenseLineRow
- Per-rad `data-testid`: finns för inputs men **INTE** för total-belopp
- Total renderas i `<td className="px-2 py-1 text-right tabular-nums">{formatKr(toOre(lineTotal + lineVat))}</td>` (rad 112-113)
- **Åtgärd:** Lägg till `data-testid={`expense-line-net-ore-${index}`}` och `data-value={lineNetOre}` i commit 2

## 0.4b Oberoende-väg-analys: **Fall B**
`InvoiceTotals` beräknar per-rad `nettoOre` inline med:
```ts
const nettoOre = Math.round(Math.round(line.quantity * 100) * Math.round(line.unit_price_kr * 100) / 100)
```
Detta är **exakt samma Alt B-formel** som `InvoiceLineRow` kommer att använda efter commit 1.
→ **Fall B — Samma väg.** DOM-smoke-testet är rendering-smoke, inte M131-konvergens-bevis.

## 0.5 M131-canaries Sprint 20
Alla 13 InvoiceTotals-tester passerar. B2.4/B2.5/B2.6 bekräftade OK.

## 0.6 M131 grep-check
### Lager 1 (bar multiplikation):
- `InvoiceLineRow.tsx:63` — F47 target ✅
- `ExpenseLineRow.tsx:26` — F47 target ✅
- `expense-service.ts:50` — `line.quantity * line.unit_price_ore` (int × int, M92, inte M131-brott)
- `expense-service.ts:49` — kommentar-rad

### Lager 2 (toOre-wrapping):
- `InvoiceLineRow.tsx:63` — F47 target ✅ (lager 2 fångar den!)

**Scanner-design-validering:** Lager 2 fångar `InvoiceLineRow.tsx:63` ✅

**Grep-check-justering:** Måste undanta `unit_price_ore` (int × int) från Lager 1.
Uppdaterad regex: `quantity[^*]*\*[^*]*price_kr|price_kr[^*]*\*[^*]*quantity`
(specifikt `price_kr` istället för `price` — undviker false positive på `unit_price_ore`)

## 0.7 CI-infrastruktur
- Ingen `.husky/pre-commit`
- Scripts-sektion i package.json har ~25 scripts
- `check:m131` läggs till efter befintliga scripts

## 0.8 Testantal
Sprint 21 totalt: 8 nya tester (3 + 2 + 3 + 0). 1464 → 1472.

## 0.9 Commit-kedja
| # | Commit | Baslinje |
|---|---|---|
| 1 | `fix(display): F47 Alt B i InvoiceLineRow + DOM-smoke` | 1464 → 1467 |
| 2 | `fix(display): F47 Alt B i ExpenseLineRow + Zod-regression-guard` | 1467 → 1469 |
| 3 | `test(ipc): F48 decimal-precision-gate på invoice-channels` | 1469 → 1472 |
| 4 | `chore(ci): M131 grep-check med självtest` | 1472 → 1472 |
| 5 | `Sprint 21 S68 klar` | 1472 → 1472 |
