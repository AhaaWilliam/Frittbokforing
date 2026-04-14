# S65-pre: Audit av picker- och radkomponenter

Baseline: 5d49929 (1276 tester)
Auditdatum: 2026-04-14

## Sammanfattning

- Antal komponenter: 5
- Grupperingsbeslut: CustomerPicker + SupplierPicker: **separata** (olika struktur) / InvoiceLineRow + ExpenseLineRow: **separata** (olika beroenden och beräkningsmodeller)
- Föreslagen sessionsuppdelning: S65a: ExpenseLineRow, S65b: InvoiceLineRow, S65c: CustomerPicker + SupplierPicker, S65d: ArticlePicker
- Uppskattat totalt testantal: ~48
- Blockerande findings: inga

## ExpenseLineRow

### Fil
`src/renderer/components/expenses/ExpenseLineRow.tsx` (122 rader)

### Kontrakt (publika props + callbacks)
- `line: ExpenseLineForm` — raddata (description, account_number, quantity, unit_price_kr, vat_code_id, vat_rate)
- `index: number` — radindex, skickas tillbaka i callbacks
- `expenseAccounts: Account[]` — lista av konton för select
- `vatCodes: VatCode[]` — lista av momskoder för select
- `onUpdate: (index: number, updates: Partial<ExpenseLineForm>) => void` — partiell uppdatering
- `onRemove: (index: number) => void` — ta bort rad

### Internt tillstånd
- Inget useState/useReducer/useRef.
- Två lokala beräkningar (ej state):
  - `lineTotal = line.quantity * line.unit_price_kr` (rad 26)
  - `lineVat = lineTotal * line.vat_rate` (rad 27)

### Direkta beroenden
- **Hooks:** Inga.
- **Contexts:** Inga.
- **Utilities:** `formatKr`, `toOre` från `../../lib/format`
- **Wrapping:** `React.memo` (M102)

### M-principer som komponenten implementerar eller beror på
- **M102:** `React.memo`-wrappning (rad 18). Shallow comparison av props skipprar re-render för orörda rader.
- **M15 (quantity × unit_price_ore):** Beräkningen sker i renderer som `quantity * unit_price_kr` (kronor), konverteras till öre via `toOre()` enbart för visning med `formatKr()`. Main process gör den verkliga beräkningen i öre. Renderer visar preview.
- **M5 (main process = source of truth för moms):** Moms-preview beräknas som `lineTotal * line.vat_rate`. Enbart för UI-visning.
- **M117 (data-testid-schema):** 5 testid: `expense-line-${index}-description`, `-account`, `-quantity`, `-price`, `-vat`.

### Kända bugg-mönster (från tidigare F-findings)
- **F35:** `quantity` input har `min={0}` (rad 64) — tillåter quantity=0 i UI. Backend-Zod fångar det. Känd finding, låg prio, inte fixad. **Regression-risk: ingen, men invariant att testa.**
- **F27-analog:** expense_service hade `/100`-division, fixad. Renderer-sidan har aldrig haft den buggen men beräkningslogiken `quantity * unit_price_kr` ska verifieras i test som korrelat.

### Identifierade beteende-invarianter (test-kandidater)

**Grupp 1: Rendering och display**
1. Renderar alla 6 fält (description, account, quantity, price, vat, total) — given en line med data
2. Visar korrekt formaterad totalsumma inkl moms via `formatKr(toOre(lineTotal + lineVat))`
3. Visar kontonamn + nummer i select-optioner
4. Visar momskod-description + procent i moms-select

**Grupp 2: Callback-propagering**
5. `onUpdate(index, { description })` vid description-ändring
6. `onUpdate(index, { account_number })` vid konto-val
7. `onUpdate(index, { quantity })` vid quantity-ändring — parseInt, fallback 1
8. `onUpdate(index, { unit_price_kr })` vid pris-ändring — parseFloat, fallback 0
9. `onUpdate(index, { vat_code_id, vat_rate })` vid moms-val — rate resolvas från vatCodes-prop
10. `onRemove(index)` vid ta-bort-klick

