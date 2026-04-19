# Bug-backlog — Sprint 11 djupanalys

Denna fil innehåller findings från djupanalysen som föregick Sprint 11 (Session 41–42 och framåt). Listan är genererad från en systematisk genomgång av hela kodbasen och fungerar som källa för efterföljande bug-fix-sessioner.

**Status-legend:** 🔴 kritisk · 🟠 hög · 🟡 medel · 🟢 låg · ✅ fixad · ⏸️ avvaktas

**Sprint 11 faser:**
- Fas 1: F27 → Session 41 ✅
- Fas 2: F26, F2, F1 → Session 42 ✅
- Fas 3: F19, F4 → Sprint 24b ✅
- Fas 4: F3, F9 → Session 44 ✅
- Fas 5a: F11, F17 → Session 45 ✅
- Fas 5b: F21, F22, F33 → Session 46 ✅
- Fas 5c: F23 → Session 47 ✅
- Fas 6: ✅ KLAR (F7 S27, F20 S27, F25 S27, F28 S27 | F8 S26, F10 S57, F13 S60, F14 stale-closed, F35 S26, F38 S26)

---

## Kritiska buggar

### F27 — Kostnader bokförs med 1/100 av belopp ✅ Session 41
**Fil:** `src/main/services/expense-service.ts:39` (fixad)
**Problem:** `Math.round((line.quantity * line.unit_price_ore) / 100)` delade med 100. Artefakt från tidigare design där quantity var x100-multiplicerad.
**Effekt:** Alla kostnader bokfördes med 1/100 av rätt belopp. Verifierat i produktion: 2500 kr → 25 kr, 750 kr → 7,50 kr.
**Fix:** Ta bort /100-division, använd `line.quantity * line.unit_price_ore` direkt. Uppdatera session-10 + session-11 + session-13 tester. 4 nya regression-tester.
**Rule:** M92

---

## Höga buggar — Atomicitet

### F2 — closeFiscalYear utanför transaktion ✅ Session 42
**Fil:** `src/main/ipc-handlers.ts` fiscal-year:create-new handlern (fixad)
**Problem:** `closeFiscalYear(db, activeFyId)` anropas EFTER `createNewFiscalYear`-transaktionen. Race window om appen kraschar mellan dem.
**Fix:** Inlinea SQL:en som sista steg i `createNewFiscalYear`-transaktionen. Ta bort import och anrop från ipc-handlers.
**Rule:** M94

### F26 — closePeriod/reopenPeriod saknar transaktion ✅ Session 42
**Fil:** `src/main/services/fiscal-service.ts` (fixad)
**Problem:** Flera SELECT + UPDATE utan atomic guarantee.
**Fix:** Wrappa funktionerna i `db.transaction((): IpcResult<FiscalPeriod> => {...})()`.
**Rule:** M93

### F1 — Inga DB-constraints mot överlappande fiscal years ✅ Session 42
**Fil:** `src/main/migrations.ts` migration 014 (tillagt)
**Problem:** Ingen defense-in-depth om IPC-lagret kringgås.
**Fix:** Två SQLite-triggers `trg_fiscal_year_no_overlap_insert` och `trg_fiscal_year_no_overlap_update`.
**Rule:** M95

---

## Höga buggar — Rapport-konsistens (Fas 3)

### F19 — Tre olika definitioner av "årets resultat" ✅ STÄNGD (Sprint 24b)
**Stängd:** Sprint 24b (S24b). BR:s `calculatedNetResult` läser nu från
`calculateResultSummary().netResultOre` (M134). Alla 4 konsument-vägar
(result-service, re-export via opening-balance, getIncomeStatement, getBalanceSheet)
ger identisk siffra. Verifierat via all-consumers-identical-test + E2E.

**Historik:** Sprint 11 Fas 3 (S43) skapade `result-service.ts` (M96) och
migrerade Dashboard, Tax, RR. BR missades — den behöll sin egen
filter-reduce (`!startsWith('1') && !startsWith('2')`). Sprint 24b stängde
det sista gapet.

