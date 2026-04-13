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

## axeCheck (reserverad)

`renderWithProviders` har en `axeCheck`-prop som är no-op i nuläget.
A11y-policy beslutas separat. Propen finns reserverad så att framtida
sessioner kan aktivera a11y-kontroll utan att ändra helperens signatur.

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
