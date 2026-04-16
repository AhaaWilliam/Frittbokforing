# Sprint 33 — FTS5 + Quantity-CHECK + Tech-debt-sweep

## Kontext

Sprint 32 levererade F58 (Unicode-sokning via `lower_unicode`), B5
(verifikat-sokning med bidirectional findability), F13 (perf-baseline).
1743 vitest, 164 testfiler, 0 tsc-fel, PRAGMA user_version 31.
0 oppna findings. 5 tech-debt-items.

Denna sprint har fyra leveranser:
1. **B6** — FTS5 virtual table for indexed fulltext search
2. **F46b** — DB-CHECK defense-in-depth for quantity-gränser
3. **F57** — Mock-IPC response-shape-validering
4. **TD-sweep** — F49-b, ManualEntryListItem-rename, E03

**Testbaslinje:** 1743 vitest passed, 2 skipped (164 testfiler). 11 Playwright E2E.
**Mal:** ~1780+ efter sessionen.
**PRAGMA user_version:** 31 → 33 (migration 032: F46b quantity-CHECK, migration 033: FTS5).

---

## Relevanta M-principer (inline-sammanfattning)

- **M8/F8:** `escapeLikePattern()` — alla LIKE-fragor anvander `ESCAPE '!'`.
- **M119:** Alla INTEGER-kolumner for pengar i ore ska ha `_ore`-suffix.
- **M121:** Table-recreate bevarar inte triggers — aterskapa explicit.
- **M122:** Table-recreate med inkommande FK kraver PRAGMA foreign_keys = OFF utanfor transaktionen.
- **M127:** ADD COLUMN-begransningar vid schema-paritets-migrationer.
- **M128:** Handler error-patterns: direkt delegation eller `wrapIpcHandler()`.
- **M130:** Invoice vs Expense quantity-semantik (REAL vs INTEGER).
- **M132:** Cross-schema-granser i shared constants.
- **M133:** `axeCheck: false` tillats inte utan dokumenterat undantag.

---

## 0. Pre-flight

```bash
npm run test        # 1743 passed, 2 skipped (164 testfiler)
npm run typecheck   # 0 errors
npm run check:m131  # rent
npm run check:m133  # rent
npm run build       # rent
```

---

## Kritiska design-beslut

### D1 — FTS5: content-sync-strategi

**Problem:** `lower_unicode` loser cross-case for aao men kräver full
table-scan via LIKE. Vid 10k+ rader (t.ex. importerad kontolista) blir
detta en prestandaflaskhals. FTS5 ger indexerad sokning.

**Alternativ:**

| Alternativ | Komplexitet | Fordel | Nackdel |
|---|---|---|---|
| A: External content FTS5 | Medel | Indexerad, ingen dataduplikation | Kräver rebuild-trigger |
| B: Standalone FTS5 | Lag | Enklare sync | Dubblerar data |
| C: Content-synced FTS5 med triggers | Hog | Automatisk sync | Komplext trigger-mesh |

**Beslut: Alternativ A — external content FTS5 med `content=''` (contentless).**

Motivering:
- Contentless FTS5 lagrar enbart token-index, inte sourcedata
- Raderna hamtas fran originaltabellerna vid match (via rowid)
- Ingen dataduplikation — rowid pekar tillbaka till sourcerow
- Stodjer incremental update via `INSERT INTO t(t, rowid, ...) VALUES('delete', ...)`

**Implementation — en FTS5-tabell for alla sokbara entiteter:**

```sql
-- Contentless FTS5 for global search
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity_type,   -- 'counterparty', 'product', 'account', 'journal_entry'
  entity_id UNINDEXED,
  search_text,   -- konkatenerad sokbar text
  content='',    -- contentless: lagrar bara index
  tokenize='unicode61 remove_diacritics 2'
);
```

**Kolumn-semantik:**
- `entity_type`: FTS5-indexerad kolumn — anvands i MATCH-query for
  kolumn-filter (`entity_type:counterparty`). Inte en post-filter.
- `entity_id UNINDEXED`: Anvands bara for att joina tillbaka till
  sourcetabell efter match. Aldrig for textsokning. UNINDEXED sparar
  indexstorlek.
- `search_text`: Konkatenerad sokbar text. Alla sokbara falt med
  mellanslag-separator for korrekt tokenisering.