### F4 — Lexikografisk account_number-jämförelse ✅ STÄNGD (Sprint 24b)
**Stängd:** Sprint 24b (S24b). 5 SQL `ORDER BY CAST(account_number AS INTEGER)` +
1 application-layer `localeCompare → compareAccountNumbers`. Ny shared helper
`src/shared/account-number.ts` med 5 unit-tester + 4 fast-check property-tester.

**Kvarvarande defense-in-depth (S24c):** `CHECK(length(account_number) BETWEEN 4 AND 5)`
på `accounts`-tabellen. Kräver M122 table-recreate. Eskaleringstriggers:
(1) import-väg läggs till, (2) BAS 5-siffriga konton, (3) backup-restore
kringgår app-layer-validering.

**Relaterat:** F37 (test session-21 speglade bugg) — opening-balance-service
fixad i Sprint 11 S43 (M98). Sprint 24b fixade kvarvarande ORDER BY + localeCompare.

---

## Medel — Öresutjämning & felkoder (Fas 4)

### F3 — Små restbelopp kan inte betalas fullständigt ✅ Session 44
**Stängd:** Sprint 11 Fas 4 (S44). Guard `remaining > ROUNDING_THRESHOLD * 2` borttagen, ersatt med `remaining > 0`. Öresutjämning aktiveras nu korrekt för alla fullbetalningar inom ±50 öre.
**Rule:** M99
**Not:** Var redan fixad men inte markerad som stängd i backloggen. Upptäckt vid S24b backlog-audit.

### F9 — validateAccountsActive ger generic error ✅ Session 44
**Stängd:** Sprint 11 Fas 4 (S44). Kastar nu strukturerat `{ code: 'INACTIVE_ACCOUNT', error, field: 'account_number' }` istället för plain Error. Alla tre finalize-flöden (invoice, expense, manual-entry) returnerar korrekt felkod.
**Rule:** M100
**Not:** Var redan fixad men inte markerad som stängd i backloggen. Upptäckt vid S24b backlog-audit.

---

## Medel — Performance & consistency (Fas 5)

### F11 — paid_amount-kolumn saknas på expenses ✅ Session 45
**Problem:** Invoice har `paid_amount` på tabellen, expense räknar det via subquery varje gång. Inkonsistent och långsammare.
**Fix:** Migration 015 lägger till kolumn + backfill. Uppdatera payExpense att skriva till den.

### F17 — N+1 queries i export-tjänster ✅ Session 45
**Filer:** `sie4-export-service.ts`, `sie5-export-service.ts`, `excel-export-service.ts`
**Problem:** `getJournalEntryLines()` anropas i loop per verifikation. Excel läser 2x per verifikation (verifikationslista + huvudbok).
**Fix:** Skapa `getAllJournalEntryLines(db, fiscalYearId, dateRange?)` som returnerar `Map<number, JournalLineInfo[]>`. Dela mellan alla exporter.

### F21 — useEntityForm.isDirty via JSON.stringify ✅ Session 46
**Fil:** `src/renderer/lib/use-entity-form.ts`
**Problem:** `JSON.stringify(data) !== JSON.stringify(initial)` körs vid varje render.
**Fix:** Ref-baserat: `dirtyRef.current = true` i `setField`, `false` i `reset`.

### F22 — Callbacks i InvoiceForm + ExpenseForm inte memoizerade ✅ Session 46
**Fil:** `InvoiceForm.tsx`, `ExpenseForm.tsx`
**Problem:** `addLine`, `removeLine`, `updateLine` skapas nya vid varje render. InvoiceLineRow re-renderas onödigt.
**Fix:** `useCallback` + `React.memo(InvoiceLineRow)`.

### F23 — invoice_lines.unit_price borde heta unit_price_ore ✅ Session 47
**Problem:** Inkonsekvent med expense_lines.unit_price_ore. Förvirrar.
**Fix:** Migration 016 rename + uppdatera alla typ-referenser. Ren refactor.