**Grupp 3: Beräkning**
11. lineTotal = quantity × unit_price_kr (heltal × decimaltal)
12. lineVat = lineTotal × vat_rate
13. Visat belopp = formatKr(toOre(lineTotal + lineVat)) — öre-konvertering korrekt
14. quantity=0 ger totalsumma 0 (F35-korrelat)
15. Negativa värden — beteende vid negativ quantity eller price

**Grupp 4: Memo**
16. Re-render skippas vid oförändrade props (React.memo shallow compare)

### Förgreningar att täcka
- Konto-select: tom account_number vs valt konto
- Moms-select: standardval (välj moms...) vs vald momskod
- quantity parseInt fallback (tom input → 1)
- unit_price_kr parseFloat fallback (tom input → 0)
- Moms-resolve: vald vatCode hittas vs hittas inte

### Uppskattat testantal
16 tester, fördelat i 4 grupper.

### Testbarhet: isolerad vs via renderWithProviders
**Ren `render()` utan wrapper.** Komponenten har inga hooks, inga contexts. Props-driven. Behöver bara `@testing-library/react` render + userEvent. Inget QueryClient, inget mock-IPC. Den enklaste av alla 5 komponenter att testa.

### Flaggor
Inga flaggor.

---

## InvoiceLineRow

### Fil
`src/renderer/components/invoices/InvoiceLineRow.tsx` (152 rader)

### Kontrakt (publika props + callbacks)
- `line: InvoiceLineForm` — raddata (temp_id, product_id, description, quantity, unit_price_kr, vat_code_id, vat_rate, unit, account_number)
- `index: number` — radindex
- `counterpartyId: number | null` — kund-id, skickas vidare till ArticlePicker
- `onUpdate: (index: number, updates: Partial<InvoiceLineForm>) => void` — partiell uppdatering
- `onRemove: (index: number) => void` — ta bort rad

### Internt tillstånd
- Inget useState/useReducer/useRef.
- Hook: `useVatCodes('outgoing')` (rad 29) — hämtar momskoder via QueryClient
- Lokal beräkning: `lineNettoOre = toOre(line.quantity * line.unit_price_kr)` (rad 63)
- Modul-konstant: `VAT_OPTIONS` (rad 15–20) — statisk array av 4 momssatser (25%, 12%, 6%, momsfritt)

### Direkta beroenden
- **Hooks:** `useVatCodes('outgoing')` → QueryClient
- **Contexts:** Inga direkt (useVatCodes behöver QueryClientProvider)
- **Utilities:** `formatKr`, `toOre` från `../../lib/format`
- **Barnkomponent:** `ArticlePicker` (renderas som child, rad 69–73)
- **Wrapping:** `React.memo` (M102)

### M-principer som komponenten implementerar eller beror på
- **M102:** `React.memo`-wrappning (rad 22). Shallow comparison.
- **M123 (account_number NULL by design):** `handleArticleSelect` sätter `account_number: null` vid produktval (rad 42). Konto-fältet visas BARA när `line.product_id === null` (rad 74) — friform-rader.
- **M15 (quantity × unit_price_ore):** Beräkning i renderer som `toOre(line.quantity * line.unit_price_kr)`. Preview.
- **M5 (main process = source of truth för moms):** VAT-val går via `VAT_OPTIONS` (statiska rates) + `useVatCodes`-resolve för vat_code_id. Renderer sätter `vat_rate` + `vat_code_id` i onUpdate.
- **M117 (data-testid-schema):** 5 testid: `invoice-line-${index}-account`, `-description`, `-quantity`, `-price`, `-vat`. Plus `testId` prop till ArticlePicker.

