# Bug-backlog — Sprint 11 djupanalys

Denna fil innehåller findings från djupanalysen som föregick Sprint 11 (Session 41–42 och framåt). Listan är genererad från en systematisk genomgång av hela kodbasen och fungerar som källa för efterföljande bug-fix-sessioner.

**Status-legend:** 🔴 kritisk · 🟠 hög · 🟡 medel · 🟢 låg · ✅ fixad · ⏸️ avvaktas

**Sprint 11 faser:**
- Fas 1: F27 → Session 41 ✅
- Fas 2: F26, F2, F1 → Session 42 ✅
- Fas 3: F19, F4 → pending
- Fas 4: F3, F9 → pending
- Fas 5a: F11, F17 → Session 45 ✅
- Fas 5b: F21, F22, F33 → Session 46 ✅
- Fas 5c: F23 → Session 47 ✅
- Fas 6: F7, F8, F10, F13, F14, F20, F25, F28, F35, F38 → pending

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

### F19 — Tre olika definitioner av "årets resultat" 🟠
**Filer:** `dashboard-service.ts`, `tax-service.ts`, `report-service.ts`, `opening-balance-service.ts`
**Problem:**
- Dashboard: `revenue (3xxx exkl 3740) - expenses (4xxx-7xxx)` — exkluderar klass 8
- Tax forecast: samma — exkluderar klass 8
- Resultaträkning (report-service): K2-config ranges 3000–8999 — inkluderar klass 8
- calculateNetResult: `SUM(credit-debit) WHERE 3000-8999` — inkluderar klass 8

**Effekt:** Användaren ser olika resultat i Dashboard vs Skatteprognos vs Resultaträkning för samma räkenskapsår. Särskilt märkbart om det finns räntekostnader eller finansiella intäkter.

**Förslag på fix:** Skapa `src/main/services/result-service.ts` med `getOperatingResult(db, fiscalYearId, dateRange?)`:
```ts
{
  operatingProfitOre: number  // klass 3-7, exkl 3740
  netResultOre: number        // klass 3-8, exkl 3740
}
```
Uppdatera dashboard-service, tax-service, report-service, opening-balance-service att använda samma källa.

### F4 — Lexikografisk account_number-jämförelse 🟠 Fas 3
**Filer:** `opening-balance-service.ts` (calculateNetResult, getOpeningBalancesFromPreviousYear)
**Problem:** `WHERE account_number >= '3000' AND account_number <= '8999'` är lexikografisk. Bryter för 5-siffriga konton.
**Not:** `k2-mapping.ts` och `report-service.ts` är INTE drabbade — de har egen numerisk parsing (testat i session-20).
**Fix:** Byt till `CAST(account_number AS INTEGER) BETWEEN 3000 AND 8999`. Eller skapa shared helper `accountNumberToInt()` i `src/shared/account-utils.ts`.
**Relaterat test:** F37 — session-21 rad 230 replikerar samma bugg i testet (speglar koden). Måste fixas tillsammans.

---

## Medel — Öresutjämning & felkoder (Fas 4)

### F3 — Små restbelopp kan inte betalas fullständigt 🟡 Fas 4
**Filer:** `payInvoice`, `payExpense`
**Problem:** Guard `remaining > ROUNDING_THRESHOLD * 2` låser ut fullbetalning av restbelopp ≤ 100 öre.
**Fix:** Ändra till `Math.abs(diff) < remaining`.

### F9 — validateAccountsActive ger generic error 🟡 Fas 4
**Fil:** `account-service.ts`
**Problem:** `throw new Error(...)` ger `TRANSACTION_ERROR`-kod till frontend. Användaren ser inte vilka konton som är inaktiva.
**Fix:** Structured throw med `code: 'ACCOUNT_INACTIVE'` + `inactiveAccounts: string[]`. Uppdatera finalize-handlers att fånga den separat.

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

### F7 — verification_sequences-tabell finns men används aldrig 🟢
**Fil:** `migration005`, alla verification_number-ställen
**Fix:** Antingen använd tabellen eller droppa den (migration 017). Rekommendation: droppa, MAX+1 räcker för single-user-app.

