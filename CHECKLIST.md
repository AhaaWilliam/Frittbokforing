# Renderer Component Test Checklist

## Path-mappning

Varje modifierad/ny fil under `src/renderer/` kräver en motsvarande testfil:

```
src/renderer/<X>/<Y>.tsx  →  tests/renderer/<X>/<Y>.test.tsx
```

Samma katalogstruktur speglas 1:1. Gate-scriptet körs via:

```bash
node scripts/checklist-gate.mjs
```

## Renderer-testinfrastruktur

Varje test-fil som använder `renderWithProviders` måste anropa `setupMockIpc()` i `beforeEach`. FiscalYearContext kräver det, även om testet inte direkt interagerar med fiscal year.

## Bootstrap-exkluderingar

Följande filer kräver inte test (bootstrap/entry points):

- `src/renderer/main.tsx`
- `src/renderer/app.tsx`
- `src/renderer/router/router.tsx`
- `src/renderer/router/routes.ts`

Om fler behöver undantas: lägg till i `BOOTSTRAP_EXCLUSIONS` i
`scripts/checklist-gate.mjs` och dokumentera här.

## Sprint-baseline

Filen `.sprint-baseline` innehåller commit-hashen som gate-scriptet
diffar mot. Uppdateras manuellt vid sprint-start.

## A11y-policy

Alla renderer-tester kör `axe-core` default-på via `renderWithProviders`.
Violation → testet failar.

### När är `axeCheck: false` motiverat?

Endast följande fall:

1. **Intentionally invalid markup för error-state-tester.** Exempel: test
   som verifierar att en form visar valideringsfel när användaren submittar
   utan required fields — själva error-state-renderingen kan innehålla
   ARIA-patterns som axe flaggar i sin mellanliggande form.
2. **Isolerade sub-komponenter som inte är meningsfulla utan parent.**
   Exempel: en `<td>` som testas utanför sin `<table>`. Föredra att
   testa i meningsfull kontext istället; opt-out är sista utvägen.

Om du känner behov av opt-out utanför dessa två fall: pausa och diskutera.
Det är en signal att antingen komponenten har ett faktiskt a11y-problem
som behöver fixas, eller att test-setupen saknar nödvändig wrapping.

### Avaktiverade axe-regler

Se kommentar överst i `tests/helpers/render-with-providers.tsx` för aktuell
lista + motivering. Nuvarande avaktiveringar:

- `color-contrast` — jsdom beräknar inte styles, regeln ger alltid false positive.

## Sprint 18 — S64b

Komponent: FormField
Test-fil: tests/renderer/components/ui/FormField.test.tsx
M-principer täckta: —
Beteendecase: label-koppling (id=name, htmlFor=name), required (visuell asterisk), disabled, type=number

Komponent: FormSelect
Test-fil: tests/renderer/components/ui/FormSelect.test.tsx
M-principer täckta: M78 (number/string-konvertering via `<select>`)
Beteendecase: options render, value-display (string+number), onChange round-trip (number), string-bevarande, tom options-lista

Komponent: FormTextarea
Test-fil: tests/renderer/components/ui/FormTextarea.test.tsx
M-principer täckta: —
Beteendecase: value/onChange, rows default+override, disabled

## Sprint 18 — S64c

Komponent: useEntityForm (hook)
Test-fil: tests/renderer/lib/use-entity-form.test.tsx
M-principer täckta: M77 (dual-schema: formSchema + payloadSchema via transform),
M79 (hookens kärn-API),
M100 (IpcError.field → per-fält errors),
M102 (sticky dirty via dirtyRef, ingen re-render-trigger)
Beteendecase: init/defaults, getField/setField med error-rensning,
formSchema-validering, payloadSchema-validering via transform,
submit happy path, submit errors (IpcError m/u field, generic),
isDirty + M102-subtlety, reset (full + partial),
integration med FormField (2 sanity-tester)

## Sprint 18 — S64d

Komponent: FiscalYearContext (context + provider + useFiscalYearContext-hook)
Test-fil: tests/renderer/contexts/FiscalYearContext.test.tsx
M-principer täckta: M102 (restoredIdLoaded-gating mot race condition)
Beteendecase: resolution-kedja (selectedYear → restoredId → first open → first),
restoredIdLoaded-gating (4 timing-case inkl. explicit val under pending restore),
setActiveFiscalYear-bieffekter (settings:set, stängd FY),
isReadOnly-derivering (open/closed),
edge cases (tom lista, ogiltigt restoredId),
useFiscalYearContext utanför provider (throw)

