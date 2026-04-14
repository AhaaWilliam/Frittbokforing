# S65b — Steg 0 Output

## Baseline
- **Commit (före a11y-fix):** `1d3d307063cbadfa280d10fdd77f620ebbf8d73a` (docs: lyft setupMockIpc()-krav)
- **A11y-fix-commit:** `4edce88` (fix(a11y): aria-label på InvoiceLineRow)
- **Testantal före:** 1292

## 0.2 — Komponent
- **Rader:** 158 (efter a11y-fix, var 152 före)
- **Memo-wrap:** `export const InvoiceLineRow = memo(function InvoiceLineRow({` (rad 22)
- **forwardRef:** Nej
- **Memo-assertion:** `(InvoiceLineRow as any).$$typeof === Symbol.for('react.memo')`

## 0.3 — Kollision
Inga befintliga testfiler.

## 0.4 — Datakälla
**Blandat (övervägande props):**
- Props: `line`, `index`, `counterpartyId`, `onUpdate`, `onRemove`
- Hook: `useVatCodes('outgoing')` → IPC-kanal `vat-code:list`
- Inga products/accounts/salesAccounts-props

**Beslut:** `setupMockIpc()` + `mockIpcResponse('vat-code:list', defaultVatCodes)` i beforeEach.
VatCodes-hooken returnerar data via `useDirectQuery` (React Query) som INTE unwrappar
IpcResult — kanalen returnerar arrayen direkt.

## 0.5 — ArticlePicker
- **Import:** `import { ArticlePicker } from './ArticlePicker'`
- **Props:** `counterpartyId`, `onSelect={handleArticleSelect}`, `testId`
- **onSelect-kontrakt:** ETT `onUpdate`-anrop med full payload:
  `{ product_id, account_number: null, description, unit_price_kr, vat_code_id, vat_rate, unit }`
- **vat_rate-resolve:** `vatCodes?.find(v => v.id === product.vat_code_id)` → `vc.rate_percent / 100`,
  fallback till `product.vat_rate`
- **Andra kopplingar:** Inga (ingen useRef, context, imperative handle)
- **VIKTIGT:** ArticlePicker renderas ALLTID (både produkt- och friformsrader).
  Forken gäller enbart konto-inputen.

## 0.6 — Fork-logik
- **Diskriminant:** `line.product_id === null` (rad 74) → visar konto-textinput
- **useEffect:** INGA useEffect-hooks i komponenten
- **Konsekvens:** Rerender med ändrad product_id triggar INGA extra onUpdate-anrop

## 0.7 — Parser
- **quantity:** `parseFloat(e.target.value) || 0` (rad 101)
- **price:** `parseFloat(e.target.value) || 0` (rad 113)
- **Jämförelse med S65a:** AVVIKANDE — S65a använder `parseInt(v,10)||1` för quantity
  och `parseFloat(v)||0` för price. InvoiceLineRow använder parseFloat||0 för båda.
  Ingen "0"→1-bugg. Istället: "0"→0-fallback via ||0.

## 0.8 — Avrundning och total
- **Formel:** `lineNettoOre = toOre(line.quantity * line.unit_price_kr)`
- **toOre:** `Math.round(kr * 100)` (src/renderer/lib/format.ts:2)
- **Display:** `formatKr(lineNettoOre)` — `Intl.NumberFormat('sv-SE', { style: 'currency', currency: 'SEK', minimumFractionDigits: 0, maximumFractionDigits: 2 })`
- **Total är NETTO (utan moms)** — ingen moms i totalberäkningen
- **Ingen /100-division** — F27-riskyta existerar inte i denna komponent
- **Avrundningsregel:** Math.round (via toOre)