**tokenize='unicode61 remove_diacritics 2':**
- `unicode61`: Unicode-medveten tokenizer (not ASCII-only)
- `remove_diacritics 2`: Tar bort diakritiker vid sokning MEN bevarar
  dem i index. `'ostgota'` matchar `'Östgöta'`, `'ake'` matchar `'Åke'`.
  Mode 2 = "remove if they are not significant" (rekommenderat for
  europeiska sprak).

**Rebuild-strategi — incremental + full rebuild:**

Tva funktioner:

1. **`rebuildSearchIndex(db)`** — full rebuild. Kors vid startup och
   som fallback. ~50ms for 5k rader. Wrappas i try-catch i db.ts:
   ```ts
   try { rebuildSearchIndex(db) }
   catch (err) { logger.error('FTS5 rebuild failed, falling back to LIKE', err) }
   ```
   Vid fail: app startar normalt, globalSearch faller tillbaka pa LIKE (D2).

2. **`updateSearchIndexEntry(db, entityType, rowid, newSearchText)`** —
   incremental update. Kors efter varje write-operation i beorda services.
   ```ts
   // Delete old entry (contentless FTS5 kräver exakt match pa alla kolumner)
   db.prepare("INSERT INTO search_index(search_index, entity_type, entity_id, search_text) VALUES('delete', ?, ?, ?)")
     .run(entityType, rowid, oldSearchText)
   // Insert new entry
   db.prepare("INSERT INTO search_index(entity_type, entity_id, search_text) VALUES(?, ?, ?)")
     .run(entityType, rowid, newSearchText)
   ```

   **Verifierat:** Contentless FTS5 stodjer `INSERT INTO t(t, ...) VALUES('delete', ...)`
   for per-entry-borttagning. Testat med better-sqlite3.

   **Problem med delete:** Contentless FTS5 delete kräver att man anger
   den exakta texten som indexerades. For att slippa lagra gammal text
   somewhere: anvand enklare approach — kor `rebuildSearchIndex` efter
   varje write. ~50ms per write ar acceptabelt for en lokal redovisningsapp
   dar writes ar sallan (<100/dag).

   **Slutgiltig strategi: full rebuild efter varje write.**
   `rebuildSearchIndex(db)` anropas fran:
   - `counterparty-service.ts`: `createCounterparty`, `updateCounterparty`
   - `product-service.ts`: `createProduct`, `updateProduct`
   - `manual-entry-service.ts`: `finalizeManualEntry`
   - `correction-service.ts`: `createCorrectionEntry`

   Inga fler anropspunkter — accounts ar statiska (BAS-plan), invoices/expenses
   soker pa counterparty-namn (redan i index) + egna falt (via LIKE-fallback).

### D2 — FTS5: fallback till LIKE vid ej-FTS5 eller trasigt index

**Problem:** FTS5 ar en compile-time extension. Om en framtida SQLite-build
saknar FTS5, failar `CREATE VIRTUAL TABLE`. Dessutom kan FTS5-indexet bli
korrupt (t.ex. vid app-crash mid-rebuild).

**Beslut:** `search-service.ts` forsoker FTS5-sokning forst. Om tabellen
inte finns ELLER query failar (SqliteError), faller tillbaka pa nuvarande
LIKE-baserad sokning. Ingen hard dependency — FTS5 ar en acceleration,
inte ett krav.

Fallback ar aktiv bade nar tabellen saknas OCH nar indexet ar trasigt.
`rebuildSearchIndex`-fail vid startup loggas men kraschar inte appen.

### D3 — F46b: ADD COLUMN vs table-recreate

**Problem:** `invoice_lines` har `CHECK (quantity > 0)` men saknar ovre
grans. `expense_lines` saknar CHECK pa quantity helt. Bada behover
nya/starkare CHECK-constraints.

**SQLite-begransning:** `ALTER TABLE ADD CONSTRAINT` stods inte.
CHECK-constraints kan bara andras via table-recreate.

**Analys av FK-beroenden:**
- `invoice_lines` — bladtabell. Inga inkommande FK. Enbart M121 (trigger-reattach).
- `expense_lines` — bladtabell. Inga inkommande FK. Enbart M121.

**Beslut:** Table-recreate for bada, men UTAN `PRAGMA foreign_keys = OFF`
(M122 galler bara tabeller med inkommande FK). Enklare migration.

**Nya CHECK-constraints:**

