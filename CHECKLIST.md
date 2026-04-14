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
