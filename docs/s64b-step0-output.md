# S64b — Steg 0 Output

## 1. S64b-baseline-commit-hash

`fec6b74bf2da64dfd8fcf0aaf463ec411ad30a92`

## 2. Testantal före

1235 passed (2 skipped).

## 3. Infra-verifiering (punkt 0.2)

- `axeCheck` i render-with-providers.tsx: 4 förekomster — OK
- `export.*renderWithProviders`: 1 — OK
- `export.*channelMap` i ipc-schemas.ts: 2 — OK (≥1)
- `tests/renderer/components/ui/`: existerar inte — OK (greenfield)

## 4. UseEntityFormReturn-full shape

Fil: `src/renderer/lib/use-entity-form.ts`

```typescript
export interface UseEntityFormReturn<TForm extends Record<string, unknown>> {
  getField: <K extends keyof TForm>(name: K) => TForm[K]
  setField: <K extends keyof TForm>(name: K, value: TForm[K]) => void
  handleSubmit: () => Promise<void>
  isDirty: boolean
  isSubmitting: boolean
  errors: Partial<Record<keyof TForm, string>>
  submitError: string | null
  reset: (data?: Partial<TForm>) => void
}
```

8 fält totalt. Alla måste finnas i TestForm-stubb.

## 5. FormSelect M78-logik

Bekräftad — exakt som analyserat:

- Rad 23: `const isNumeric = typeof options[0]?.value === 'number'`
- Rad 38: `const val = isNumeric ? Number(e.target.value) : e.target.value`

## 6. Ytterligare observationer

**FormField `id`-koppling:** `id={name}` och `htmlFor={name}` använder
raw name-prop, INTE stripLeadingUnderscore. Stripping sker enbart för
`data-testid`. Dvs. för `name="_name"` blir `id="_name"`, inte `id="name"`.
Testet anpassas till faktiskt beteende.

**FormField `required`:** Visuell asterisk `<span className="text-red-500"> *</span>`,
INGEN `aria-required`. Testet verifierar asterisken, inte ARIA-attribut.

## 7. git status

Clean.

---
Steg 0 klar.