```sql
-- invoice_lines (M130: REAL, ≤2 decimaler, max 9999.99)
CHECK (quantity > 0 AND quantity <= 9999.99)

-- expense_lines (M130: INTEGER, min 1, max 9999)
CHECK (quantity >= 1 AND quantity <= 9999)
```

**Obs:** Decimal-precision-CHECK pa invoice_lines (t.ex.
`ROUND(quantity, 2) = quantity`) ar INTE inkluderad. SQLite ROUND
har IEEE 754-kant-fall som gor CHECKEN icke-deterministisk for
vissa varden. Zod-schemat (IPC-lagret) ar precision-vakten.

**Pre-flight-validering (kors FORE table-recreate i migration):**

```sql
-- Verifiera att inga befintliga rader bryter mot nya CHECK-villkor
SELECT COUNT(*) FROM invoice_lines WHERE quantity <= 0 OR quantity > 9999.99 OR quantity IS NULL;
SELECT COUNT(*) FROM expense_lines WHERE quantity < 1 OR quantity > 9999 OR quantity IS NULL;
```

Om nagon query returnerar != 0: migrationen kastar tidigt med tydligt
felmeddelande. INTE mid-recreate.

**INSERT med explicit kolumnlista (M121-forlangning):**

```sql
INSERT INTO invoice_lines_new (id, invoice_id, description, account_number,
  quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore)
  SELECT id, invoice_id, description, account_number,
    quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore
  FROM invoice_lines;
```

ALDRIG `SELECT *` i table-recreate — explicit kolumnlista garanterar att
kolumn-ordning inte driver. Samma princip som M127 (ADD COLUMN-disciplin).

### D4 — F57: response-shape-validering i mock-IPC

**Problem:** `mockIpcResponse(channel, response)` accepterar `unknown` —
ingen validering att response-shapen matchar den typ som `electron.d.ts`
deklarerar. Mock-response kan divergera fran riktig service-return utan
att testet fångar det.

**Nuvarande:** Input valideras via Zod (channelMap i ipc-schemas.ts).
Output: ingen validering.

**Alternativ:**

| Alternativ | Komplexitet | Fordel | Nackdel |
|---|---|---|---|
| A: Zod-schema per response | Hog | Full validering | 50+ nya schemas |
| B: IpcResult-wrapper-validering | Lag | Fangar shape-brott | Validerar inte `data` inre typ |
| C: TypeScript generic pa mockIpcResponse | Medel | Compile-time-vakt | Fangar inte runtime-divergens |

**Beslut: Alternativ B — IpcResult-wrapper-validering med `.strict()`.**

`mockIpcResponse` validerar att response matchar `IpcResult<unknown>`:
- `success: true` → maste ha `data` (any). `.strict()` avvisar extra falt.
- `success: false` → maste ha `error: string`, `code: string`, valfritt `field`
- Ratt yttre form, men validerar INTE `data`-typens inre struktur

**Kand begransning:** F57 fangar inte typ-fel inuti `data` (t.ex.
`data: { id: '42' }` istallet for `data: { id: 42 }`). Oppen finding
F59 for Sprint 34: per-kanal response-schema-validering (Alternativ A).

### D5 — ManualEntryListItem.total_amount → total_amount_ore

**Problem:** `ManualEntryListItem.total_amount` saknar `_ore`-suffix (M119).
Rename ar breaking for renderer.

**Paverkan (verifierad via bredare grep):**

| Fil | Rad | Andring |
|-----|-----|---------|
| `src/shared/types.ts` | 615 | `total_amount: number` → `total_amount_ore: number` |
| `src/main/services/manual-entry-service.ts` | 226 | SQL alias `as total_amount` → `as total_amount_ore` |
| `src/renderer/components/manual-entries/ManualEntryList.tsx` | 128 | `entry.total_amount` → `entry.total_amount_ore` |
| `src/renderer/pages/PageManualEntries.tsx` | 160 | `entry.total_amount` → `entry.total_amount_ore` |
| `src/shared/ipc-schemas.ts` | 363, 691 | `'total_amount'` → `'total_amount_ore'` (om i ManualEntry-relaterade schemas) |
| `tests/session-19-manual-entry.test.ts` | 579 | `list[0].total_amount` → `list[0].total_amount_ore` |
| `tests/session-30-correction-ui.test.tsx` | 16 | `total_amount: 10000` → `total_amount_ore: 10000` |