## Sprint 18 — S65-pre

Leverans: docs/s65-audit.md
Typ: Audit, ingen kod
Resultat: 5 komponenter auditerade (CustomerPicker, SupplierPicker, ArticlePicker,
InvoiceLineRow, ExpenseLineRow), sessionsplan S65a–d definierad
Blockerande findings: 0
Uppskattat totalt testantal: ~48 (16 + 19 + 15 + 21 + 15, men CustomerPicker+SupplierPicker
samlas i S65c = 36)
Föreslagen sessionsordning: S65a ExpenseLineRow, S65b InvoiceLineRow,
S65c CustomerPicker+SupplierPicker, S65d ArticlePicker

## Exempelformat för PR-beskrivningar

```
Komponent: FormSelect
Test-fil: tests/renderer/components/ui/FormSelect.test.tsx
M-principer täckta: M78 (number/string-konvertering)
Beteendecase: disabled, required, tom optionlista, konverteringsfel

Komponent: InvoiceForm
Test-fil: tests/renderer/components/invoices/InvoiceForm.test.tsx
M-principer täckta: M12 (öre), M15 (quantity × unit_price_ore)
Beteendecase: draft save, line add/remove, validation errors
```

## Sprint 18 — S65a

Komponent: ExpenseLineRow (props-driven, ingen hook-beroende)
Test-fil: tests/renderer/components/expenses/ExpenseLineRow.test.tsx
M-principer täckta: M102 (memo-kontrakt via $$typeof-marker)
Beteendecase: rendering (4), callback-propagering med parser-fallbacks (6), beräkningsrimlighet kr→öre (4), memo-kontrakt (1), edge vat_code_id=0 (1)

### Patterns etablerade inför S65b

- `renderWithProviders` + `<table><tbody>`-wrap för `<tr>`-rot-komponenter
- Memo-kontrakt via `$$typeof`-marker, inte beteende
- Parser-fallbacks spikas via Steg 0-grep, inte antagande
- `formatKr`-assertions kräver `\u00a0`→space-normalisering (`expectedTotal`-helper)

### Föregående bugg-commit

- `fix(a11y)`: aria-label på alla inputs/selects i ExpenseLineRow (e84e58d)
- Upptäckt vid S65a-preflight (axe-core default-on policy)

### Gap

- Komma-decimal i price-input otestad (parseFloat hanterar inte `"99,50"`)
- F27-regression ligger i S65b (InvoiceLineRow)
- `"0"` i quantity-input triggar `||1`-fallback — quantity=0 ej möjlig via input (känd begränsning, dokumenterad i test)

## Sprint 18 — S65b

Komponent: InvoiceLineRow (fork-komponent: produktrad vs friformsrad, ArticlePicker-child, useVatCodes-hook)
Test-fil: tests/renderer/components/invoices/InvoiceLineRow.test.tsx
M-principer täckta: M102 (memo-kontrakt via $$typeof), M123 (fork produkt/friform via product_id === null)
Beteendecase: produktrad rendering (4), produktrad callbacks inkl. ArticlePicker-integration (4), friformsrad rendering+callbacks (5), F27-regression öre-precision NETTO (3), memo-kontrakt (1), edge vat/fork-byte/stale-state/qty=0 (4)

### Patterns etablerade inför S65c/d

- Modulnivå vi.mock för child-komponenter (ArticlePicker) med minimal stub — enbart callback-kontrakt
- Fork-komponenter testas med separata describe-block per gren
- F27-pattern: standardfall + stort tal + minsta belopp med avrundningsregel spikad i Steg 0.8
- useVatCodes-hook mockas via `mockIpcResponse('vat-code:list', data)` i beforeEach
- Viktigt: InvoiceLineRow arbetar i KR (unit_price_kr), inte ÖRE — total beräknas som toOre(qty × price_kr)

### Föregående bugg-commit

- `fix(a11y)`: aria-label på alla inputs/selects + remove-knapp i InvoiceLineRow (4edce88)
- Upptäckt vid S65b-preflight (axe-core default-on policy)

### Gap

- Komma-decimal i price-input otestad (parseFloat hanterar inte `"99,50"`)
- ArticlePicker-integration enbart kontraktstestad (full integration i S65d)
- `"0"` i quantity-input triggar `||0`-fallback via parseFloat — quantity=0 möjlig (skiljer sig från S65a:s parseInt||1)

