# Sprint 31 — Global sokning + Kontoutdrag-polish

## Kontext

Sprint 30 levererade kontoutdrag-UI (B2) och korrigeringsverifikat (B4) med
M140 (en-gangs-las). 1657 vitest, 156 testfiler, 0 tsc-fel, PRAGMA user_version 31.
0 oppna findings. 5 tech-debt-items (F46b, F49-b, F57, ManualEntryListItem-rename,
PageAccountStatement URL-sync).

Denna sprint har tva leveranser:
1. **B2-polish** — URL-sync for kontoutdrag (kravs som primitiv for B3)
2. **B3** — Global sokning (tyngst, ny IPC-kanal + UI-komponent)

B3 ar den sista planerade B-feature. Efter denna sprint ar alla Sprint 29-planerade
features levererade (B1 testhardering, B2 kontoutdrag, B3 global sokning, B4
korrigeringsverifikat).

**Testbaslinje:** 1657 vitest passed, 2 skipped (156 testfiler). 11 Playwright E2E.
**Mal:** ~1690+ efter sessionen.
**PRAGMA user_version:** 31. Ingen ny migration planerad — B3 kraver ingen schema-andring.

---

## Relevanta M-principer (inline-sammanfattning)

- **M8/F8:** `escapeLikePattern()` i `src/shared/escape-like.ts` — alla LIKE-fragor
  maste anvanda `ESCAPE '!'`-klausulen. Arkitektur-vakt i `like-escape-audit.test.ts`.
- **M100:** Services kastar strukturerade `{ code, error, field? }`. Aldrig `throw new Error`.
- **M128:** Handlers: direkt delegation eller `wrapIpcHandler()`.
- **M14:** Alla data-queries scopas till aktivt fiscal_year_id. UNDANTAG: stamdata
  (counterparties, products, price_lists) ar globala.
- **M140:** Korrigeringsverifikat kan inte sjalva korrigeras. Permanent las efter
  en korrigering. Manuell C-serie-rattelse ar enda vagen vid fel i korrigeringen.

---

## 0. Pre-flight

```bash
npm run test        # 1657 passed, 2 skipped (156 testfiler)
npm run typecheck   # 0 errors
npm run check:m131  # rent
npm run check:m133  # rent
npm run build       # rent
```

---

## Kritiska design-beslut (maste losas fore kodning)

### D1 — Counterparty-diskriminering (F1)

`counterparties.type` ar `'customer' | 'supplier' | 'both'`. Global sokning
listar Kunder och Leverantorer som separata grupper.

**Beslut:** Anvand samma diskrimineringsmönster som `listCounterparties`
(rad 33-36 i `counterparty-service.ts`):
- Kundsok: `WHERE type IN ('customer', 'both')`
- Leverantorssok: `WHERE type IN ('supplier', 'both')`

En counterparty med `type='both'` visas i **bada** grupperna med
respektive route (`/customers/{id}` och `/suppliers/{id}`).

### D2 — Case- och diakritik-kanslighet (F4)

SQLite LIKE ar case-insensitiv for ASCII men **case-kanslig for aao/AAO**.
"ake" matchar INTE "Ake".

**Beslut for v1:** Anvand `LOWER()` i queries for case-insensitivitet
av ASCII + svenska lowercase (LOWER hanterar aao i SQLite via NOCASE).

**Kontrollera:** Om `LOWER('Ake')` returnerar `'ake'` i SQLite gor vi det.
Om inte: dokumentera som kand begransning och lagg till F58.

Alla sok-queries anvander monstret:
```sql
WHERE LOWER(field) LIKE LOWER(:pattern) ESCAPE '!'
```

**Test som kraver svar:**
- Sok pa "acme" ska matcha "Acme AB" (ASCII case) ✓ (forvantat)
- Sok pa "ake" ska matcha "Ake" — verifiera i test. Om inte → F58.

FTS5 med unicode61-tokenizer planeras for Sprint 32+ om diakritik-
sokning kravs (t.ex. "ostgota" → "Ostgota").

