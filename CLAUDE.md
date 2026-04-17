# Fritt Bokföring — Arkitekturprinciper

## Regler för all kod i detta projekt

1. **All bokföringslogik i main process.** Renderer visar data och tar input. Main gör beräkningar och DB. Renderer gör aldrig SQL.
2. **Electron-säkerhet: contextIsolation: true, nodeIntegration: false, sandbox: true.** Renderer har ALDRIG access till Node.js. All IPC via preload.ts + contextBridge.
3. **All IPC-input valideras med Zod.** Ingen data från renderer accepteras utan validering i main process.
4. **Hybridmodell: kritiska invarianter i SQLite (CHECK, triggers), affärslogik i TypeScript.**
5. **Main process är source of truth för moms.** Beräknas per fakturarad (belopp × momssats, heltal ören), sedan summeras. Renderer visar bara preview.
6. **journal_entries är kärnan.** Fakturor, kostnader, betalningar genererar verifikationer. Duplicera aldrig bokföringslogik.
7. **Aldrig ändra, bara korrigera.** Append-only. Enforced i SQLite-trigger OCH TypeScript.
8. **TypeScript strict mode.** Inga `any`, inga implicit `undefined`.
9. **Belopp i ören.** INTEGER i SQLite, number i TypeScript. Aldrig floating point för pengar. Kronor bara vid visning.
10. **Alla DB-operationer i transaktioner.** SQLite WAL-läge. Migrationer i BEGIN EXCLUSIVE.
11. **PRAGMA user_version för migrationer.** Ingen separat tabell.
12. **Varje IPC-kanal har Zod-schema (ipc-schemas.ts) och delade typer (shared/types.ts).**

## 13. K2/K3-filtrering sker vid runtime
`companies.fiscal_rule` är enda sanningskällan. Alla queries mot `accounts`
filtrerar med WHERE-villkor baserat på fiscal_rule. Duplicera aldrig regelval
i accounts-data. Markera aldrig konton som aktiva/inaktiva vid skapelse.

## 14. Alla data-queries scopas till aktivt fiscal_year_id
FiscalYearContext är global state. Alla IPC-kanaler som hämtar
transaktionsdata (fakturor, kostnader, journal_entries, moms) tar
fiscal_year_id som parameter. Anta aldrig "aktuellt år".

UNDANTAG: Stamdata (counterparties, products, price_lists) är
globala och gäller över alla räkenskapsår. De tar INTE fiscal_year_id.

## 15. quantity × unit_price_ore = line_total_ore (M92)

Både `invoice_lines` och `expense_lines` använder samma formel: `line_total_ore = quantity * unit_price_ore`. Ingen `/100`-division. Quantity är antal enheter som heltal (1, 2, 3...). Unit_price_ore är pris per enhet i ören.

Historisk bug F27: expense-service hade tidigare en `/100`-division som artefakt från ett tidigare designval där quantity lagrades x100. Detta gjorde att alla kostnader bokfördes med 1/100 av rätt belopp. Fixad i session 41.

## 16. Atomicitet för fiscal year-operationer (M93–M95)

**M93.** `closePeriod` och `reopenPeriod` körs alltid inom `db.transaction()`. Alla SELECT + UPDATE i en period-operation är atomiska. Defense-in-depth mot race conditions.

**M94.** `createNewFiscalYear` stänger det föregående räkenskapsåret atomärt som sista steg i sin transaktion. Detta inlinear `closeFiscalYear`-SQL istället för att anropa funktionen, eftersom better-sqlite3 inte tolererar nested transactions. Resultat: antingen skapas nya FY + IB + gamla FY stängs, eller ingenting alls rullas tillbaka.

**M95.** Migration 014 enforcar att fiscal years för samma företag inte får överlappa, via två SQLite-triggers (`trg_fiscal_year_no_overlap_insert` och `trg_fiscal_year_no_overlap_update`). Defense-in-depth — även om framtida kod kringgår IPC-lagret, blockas överlappande FY på DB-nivå.

## 17. Single source of truth för resultat-beräkning (M96–M98)

**M96.** All beräkning av rörelseresultat (EBIT), resultat efter finansiella poster (EBT) och årets resultat (netresult) går via `src/main/services/result-service.ts`. Ingen annan service duplicerar kontointervall-logik eller signMultiplier-mönster. Dashboard, Tax, Opening Balance och Report är alla konsumenter.

**M97.** `result-service` återanvänder `INCOME_STATEMENT_CONFIG` från `k2-mapping.ts` som deklarativ källa. `validateResultConfigInvariants` körs vid modulladdning och säkerställer att configen täcker hela intervallet 3000–8999 utan luckor och att signMultipliers matchar förväntade tecken per grupp. Två oberoende invariant-tester säkerställer dessutom att `calculateNetResult` alltid är identisk både med `getIncomeStatement().netResult` (samma config) och med en oberoende fallback-query (SUM(credit−debit) WHERE class 3–8 via numerisk jämförelse).

**M98.** **Inga lexikografiska kontointervall-jämförelser.** Mönster som `account_number >= '3000'`, `LIKE '1%'`, eller `account_number < '3000'` är förbjudna eftersom de bryter för 5-siffriga underkonton — t.ex. `'89991' > '8999'` lexikografiskt, vilket skulle exkludera underkonton till 8999 från årets resultat. All konto-intervallfiltrering sker via `matchesRanges()` från `k2-mapping.ts` eller via SQL `CAST(SUBSTR(account_number || '0000', 1, 4) AS INTEGER) BETWEEN from AND to`. Historisk bugg F4 fixad i Sprint 11 Fas 3 i `opening-balance-service.ts` och `export-data-queries.ts`.

**Sidnot — 3740-öresutjämningsbugg fixad som biprodukt:** Före Sprint 11 Fas 3 exkluderade `dashboard-service` och `tax-service` konto 3740 (öresutjämning) från revenue-beräkningen men fångade det inte någon annanstans. Effekten var att öresutjämningsposter från fakturering/betalning försvann helt ur `operatingResultOre` och `operatingProfitOre`. Migrationen till result-service (som använder `INCOME_STATEMENT_CONFIG` där 3740 korrekt ingår i `net_revenue` 3000–3799) eliminerade denna drift. Regressionstest i `session-43-result-service.test.ts`.

## 18. Öresutjämning och strukturerade valideringsfel (M99–M100)

**M99.** Öresutjämning på betalningar (`payInvoice`, `payExpense`) aktiveras när `Math.abs(diff) <= ROUNDING_THRESHOLD && remaining > 0`, där `diff = input.amount - remaining` och `ROUNDING_THRESHOLD = 50 öre`. Inget ytterligare villkor på restbeloppets storlek. Öresutjämningen bokförs på konto 3740 på den sida som matchar differensens tecken (debet om användaren betalade mer, kredit om mindre).

Historisk not: Före Sprint 11 Fas 4 fanns ett villkor `remaining > ROUNDING_THRESHOLD * 2` som blockerade fullbetalning av fakturor med små restbelopp och orsakade tyst datakorruption vid små överbetalningar. Fixat i Sprint 11 Fas 4 med regressionstester i `session-44-rounding-and-errors.test.ts`.