### F33 — FiscalYearContext race condition vid första laddning ✅ Session 46
**Fil:** `src/renderer/contexts/FiscalYearContext.tsx`
**Problem:** Om `useFiscalYears()` är snabbare än `getSetting('last_fiscal_year_id')` så auto-väljs öppet år och skriver över restored ID i settings.
**Effekt:** Användarens senast valda FY glöms bort ibland.
**Fix:** Lägg till `restoredIdLoaded` boolean state, vänta med att bestämma activeFiscalYear tills båda källorna är klara.

---

## Låg — Städ (Fas 6)

### F7 — verification_sequences-tabell finns men används aldrig ✅ STÄNGD (Sprint 27)
**Stängd:** Migration 028 droppar tabellen. Audit 2026-04-19 bekräftade att
all verification_number-tilldelning sker via `MAX+1`-pattern.

### F8 — LIKE-patterns escapas inte ✅ STÄNGD (redan fixat)
**Stängd:** `src/shared/escape-like.ts` + `ESCAPE '!'` i listInvoices/listExpenses.
Backlog-entry var inaktuell. Verifierat 2026-04-19.

### F10 — getDraftInternal använder INNER JOIN mot counterparties ✅ Sprint cleanup 2026-04-19
**Fix:** LEFT JOIN + `COALESCE(cp.name, 'Okänd kund')` i `getDraftInternal`.
Defensivt mot edge cases där counterparty raderats eller saknas.

### F13 — Duplicerade ensureIndexes + migration 🟢 DELVIS
**Status (2026-04-19 audit):** Indexen (`idx_invoices_list`, `idx_expenses_list`)
finns ENDAST i `ensureInvoiceIndexes`/`ensureExpenseIndexes` — inte i migrations.
Ingen duplicering. Fix kräver ny migration (068?) som skapar indexen + ta bort
ensure-funktionerna + anropen i ipc-handlers.ts. Liten risk, ingen regression;
skjut till nästa schema-sprint.

### F14 — manual-entry-service litar på IPC-validering ✅ Stale-close
**Stängd:** Service har egen validering (balanschecker, datumvalidering, FY-bounds, periodkontroll, kontoexistens). Inte enbart IPC-beroende.
**Not:** Var redan fixad men inte markerad. Upptäckt vid S24b backlog-audit.

### F20 — VAT-report SQL-string-interpolation ✅ STÄNGD (redan fixat)
**Stängd:** `vat-report-service.ts` använder `.all(VAT_OUT_25_ACCOUNT, ...)`
bind-variabler. Backlog-entry var inaktuell. Verifierat 2026-04-19.

### F25 — getUsedAccounts returnerar för många konton i SIE-export ✅ STÄNGD (redan fixat)
**Stängd:** `getUsedAccounts` i `export/export-data-queries.ts` filtrerar på
`account_number IN (SELECT DISTINCT ... booked journal_entry_lines)` — ingen
`is_active = 1`-union kvar. Verifierat 2026-04-19.

### F28 — SIE5 hardcoded series-namn fel ✅ Sprint cleanup 2026-04-19
**Stängd:** C + O var redan korrekt. Lade till saknade E (Avskrivningar) och
I (Importerade verifikationer) i `seriesNames` — M151 introducerade dem
utan att SIE5-export följde efter.

### F35 — ExpenseForm quantity input min={0} ✅ STÄNGD (redan fixat)
**Stängd:** `ExpenseLineRow.tsx:61` har `min={1}` på quantity. `min={0}`
finns bara på `unit_price` (pris kan vara 0). Verifierat 2026-04-19.

### F38 — ManualEntryForm diff visas som absolutbelopp ✅ STÄNGD (redan fixat)
**Stängd:** `ManualEntryForm.tsx:427-429` visar "(debet > kredit)" / "(kredit
> debet)" i felfärg. Verifierat 2026-04-19.

---

## Ej längre aktuella

### F18 — Tidigare oro om report-service signMultiplier ✅ Ej bug
**Status:** Stängt 2026-04-19. Inte en bug — session-20 täcker alla teckenfall.

### F37 — Test session-21 speglar bug F4 ✅ Täckt av F4-fix
**Status:** Stängt 2026-04-19. Hanterat tillsammans med F4 i Sprint 11 Fas 3.

---

## Sprint 18 S65b findings (2026-04-14)

