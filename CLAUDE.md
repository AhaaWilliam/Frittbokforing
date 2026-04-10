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

**M100.** Validation helpers som `validateAccountsActive` kastar strukturerade `{ code: ErrorCode, error: string, field?: string }`-objekt, inte plain `Error`. Catch-blocken i service-funktioner hanterar detta mönster genom att kolla `err && typeof err === 'object' && 'code' in err` före fallback till generic `TRANSACTION_ERROR`. Resultatet är att specifika felkoder som `INACTIVE_ACCOUNT` propagerar korrekt till renderer via `IpcResult`. Fixat i Sprint 11 Fas 4 (F9).

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