### F27-testvärden (NETTO, Math.round)
| Test | unit_price_kr | quantity | beräkning | lineNettoOre | formatKr |
|------|---------------|----------|-----------|-------------|----------|
| 4.1  | 950           | 2        | round(2×950×100) | 190000 | 1 900 kr |
| 4.2  | 9999.99       | 1        | round(1×9999.99×100) | 999999 | 9 999,99 kr |
| 4.3  | 0.01          | 1        | round(1×0.01×100) | 1 | 0,01 kr |

## 0.9 — Edge vat_code_id=0
Ingen explicit vat_code_id=0-hantering. VAT_OPTIONS har `{ label: 'Momsfritt', rate: 0 }`.
`handleVatChange` matchar via `Math.abs(v.rate_percent / 100 - rate) < 0.001`.
Vid rate=0 och vatCodes med rate_percent=0: matchar → sätter vat_code_id.
Vid rate=0 utan matchande vatCode: sätter bara `{ vat_rate: 0 }`, ingen vat_code_id.

**Utfall E1:** Ingen krash. Saknad match → updates utan vat_code_id-fält.

## 0.10 — A11y
- **Före fix:** Inga aria-labels, inga labels, inga htmlFor
- **Fix-commit:** `4edce88` — aria-label på Beskrivning, Konto, Antal, Pris, Moms, Ta bort rad
- **Baseline efter fix:** 158 rader, 1292 tester passerar

## 0.11 — Typer
```typescript
// src/renderer/lib/form-schemas/invoice.ts
type InvoiceLineForm = {
  temp_id: string
  product_id: number | null
  description: string
  quantity: number
  unit_price_kr: number       // KR, inte öre!
  vat_code_id: number
  vat_rate: number             // Decimal: 0.25, 0.12, 0.06, 0
  unit: string
  account_number: string | null
}

// Props (InvoiceLineRowProps — lokal interface i komponenten)
interface InvoiceLineRowProps {
  line: InvoiceLineForm
  index: number
  counterpartyId: number | null
  onUpdate: (index: number, updates: Partial<InvoiceLineForm>) => void
  onRemove: (index: number) => void
}

// ArticlePicker onSelect payload (INTE Product-typen)
{
  product_id: number
  description: string
  unit_price_kr: number
  vat_code_id: number
  vat_rate: number
  unit: string
}
```

## 0.12 — M102/M123
M102 (memo-kontrakt) och M123 (fork produkt/friform) finns dokumenterade i CLAUDE.md.
Notion-verifiering skippas — CLAUDE.md är codebase-kanonisk källa.
**Alternativ 2:** Inga icke-kanoniska M-referenser i commit.

**OBS:** M123 beskriver fork-principen som "account_number NULL for produktrader".
Den verkliga forken i InvoiceLineRow är smalare än den mentala modellen:
ArticlePicker renderas ALLTID (båda grenarna), bara konto-inputen styrs av
`product_id === null`. Notion/CLAUDE.md bör uppdateras så M123 matchar
verkligheten — annars skrivs S65d mot felaktig mental model.

## 0.13 — Test 1.4 (read-only produkt-info)
Komponenten visar INGEN read-only produktinformation. Beskrivning är alltid redigerbar.
ArticlePicker visas alltid. Ingen article_number-label.
**Beslut:** Test 1.4 → "produktrad renderar INTE konto-input" (verifierar fork-grenen).

## 0.14 — Test 2.3 (price på produktrad)
Price-input är ALLTID redigerbar. Ingen disabled/readOnly.
**Beslut:** Test 2.3 = standard ändringstest: fireEvent.change price, verifiera onUpdate.

## 0.15 — Test 6.4 (stale product_id)
Komponenten slår INTE upp product_id i någon lista. product_id är bara data på raden.
Vid line.product_id=999: `line.product_id === null` → false → konto-input dold.
Allt annat renderas normalt. Ingen error-state.
**Assertion:** Konto-input saknas, description/quantity/price renderas, ingen krash.

## Låst testantal
- **Antal tester:** 21
- **Stoppvillkor:** 1292 + 21 = 1313