**Verifiering (bredare grep, sedan smal gate):**

```bash
# Pre-refactor: hitta alla forekomster
grep -rn 'total_amount\b' src/ tests/ | grep -vi total_amount_ore

# Post-refactor gate: noll kvarstaende
grep -rn '\btotal_amount\b' src/ tests/ | grep -i manual | grep -vi total_amount_ore
```

Inga migrationer (kolumnen ar en query-alias, inte en DB-kolumn).

---

## Del A: B6 — FTS5 indexed search

### A0. Migration 033: FTS5 virtual table

**Fil:** `src/main/migrations.ts`

Ny migration — skapa `search_index` FTS5-tabell:

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity_type,
  entity_id UNINDEXED,
  search_text,
  content='',
  tokenize='unicode61 remove_diacritics 2'
);
```

PRAGMA user_version = 33.

### A1. Rebuild-funktioner i search-service.ts

**Fil:** `src/main/services/search-service.ts`

Tva nya exporterade funktioner:

```ts
/**
 * Full rebuild av FTS5-index. Kors vid startup (db.ts) och efter
 * varje write till sokbara entiteter (counterparty, product,
 * manual-entry, correction). ~50ms for 5k rader.
 */
export function rebuildSearchIndex(db: Database.Database): void
```

Steg:
1. `DELETE FROM search_index` (rensa befintligt index)
2. INSERT for varje entitetstyp med explicit mellanslag-separator:
   - **counterparties** (aktiva): `name || ' ' || COALESCE(org_number, '')`
   - **products** (aktiva): `name`
   - **accounts** (aktiva): `account_number || ' ' || name`
   - **journal_entries** (booked/corrected, manual):
     `verification_series || ' ' || CAST(verification_number AS TEXT) || ' ' || description`

   **VIKTIGT:** Mellanslag mellan series och nummer (`'C' || ' ' || '3'` → `'C 3'`).
   Utan mellanslag blir `'C3'` en enda token och sokning pa `'3'` ger ingen traff.
   Verifierat: FTS5 unicode61-tokenizer splittar pa icke-alfanumeriska tecken.

Kors i en enda transaktion for atomicitet.

Invoices och expenses inkluderas INTE i FTS5 — de soker pa counterparty-namn
(redan indexerat) och invoice_number/description (via LIKE-fallback).

### A2. Registrera rebuild vid startup

**Fil:** `src/main/db.ts`

Efter `runMigrations(db)`, wrappat i try-catch:

```ts
import { rebuildSearchIndex } from './services/search-service'