### Sprint-stängning TODO

- M123-beskrivning: aligna CLAUDE.md och Notion. Forken gäller enbart konto-input, inte ArticlePicker-synlighet. Nuvarande text missvisande.
- STATUS.md: uppdatera testbaslinje till 1313, lägg till Sprint 17/18 sessioner.

## Sprint 18 — S65c

Komponenter: CustomerPicker (invoices), SupplierPicker (expenses)
Test-filer: tests/renderer/components/invoices/CustomerPicker.test.tsx, tests/renderer/components/expenses/SupplierPicker.test.tsx
Delad fixtur: tests/renderer/components/__fixtures__/counterparties.ts
M-principer: Inga (ingen memo på komponenterna)
Beteendecase per komponent:
- CustomerPicker (9): rendering med/utan value (3), onChange med payment_terms + byte av val + ej vid mount/rerender (4), empty list + pending IPC graceful (2)
- SupplierPicker (13): rendering med/utan value (3), onChange med payment_terms + byte av val + ej vid mount/rerender (4), empty list (1), inline-skapa-flöde: trigger synlig + IPC-payload + auto-onChange + felhantering (4), disabled-prop (1)

### Patterns etablerade inför S65d

- Delad fixtur-fil (`__fixtures__/counterparties.ts`) för syster-komponenter med identisk datatyp, `makeCounterparty`-factory
- Async-picker-mönster: IPC-mock i beforeEach (`counterparty:list`), test empty + pending graceful
- Inline-skapa-flöde: trigger -> hook-anrop via `mutateAsync` -> auto-onChange-propagering -> felhantering (catch swallows, onChange ej anropad)
- Create-IPC (`counterparty:create`) kräver separat mock i beforeEach med `{ success: true, data: ... }` (IpcResult-format), fel-case via per-test `mockIpcResponse` med `{ success: false, ... }`
- `mockIpcError`-helper tillagd i mock-ipc.ts (rejectar promise med Error)
- Async-assertioner: `findBy*`/`waitFor` efter IPC-trigger, `getMockApi()` helper för att assert:a IPC-anrop

### Föregående fix-commits

- `fix(a11y)`: aria-label på sök-inputs (006bea2)
- `fix(a11y)`: aria-label på clear-knappar (f619f3d)
- `test(infra)`: mockIpcError-helper (2ade4b9)

### Gap

- Felmeddelande vid create-error renderas ej lokalt (hanteras via global onError) — dokumenterat gap
- Integration med InvoiceForm/ExpenseForm testas i kommande sprint
- useCreateCounterparty isolerat otestad (hook-test, ej komponent-test)
- Dropdown saknar ARIA combobox/listbox roles (a11y-gap, ej scope för S65c)
- Debounced search-filtrering otestad

## Sprint 18 — S65d

Komponent: ArticlePicker (145 rader, invoices)
Test-fil: tests/renderer/components/invoices/ArticlePicker.test.tsx
Delad fixtur: tests/renderer/components/__fixtures__/products.ts
M-principer: Inga nya (F27-regel via M91/M92)
Beteendecase:
- Rendering (3): smoke, focus-open med badges, counterparty-aware (kundpris-IPC ej triggas vid rendering)
- Sök+filter (2): debounced IPC-search, outside-click close
- Val utan counterparty (3): default-pris-propagering, description-fallback (product.description ?? product.name), ingen kundpris-IPC
- Val med counterparty (4): kundpris-IPC anropas, customer-source override, default-source pass-through, fel-fallback till default_price_ore
- F27-klass toKr (4): jämnt belopp, decimal kundpris, decimal fallback, edge 99 öre → 0.99 kr
- Empty (1): tom lista utan krasch
- Re-val (1): dubbel-klick propagerar olika payloads

### Patterns etablerade/återanvända

- Async-picker-mönster från S65c (IPC-mock i beforeEach, findBy*/waitFor med timeout 2000ms)
- Sekundär async-IPC i select-handler testas som kontrakt + fallback
- F27-klass-verifiering som dedikerad testgrupp, förutsätter direkta toKr-enhetstester
- Re-val-test för fire-and-forget pickers (ingen value-prop)
- IPC-assertions via getMockApi() (inte hook-assertions) — debounce-robust
- toHaveBeenCalledTimes(N) — aldrig bara toHaveBeenCalled()
- mockIpcError för reject-baserad felhantering (getPriceForCustomer anropas direkt, inte via ipcCall)

