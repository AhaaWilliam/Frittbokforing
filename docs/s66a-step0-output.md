# S66a Steg 0 — Preflight Output

## 0.1 Working tree + baseline + HEAD-gate + branch-gate

- **Working tree:** clean
- **Branch:** main ✓
- **HEAD:** `646e8aff7925e02f0f51b8482ccce526076b4feb` — "Sprint 18 S65d: isolerade tester för ArticlePicker" ✓
- **Testantal:** 1363 passed, 2 skipped ✓

## 0.2 Komponent-radantal

| Fil | Rader |
|-----|-------|
| `src/renderer/components/invoices/InvoiceForm.tsx` | 324 |
| `src/renderer/components/invoices/InvoiceTotals.tsx` | 56 |
| `src/renderer/lib/form-schemas/invoice.ts` | 84 |

- **React.memo / forwardRef:** Ingen av InvoiceForm eller InvoiceTotals använder memo/forwardRef.
  InvoiceLineRow använder `memo` (rad 22).
- **transformInvoiceForm:** exporteras från `src/renderer/lib/form-schemas/invoice.ts:43`

**Avvikelse:** form-schemas ligger under `src/renderer/lib/form-schemas/`, inte `src/renderer/form-schemas/`. Testfil-path justeras till `tests/renderer/lib/form-schemas/invoice.test.ts`.

## 0.3 Kollisions-check

Inga fristående testfiler för InvoiceForm, InvoiceTotals eller transformInvoiceForm. ✓

Befintliga tester i `tests/renderer/components/invoices/`:
- `ArticlePicker.test.tsx`
- `CustomerPicker.test.tsx`
- `InvoiceLineRow.test.tsx`

System-test: `tests/system/S01-invoice-lifecycle.test.ts` (6 tester, täcker draft→finaliserad→betald, mixad moms, delbetalning, gaplös numrering, friform account_number, 0% moms). Ingen överlapp med S66a:s renderer-tester.

## 0.4 IPC-kanaler

Bekräftade kanalnamn:
- `invoice:save-draft` — `window.api.saveDraft`
- `invoice:update-draft` — `window.api.updateDraft`
- `invoice:delete-draft` — `window.api.deleteDraft`
- `invoice:next-number` — `window.api.nextInvoiceNumber`

Picker-IPC (för integration-tester):
- `counterparty:list` — `window.api.listCounterparties`
- `product:list` — `window.api.listProducts`
- `product:get-price-for-customer` — `window.api.getPriceForCustomer`
- `vat-code:list` — `window.api.listVatCodes`

**Gate: ✓** Kanalnamn matchar plan-antaganden.

## 0.5 Cascading state

### handleCustomerChange (rad 137–142)

```typescript
function handleCustomerChange(c: { id: number; name: string; default_payment_terms: number }) {
  form.setField('_customer', { id: c.id, name: c.name })
  const terms = c.default_payment_terms
  form.setField('paymentTerms', terms)
  form.setField('dueDate', addDaysLocal(form.getField('invoiceDate'), terms))
}
```

- Sätter **alltid** paymentTerms + dueDate vid kundbyte, oavsett om de redan var satta.
- **Manuell dueDate-override skrivs alltid över** vid kundbyte (ingen dirty-check på dueDate).
- Om kund A (terms=30) → kund B (terms=15): dueDate = invoiceDate + 15.

### handleDateChange (rad 127–130)

```typescript
function handleDateChange(date: string) {
  form.setField('invoiceDate', date)
  form.setField('dueDate', addDaysLocal(date, form.getField('paymentTerms')))
}
```

- Uppdaterar **alltid** dueDate = invoiceDate + paymentTerms vid datumändring.
- Ingen villkors-check.

### handlePaymentTermsChange (rad 132–135)

```typescript
function handlePaymentTermsChange(terms: number) {
  form.setField('paymentTerms', terms)
  form.setField('dueDate', addDaysLocal(form.getField('invoiceDate'), terms))
}
```

### addDaysLocal (src/shared/date-utils.ts:104)

```typescript
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)  // LOCAL time constructor
  date.setDate(date.getDate() + days)
  // Returns YYYY-MM-DD from local getters
}
```