**M100.** Alla service-funktioner kastar strukturerade `{ code: ErrorCode, error: string, field?: string }`-objekt, inte plain `Error`. Catch-block i service-wrappers följer trestegs-mönstret: (1) `err && typeof err === 'object' && 'code' in err` → propagera strukturerat, (2) `err instanceof Error` → logga + `UNEXPECTED_ERROR`, (3) okänt → logga + `UNEXPECTED_ERROR`. Plain `throw new Error` är förbjudet i services utom för genuint oväntade systeminvarianter (t.ex. `validatePeriodInvariants`) som fångas av en yttre wrapper och returneras som specifik `ErrorCode`. `useEntityForm` i renderer fångar `IpcError.field` och sätter per-fält-felmeddelande automatiskt. Introducerat i Sprint 11 Fas 4 (F9), normaliserat över alla services i Sprint 15 S46.

## 19. Performance: atomär paid_amount (båda sidor) + shared export queries (M101)

**M101.** F11/F17-utvidgning av M66 och M24:

- **Atomär paid_amount gäller nu båda sidor.** `expenses.paid_amount` speglar `invoices.paid_amount` exakt. `payExpense` använder samma CASE-sats som `payInvoice` för att uppdatera `paid_amount` och `status` atomärt. `listInvoices`, `listExpenses`, `getExpense` och `dashboard-service` läser kolumnen direkt istället för LEFT JOIN-subquery. Enda undantag: preflight-beräkningen i `payInvoice`/`payExpense` (som hämtar `remaining` INNAN den nya payment-raden är inlagd) måste fortsatt läsa från `*_payments`-tabellen.
- **Shared batched queries för export.** `getAllJournalEntryLines(db, fiscalYearId, dateRange?)` i `export/export-data-queries.ts` returnerar `Map<number, JournalLineInfo[]>`. SIE4, SIE5 och Excel använder denna map istället för loop-anrop. Queryn har `ORDER BY journal_entry_id, line_number` för determinism. Filter speglar `getBookedJournalEntries` exakt.
- **Nya shared batched queries ska följa Map-returmönstret.** Grupperings-nyckeln läggs INTE till i element-typen. Samma mönster som `getOpeningBalancesFromPreviousYear`.

## 20. Renderer-performance: ref-baserat isDirty + memoizerade rad-callbacks (M102)

**M102.** F21/F22/F33-optimeringar:

- **isDirty är ref-baserat.** `useEntityForm` använder `dirtyRef.current = true` i `setField`, `false` i `reset`. Ingen `JSON.stringify`-jämförelse vid varje render. "Sticky dirty" — formuläret flaggas som ändrat vid första setField, återställs bara via explicit `reset`.
- **Rad-callbacks memoizeras med linesRef-mönstret.** `addLine`/`removeLine`/`updateLine` wrappas i `useCallback` och läser senaste lines via `linesRef.current`. Deps: `[form.setField]` (stabil referens). Pattern: `const linesRef = useRef(lines); linesRef.current = lines;`.
- **Rad-komponenter wrappas i `React.memo`.** `InvoiceLineRow` och `ExpenseLineRow` (ny fil, extraherad från inline-rendering i ExpenseForm) är `memo`-wrappade. Shallow comparison av props skipprar re-render för orörda rader.
- **FiscalYearContext auto-persist väntar på `restoredIdLoaded`.** `getSetting('last_fiscal_year_id')` måste ha resolverats (via `.finally()`) innan auto-persist-effekten tillåts skriva till settings. Förhindrar att temporär openYear-fallback overskriver användarens senaste FY-val.

## 21. Bankavgifter vid betalning (M110–M111)

**M110.** Bankavgifter lagras som `bank_fee_ore` + `bank_fee_account` på `invoice_payments` och `expense_payments`. En payment = en fakturaavstämning. Avgiften påverkar INTE `paid_amount` — den påverkar bara verifikatets bankrad. Kontot hårdkodas till '6570' server-side. Ingen moms på bankavgifter. NULL eller 0 → ingen extra verifikatrad.

**M111.** Avgiften påverkar bankraden i verifikatet, inte fordran/skuldraden. Vid kundbetalning: D Bank (belopp − avgift), D 6570 (avgift), K 1510 (fullt belopp). Vid leverantörsbetalning: D 2440 (fullt belopp), D 6570 (avgift), K Bank (belopp + avgift). `invoices.paid_amount` och `expenses.paid_amount` speglar exakt summan av respektive `payments.amount` — avgifter räknas aldrig in.

## 22. Bulk-betalningar (M112–M114)

**M112.** Services exponerar både publik variant (returnerar `IpcResult`) och intern `_payInvoiceTx`/`_payExpenseTx`-variant (kastar strukturerade `{code, error, field?}`-fel, öppnar ingen egen transaktion). Bulk-wrappers (`payInvoicesBulk`, `payExpensesBulk`) komponerar över den interna varianten. Publika `payInvoice`/`payExpense` wrappar med `db.transaction(() => _payXTx(db, input))()` och strippar `journalEntryId` från returvärdet så det publika kontraktet är oförändrat.

**M113.** Bulk-operationer använder yttre `db.transaction()` med nestade `db.transaction(single)()` som savepoints. Best-effort: per-rad-fel samlas i `failed[]`, batchen committar så länge `succeeded.length >= 1`. Om alla misslyckas returneras `status: 'cancelled'` utan batch-rad och utan bank-fee. `payment_batches`-tabellen skapas av migration 021 och har `batch_type IN ('invoice', 'expense')`, `status IN ('completed', 'partial', 'cancelled')`. `invoice_payments`/`expense_payments` har nullable `payment_batch_id` FK.

**M114.** Batch-nivå-verifikat (bank-fee) använder samma serie (A för invoices, B för expenses) som underliggande payment-verifikat. Identifieras via `source_type='auto_bank_fee'` och `source_reference='batch:{batch_id}'` som sätts vid INSERT, aldrig via UPDATE (`trg_immutable_booked_entry_update` blockerar annars). `_payExpenseTx` accepterar `skipChronologyCheck: boolean` — publika `payExpense` anropar med `false`, bulk-wrapper validerar M6-kronologin en gång på batch-nivå och anropar med `true`. Bank-fee-policy: se M126.

## 23. E2E-testinfrastruktur (M115–M117)

**M115.** E2E-tester körs mot dev-byggd Electron-app via Playwright. Varje test-fil får egen temp-db via `FRITT_DB_PATH`-env (guardad till `NODE_ENV=test` eller `FRITT_TEST=1`). Data seedas via IPC-anrop från Playwright-sidan (`window.api.*` för produktion, `window.__testApi.*` för test-only) efter att appen startats — inte via direkt better-sqlite3 före start. Skäl: native module (better-sqlite3) kompileras för antingen Node.js (vitest) eller Electron (Playwright) — aldrig båda samtidigt. IPC-approach undviker ABI-konflikten helt.

**M116.** E2E-tester täcker flöden som är orealistiska att testa i system-lagret (multi-step-UI, renderer↔main-IPC-kontrakt, full stack). System-lagret äger fortfarande affärslogik-testning. Ett E2E-test per kritiskt flöde, inte per edge-case. Redundansaudit i `tests/REDUNDANCY_AUDIT.md`.

