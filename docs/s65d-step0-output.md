# S65d Step 0 Output — ArticlePicker

## 0.1 Baseline

- **Baseline-commit (S65c)**: `ee87955c9a99908a0d0b5c2ba014a9e86b7df30d`
- **Branch verifierad**: main
- **Testantal vid start**: 1335
- **A11y-fix-commit**: `c10b460` (aria-label på sök-input)
- **toKr/toOre-test-commit**: `6d8edb3` (10 tester, prerequisite för Grupp 5)
- **Testantal efter prereqs**: 1345
- **Aktuell HEAD**: `6d8edb3`

## 0.2 Komponent-info

| Egenskap | Värde |
|----------|-------|
| Rader | 145 (144 före a11y-fix) |
| Memo | Nej |
| forwardRef | Nej |

## 0.3 Kollision-check

Inga fristående testfiler. Enda referens: `vi.mock` i InvoiceLineRow.test.tsx (S65b).

## 0.4 IPC-kanaler, hook-API, error-strategi

- **List-kanal**: `product:list` (via `window.api.listProducts`)
- **Kundpris-kanal**: `product:get-price-for-customer` (via `window.api.getPriceForCustomer`)
- **useProducts-args**: `{ search: debouncedSearch, active_only: true }`
- **Debounce**: I komponenten (setTimeout 300ms), inte i hook
- **PriceResult**: `{ price_ore: number, source: 'customer' | 'default' }`

### Error-strategi i handleSelect (rad 81-105)
```
try/catch: vid counterpartyId truthy → try { getPriceForCustomer } catch { fallback }
Fallback: product.default_price_ore (deklarerad på rad 82, aldrig reassignad i catch)
Utan counterpartyId: IPC-anropet hoppas över helt
```

## 0.5 onSelect-signatur + description-fallback

**Bekräftad ordagrant (rad 97)**: `description: product.description ?? product.name`

Payload:
```typescript
{
  product_id: number
  description: string        // product.description ?? product.name
  unit_price_kr: number      // toKr(priceOre)
  vat_code_id: number
  vat_rate: 0                // hårdkodad
  unit: string
}
```

## 0.6 toKr-implementation

```typescript
export function toKr(ore: number): number {
  return ore / 100
}
```

- **Returtyp**: number
- **Avrundning**: Ingen (ren division)
- **Float-risk**: Teoretisk för icke-100-delbara (0.99 representeras som närmaste double)
- **Direkta enhetstester**: Ja, 10 st (commit `6d8edb3`). Täcker 0, 1, 99, 12345, 125000 öre.

## 0.7 UI-pattern

- **Custom combobox**: text input + `<ul>` dropdown
- **Debounce**: 300ms i komponenten (setTimeout)
- **Portal**: Nej
- **Keyboard handlers**: Inga (a11y-gap, dokumenteras i CHECKLIST)
- **Outside-click**: mousedown listener på document

## 0.8 Kundpris-flödeslogik

```
1. let priceOre = product.default_price_ore
2. if (counterpartyId) {
3.   try {
4.     const result = await window.api.getPriceForCustomer({
5.       product_id: product.id,
6.       counterparty_id: counterpartyId,
7.     })
8.     priceOre = result.price_ore
9.   } catch {
10.    // fallback to default_price_ore (priceOre oförändrad)
11.  }
12. }
13. onSelect({ ..., unit_price_kr: toKr(priceOre), ... })
```

- Villkor: `if (counterpartyId)` — truthy check (null, 0, undefined hoppar över)
- Vid source='customer': `result.price_ore` används (rad 89)
- Vid source='default': `result.price_ore` används (SAMMA kodstig — source ignoreras)
- Vid IPC-fel: `priceOre` kvarstår som `product.default_price_ore` (rad 82)
- Utan counterpartyId: IPC-anropet hoppas helt → `product.default_price_ore`

## 0.9 Props

```typescript
interface ArticlePickerProps {
  counterpartyId: number | null
  onSelect: (product: { ... }) => void
  testId?: string
}
```

Ingen value, ingen disabled, ingen autoFocus.

## 0.10 A11y

- **Fix-commit**: `c10b460` — aria-label="Sök artikel" på sök-input
- **Axe**: Default-on via renderWithProviders
- **Gap**: Dropdown saknar ARIA combobox/listbox roles, ingen keyboard-nav

## 0.11 Product-typ

```typescript
interface Product {
  id: number
  name: string
  description: string | null
  unit: 'timme' | 'styck' | 'dag' | 'månad' | 'km' | 'pauschal'
  default_price_ore: number
  vat_code_id: number
  account_id: number          // int FK, ej propagerad via onSelect
  article_type: 'service' | 'goods' | 'expense'
  is_active: number
  created_at: string
  updated_at: string
}

interface PriceResult {
  price_ore: number
  source: 'customer' | 'default'
}
```

## 0.12 formatKr + typeBadge

- `formatKr(ore)`: `Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK' }).format(toKr(ore))`
- `typeBadge`: maps article_type → badge (Tjänst/Vara/Utlägg)
- Ej testade direkt (visuell, out of scope)

## 0.13 M-principer

Ingen ny M-princip. F27-regel via M91/M92. Ingen memo → ingen M102.

## 0.14 Slutligt testantal

| Grupp | Antal |
|-------|-------|
| 1. Rendering | 3 |
| 2. Sök + filter | 2 |
| 3. Val utan counterparty | 3 |
| 4. Val med counterparty | 4 |
| 5. F27-klass toKr | 4 |
| 6. Empty | 1 |
| 7. Re-val | 1 |
| **Totalt** | **18** |

### Slutbaslinje
**1345 + 18 = 1363**