// I getDb(), efter runMigrations:
try {
  rebuildSearchIndex(db)
} catch (err) {
  // FTS5-fail far inte krasha appen — sokning faller tillbaka pa LIKE (D2)
  console.error('FTS5 rebuild failed, falling back to LIKE search:', err)
}
```

### A3. Koppla rebuild efter write-operationer

**Filer som andras:**

| Service | Funktion | Anropsplats |
|---------|----------|-------------|
| `counterparty-service.ts` | `createCounterparty` | Efter success-retur |
| `counterparty-service.ts` | `updateCounterparty` | Efter success-retur |
| `product-service.ts` | `createProduct` | Efter success-retur |
| `product-service.ts` | `updateProduct` | Efter success-retur |
| `manual-entry-service.ts` | `finalizeManualEntry` | Efter success-retur |
| `correction-service.ts` | `createCorrectionEntry` | Efter success-retur |

Monster:
```ts
const result = db.transaction(() => { ... })()
rebuildSearchIndex(db)  // <-- efter lyckad transaction
return { success: true, data: result }
```

Wrappa INTE i try-catch — om rebuild failar ar det ok att logga
men inte att tysta felet. globalSearch faller tillbaka pa LIKE vid
trasigt index (D2).

**Latare: wrappa rebuild i try-catch aven har for robusthet:**
```ts
try { rebuildSearchIndex(db) } catch { /* log only */ }
```

### A4. Uppdatera globalSearch for FTS5-first med prefix-sokning

**Fil:** `src/main/services/search-service.ts`

For counterparties, products, accounts och journal_entries:
1. Forsok FTS5-query med kolumn-filter och prefix-sokning:
   ```sql
   SELECT entity_id FROM search_index
   WHERE search_index MATCH 'entity_type:counterparty AND "escaped_query"*'
   ```
   Kolumn-filter `entity_type:X` ar native FTS5-syntax — filtrering sker
   i FTS5-engineen, inte som post-filter (effektivare).
   Prefix-operator `*` ger token-prefix-match: `östg*` matchar `östgöta`.
2. Anvand matchade entity_ids for att hämta full data fran originaltabell
3. Om FTS5-tabell saknas ELLER query failar (SqliteError), fallback till
   nuvarande LIKE-query

**FTS5 MATCH-syntax:** Anvand phrase-match med prefix:
`'"' + escapeFtsQuery(trimmed) + '"*'`. Ger bade exakt fras OCH prefix.

**Viktigt:** Behall LIKE-fallback for invoices och expenses (ej i FTS5-index).

### A5. FTS5 escape-helper

**Fil:** `src/shared/escape-fts.ts` — ny fil.

```ts
/** Escape FTS5 special characters for safe MATCH queries. */
export function escapeFtsQuery(query: string): string {
  // FTS5 treats " as phrase delimiter — escape by doubling
  return query.replace(/"/g, '""')
}
```

### Tester (A-fasen):

1. FTS5 tabell skapas av migration (`sqlite_master WHERE type='table' AND name='search_index'`)
2. rebuildSearchIndex: counterparty sokbar efter rebuild
3. rebuildSearchIndex: product sokbar efter rebuild
4. rebuildSearchIndex: account sokbar efter rebuild
5. rebuildSearchIndex: journal_entry sokbar efter rebuild
6. rebuildSearchIndex: inaktiva counterparties exkluderade
7. FTS5 accent-stripping: "ostgota" matchar "Östgöta Bygg AB"
8. FTS5 accent-stripping: "ake" matchar "Åke Andersson"
9. FTS5 case-insensitive: "acme" matchar "ACME AB"
10. FTS5 prefix-sokning: "östg" matchar "Östgöta Bygg AB"
11. Fallback: globalSearch fungerar utan search_index-tabell (droppad → LIKE-fallback)
12. Fallback: globalSearch fungerar med trasigt index (INSERT nonsens → fallback)
13. Incremental: ny counterparty sokbar direkt efter create (ej omstart)
14. Incremental: uppdaterad counterparty-namn reflekteras i sokning direkt
15. Perf: FTS5 vs LIKE relativ jamforelse — FTS5 < 50% av LIKE-tid pa 1000 counterparties
16. escapeFtsQuery: dubbelcitat escapas korrekt
17. FTS5 MATCH: literal `%` ar inte wildcard (regression F8)
18. Token-separation: sok "3" matchar verifikat "C 3" (mellanslag-separator)
19. Token-separation: sok "C3" matchar verifikat "C 3" (fras-match)

---

## Del B: F46b — Quantity-CHECK defense-in-depth

### B0. Migration 032: quantity-CHECK constraints

**Fil:** `src/main/migrations.ts`

Ny migration (user_version 32). Separerad fran FTS5 (migration 033)
for granulär rollback — F46b ar defense-in-depth, FTS5 ar ny feature.
Olika risk-profiler.

**Pre-flight-validering (forsta raden i migration):**

```sql
-- Failar migrationen tidigt om befintliga rader bryter mot nya CHECK
SELECT CASE
  WHEN (SELECT COUNT(*) FROM invoice_lines WHERE quantity <= 0 OR quantity > 9999.99) > 0
  THEN RAISE(ABORT, 'F46b pre-flight: invoice_lines has rows violating new CHECK')
END;
SELECT CASE
  WHEN (SELECT COUNT(*) FROM expense_lines WHERE quantity < 1 OR quantity > 9999) > 0
  THEN RAISE(ABORT, 'F46b pre-flight: expense_lines has rows violating new CHECK')
END;
```

**Table-recreate for `invoice_lines`:**

```sql
CREATE TABLE invoice_lines_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  account_number TEXT REFERENCES accounts(account_number),
  quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 9999.99),
  unit_price_ore INTEGER NOT NULL DEFAULT 0,
  vat_code_id INTEGER NOT NULL REFERENCES vat_codes(id),
  line_total_ore INTEGER NOT NULL DEFAULT 0,
  vat_amount_ore INTEGER NOT NULL DEFAULT 0,
  product_id INTEGER REFERENCES products(id)
);

INSERT INTO invoice_lines_new (id, invoice_id, description, account_number,
  quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore, product_id)
  SELECT id, invoice_id, description, account_number,
    quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore, product_id
  FROM invoice_lines;

