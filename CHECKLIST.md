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