### F8 — LIKE-patterns escapas inte 🟢
**Filer:** `listInvoices`, `listExpenses`
**Problem:** Sökning efter `50%` eller `foo_bar` matchar fel.
**Fix:** `escapeLikePattern()` helper, escape `\`, `%`, `_`.

### F10 — getDraftInternal använder INNER JOIN mot counterparties 🟢
**Fil:** `invoice-service.ts`
**Fix:** LEFT JOIN + `COALESCE(cp.name, 'Okänd kund')`. Defensivt mot future edge cases.

### F13 — Duplicerade ensureIndexes + migration 🟢
**Fil:** `invoice-service.ts`, `expense-service.ts`
**Fix:** Ta bort `ensureInvoiceIndexes`/`ensureExpenseIndexes`, behåll bara i migrationen.

### F14 — manual-entry-service litar på IPC-validering 🟢
**Fil:** `manual-entry-service.ts`
**Fix:** Lägg till Zod-parse i service-funktionerna för konsistens med andra services.

### F20 — VAT-report SQL-string-interpolation 🟢
**Fil:** `vat-report-service.ts`
**Fix:** Byt `'${VAT_OUT_25_ACCOUNT}'` mot bind-variabler.

### F25 — getUsedAccounts returnerar för många konton i SIE-export 🟢
**Fil:** `sie4-export-service.ts`, `sie5-export-service.ts`
**Problem:** `WHERE ... OR a.is_active = 1` inkluderar oanvända aktiva konton.
**Fix:** `WHERE account_number IN (...actually_used)`.

### F28 — SIE5 hardcoded series-namn fel 🟢
**Fil:** `sie5-export-service.ts`
**Problem:** Serie C heter "Betalningar", borde vara "Manuella verifikationer". Serie O saknas.
**Fix:** Uppdatera seriesNames map.

### F35 — ExpenseForm quantity input min={0} 🟢
**Fil:** `src/renderer/components/expenses/ExpenseForm.tsx:309`
**Problem:** Tillåter quantity=0 i UI, fångas först av backend Zod.
**Fix:** `min={1}`.

### F38 — ManualEntryForm diff visas som absolutbelopp 🟢
**Fil:** `src/renderer/components/manual-entries/ManualEntryForm.tsx:236`
**Problem:** Visar inte OM debet > kredit eller tvärtom.
**Fix:** Lägg till tecken eller label "debet > kredit" / "kredit > debet".

---

## Ej längre aktuella

### F18 — Tidigare oro om report-service signMultiplier
**Status:** Inte en bug. Session-20 testar alla teckenfall explicit. Tas bort från listan.

### F37 — Test session-21 speglar bug F4
**Status:** Hanteras tillsammans med F4 i Fas 3. Inte separat post.

---

## Sprint 18 S65b findings (2026-04-14)

### F39 — Formulärtyper använder _kr-suffix utan dokumenterad konvention 🟡
**Filer:** `src/renderer/lib/form-schemas/invoice.ts` (InvoiceLineForm.unit_price_kr), `src/renderer/lib/form-schemas/expense.ts` (ExpenseLineForm.unit_price_kr)
**Problem:** M119 kräver `_ore`-suffix på alla belopp-kolumner i SQLite, men formulärtyper i renderer använder `_kr`-suffix medvetet (undviker dubbelkonvertering under inmatning). Konvertering sker vid submit (`toOre(line.unit_price_kr)` i `transformInvoiceForm`). Denna konvention är odokumenterad.
**Risk:** Framtida utvecklare (eller AI-assistenter) som läser M119 kan anta att allt ska vara öre och introducera felaktig konvertering i renderer-lager.
**Förslag:** Dokumentera som explicit undantag, t.ex. M129: "Formulärtyper (`*Form`-suffix) får använda `_kr`-suffix för prisfält. Konvertering till öre sker i dedikerad transformer (t.ex. `transformInvoiceForm`) vid submit. Ingen `_kr`-data får passera IPC-gränsen." Sista meningen skyddar M119 — utan den kan undantaget läcka till main process.
**Prioritet:** Dokumentation, ingen kodändring krävs.

### F40 — F27-testskydd täcker bara netto, moms-skalning otestad i InvoiceTotals 🟠
**Filer:** `src/renderer/components/invoices/InvoiceTotals.tsx`
**Problem:** InvoiceLineRow visar netto per rad. Moms beräknas separat i InvoiceTotals: `vatOre = Math.round(nettoOre * line.vat_rate)`. S65b:s F27-regressionstester skyddar netto-skalningen men inte moms-skalningen. En bugg i InvoiceTotals (t.ex. `rate_percent / 100`-fel, eller `vat_rate` redan dividerad dubbelgånger) fångas inte.
**Varför 🟠:** F27 var 🔴 i produktion — samma klass av bugg (division på fel nivå). Moms är svårare att ögonkolla: 25% "känns rätt" oavsett om totalen är 1 187,50 eller 1,19. Om den finns och inte fångas → SIE-fel hos riktig kund.
**Förslag:** Isolerade tester för InvoiceTotals — kandidat för nästa regressionstestsprint, inte "någon gång". Tre testfall: standardmoms 25%, blandad moms (25% + 6%), momsfritt.
**Prioritet:** Hög — samma buggklass som F27, otestad.

### F41 — Konto-input på friformsrad saknar validering 🟡
**Fil:** `src/renderer/components/invoices/InvoiceLineRow.tsx:79`
**Problem:** Konto-fältet på friformsrader är fritext (`<input type="text">`). Användaren kan skriva ogiltiga kontonummer ("3OO1", "abc", inaktiva konton). Fråga: valideras kontonumret i InvoiceForm vid submit, eller först vid backend-bearbetning?
**Effekt:** Om ingen validering: datakvalitetsbugg som kan manifestera sig i SIE-export (ogiltigt konto i verifikat).
**Förslag:** Granska submit-kedjan. Om validering saknas: lägg till either (a) konto-select istället för fritext, eller (b) Zod-validering av kontoformat i InvoiceFormStateSchema.
**Prioritet:** Okänd — behöver 15-min spike. En enda grep i submit-kedjan (`transformInvoiceForm` → IPC-handler → `invoice-service` → SQLite FK/CHECK) avgör om validering finns. Med det: antingen 🔴 (ingen validering, reproducerbar datakvalitetsbugg) eller stängd (validering finns).

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

### F43 — parseFloat hanterar inte svenskt decimalformat 🟡
**Filer:** InvoiceLineRow.tsx, ExpenseLineRow.tsx (alla `parseFloat(e.target.value)`)
**Problem:** `parseFloat("1 234,50")` returnerar `1` (stannar vid mellanslag). `parseFloat("99,50")` returnerar `99` (stannar vid komma). Svensk inmatning med tusentalsavgränsare eller decimalkomma trunkeras tyst.
**Effekt:** Användaren skriver "1 234,50", sparar 1 kr. Tyst dataförlust.
**Förslag:** Shared parser som normaliserar svensk inmatning: ta bort mellanslag, ersätt komma med punkt.
**Prioritet:** Medel — UX-bugg, delad mellan S65a och S65b. Reproducerbar i browser med number-input.
**Not:** Dokumenterad redan i S65a (CHECKLIST.md gap-sektion). Uppgraderas till F-nummer här.

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

### F49 — A11y-konsistens i formulärfält 🟡
**Filer:** `ExpenseForm.tsx`, `InvoiceForm.tsx`
**Problem:** F45-fixen lade till role="alert" + aria-describedby + aria-invalid enbart för datum-fält. Övriga fält (supplier, description, lines) renderar errors som plain `<p>` utan a11y-attribut. Inkonsistent skärmläsar-upplevelse.
**Förslag:** Konsekvens > partiell täckning. Lyft a11y-mönstret till alla fält i båda formulären. Kräver a11y-strategi (tab-order, fokus-hantering vid fel, språkmarkering).
**Prioritet:** Medel — partiell a11y är bättre än ingen, men konsistens förväntas.

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