### F39 — Formulärtyper använder _kr-suffix utan dokumenterad konvention ✅ STÄNGD
**Stängd:** CLAUDE.md M136 ("Renderer form-types använder _kr-suffix")
dokumenterar konventionen explicit + M119-undantaget. Verifierat 2026-04-19.

**Historik:**
**Filer:** `src/renderer/lib/form-schemas/invoice.ts` (InvoiceLineForm.unit_price_kr), `src/renderer/lib/form-schemas/expense.ts` (ExpenseLineForm.unit_price_kr)
**Problem:** M119 kräver `_ore`-suffix på alla belopp-kolumner i SQLite, men formulärtyper i renderer använder `_kr`-suffix medvetet (undviker dubbelkonvertering under inmatning). Konvertering sker vid submit (`toOre(line.unit_price_kr)` i `transformInvoiceForm`). Denna konvention är odokumenterad.
**Risk:** Framtida utvecklare (eller AI-assistenter) som läser M119 kan anta att allt ska vara öre och introducera felaktig konvertering i renderer-lager.
**Förslag:** Dokumentera som explicit undantag, t.ex. M129: "Formulärtyper (`*Form`-suffix) får använda `_kr`-suffix för prisfält. Konvertering till öre sker i dedikerad transformer (t.ex. `transformInvoiceForm`) vid submit. Ingen `_kr`-data får passera IPC-gränsen." Sista meningen skyddar M119 — utan den kan undantaget läcka till main process.
**Prioritet:** Dokumentation, ingen kodändring krävs. Kan stängas inom valfri sprint som rör fakturering.

### F40 — F27-testskydd täcker bara netto, moms-skalning otestad i InvoiceTotals ✅ STÄNGD (Sprint 25)
**Stängd:** Sprint 25. 18 nya tester via shared fixture (`tests/fixtures/vat-scenarios.ts`):
- 6 isolerade VAT-skalning i InvoiceTotals (B5, renderer)
- 6 backend processLines VAT via saveDraft→getDraft
- 6 renderer↔backend paritets-tester (divergens-vakt)
Alla tre momssatser (25%, 12%, 6%) + avrundnings-edgecases + F44-canary.
**S25 research-resultat:** Ingen beräkningsdivergensbugg — renderer och backend
använder identisk M131 Alt B-formel. Sprinten är testhardering, inte bugfix.
**M-regel:** M135 (dual-implementation paritetstest med delad fixture).

### F41 — Konto-input på friformsrad saknar validering ✅ Stale-close (S25 pre-skoping)
**Stängd:** Verifierat genom kodinspektio under S25 pre-skoping research.
Freeform-input i renderer tillåter godtycklig text, men tre lager fångar ogiltiga konton:
(1) `validateAccountsActive(db, allAccountNumbers)` i `finalizeInvoice` (invoice-service.ts) — blockerar bokning om konto saknas/inaktivt.
(2) FK-constraint `journal_entry_lines.account_number REFERENCES accounts(account_number)` — SQLite-nivå defense-in-depth.
(3) Trigger `trg_invoice_lines_account_number_on_finalize` (M123) — blockerar NULL account på freeform-rader vid finalize.
Draft tillåter freeform medvetet — användaren kan skriva och korrigera innan bokning. Inte en bugg.

### F42 — Invoice vs Expense quantity-parsing [STÄNGD: DOKUMENTERAD DESIGNDIVERGENS, EJ BUG] ✅
**Status:** Stängd som design, inte bug. Omklassad 2026-04-14.

**Tidigare formulering:** "InvoiceLineRow använder parseFloat, ExpenseLineRow använder parseInt — unifiera."

**Korrekt analys:** Invoice och Expense har avsiktligt olika quantity-semantik genom hela stacken:

| Lager | Invoice | Expense |
|---|---|---|
| SQLite | `quantity REAL` | `quantity INTEGER` |
| Zod IPC-schema | `z.number().positive()` | `z.number().int().min(1)` |
| Form-schema | `z.number()` | `z.number().int()` |
| LineRow parser | `parseFloat` | `parseInt` |