### Kända bugg-mönster (från tidigare F-findings)
- **F27:** Expense-sidan hade `/100`-division i service. InvoiceLineRow berörs inte direkt, men `toOre(quantity * unit_price_kr)`-beräkningen är den renderer-sida korrelaten. Regression-risk: om `toOre` ändras.
- **F22:** Callbacks i InvoiceForm (addLine/removeLine/updateLine) var inte memoizerade, fixad i S46. InvoiceLineRow är `memo`-wrappat som konsument av dessa callbacks. Test ska verifiera att memo fungerar korrekt.

### Identifierade beteende-invarianter (test-kandidater)

**Grupp 1: Rendering och forking (M123)**
1. Produktrad (`product_id !== null`): konto-fältet döljs
2. Friformsrad (`product_id === null`): konto-fältet visas
3. Konto-fältet har value = `line.account_number ?? ''`
4. ArticlePicker renderas alltid (även för produktrader — tillåter byte)

**Grupp 2: Callback-propagering**
5. `onUpdate(index, { description })` vid description-ändring
6. `onUpdate(index, { account_number: value || null })` vid konto-ändring — tomt → null
7. `onUpdate(index, { quantity })` vid quantity-ändring — parseFloat, fallback 0
8. `onUpdate(index, { unit_price_kr })` vid pris-ändring — parseFloat, fallback 0
9. `onRemove(index)` vid ta-bort-klick

**Grupp 3: Artikelval (handleArticleSelect)**
10. Vid artikelval: product_id sätts, account_number → null (M123)
11. Vid artikelval: description, unit_price_kr, unit, vat_code_id sätts från product
12. Vid artikelval: vat_rate resolvas via vatCodes (vc.rate_percent / 100), fallback product.vat_rate

**Grupp 4: Momsval (handleVatChange)**
13. Momsval: vat_rate sätts till parseFloat(e.target.value)
14. Momsval: vat_code_id resolvas via vatCodes (Math.abs tolerans 0.001)
15. Momsval: om ingen matchande vatCode → bara vat_rate uppdateras, ej vat_code_id

**Grupp 5: Beräkning och visning**
16. lineNettoOre = toOre(quantity × unit_price_kr)
17. formatKr(lineNettoOre) visas i totalsumma-cell
18. VAT_OPTIONS renderas som 4 option-element (25%, 12%, 6%, Momsfritt)

**Grupp 6: Memo**
19. Re-render skippas vid oförändrade props

### Förgreningar att täcka
- product_id null vs non-null (M123 forking)
- account_number: tom sträng → null-konvertering
- vatCode-resolve: match hittas vs miss
- ArticlePicker onSelect → handleArticleSelect med vatCode-resolve
- quantity parseFloat: "abc" → 0, "2.5" → 2.5

### Uppskattat testantal
19 tester, fördelat i 6 grupper.

### Testbarhet: isolerad vs via renderWithProviders
**renderWithProviders krävs**, men med ArticlePicker stubbad. Motivering:
- `useVatCodes('outgoing')` kräver QueryClientProvider + mock-IPC.
- ArticlePicker ska **stubbas som mock-komponent** i InvoiceLineRow-tester. Skäl: ArticlePicker har egen async logik (window.api.getPriceForCustomer), egna hooks (useProducts), och testas separat i S65d. Att rendera den riktigt här ger dubbel beroende-kedja utan ny täckning av InvoiceLineRow-specifik logik. Stubb: `vi.mock('./ArticlePicker', () => ({ ArticlePicker: (props) => <button data-testid={props.testId} onClick={() => props.onSelect(mockProduct)}>stub</button> }))`.
- Mock-IPC: `mockIpcResponse('vat-code:list', vatCodesFixture)` räcker.

### Flaggor
- **ArticlePicker-transitivitet:** Stubb-beslut taget. ArticlePicker testas separat i S65d.

---

## CustomerPicker

### Fil
`src/renderer/components/invoices/CustomerPicker.tsx` (120 rader)

### Kontrakt (publika props + callbacks)
- `value: { id: number; name: string } | null` — vald kund, eller null (sökläge)
- `onChange: (counterparty: { id: number; name: string; default_payment_terms: number }) => void` — val av kund