### D3 — HashRouter stoder INTE query params (F10, verifierat)

`matchRoute` i `src/renderer/lib/router.tsx` splittar pa `/` segment-for-
segment. URL `#/account-statement?account=1510` → sista segmentet blir
`account-statement?account=1510` → matchar **inte** route-monstret.

**Beslut:** Minimal router-andring. Andra `getHashPath()` (rad 92-95) att
strippa query params fore route-matching, plus en separat `getHashParams()`
helper:

```ts
// I router.tsx — andrad getHashPath
function getHashPath(): string {
  const hash = window.location.hash
  const raw = hash.startsWith('#') ? hash.slice(1) : '/'
  return raw.split('?')[0]
}

// Ny export
export function getHashParams(): URLSearchParams {
  const hash = window.location.hash
  const idx = hash.indexOf('?')
  return idx >= 0 ? new URLSearchParams(hash.slice(idx + 1)) : new URLSearchParams()
}

// Ny export — uppdaterar params utan att trigga navigation
export function setHashParams(params: Record<string, string>): void {
  const path = getHashPath()
  const search = new URLSearchParams(params).toString()
  const newHash = search ? `${path}?${search}` : path
  // replaceState undviker history-pollution fran debounced filter-andringar
  window.history.replaceState(null, '', `#${newHash}`)
}
```

**Viktig detalj:** `setHashParams` anvander `replaceState` (inte `pushState`)
for att inte fylla browser history med varje filter-andring. `hashchange`-
eventet fires INTE vid `replaceState` — det ar ratt beteende (vi vill inte
trigga route-rerender vid filter-update).

PageAccountStatement laser params vid mount via `getHashParams()` och
uppdaterar via `setHashParams()` vid filter-andring. Routern sjalv ser
aldrig query params — separation of concerns.

### D4 — Verifikat-sokning: skippa i v1 (F6/F7 forenkling)

Verifikat-sokning (journal_entries) ar komplex:
- N+1-risk vid entity-id-uppslag (F6)
- Concat-LIKE icke-indexerbart (F7)
- source_type-diskriminering kravs (betalningsverifikat ska inte visas)
- Routing-logik: auto_invoice → `/income/view/{id}`,
  auto_expense → `/expenses/view/{id}`, manual → `/manual-entries/view/{id}`

**Beslut: Skippa verifikat som separat sokenitet i v1.** Motivering:
- Faktura-sokning pa invoice_number tacker "hitta verifikat A1" (invoice A1)
- Kostnad-sokning pa supplier_invoice_number tacker B-serien
- Manuell bokning-sokning pa description tacker C-serien
- 95% av use-cases tackta utan direkt verifikat-sokning

Om anvandare efterfragar verifikat-sokning: Sprint 32 feature.

### D5 — SearchResult.id for konton (F5)

`accounts.account_number` ar `TEXT NOT NULL UNIQUE` (inte INTEGER).
Accounts har inget surrogat-id.

**Beslut:** SearchResult-interfacet anvander `identifier: string` istallet
for `id: number`. Alla entiteter representerar sin identifierare som strang.
Route-faltet hanterar navigeringen helt — konsumenten behover aldrig tolka
identifier.

```ts
interface SearchResult {
  type: SearchResultType
  identifier: string  // entity-specifikt: invoice.id, counterparty.id, account_number etc.
  title: string
  subtitle: string
  route: string
}
```

---

## Del A: B2-polish — URL-sync + subtractMonths + print

**Denna fas implementeras FORE B3** — URL-sync ar forutsattning for
konto-preselektion fran sokresultat (D3, F2).

### A1. Router-utvidgning (getHashParams/setHashParams)

Andra `src/renderer/lib/router.tsx`:

1. Andra `getHashPath()` att strippa `?...` (se D3 ovan)
2. Exportera `getHashParams()` och `setHashParams()` (se D3 ovan)

**Tester:**
1. `getHashPath()` returnerar `/account-statement` for hash `#/account-statement?account=1510`
2. `getHashParams()` returnerar `{ account: '1510' }` for hash `#/account-statement?account=1510`
3. `setHashParams()` uppdaterar hash utan att triggra hashchange (replaceState)
4. Befintlig routing fungerar oforandrad (inga regressioner)