DROP TABLE invoice_lines;
ALTER TABLE invoice_lines_new RENAME TO invoice_lines;
```

Samma monster for `expense_lines` med `CHECK (quantity >= 1 AND quantity <= 9999)`.

**PRAGMA foreign_keys = OFF behovs INTE** — invoice_lines och expense_lines
har inga inkommande FK (de ar bladtabeller). M122 galler inte.

**VIKTIGT — M121:** Kontrollera EXAKT vilka index och triggers som finns
pa respektive tabell FORE implementering:

```sql
SELECT name, sql FROM sqlite_master
  WHERE tbl_name = 'invoice_lines' AND type IN ('index', 'trigger');
SELECT name, sql FROM sqlite_master
  WHERE tbl_name = 'expense_lines' AND type IN ('index', 'trigger');
```

Alla index och triggers maste aterstellas exakt efter table-recreate.
Missa INGEN — se M121 historik (Sprint 15 S42: trigger tappades tyst).

**OBS kolumnlista:** Använd ALLTID explicit kolumnlista i INSERT (inte
`SELECT *`). `SELECT *` bryts tyst om kolumn-ordning andras i _new-tabellen.

### Tester (B-fasen):

20. invoice_lines: quantity > 9999.99 avvisas av CHECK (direct SQL INSERT)
21. invoice_lines: quantity = 0 avvisas av CHECK
22. invoice_lines: quantity = -1 avvisas av CHECK
23. invoice_lines: quantity = 0.01 accepteras
24. invoice_lines: quantity = 9999.99 accepteras
25. expense_lines: quantity > 9999 avvisas av CHECK
26. expense_lines: quantity = 0 avvisas av CHECK
27. expense_lines: quantity = 1 accepteras
28. expense_lines: quantity = 9999 accepteras
29. Migration smoke-test: befintliga rader bevaras (INSERT → recreate → verify)
30. Index bevarade efter recreate (PRAGMA index_list)
31. Trigger bevarade efter recreate (sqlite_master query)

**OBS test 20–22, 25–26:** Dessa tester anvander direkt SQL INSERT (bypass
Zod) for att verifiera defense-in-depth. Hela poangen ar att CHECK fangar
varden som kringgatt applikations-lagret.

---

## Del C: F57 — Mock-IPC response-shape-validering

### C0. IpcResult-validator i mock-ipc.ts

**Fil:** `tests/setup/mock-ipc.ts`

Lagg till validering i `mockIpcResponse`:

```ts
import { z } from 'zod'

const IpcSuccessSchema = z.object({
  success: z.literal(true),
  data: z.unknown(),
}).strict()  // .strict() avvisar extra falt som inte deklareras

const IpcErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  code: z.string(),
  field: z.string().optional(),
}).strict()

const IpcResultSchema = z.discriminatedUnion('success', [
  IpcSuccessSchema,
  IpcErrorSchema,
])

