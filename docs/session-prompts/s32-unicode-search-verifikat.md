# Sprint 32 — Unicode-sokning + Verifikat-sokning + Perf-baseline

## Kontext

Sprint 31 levererade global sokning (B3), kontoutdrag URL-sync (B2-polish)
och print-mode. 1714 vitest, 161 testfiler, 0 tsc-fel, PRAGMA user_version 31.
1 oppen finding (F58). 4 tech-debt-items (F46b, F49-b, F57, ManualEntryListItem-rename).

Denna sprint har tre leveranser:
1. **F58** — Unicode-medveten sokning (blocker — aao fungerar inte cross-case)
2. **B5** — Verifikat-sokning i GlobalSearch (sista sokeniteten, D4 fran S31)
3. **F13** — Perf-baseline for sokning (1k rader, median-sampling)

**Testbaslinje:** 1714 vitest passed, 2 skipped (161 testfiler). 11 Playwright E2E.
**Mal:** ~1740+ efter sessionen.
**PRAGMA user_version:** 31. Ingen ny migration planerad.

---

## Relevanta M-principer (inline-sammanfattning)

- **M8/F8:** `escapeLikePattern()` i `src/shared/escape-like.ts` — alla LIKE-fragor
  maste anvanda `ESCAPE '!'`-klausulen.
- **M14:** Alla data-queries scopas till aktivt fiscal_year_id. UNDANTAG: stamdata.
- **M100:** Services kastar strukturerade `{ code, error, field? }`.
- **M128:** Handlers: direkt delegation eller `wrapIpcHandler()`.
- **M140:** Korrigeringsverifikat: en-gangs-las. Korrigering kan inte korrigeras.

---

## 0. Pre-flight

```bash
npm run test        # 1714 passed, 2 skipped (161 testfiler)
npm run typecheck   # 0 errors
npm run check:m131  # rent
npm run check:m133  # rent
npm run build       # rent
```

---

## Kritiska design-beslut

### D1 — Unicode LOWER: custom function vs FTS5

**Problem:** SQLite stock `LOWER()` ar ASCII-only. `LOWER('Å')` returnerar `'Å'`,
inte `'å'`. Cross-case-sokning pa aao fungerar inte. Verifierat i Sprint 31.

**Alternativ:**

| Alternativ | Komplexitet | Fordel | Nackdel |
|---|---|---|---|
| A: `db.function('lower_unicode', ...)` | Lag | JS `toLowerCase()` hanterar Unicode. ~10 rader. | Per-rad-evaluation, ej indexerbar |
| B: FTS5 `unicode61` tokenizer | Hog | Indexerad, accent-stripping, snabb | Virtual table, migration, rebuild-logik |
| C: Hybrid (A nu, B later) | Lag nu | Unblocks F58 direkt, FTS5 som Sprint 33+ | Temporar losning |

**Beslut: Alternativ C.** Registrera `lower_unicode` som custom function. Anvand
i `search-service.ts` (byt ut `LOWER()` → `lower_unicode()`). Enkel, testbar,
lagger grunden for FTS5-migration senare.

**Implementation — `db-functions.ts` (F11 delad helper):**

```ts
// src/main/db-functions.ts
import type Database from 'better-sqlite3'

/**
 * Register all custom SQLite functions. Called from db.ts (production)
 * and create-test-db.ts (test). Single source of truth — adding a
 * function here covers all Database instances.
 *
 * If you create a new Database instance anywhere, you MUST call this.
 */
export function registerCustomFunctions(db: Database.Database): void {
  // Unicode-aware LOWER for Swedish åäö (stock SQLite LOWER is ASCII-only).
  // Uses JS toLowerCase() which is locale-independent in V8.
  // DO NOT change to toLocaleLowerCase — it's locale-sensitive (Turkish İ → ı).
  // Full Unicode normalization (NFKD + accent-strip) is FTS5's job, not this.
  db.function('lower_unicode', { deterministic: true }, (s: unknown) =>
    typeof s === 'string' ? s.toLowerCase() : s
  )
}
```

**Varfor `{ deterministic: true }`:** better-sqlite3 default ar non-deterministic.
Deterministic-flaggan:
- Tillater framtida anvandning i index-uttryck, partial indexes, generated columns
- Ger query planner permission att cache-a resultat inom en query
- Kraver att funktionen alltid returnerar samma output for samma input (sant for toLowerCase)