### A2. PageAccountStatement URL-sync

Uppdatera `src/renderer/pages/PageAccountStatement.tsx`:

1. Vid mount: las `getHashParams()` → satt `selectedAccount`, `dateFrom`, `dateTo`
2. Vid filter-andring: anropa `setHashParams({ account, from, to })`
3. Vid "Visa hela rakenskapsaret": uppdatera params

**URL-format:** `#/account-statement?account=1510&from=2026-01-01&to=2026-04-15`

**Tester:**
5. URL uppdateras nar konto valjs
6. URL uppdateras nar datum andras
7. Filter aterstarks fran URL vid mount

### A3. subtractMonths shared utility

**Problem:** `defaultDateFrom` i PageAccountStatement.tsx har inline-logik
for "subtrahera N manader med dag-clamp". Samma monster behovs i framtida
rapportperioder och forfalloberakning.

**Fix:**
1. Extrahera `subtractMonths(dateStr: string, months: number): string` till
   `src/shared/date-utils.ts`
2. Kontrakt:
   - `months` maste vara >= 0 (negativa → throw)
   - `months === 0` → returnerar input oforandrad
   - Dag clampas till giltig range for mal-manaden (Feb 28/29, Apr 30 etc.)
   - Input maste vara giltig YYYY-MM-DD (ingen runtime-validering — caller ansvarar)
3. Anvand i PageAccountStatement.tsx (ersatt inline-logik)
4. Flytta befintliga edge-case-tester fran `session-30-date-edge-cases.test.ts`
   till `tests/unit/date-utils.test.ts`

**Tester (totalt ~12):**
8. Normal: subtractMonths('2026-04-15', 3) → '2026-01-15'
9. Manadsunderflow: subtractMonths('2026-02-15', 3) → '2025-11-15'
10. Dag-clamp Feb: subtractMonths('2026-05-31', 3) → '2026-02-28'
11. Dag-clamp Feb skottar: subtractMonths('2028-05-31', 3) → '2028-02-29'
12. Dag-clamp Apr: subtractMonths('2026-07-31', 3) → '2026-04-30'
13. Dec-wrap: subtractMonths('2026-03-31', 3) → '2025-12-31'
14. Noll manader: subtractMonths('2026-04-15', 0) → '2026-04-15'
15. Cross-year: subtractMonths('2026-01-15', 13) → '2024-12-15'
16. Cross-year skottar: subtractMonths('2024-02-29', 12) → '2023-02-28'
17. Negativa → throw
18. FY-clip: defaultDateFrom clippar mot fyStart (befintligt test, bekrafta)
19. defaultDateFrom('2026-01-01', '2026-04-01') → '2026-01-01' (exakt FY-start)

### A4. Print-mode for kontoutdrag

1. Lagg till print-knapp i PageHeader (samma monster som PageReports.tsx:49):
   ```tsx
   <button onClick={() => window.print()} className="...">
     <Printer className="h-4 w-4" /> Skriv ut
   </button>
   ```
2. Lagg till `print:hidden` pa filter-sektionen (dropdown, datumfalt)
3. Lagg till `print:block print:hidden`-sektion med kontoinformation + period-header

**Tester (renderer — billig klass-check, F9):**
20. Filter-sektion har `print:hidden`-klass
21. Print-header finns i DOM med `print:block`-klass
22. Print-knapp renderar

---

## Del B: B3 — Global sokning

### Sokeniteter och kolumner (reviderad efter D1, D4, D5)

6 entiteter (verifikat skippat per D4):