### Internt tillstånd
- `search: string` (useState) — sökinput
- `debouncedSearch: string` (useState) — debounced söksträng (300ms)
- `open: boolean` (useState) — dropdown synlig
- `timerRef: ReturnType<typeof setTimeout> | null` (useRef) — debounce-timer
- `containerRef: HTMLDivElement | null` (useRef) — click-outside detection

### Direkta beroenden
- **Hooks:** `useCounterparties({ search, type: 'customer', active_only: true })` → QueryClient
- **Contexts:** Inga direkt
- **Utilities:** Inga
- **useEffect #1:** Debounce (search → debouncedSearch, 300ms delay)
- **useEffect #2:** Click-outside listener (mousedown → setOpen(false))

### M-principer som komponenten implementerar eller beror på
- **M117:** Inga data-testid. Förlitar sig på semantisk markup (input, button, li).

### Kända bugg-mönster (från tidigare F-findings)
- **F8 (LIKE-patterns):** useCounterparties skickar search-strängen till backend via IPC → `listCounterparties` → SQL LIKE. Specialtecken (`%`, `_`) escapas inte. Relevant men backend-sida, inte komponent-bugg. Noteras som edge-case i test.

### Identifierade beteende-invarianter (test-kandidater)

**Grupp 1: Visningsläge (value !== null)**
1. Visar kundens namn som text
2. Visar rensa-knapp (×)
3. Döljer sökinput
4. handleClear: nollställer search + debouncedSearch, anropar INTE onChange

**Grupp 2: Sökläge (value === null)**
5. Visar sökinput med placeholder "Sök kund..."
6. Input onChange → setSearch + setOpen(true)
7. onFocus → setOpen(true)

**Grupp 3: Debounce**
8. Sökning debouncar 300ms (search → debouncedSearch)
9. Timer rensas vid ny input (cancel föregående)
10. Timer rensas vid unmount (cleanup)

**Grupp 4: Dropdown**
11. Dropdown synlig när open=true OCH customers.length > 0
12. Varje kund visar namn + org_number (om finns)
13. Klick på kund → onChange med { id, name, default_payment_terms }, search nollställs, dropdown stängs

**Grupp 5: Click-outside**
14. Klick utanför container → setOpen(false)
15. Klick inuti container → dropdown förblir öppen

### Förgreningar att täcka
- value: null vs objekt (två helt skilda renders)
- handleClear: nollställer search men anropar inte onChange
- Dropdown: tom customers → döljs
- Kundrad: med vs utan org_number

### Uppskattat testantal
15 tester, fördelat i 5 grupper. Debounce-tester kräver `vi.useFakeTimers()`.

### Testbarhet: isolerad vs via renderWithProviders
**renderWithProviders** behövs för `useCounterparties` (QueryClient + mock-IPC). Mock: `mockIpcResponse('counterparty:list', customersFixture)`.

### Flaggor
Inga flaggor.

---

## SupplierPicker

### Fil
`src/renderer/components/expenses/SupplierPicker.tsx` (205 rader)

### Kontrakt (publika props + callbacks)
- `value: { id: number; name: string } | null` — vald leverantör
- `onChange: (supplier: { id: number; name: string; default_payment_terms: number }) => void` — val av leverantör
- `disabled?: boolean` — inaktiverar input och döljer rensa-knapp

### Internt tillstånd
- `search: string` (useState) — sökinput
- `debouncedSearch: string` (useState) — debounced söksträng (300ms)
- `open: boolean` (useState) — dropdown synlig
- `showInline: boolean` (useState) — inline create-formulär synligt
- `newName: string` (useState) — namn i create-formuläret
- `newOrgNumber: string` (useState) — org.nr i create-formuläret
- `timerRef` (useRef) — debounce-timer
- `containerRef` (useRef) — click-outside