**M117.** `data-testid` tillåts på kritiska E2E-kontrakt: `wizard`, `app-ready`, `page-{name}`, bulk-dialog-actions, export-knappar. Fullständig whitelist i `tests/e2e/README.md`. Nya data-testid ska läggas till i whitelist vid införande.

## 24. Opening balance-semantik (M118)

**M118.** `journal_entries` med `source_type='opening_balance'` är undantagna från immutability-triggers 1–5 (`trg_immutable_booked_entry_update/delete`, `trg_immutable_booked_line_update/delete/insert`). Detta möjliggör `reTransferOpeningBalance`-flödet som raderar och återskapar IB-verifikatet vid FY-byte. Balance-trigger 6 (`trg_check_balance_on_booking`) och period-trigger 7 (`trg_check_period_on_booking`) har INTE opening_balance-undantag — IB måste balansera och datumet måste ligga i öppet FY vid bokning. Om ett framtida IB-korrigeringsflöde behövs (t.ex. ändra IB efter att FY stängts) krävs undantag även i trigger 6/7.

## 25. Ore-suffix obligatoriskt (M119)

**M119.** Alla INTEGER-kolumner i SQLite som representerar pengar i ore ska ha `_ore`-suffix. Inga undantag. Galler retroaktivt (Sprint 15 F1 fixar 8 befintliga kolumner) och framat. Nya belopp-kolumner utan `_ore`-suffix ska inte accepteras i review.

## 26. company_id-denormalisering ar intentionell (M120)

**M120.** `journal_entries.company_id` och `accounting_periods.company_id` ar avsiktlig denormalisering for query-performance trots att `fiscal_year_id` ger company-scope via FK. `accounting_periods` anvander `company_id` i index `idx_ap_dates` och trigger `trg_check_period_on_booking`. Ta inte bort dessa kolumner.

## 27. Table-recreate bevarar inte triggers (M121)

**M121.** Vid `CREATE TABLE ... AS SELECT` / table-recreate-mönstret: alla triggers attached till tabellen måste återskapas explicit, oavsett om trigger-kroppen refererar de kolumner som ändras. SQLite droppar alla triggers vid `DROP TABLE`. Samma gäller index (redan hanterat i alla befintliga migrationer). Dessutom kräver table-recreate med FK-beroenden att `PRAGMA foreign_keys = OFF` sätts UTANFÖR transaktionen (SQLite ignorerar pragma inuti transaction). `runMigrations` i `db.ts` har explicit stöd för detta (index 21 = migration 022). Vid framtida table-recreate: lägg till `needsFkOff`-guard för relevant migrations-index. Kör alltid `PRAGMA foreign_key_check` efter re-enable.

Historik: S42 upptäckte att `trg_prevent_invoice_delete` tappades tyst vid invoices table-recreate. S41:s stoppvillkor ("inga triggers refererar de fem kolumnerna") fångade inte trigger-tillhörighet till tabellen.

## 28. Table-recreate-mönstret för tabeller med inkommande FK (M122)

**M122.** När en migration kräver `CREATE TABLE → DROP TABLE → RENAME` på en
tabell som har **inkommande** FK-referenser från andra tabeller, ska följande
mönster användas:

1. `PRAGMA foreign_keys = OFF` körs **utanför** migrations-transaktionen
   (better-sqlite3 tillåter inte PRAGMA foreign_keys-ändring inne i en
   transaktion).
2. Migrationen körs i transaktion: skapa ny tabell med `_new`-suffix, kopiera
   data, droppa gamla tabellen, byt namn på den nya, återskapa alla index och
   alla triggers (M121).
3. `PRAGMA foreign_keys = ON` körs efter transaktionen.
4. `PRAGMA foreign_key_check` körs direkt efter re-enable. Om resultatet inte
   är tomt → kasta fel och rulla tillbaka migrationen externt (annars har
   databasen FK-överträdelser och inga triggers fångar dem framåt).
5. För varje table-recreate som följer detta mönster ska en
   migrations-uppgraderings-smoke-test verifiera dataintegritet med konkreta
   värden, inte bara att schemat ser rätt ut.

Tabeller med inkommande FK i nuvarande schema (per S41-audit):
- `companies` ← fiscal_years, accounting_periods, journal_entries
- `fiscal_years` ← accounting_periods, verification_sequences, journal_entries,
  invoices, expenses, manual_entries, opening_balances, payment_batches
- `accounts(account_number)` ← journal_entry_lines, expense_lines,
  invoice_payments, expense_payments
- `counterparties` ← invoices, expenses, price_lists
- `journal_entries` ← invoice_payments, expense_payments, manual_entries,
  invoices, expenses, payment_batches (självreferens via corrects_entry_id /
  corrected_by_id)
- `invoices` ← invoice_payments, invoice_lines
- `expenses` ← expense_lines, expense_payments
- `manual_entries` ← manual_entry_lines
- `vat_codes` ← products, invoice_lines, expense_lines
- `products` ← invoice_lines, price_list_items
- `payment_batches` ← invoice_payments, expense_payments

Recreate på dessa kräver M122. Recreate på övriga (bladtabeller utan
inkommande FK) kräver bara M121 (trigger-reattach).

Exempel: migration 022 (Sprint 15 S42) införde mönstret för `invoices`,
`invoice_payments`, `expense_payments`. Migration 023 (Sprint 15 S43)
applicerar det på `payment_batches`.

## 29. invoice_lines.account_number — NULL by design för produktrader (M123)

**M123.** `invoice_lines.account_number` är `NULL` by design för produktbaserade
rader (`product_id IS NOT NULL`). Kontot resolvas via `products.account_id` i
journal-entry-byggaren (`buildJournalLines`) med
`COALESCE(a.account_number, il.account_number)`. NOT NULL gäller **endast**
freeform-rader (`product_id IS NULL`) och **endast** efter status-övergång
`draft → unpaid` (trigger `trg_invoice_lines_account_number_on_finalize`,
migration 024).

Konsekvenser:
- Lägg aldrig `NOT NULL`-constraint direkt på kolumnen `invoice_lines.account_number`.
- Rendererens `invoice.ts`-schema sätter `account_number: null` explicit när
  `product_id` är satt — detta är korrekt beteende, inte en bugg.
- Triggern filtrerar med `product_id IS NULL AND account_number IS NULL` —
  produktrader passerar alltid.

## 30. Dublettdetektion via SQLITE_CONSTRAINT_UNIQUE (M124)

**M124.** `mapUniqueConstraintError(err, mappings)` i `src/main/services/error-helpers.ts` mappar `SqliteError` med `code === 'SQLITE_CONSTRAINT_UNIQUE'` (eller `SQLITE_CONSTRAINT_PRIMARYKEY`) till specifika `ErrorCode`-värden. Matchning sker via substring på `err.message` — robust mot compound-index-format. Varje service importerar sin egen mappning (`COUNTERPARTY_UNIQUE_MAPPINGS`, `COMPANY_UNIQUE_MAPPINGS`, etc.) och anropar helpern som första steg i catch-blocket. Returnerar `{ code, error, field? }` eller `null` vid icke-match. Nya UNIQUE-constraints kräver en ny mapping-entry — annars faller felet till `UNEXPECTED_ERROR`.