**Varfor inte `toLocaleLowerCase`:** V8:s `toLowerCase()` ar locale-oberoende
(foljer Unicode default case mapping). `toLocaleLowerCase()` ar locale-kanslig
och hanterar turkiska I→ı annorlunda. Eftersom vi vill ha deterministiskt
beteende oberoende av systemsprak, ar `toLowerCase()` ratt val.

**Kand begransning (eszett):** `'Straße'.toLowerCase()` → `'straße'`, men
`'STRASSE'.toLowerCase()` → `'strasse'`. Sokning pa "strasse" matchar inte
"Straße" (de ar tyska ekvivalenter men inte case-varianter). Dokumentera i
test som kand begransning — full Unicode-normalisering ar FTS5-scope.

**Scope:** Enbart `search-service.ts`. Ovriga services (`listExpenses`, etc.)
anvander SQL-concat-pattern utan `LOWER()` — de ar case-sensitive by design
(M8-arkitekturvakt). Att migrera dem till `lower_unicode` ar utanfor scope.

### D2 — Verifikat-sokning: source_type-diskriminering

**Problem:** `journal_entries` har 10 `source_type`-varden. Vilka ska vara
sokbara, och hur routas resultaten?

**source_type → visningsstrategi:**

| source_type | Serie | Visas i sokning? | Route |
|---|---|---|---|
| `auto_invoice` | A | Nej — tackts av fakturasok | — |
| `auto_payment` | A/B | Nej — betalningsverifikat | — |
| `auto_expense` | B | Nej — tackts av kostnadssok | — |
| `manual` | C | **Ja** | `/manual-entries/view/{me.id}` |
| `auto_bank_fee` | A/B | Nej — systemgenererat | — |
| `opening_balance` | O | Nej — IB-verifikat | — |
| `auto_salary` | — | Nej — framtida | — |
| `auto_depreciation` | — | Nej — framtida | — |
| `auto_tax` | — | Nej — framtida | — |
| `import` | — | Nej — framtida | — |

**Beslut:** Enbart `source_type = 'manual'` ar sokbar i v1. Motivering:
- auto_invoice / auto_expense tackts redan av faktura/kostnadssok
- auto_payment ar betalningsverifikat — sokbar via faktura/kostnad
- manual ar den enda typen dar anvandaren skriver fri description

**Routing:** `manual_entries.journal_entry_id = je.id` → hamt `manual_entries.id`
→ route `/manual-entries/view/{me.id}`.

### D3 — Verifikat-sokning: JOIN-strategi + verifikat-ref-parsning (F4/F6)

**Problem 1 (F6 N+1):** Routing kraver `manual_entries.id` men sokningen gor pa
`journal_entries`. Naivt: N+1 lookup per rad.

**Beslut:** En enda JOIN-query, inte lookup-loop.

**Problem 2 (F4 icke-indexerbar concat + prefix-match):** `verification_series ||
CAST(verification_number AS TEXT) LIKE '%C3%'` ar icke-indexerbart OCH matchar
prefix (C3, C30, C31, ..., C399). Anvandaren menar formodligen exakt C3.

**Beslut: Parsa verifikat-referens service-side.** Om soktermen matchar monstret
`/^([A-Za-zÅÄÖåäö]+)(\d+)$/` → exakt-match pa `verification_series` +
`verification_number`. Annars → enbart description-sok.

```ts
// I service, fore query:
const verRefMatch = trimmed.match(/^([A-Za-zÅÄÖåäö]+)(\d+)$/)
```

**Query med tva grenar:**

```sql
SELECT je.id, je.verification_number, je.verification_series,
       je.description, je.journal_date, je.status,
       je.corrects_entry_id, je.corrected_by_id,
       me.id AS manual_entry_id
FROM journal_entries je
JOIN manual_entries me ON me.journal_entry_id = je.id
WHERE je.fiscal_year_id = :fy
  AND je.status IN ('booked', 'corrected')
  AND je.source_type = 'manual'
  AND (
    lower_unicode(je.description) LIKE lower_unicode(:pattern) ESCAPE '!'
    OR (:is_ver_ref = 1
        AND LOWER(je.verification_series) = :ver_series
        AND je.verification_number = :ver_num)
  )
ORDER BY je.journal_date DESC
LIMIT :lim
```