### Direkta beroenden
- **Hooks:** `useCounterparties({ search, type: 'supplier', active_only: true })` → QueryClient
- **Hooks:** `useCreateCounterparty()` → QueryClient + mutation
- **Contexts:** Inga direkt
- **Utilities:** Inga
- **useEffect #1:** Debounce (300ms)
- **useEffect #2:** Click-outside

### M-principer som komponenten implementerar eller beror på
- **M117:** Inga data-testid. Semantisk markup.
- **M100-analog:** Inline create hanterar fel via try/catch med empty catch (rad 76–78), kommentar: "Error handled by global onError". Mutation-error propageras till React Query global handler.

### Kända bugg-mönster (från tidigare F-findings)
- **F8 (LIKE-patterns):** Samma som CustomerPicker — backend-sida.
- Inline create: `default_payment_terms: 30` hårdkodas (rad 71). Korrekt — nyss skapade leverantörer har standard 30 dagars betalningsvillkor. Inte en bugg, men en invariant.

### Identifierade beteende-invarianter (test-kandidater)

**Grupp 1: Visningsläge (value !== null)**
1. Visar leverantörens namn
2. Rensa-knapp synlig när !disabled
3. Rensa-knapp dold när disabled
4. handleClear nollställer search + debouncedSearch

**Grupp 2: Sökläge (value === null)**
5. Sökinput med placeholder "Sök leverantör..."
6. Input disabled när disabled=true
7. Input onChange → setSearch + setOpen(true)
8. onFocus → setOpen(true)

**Grupp 3: Debounce**
9. 300ms debounce
10. Timer cleanup

**Grupp 4: Dropdown**
11. Dropdown synlig när open=true (även utan suppliers — visar "+ Ny leverantör")
12. Leverantörer visas med namn + org_number
13. Klick på leverantör → onChange, search nollställs, dropdown stängs

**Grupp 5: Inline create**
14. "+ Ny leverantör"-knapp → showInline=true
15. Create-formulär: namn-fält (autofocus), org.nr-fält
16. Skapa-knapp disabled om namn tomt eller mutation pending
17. handleCreateInline: mutateAsync med { name, type: 'supplier', org_number }
18. Vid lyckad create: onChange med { id, name, default_payment_terms: 30 }
19. Vid lyckad create: formuläret stängs, state nollställs
20. Avbryt-knapp: stänger formuläret, nollställer state

**Grupp 6: Click-outside**
21. Klick utanför → dropdown stängs

### Förgreningar att täcka
- value: null vs objekt
- disabled: true vs false (tre effekter: input, rensa-knapp, implicit formulär)
- Inline create: lyckad vs misslyckad mutation
- Dropdown utan suppliers: visar bara "+ Ny leverantör"
- org_number: trim + tomt → null

### Uppskattat testantal
21 tester, fördelat i 6 grupper.

### Testbarhet: isolerad vs via renderWithProviders
**renderWithProviders** behövs för `useCounterparties` + `useCreateCounterparty` (QueryClient + mock-IPC). Mock: `mockIpcResponse('counterparty:list', suppliersFixture)` + `mockIpcResponse('counterparty:create', createdSupplier)`.

### Flaggor
Inga flaggor.

---

## ArticlePicker

### Fil
`src/renderer/components/invoices/ArticlePicker.tsx` (144 rader)

### Kontrakt (publika props + callbacks)
- `counterpartyId: number | null` — kund-id för kundspecifikt pris
- `onSelect: (product: { product_id, description, unit_price_kr, vat_code_id, vat_rate, unit }) => void` — artikelval
- `testId?: string` — data-testid för input

### Internt tillstånd
- `search: string` (useState)
- `debouncedSearch: string` (useState)
- `open: boolean` (useState)
- `timerRef` (useRef) — debounce-timer
- `containerRef` (useRef) — click-outside

### Direkta beroenden
- **Hooks:** `useProducts({ search, active_only: true })` → QueryClient
- **Contexts:** Inga direkt
- **Utilities:** `formatKr`, `toKr` från `../../lib/format`
- **Direkt IPC:** `window.api.getPriceForCustomer({ product_id, counterparty_id })` — anropas i `handleSelect` (rad 81–93)
- **useEffect #1:** Debounce (300ms)
- **useEffect #2:** Click-outside