| Entitet | Tabell | Sok-falt | WHERE-filter | Resultat-title | Resultat-subtitle | Route |
|---------|--------|----------|--------------|----------------|-------------------|-------|
| Fakturor | invoices JOIN counterparties | invoice_number, cp.name | `fiscal_year_id = :fy AND status != 'draft'` | `#1001 — Acme AB` | `12 500 kr · obetald` | `/income/view/{id}` |
| Kostnader | expenses JOIN counterparties | supplier_invoice_number, description, cp.name | `fiscal_year_id = :fy AND status != 'draft'` | `Kontorsmaterial — Lev AB` | `5 000 kr · betald` | `/expenses/view/{id}` |
| Kunder | counterparties | name, org_number | `type IN ('customer','both') AND is_active=1` | `Acme AB` | `Kund · 556036-0793` | `/customers/{id}` |
| Leverantorer | counterparties | name, org_number | `type IN ('supplier','both') AND is_active=1` | `Leverantor AB` | `Leverantor · 556789-1234` | `/suppliers/{id}` |
| Artiklar | products | name, sku | `is_active = 1` | `Konsulttimme` | `1 250 kr/timme` | `/products/{id}` |
| Konton | accounts | account_number, name | `is_active = 1` | `1510 Kundfordringar` | `Klass 1 — Tillgangar` | `/account-statement?account={account_number}` |

**Notera konto-routing:** Anvander URL-params (kravs A1/A2 forst).

### Shared types

**Fil:** `src/shared/search-types.ts`

```ts
export type SearchResultType =
  | 'invoice'
  | 'expense'
  | 'customer'
  | 'supplier'
  | 'product'
  | 'account'

export interface SearchResult {
  type: SearchResultType
  identifier: string
  title: string
  subtitle: string
  route: string
}

export interface GlobalSearchResponse {
  results: SearchResult[]
  total_count: number
}
```

Anvands i service, IPC-deklaration och renderer (F16 — inga losa `string`-typer).

### Service-implementation

**Fil:** `src/main/services/search-service.ts`

**Funktion:** `globalSearch(db, input: { query: string, fiscal_year_id: number, limit?: number }): IpcResult<GlobalSearchResponse>`

**Soklogik:**
1. **Trim + min-length:** `const trimmed = query.trim(); if (trimmed.length < 2) return { success: true, data: { results: [], total_count: 0 } };` (F15)
2. Bygg pattern: `const pattern = '%' + escapeLikePattern(trimmed) + '%'`
3. Kor 6 prepared queries (en per entitet, inte loop — alla i samma synkrona anrop)
4. Mappa varje rad till `SearchResult`
5. Sortera: transaktioner forst (senaste `created_at` DESC), sedan stamdata (name ASC)
6. Klipp till limit (default 50)

**Query-monster (alla foljer samma form):**
```sql
-- Fakturor
SELECT i.id, i.invoice_number, i.total_amount_ore, i.status, cp.name as cp_name
FROM invoices i
JOIN counterparties cp ON cp.id = i.counterparty_id
WHERE i.fiscal_year_id = :fy
  AND i.status != 'draft'
  AND (LOWER(i.invoice_number) LIKE LOWER(:pattern) ESCAPE '!'
       OR LOWER(cp.name) LIKE LOWER(:pattern) ESCAPE '!')
ORDER BY i.created_at DESC
LIMIT :limit

-- Kunder (D1-diskriminering)
SELECT id, name, org_number, type
FROM counterparties
WHERE type IN ('customer', 'both')
  AND is_active = 1
  AND (LOWER(name) LIKE LOWER(:pattern) ESCAPE '!'
       OR LOWER(org_number) LIKE LOWER(:pattern) ESCAPE '!')
ORDER BY name ASC
LIMIT :limit

-- Leverantorer (D1-diskriminering)
SELECT id, name, org_number, type
FROM counterparties
WHERE type IN ('supplier', 'both')
  AND is_active = 1
  AND (LOWER(name) LIKE LOWER(:pattern) ESCAPE '!'
       OR LOWER(org_number) LIKE LOWER(:pattern) ESCAPE '!')
ORDER BY name ASC
LIMIT :limit

-- Konton
SELECT account_number, name
FROM accounts
WHERE is_active = 1
  AND (LOWER(account_number) LIKE LOWER(:pattern) ESCAPE '!'
       OR LOWER(name) LIKE LOWER(:pattern) ESCAPE '!')
ORDER BY account_number ASC
LIMIT :limit
```