**Parametrar:**
- `:is_ver_ref` = verRefMatch ? 1 : 0
- `:ver_series` = verRefMatch ? verRefMatch[1].toUpperCase() : ''
- `:ver_num` = verRefMatch ? parseInt(verRefMatch[2], 10) : 0

**Notera:** `LOWER(je.verification_series)` anvander stock LOWER — ok for ASCII
(A, B, C, O). Verifikationsserier ar alltid ASCII.

**Fordel:** Exakt-match pa "C3" (inte prefix C30/C31), anvander index om det
finns pa `(fiscal_year_id, verification_series, verification_number)`.

### D4 — Status-filter: positiv lista (F5 defense-in-depth)

**Problem:** `status != 'draft'` ar skort — framtida nya statusar (t.ex.
`pending_approval`) blir automatiskt sokbara utan medvetet val.

**Beslut:** Anvand `status IN ('booked', 'corrected')` for verifikat-queryn.
Matchar S31-monstret och ar explicit om vilka statusar som exponeras.

Samma andring i befintlig invoice/expense-query: byt
`AND i.status != 'draft'` → `AND i.status IN ('unpaid', 'paid', 'partial', 'overdue', 'credited')`.
Expenses: `AND e.status IN ('unpaid', 'paid', 'partial', 'overdue')`.

---

## Del A: F58 — Unicode-medveten sokning

### A0. Ny delad helper: db-functions.ts (F11)

**Fil:** `src/main/db-functions.ts` — ny fil.

Se D1 ovan for innehall. Exporterar `registerCustomFunctions(db)`.

### A1. Registrera i db.ts

**Fil:** `src/main/db.ts`

Importera och anropa efter pragma, fore runMigrations:

```ts
import { registerCustomFunctions } from './db-functions'

// I getDb(), efter rad 24:
registerCustomFunctions(db)
```

### A2. Registrera i create-test-db.ts

**Fil:** `tests/helpers/create-test-db.ts`

```ts
import { registerCustomFunctions } from '../../src/main/db-functions'

// I createTestDb(), efter rad 15 (pragma), fore migrations:
registerCustomFunctions(testDb)
```

### A3. Byt LOWER → lower_unicode i search-service.ts

**Fil:** `src/main/services/search-service.ts`

Ersatt alla 12 forekomster av `LOWER(` med `lower_unicode(`. Sokbar via
find-replace. Verifiering: `grep -c '\bLOWER(' src/main/services/search-service.ts`
ska ge 0 efter andring (notera `\b` word boundary — undvik false negative fran
"lower_unicode").

### A4. Uppdatera befintliga F58-tester + lagg till nya

**Fil:** `tests/session-31-search-service.test.ts`

Andring: testet `'åäö: cross-case search does NOT match — known limitation F58'`
ska nu MATCHA (expect `true` istallet for `false`). Byt namn till:
`'åäö: cross-case search matches after F58 fix (regression F58)'`.

**Fil:** `tests/session-32-unicode-search.test.ts` — ny fil.

### Tester (A-fasen):

**lower_unicode function tests (parameteriserade):**
1. Parameteriserad: `lower_unicode(input) → expected` for:
   - `('ÅÄÖ', 'åäö')` — karnfall
   - `('Café', 'café')` — accent behalls (inte strippas)
   - `('Mixed123ÅÄÖ', 'mixed123åäö')` — blandat
   - `('', '')` — tom strang
   - `(NULL, NULL)` — SQL NULL passthrough
   - `(42, 42)` — non-string passthrough
2. Deterministic sanity: `db.prepare("SELECT lower_unicode('Å') AS r").get()` → `{ r: 'å' }`
   (verifierar att funktionen ar registrerad och korrekt)

**Kand begransning (negativ test):**
3. `'STRASSE'.toLowerCase()` → `'strasse'` matchar INTE `'Straße'`
   (eszett-folding inte stödd — dokumenterar FTS5-scope)