### window.api.getPriceForCustomer — trigger-punkt

**Anropas synkront vid rad-val, INTE som useEffect vid customer-change.** Trigger: användaren klickar på en produkt i dropdown → `handleSelect(product)` körs (rad 81). Inne i `handleSelect`:

1. Om `counterpartyId` finns (kund vald) → `await window.api.getPriceForCustomer({ product_id, counterparty_id })` (rad 85–89)
2. Om anropet lyckas → `priceOre = result.price_ore` (kundspecifikt pris)
3. Om anropet misslyckas (catch) → fallback till `product.default_price_ore`
4. Om `counterpartyId` är null → ingen IPC, använder `product.default_price_ore` direkt

**Konsekvens för testning:** Funktionen är async (await) men triggas av klick, inte av effect. Test behöver `waitFor` eller `act` kring klick-hantering. Mock-IPC: `mockIpcResponse('product:get-price-for-customer', { price_ore: 15000 })` + en variant som kastar för fallback-test.

### M-principer som komponenten implementerar eller beror på
- **M117:** `data-testid={testId}` på input (rad 118). testId skickas som prop.
- **M5 (main process = source of truth):** `vat_rate: 0` sätts explicit (rad 100) med kommentar "will be resolved by the parent via vat codes". Renderer delegerar momsresolution uppåt.

### Kända bugg-mönster (från tidigare F-findings)
Inga direkta F-findings mot denna komponent. Men:
- Prisresolution: `toKr(priceOre)` konverterar öre → kronor (rad 98). Invariant: om getPriceForCustomer returnerar 15000 öre → unit_price_kr ska bli 150.00.

### Identifierade beteende-invarianter (test-kandidater)

**Grupp 1: Rendering**
1. Visar sökinput med placeholder "Sök artikel..."
2. data-testid sätts från testId-prop
3. Dropdown synlig när open=true OCH products.length > 0

**Grupp 2: Debounce**
4. 300ms debounce av söksträng
5. Timer cleanup

**Grupp 3: Dropdown-innehåll**
6. Produkter visas med namn + formatKr(default_price_ore)
7. typeBadge: 'service' → "Tjänst" (teal), 'goods' → "Vara" (purple), 'expense' → "Utlägg" (orange)

**Grupp 4: handleSelect — utan kundspecifikt pris (counterpartyId === null)**
8. onSelect anropas med { product_id, description: product.description ?? product.name, unit_price_kr: toKr(default_price_ore), vat_code_id, vat_rate: 0, unit }
9. search nollställs, dropdown stängs

**Grupp 5: handleSelect — med kundspecifikt pris (counterpartyId !== null)**
10. IPC-anrop: getPriceForCustomer med { product_id, counterparty_id }
11. Vid lyckat svar: unit_price_kr = toKr(result.price_ore)
12. Vid misslyckat svar (IPC-error): fallback till toKr(product.default_price_ore)

**Grupp 6: handleSelect — description-fallback**
13. Om product.description finns → använd den
14. Om product.description är null/undefined → fallback product.name

**Grupp 7: Click-outside**
15. Klick utanför → dropdown stängs

### Förgreningar att täcka
- counterpartyId: null vs nummer (styr IPC-anrop)
- getPriceForCustomer: lyckat vs misslyckat
- product.description: finns vs null (fallback till name)
- article_type: service/goods/expense (typeBadge)
- Dropdown: tom products → döljs

### Uppskattat testantal
15 tester, fördelat i 7 grupper. Grupp 5 kräver async mock-IPC + waitFor.

### Testbarhet: isolerad vs via renderWithProviders
**renderWithProviders** behövs för `useProducts` (QueryClient + mock-IPC). Dessutom krävs mock för `window.api.getPriceForCustomer` (direkt IPC-anrop). Två mock-lager:
1. `mockIpcResponse('product:list', productsFixture)` för useProducts
2. `vi.spyOn(window.api, 'getPriceForCustomer')` eller `mockIpcResponse('product:get-price-for-customer', ...)` beroende på mock-ipc-implementationens stöd för den kanalen.