## 31. Bank-fee-policy vid bulk-betalningar (M126)

**M126.** Bankavgift (`bank_fee_ore`) vid bulk-betalning bokförs som ett separat verifikat per batch, inte per payment. Avgiften bokförs **hela beloppet** på konto 6570 — ingen proportionell fördelning per faktura/kostnad. Cancelled-batchar (alla payments misslyckades, `succeeded.length === 0`) skapar varken batch-rad eller bank-fee-verifikat. Guards i `payInvoicesBulk` (invoice-service.ts:1216) och `payExpensesBulk` (expense-service.ts:938): `if (succeeded.length === 0) return { status: 'cancelled', batch_id: null, bank_fee_journal_entry_id: null }`.

Framtida övervägande: proportionell fördelning av bankavgift per faktura för mer precis kostnadsredovisning. Nuvarande lösning är enklast och korrekt ur bokföringsperspektiv (total avgift på rätt konto).

## 32. ADD COLUMN-begränsningar vid schema-paritets-migrationer (M127)

**M127.** SQLite förbjuder non-constant `DEFAULT` i `ALTER TABLE ADD COLUMN` — inklusive `datetime('now')`, `CURRENT_TIMESTAMP`, och alla uttryck inom parenteser. Detta gäller **alla SQLite-versioner** (testat t.o.m. 3.51.3, dokumenterat i [sqlite.org/lang_altertable.html](https://www.sqlite.org/lang_altertable.html)). `CREATE TABLE` har inte denna begränsning — en tabell skapad med `DEFAULT (datetime('now'))` fungerar, men samma kolumndefinition via `ADD COLUMN` failar om tabellen har befintliga rader.

Konsekvens för paritets-migrationer (F10, F11, etc.): när target-schemat (t.ex. `invoice_lines`) har non-constant `DEFAULT`, kan `ADD COLUMN` på syskontabellen (t.ex. `expense_lines`) inte matcha `dflt_value` exakt. Workaround:

1. `ADD COLUMN ... DEFAULT <constant-placeholder>` — gör att schemat accepteras.
2. Backfill omedelbart med korrekta värden.
3. Applikations-lagret (service) sätter det dynamiska värdet explicit i alla INSERT-statements.
4. Paritets-testet dokumenterar divergensen med explicita `dflt_value`-assertions på båda sidor (känd och motiverad, inte paritets-bug).

Samma begränsning gäller andra `ADD COLUMN`-restriktioner: kolumnen får inte vara `PRIMARY KEY`, inte ha `UNIQUE`, inte referera en annan tabell i `REFERENCES` med actions, och inte vara `GENERATED`. Vid framtida paritets-findings (F11 CHECK-constraints, etc.) — verifiera att target-kolumnens definition är ADD COLUMN-kompatibel innan migration-design.

## 33. Handler error-patterns (M128)

**M128.** IPC-handlers har två godkända error-pattern-mönster:

1. **Direkt delegation** — handler-body är en enrads `return service(...)` där servicen returnerar `IpcResult<T>` och följer M100. Ingen try/catch i handler. Används för 56+ handlers där ingen logik behövs utöver service-anrop.

2. **`wrapIpcHandler(schema, fn)`** — handler wrappas via helper i `src/main/ipc/wrap-ipc-handler.ts`. Helper hanterar: Zod-validering (VALIDATION_ERROR + field), genomsläpp av IpcResult-retur, wrap av raw T-retur till `{ success: true, data: T }`, mapping av kastade strukturerade fel (M100) till IpcResult, catch av okända fel → UNEXPECTED_ERROR + log.error.

**Generisk catch som kollapsar allt till `TRANSACTION_ERROR` är förbjuden.** Historiskt mönster (15 handlers i Sprint 11–15) migrerat i Sprint 16 S60.

**Nya handlers:** använd mönster 2 om logik utöver service-anrop krävs (t.ex. file I/O, multi-service-composition). Använd mönster 1 om handlern är en ren pass-through.

Korsreferens: M100 (strukturerade valideringsfel), M124 (UNIQUE-mappning).

## 34. Form-totals som separerad komponent (M129)

**M129.** Formulärtotaler som beräknar F27-kritisk aritmetik (qty × price, per-rad avrundning, moms-beräkning) ska extraheras till en separat `<EntityTotals>`-komponent — inte beräknas inline via `useMemo` i formulärkomponenten.

Denna princip dokumenterar det mönster som redan etablerats i InvoiceTotals (S66a) och nu också i ExpenseTotals (S66b). Framtida formulärtotaler ska följa samma mönster.

**Varför:**
- **F27-isolering:** Totals-aritmetiken är den yta där F27-klassens buggar uppstår (felaktig ordning av multiplikation/avrundning/ackumulering).
- **Testpyramid-symmetri:** Möjliggör tre-nivå-verifiering: per-rad, ackumulerad, kedja.
- **Paritetsgaranti:** Alla form-totals ska följa samma per-rad-avrundningsmönster: `toOre(qty * price_kr)` per rad, sedan ackumulera i öre. Inte `toOre()` på total (ger annorlunda avrundningsbeteende vid fraktionella belopp — se `docs/s66b-characterization.md`).

**Referens:** InvoiceTotals (S66a), ExpenseTotals (S66b).

**Konsekvens:** Framtida formulär med belopps-totaler (kreditfakturor, offerter) följer samma mönster.

## 35. Invoice vs Expense quantity-semantik (M130)

**M130.** Invoice och Expense har avsiktligt olika quantity-semantik genom hela stacken:

| Lager | Invoice | Expense |
|---|---|---|
| SQLite | `quantity REAL` | `quantity INTEGER` |
| Zod IPC-schema | `z.number().positive().refine(≤2 dec)` | `z.number().int().min(1)` |
| Form-schema | `z.number().refine(≤2 dec)` | `z.number().int()` |
| LineRow parser | `parseFloat` | `parseInt` |

**Motivering:** Fakturor kräver fraktionell quantity (konsultfakturering: 1.5 timmar, 0.75 meter). Kostnader har styckantal (1 st, 2 st) — leverantörsfakturor anger alltid heltal.

M92/regel 15 ("quantity × unit_price_ore = line_total_ore, quantity heltal") gäller **expense_lines**, inte invoice_lines. Invoice_lines har haft `quantity REAL` sedan session 6.

Divergensen är avsiktlig. Framtida entiteter med quantity måste explicit välja semantik — inte defaulta till ena lägret.

**Konsekvens för F27-testning:** Float-precision-fel (F44) kan uppstå i InvoiceTotals vid fraktionell qty × decimalpris. ExpenseTotals skyddas av heltalsinvarianten. B2.4-tester i ExpenseTotals är defensiva, inte produktionsscenarier.

## 36. Monetära beräkningar via heltalsaritmetik (M131)

**M131.** Monetära beräkningar där operander kan vara fraktionella (qty × price_kr)
ska använda heltalsaritmetik via öre-konvertering av båda operander, inte
native float-multiplikation.

**Formel:** `Math.round(Math.round(a * 100) * Math.round(b * 100) / 100)`

**Invariant:** Båda operander har ≤2 decimalers precision (låst via Zod-refine
i form- och IPC-scheman).

**Varför:**
- **IEEE 754-fel:** `0.29 * 50 = 14.499...` ger felaktig avrundning
- **Karakteriseringsresultat (F44, Sprint 20):** 0.346% fel i gammal formel,
  0% fel med heltalsaritmetik (domän: qty ∈ [0.01, 5.00], price ∈ [0.01, 200.00])
- **Konvergens med öre-arkitektur:** Systemets databas-nivå är öre (heltal);
  beräkningar bör spegla det

**Referens:** InvoiceTotals, ExpenseTotals, invoice-service.ts `processLines`
(Sprint 20 S67b), `docs/s67b-characterization.md`, `scripts/characterize-totals.mjs`.

**Scope:** Gäller alla monetära beräkningar i systemet. Sprint 20 täcker
renderer-sidans Totals-komponenter och invoice-service.ts bokföringsgenerering.
InvoiceLineRow.tsx och ExpenseLineRow.tsx (display-lager) är identifierade
men lämnade som F47-backlog (lågrisk — display, inte bokföring).

**Konsekvens:** Framtida komponenter med monetära beräkningar följer samma
mönster. Zod-scheman för qty-fält måste inkludera 2-decimaler-invarianten.

## 37. Cross-schema-gränser i shared constants (M132)

**M132.** Validerings-gränser som delas mellan form-schema (renderer) och
IPC-schema (main-process) placeras i `src/shared/constants.ts` som namngivna
konstanter. Error-meddelanden som refererar dessa gränser definieras i samma
fil för att undvika DRY-drift.

**Varför:** Form-schema och IPC-schema validerar samma invarianter oberoende.
Hårdkodade magic numbers i respektive schema-fil driver isär över tid —
samma skuldklass som F48 (decimal-precision) exponerade.

**Konsekvens:** Nya validerings-gränser som gäller i båda lagren (form + IPC)
ska definieras i `src/shared/constants.ts`, inte hårdkodas i schema-filerna.

**Referens:** `MAX_QTY_INVOICE`, `MAX_QTY_EXPENSE`, `ERR_MSG_MAX_QTY_*`
(Sprint 22a F46).

## 38. A11y-regression-skydd (M133)

**M133.** `axeCheck: false` tillåts inte i testfiler utan dokumenterad
undantagsmarkering. Verifieras via `npm run check:m133`.

**Scope:** Fångar enbart `axeCheck: false`-återinförsel. Explicit undantag
för infrastruktur-filer (render-with-providers.tsx som definierar/testar
flaggan). AST-baserad utökning (error-`<p>` utan `role="alert"`) planerad
som F49-b men inte implementerad — grep-regex kan inte matcha multi-line
JSX pålitligt.

**Referens:** Sprint 22c (F49), `scripts/check-m133.mjs`.

## 39. BR årets resultat via result-service (M134)

**M134.** `getBalanceSheet()` i `report-service.ts` beräknar "årets resultat"
(den dynamiska posten under Eget kapital) via `calculateResultSummary()` från
`result-service.ts`, inte via egen filter-reduce. Detta garanterar att BR:s
"årets resultat" är identisk med RR:s bottom-line.

Historik: Före S24b använde BR `!startsWith('1') && !startsWith('2')` för att
filtrera movements och summera class 3–8. Denna beräkning var funktionellt
korrekt med nuvarande BAS-chart men bröt mot M96 (single source of truth)
och kunde divergera vid icke-standard-konton.

Invariant-test i `tests/s24b-br-rr-consistency.test.ts` (F19 permanent vakt)
verifierar att 4 konsument-vägar (result-service direkt, re-export via
opening-balance, getIncomeStatement, getBalanceSheet) ger identisk siffra
via `Map`-deduplikation där `distinctValues.size === 1`.

## 40. Dual-implementation paritetstest med delad fixture (M135)

**M135.** När samma beräkning implementeras i både renderer (preview) och
main process (bokföring) ska en paritets-test verifiera att båda ger
identisk output för samma input. Testet assertar per-rad-likhet, inte
bara totaler, för att fånga kompensationsfel.

Testscenarier ska centraliseras i en delad fixture-fil (t.ex.
`tests/fixtures/vat-scenarios.ts`) som importeras av alla testlager.
Detta förhindrar att scenariedata driftar — en uppdatering i bara
ett lager utan det andra är omöjlig när båda läser samma fixture.

Motivering: F19 (BR/RR-divergens, S24b) och F40 (VAT-testet, S25)
exponerade samma mönster — dual-implementationer som kan glida isär
utan att något enskilt test fångar det. Paritetstestet är vakten.

Referens: `tests/s24b-br-rr-consistency.test.ts` (all-consumers-identical),
`tests/s25-vat-parity.test.ts` (renderer↔backend VAT),
`tests/fixtures/vat-scenarios.ts` (delad fixture-mall).

## 41. Renderer form-types använder _kr-suffix (M136)

**M136.** Form-types (`*Form`-suffix i `src/renderer/lib/form-schemas/`)
använder `_kr`-suffix för prisfält (t.ex. `unit_price_kr`). Användaren
matar in kronor; konvertering till öre sker i form-transformern vid submit.
`_kr`-data får ALDRIG korsa IPC-gränsen — IPC-scheman använder uteslutande
`_ore`-suffix. Denna konvention kompletterar M119 (öre i SQLite) med
renderer-sidans spegelbild.

## 42. Sign-flip-doktrin: belopp alltid positiva i DB (M137)

**M137.** Alla belopp i `invoices`, `invoice_lines`, `expenses` och
`expense_lines` lagras som positiva heltal (öre). Domän-semantik —
om en transaktion representerar en reversering (kreditfaktura, retur,
makulering) — appliceras **enbart** i journal-byggaren (`buildJournalLines`)
genom att byta vilken sida som får debet respektive kredit.

**Varför:**
- CHECK-constraints (`>= 0`) behöver inte modifieras per transaktionstyp
- Aggregeringar (`SUM(total_amount_ore)`, `SUM(paid_amount_ore)`) förblir
  triviala — inga sign-aware `CASE WHEN`-villkor
- Dashboard, VAT-rapport och export-logik fungerar utan ändringar
- PDF visar naturligt positiva belopp med korrekt rubrik

**Konsekvens:** Framtida entiteter med "negativ" semantik (leverantörs-
kreditnotor, returer, makuleringar) följer samma mönster: positiva belopp
i DB, omvänd D/K i journal-byggaren.

**Referens:** Sprint 28 `buildJournalLines` (invoice-service.ts), `isCreditNote`-
flagga som swappar `debit_ore`/`credit_ore` per rad.

## 43. Defense-in-depth för irreversibla relationer (M138)

**M138.** När en relation är irreversibel (t.ex. kreditfaktura → original,
framtida: makulering → original) ska skyddet finnas i **fyra oberoende
lager**:

1. **DB-constraint:** FK (`credits_invoice_id REFERENCES invoices(id)`)
2. **Service-validering:** subquery-guard (`SELECT id FROM invoices WHERE
   credits_invoice_id = ? LIMIT 1`) + typ-guard (`invoice_type !== 'credit_note'`)
3. **UI-döljning:** knappen döljs (`!item.has_credit_note`)
4. **Visuell indikator:** badge ("Krediterad") som kommunicerar status

Varje lager kan kringgås isolerat — FK skyddar inte mot UI-dubbelklick,
UI-döljning skyddar inte mot API-anrop, service-guard skyddar inte mot
direkt SQL. Alla fyra behövs.

**Konsekvens:** Framtida irreversibla relationer (makulering, arkivering)
ska implementera alla fyra lagren.

## 44. Cross-reference i verifikationstext (M139)

**M139.** När en transaktion semantiskt refererar en annan (kreditfaktura
→ originalfaktura, korrigeringsverifikat → originalverifikat) ska referensen
finnas **i verifikationstexten** (`journal_entries.description`), inte bara
i en relationstabell.

Format: `Kreditfaktura #3 — Acme AB (avser faktura #1)`

**Varför:** SIE4/SIE5-export inkluderar `description` men inte applikations-
specifika FK-relationer. Utan referens i texten går spårbarheten förlorad
för revisorn som arbetar i ett annat system.

**Konsekvens:** Framtida korsrefererade transaktioner (korrigeringsverifikat,
makuleringar) inkluderar referens i description-fältet.

## 45. Korrigeringsverifikat — en-gångs-lås (M140)

**M140.** Korrigeringsverifikat (`corrects_entry_id IS NOT NULL`) kan inte
själva korrigeras (Q12-guard). Originalet kan inte korrigeras en andra gång
(`corrected_by_id IS NOT NULL` → guard). Detta ger ett **permanent lås efter
en korrigering**.

**Medvetet val.** Kedjor av korrigeringar (korrigera korrigeringen, sedan
korrigera den korrigeringen) skapar spårbarhetskaos utan bokföringsmässig
nytta. BFL 5 kap 5§ kräver tydlig referens vid rättelse — kedjekorrigeringar
gör referenserna otydliga.

**Workflow vid fel i korrigeringen:** Skapa en ny manuell bokföringsorder
(C-serie) som justerar de berörda kontona. Ingen automatisk korsreferens —
revisorn dokumenterar i description manuellt. Detta är avsiktligt: systemet
ska inte uppmuntra korrigeringskedjor.

**Varför inte allow-chain?** Varje länk i kedjan kräver att alla
föregående verifikat är konsekventa. Ett kedjekorrigeringssystem måste
spåra transitiv net-effekt, hantera partiella korrigeringar och
presentera kedjan begripligt i kontoutdrag och SIE-export. Komplexiteten
är oproportionerlig mot nyttan — manuell C-serie-rättelse täcker alla
edge-cases med minimal systemkomplexitet.

## 46. Cross-table trigger-inventering vid table-recreate (M141)

**M141.** Vid table-recreate av tabell T ska **alla triggers på ANDRA tabeller
som refererar T i sin body** inventeras och hanteras. M121 täcker triggers
attached till T — M141 täcker triggers attached till X som refererar T.

**Inventerings-query:**
```sql
SELECT name, tbl_name, sql FROM sqlite_master
WHERE type='trigger' AND sql LIKE '%T%' AND tbl_name != 'T';
```

**Hanteringsmönster:** DROP trigger före DROP TABLE T, återskapa trigger
efter ALTER TABLE T_new RENAME TO T.

**Historik:** Sprint 33 migration 032 (F46b) upptäckte att
`trg_invoice_lines_account_number_on_finalize` (attached till `invoices`)
refererar `invoice_lines` i sin body. DROP TABLE `invoice_lines` orsakade
"no such table" vid trigger-evaluering. Fixat genom explicit DROP + recreate
av cross-table-triggern.

**Konsekvens:** Framtida table-recreate (oavsett M121 eller M122) ska köra
inventerings-queryn som pre-flight och dokumentera resultatet i migrations-
kommentaren.

## 47. Kronologisk datumordning inom verifikationsserie (M142)

**M142.** Verifikationer inom samma verifikationsserie och räkenskapsår
MÅSTE ha icke-minskande datum. Samma dag är tillåtet (strict less-than).
Enforced via `checkChronology()` i `src/main/services/chronology-guard.ts`.

**Callsites:**
- `finalizeDraft` (A-serie) — invoice finalize
- `finalizeExpense` (B-serie) — expense finalize
- `finalizeManualEntry` (C-serie) — manual entry finalize
- `_payInvoiceTx` (A-serie) — invoice payment (med `skipChronologyCheck` för bulk)
- `_payExpenseTx` (B-serie) — expense payment (migrerad från inline till delad helper)

**Bulk-säkerhet:** `payInvoicesBulk` och `payExpensesBulk` validerar kronologi
en gång på batch-nivå före loopen, sedan skickar `skipChronologyCheck = true`
per rad. Paritet mellan invoice- och expense-bulk.

**Transaction-guard:** `checkChronology` kastar `Error` om `!db.inTransaction`.
Alla callsites körs redan inom `db.transaction()`.

**ErrorCode:** `VALIDATION_ERROR` (inte nytt `CHRONOLOGY_ERROR`) —
felmeddelandet är tillräckligt specifikt.

**Korsreferens:** Utvidgar den befintliga kronologi-checken i `_payExpenseTx`
(B-serie, sedan Sprint 13) till alla serier. M112–M114 (bulk-betalningar)
beskriver `skipChronologyCheck`-mönstret som M142 nu tillämpar konsekvent.

## 48. FTS5 rebuild try-catch-mönster (M143)

**M143.** Alla `rebuildSearchIndex`-anrop MÅSTE wrappas i `try-catch`.
Rebuild-failure får INTE krasha bokföringsoperationen — data är redan
committad, sökning faller tillbaka till LIKE.

Mönster: `try { rebuildSearchIndex(db) } catch { /* log only */ }`

**Korsreferens:** M128 (handler error-patterns) kräver att mutation-success
inte bryts av sekundära operationer. M143 är specialfallet: rebuild är
sekundär i förhållande till den bokföringsoperation som just committats.
Om rebuild failar faller sökningen tillbaka till LIKE (D4 i search-service).

## 49. IpcResult-mandat för affärsdata-kanaler (M144)

**M144.** Alla IPC-kanaler som returnerar affärsdata (listor, entiteter,
beräkningar) MÅSTE använda `IpcResult<T>` wrapper. `wrapIpcHandler` i
`src/main/ipc/wrap-ipc-handler.ts` är kanoniskt verktyg.

**Renderer-hooks:** `useIpcQuery<T>` för alla affärsdata-kanaler.
`useDirectQuery<T>` kvarstår ENBART för infrastruktur-kanaler
(health-check, settings:get/set, backup, opening-balance:re-transfer).
Alla useDirectQuery-kanaler för affärsdata är migrerade (Sprint 38 F60b).

**Historik:** Sprint 35 (F60) migrerade 11 kanaler. Sprint 38 (F60b)
migrerade de sista 7 useDirectQuery-kanalerna (company:get, fiscal-year:list,
fiscal-period:list, counterparty:get, product:get, invoice:list-drafts,
invoice:get-draft). NO_SCHEMA_CHANNELS reducerad till 7 infrastruktur-kanaler.

**Konsekvens:** Nya IPC-kanaler som returnerar data MÅSTE följa M144.
`useDirectQuery` + raw return i handler är INTE tillåtet för nya kanaler.

## 50. SIE4-import-strategier och I-serie (M145)

**M145.** SIE4-import (`importSie4` i `src/main/services/sie4/sie4-import-service.ts`)
har två strategier med distinkta semantik:

- **`'new'`** — skapar företag via `createCompany` (FY + periods auto-genererade).
  Kräver att databasen saknar företag. Används för första import till en tom
  installation.
- **`'merge'`** — matchar befintligt företag via `org_number`, lägger till
  saknade konton, uppdaterar namn. Kräver exakt orgNr-match. Används för
  att importera kompletterande data till existerande bokföring.

**Importerade verifikationer lagras i `I`-serien** (Import). Separata från A
(invoice), B (expense), C (manual), D (opening balance), för att:
- Bevara spårbarhet mellan importerad och nativ data
- Undvika kollision med löpande verifikationsnumrering
- Möjliggöra senare filtrering/export av enbart importerad data

Obalanserade verifikationer i källfilen hoppas över med varning istället för
att rulla tillbaka hela importen (partial success). Okända konton
(som inte finns i BAS-kontoplanen och inte är markerade importable) kastar
`VALIDATION_ERROR` som rullar tillbaka HELA transaktionen.

**Sign handling:** positiva belopp → `debit_ore`, negativa → `credit_ore`.
Denna konvention speglar exporten (`sie4-export-service.ts`) och säkerställer
roundtrip-konsistens (export → parse → import ger samma bokföringsposter).

**Historik:** Sprint 47 (F5a) parser + validator + dry-run; Sprint 48 (F5b)
databas-integration + wizard.

## 51. Polymorfa payment-batch-operationer (M146)

**M146.** Operationer som hanterar `payment_batches` (pain.001-export,
validering, aging) ska vara **polymorfa via `batch.batch_type`** — inte
duplicera kod per typ.

Mönster:
- Publik funktion tar `batchId`, läser `batch_type` från raden, dispatchar
  till rätt interna query
- Delade queries returnerar domän-agnostiska fältnamn (`source_id`,
  `remittance_ref`) snarare än typ-specifika (`expense_id`,
  `supplier_invoice_number`)
- XML/filgeneration är identisk för båda sidor — bara datakällan skiljer

Referens: `pain001-export-service.ts` `getPaymentsForBatch(db, batchId, batchType)`.
Expense-branch läser `expense_payments JOIN expenses` med
`supplier_invoice_number AS remittance_ref`. Invoice-branch läser
`invoice_payments JOIN invoices` med `invoice_number AS remittance_ref`.
`generatePain001` är helt typ-agnostisk.

**Varför:** M112–M114 etablerade att `payment_batches` är en delad tabell
för båda sidor. Duplicering av exporter, validerare eller rapporter per
typ skapar drift-risk där expense-sidan utvecklas men invoice-sidan
halkar efter (exakt vad som hände mellan S46 och S50 — invoice-branch
fanns i `getPaymentsForBatch` men hade `NULL AS supplier_invoice_number`
som aldrig nådde UI:n).

**Konsekvens:** Framtida batch-operationer (t.ex. BGC-returfil-import,
batch-rapport, eller nya exportformat som SEPA DD) ska implementeras
polymorft från start. Typ-specifik validering är OK, men koden ska
dispatchas från en enda entry-point.

Historik: Sprint 46 (F4) implementerade pain.001 för expense-sidan;
Sprint 50 (F6) öppnade symmetrin för invoice-sidan.

## 52. E2E dialog-bypass-varianter (M147)

**M147.** Native Electron-dialoger (`dialog.showOpenDialog`,
`showSaveDialog`) kan inte drivas från Playwright. Handlers bypassar dem
när `E2E_TESTING=true` via fyra varianter i `src/main/utils/e2e-helpers.ts`:

| Dialog-typ | Helper | Env-variabel |
|---|---|---|
| Save med känt default-filnamn | `getE2EFilePath(name, 'save')` | `E2E_DOWNLOAD_DIR` |
| Open-file med känt default-filnamn | `getE2EFilePath(name, 'open')` | `E2E_DOWNLOAD_DIR` + fil måste finnas |
| Open-file utan default (user väljer) | `getE2EMockOpenFile()` | `E2E_MOCK_OPEN_FILE` |
| Open-directory | Inline check i handler | `E2E_DOWNLOAD_DIR` |

Alla varianter är guardade av `E2E_TESTING=true`-check och returnerar
null/no-op i produktion. Testinfrastruktur ansvarar för att sätta env,
skapa mock-filer, och rensa efter test.

**Regel:** Nya IPC-handlers som öppnar native dialoger MÅSTE inkludera
bypass med rätt variant. Saknas bypass kan handlern inte testas i E2E
(Playwright kan inte klicka på OS-nativa dialoger) — motsvarar en
icke-testbar kontrakt-yta.

Dokumentation: `tests/e2e/README.md` "Dialog bypass (M63)"-sektionen
listar alla befintliga bypass-callsites och ger test-exempel.

**Historik:** M63 introducerade save-dialog-bypass i tidigt skede.
Sprint 49 (S49) utvidgade till open-file-utan-default (`E2E_MOCK_OPEN_FILE`
för SIE4-import) och open-directory (för PDF batch-export).

## 53. E2E-fixtures seedas uteslutande via IPC (M148)

**M148.** All E2E-testdata skapas via `window.api` eller `window.__testApi`
(IPC-anrop in till main-process), aldrig genom att öppna databasen direkt
med better-sqlite3 i test-processen. Förankrar M115: Playwright kör mot
dev-byggd Electron där `better-sqlite3` är kompilerad för Electron-ABI,
medan test-processen är Node — direkt DB-öppning korrumperar handles eller
failar ABI-check.

**Konsekvens:** Nya fixtures komponeras som sekvenser av IPC-anrop. Tabell-
eller tillstånd-poke som inte har ett service-API kräver ny `__test:*`-endpoint
i `src/main/ipc/test-handlers.ts` (guardad av `FRITT_TEST=1`) — inte direkt SQL
i test-koden.

**Korsreferens:** M115 (E2E-körmodell), M117 (data-testid-kontrakt).

## 54. E-serie för avskrivningar (M151)

**M151.** Avskrivningsverifikat bokförs i **E-serien** (Depreciation) —
separerat från A (invoice), B (expense), C (manual/accrual/correction),
I (SIE4-import) och O (opening_balance). `source_type='auto_depreciation'`
(migration 001 CHECK-enum) identifierar dem. Nummertilldelning följer
standardmönstret:

```sql
SELECT COALESCE(MAX(verification_number), 0) + 1
FROM journal_entries
WHERE verification_series = 'E' AND fiscal_year_id = ?
```

**Defense-in-depth:** Migration 038 (Sprint 53) införde
`CHECK (verification_series IN ('A','B','C','E','I','O'))` på `journal_entries`
via M122 table-recreate. Pre-flight-query verifierar att ingen befintlig
verifikation har serie utanför whitelist innan CHECK läggs till.

**D-serien är ledig** (används inte idag). Reserverad för framtida behov —
lägg inte till ad-hoc utan att först utvidga whitelist-CHECK.

**Callsites:** `depreciation-service._executeScheduleTx` är enda stället som
skriver E-serien. Chronology-check (M142) körs per schedule.

**Korsreferens:** M142 (chronology per serie), M145 (I-serie för import som
etablerade samma separations-mönster).

## 55. Deterministisk tid via getNow() (M150)

**M150.** Main-process affärslogik som läser nuvarande tid MÅSTE använda
`getNow()` (eller `todayLocalFromNow()`) från `src/main/utils/now.ts`, inte
`new Date()` direkt. Helperna respekterar `FRITT_NOW` env-variabel när
`NODE_ENV=test` eller `FRITT_TEST=1` och är annars indistinkt från `new Date()`.

**Callsites som är migrerade (S52-baseline):**
- `backup-service.ts` — backup-filnamn + pre-restore-timestamp
- `pre-update-backup.ts` — backup-filnamn
- `sie4-export-service.ts` — `#GEN`-datum
- `sie5-export-service.ts` — `Date`-attribut på rotelementet
- `excel-export-service.ts` — export-metadata-timestamp
- `pain001-export-service.ts` — XML-timestamp
- `aging-service.ts` — default `asOfDate` för overdue-beräkning
- `invoice-service.ts`, `expense-service.ts`, `correction-service.ts` — default
  fakturadatum och kreditnotedatum

**Undantag (får fortsatt använda `new Date()`):**
- SQL-nivå `datetime('now','localtime')` — DB-klockan, inte main-process
- Loggningstimestamps (electron-log)
- Argumentparsning: `new Date(someString)` konverterar input, inte aktuell tid
- Renderer-kod: tid i UI läses inte för bokföring

**Konsekvens:** Framtida tidssensitiv kod i main-process ska injicera via
`getNow()`. Review-regel: PR som introducerar `new Date()` utan argument i
`src/main/services/` ska avvisas om det inte är explicit undantag ovan.

**Test-API:** `window.__testApi.freezeClock(isoString | null)` sätter/rensar
`FRITT_NOW` runtime för E2E-tester. Guardad av `FRITT_TEST=1`.

## 56. Signed amount i bank-extern rådata (M152)

**M152.** `bank_transactions.amount_ore` är signerad (positiv=inkommande,
negativ=utgående). Detta avviker från **M137** (belopp alltid positiva i DB,
sign-flip i journal-byggaren) men är korrekt eftersom:

- `bank_transactions` är **extern rådata** från bankens kontoutdrag, inte en
  domänenhet. Signen kommer direkt från ISO 20022 `CdtDbtInd`-elementet.
- Direction-guard i match-service säkerställer korrekt fakturasida innan
  bokföring (M137 gäller fortfarande för invoices/expenses/credits).
- En alternativ unsigned-modell skulle kräva en separat sidokolumn för sign
  och införa översättningskomplexitet utan semantisk vinst.

Framtida externa rådata-tabeller (camt.054, MT940, BGC-returfil) får också
använda signed amounts utan M137-konflikt. Interna domänenheter (invoices,
expenses, credit notes) följer fortsatt M137.

**M122-inventory tillägg (Sprint 55):** inkommande FK-referenser från
bank-tabellerna:
- `invoice_payments` ← bank_reconciliation_matches
- `expense_payments` ← bank_reconciliation_matches
- `bank_statements` ← bank_transactions
- `bank_transactions` ← bank_reconciliation_matches

## 57. Deterministisk scoring för auto-matchning (M153)

**M153.** Alla scoring-funktioner i `src/main/services/bank/**.ts` (och
framtida auto-klassificerare i samma scope) ska vara:

1. **Heltalspoäng** — inga floats i score/thresholds (heltalsaritmetik
   speglar systemets öre-konvention).
2. **Deterministiska** — inga `Math.random`, `Date.now`, `performance.now`
   eller externa tillståndskällor.
3. **Rena** — samma input ger samma output oavsett när/var funktionen
   körs.

**Varför:** Scoring för bank-match-suggester är affärslogik som revisor
ska kunna re-derivera. Om scoringen vore icke-deterministisk skulle
samma TX kunna få olika matchnings-förslag mellan körningar — gör
spårbarhet omöjlig och bryter idempotens.

**Enforcement:** `npm run check:m153` (`scripts/check-m153.mjs`) kör
grep-scan över scope efter förbjudna tokens. Filter för kommentarer.
Körs i valideringsmatrisen.

**Persisterad data:** `match_method`-kolumnen lagrar enbart den
*starkaste enskilda signalen* som vann — inga sammansatta metoder.
`reasons[]` är runtime-only (returneras från suggester, persisteras
inte). Revisor kan re-derivera reasons deterministiskt från
TX-data + invoice/expense-snapshot.

**Framtida scope:** `src/main/services/**/auto-*.ts` vid F66-d
auto-klassificering. Scope-utvidgning kräver uppdatering av
`scripts/check-m153.mjs`.

**Referens:** Sprint 56 F66-b — `bank-match-suggester.ts`,
`tests/session-56-bank-match-suggester.test.ts`.

## 58. Unmatch via korrigeringsverifikat (M154)

**M154.** `unmatchBankTransaction` återställer en bank-reconciliation genom
(1) skapa ett korrigeringsverifikat via `correction-service` på det
ursprungliga payment/fee-verifikatet, (2) radera reconciliation-raden,
(3) radera payment-raden (för invoice/expense-matches; fee-matches har
ingen payment), (4) räkna om `paid_amount_ore` och `status` från
`SUM(payments)` för att bibehålla M101-invariant, (5) sätta
`bank_transactions.reconciliation_status='unmatched'`.

**Payment-raden raderas** — audit-trail upprätthålls av
korrigeringsverifikatet i C-serien, inte av bevarad payment-rad.
Voided-flag-mönstret övervägdes men förkastades: det skulle kräva att
alla SUM-queries, `paid_amount`-CASE och listor exkluderar voided,
en genomgripande ändring som inte motiveras när C-serie-korrigeringen
ger fullständig spårbarhet.

**Ordning är kritisk:** DELETE reconciliation + DELETE payment FÖRE
`createCorrectionEntry`. Annars blockerar (a) correction-service guard
#4 (HAS_DEPENDENT_PAYMENTS) och (b) DB-trigger
`trg_no_correct_with_payments` mot UPDATE status='corrected'. Trigger
och service är defense-in-depth mot korrigering av payment-JE utan att
först rensa payment-raderna.

**En-gångs-lås (M140) gäller per payment-verifikat, inte per TX.** Efter
unmatch kan användaren skapa en **ny manuell match** (som skapar ett
nytt payment-verifikat). Det nya kan också unmatchas en gång. Endast
det specifika verifikat som redan har `corrected_by_id IS NOT NULL` är
permanent låst.

**Batch-payments (M112) kan inte unmatchas per rad.** Blockeras av
`BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED`. UI döljer inte knappen utan
visar den som disabled med tooltip. Batch-unmatch är backlog.

**Referens:** Sprint A / S58 F66-e — `bank-unmatch-service.ts`,
`tests/session-58-bank-unmatch.test.ts`.

## Projektstatus

Se `STATUS.md` for aktuell sprint, test-count, kanda fynd och infrastruktur-kontrakt.
