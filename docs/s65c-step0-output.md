# S65c Step 0 Output — CustomerPicker + SupplierPicker

## 0.1 Baseline

- **Baseline-commit**: `2fb0cc0b9a005e156920d69b7d9ec4029f5e93e5`
- **Branch verifierad**: main
- **Testantal före**: 1313 passed (2 skipped)
- **A11y-fix-commit 1**: `006bea2` (aria-label på sök-inputs)
- **A11y-fix-commit 2**: `f619f3d` (aria-label på clear-knappar — axe button-name violation)
- **Infra-fix-commit**: `2ade4b9` (mockIpcError-helper)

## 0.2 Komponent-info

| Komponent | Rader | Memo | forwardRef | Wrap-kedja |
|-----------|-------|------|------------|------------|
| CustomerPicker | 123 (120 före a11y-fixar) | Nej | Nej | N/A |
| SupplierPicker | 211 (205 före a11y-fixar) | Nej | Nej | N/A |

## 0.3 Kollisions-check

Inga befintliga testfiler hittades.

## 0.4 IPC-kanaler, hook-API, testinfra

### IPC-kanaler
- **List**: `counterparty:list` (via `window.api.listCounterparties`)
- **Create**: `counterparty:create` (via `window.api.createCounterparty`)

### Filter-strategi
**IPC-side.** `useCounterparties({ type: 'customer' })` skickar `type` som parameter till IPC.
Fixturer bör vara typade per fil (customers-only, suppliers-only).

### Hook-API
- `useCounterparties` returnerar `useQuery<Counterparty[]>` — exponerar `data`, `isLoading`, `error`, `isError`.
- `useCreateCounterparty` returnerar `useMutation<Counterparty, Error, CreateCounterpartyInput>` — exponerar `mutateAsync`, `isPending`, `isError`, `error`.

### renderWithProviders
Finns i `tests/helpers/render-with-providers.tsx`. Inkluderar:
- `QueryClientProvider` (retry: false, gcTime: 0)
- `FiscalYearProvider` (mockad via IPC)
- `HashRouter`

### Axe
**Default-on.** `renderWithProviders` kör axe-core automatiskt (opt-out via `axeCheck: false`).
Disabled rule: `color-contrast` (jsdom-begränsning).

## 0.5 onChange-signatur

**Identisk.** Båda: `(obj: { id: number; name: string; default_payment_terms: number }) => void`

CustomerPicker prop-namn: `counterparty`, SupplierPicker prop-namn: `supplier` — men signaturen är identisk.

## 0.6 UI-pattern

| Komponent | Typ | Sökfilter | Öppnas/stängs |
|-----------|-----|-----------|---------------|
| CustomerPicker | Custom combobox (text input + `<ul>` dropdown) | Ja, debounced 300ms | Öppnas: focus + typing. Stängs: outside click |
| SupplierPicker | Custom combobox (text input + `<ul>` dropdown) | Ja, debounced 300ms | Öppnas: focus + typing. Stängs: outside click |

**Interaktionsmetod**: `fireEvent.change` på input + `fireEvent.click` på `<button>` i dropdown-listan.
Ej native `<select>`. Inga ARIA roles (combobox/listbox) — ren custom HTML.

## 0.7 Inline-skapa-flöde (SupplierPicker)

- **Trigger**: Knapp "+ Ny leverantör" i dropdown-listan (`setShowInline(true)`)
- **Payload**: `{ name: newName.trim(), type: 'supplier', org_number: newOrgNumber.trim() || null }`
- **Efter lyckad skapande**: **Auto-propagering.** `onChange` anropas automatiskt med `{ id: data.id, name: newName.trim(), default_payment_terms: 30 }`.
  OBS: `default_payment_terms: 30` är hårdkodat, inte från serversvaret.
- **Felhantering**: `catch {}` — error hanteras av global `onError` (react-query). Ingen lokal error-state renderas i komponenten.
- **Scope-check**: Ingen modal, ingen router-navigation. Inline form i dropdown.

## 0.8 Disabled-mönster

**Pattern (a): HTML-attribut.** `disabled` prop landar som `disabled` attribut på `<input>`.
Assertion: `expect(input).toBeDisabled()`.

Dessutom: clear-knappen döljs när `disabled && value` (conditional rendering, ej disabled-attribut).

## 0.9 Value-prop och controlled-mönster

- **Typ**: `{ id: number; name: string } | null`
- **value=null**: Sök-input visas (search combobox)
- **value={id, name}**: Namn visas som `<span>` med clear-knapp (inte input)
- **Stale value**: Ej definierat. Komponenten visar `value.name` direkt utan att matcha mot listan. Stryker stale-value-test.

## 0.10 A11y

- **Före fix**: Inga aria-label, label, htmlFor, role på någon komponent.
- **Fix-commit**: `006bea2` — aria-label på alla inputs (sök + inline-skapa-fält).
- **Axe**: Default-on via renderWithProviders.
- **Kvarstående gap**: Dropdown saknar ARIA combobox/listbox roles. Ej scope för S65c.

## 0.11 Typer

### Counterparty (src/shared/types.ts:115)
```typescript
interface Counterparty {
  id: number
  name: string
  type: 'customer' | 'supplier' | 'both'
  org_number: string | null
  vat_number: string | null
  address_line1: string | null
  postal_code: string | null
  city: string | null
  country: string
  contact_person: string | null
  email: string | null
  phone: string | null
  default_payment_terms: number
  is_active: number
  created_at: string
  updated_at: string
}
```

### Props
- `CustomerPickerProps`: `{ value: { id: number; name: string } | null; onChange: (counterparty: { id: number; name: string; default_payment_terms: number }) => void }`
- `SupplierPickerProps`: `{ value: { id: number; name: string } | null; onChange: (supplier: { id: number; name: string; default_payment_terms: number }) => void; disabled?: boolean }`

### CreateCounterpartyInput (src/shared/types.ts:161)
```typescript
interface CreateCounterpartyInput {
  name: string
  type?: 'customer' | 'supplier' | 'both'
  org_number?: string | null
  // ... optional fields
  default_payment_terms?: number
}
```

## 0.12 M102 (memo/hooks)

**Ej aktiv.** Ingen memo-wrap på någon komponent. Inga memo-tester.

## 0.13 Slutligt testantal

| Komponent | Bas | +memo | +loading | +stale | Summa |
|-----------|-----|-------|----------|--------|-------|
| CustomerPicker | 9 | 0 | 0 | 0 | **9** |
| SupplierPicker | 13 | 0 | 0 | 0 | **13** |
| **Totalt** | | | | | **22** |

Loading: useCounterparties exponerar isLoading via useQuery, men INGEN av
komponenterna destructurar eller renderar loading-state. Inga loading-tester.

### Detaljerade test per komponent

**CustomerPicker (9):**
1. Rendering (3): smoke null, smoke value, customer-type-filter
2. onChange (4): val, annat payment_terms, byte via rerender, ej vid mount/rerender
3. Async (2): empty list + pending IPC graceful degradation

**SupplierPicker (13):**
1. Rendering (3): smoke null, smoke value, supplier-type-filter
2. onChange (4): val, annat payment_terms, byte via rerender, ej vid mount/rerender
3. Async (1): empty list
4. Inline-skapa (4): trigger syns, payload rätt, auto-onChange, fel-case
5. Disabled (1): disabled input

### Slutbaslinje
**1313 + 22 = 1335**