- **Lokal tidszon via `new Date(y, m-1, d)`** — konstruktorn sätter lokal midnatt.
- **Ingen TZ-risk** med `vi.setSystemTime` — Date-konstruktorn med (y, m, d) args skapar alltid lokal midnatt. `setDate` muterar internt. Inga UTC-getters.

### Edit-mode beteende

Ingen `useEffect` som kör handleCustomerChange eller handleDateChange vid initial render. `buildInitialData` (rad 30–57) sätter alla fält explicit inklusive `dueDate: draft.due_date`. Ingen cascading-risk vid edit-mode — `paymentTerms` och `dueDate` kommer direkt från draftet.

**Gate: ✓** Alla cascading-scenarios är deterministiska. Inga "eller"-assertions.

### Stoppvillkor TZ

`addDaysLocal` använder `new Date(y, m-1, d)` (lokal midnatt) + `date.setDate()` + lokala getters. `vi.setSystemTime` påverkar `Date.now()` men inte det konstruerade Date-objektets tidszonsbeteende. **Ingen TZ-blockering.** ✓

## 0.6 transformInvoiceForm-signatur

```typescript
export function transformInvoiceForm(
  form: InvoiceFormState,
  fiscalYearId: number,
): InvoiceSavePayload
```

- **Returtyp:** `InvoiceSavePayload` (= `z.infer<typeof SaveDraftInputSchema>`)
- **_customer:** `form._customer!.id` → `counterparty_id`. Null-assertion (`!`), kraschar om null.
- **_-prefixade props:** `_customer` strippas implicit (inga fält med `_`-prefix i returtypen).
- **toOre:** `toOre(line.unit_price_kr)` per rad → `unit_price_ore`. `toOre = Math.round(kr * 100)`.
- **quantity:** Bevaras direkt som `line.quantity`, ingen transformation.
- **sort_order:** `i` (loop-index, 0-baserat).
- **account_number:** `line.product_id ? null : (line.account_number || null)`
- **notes:** `form.notes.trim() || null`
- **currency:** Hårdkodat `'SEK'`
- **Datum:** ISO-strings, inga Date-objekt

## 0.7 InvoiceTotals ordagrant

### Props

```typescript
interface InvoiceTotalsProps {
  lines: InvoiceLineForm[]  // KR-värden (unit_price_kr)
}
```

### Per-rad-beräkning

```typescript
const nettoOre = toOre(line.quantity * line.unit_price_kr)
// = Math.round(quantity * unit_price_kr * 100)
const vatOre = Math.round(nettoOre * line.vat_rate)
```

**Ordning:** `Math.round(qty * price_kr * 100)`, inte `qty * Math.round(price_kr * 100)`.

### Fraktionell qty — B2.4 spikad (F44 float-trap)

`toOre(1.5 * 99.99)`: exakt aritmetik ger `149.985 * 100 = 14998.5 → 14999 öre`.
Men IEEE 754: `1.5 * 99.99 = 149.98499999999998522`, `* 100 = 14998.499...` →
`Math.round(14998.499...) = 14998 öre` — **off-by-1 jämfört med exakt aritmetik**.

VAT: `Math.round(14998 * 0.25)` = `Math.round(3749.5)` = **3750 öre**.

**F44:** `toOre(qty * price_kr)` har en float-precision-svaghet. Ordningen
`Math.round(qty * price_kr * 100)` kan ge off-by-1 vid IEEE 754-olycka.
Alternativ ordning `qty * Math.round(price_kr * 100)` = `1.5 * 9999 = 14998.5 →
15000? Nej: 14998.5 → Math.round = 14999` — korrekt. Men den alternativa
ordningen kräver refaktor av InvoiceTotals. Dokumenteras som F44,
fix skjuts till separat sprint. B2.4 asserterar **faktiskt beteende** (14998).

### VAT-gruppering

```typescript
const vatByRate = new Map<number, number>()
for (const la of lineAmounts) {
  if (la.vatRate > 0) {
    vatByRate.set(la.vatRate, (vatByRate.get(la.vatRate) ?? 0) + la.vatOre)
  }
}
```

### 0%-moms — B4.2 spikad