Kostnader och Artiklar foljer samma monster.

**Route-byggande (i service-lagret):**
```ts
// Faktura
route: `/income/view/${row.id}`
// Kostnad
route: `/expenses/view/${row.id}`
// Kund
route: `/customers/${row.id}`
// Leverantor
route: `/suppliers/${row.id}`
// Artikel
route: `/products/${row.id}`
// Konto (URL-params via A1/A2)
route: `/account-statement?account=${row.account_number}`
```

### IPC-kanal och schema

**Kanal:** `search:global`
```ts
export const GlobalSearchSchema = z
  .object({
    query: z.string().min(2).max(200),  // min(2) per F3 — kontraktet ar arligt
    fiscal_year_id: z.number().int().positive(),
    limit: z.number().int().min(1).max(100).optional(),
  })
  .strict()
```

**Returnerar:** `IpcResult<GlobalSearchResponse>`

**Handler-monster (M128 — direkt delegation):**
```ts
ipcMain.handle('search:global', (_event, input: unknown) => {
  const parsed = GlobalSearchSchema.safeParse(input)
  if (!parsed.success) {
    return { success: false, error: 'Ogiltigt input.', code: 'VALIDATION_ERROR' }
  }
  return globalSearch(db, parsed.data)
})
```

### Preload + electron.d.ts

```ts
// preload.ts
globalSearch: (data: { query: string; fiscal_year_id: number; limit?: number }) =>
  ipcRenderer.invoke('search:global', data),
```

```ts
// electron.d.ts — anvand shared types for korrekt typning (F16)
import type { GlobalSearchResponse } from '../shared/search-types'

globalSearch: (data: {
  query: string
  fiscal_year_id: number
  limit?: number
}) => Promise<IpcResult<GlobalSearchResponse>>
```

### Hook

Lagg till i `src/renderer/lib/hooks.ts`:
```ts
export function useGlobalSearch(
  fiscalYearId: number | undefined,
  query: string,
) {
  return useIpcQuery(
    queryKeys.globalSearch(fiscalYearId!, query),
    () => window.api.globalSearch({
      fiscal_year_id: fiscalYearId!,
      query,
    }),
    { enabled: !!fiscalYearId && query.length >= 2 },
  )
}
```

Query key i `query-keys.ts`:
```ts
globalSearch: (fyId: number, query: string) =>
  ['global-search', fyId, query] as const,
```

### UI-komponent: GlobalSearch

**Fil:** `src/renderer/components/layout/GlobalSearch.tsx`

**Placering:** I Sidebar.tsx, under header-sektionen (mellan company-info/YearPicker
och nav-lankarna). Persistent over sidbyten.

**ARIA combobox-monster (F12):**
```tsx
<div role="combobox" aria-expanded={isOpen} aria-haspopup="listbox" aria-owns="search-results">
  <input
    role="searchbox"
    aria-autocomplete="list"
    aria-controls="search-results"
    aria-activedescendant={activeId}
    placeholder="Sok (Ctrl+K)..."
  />
  {isOpen && (
    <ul id="search-results" role="listbox" aria-label="Sokresultat">
      {results.map((r, i) => (
        <li
          key={r.identifier}
          id={`search-result-${i}`}
          role="option"
          aria-selected={i === activeIndex}
          onClick={() => handleSelect(r)}
        >
          ...
        </li>
      ))}
    </ul>
  )}
</div>
```

**Tangentkortvar:**
- `Ctrl+K` / `Cmd+K`: fokuserar sokfaltet (global via `useKeyboardShortcuts` — redan stods)
- `ArrowDown` / `ArrowUp`: navigerar i resultatlistan (uppdaterar `aria-activedescendant`)
- `Enter`: navigerar till aktivt resultat
- `Escape`: stanger dropdown + rensar fokus