### Föregående fix-commits

- `fix(a11y)`: aria-label på sök-input (c10b460)
- `test(money)`: direkta toKr/toOre-enhetstester (6d8edb3) — prerequisite för Grupp 5

### Gap

- account_id propageras inte via onSelect (M123 COALESCE löser i journal-entry-builder)
- vat_rate: 0 hårdkodning — parent resolvar via vat_code_id (InvoiceForm-integration)
- Keyboard-nav saknas i ArticlePicker — a11y-skuld, framtida sprint
- Dropdown saknar ARIA combobox/listbox roles — a11y-skuld, delad med CP/SP
- counterpartyId={0} hoppar över kundpris-IPC (truthy-guard, känd semantik)
- getPriceForCustomer anropas direkt (ej via ipcCall) — error-mocking kräver mockIpcError (reject), inte mockIpcResponse med success:false
- Integration med InvoiceLineRow testas i kommande sprint (S66)

### S65-serien komplett

Fem komponenter isolerade: ExpenseLineRow (S65a), InvoiceLineRow (S65b), CustomerPicker (S65c), SupplierPicker (S65c), ArticlePicker (S65d). Nästa steg: formulär-nivå-integrationstester (InvoiceForm, ExpenseForm) i S66.

---

## Sprint 19 — S66a: InvoiceTotals + InvoiceForm

**Komponenter:** InvoiceForm (324 rader) + InvoiceTotals (56 rader) + transformInvoiceForm (84 rader)

**Testfiler (4):**

1. `tests/renderer/lib/form-schemas/invoice.test.ts` (8 tester) — prereq-commit
   - Struktur (3): strip _fields, sort_order per index, fiscal_year_id propagering
   - toOre-precondition (3): jämn (1250→125000), decimal (123.45→12345), edge (0.99→99)
   - Defensiv (2): tom lines (Zod blockerar i prod), null customer → TypeError

2. `tests/renderer/components/invoices/InvoiceTotals.test.tsx` (11 tester)
   - Rendering (3): tom, en rad, tre momssatser
   - Per-rad F27 (4): jämn, decimal, edge 99 öre, fraktionell qty (F44 float-trap)
   - Ackumulerad F27 (2): summa(round) ≠ round(summa), stora belopp
   - Grupperad VAT (2): tre momssatser, 0%-behandling

3. `tests/renderer/components/invoices/InvoiceForm.test.tsx` (19 tester, mockade pickers + totals)
   - Rendering (2): create-mode, edit-mode
   - Cascading customer→terms+dueDate (3): inkl. dokumentationstest för no-dirty-check
   - Cascading datum→dueDate (2)
   - Cascading edit-mode initial render (1): regressionstest mot useEffect-överskrivning
   - Line-hantering (3): add, remove, add×3
   - Validation (3): customer, customer+lines, lines min 1
   - Save-kontrakt (2): edit-mode save, payload-valideringsfel
   - Delete-flow (3): confirm+IPC+onSave, ej synlig i create, confirm-false-avbryt

4. `tests/renderer/components/invoices/InvoiceForm.integration.test.tsx` (2 tester, utan mocks)
   - F27-kedja: reella totaler med äkta InvoiceTotals
   - F27-kedja: 3×0.99 kr → ackumulerad VAT = 75 öre (inte 74)

### M-kandidat (ny)

Form-totals extraherad till separat komponent (<EntityTotals lines={...} />).
InvoiceTotals existerar redan. ExpenseForm har inline useMemo — refaktoreras i S66b-prereq
till ExpenseTotals. Bekräftas i S66b → promotion till M-princip.

### Beteendecase

- **transform:** struktur + toOre-precondition + defensiv
- **totals:** per-rad F27 (inkl. fraktionell qty F44) + ackumulerad + grupperad VAT (inkl. 0%)
- **form:** rendering + cascading (inkl. edit-mode initial render-fälla) + lines + validation + save-kontrakt + delete
- **integration:** F27-kedja rad → totaler → save-payload

### Patterns etablerade