**Motivering:**
- Fakturor: konsultfakturering (1.5 h, 0.75 m) kräver fraktionell qty.
- Kostnader: leverantörsfakturor har styckantal (1 st, 2 st) — heltal.

M92/regel 15 ("quantity × unit_price_ore = line_total_ore, quantity heltal") gäller expense_lines, inte invoice_lines. Invoice_lines har haft `quantity REAL` sedan session 6.

**Konsekvens för tester:**
- ExpenseForm.integration "heltal-qty pga F42"-kommentarer borttagna — heltals-qty i expense-tester är arkitekturkrav, inte workaround.
- InvoiceForm-tester kan fortsätta använda fraktionell qty — korrekt beteende.

**Kvarvarande 0-qty-fråga:** InvoiceLineRow tillåter qty=0 via `parseFloat(v) || 0`, ExpenseLineRow blockerar via `parseInt(v) || 1`. Huruvida qty=0 är meningsfull på faktura (t.ex. "0 × licens, ingen avgift denna månad") är en separat designfråga, inte relaterad till parseFloat/parseInt-divergensen.

**Referens:** M130 i CLAUDE.md (sektion 35). Bekräftad via stack-genomgång (SQLite + Zod + form-schema + LineRow) 2026-04-14.

### F43 — parseFloat hanterar inte svenskt decimalformat ✅ Stale-close (S25 pre-skoping)
**Stängd:** Verifierat genom kodinspektio under S25 pre-skoping research.
Alla berörda fält använder `<input type="number">`. HTML5 number-input normaliserar
decimaltecken till punkt innan JavaScript ser `e.target.value` — oavsett system-locale.
`parseFloat("99.50")` fungerar korrekt. Komma-scenariot (`"99,50"`) uppstår inte
eftersom webbläsarens number-input aldrig returnerar komma-format till JS.
**Not:** Ursprunglig analys antog type="text", men fälten är type="number".

---

### F44 — toOre(qty * price_kr) float-precision off-by-1 ✅ Sprint 20 S67b
**Status:** STÄNGD. Alt B heltalsaritmetik implementerad.
**Fix:** `Math.round(Math.round(qty * 100) * Math.round(price_kr * 100) / 100)` i InvoiceTotals, ExpenseTotals och invoice-service.ts processLines. Zod-refine för ≤2 decimaler på invoice quantity (form + IPC). Empirisk karakterisering med reproducerbart script (0% fel i domän qty×price). M131 promoted.
**Referens:** `docs/s67b-characterization.md`, `scripts/characterize-totals.mjs`.

### F45 — ExpenseForm och InvoiceForm saknar datum-valideringsmeddelande i UI ✅ Sprint 20 S67a
**Status:** STÄNGD. Datum-error renderas nu i UI med role="alert" + aria-describedby.
**Fix:** Error-rendering tillagd efter datum-input i båda formulären. htmlFor/id-koppling på label/input. A11y-attribut (role="alert", aria-invalid, aria-describedby) för skärmläsar-tillgänglighet.
**Not:** A11y-attribut tillagda enbart för datum-fält. Övriga fält (supplier, description, lines) saknar fortfarande a11y-kopplingar — se F49.

### F46 — Invoice+Expense quantity saknar övre gräns ✅ Sprint 22a
**Status:** STÄNGD. Max-qty UX-guard på invoice (9999.99, float ≤2 dec) och expense (9999, int) quantity i form-schema + IPC-schema. 9 tester i `tests/session-22a-f46-max-qty.test.ts`. Error-meddelanden lokaliserade till svensk formatering. Read-tolerans verifierad (safeParse fail utan krasch).
**Referens:** `src/shared/constants.ts` (MAX_QTY_INVOICE, MAX_QTY_EXPENSE).

### F46b — DB-CHECK defense-in-depth för quantity max 🟢
**Problem:** Zod-validering i form-schema + IPC-schema täcker alla write-paths via IPC, men DB har ingen CHECK-constraint. Defense-in-depth kräver table-recreate (M122-procedur).
**Prioritet:** Låg — IPC är single entry-point för writes. Zod-validering täcker.
**Förslag:** `CHECK(quantity <= 9999.99)` på invoice_lines, `CHECK(quantity <= 9999)` på expense_lines via M122 table-recreate-migration.