**Cross-case search (service-niva):**
4. "åke" matchar "Åke Andersson" (uppdaterat D2-test — regression F58)
5. "östgöta" matchar "Östgöta Bygg AB"
6. "ACME" matchar "Acme AB" (ASCII case-regression)

**F8 regression efter migration:**
7. Sok "50%" mot "Rabatt 50% AB" → 1 traff (literal %)
8. Sok "50_" → 0 traffar (literal underscore, inte wildcard)

---

## Del B: B5 — Verifikat-sokning

### B1. Utvidga SearchResultType

**Fil:** `src/shared/search-types.ts`

Lagg till `'journal_entry'` i `SearchResultType`.

### B2. Lagg till verifikat-query i search-service.ts

**Fil:** `src/main/services/search-service.ts`

Lagg till query-block for manuella verifikat (efter accounts, fore return).
Se D3 ovan for komplett query med verifikat-ref-parsning.

**Subtitle-format:** `C3 · 2026-03-15` (serie+nr · datum).
Korrigerade verifikat: title far suffix ` (korrigerad)`.
Korrigeringsverifikat: subtitle far suffix ` · korrigering`.

**Ordning i resultat-array:** Lagg till efter accounts. TYPE_ORDER-ordningen i
GlobalSearch styrs av UI-konstanten (se B3).

### B3. Uppdatera GlobalSearch UI

**Fil:** `src/renderer/components/layout/GlobalSearch.tsx`

Lagg till i `TYPE_LABELS`:
```ts
journal_entry: 'Verifikat',
```

Lagg till i `TYPE_ORDER` (sist, efter 'account'):
```ts
'journal_entry',
```

### Tester (B-fasen):

9. Verifikat-sok: matchar description ("Hyra" → `Cn — Hyra kontor`)
10. Verifikat-sok: exakt-match pa serie+nummer ("C1" → C1, INTE C10/C11/C100)
11. Verifikat-sok: "C1" matchar inte "C10" (exakt-match, inte prefix — D3/F4)
12. Verifikat-sok: FY-scopning (verifikat fran annat FY dyker inte upp)
13. Verifikat-sok: draft-verifikat dyker inte upp
14. Verifikat-sok: route → `/manual-entries/view/{me.id}`
15. Korrigerat verifikat: title far suffix "(korrigerad)"
16. Korrigeringsverifikat: subtitle innehaller "korrigering"
17. Bade original och korrigering visas vid sokning pa gemensam description
18. Invariant: inget verifikat har bade corrects_entry_id OCH corrected_by_id (M140)
19. Status-filter: `status IN ('booked','corrected')` — draft + eventuella framtida
    statusar exkluderade (parameteriserad test per status-varde)
20. TYPE_ORDER har 'journal_entry' sist (ordnings-vakt for framtida andringar)

---

## Del C: F13 — Perf-baseline for sokning

### C1. Perf-test

**Fil:** `tests/session-32-search-perf.test.ts`

**Strategi (F3 flaky-mitigation):**
- Median av 7 korningar (inte single-shot)
- CI-tolerant gate: 500ms pa CI, 200ms lokalt
- :memory: DB (via createTestDb — verifierat)
- Logga median i testoutput for trend-tracking

