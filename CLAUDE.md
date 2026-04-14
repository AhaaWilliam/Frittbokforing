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

## Projektstatus

Se `STATUS.md` for aktuell sprint, test-count, kanda fynd och infrastruktur-kontrakt.