### F47 — M131-efterlevnad i display-lager (InvoiceLineRow, ExpenseLineRow) ✅ Sprint 21 S68a+S68b
**Status:** STÄNGD. Alt B applicerad i båda LineRow-komponenterna.
**Fix:** InvoiceLineRow (S68a): formel bytt från `toOre(qty * price_kr)` till Alt B. 3 tester (2 canaries B2.4/B2.5 + DOM-smoke). ExpenseLineRow (S68b): defensiv Alt B (int qty i produktion). 2 tester (int-sanity + Zod-regression-guard).
**Referens:** Commit a6b9aeb (S68a), eea4687 (S68b).
**Historik:** Identifierat i Sprint 20 Steg 0.5b. Service-lager fixat i Sprint 20 S67b. Display-lager fixat i Sprint 21 S68a+S68b.

### F48 — IPC-lager-test för invoice quantity decimal-precision ✅ Sprint 21 S68c
**Status:** STÄNGD. Decimal-gate verifierad på invoice:save-draft + invoice:update-draft med read-back.
**Fix:** 3 tester: qty=1.333 förkastas (create + update), qty=1.33 accepteras med read-back.
**Referens:** Commit 22edb75 (S68c), `tests/session-68-ipc-precision.test.ts`.

### F49 — A11y-konsistens i formulärfält ✅ STÄNGD (S22c)
**Fixad i:** Sprint 22c (8 commits, 1481 → 1493 tester).
**Scope:** FormField/Select/Textarea ARIA, InvoiceForm, ExpenseForm, ManualEntryForm, CompanyWizard, CreateFiscalYearDialog, 5 payment/finalize-dialoger, LoadingSpinner.
**M-regel:** M133 (axeCheck:false-regression-skydd via `npm run check:m133`).
**axeCheck:false:** 4 → 0.

### F49-b — AST-baserad M133-utökning ✅ STÄNGD (redan fixat)
**Stängd:** `scripts/check-m133-ast.mjs` finns och kör i CI via `check:m133-ast`-
script (inkl. self-test). Verifierat 2026-04-19.

---

## Sprint 29 findings (2026-04-15)

### F50 — window.confirm ersatt med ConfirmDialog ✅ Sprint 29
**Filer:** InvoiceForm.tsx, ExpenseForm.tsx
**Fix:** Ny ConfirmDialog-komponent med role="alertdialog", fokus-trap, Escape. 7 tester.

### F51 — Företagsredigering historisk integritet ✅ Sprint 29 (non-issue)
**Status:** Stängd som non-issue — företagsnamn (`name`) och org.nr (`org_number`)
visade sig redan vara read-only i PageSettings UI sedan den ursprungliga
implementationen (Sprint 10). Fälten visas i en `<dd>`-definition list, inte
i redigerbara input-fält. Backend (`updateCompany`) tillåter tekniskt
uppdatering av dessa fält via `ALLOWED_COMPANY_COLUMNS`, men ingen UI-path
exponerar denna möjlighet.

**Beslut:** Varnings-approach (Alternativ B i Sprint 29-prompten) var onödig
eftersom fälten inte kan ändras av användaren. Snapshot-pattern (Alternativ A:
spara företagsinfo på fakturan vid finalize) kvarstår som potentiell v1.1-feature
om kravet på redigering av företagsnamn/org.nr återuppstår.

### F52 — Backup-restore ✅ Sprint 29
**Fil:** backup-service.ts
**Fix:** Fullständig restore med validering (SQLite, schema, integrity), pre-restore-backup, atomic rename, user_version-migrering. 8 tester.

### F53 — YearPicker timezone-fix ✅ Sprint 29
**Fil:** YearPicker.tsx
**Fix:** String-slice istället för new Date(fy.start_date).getFullYear(). Förhindrar att FY-start Jan 1 visar fel år i UTC+1.

### F54 — Tooltip-komponent ✅ Sprint 29
**Fil:** Tooltip.tsx
**Fix:** A11y-korrekt tooltip med aria-describedby, hover+focus. 6 tester.