```ts
describe('globalSearch performance baseline (F13)', () => {
  it('1000 counterparties + search median < gate', () => {
    const db = createTestDb()
    createCompany(db, {
      name: 'Perf AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2' as const,
      share_capital: 2_500_000,
      registration_date: '2026-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    })
    const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }

    // Seed 1000 counterparties
    const insert = db.prepare(
      "INSERT INTO counterparties (name, type) VALUES (?, 'customer')"
    )
    db.transaction(() => {
      for (let i = 0; i < 1000; i++) {
        insert.run(`Företag ${i} AB`)
      }
    })()

    // Warm up (JIT + prepared statement cache)
    for (let i = 0; i < 3; i++) {
      globalSearch(db, { query: 'Företag 500', fiscal_year_id: fy.id })
    }

    // Measure median of 7 runs
    const samples: number[] = []
    for (let i = 0; i < 7; i++) {
      const start = performance.now()
      globalSearch(db, { query: 'Företag 5', fiscal_year_id: fy.id })
      samples.push(performance.now() - start)
    }
    samples.sort((a, b) => a - b)
    const median = samples[3]  // p50

    // CI-tolerant gate
    const isCI = process.env.CI === 'true'
    const limit = isCI ? 500 : 200
    console.log(`  globalSearch median: ${median.toFixed(1)}ms (gate: ${limit}ms)`)
    expect(median).toBeLessThan(limit)

    db.close()
  })

  it('1000 manual verifikat + verifikat-sok median < gate', () => {
    // Seedar 1000 manuella verifikat och soker pa description + ref
    // Verifierar att JOIN-queryn inte ar markant saktare an counterparty-scan
    const db = createTestDb()
    createCompany(db, {
      name: 'Perf AB',
      org_number: '556036-0793',
      fiscal_rule: 'K2' as const,
      share_capital: 2_500_000,
      registration_date: '2026-01-15',
      fiscal_year_start: '2026-01-01',
      fiscal_year_end: '2026-12-31',
    })
    const fy = db.prepare('SELECT id FROM fiscal_years LIMIT 1').get() as { id: number }
    const companyId = db.prepare('SELECT id FROM companies LIMIT 1').get() as { id: number }

    // Seed 1000 booked manual entries via direct SQL (faster than service calls)
    db.transaction(() => {
      for (let i = 0; i < 1000; i++) {
        const je = db.prepare(`
          INSERT INTO journal_entries (company_id, fiscal_year_id, verification_number,
            verification_series, journal_date, description, status, source_type)
          VALUES (?, ?, ?, 'C', '2026-03-15', ?, 'booked', 'manual')
        `).run(companyId.id, fy.id, i + 1, `Hyra kontor ${i}`)

        db.prepare(`
          INSERT INTO manual_entries (fiscal_year_id, entry_date, description,
            status, journal_entry_id)
          VALUES (?, '2026-03-15', ?, 'finalized', ?)
        `).run(fy.id, `Hyra kontor ${i}`, je.lastInsertRowid)

        // Add balanced journal lines so the entry is valid
        db.prepare(`
          INSERT INTO journal_entry_lines (journal_entry_id, account_number,
            debit_ore, credit_ore, line_number)
          VALUES (?, '5010', 100000, 0, 1)
        `).run(je.lastInsertRowid)
        db.prepare(`
          INSERT INTO journal_entry_lines (journal_entry_id, account_number,
            debit_ore, credit_ore, line_number)
          VALUES (?, '1930', 0, 100000, 2)
        `).run(je.lastInsertRowid)
      }
    })()

    // Warm up
    for (let i = 0; i < 3; i++) {
      globalSearch(db, { query: 'Hyra kontor 500', fiscal_year_id: fy.id })
    }

    // Measure description search
    const descSamples: number[] = []
    for (let i = 0; i < 7; i++) {
      const start = performance.now()
      globalSearch(db, { query: 'Hyra kontor 5', fiscal_year_id: fy.id })
      descSamples.push(performance.now() - start)
    }
    descSamples.sort((a, b) => a - b)
    const descMedian = descSamples[3]

    // Measure ref search
    const refSamples: number[] = []
    for (let i = 0; i < 7; i++) {
      const start = performance.now()
      globalSearch(db, { query: 'C500', fiscal_year_id: fy.id })
      refSamples.push(performance.now() - start)
    }
    refSamples.sort((a, b) => a - b)
    const refMedian = refSamples[3]

    const isCI = process.env.CI === 'true'
    const limit = isCI ? 500 : 200
    console.log(`  verifikat desc median: ${descMedian.toFixed(1)}ms, ref median: ${refMedian.toFixed(1)}ms (gate: ${limit}ms)`)
    expect(descMedian).toBeLessThan(limit)
    expect(refMedian).toBeLessThan(limit)

    db.close()
  })
})
```

### Tester (C-fasen):

21. Perf: 1000 counterparties + search median < gate (200ms lokal / 500ms CI)
22. Perf: 1000 verifikat + description-sok + ref-sok median < gate

---

## Fas-ordning och rollback-strategi

| Fas | Scope | Tagg vid klar | Full test-suite |
|-----|-------|---------------|-----------------|
| 0 | A0: db-functions.ts helper (F11) | — | Ja |
| 1 | A1-A4: lower_unicode registrering + F58 fix + tester | `s32-f58` | Ja |
| 2 | B1-B3: Verifikat-sokning + tester | `s32-b5` | Ja |
| 3 | C1: Perf-baseline | `s32-perf` | Ja |