- vi.mock av pickers + totals i form-tester (liten IPC-yta)
- Full-integration som egen fil (ej vi.doUnmock i samma fil)
- vi.useFakeTimers({ shouldAdvanceTime: true }) + vi.setSystemTime i beforeEach för cascading
- Parametriserad CustomerPicker-mock (pickerReturn-variabel) för multi-kund-scenarios
- F27-verifiering på tre nivåer: per-rad (totals), ackumulerad (totals), kedja (integration)
- Save-kontrakt testar kontrakt (kanal + anrop), struktur testas i transform-fil
- byKr() helper för NBSP-säker text-matchning av formatKr-output
- InvoiceLineRow-mock renderar "Radera rad" (ej "Ta bort") för att undvika kollision med delete-knapp

### Findings

- **F44** (🟡): `toOre(qty * price_kr)` float-precision off-by-1 vid fraktionell qty.
  B2.4 asserterar faktiskt beteende (14998, inte 14999). Dokumenterad i bug-backlog.md.
- **UX-gap:** Manuell dueDate-override överlever inte kundbyte (ingen dirty-tracking).
  dueDate-input är readOnly — användaren kan inte ändra den manuellt. Inte prioriterat.
- **UX-gap:** 0%-rader exkluderas från vatByRate-gruppering utom när alla rader har 0%.
  Renderar "Moms 0 kr" separat i det fallet. Konsekvent men potentiellt förvirrande.

### Gap

- Full-integration täcker inte IPC→DB (S01 täcker det)
- ExpenseForm har inline useMemo-totals — refaktoreras i S66b
- Finalize-flow (extern från form) — out of scope
- Create-mode save med reellt data i mockad form kräver InvoiceLineRow-onUpdate (testbar i Fil D)

### Testbaslinje: 1363 → 1371 → 1403

---

## Sprint 19 — S66b: ExpenseForm + ExpenseTotals + transform

### Komponenter
- ExpenseForm (419 rader) + ExpenseTotals (ny, 48 rader) + transformExpenseForm
- Test-filer: fyra (transform, ExpenseTotals, ExpenseForm, ExpenseForm.integration)
- Delad util: tests/renderer/utils/format-matchers.ts (byKr() utbruten från S66a)
- M-princip promoted: M129 — form-totals som separerad komponent (se CLAUDE.md sektion 34)

### Beteendeändring
- ExpenseTotals konvergerar till InvoiceTotals-mönstret (per-rad toOre).
- Delta dokumenterat i docs/s66b-characterization.md med go-beslut.
- Max delta 1 öre (VAT) i 2/7 testscenarier.

### Patterns etablerade
- Refaktor-prereq med transformtester i egen commit (revertability)
- Karakteriseringssteg (0.8b) för refaktorer som ändrar produktionsberäkning
- Delad test-util (byKr) med SINGLE SOURCE-kommentar
- data-testid-baserad paritetstest mellan syskonkomponenter (B4.x)
- DST-edge-test för date-arithmetic-funktioner (C6.1)
- Expense heltal-qty i integrationstester (arkitekturkrav M130, inte workaround)
- QueryClient.setQueryData för edit-mode-tester med async draft-hämtning
- vi.hoisted() för pickerState i mock-setup (race condition-säker)

### Findings
- **F42** stängd som dokumenterad designdivergens (M130). Inte en bug.
- **F44** (🟡): Float-precision. B2.4 asserterar faktiskt beteende i båda totals-komponenter.
- **UX-gap:** expenseDate-fält saknar error-rendering (form.errors.expenseDate inte renderad i JSX).

### Gap
- F42 stängd (designdivergens M130, inte bug)
- VAT-gruppering per momssats: framtida feature för ExpenseTotals
- IPC→DB-täckning utanför scope

### Testbaslinje: 1403 → 1413 → 1413 → 1424 → 1449

## Sprint 20 — S67a + S67b: F45 datum-felrendering + F44 Alt B heltalsaritmetik

### S67a (F45): Datum-valideringsfel renderas i UI
- ExpenseForm: error-rendering med role="alert" + aria-describedby + aria-invalid
- InvoiceForm: symmetrisk fix
- +5 tester (2 ExpenseForm C8.2b/C8.2c + 3 InvoiceForm C6.4/C6.4b/C6.4c)
- C8.2 uppdaterad in-place (utökade assertions)

### S67b (F44): Alt B heltalsaritmetik efter empirisk karakterisering
- Reproducerbart script: scripts/characterize-totals.mjs (10M kombinationer)
- Karakteriseringsdokument: docs/s67b-characterization.md
- Zod-refine: invoice quantity ≤2 decimaler (form + IPC schema, defense-in-depth)
- Alt B-formel: Math.round(Math.round(qty * 100) * Math.round(price_kr * 100) / 100)
- Applicerad i: InvoiceTotals, ExpenseTotals, invoice-service.ts processLines
- M131 promoted i CLAUDE.md (sektion 36)
- +10 tester (6 schema, 2 totals canaries, 2 system canaries)

