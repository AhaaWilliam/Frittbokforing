# Fritt Bokforing -- Projektstatus

## Sprint 33 -- FTS5 + Quantity-CHECK + Tech-debt-sweep ✅ KLAR

Session S33. B6 (FTS5 indexed search), F46b (quantity-CHECK defense-in-depth),
F57 (mock-IPC response-shape validation), TD-sweep (F49-b won't-fix, M119 rename, E03 testIds).

**Testbaslinje:** 1743 → 1776 vitest (+33). 167 testfiler.
**PRAGMA user_version:** 31 → 33 (migration 032: quantity-CHECK, migration 033: FTS5).
**Nya filer:** escape-fts.ts, session-33-fts5.test.ts, session-33-quantity-check.test.ts, session-33-mock-ipc-shape.test.ts.

### Del A: B6 — FTS5 indexed search

**Migration 033** — FTS5 virtual table:
- `search_index` med `tokenize='unicode61 remove_diacritics 2'`
- Accent-stripping: "ostgota" matchar "Östgöta", "ake" matchar "Åke"
- Non-contentless (content stored) — entity_id retrievable after MATCH

**search-service.ts** — FTS5-first with LIKE fallback:
- Counterparties, products, accounts: FTS5 MATCH → join back to source table
- Invoices, expenses: LIKE only (FY-scoped, not in FTS5 index)
- Journal entries: LIKE only (verRef-parsing "C1" → exact match required)
- Fallback: if search_index missing or corrupt, falls back to LIKE silently

**rebuildSearchIndex** — full rebuild after every write:
- Called at startup (db.ts) and after create/update in 4 services
- Wrapped in try-catch — failure doesn't crash the app
- ~50ms for 5k rows

**escape-fts.ts** — FTS5 special character escaping (double-quote doubling).

**14 nya tester** (migration, rebuild, accent-stripping, case-insensitive, prefix, fallback, incremental, escape, F8 regression).

### Del B: F46b — Quantity-CHECK defense-in-depth

**Migration 032** — table-recreate for invoice_lines and expense_lines:
- `invoice_lines`: `CHECK (quantity > 0 AND quantity <= 9999.99)` (M130: REAL)
- `expense_lines`: `CHECK (quantity >= 1 AND quantity <= 9999)` (M130: INTEGER)
- Pre-flight validation: fails early if existing rows violate new CHECK
- M121 compliance: index + trigger (cross-table) recreated after DROP
- No PRAGMA foreign_keys OFF needed — both are leaf tables

**12 nya tester** (direct SQL bypass CHECKs, boundary values, migration smoke, index/trigger preservation).

### Del C: F57 — Mock-IPC response-shape validation

**mock-ipc.ts** — IpcResult shape validation:
- `mockIpcResponse` validates response against `IpcResultSchema` (Zod discriminated union)
- `.strict()` rejects extra fields
- NO_SCHEMA_CHANNELS exempt (channels returning raw data without IpcResult wrapper)
- Known limitation (F59): validates outer IpcResult shape only, not `data` inner type

**7 nya tester** (shape-brott, strict-mode, correct responses, exempt channels).

### Del D: Tech-debt-sweep

**D0: F49-b stängd som won't fix.**
Grep-baserad M133-check är tillräcklig. AST-baserad statisk analys för a11y-mönster
är inte motiverad — hellre runtime axe-checks (befintliga) än AST.

**D1: ManualEntryListItem.total_amount → total_amount_ore (M119).**
Rename across 7 files: types.ts, manual-entry-service.ts, ManualEntryList.tsx,
PageManualEntries.tsx, 2 test files. Inga migrationer (query alias, inte DB-kolumn).

**D2: E03 — SupplierPicker + CustomerPicker testId.**
Both components now accept `testId?: string` prop, applied to input element.
Follows ArticlePicker pattern.

### Stängda findings
- **B6** FTS5 indexed search: STÄNGD
- **F46b** quantity-CHECK defense-in-depth: STÄNGD
- **F57** mock-IPC shape validation: STÄNGD (F59 öppen för per-kanal response-schema)
- **F49-b** AST-baserad M133: STÄNGD (won't fix)
- **M119** ManualEntryListItem rename: STÄNGD
- **E03** SupplierPicker/CustomerPicker testId: STÄNGD

### Backlog: 0 öppna findings
F59 (per-kanal response-schema-validering) öppen som Sprint 34+ kandidat.

## Sprint 32 -- Unicode-sokning + Verifikat-sokning + Perf-baseline ✅ KLAR

Session S32. F58 (Unicode-medveten sokning), B5 (verifikat-sokning i GlobalSearch),
F13 (perf-baseline).

**Testbaslinje:** 1714 → 1743 vitest (+29). 164 testfiler.
**PRAGMA user_version:** 31 (oforandrat — ingen ny migration).
**Nya filer:** db-functions.ts, session-32-unicode-search.test.ts, session-32-verifikat-search.test.ts, session-32-search-perf.test.ts.

### Del A: F58 — Unicode-medveten sokning

**db-functions.ts** — ny delad helper:
- `registerCustomFunctions(db)` registrerar `lower_unicode` som custom SQLite-funktion
- Anvander JS `toLowerCase()` (locale-oberoende, deterministisk)
- `{ deterministic: true }` for framtida index-anvandning
- Registreras i db.ts (produktion) och create-test-db.ts (test)

**search-service.ts** — alla 12 `LOWER()` ersatta med `lower_unicode()`:
- Cross-case-sokning pa aao fungerar nu ("åke" → "Åke Andersson")
- Kand begransning: eszett-folding ej stödd (FTS5-scope)

**Status-filter hardening (D4):**
- Fakturor: `status != 'draft'` → `status IN ('unpaid','paid','partial','overdue','credited')`
- Kostnader: `status != 'draft'` → `status IN ('unpaid','paid','partial','overdue')`

**8 nya tester** (parameteriserade function-tests + cross-case + F8-regression).

### Del B: B5 — Verifikat-sokning

**search-service.ts** — ny query-block for manuella verifikat:
- LEFT JOIN `manual_entries` + `manual_entries orig_me` for bidirectional routing
- Verifikat-ref-parsning: `C3` → exakt-match (serie='C', nummer=3), ej prefix C30/C31
- `status IN ('booked', 'corrected')`, `source_type = 'manual'`
- Korrigerade verifikat: title far suffix "(korrigerad)"
- Korrigeringsverifikat: subtitle far "korrigering", routes till originalets vy med `?highlight=Cn`
- Bidirectional findability: bade original och korrigering sokbara

**search-types.ts** — `'journal_entry'` tillagd i `SearchResultType`.

**GlobalSearch.tsx** — ny typ-label "Verifikat", sist i TYPE_ORDER.

**14 nya tester** (description-match, ref-match, prefix-guard, FY-scoping, draft-exclude, routing, correction-status, correction-routing-highlight, correction-searchable-by-own-ref, M140-invariant).

### Del C: F13 — Perf-baseline

**session-32-search-perf.test.ts:**
- 1000 counterparties + search: median av 7 korningar < 200ms (lokal) / 500ms (CI)
- 1000 manuella verifikat + description-sok + ref-sok: samma gate
- Loggar median i testoutput for trend-tracking

**2 nya perf-tester.**

### Stangda findings
- **F58** aao-diakritik i sokning: STANGD (lower_unicode custom function)
- **F13** perf-baseline: STANGD (etablerad med 2 gate-tester)

### Close-out review fix
Korrigeringsverifikat gjordes sokbara (Option A): LEFT JOIN + route till originalets vy med `?highlight=Cn`.
Bidirectional findability: "C12" hittar korrigeringen, "Hyra" visar bade original och korrigering.
+2 tester (correction routing, correction searchable by own ref).

### Backlog: 0 oppna findings

## Sprint 31 -- Global sokning + Kontoutdrag-polish ✅ KLAR

Session S31. B2-polish (URL-sync, subtractMonths, print) + B3 (global sokning).

**Testbaslinje:** 1657 → 1714 vitest (+57). 161 testfiler.
**PRAGMA user_version:** 31 (oforandrat — ingen ny migration).
**Nya filer:** search-service.ts, search-types.ts, GlobalSearch.tsx, date-utils.test.ts, router-params.test.ts.

### Del A: B2-polish — URL-sync + subtractMonths + print

**A1: Router URL-params**
- `getHashPath()` strippar query params fore route-matching
- Nya exports: `getHashParams()`, `setHashParams()` (replaceState — ingen history-pollution)
- 7 router-param tester

**A2: PageAccountStatement URL-sync**
- Filter-state (konto, from, to) synkas till URL: `#/account-statement?account=1510&from=2026-01-01&to=2026-04-15`
- Aterstarks fran URL vid mount (forutsattning for B3 konto-routing)

**A3: subtractMonths**
- `subtractMonths(dateStr, months)` i `src/shared/date-utils.ts`
- Dag-clamp for Feb/30-dags-manader, cross-year, skottar
- `defaultDateFrom()` refaktorerad till enrad via subtractMonths
- 19 tester (10 subtractMonths + 9 defaultDateFrom)

**A4: Print-mode**
- Print-knapp i PageHeader (samma monster som PageReports)
- `print:hidden` pa filter-sektion, `print:block` pa konto/period-header
- 3 renderer-tester

### Del B: B3 — Global sokning

**search-service.ts** — 6 sokeniteter:
| Entitet | Sok-falt | WHERE-filter | Route |
|---------|----------|--------------|-------|
| Fakturor | invoice_number, cp.name | FY-scopad, status != draft | `/income/view/{id}` |
| Kostnader | supplier_invoice_number, description, cp.name | FY-scopad, status != draft | `/expenses/view/{id}` |
| Kunder | name, org_number | type IN (customer, both), is_active | `/customers/{id}` |
| Leverantorer | name, org_number | type IN (supplier, both), is_active | `/suppliers/{id}` |
| Artiklar | name | is_active | `/products/{id}` |
| Konton | account_number, name | is_active | `/account-statement?account={nr}` |

- D1 counterparty-diskriminering: type=both visas i bada grupper
- D2 aao case: SQLite stock LOWER() ar ASCII-only — LOWER('Å')='Å'. Same-case aao fungerar, cross-case gor det inte. F58 oppen.
- D4 verifikat-sokning: skippat i v1 (95% av use-cases tackta)
- LIKE-escape via `escapeLikePattern()` (M8/F8)
- 20 service-tester + 4 IPC contract-tester

**GlobalSearch.tsx** — ARIA combobox:
- Placerad i Sidebar under header
- Ctrl+K / Cmd+K global kortvar
- Debounce 300ms, min 2 tecken
- Grupperad dropdown med typ-rubriker, max 5/grupp, max 20 totalt
- ArrowUp/Down/Enter/Escape tangentnavigering
- 7 renderer-tester inkl axe-check

**IPC:** `search:global` kanal, Zod-schema (min(2), max(200), strict), M128 direkt delegation.

### Tech debt update
- **PageAccountStatement URL-sync** (punkt 5 i tech debt): STANGD i denna sprint.
- Ovriga tech debt-items oforandrade.

### Backlog: 1 oppen finding
- **F58** aao-diakritik i sokning: SQLite stock LOWER() ar ASCII-only. Cross-case-sokning pa aao fungerar inte. Fix-alternativ: (1) `db.function('lower_unicode', s => s.toLowerCase())` — billigast, (2) FTS5 med unicode61-tokenizer — bast langterm. Sprint 32 kandidat.

Alla Sprint 29-planerade B-features levererade (B1, B2, B3, B4).

## Sprint 30 -- Kontoutdrag-UI + Korrigeringsverifikat ✅ KLAR

Session S30. B2 UI (kontoutdrag-sida) + B4 (korrigeringsverifikat).

**Testbaslinje:** 1604 → 1657 vitest (+53). 156 testfiler.
**PRAGMA user_version:** 30 → 31 (migration 031: 4 immutability-triggers).
**Nya filer:** PageAccountStatement.tsx, correction-service.ts.
**Nya M-principer:** M138 (4-lager-skydd) och M139 (korsreferens i description) tillämpade.

### Del A: B2 UI — Kontoutdrag
- Service utvidgad med `summary`-objekt (opening_balance, total_debit, total_credit, closing_balance, transaction_count)
- Ny sida PageAccountStatement med konto-dropdown (grupperad per klass), datumfilter, (D)/(K)-suffix
- Route `/account-statement`, sidebar-länk under Rapporter
- Hook `useAccountStatement` + query key
- 9 tester (2 service + 7 renderer inkl axe)

### Del B: B4 — Korrigeringsverifikat
**Migration 031 (4 triggers):**
- `trg_immutable_source_type`: blockerar source_type-ändring på bokförda
- `trg_immutable_source_reference`: blockerar source_reference-ändring på bokförda
- `trg_immutable_corrects_entry_id`: blockerar corrects_entry_id-ändring på bokförda
- `trg_no_correct_with_payments`: blockerar status→'corrected' vid beroende betalningar (via invoice/expense join)

**correction-service.ts:**
- `createCorrectionEntry`: atomär omvänd bokning (swap debit↔credit), C-serie, M139-referens i description
- `canCorrectEntry`: guard-check utan sidoeffekt (för UI)
- Guards: not-booked, already-corrected, is-correction (Q12), has-payments (Q7), FY-closed, period-closed
- Cross-FY stöds (Q11): korrigering i aktivt FY med referens till original i stängt FY

**UI-integration:**
- IPC: `journal-entry:correct`, `journal-entry:can-correct` med Zod-scheman
- ManualEntryList: "Korrigerad" (röd) och "Korrigering" (blå) badges, klickbar vy
- PageManualEntries: ny view-subvy med "Korrigera"-knapp + ConfirmDialog
- 35 tester (6 migration, 18 service, 7 IPC-schema, 4 renderer)

### Backlog: 0 öppna findings
B3 (global sökning) skjuten till Sprint 31.

## Sprint 29 -- UX-polish + Kontoutdrag ✅ KLAR

Session S29. 7 findings stängda (F50–F56) + 2 features (B1 testhardering, B2 kontoutdrag-service).

**Testbaslinje:** 1566 → 1604 vitest (+38). 150 testfiler.
**PRAGMA user_version:** 30 (oförändrat — inga nya migrationer).
**Nya komponenter:** ConfirmDialog, Tooltip, AccountStatementService.

### Del A: UX-fixar
| Finding | Fix |
|---------|-----|
| F50 | ConfirmDialog ersätter window.confirm i InvoiceForm + ExpenseForm. 7 tester. |
| F51 | Företagsnamn/org.nr redan read-only i UI — ingen ändring krävs. |
| F52 | Backup-restore: validering, pre-restore-backup, atomic rename, user_version-hantering. 8 tester. |
| F53 | YearPicker timezone-fix: string-slice istället för new Date().getFullYear(). |
| F54 | Tooltip-komponent med aria-describedby + hover/focus. 6 tester. |
| F55 | A11y: M133 rent, inga nya violations. |
| F56 | minWidth: 900, minHeight: 600 på BrowserWindow. |

### Del B: Features
| Feature | Scope |
|---------|-------|
| B1 | 6 tester: partiell kreditering med justerad qty, blandade momssatser 25%+12%, balanscheck. |
| B2 | AccountStatementService: running balance från 0, O-serie sorterad först, named params, datumfilter. 7 tester. UI-sida ej inkluderad — service+IPC klart. |

### Backlog: 0 öppna findings
Alla F50–F56 stängda. B2 renderer-sida kvarstår som feature-backlog (ej bug).

## Sprint 27 -- TSC strict + Fas 6 cleanup ✅ KLAR

Session S27. TSC strict: 37→0 fel (alla i testfiler). Fas 6: alla 5 kvarvarande
findings stängda. Ny M-princip: M136. Migration 028.

**Testbaslinje:** 1550 vitest (oförändrat — inga nya tester, bara fixar).
**Ny M-princip:** M136 (_kr-suffix-konvention för form-types).
**PRAGMA user_version:** 27 → 28. **Tabeller:** 23 → 22 (verification_sequences droppad).

### TSC strict: 37 → 0
- Kategori A (24 fel): `extends object` istället för `extends Record<string, unknown>` i useEntityForm + FormField/FormSelect/FormTextarea + useTestForm
- Kategori B (8 fel): dubbel-cast via `unknown` för ElectronAPI/Window
- Kategori C-F (5 fel): axeResults null-guard, saknad payment_id, stale class_filter, felaktig ErrorCode
- `npm run typecheck` tillagt i CI

### Fas 6: alla 5 findings stängda
| Finding | Fix |
|---------|-----|
| F39 | M136: dokumenterad _kr-suffix-konvention i CLAUDE.md |
| F28 | SIE5 serie C → "Manuella verifikationer", +serie O |
| F20 | VAT-report SQL bind variables istället för template literals |
| F7 | Migration 028: DROP verification_sequences + RENAME payment_terms_days → payment_terms |
| F25 | getUsedAccounts: enbart bokförda konton + IB-täckning (inte alla aktiva) |

### Backlog: 0 öppna findings
Hela Fas 6-listan stängd. Inga kvarvarande findings.

## Sprint 26 -- B-light: user-facing fixar + CI ✅ KLAR

Session S26. Tre user-facing buggar (F35, F38, F8) fixade + GitHub Actions CI etablerad.
Ingen ny affärslogik, inga nya M-principer.

**Testbaslinje:** 1529 → 1550 vitest (+21).

### F35 stängd
ExpenseLineRow HTML `min={0}` → `min={1}`. Backend Zod fångade redan qty=0
men HTML-input tillät det visuellt. 1 test.

### F38 stängd
ManualEntryForm diff visade `Math.abs(diff)` utan riktning. Nu visar
"(debet > kredit)" eller "(kredit > debet)". Beräkningslogik extraherad
till `manual-entry-calcs.ts` för testbarhet. 7 tester.

### F8 stängd
Söktermer med `%` eller `_` tolkades som SQL-wildcards. Ny helper
`escapeLikePattern()` i `src/shared/escape-like.ts` med `ESCAPE '!'`.
4 services migrerade (invoice, expense, product, counterparty).
Arkitektur-vakt (`like-escape-audit.test.ts`) förhindrar regression. 13 tester.

### CI etablerad
`.github/workflows/ci.yml` — ubuntu-only, lint + M131/M133-checks + test + build.
Node 20 via `.node-version`. Inget tsc (91 pre-existing errors), ingen E2E (kräver xvfb).

## Sprint 25 -- F40 VAT-testhardering ✅ KLAR

Session S25. F40 (moms-skalning otestad i InvoiceTotals) stängd.
Ingen produktionskod ändrad — enbart testhardering.

**Testbaslinje:** 1511 → 1529 vitest (+18).
**Ny M-princip:** M135 (dual-implementation paritetstest med delad fixture).
**Ny shared fixture:** `tests/fixtures/vat-scenarios.ts`.

### F40 stängd
18 nya tester via shared fixture (6 scenarios × 3 testlager):
- 6 isolerade VAT-skalning i InvoiceTotals (B5, renderer)
- 6 backend processLines VAT via saveDraft→getDraft
- 6 renderer↔backend paritets-tester (divergens-vakt)

S25 research bekräftade: ingen beräkningsdivergensbugg — renderer och backend
använder identisk M131 Alt B-formel. Sprinten var testhardering, inte bugfix.

### Process-audit-resultat
S24b/S25 process-audit stängde totalt 6 stale findings (F3, F9, F14, F19, F41, F43)
plus F4 och F40 via sprint-arbete. Backlog: 18 → 10 öppna (1 🟡 F39, 9 🟢 Fas 6).

### Prompt-mall-validering (S24b-lärdomar)
1. Return-shape preflight (0.1.D): Fungerade — nästlad shape `InvoiceWithLines.lines[].vat_amount_ore` fångades korrekt.
2. Export-status preflight (0.1.C): Load-bearing — styrde testdesign till saveDraft→getDraft istället för privat processLines.
3. Ingen miljö-överraskning (jfr S24b:s 5 issues) — testinfrastruktur mognare för ren test-sprint.

## Sprint 24b -- BR-result-konsistens + F4 comparator-cleanup ✅ KLAR

Session S24b. F19 (BR oberoende netResult-beräkning) och F4 (latent
lexikografisk kontonummerjämförelse) stängda.

**Testbaslinje:** 1493 → 1511 vitest (+18) + 1 E2E.
**Ny M-princip:** M134 (BR årets resultat via result-service).
**Ny shared helper:** `compareAccountNumbers` (`src/shared/account-number.ts`).

### F19 stängd
BR:s `calculatedNetResult` läser nu från `calculateResultSummary().netResultOre`.
Acceptanskriteriet bekräftat via:
- 3 BR/RR-konsistens-tester (positivt med klass 8, negativt, noll)
- 1 all-consumers-identical-test (permanent vakt över 4 konsument-vägar)
- 1 E2E (klass 8 + 89xx-skatt-scenario, locale-oberoende via data-raw-ore)

### F4 stängd
6 A/B-träffar fixade: 5 SQL `ORDER BY CAST(account_number AS INTEGER)` +
1 application-layer `localeCompare → compareAccountNumbers`. C-träffar
(defensiva single-char prefix-checks) lämnade orörda.

### Process-finding (S24a)
Stale backlog-items ska auditeras mot M-regler vid sprint-avslut. F19 var
i backlog som "tre olika definitioner av årets resultat" men Sprint 11
(M96–M98) etablerade `result-service.ts` som single source of truth utan
att stänga findingen. **Ny rutin:** vid sprint-avslut auditeras alla
refererade findings i sprint-scope mot M-reglerna som etablerats — om
findingen är löst av en M-regel ska den stängas i samma commit, inte
överleva som öppen i backlog.

### S24c-finding: Schema-constraint på account_number
Lägg till `CHECK(length(account_number) BETWEEN 4 AND 5)` på `accounts`-
tabellen som permanent F4-vakt. Kräver M122 table-recreate (FK från 6
tabeller). Inte i scope för S24b eftersom CAST + compareAccountNumbers är
tillräckligt defense-in-depth givet att SIE-import inte existerar.

**Eskaleringstriggers — flytta till sprint om något inträffar:**
1. Import-väg läggs till (SIE-import, CSV-import, eller motsvarande)
2. BAS-uppdatering ger 5-siffriga konton som standard
3. Backup-restore visar sig kringgå application-layer-validering

### Follow-up: data-testid för Dashboard + Tax
Dashboard och Tax-vyn renderar också "årets resultat" men fick inte
`data-testid="arets-resultat-value"` i denna sprint eftersom acceptans-
kriteriet bara krävde RR + BR. Lägg till samma kontrakt vid nästa
beröring av dessa vyer för framtida E2E-utvidgning.

## Sprint 21 -- M131-precision + CI-verifiering ✅ KLAR (2026-04-14)

Session S68: F47 display-lager (InvoiceLineRow + ExpenseLineRow Alt B),
F48 IPC-precision-gate (invoice channels), M131 grep-check med självtest.
Testbaslinje: 1464 → 1472. Hela M131-ytan nu konsekvent: service (S20) +
totals (S20) + display (S68a/b) + IPC-gate (S68c) + statisk verifiering (S68d).

### Sprint 21 sessioner
| Session | Scope | Status |
|---------|-------|--------|
| S68a | F47: InvoiceLineRow Alt B + DOM-smoke | KLAR |
| S68b | F47: ExpenseLineRow Alt B + Zod-regression-guard | KLAR |
| S68c | F48: IPC decimal-precision-gate | KLAR |
| S68d | M131 grep-check med självtest | KLAR |

## Sprint 20 -- M131 heltalsaritmetik ✅ KLAR (2026-04-14)

Sessioner: S67a (F45 datum-felrendering), S67b (F44 Alt B heltalsaritmetik).
Testbaslinje: 1449 → 1464. Ny M-princip: M131 (monetära beräkningar via
heltalsaritmetik). Zod-refine for invoice quantity ≤2 decimaler.

## Sprint 16 -- Schema+IPC-normalisering ✅ KLAR (2026-04-13)

Sessioner: S57 (F10 expense_lines paritet), S58 (F4 schema-namnkonvention),
S59 (F9 timezone-konsolidering), S60 (F13 handler error-patterns +
sprint-stangning). Testbaslinje: 1190 → 1223. Nya M-principer:
M127 (schema-paritet, S57), M128 (handler error-patterns, S60).
PRAGMA user_version = 27, 22 tabeller.

### Sprint 16 sessioner
| Session | Scope | Status |
|---------|-------|--------|
| S48 | F4: ore-suffix products/price_list_items (M119) | KLAR |
| S57 | F10: expense_lines paritet (M127) | KLAR |
| S58 | F4: Schema-namnkonvention (created_by → created_by_id) | KLAR |
| S59 | F9: Timezone-konsolidering | KLAR |
| S60 | F13: Handler error-patterns + sprint-stangning | KLAR |

## Test-count
- Vitest (system + unit): 1776 passed, 2 skipped (1778 totalt)
- Testfiler: 167
- Playwright E2E: 11 (kors separat)
- Korning: ~23s
- TSC: 0 errors (`npm run typecheck`)

## Known infrastructure contracts
- **FRITT_DB_PATH**: guardad till test-env (NODE_ENV=test eller FRITT_TEST=1). Ignoreras i production.
- **FRITT_TEST=1**: aktiverar `window.__testApi` och test-only IPC-handlers (`__test:`-prefix).
- **E2E_DOWNLOAD_DIR**: bypass for dialog.showSaveDialog i E2E.
- **better-sqlite3 handle-kontrakt**: Electron ager primary rw-handle under test. Test-kod seedar via IPC, inte direkt db-access.
- **Playwright workers: 1**: Electron singleton per test-fil.
- **GitHub Actions CI**: ubuntu-only, Node 20, typecheck + lint + checks + test + build.
- **PRAGMA user_version**: 33 (Sprint 33: migration 032 quantity-CHECK + migration 033 FTS5).

## Kanda fynd vantande

Backlog: 0 oppna findings.
- F59 (per-kanal response-schema) oppen for Sprint 34+.
- F60 (raw-data-kanaler) — 11+ IPC-kanaler returnerar raw arrays istallet for IpcResult. Migrera till IpcResult-wrapper eller dokumentera via M-princip. Sprint 35+ kandidat.

### Schema conventions -- medvetna avvikelser (klass B)
- **accounts.k2_allowed** -- boolean utan `is_`-prefix. `is_k2_allowed` borderline, ej tydligt battre. 54 referenser over 8 filer.
- **accounts.k3_only** -- boolean utan `is_`-prefix. `is_k3_only` borderline. Samma fotavtryck som k2_allowed.

Dokumenterat i S58 (Sprint 16 F4). Konservativ default: ej andrade.

### Tech debt (by design, ej blockerande)
1. **4 invariant-throws i validatePeriodInvariants** -- fangade av PERIOD_GENERATION_ERROR-wrapper, inte user-facing.
2. ~~**ManualEntryListItem.total_amount**~~ -- STANGD i Sprint 33 (D1, M119 rename).
3. ~~**E03 supplier-picker**~~ -- STANGD i Sprint 33 (D2, testId prop).
4. ~~**F57 mock-IPC shape-validering**~~ -- STANGD i Sprint 33 (C0, IpcResult Zod validation). F59 oppen for per-kanal response-schema.
5. ~~**PageAccountStatement URL-sync**~~ -- STANGD i Sprint 31 (A2).

### Known tech debt (S60)

#### TypeScript strict-compile (hog prio)
- **91 tsc-fel i ~20 filer.** Pre-existing fran tidigare sprints,
  ej introducerade av Sprint 16. Aktuell komplexitet: kraver dedikerad
  sprint (uppskattat 1-2 sessioner). Paverkar inte runtime.
- Exempel: S12-bank-fee.test.ts-familjen har aterkommande typ-fel
  i test-fixtures.
- Atgard: Sprint 17 eller senare. Bor inte blandas med feature-arbete.

#### Renderer-komponenttester via vitest (medel prio)
- Upptackt i Sprint 16 S59. `vitest.config.ts` utokades for att
  inkludera `tests/**/*.test.tsx`. Fore S59 korde vitest ENDAST `.ts`-
  filer. Noll renderer-komponenttester via vitest.
- Konsekvens: FormField-buggar (Sprint 10+) upptacktes bara via E2E.
- Atgard: Egen sprint for renderer-komponenttester.

#### ESLint toISOString-regel tacker inte alla varianter (lag prio)
- Inford i Sprint 16 S60. Tacker `.slice`, `.split`, `.substring`
  pa `.toISOString()`.
- Potentiella edge cases: destrukturering, indirekt referens via
  variabel, andra datum-bibliotek om de infors senare.
- Atgard: Monitorera. Utoka regeln vid behov.

### UX-friktioner (upptackta under S51 E2E)
4. **Picker-komponenter saknar data-testid** -- CustomerPicker/ArticlePicker dropdown-rader har inga testbara selektorer.
5. **"Bokfor" text-collision** -- Navigation-lank, sidrubriker och submit-knapp delar texten "Bokfor".
6. **Payment fran list-row med stopPropagation** -- Betala-knappen finns bara i InvoiceList action-kolumn.

### Arkitektur/test-beslut vantande
7. **Bank-fee proportionalitet** -- nuvarande policy: hel avgift per batch (M126). Framtida: proportionell fordelning.
8. **Trigger 6/7-analys** -- opening_balance entries exempterade fran triggers 1-5 men ej 6-7.
9. **Redundans-audit** -- se tests/REDUNDANCY_AUDIT.md.

## Timezone conventions — medvetna avvikelser

Dokumenterade via Sprint 16 S59 (F9) audit. Varje avvikelse lamnad orord
med explicit motivering. ESLint `no-restricted-syntax`-regel inford i S60
for `.toISOString().slice/.split/.substring`. Klass B-filer och
test-filer undantagna.

| # | Fil | Rad | Monster | Motivering |
|---|---|---|---|---|
| B1 | src/main/services/expense-service.ts | 138, 254 | `datetime('now')` for `created_at` INSERT | Matchar migration DEFAULT `datetime('now')` (UTC). Andra till localtime skulle skapa inkonsistens med rows som faller tillbaka pa DEFAULT. Metadata, inte affarsdatum. |
| B2 | src/main/services/sie5/sie5-export-service.ts | 182 | `new Date().toISOString()` for SIE5 XML-timestamp | SIE5-spec kraver ISO 8601 UTC timestamps. Korrekt per extern standard. |
| B3 | src/main/services/sie5/sie5-export-service.ts | 87 | `currentDate.toISOString().substring(0,7)` | `currentDate` konstruerad fran `YYYY-MM-01`, inte "now". Ingen timezone-risk. |
| B4 | src/main/pre-update-backup.ts | 19 | `new Date().toISOString().slice(0,19)` for filnamn | Auto-updater backup. UTC-timestamp i filnamn acceptabelt som unikt ID, inte visningstid. |
| B5 | src/renderer/pages/PageSettings.tsx | 23 | `new Date().toISOString()` for `last_backup_date` | Metadata-timestamp lagras som UTC, jamfors aldrig med lokala datum. |
| B6 | src/renderer/components/wizard/StepFiscalYear.tsx | 36, 74 | `new Date().getFullYear()` + `new Date()` for manadsdiff | `getFullYear()` ger lokalt ar (korrekt). Relativ manadsjamforelse utan date-strangar ar safe. |
| B7 | src/main/services/excel/excel-export-service.ts | 444 | `new Date()` med `.getFullYear/.getMonth/.getDate/.getHours` | Manuellt formaterad lokal tid via getters. Samma resultat som `todayLocal()`. Korrekt per M28. |

## Tidigare sprintar
- Sprint 32 (S32): Unicode-sokning + Verifikat-sokning + Perf-baseline -- KLAR
- Sprint 31 (S31): Global sokning + Kontoutdrag-polish — B3 global search, B2 URL-sync, print-mode -- KLAR
- Sprint 30 (S30): Kontoutdrag-UI + Korrigeringsverifikat — B2 UI, B4 correction-service -- KLAR
- Sprint 29 (S29): UX-polish + Kontoutdrag — F50–F56, B1 tester, B2 service -- KLAR
- Sprint 27 (S27): TSC strict + Fas 6 cleanup — 0 tsc-fel, 0 findings -- KLAR
- Sprint 26 (S26): B-light — F35, F38, F8 stängda, CI etablerad -- KLAR
- Sprint 25 (S25): F40 VAT-testhardering -- KLAR
- Sprint 24b (S24b): BR-result-konsistens + F4 comparator-cleanup -- KLAR
- Sprint 15 (S41-S47): Kritiska normaliseringar -- KLAR
- Sprint 14 (S48-S53): E2E-testinfrastruktur -- KLAR
- Sprint 13 (S55-S56): Bulk-betalningar -- KLAR
- Sprint 12 (S54): Bankavgifter -- KLAR
- Sprint 11 (S42-S53): Atomicitet, SSOT resultat, Oresutjamning, Performance, Rename -- KLAR