export function mockIpcResponse(channel: string, response: unknown): void {
  // NO_SCHEMA_CHANNELS returnerar raw data utan IpcResult-wrapper
  if (!NO_SCHEMA_CHANNELS.has(channel)) {
    const parsed = IpcResultSchema.safeParse(response)
    if (!parsed.success) {
      throw new Error(
        `mockIpcResponse('${channel}'): response does not match IpcResult shape. ` +
        `Got: ${JSON.stringify(response).slice(0, 200)}. ` +
        `Error: ${parsed.error.issues[0]?.message ?? 'unknown'}`
      )
    }
  }
  overrides.set(channel, { type: 'response', value: response })
}
```

**`.strict()` motivering:** Fangar extra falt (t.ex. `metadata: {...}`) som
inte ar del av IpcResult-kontraktet. Utan strict() strippar Zod default
dessa tyst.

**Kand begransning (F59 oppen):** Validerar inte `data`-typens inre
struktur. T.ex. `data: { id: '42' }` (string) istallet for `data: { id: 42 }`
(number) passerar. Full per-kanal response-schema-validering ar F59 (Sprint 34+).

### C1. Fixa befintliga mock-responses som bryter mot IpcResult

Steg:
1. Kor testerna efter C0-andringen
2. Identifiera alla mock-responses som failar shape-validering
3. Fixa varje till `{ success: true, data: ... }`

Forvantat: 5-15 mock-responses behover fixas. De flesta ar redan
korrekt formaterade, men nagra returnerar raw data.

### Tester (C-fasen):

32. mockIpcResponse kastar om response saknar `success` (shape-brott)
33. mockIpcResponse kastar om `success: true` men saknar `data`
34. mockIpcResponse kastar om `success: false` men saknar `error`/`code`
35. mockIpcResponse kastar om extra falt finns (`success: true, data: 1, extra: 2`)
36. mockIpcResponse accepterar korrekt `{ success: true, data: ... }`
37. mockIpcResponse accepterar korrekt `{ success: false, error: '...', code: '...' }`
38. NO_SCHEMA_CHANNELS undantas fran shape-validering

---

## Del D: Tech-debt-sweep

### D0. F49-b: Stang som "won't fix"

F49-b (AST-baserad M133-utokning) ar INTE i scope for implementation.

**Motivering:**
- Grep-baserad check (scripts/check-m133.mjs) tacker 100% av
  `axeCheck: false`-regressioner
- AST-baserad `<p>` utan `role="alert"` ar svart att matcha palitligt
  (multi-line JSX, conditional rendering, dynamiska attribut)
- Kostnaden overstiger nyttan

**Atgard:** Dokumentera i STATUS.md under tech debt:
"F49-b stangd som won't fix. Grep-baserad M133-check ar tillracklig.
AST-baserad statisk analys for a11y-monster ar inte motiverad — hellre
runtime axe-checks (befintliga) an AST."

### D1. ManualEntryListItem.total_amount → total_amount_ore (M119)

**Andringspunkter (verifierad via bred grep):**

| # | Fil | Rad | Andring |
|---|-----|-----|---------|
| 1 | `src/shared/types.ts` | 615 | `total_amount: number` → `total_amount_ore: number` |
| 2 | `src/main/services/manual-entry-service.ts` | 226 | SQL alias `as total_amount` → `as total_amount_ore` |
| 3 | `src/renderer/components/manual-entries/ManualEntryList.tsx` | 128 | `entry.total_amount` → `entry.total_amount_ore` |
| 4 | `src/renderer/pages/PageManualEntries.tsx` | 160 | `entry.total_amount` → `entry.total_amount_ore` |
| 5 | `src/shared/ipc-schemas.ts` | 363, 691 | `'total_amount'` → `'total_amount_ore'` (kontrollera om ManualEntry-relaterat) |
| 6 | `tests/session-19-manual-entry.test.ts` | 579 | `list[0].total_amount` → `list[0].total_amount_ore` |
| 7 | `tests/session-30-correction-ui.test.tsx` | 16 | `total_amount: 10000` → `total_amount_ore: 10000` |

Inga migrationer (kolumnen ar en query-alias, inte en DB-kolumn).

**Verifiering:**
```bash
# Pre-refactor: hitta alla forekomster
grep -rn '\btotal_amount\b' src/ tests/ | grep -vi total_amount_ore
# Post-refactor: noll kvarstaende ManualEntry-relaterade
grep -rn '\btotal_amount\b' src/ tests/ | grep -i manual | grep -vi total_amount_ore
```

**OBS:** `total_amount` i ipc-schemas.ts rad 363 och 691 kan vara
invoice/expense-relaterade (dar det redan heter `total_amount_ore` i DB).
Kontrollera kontexten innan andring — andra BARA ManualEntry-relaterade
forekomster.

### D2. E03: data-testid for SupplierPicker och CustomerPicker

**Monster (fran ArticlePicker):**
ArticlePicker accepterar en `testId`-prop och applicerar den pa input-elementet.

**Andringspunkter:**

1. `src/renderer/components/expenses/SupplierPicker.tsx` —
   Lagg till `testId?: string` prop, applicera `data-testid={testId}` pa input.
2. `src/renderer/components/invoices/CustomerPicker.tsx` —
   Samma monster.
3. Anropsplatser: passera `testId` dar pickerna anvands (ExpenseForm, InvoiceForm).
   Format: `testId="expense-supplier"`, `testId="invoice-customer"`.
4. Uppdatera `tests/e2e/README.md` data-testid-whitelist med nya testids.

### Tester (D-fasen):

39. ManualEntryListItem.total_amount_ore: rename verifieras via query (service-test)
40. SupplierPicker: data-testid renderas (renderer-test)
41. CustomerPicker: data-testid renderas (renderer-test)

---

## Fas-ordning och rollback-strategi

| Fas | Scope | Tagg vid klar | PRAGMA | Full test-suite |
|-----|-------|---------------|--------|-----------------|
| 0 | B0: F46b quantity-CHECK migration | `s33-f46b` | 32 | Ja |
| 1 | A0-A5: FTS5 + rebuild + incremental + fallback | `s33-fts5` | 33 | Ja |
| 2 | C0-C1: F57 mock-IPC shape-validering | `s33-f57` | — | Ja |
| 3 | D0-D2: Tech-debt-sweep | `s33-td` | — | Ja |

**Fas-beroenden:**
- Fas 0 (F46b, user_version 32) maste koras fore Fas 1 (FTS5, user_version 33)
- Fas 2 ar oberoende av 0/1
- Fas 3 ar oberoende av 0/1/2

**Rekommendation:** Kor Fas 0 forst (lagre risk, validerar
table-recreate-monstertillämpning). Fas 1 (FTS5) har hogre
komplexitet — om den failar, rulla tillbaka utan att paverka F46b.

**Mellan varje fas: kor full test-suite.** Gor INTE vidare till nasta fas om tester failar.

---

## UTANFOR SCOPE (Sprint 34+)

- **F59** per-kanal response-schema-validering i mock-IPC (D4 Alternativ A)
- **FTS5 for invoices/expenses** — utvidga FTS5-indexet till att
  inkludera invoice_number, expense description
- **FTS5 ranking** — BM25-baserad relevans-ranking istallet for flat list
- **F47** display-lager M131 (backlog, lagrisk)

---

## Manuellt smoke-test-script

### FTS5 (2 min)
1. [ ] Sok "ostgota" → matchar "Östgöta Bygg AB" (accent-stripping)
2. [ ] Sok "ake" → matchar "Åke Andersson" (accent-stripping)
3. [ ] Sok "1510" → konto visas (FTS5-accelererat)
4. [ ] Lagg till ny kund "Nykund AB" → sok "nykund" → traff direkt (incremental)
5. [ ] Droppa search_index → sok igen → resultat via LIKE-fallback

### Quantity-CHECK (2 min)
6. [ ] Skapa faktura med qty 0.01 → accepteras
7. [ ] Skapa faktura med qty 10000 → avvisas av Zod fore CHECK
8. [ ] Skapa kostnad med qty 1 → accepteras
9. [ ] Skapa kostnad med qty 10000 → avvisas
10. [ ] Via direkt SQL: `INSERT INTO invoice_lines (..., quantity, ...) VALUES (..., 10000, ...)` → CHECK-fel

### Mock-IPC (1 min)
11. [ ] Kor alla renderer-tester → inga mock-shape-fel

### Tech-debt (1 min)
12. [ ] `grep -rn '\btotal_amount\b' src/ tests/ | grep -i manual | grep -vi total_amount_ore` → 0 traffar
13. [ ] SupplierPicker har data-testid i DOM

---

## Nya tester per feature — sammanfattning

| Feature | Typ | Antal |
|---------|-----|-------|
| A: FTS5 | Service + unit | 19 |
| B: F46b quantity-CHECK | Schema + migration | 12 |
| C: F57 mock-IPC | Infra | 7 |
| D: Tech-debt-sweep | Mixed | 3 |
| **Totalt** | | **41** |

**Netto nya test-filer:** 3 (session-33-fts5.test.ts, session-33-quantity-check.test.ts,
session-33-mock-ipc-shape.test.ts). Befintlig mock-ipc.test.ts utvidgas.

**Mal:** ~1784+ vitest efter sprinten (1743 baseline + ~41 nya).

---

## Verifiering vid sprint-avslut

```bash
npm run test          # ~1784+ passed
npm run typecheck     # 0 errors
npm run check:m131    # rent
npm run check:m133    # rent
npm run build         # rent
grep -c '\bLOWER(' src/main/services/  # 0
grep -rn '\btotal_amount\b' src/ tests/ | grep -i manual | grep -vi total_amount_ore  # 0
```

- Uppdatera STATUS.md (B6, F46b, F57, F49-b won't-fix, M119-rename, E03)
- Uppdatera CLAUDE.md med ny M-princip for explicit kolumnlista i table-recreate
- Kor manuellt smoke-test-script ovan
- Tagga `s33-done`