**Fas-beroenden:**
- Fas 0 → Fas 1: lower_unicode-registrering beror pa db-functions.ts
- Fas 1 → Fas 2: B5 anvander `lower_unicode()` i verifikat-query
- Fas 3 beror pa Fas 2 (verifikat-perf-test beror pa B5-queryn)

**Rollback:** Varje fas taggas. Vid regression: `git revert` till forega tagg.

**Mellan varje fas: kor full test-suite.** Gor INTE vidare till nasta fas om tester failar.

---

## UTANFOR SCOPE (Sprint 33+)

### Planerade
- **FTS5 virtual table** med `unicode61` tokenizer — ersatter LIKE-scan,
  loser perf for 10k+ rader, accent-stripping ("ostgota" → "Östgöta"),
  eszett-folding ("strasse" → "Straße")
- **lower_unicode migration for listExpenses/listInvoices** — gor befintlig
  list-sokning cross-case-medveten (for narvarande ASCII-only)
- **F57** mock-IPC response-shape-validering
- **F46b** DB-CHECK defense-in-depth for quantity
- **Smart search ranking** — verifikat-ref-pattern → visa verifikat-grupp forst

### Tech debt (registrerat)
- **F49-b** AST-baserad M133-utokning
- **ManualEntryListItem.total_amount** M119-rename (breaking)
- **E03** supplier-picker data-testid

---

## Manuellt smoke-test-script

### Unicode-sokning (1 min)
1. [ ] Sok "åke" → matchar "Åke" (cross-case aao)
2. [ ] Sok "ACME" → matchar "Acme AB" (regression)
3. [ ] Sok "50%" → matchar literal procent (F8 regression)

### Verifikat-sokning (2 min)
4. [ ] Skapa manuell bokforingsorder "Hyra kontor" → bokfor → notera Cn
5. [ ] Sok "Hyra" → verifikat visas med "Cn — Hyra kontor"
6. [ ] Klicka → navigeras till `/manual-entries/view/{id}`
7. [ ] Sok "Cn" (det tilldelade numret) → exakt-match
8. [ ] Korrigera verifikatet → notera Cm
9. [ ] Sok "Hyra" igen → bade original (Cn, med "(korrigerad)") och korrigering (Cm) visas
10. [ ] Sok "Cm" → hittar korrigeringsverifikatet med "korrigering" i subtitle

### Regression (1 min)
11. [ ] Sok "1510" → konto visas, klick → kontoutdrag med URL-params
12. [ ] Sok fakturanummer → faktura visas, klick → ratt route
13. [ ] Ctrl+K → fokuserar sok, Escape → stanger

---

## Nya tester per feature — sammanfattning

| Feature | Typ | Antal |
|---------|-----|-------|
| A: lower_unicode + F58 | Unit (param) + service | 8 |
| B: Verifikat-sokning | Service | 12 |
| C: Perf-baseline | Performance | 2 |
| **Totalt** | | **22** |

**Detalj A-fas (8):** 6 parameteriserade function-tests + 1 deterministic sanity +
1 eszett-begransning + 3 cross-case search + 2 F8-regression = 13 test-cases
i ~8 `it()`-block (parameteriserade raknades som 1 block med 6 cases).

**Uppdaterad befintlig:** 1 test i session-31 (D2 cross-case → nu matchar).

**Netto nya test-filer:** 2 (session-32-unicode-search.test.ts, session-32-search-perf.test.ts).
**Mal:** ~1736+ vitest efter sprinten (1714 baseline + ~22 nya).

---

## Verifiering vid sprint-avslut

```bash
npm run test          # ~1736+ passed
npm run typecheck     # 0 errors
npm run check:m131    # rent
npm run check:m133    # rent
npm run build         # rent
grep -c '\bLOWER(' src/main/services/search-service.ts  # 0 (alla ersatta med lower_unicode)
```

- Uppdatera STATUS.md (F58 stangd, B5 levererad, perf-baseline etablerad, F13 stangd)
- Kor manuellt smoke-test-script ovan
- Tagga `s32-done`