### F55 — A11y-pass ✅ Sprint 29
**Status:** M133 rent, inga nya violations.

### F56 — Minimum fönsterstorlek ✅ Sprint 29
**Fil:** index.ts
**Fix:** minWidth: 900, minHeight: 600.

---

## Process för att lägga till nya findings

När en bug hittas under en session:
1. Lägg till ett nytt F-nummer (nästa lediga, F39 och framåt)
2. Inkludera: fil, problem, effekt, förslag på fix
3. Tilldela prioritet (🔴🟠🟡🟢)
4. Tilldela en fas om det passar befintlig sprint-planering

## Historik

- **2026-04-08:** Ursprunglig lista från Sprint 11 djupanalys (38 findings, F1-F38)
- **2026-04-08:** Session 41 — F27 fixad
- **2026-04-08:** Session 42 — F1, F2, F26 fixade
- **2026-04-08:** F18 omklassad (inte en bug), F37 mergad med F4
- **2026-04-10:** Session 45 — F11 + F17 fixade (Fas 5a)
- **2026-04-10:** Session 46 — F21 + F22 + F33 fixade (Fas 5b)
- **2026-04-10:** Session 47 — F23 fixad (Fas 5c)
- **2026-04-10:** Session 48 — F-NY fixad (payInvoice OVERPAYMENT-felkod)
- **2026-04-14:** S65b — F39 (kr-suffix-konvention), F40 (moms-skalning otestad), F41 (konto-fritext-validering), F42 (quantity-parser-divergens), F43 (parseFloat svensk decimal)
- **2026-04-14:** S66a — F44 (toOre float-precision off-by-1 vid fraktionell qty)
- **2026-04-14:** S66b — F45 (datum-valideringsmeddelande saknas i ExpenseForm + InvoiceForm)
- **2026-04-14:** F42 omklassad från bug till dokumenterad designdivergens (M130). F44 uppdaterad.
- **2026-04-14:** Sprint 20 S67a — F45 stängd (datum-felrendering i ExpenseForm + InvoiceForm)
- **2026-04-14:** Sprint 20 S67b — F44 stängd (Alt B heltalsaritmetik), F47 service-lager stängd (samma sprint). F46, F47 (display-lager), F48, F49 tillagda.
- **2026-04-14:** Sprint 21 S68 — F47 stängd (display-lager, S68a+S68b), F48 stängd (IPC-precision-gate, S68c). M131 grep-check tillagd (S68d).
- **2026-04-14:** Sprint 22a — F46 stängd (max-qty UX-guard, 9 tester). F46b öppnad (DB-CHECK defense-in-depth).
- **2026-04-14:** Sprint 22b — F49 research klar. Strategi-dokument + baseline-rapport. Arkitektur D, 14 ytor, M133-kandidat.
- **2026-04-15:** Sprint 22c — F49 stängd (8 commits). axeCheck:false 4→0. M133 etablerad. F49-b öppnad.
- **2026-04-15:** Sprint 24b — F19 stängd (M134), F4 stängd (compareAccountNumbers + CAST ORDER BY).
- **2026-04-15:** S24b backlog-audit mot M1–M134: F3 (M99), F9 (M100), F14 stale-closed. 3 findings var redan fixade men inte markerade. Ny rutin: audit findings mot M-regler vid sprint-avslut.
- **2026-04-15:** S25 pre-skoping research: F41 stale-closed (FK + validateAccountsActive hanterar), F43 stale-closed (type="number" normaliserar). F39 pinnad som dokumentations-finding. Totalt 6 stale-closes under S24b/S25 process-audit.
- **2026-04-15:** Sprint 25 — F40 stängd (18 tester: 6 renderer + 6 backend + 6 parity via shared fixture). M135 etablerad.
- **2026-04-15:** Sprint 29 — F50 stängd (ConfirmDialog ersätter window.confirm), F51 stängd (name/org redan read-only), F52 stängd (backup-restore), F53 stängd (YearPicker tz-fix), F54 stängd (Tooltip), F55 stängd (a11y rent), F56 stängd (minWidth).