**Tillstand:**
1. **Inaktiv:** Kompakt sokfalt med placeholder
2. **Fokuserad, tom query:** Ingen dropdown
3. **Fokuserad, query < 2 tecken:** Ingen dropdown (hooken filtrerar)
4. **Laddning:** `<LoadingSpinner />` i dropdown (visa inom 100ms efter debounce loser for upplevd snabbhet)
5. **Resultat:** Grupperad lista per typ med rubriker
6. **Inga resultat:** "Inga resultat for '{query}'"

**Resultatgruppering:**
```
Fakturor (2)
  #1001 — Acme AB          12 500 kr · obetald
  #1002 — Acme AB          8 200 kr · betald
Kunder (1)
  Acme AB                   Kund · 556036-0793
Konton (1)
  1510 Kundfordringar       Klass 1 — Tillgangar
```

**Grupperings-ordning:** Fakturor, Kostnader, Kunder, Leverantorer, Artiklar, Konton.
Visa bara grupper med traffar. Max 5 resultat per grupp i dropdown (total max 20 i dropdown).

**Debounce:** 300ms via `useDebouncedSearch` (befintlig hook).

**Navigering:** Klick pa resultat → `navigate(result.route)` + stang dropdown + rensa sokfalt.

### Tester

**Service-tester (search-service.test.ts):**
1. Tom/kort query (< 2 tecken efter trim) → tom resultat-lista, inga SQL-queries
2. Whitespace-only query "  " → tom resultat-lista (F15)
3. Fakturasok: matchar invoice_number (case-insensitiv)
4. Kundsok: matchar counterparty.name
5. Leverantorssok: returnerar bara type IN ('supplier','both') (D1)
6. Kundsok: returnerar bara type IN ('customer','both') (D1)
7. Counterparty med type='both' visas i BADA grupperna (D1)
8. Kontosok: matchar account_number + name
9. FY-scopning: faktura fran annat FY dyker INTE upp
10. Stamdata ar globala: produkt dyker upp oavsett FY (M14)
11. LIKE-escape: sokterm "100%" soker literal % — lagg till counterparty "Rabatt 50% AB" och sok pa "50%" (F8 fix)
12. Limit: max resultat respekteras
13. Resultat-routing: invoice → `/income/view/{id}`, konto → `/account-statement?account=1510`
14. Case-insensitivitet: sok "acme" matchar "Acme AB"
15. aao-test: sok "ake" — dokumentera om det matchar "Ake" eller inte (D2)

**IPC contract test:**
16. Zod-schema for `search:global` — accepterar min(2), rejectar min(1), rejectar extra fields

**Renderer-test (global-search-ui.test.tsx):**
17. Sokfalt renderar i sidebar med `role="searchbox"`
18. Resultat-lista har `role="listbox"` och resultat har `role="option"` (F12)
19. Resultat-lista visar grupperade traffar med typ-rubriker
20. Klick pa resultat navigerar till korrekt route
21. Tom resultat visar "Inga resultat"
22. Escape stanger dropdown
23. axe-check (M133)

**Perf-test (valfri men rekommenderad, F13):**
24. Seeda 500 counterparties + 500 invoices → globalSearch < 200ms

---

## Fas-ordning och rollback-strategi

| Fas | Scope | Tagg vid klar | Full test-suite |
|-----|-------|---------------|-----------------|
| 1 | A1-A3: Router URL-params + subtractMonths + PageAccountStatement URL-sync | `s31-url-sync` | Ja |
| 2 | B3: search-service + search-types + tester | `s31-b3-service` | Ja |
| 3 | B3: IPC + preload + GlobalSearch UI + tester | `s31-b3-ui` | Ja |
| 4 | A4: Print-mode for kontoutdrag | `s31-print` | Ja |

**Fas-beroenden:**
- Fas 1 → Fas 3: B3 konto-routing beror pa URL-params (F2)
- Fas 2 ar oberoende av Fas 1 (service-lagret kanner inte till URL-params)
- Fas 4 ar oberoende av alla andra

**Rollback:** Varje fas taggas. Vid regression: `git revert` till forega tagg.

**Mellan varje fas: kor full test-suite.** Gor INTE vidare till nasta fas om tester failar.