### Scope-utökning under sprint
- F47 (invoice-service.ts) togs in i Sprint 20 efter Steg 0.5b-identifiering.
  Motivering: UI↔bokföring-divergens oacceptabel. Formelbyte trivialt.
- Display-lager (InvoiceLineRow, ExpenseLineRow) lämnade som F47-backlog (lågrisk).
- A11y-inkonsistens dokumenterad som F49 (medel prio) istället för scope-ökning.

### Patterns etablerade
- Karakteriseringsdrivet fix-beslut (empiri före implementation, reproducerbart script)
- Zod-invariant-säkring före formel-byte (separata commits för revertability)
- B2.4 InvoiceTotals som F44-canary (divergens-fall); B2.6 som aritmetik-sanity
- a11y-assertions i form-tester (aria-describedby-koppling)
- System-test canaries som speglar renderer-tester (F47)
- M131: monetär heltalsaritmetik som arkitekturprincip med definierat scope

### Backlog-ändringar
- F44: STÄNGD (Alt B heltalsaritmetik)
- F45: STÄNGD (datum-error-rendering)
- F47: STÄNGD service-lager; display-lager kvarstår (lågrisk)
- F46 (NY): Invoice max-qty UX-guard. Låg prio.
- F48 (NY): IPC-lager-test quantity precision. Låg prio.
- F49 (NY): A11y-konsistens alla formulärfält. Medel prio.

### Testbaslinje: 1449 → 1451 → 1454 → 1460 → 1462 → 1464

---

## Sprint 21 — S68 (F47 display-lager + F48 IPC-precision + M131 grep-check)

### S68a (F47 `InvoiceLineRow`)
Alt B heltalsaritmetik i per-rad-beräkning. `toOre(qty * price_kr)` → `Math.round(Math.round(qty*100) * Math.round(price_kr*100) / 100)`. data-testid + data-value tillagt på netto-cellen.

Tester: 2 per-rad-canaries (B2.4-speglad: qty=1.5×99.99→14999, B2.5-speglad: qty=0.5×64.99→3250) + 1 DOM-rendering-smoke mot InvoiceTotals. Fall B — båda komponenterna använder samma Alt B-formel, så testet fångar render-fel och props-drift men är inte ett M131-konsistensbevis. +3 tester.

### S68b (F47 `ExpenseLineRow`)
Defensiv Alt B. I produktion blockerar `z.number().int()` på alla tre lager (form, IPC, DB) fraktional qty. Alt B appliceras för M131-konsistens och regressionsskydd.

Tester: 1 int-sanity (qty=3×25.50→7650) + 1 Zod-regression-guard (qty=0.5×99.99→5000, kringgår Zod via prop, skiljer deterministiskt Alt B från gamla formeln). +2 tester.

### S68c (F48 IPC-precision)
Decimal-gate på invoice:save-draft + invoice:update-draft. Positiv kontroll inkluderar read-back av qty-värdet.

Tester: qty=1.333 förkastas (create + update) + qty=1.33 accepteras med read-back. +3 tester.

### S68d (M131 grep-check)
`npm run check:m131` — två-lagers-grep (bar `qty * price_kr` utan Math.round + `toOre`/`toKr`-wrapping av multiplikation). Använder `price_kr` (inte `price`) för att undvika false positive på `unit_price_ore` (int × int, M92). Självtest mot historisk F47-brottspunkt verifierat (exit 1 på gammal kod, exit 0 på fixad). 0 tester, CI-hygien.

### Patterns etablerade
- DOM-smoke-tester med explicit Fall A/B-framing för att undvika falskt konsistens-bevis
- Zod-regression-guards som faktiskt skiljer fix från baseline (deterministisk canary)
- Maskinverifierad principefterlevnad via två-lagers-grep med självtest mot historiskt brott

### Backlog-ändringar
- F47: STÄNGD (display-lager fixat, all M131-yta nu konsekvent)
- F48: STÄNGD (IPC-precision-gate verifierad med read-back)
- F46, F49 kvarstår öppna

### Testbaslinje: 1464 → 1467 → 1469 → 1472