0%-momsrader **exkluderas** från `vatByRate` (`if (la.vatRate > 0)`). Men de bidrar till `totalVat` (via reduce). Om **alla** rader har 0% → `totalVat === 0` → separat "Moms" 0 kr-rad visas (rad 43–48). Om mix av 0% + positiva → 0%-grupp visas INTE (men 0%-radernas VAT = 0 bidrar inte till totalVat). **Korrekt beteende.**

### Render-output

- `Netto` → `formatKr(totalNetto)`
- Per vatRate: `Moms {rate*100}%` → `formatKr(amount)`
- Om totalVat === 0: `Moms` → `formatKr(0)`
- Separator: `border-t pt-1`
- `Att betala` → `formatKr(totalAtt)` (font-semibold)

Inga data-testid. Assertions via **text content** (`getByText`).

## 0.8 Zod-validation

Schema: `InvoiceFormStateSchema` (rad 19–27)

- `_customer`: `z.object({ id, name }).nullable().refine(v => v !== null, 'Välj en kund')`
- `invoiceDate`: `z.string().min(1, 'Välj fakturadatum')`
- `paymentTerms`: `z.number()`
- `dueDate`: `z.string().min(1)`
- `notes`: `z.string()`
- `lines`: `z.array(InvoiceLineFormSchema).min(1, 'Lägg till minst en fakturarad')`

Validation körs vid submit (`handleSubmit` i `useEntityForm` rad 87–133) via `formSchema.safeParse(formData)`. Inte realtime per field. Errors mappas till `errors[fieldName]`.

## 0.9 Props och children

```typescript
interface InvoiceFormProps {
  draft?: InvoiceWithLines
  onSave: () => void
  onCancel: () => void
}
```

Children: `CustomerPicker`, `InvoiceLineRow` (memo-wrapped, renderar ArticlePicker), `InvoiceTotals`.

## 0.10 Delete-flow

```typescript
async function handleDelete() {
  if (!draft) return
  const confirmed = window.confirm('Vill du verkligen ta bort detta utkast?')
  if (!confirmed) return
  await deleteDraft.mutateAsync({ id: draft.id })
  onSave()  // <-- anropar onSave, inte onCancel
}
```

- **Bekräftelsedialog:** `window.confirm(...)` ✓
- **IPC:** `window.api.deleteDraft({ id: draft.id })`
- **Efter delete:** anropar `onSave()` (inte onCancel)
- **Villkor synlighet:** `draft && draft.status === 'draft'` (rad 310)

**Gate: ✓** C8.1 kräver `window.confirm`-mock + verify IPC + verify onSave.

## 0.11 Typer

### InvoiceWithLines
```typescript
export interface InvoiceWithLines extends Invoice {
  lines: InvoiceLine[]
  counterparty_name?: string
}
```

### InvoiceLine
```typescript
export interface InvoiceLine {
  id: number; invoice_id: number; product_id: number | null;
  description: string; quantity: number; unit_price_ore: number;
  vat_code_id: number; line_total_ore: number; vat_amount_ore: number;
  sort_order: number;
}
```

### Invoice (subset)
```typescript
id: number; counterparty_id: number; fiscal_year_id: number | null;
invoice_type: string; invoice_number: string; invoice_date: string;
due_date: string; status: string; net_amount_ore: number;
vat_amount_ore: number; total_amount_ore: number; currency: string;
paid_amount_ore: number; journal_entry_id: number | null;
ocr_number: string | null; notes: string | null; payment_terms: number;
version: number; created_at: string; updated_at: string;
```

### Counterparty
```typescript
id: number; name: string; type: 'customer' | 'supplier' | 'both';
org_number: string | null; ... ; default_payment_terms: number;
is_active: number; created_at: string; updated_at: string;
```

### SaveDraftInput (= InvoiceSavePayload)
```typescript
counterparty_id: number; fiscal_year_id: number;
invoice_date: string; due_date: string;
payment_terms?: number; notes?: string | null;
currency?: string;
lines: { product_id: number | null; description: string;
  quantity: number; unit_price_ore: number;
  vat_code_id: number; sort_order: number;
  account_number?: string | null; }[]
```

### CustomerPicker onChange type
```typescript
(counterparty: { id: number; name: string; default_payment_terms: number }) => void
```