---

## UTANFOR SCOPE (Sprint 32+)

### Planerade for Sprint 32
- **Verifikat-sokning** (D4 — skippat i v1 pga komplexitet)
- **F58** aao-diakritik i sokning (om D2-testet visar problem)
- **FTS5 virtual table** for indexerad fulltext-sokning (loser F13 perf + F58 diakritik)
- **F57** mock-IPC response-shape-validering

### Tech debt (registrerat)
- **F46b** DB-CHECK defense-in-depth for quantity
- **F49-b** AST-baserad M133-utokning
- **ManualEntryListItem.total_amount** M119-rename (breaking)
- **E03** supplier-picker data-testid

### Features
- **Server-side PDF** for rapporter (RR, BR, moms, skatt)
- **Dashboard-utvidgning** (aging analysis, trendgrafer)
- **List-virtualisering** (react-window for 10k+ rader)
- **Picker keyboard-nav** (a11y)

---

## Manuellt smoke-test-script

### URL-sync kontoutdrag (2 min)
1. [ ] Navigera till Kontoutdrag → URL ar `#/account-statement`
2. [ ] Valj konto 1510 → URL andras till `?account=1510&from=...&to=...`
3. [ ] Andra datum → URL uppdateras
4. [ ] Navigera till annan sida → tillbaka → filter bevarade
5. [ ] "Visa hela rakenskapsaret" → URL uppdateras

### Global sokning (3 min)
6. [ ] Tryck Ctrl+K → sokfaltet fokuseras
7. [ ] Skriv "Acme" → resultat visar kund "Acme" + eventuella fakturor
8. [ ] Klicka pa en faktura → navigeras till `/income/view/{id}`
9. [ ] Sok pa "1510" → konto 1510 Kundfordringar visas
10. [ ] Klicka pa konto → navigeras till `/account-statement?account=1510`
11. [ ] Sok pa "100%" → literal procent sokt, resultat baserat pa match
12. [ ] Sok pa 1 tecken → inga resultat (under minsta langd)
13. [ ] Stang sok med Escape
14. [ ] Piltangenter navigerar i resultatlistan

### Print kontoutdrag (1 min)
15. [ ] Valj konto med transaktioner → klicka print-knapp → ren utskrift
16. [ ] Filter-kontroller dolda i utskrift
17. [ ] Kontoinformation och period visas i utskrift

### Regression (2 min)
18. [ ] Skapa faktura → bokfor → sokning hittar fakturan
19. [ ] Korrigera verifikat → kontoutdrag visar bade original + korrigering
20. [ ] Manuell bokforingsorder → C-serie-nummer korrekt

---

## Nya tester per feature — sammanfattning

| Feature | Typ | Antal |
|---------|-----|-------|
| A1: Router URL-params | Unit | 4 |
| A2: PageAccountStatement URL-sync | Renderer | 3 |
| A3: subtractMonths | Unit | 12 |
| A4: Print-mode | Renderer | 3 |
| B3: search-service | Service | 15 |
| B3: IPC contract | Zod schema | 1 |
| B3: GlobalSearch UI | Renderer + axe | 7 |
| **Totalt** | | **~45** |

**Notera:** 9 befintliga date-edge-case-tester i `session-30-date-edge-cases.test.ts`
flyttas till `tests/unit/date-utils.test.ts` — nettoeffekt pa testantal: +3 (nya subtractMonths)
inte +12 (9 ar befintliga, 3 ar nya).

**Netto nya tester:** ~36 (45 minus 9 flyttade).
**Mal:** ~1693+ vitest efter sprinten (1657 baseline + ~36 nya).

---

## Verifiering vid sprint-avslut

```bash
npm run test          # ~1693+ passed
npm run typecheck     # 0 errors
npm run check:m131    # rent
npm run check:m133    # rent
npm run build         # rent
npm run lint          # (pre-existing prettier-errors okej)
```

- Uppdatera STATUS.md
- Kor manuellt smoke-test-script ovan
- Tagga `s31-done`
