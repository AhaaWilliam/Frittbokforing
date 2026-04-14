# S65a — Steg 0 Output

## Baseline
- Commit: `db0b22e` — Sprint 18 S65-pre
- Branch: `main`
- Testantal före: **1276** (2 skipped)

## 0.2 — ExpenseLineRow verifierad
**Utfall A.** 122 rader, `memo`-wrapping finns (rad 18: `export const ExpenseLineRow = memo(...)`),
inga hooks importerade. Props-driven premiss bekräftad.

## 0.3 — Kollisions-check
Inga befintliga testfiler för ExpenseLineRow.

## 0.4 — renderWithProviders-kontrakt
Fil: `tests/helpers/render-with-providers.tsx`

- **Axe**: default-on (`axeCheck = true`). Opt-out via `axeCheck: false`.
- **Auto-mockar**: `settings:get`, `fiscal-year:list`, `settings:set` — ja, automatiskt via default `fiscalYear`-parameter.
- Ingen fil-scoped setup-helper behövs.

## 0.5 — Rotelement
`<tr>` (rad 30). Testerna **måste** wrappa i `<table><tbody>...</tbody></table>`.

## 0.6 — A11y-preflight
- **Delete-knapp**: `×`-entitet med `title="Ta bort rad"`. Ingen `aria-label`. `title` accepteras som accessible name av axe.
- **Inputs**: Inga `<label>` eller `aria-label`. Förvänta axe-violation (`label` rule).
- **Selects**: Inga `<label>` eller `aria-label`. Samma förväntning.
- **Förväntad axe-violation**: **Ja** — form-element saknar labels. Körs med `axeCheck: false` och dokumenteras som gap. Separat bugg-commit behövs för att lägga till `aria-label` på inputs/selects.

## 0.7 — Parser-logik
- **quantity**: `parseInt(e.target.value, 10) || 1` (rad 66)
  - `"5"` → 5, `"0"` → 1 (falsy fallback), `""` → 1 (NaN → falsy), `"abc"` → 1
- **price**: `parseFloat(e.target.value) || 0` (rad 79)
  - `"99.50"` → 99.5, `"0"` → 0 (falsy → 0, same result), `""` → 0, `"abc"` → 0

Ingen bugg. `|| 1` och `|| 0` ger rimliga fallbacks.

## 0.8 — Edge-case vat_code_id=0
**Utfall E2.** `onUpdate` anropas med `{ vat_code_id: 0 }` utan `vat_rate`-nyckel.

Kodblock (rad 89–96):
```ts
const vcId = parseInt(e.target.value, 10)
const vc = vatCodes.find((v) => v.id === vcId)
onUpdate(index, {
  vat_code_id: vcId,
  ...(vc ? { vat_rate: vc.rate_percent / 100 } : {}),
})
```
vcId=0 → `find` returnerar `undefined` → spread ger `{}` → ingen `vat_rate`.

## 0.9 — Typdefinitioner

### ExpenseLineForm (src/renderer/lib/form-schemas/expense.ts)
```ts
{ temp_id: string, description: string, account_number: string,
  quantity: number, unit_price_kr: number, vat_code_id: number, vat_rate: number }
```

### VatCode (src/shared/types.ts:207)
```ts
{ id: number, code: string, description: string,
  rate_percent: number, vat_type: 'outgoing' | 'incoming' | 'exempt',
  report_box: string | null }
```

### Account (src/shared/types.ts:217)
```ts
{ id: number, account_number: string, name: string, account_type: string,
  is_active: number, k2_allowed: number, k3_only: number, is_system_account: number }
```

### ExpenseLineRowProps (rad 6–13)
```ts
{ line: ExpenseLineForm, index: number, expenseAccounts: Account[],
  vatCodes: VatCode[], onUpdate: (index, Partial<ExpenseLineForm>) => void,
  onRemove: (index: number) => void }
```

## Fixturdelta vs spec
- `ExpenseLineForm` kräver `temp_id: string` — saknades i spec-fixturen.
- `VatCode` har `rate_percent: number` (inte `rate`), plus `vat_type` och `report_box`.
- `Account` har `id`, `account_type`, `is_active`, `k2_allowed`, `k3_only`, `is_system_account`.
- Konto-option-format: `"{account_number} {name}"` (mellanslag, ingen `-`).

## Sammanfattning
- Låst testantal: **16**
- Stoppvillkor-värde: **1292**
- `axeCheck: false` (a11y-gap dokumenterad, separat bugg-commit)

---
Steg 0 klar. Väntar på go.