Fixturer ska använda befintliga `makeCounterparty` + `customerFixtures` från `tests/renderer/components/__fixtures__/counterparties.ts` istället för att skapa nya.

## 0.12 S01/E02-täckning

`tests/system/S01-invoice-lifecycle.test.ts` — 6 tester:
- S01-01: draft→finaliserad→betald, subsystem-genomslag
- S01-02: mixad moms (25%+12%), kontering
- S01-03: delbetalning→partial→slutbetalning
- S01-07: gaplös fakturanumrering efter draft-deletion
- S01-08: friform account_number
- S01-09: 0% moms (momsfri)

Ingen E02. S01 täcker **service-lager** (IPC→DB), inte renderer. Fil D:s integration-tester kompletterar med renderer→form→submit, ingen redundans.

## 0.13 M-kandidat

**M-kandidat (S66a):** Form-totals som använder F27-kritisk aritmetik ska extraheras till egen komponent (`<EntityTotals lines={...} />`). InvoiceTotals existerar redan som separat komponent (56 rader). ExpenseForm har inline useMemo — refaktoreras i S66b-prereq till ExpenseTotals-komponent. Detta ger:
- (a) isolerad F27-yta för riktade tester
- (b) mockning i form-tester för liten IPC-yta
- (c) symmetrisk testpyramid mellan invoices och expenses

Bekräftas i S66b. Promotion till M-princip sker då.

## 0.14 Slutligt testantal

### Fil A: `tests/renderer/lib/form-schemas/invoice.test.ts` (prereq)
| Grupp | Antal |
|-------|-------|
| A1: Struktur | 3 |
| A2: toOre-precondition | 3 |
| A3: Defensiv | 2 |
| **Delsumma A** | **8** |

### Fil B: `tests/renderer/components/invoices/InvoiceTotals.test.tsx`
| Grupp | Antal |
|-------|-------|
| B1: Rendering | 3 |
| B2: Per-rad F27 | 4 |
| B3: Ackumulerad F27 | 2 |
| B4: Grupperad VAT | 2 |
| **Delsumma B** | **11** |

### Fil C: `tests/renderer/components/invoices/InvoiceForm.test.tsx`
| Grupp | Antal |
|-------|-------|
| C1: Rendering | 2 |
| C2: Cascading customer→terms+dueDate | 3 |
| C3: Cascading datum→dueDate | 2 |
| C4: Edit-mode initial render | 1 |
| C5: Line-hantering | 3 |
| C6: Validation | 3 |
| C7: Save-kontrakt | 2 |
| C8: Delete-flow | 3 |
| **Delsumma C** | **19** |

### Fil D: `tests/renderer/components/invoices/InvoiceForm.integration.test.tsx`
| Grupp | Antal |
|-------|-------|
| D1: Full-integration | 2 |
| **Delsumma D** | **2** |

**Totalt: 40** (på tröskeln, ≤40 acceptabelt) ✓

### Delning (Alt A)

1. **Prereq-commit:** Fil A (8 tester) → 1363 + 8 = **1371**
2. **S66a-1-commit:** Fil B + C + D (32 tester) → 1371 + 32 = **1403**

### Fixtur-beslut

Plan nämnde ny `__fixtures__/customers.ts`. Befintliga `counterparties.ts` har redan `customerFixtures` med:
- `customerFixtures[0]`: id=1, "Acme AB", terms=30
- `customerFixtures[1]`: id=2, "Beta Corp", terms=15

**Beslut:** Återanvänd befintlig `counterparties.ts`. Ingen ny `customers.ts`.

### IPC-kanaler för Fil D (integration)

Enumererad lista (ingen "etc"):
- `counterparty:list` — returnerar `customerFixtures`
- `product:list` — returnerar produktlista
- `product:get-price-for-customer` — returnerar prislista (ArticlePicker anropar)
- `vat-code:list` — returnerar VatCode[]
- `invoice:save-draft` — returnerar `{ success: true, data: mockInvoiceWithLines }`
- `invoice:next-number` — returnerar `{ preview: 1001 }`
- `fiscal-year:list` — via renderWithProviders
- `settings:get` / `settings:set` — via renderWithProviders