### Flaggor
- **Direkt window.api-anrop:** `getPriceForCustomer` kräver separat mock utöver standard hook-mocking. Testa att mock-ipc stödjer kanalen innan testerna skrivs.

---

## Grupperingsbeslut

### CustomerPicker + SupplierPicker
- **Delar komponent:** Nej
- **Motivering:** Delar mönster (debounce, click-outside, dropdown, value/search-state) men SupplierPicker har 85 extra rader med inline create-formulär, `useCreateCounterparty`-mutation, disabled-prop, och 3 extra useState. Strukturellt ~60% overlap i picker-mekanik, men testinvarianterna divergerar: SupplierPicker har 6 extra invarianter (inline create) som CustomerPicker saknar helt.
- **Konsekvens:** En session (S65c) med båda — de delar fixture-setup (counterparty-lista) och mock-IPC (counterparty:list). CustomerPicker testas först (enklare, ~15 tester), sedan SupplierPicker (~21 tester) som utökar med inline create.

### InvoiceLineRow + ExpenseLineRow
- **Delar tillräcklig struktur:** Nej
- **Motivering:** Olika beroendemodell. ExpenseLineRow: inga hooks, tar `expenseAccounts` + `vatCodes` som props, ren render. InvoiceLineRow: `useVatCodes`-hook, renderar ArticlePicker som child, har M123-forking (product_id null vs non-null). Testerna kräver helt olika setup.
- **Konsekvens:** Separata sessioner. ExpenseLineRow (S65a) utan QueryClient. InvoiceLineRow (S65b) med renderWithProviders + ArticlePicker-stub.

## Föreslagen sessionsordning

1. **S65a: ExpenseLineRow** — Enklast att testa (ren render, inga hooks, props-driven). Uppvärmning som etablerar test-patterns (memo-test, callback-propagering, beräknings-invarianter) som återanvänds i S65b. ~16 tester.

2. **S65b: InvoiceLineRow** — Mest förgrenad komponent (M123-forking, artikelval, moms-resolve). Bygger på S65a:s patterns men lägger till QueryClient-setup, ArticlePicker-stubb, och async vatCode-resolve. F27-regressionstäckning. ~19 tester.

3. **S65c: CustomerPicker + SupplierPicker** — Picker-mekanik (debounce, click-outside, dropdown). Delar fixture-setup. SupplierPicker utökar med inline create-mutation. ~36 tester totalt (15 + 21). Kan delas i S65c.1 + S65c.2 om sessionen blir för lång.

4. **S65d: ArticlePicker** — Mest isolerade beroendet (window.api.getPriceForCustomer). Kräver verifiering av mock-IPC-stöd för den kanalen innan session. ~15 tester.

**Prioriteringsprincip:** ExpenseLineRow först som uppvärmning — nollkomplexitet i setup, etablerar återanvändbara test-patterns. InvoiceLineRow andra eftersom den har flest M-principer och F27-regression. Pickers tredje (delad fixture, debounce-mönster). ArticlePicker sist (unik beroendekedja, behöver mock-IPC-verifiering).

**Avvägning mot ursprungligt förslag (InvoiceLineRow först):** InvoiceLineRow har mest M-principstäckning och F27-regression, men ExpenseLineRow som S65a ger en fungerande test-fil på <30 min som etablerar patterns. S65b (InvoiceLineRow) får sedan använda dessa patterns direkt istället för att både uppfinna dem OCH hantera QueryClient/stub-setup. Nettoresultat: snabbare total throughput.

## Blockerande findings

Inga blockerande findings. Samtliga komponenter kan testas med `render()` (ExpenseLineRow) eller `renderWithProviders` + mock-IPC (övriga). Ingen komponent kräver refaktor innan test.
