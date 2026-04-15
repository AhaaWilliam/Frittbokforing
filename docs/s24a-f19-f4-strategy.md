# F19 + F4 Strategy — Result-service + account_number-comparator

**Sprint:** S24a (research)
**Datum:** 2026-04-15
**HEAD vid start:** aced8ec
**Testbaslinje:** 1493 passed, 2 skipped (134 test files)
**Verbatim baseline:** se .s24a-tmp/baseline-test-output.txt

## Sektioner
1. Executive summary (fylls sist)
2. F19 nuläge — tre definitioner av "årets resultat"
3. F4 nuläge — lexikografisk konto-jämförelse
4. Föreslagen taktik
5. Risk-analys
6. Arkitektur-alternativ (3 alternativ)
7. Test-strategi
8. Commit-plan för S24b

(Se slutet av dokumentet för Appendix A — Existerande M-regler)
## 1. Executive Summary

### Kritisk upptäckt

**F19 ("tre olika definitioner av årets resultat") är till stor del redan löst.**
M96–M98 (Sprint 11) etablerade `result-service.ts` som single source of truth.
Dashboard, Tax, RR och Opening Balance konsumerar den redan.

**Kvarvarande F19-gap:** Balansräkningen (getBalanceSheet) har en oberoende
beräkning av "årets resultat" via `!startsWith('1') && !startsWith('2')` filter
istället för att anropa result-service. Denna beräkning kan divergera om
icke-standard-konton introduceras.

**F4** (lexikografisk konto-jämförelse) har 6 latenta instanser — alla i
presentationssortering (ORDER BY, localeCompare), inga i beräkningsaggregering.
Konto-skapande via UI begränsat till 4 siffror.

### Vald arkitektur

- **Alternativ C:** BR anropar `calculateResultSummary()` från result-service.
  ~5 rader ändrade. Konsistent med hur getIncomeStatement redan konsumerar
  result-service.

### Vald F4-fix-strategi

- **SQL:** `ORDER BY CAST(account_number AS INTEGER)` på 5 ställen.
- **Application:** `compareAccountNumbers()` helper i `src/shared/account-number.ts`
  ersätter localeCompare.

### Migrations-väg

- **Big-bang squash.** <200 rader totalt. Feature-flag omotiverad.

### BR-konsekvens-status

- **Refaktorering i S24b.** BR:s filter-reduce ersätts med
  `calculateResultSummary().netResultOre`. BR/RR-konsistens-test inkluderas.

### S24b-estimat

- **Antal commits:** 6
- **Test-delta:** +19 (varav E2E: 1, property: 4, unit: 5, konsistens: 7, sortering: 2)
- **Baseline:** 1493 → ~1512

### Risk-summering

Pre-launch-app utan produktionsanvändare. Befintlig result-service har
14 dedikerade tester + 4 invariant-tester. BR-luckans praktiska impact:
noll med nuvarande BAS-chart (alla konton klass 1–8). F4: latent, kan inte
triggas via UI.

### Reserverat M-nummer

- **M134** — "BR:s årets resultat beräknas via result-service
  (calculateResultSummary)"

### Verifiering (post-review, 2026-04-15)

**Scenario (c) utesluten:** Exhaustiv consumer-audit av result-service visar
exakt 5 import-rader i 4 källfiler (dashboard, tax, report/RR,
opening-balance/fiscal). Ingen vy beräknar "årets resultat" oberoende utöver
BR:s kända gap. Re-exporten i opening-balance-service konsumeras av
fiscal-service (stale-check vid FY-creation) och ipc-handlers (get-net-result).

**RR-bottom-line === netResultOre bekräftat:** `getIncomeStatement().netResult`
= `calculateResultSummary().netResultOre` (report-service.ts:40). Redan
verifierat av invariant-test 8 i session-43-result-service.test.ts (rad 292–294)
med klass 8-poster. IncomeStatementView renderar `data.netResult` (rad 133).
Substitutionen i BR är safe.

**F19 backlog-status:** Finding var formulerad **före** Sprint 11 (M96). Stale
backlog-item som överlevde Sprint 11.

**Process-finding (S24a):** F19 var i backlog som "tre olika definitioner av
årets resultat". Sprint 11 (M96–M98) etablerade result-service.ts som single
source of truth utan att stänga findingen. **Ny rutin:** vid sprint-avslut
auditeras alla refererade findings i sprint-scope mot M-reglerna som
etablerats — om findingen är löst av en M-regel ska den stängas i samma
commit, inte överleva som öppen i backlog.

**SIE-import existerar inte:** Enbart export-services. Ingen import-path kan
introducera 5-siffriga konton.

**Schema-constraint:** `CHECK(length(account_number) BETWEEN 4 AND 5)` på
`accounts`-tabellen övervägs som commit 7 i S24b. Se sektion 4.2.

### Sprint-namnbyte

S24b bör heta **"BR-result-konsistens + F4 latent comparator-cleanup"**
istället för "F19 + F4 implementation".

### Kvarvarande open questions

Inga. Alla designbeslut spikade i sektionerna.
## 2. F19 — Tre definitioner av "årets resultat"

### 2.0 Kritisk upptäckt: result-service existerar redan

**F19 som formulerat i backlog ("tre olika definitioner") är till stor del redan
löst.** M96–M98 (Sprint 11 Fas 3) etablerade `src/main/services/result-service.ts`
som single source of truth. Alla fyra konsumenter importerar från den:

- `dashboard-service.ts` → `calculateResultBreakdown()`
- `tax-service.ts` → `calculateOperatingResult()`
- `report/report-service.ts` (getIncomeStatement) → `calculateResultSummary()`
- `opening-balance-service.ts` → `calculateNetResult()` (via re-export)

**Dock: balansräkningen (getBalanceSheet) har en oberoende beräkningskärna som
inte går via result-service.** Se sektion 2.5.

### 2.1 Källplatser

| Vy | Fil | Funktion | Rad | Källa |
|---|---|---|---|---|
| Dashboard | `src/main/services/dashboard-service.ts` | `getDashboardSummary` | 10 | `calculateResultBreakdown(db, fyId)` |
| Tax | `src/main/services/tax-service.ts` | `getTaxForecast` | 16 | `calculateOperatingResult(db, fyId)` |
| Resultaträkning | `src/main/services/report/report-service.ts` | `getIncomeStatement` | 32 | `calculateResultSummary(db, fyId)` |
| **Balansräkning** | `src/main/services/report/report-service.ts` | `getBalanceSheet` | 137–141 | **Oberoende beräkning** |

Ingen fjärde definition hittades via invoice/supplier-grep. Dessa services
aggregerar belopp men inte som "årets resultat".

### 2.2 Beräknings-skillnader

| Aspekt | Dashboard | Tax | Resultaträkning | Balansräkning |
|---|---|---|---|---|
| Konto-intervall | 3000–7999 (EBIT) | 3000–7999 (EBIT) | 3000–8999 (hela RR) | `!startsWith('1') && !startsWith('2')` |
| Inkluderar klass 8? | Nej (by design) | Nej (by design) | Ja | Ja (men via annan väg) |
| Använder result-service? | Ja | Ja | Ja | **Nej** |
| UI-label | "Rörelseresultat" | "Rörelseresultat (EBIT)" | "Årets resultat" | "Årets resultat (preliminärt beräknat)" |
| Status-filter | booked | booked | booked | booked |
| Datum-filter | Hel FY | Hel FY | Valfritt dateRange | Valfritt dateRange |
| O-serie hantering | Exkluderas via status=booked | Exkluderas via status=booked | Exkluderas via status=booked | Exkluderas via status=booked |
| Tecken-konvention | credit−debit (positiv=vinst) | credit−debit → `Math.max(0,...)` | credit−debit | credit−debit |
| Returvärde-format | `operatingResultOre: number` | `operatingProfitOre: number` | `netResult: number` | `calculatedNetResult: number` |
| Aggregations-källa | `journal_entry_lines` via `getAccountBalances` | `journal_entry_lines` via `getAccountBalances` | `journal_entry_lines` via `getAccountBalances` | `journal_entry_lines` via `getAccountBalances` men **filtrerad av `.startsWith`** |

### 2.3 Identifierade buggar utöver klass-8-frågan

**Bugg 1: BR:s oberoende netResult-beräkning (report-service.ts:137–141)**

```ts
const plMovements = movements.filter(
  (m) => !m.account_number.startsWith('1') && !m.account_number.startsWith('2'),
)
const calculatedNetResult = plMovements.reduce((s, m) => s + m.net, 0)
```

Denna beräkning filtrerar bort klass 1–2 och summerar allt annat. Den skiljer
sig från result-service som explicit summerar 3000–8999 via
`INCOME_STATEMENT_CONFIG`. Potentiell divergens:

- Om konto med klass 0 eller 9 existerar (BAS-kontoplanen har inga, men
  systemet blockerar inte skapande av sådana konton via `createAccount`).
- Om `getAccountBalances` returnerar annorlunda data än `buildGroups` förväntar
  sig (dock: båda anropar samma funktion, så detta är osannolikt).

I praktiken: med nuvarande BAS-chart (klass 1–8) ger de **identiskt resultat**.
Men arkitekturen bryter mot M96 (single source of truth).

**Bugg 2: BR:s `.localeCompare`-sortering (report-service.ts:127)**

```ts
bsBalances.sort((a, b) => a.account_number.localeCompare(b.account_number))
```

Detta är en F4-instans. Se sektion 3.

**Ej bugg: Dashboard/Tax visar EBIT**

Dashboard visar "Rörelseresultat" (EBIT, klass 3–7) och Tax visar
"Rörelseresultat (EBIT)" med explicit disclaimer som säger att klass 8
inte ingår. Dessa är **avsiktligt** olika siffror från "årets resultat"
och korrekt implementerade via result-service. Ingen åtgärd krävs.

### 2.4 K2-referens

**BFNAR 2016:10 (K2), kapitel 4 — Resultaträkning:**

Resultaträkningen enligt K2 i förkortad form har följande poster:
- Rörelseintäkter (klass 3)
- Rörelsekostnader (klass 4–7)
- **Rörelseresultat** (summa ovan = EBIT)
- Finansiella poster (klass 8, 8000–8799)
- **Resultat efter finansiella poster** (EBT)
- Bokslutsdispositioner (8800–8899)
- Skatt på årets resultat (8900–8999)
- **Årets resultat** (sista raden = netResult, alla klass 3–8)

`INCOME_STATEMENT_CONFIG` i k2-mapping.ts speglar denna uppställning exakt
med fyra grupper: operating_income (3000–3999), operating_expenses (4000–7999),
financial_items (8000–8799), appropriations_and_tax (8800–8999).

`validateResultConfigInvariants` verifierar att config täcker hela 3000–8999
utan luckor — detta är det maskinella K2-kontraktet.

**K3 (BFNAR 2012:1):** Inte relevant för Fritt Bokförings målgrupp (enskilda
firmor och små AB). Grep visar inga K3-specifika kodstigar:
`grep -rniE "K3\b|BFNAR.*2012" src/` → 0 träffar (utöver k3_only-flaggan
i account-schema som styr konto-filtrering, inte rapportformat).
K3-stöd flaggas som framtida finding, inte i scope.

### 2.5 Balansräkning-konsekvens — BESLUT

**Scenario 2 gäller:** BR läser från samma underliggande aggregation
(`getAccountBalances`) men har en oberoende filterfunktion (startsWith-filter
istället för matchesRanges via INCOME_STATEMENT_CONFIG).

| BR-källa | Konsekvens för S24b |
|---|---|
| ~~BR läser från samma RR-service som vyerna~~ | ~~Ej tillämpligt~~ |
| **BR läser från samma underliggande data men annan funktion** | **S24b refaktorerar BR att läsa netResult från result-service. Inkluderas i sprint-scope.** |
| ~~BR läser från tredje plats med egen logik~~ | ~~Ej tillämpligt~~ |

**Beslut:** BR:s `calculatedNetResult` (report-service.ts:137–141) ersätts med
ett anrop till `calculateNetResult(db, fiscalYearId, dateRange)` från
result-service. Ändringen är ~5 rader. S24b inkluderar BR/RR-konsistens-test.

Konsekvens: `report-service.ts:getBalanceSheet` anropar `calculateNetResult`
istället för egen filter-reduce. `result-service` stöder redan `dateRange`
som optional parameter.
## 3. F4 — Lexikografisk account_number-jämförelse

### 3.1 Träffar

| # | Fil | Rad | Kontext | Mönster | Klass | Notering |
|---|---|---|---|---|---|---|
| 1 | `src/main/services/account-service.ts` | 33 | `listAccounts()` | ORDER BY (SQL) | B | Ren presentation-sortering. Bryter ordning vid 5-siffriga. |
| 2 | `src/main/services/account-service.ts` | 49 | `listAllAccounts()` | ORDER BY (SQL) | B | Samma som ovan, global listning. |
| 3 | `src/main/services/report/balance-queries.ts` | 43 | `getAccountBalances()` | ORDER BY (SQL) | B | Sortering påverkar inte aggregering (reduce summerar oavsett ordning) men bryter presentation i RR/BR. |
| 4 | `src/main/services/export/export-data-queries.ts` | 158 | `getUsedAccounts()` | ORDER BY (SQL) | B | SIE4/SIE5/Excel export — konton i fel ordning i exportfil. |
| 5 | `src/main/services/export/export-data-queries.ts` | 220 | `getMonthlyTotals()` | ORDER BY (SQL) | B | Månatliga totaler — presentationsordning. |
| 6 | `src/main/services/report/report-service.ts` | 127 | `getBalanceSheet()` | localeCompare | B | BS-konton sorteras lexikografiskt. `localeCompare` ger locale-beroende ordning dessutom. |
| 7 | `src/main/services/sie4/sie4-account-type-mapper.ts` | 24 | `mapSie4AccountType()` | String char comparison | C | `firstDigit >= '4' && firstDigit <= '7'` — char-jämförelse men säker för enskilda siffror. |
| 8 | `src/main/services/sie5/account-type-mapper.ts` | 42 | `mapAccountType()` | String char comparison | C | Samma mönster som #7. Säker för enskilda siffror. |
| 9 | `src/main/services/account-service.ts` | 23–24 | `listAccounts()` class filter | CAST(AS INTEGER) | C | Redan numerisk — korrekt. |
| 10 | `src/main/services/export/export-data-queries.ts` | 177 | `getOpeningBalancesFromPreviousYear()` | CAST(SUBSTR(…)) | C | Redan numerisk — korrekt per M98. |

### 3.2 Sammanfattning

- **Totalt:** 10 träffar
- **Kritiska (A):** 0 (inga bryter *beräkningar* idag)
- **Latenta (B):** 6 (bryter presentation/sortering om 5-siffriga konton existerar)
- **Defensiva (C):** 4 (redan numeriska eller säkra per design)
- Per mönster: ORDER BY=5, localeCompare=1, char-comparison=2, CAST=2

**Inga klass-A-träffar** — resultataggregering (summering) påverkas inte
av sorteringsordning. Men presentationsordning i listor, rapporter och
exportfiler bryter.

### 3.3 matchesRanges()-status

- **Plats:** `src/main/services/report/k2-mapping.ts:31–41`
- **Numerisk-säker:** Ja. Använder `parseInt(accountNumber.substring(0,4).padEnd(4,'0'), 10)`.
- **5-siffriga konton:** Säker. "37991" → prefix 3799 → matchar range 3000–3799.
- **Lämplig som primär aggregation-väg:** Ja — redan underliggande för `buildGroups()`.

`matchesRanges()` är aggregationens kärna och den är numerisk. F4 påverkar
**inte** beräkningskorrekthet för result-service. Det påverkar enbart
sorteringsordning i presentationslagret.

### 3.4 Konto-typ-analys

**Seed-data:** 130 stycken 4-siffriga konton (migrering 001). 0 stycken 5-siffriga.

**UI-begränsning:** `createAccount` IPC-schema har `account_number: z.string().min(4).max(4)`
— strictt 4-siffriga konton via UI. 5-siffriga konton kan **inte** skapas
via standard UI.

**Konsekvens:** F4 är en **latent risk** för framtida utökning (t.ex. underkonton,
import från annat system) snarare än en aktiv bugg. Dock bryter den mot M98
som explicit förbjuder lexikografiska jämförelser.

### 3.5 SQL vs application-layer per träff

| # | Typ | Rekommenderad fix |
|---|---|---|
| 1 | SQL ORDER BY | `ORDER BY CAST(account_number AS INTEGER)` |
| 2 | SQL ORDER BY | `ORDER BY CAST(account_number AS INTEGER)` |
| 3 | SQL ORDER BY | `ORDER BY CAST(jel.account_number AS INTEGER)` |
| 4 | SQL ORDER BY | `ORDER BY CAST(a.account_number AS INTEGER)` |
| 5 | SQL ORDER BY | `ORDER BY CAST(jel.account_number AS INTEGER), month` |
| 6 | Application localeCompare | `compareAccountNumbers(a, b)` helper |
| 7 | Application char compare | Ingen åtgärd (C-klass, säker) |
| 8 | Application char compare | Ingen åtgärd (C-klass, säker) |

**Alla 6 latenta träffar är presentationssortering**, inte aggregering.
`CAST(account_number AS INTEGER)` i ORDER BY påverkar inte query-planens
effektivitet för dessa queries (de gör GROUP BY redan, sortering är sista steget).
Inget behov av generated column eller index-ändring.
## 4. Föreslagen taktik

### 4.0 Omformulering av sprint-scope

Forskningen visar att F19/F4-paketet är **väsentligt mindre** än antaget:

- **F19:** result-service finns redan (M96). Kvarvarande arbete: refaktorera
  BR:s oberoende netResult-beräkning (~5 rader) + konsolidera med test.
- **F4:** 6 latenta presentationssorteringsfel. Inga klass-A (beräkningsfel).
  Konto-skapande begränsat till 4 siffror via Zod-schema.

S24b blir en **konsoliderings-sprint**, inte en arkitektur-sprint.

### 4.1 Result-service — befintlig arkitektur behålls

**Inget nytt API behövs.** Befintlig `calculateResultSummary` och
`calculateNetResult` täcker alla behov:

- Dashboard: `calculateResultBreakdown` (redan korrekt)
- Tax: `calculateOperatingResult` (redan korrekt)
- RR: `calculateResultSummary` (redan korrekt)
- **BR: `calculateNetResult` (ny konsument — ersätter oberoende filter-reduce)**

**Designbeslut (spikade):**

| Fråga | Beslut | Motivering |
|---|---|---|
| Konto-klass 8 i "årets resultat"? | Ja — hela 3000–8999 | K2 kap 4: sista raden inkluderar allt t.o.m. skatt |
| Skatt ingår i "årets resultat"? | Ja — post inom 8900–8999 | K2: "Skatt på årets resultat" är en rad *före* "Årets resultat"-summan |
| Status-filter default? | booked only | Redan implementerat i `getAccountBalances` |
| O-serie separering? | Via status (draft opening_balance undantas) | Redan implementerat |
| Transaction isolation? | Ja — `getBalanceSheet` kör redan i implicit read-transaction via WAL. `calculateNetResult` anropas inifrån samma connection. | SQLite WAL: snapshot-isolation per connection |

**Observability:** Befintlig `ResultBreakdown`-typ returnerar redan
`revenueOre`, `expensesOre`, `operatingResultOre`. Att utöka med
per-bucket-kontoinfo (top_accounts) bedöms som overengineering för pre-launch.
Kan läggas till om support-ärenden kräver det post-launch.

**UI-kontrakt:** Följande `data-testid` + `data-raw-ore` läggs till:

| Vy | Element | data-testid | data-raw-ore |
|---|---|---|---|
| IncomeStatementView | "Årets resultat"-raden | `arets-resultat-value` | `netResult` som sträng |
| BalanceSheetView | "Årets resultat"-raden | `arets-resultat-br-value` | `calculatedNetResult` som sträng |

Dashboard och Tax visar inte "Årets resultat" — de visar EBIT, korrekt.
Inget data-testid för "årets resultat" behövs där.

### 4.2 account_number-comparator + F4-strategi

**Helper-plats:** `src/shared/account-number.ts` (isomorphic, ingen Node-API).

**API:**

```ts
export function compareAccountNumbers(a: string, b: string): number {
  return parseInt(a, 10) - parseInt(b, 10)
}
```

Edge cases: validering att input är numerisk sker redan i Zod-scheman
(account_number-fält). Helpern antar valid input. `parseInt('', 10)` → NaN,
`NaN - NaN` → NaN, `.sort()` med NaN comparator ger undefined behavior —
men detta kan aldrig hända med validerad data.

**SQL-strategi:** `CAST(account_number AS INTEGER)` i ORDER BY.

| Strategi | Vald? | Motivering |
|---|---|---|
| `CAST(… AS INTEGER)` per query | **Ja** | Alla 5 ORDER BY:er är på GROUP BY-resultat (< 100 rader). Full table scan på resultatmängden, inte på journaltabellen. Prestanda-impact: negligerbar. |
| Generated column + index | Nej | Overkill: kräver table-recreate (M122) för 95 rader med 4-siffriga konton. Ingen hot path. |
| Application-layer | Nej för SQL, **Ja** för #6 (localeCompare) | localeCompare-träffen fixas med `compareAccountNumbers` helper. |
| IN-lista | Nej | Onödigt — CAST löser det enklare. |

**Branded type `AccountNumber`:** Flaggas som S24c-finding, inte i scope.

**Schema-constraint som permanent F4-vakt:**

Nuvarande skydd mot 5-siffriga konton: Zod-schema `min(4).max(4)` i
`createAccount`. Men detta skyddar inte mot:
- Framtida SIE-import (existerar inte idag men är backlog)
- Backup-restore eller manuell SQL
- Framtida BAS-uppdatering

Rekommendation: lägg `CHECK(length(account_number) BETWEEN 4 AND 5)` på
`accounts`-tabellen som migration i S24b. BETWEEN 4 AND 5 (inte = 4) för att
inte blockera framtida 5-siffriga underkonton — istället gör det F4-fixet
redan redo för dem. Om 5-siffriga konton introduceras i framtiden behöver
enbart Zod-schemat uppdateras (max(5)), inte koden.

Alternativ: `CHECK(length(account_number) = 4)` som strikare vakt. Kräver
schema-migration om 5-siffriga underkonton införs.

Notering: `accounts`-tabellen har inkommande FK (M122-lista). Men `ADD COLUMN`
behövs inte — CHECK läggs på befintlig kolumn via table-recreate. Dock:
`accounts` har FK-referenser från 6 tabeller → kräver M122 full-mönster
(PRAGMA foreign_keys = OFF, table-recreate, FK-check).

**Beslut:** Dokumentera som M135 ("account_number längd-constraint") men
**skjut table-recreate till S24c**. F4-fixet (CAST + compareAccountNumbers) är
tillräckligt för S24b. Schema-constraint är defense-in-depth, inte blocker.

**S24c eskalerings-triggers (dokumenteras i STATUS.md under findingen):**

F4-skyddet är application-layer-only (CAST i SQL, compareAccountNumbers i TS).
S24c eskaleras till S24b-equivalent om någon av dessa inträffar:
1. **Import-väg läggs till** (SIE-import, CSV-import) — extern data kringgår
   Zod-schema och kan introducera 5-siffriga konton direkt i DB.
2. **BAS-uppdatering ger 5-siffriga konton** — BFN utfärdar ny kontoplan med
   underkonton. Kräver att Zod-schema (max(4)) ändras, men utan schema-
   constraint blockas inte direkt SQL-insert.
3. **Backup-restore kringgår validering** — om restore-logiken skriver direkt
   till DB utan att passera createAccount-endpoint. (Nuläge: ingen
   backup-restore-funktion existerar utöver pre-update-backup.ts som kopierar
   DB-filen rakt av, inte selektiv restore.)

Utan dessa triggers förblir S24c latent backlog. Med någon av dem → prioritera
schema-constraint före eller i samma sprint som triggern.

### 4.3 Migrations-väg

**Big-bang squash.** Skäl:

1. Total commit-omfång < 200 rader (inklusive tester).
2. F19-fixet är ~5 rader (byt BR:s filter-reduce mot `calculateNetResult`-anrop).
3. F4-fixet är ~6 SQL ORDER BY-ändringar + 1 localeCompare → helper.
4. Inget mellan-tillstånd existerar — BR visar antingen egen beräkning (pre-fix)
   eller result-service-beräkning (post-fix).

Feature-flag avfärdad: omotiverad komplexitet för <200 rader.
## 5. Risk-analys

### 5.1 Användar-synlig regression

**Pre-launch-status:** Fritt Bokföring har inga produktions-användare.
Risken är låg.

- Inget pre-migration inventerings-script behövs.
- Ingen UI-migration-notis behövs.
- Inga skatte-deklarations-konsekvenser.

Post-launch: liknande fix kräver tyngre migration-process. Doktrin: lös
innan launch.

### 5.2 Test-coverage-luckor

**Befintlig coverage för de berörda beräkningarna:**

| Beräkning | Dedikerade tester | Testfil |
|---|---|---|
| result-service (summary/breakdown/net) | 14 tester | `session-43-result-service.test.ts` |
| Dashboard vs result-service invariant | 1 test (test 10) | Samma fil |
| Tax vs result-service invariant | 1 test (test 11) | Samma fil |
| RR vs result-service invariant | 1 test (test 8) | Samma fil |
| **BR vs result-service invariant** | **0 tester** | **Saknas** |
| BR balanserar | 1 test (S05-04) | `S05-dashboard-reports-consistency.test.ts` |

**Lucka:** Ingen test verifierar att BR:s `calculatedNetResult` ===
`calculateNetResult()` från result-service. S05-04 testar bara att BR
balanserar (balanceDifference === 0), inte att årets-resultat-posten är
korrekt beräknad.

Risken: BR:s oberoende beräkning kan returnera annorlunda värde än RR
utan att befintliga tester fångar det. S24b måste lägga detta test.

### 5.3 5-siffriga konto-bugg-realisering

**Ingen befintlig data har 5-siffriga konton.** Seed-data: 130 stycken
4-siffriga. `createAccount`-endpoint: `min(4).max(4)` i Zod-schema.

F4 kan inte triggas via standard UI-flöden idag. Risken realiseras vid:
1. Framtida utökning till 5-siffriga underkonton
2. Import av extern kontoplan (SIE-import)
3. Manuell SQL-manipulation

### 5.4 Mellan-tillstånd-risk vid migration

Ej tillämpligt — big-bang squash valt (4.3). Alla ändringar i en commit.

### 5.5 Race conditions i aggregation

`getBalanceSheet` kör redan i `db.transaction()` (WAL snapshot isolation).
`calculateNetResult` anropas med samma `db`-referens → läser samma snapshot.
Ingen risk.

Result-service-funktionerna kör inte i egen transaktion internt — de förlitar
sig på att anroparen wrappat. Dashboard-service och tax-service gör det
(`db.transaction()`). getIncomeStatement gör det INTE explicit — men SQLite
WAL ger snapshot-isolation per statement, och `getIncomeStatement` gör ett
enda anrop till `getAccountBalances` + `calculateResultSummary` som i sin tur
gör ett enda `getAccountBalances`-anrop. I teorin: om en annan process/tråd
committar mellan dessa två anrop kan de läsa olika snapshots. I praktiken:
better-sqlite3 är synkron och single-threaded, så detta kan aldrig hända.

### 5.6 Precision och fiscal year-gränser

**Precision:** `getAccountBalances` returnerar `SUM(jel.debit_ore)` och
`SUM(jel.credit_ore)` — SQLite INTEGER-summering. Ingen float-konvertering.
`buildGroups` summerar via `.reduce()` på Number — safe för belopp under
`Number.MAX_SAFE_INTEGER` (9×10^15 öre = 90 biljoner kr).

**Fiscal year-gränser:** `getAccountBalances` filtrerar på `je.fiscal_year_id = ?`
(heltal-FK), inte på datumjämförelse. Timezone-risk (F9) existerar inte
i aggregationsvägen.
## 6. Arkitektur-alternativ

Givet att result-service redan existerar ändras frågan från "vilken arkitektur
ska vi bygga?" till "hur ska BR konsumera result-service?". Tre alternativ:

### Alternativ A — BR anropar calculateNetResult direkt

```ts
// report-service.ts:getBalanceSheet — byt rad 137–141:
const calculatedNetResult = calculateNetResult(db, fiscalYearId, dateRange)
```

**Påverkan:** 1 rad ändrad, 3 rader borttagna. Ingen ny fil. Ingen ny
IPC-handler. Ingen ny PayloadSchema.

**Pro:** Minimalt. BR och RR garanterat konsistenta per design.
**Con:** BR anropar `calculateNetResult` som internt anropar
`getAccountBalances` en andra gång (BR anropar den redan för klass 1–2).
Dubbel-query. I praktiken: < 1ms overhead (95 kontorader, in-memory SQLite).

**Test-delta:** +2 (BR/RR-konsistens + negativ-test).

### Alternativ B — BR extraherar netResult från movements via matchesRanges

```ts
// report-service.ts:getBalanceSheet — byt rad 137–141:
import { INCOME_STATEMENT_CONFIG, matchesRanges } from './k2-mapping'

const allRanges = INCOME_STATEMENT_CONFIG.flatMap(g =>
  g.lines.flatMap(l => l.ranges)
)
const calculatedNetResult = movements
  .filter(m => matchesRanges(m.account_number, allRanges))
  .reduce((s, m) => s + m.net, 0)
```

**Påverkan:** ~5 rader ändrade. Undviker dubbel-query genom att använda
redan hämtad `movements`.

**Pro:** Effektivast (ingen extra DB-roundtrip). Använder samma
`INCOME_STATEMENT_CONFIG` som result-service.
**Con:** Duplicerar aggregationslogik — `buildGroups()` summerar per grupp,
medan detta summerar totalt. Om `INCOME_STATEMENT_CONFIG` ändras (t.ex.
signMultiplier-ändring) kan det divergera.

**Test-delta:** +2.

### Alternativ C — BR konsumerar calculateResultSummary (rekommenderad)

```ts
// report-service.ts:getBalanceSheet — byt rad 137–141:
const resultSummary = calculateResultSummary(db, fiscalYearId, dateRange)
const calculatedNetResult = resultSummary.netResultOre
```

**Påverkan:** 2 rader ändrade, 4 rader borttagna. En ny import.
Ingen ny PayloadSchema.

**Pro:**
- Konsistent med `getIncomeStatement` (rad 32) som redan anropar
  `calculateResultSummary`.
- Ger tillgång till `operatingResultOre` och `resultAfterFinancialOre`
  om BR behöver visa dem (framtidssäkert).
- Dubbel-query men identisk overhead som Alt A (~1ms).

**Con:** Hämtar mer data än nödvändigt (tre resultat-nivåer, BR behöver bara
netResult). Negligerbart.

**Test-delta:** +2.

---

**Rekommendation: Alternativ C.** Ger samma garanti som A men med rikare
returtyp. getIncomeStatement anropar redan `calculateResultSummary` —
symmetri med `getBalanceSheet` gör koden lättare att resonera om.

Alternativ B avfärdas: duplicerar aggregationslogik trots att poängen med
F19-fixet är att eliminera duplicering.
## 7. Test-strategi

### 7.1 Unit-tester för compareAccountNumbers

```ts
describe('compareAccountNumbers', () => {
  it('4 vs 4: numerisk ordning', () => {
    expect(compareAccountNumbers('1510', '3002')).toBeLessThan(0)
  })
  it('5-siffrig vs 4-siffrig: 30000 > 4000 numeriskt', () => {
    expect(compareAccountNumbers('30000', '4000')).toBeGreaterThan(0)
  })
  it('lika: returnerar 0', () => {
    expect(compareAccountNumbers('1930', '1930')).toBe(0)
  })
  it('lika prefix, olika suffix', () => {
    expect(compareAccountNumbers('1010', '1100')).toBeLessThan(0)
  })
  it('leading zeros preserved', () => {
    expect(compareAccountNumbers('0100', '0200')).toBeLessThan(0)
  })
})
```

**Mål:** ~5 unit-tester.

### 7.2 Property-based comparator-kontrakt

Använd `fast-check` (lägg till som devDep om saknas).

```ts
import fc from 'fast-check'

const validAccountNumber = fc.stringOf(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'),
  { minLength: 4, maxLength: 5 })

test('reflexivitet', () => {
  fc.assert(fc.property(validAccountNumber, (a) =>
    compareAccountNumbers(a, a) === 0))
})

test('antisymmetri', () => {
  fc.assert(fc.property(validAccountNumber, validAccountNumber, (a, b) =>
    Math.sign(compareAccountNumbers(a, b)) === -Math.sign(compareAccountNumbers(b, a))))
})

test('transitivitet', () => {
  fc.assert(fc.property(validAccountNumber, validAccountNumber, validAccountNumber, (a, b, c) => {
    if (compareAccountNumbers(a, b) <= 0 && compareAccountNumbers(b, c) <= 0) {
      return compareAccountNumbers(a, c) <= 0
    }
    return true
  }))
})

test('numerisk konsistens (M98-kontrakt)', () => {
  fc.assert(fc.property(validAccountNumber, validAccountNumber, (a, b) =>
    Math.sign(compareAccountNumbers(a, b)) === Math.sign(Number(a) - Number(b))))
})
```

**Mål:** 4 property-tester. Den fjärde (numerisk konsistens) är det formella
M98-beviset.

### 7.3 BR/RR-konsistens-test

```ts
it('BR.calculatedNetResult === RR.netResult', () => {
  // Revenue 200k + financial expense 10k + tax 20k
  bookEntry('2025-03-01', [
    { account: '1930', debit: 20_000_000, credit: 0 },
    { account: '3002', debit: 0, credit: 20_000_000 },
  ])
  bookEntry('2025-06-30', [
    { account: '8410', debit: 1_000_000, credit: 0 },
    { account: '1930', debit: 0, credit: 1_000_000 },
  ])
  bookEntry('2025-12-31', [
    { account: '8910', debit: 2_000_000, credit: 0 },
    { account: '2510', debit: 0, credit: 2_000_000 },
  ])

  const rr = getIncomeStatement(db, fyId)
  const br = getBalanceSheet(db, fyId)
  expect(br.equityAndLiabilities.calculatedNetResult).toBe(rr.netResult)
})
```

**Mål:** 3 tester (positivt resultat, negativt resultat, noll-resultat).

### 7.4 Negativa kontrakt

- fiscalYearId finns inte → 0, inte krasch (befintlig getAccountBalances
  returnerar tom array)
- Inga verifikationer → 0 + komplett struktur (redan testat i test 1)
- Klass-8-konton finns men 89xx saknas → 0 skatt-komponent

**Mål:** 2–3 negativa kontrakt-tester.

### 7.5 Alla service-konsumenter ger identisk årets-resultat

Testet verifierar alla fem konsument-vägar och asserterar att de ger
identisk siffra. Inkluderar re-export-vägen (opening-balance → fiscal-service)
eftersom en framtida refaktor som bryter re-exporten kan göra att
stale-check i tysthet räknar annorlunda.

```ts
it('alla 5 konsumenter av result-service ger identisk netResult', () => {
  // Seed: revenue 200k + financial expense 10k + tax 20k
  bookEntry('2025-03-01', [
    { account: '1930', debit: 20_000_000, credit: 0 },
    { account: '3002', debit: 0, credit: 20_000_000 },
  ])
  bookEntry('2025-06-30', [
    { account: '8410', debit: 1_000_000, credit: 0 },
    { account: '1930', debit: 0, credit: 1_000_000 },
  ])
  bookEntry('2025-12-31', [
    { account: '8910', debit: 2_000_000, credit: 0 },
    { account: '2510', debit: 0, credit: 2_000_000 },
  ])

  // 1. result-service direkt
  const summary = calculateResultSummary(db, fyId)

  // 2. re-export-vägen (opening-balance-service → fiscal-service)
  const viaReExport = calculateNetResult(db, fyId) // same function, re-exported

  // 3. getIncomeStatement (RR bottom-line)
  const rr = getIncomeStatement(db, fyId)

  // 4. getBalanceSheet (BR "årets resultat" — post-fix)
  const br = getBalanceSheet(db, fyId)

  // 5. IPC-handler-vägen (simulate get-net-result call)
  //    Testas indirekt via calculateNetResult som IPC-handlern anropar

  const consumers = new Map<string, number>([
    ['result-service.netResultOre', summary.netResultOre],
    ['opening-balance-reexport.calculateNetResult', viaReExport],
    ['getIncomeStatement.netResult', rr.netResult],
    ['getBalanceSheet.calculatedNetResult', br.equityAndLiabilities.calculatedNetResult],
  ])

  const distinctValues = new Set(consumers.values())
  expect(distinctValues.size).toBe(1)
  // Explicit value check as safety net
  expect(summary.netResultOre).toBe(17_000_000) // 20M - 1M financial - 2M tax
})
```

**Mål:** 1 test. Map med 4 namngivna konsumenter, 1 distinkt siffra.
IPC-handler testar samma funktion (calculateNetResult) och behöver inte
separat entry. Stänger F19-frågan permanent.

### 7.6 Sorteringsordning-test för F4-fix

```ts
it('ORDER BY account_number sorterar numeriskt efter fix', () => {
  ensureAccountExists('30000', 'Underkonto test')
  bookEntry('2025-03-15', [
    { account: '30000', debit: 100_000, credit: 0 },
    { account: '3002', debit: 0, credit: 100_000 },
  ])

  const balances = getAccountBalances(db, fyId)
  const accountNumbers = balances.map(b => b.account_number)
  // Numerisk ordning: 3002 < 30000
  const idx3002 = accountNumbers.indexOf('3002')
  const idx30000 = accountNumbers.indexOf('30000')
  expect(idx3002).toBeLessThan(idx30000)
})
```

**Mål:** 2 tester (getAccountBalances + listAccounts).

### 7.7 E2E-test för resultat-konsistens

Playwright E2E per M115. Seed via IPC. Appen använder hash-router
(M88–M91 custom hash-router, bekräftat via `window.location.hash`-navigering
i befintliga E2E-tester).

```ts
test('årets resultat identisk i RR och BR', async () => {
  // Seed company + FY + journal entries via IPC
  // Navigate to #/reports
  // Read data-raw-ore from IncomeStatementView [data-testid="arets-resultat-value"]
  // Navigate to balance sheet tab
  // Read data-raw-ore from BalanceSheetView [data-testid="arets-resultat-br-value"]
  // Assert equal
})
```

**Mål:** 1 E2E-test (RR vs BR konsistens).

### 7.8 Total budget

| Kategori | Antal |
|---|---|
| Unit comparator (7.1) | 5 |
| Property comparator (7.2) | 4 |
| BR/RR-konsistens (7.3) | 3 |
| Negativa kontrakt (7.4) | 3 |
| All-consumers-identical (7.5) | 1 |
| Sorteringsordning F4 (7.6) | 2 |
| E2E (7.7) | 1 |
| **Total** | **19** |

Baseline 1493 → ~1512.

Notering: den ursprungliga test-budgeten antog att result-service inte
existerade och att 17–22 service-tester behövdes. Eftersom result-service
redan har 14 dedikerade tester (session-43) är det orimligt att
duplicera dem. Nya tester fokuserar på BR-konsistens och F4-sortering
som saknar coverage.
## 8. Commit-plan för S24b — BR-result-konsistens + F4 latent comparator-cleanup

**Ordnings-princip:** F4 (fundament) före F19 (konsumenter), men givet att
F4 enbart påverkar sortering och F19 enbart påverkar BR:s netResult-källa
finns inget reellt beroende. Ordningen väljs för pedagogisk tydlighet.

### Commits

| # | Commit-meddelande | Berörda filer | Testdelta |
|---|---|---|---|
| 1 | `feat: compareAccountNumbers helper + unit + property-tester` | `src/shared/account-number.ts`, `tests/s24b-account-comparator.test.ts` | +9 |
| 2 | `fix(F4): numerisk ORDER BY + localeCompare → compareAccountNumbers` | `account-service.ts`, `balance-queries.ts`, `export-data-queries.ts`, `report-service.ts` | +2 |
| 3 | `fix(F19): BR netResult via calculateResultSummary + konsistens-test` | `report-service.ts`, `tests/s24b-br-rr-consistency.test.ts` | +6 |
| 4 | `feat: data-testid för årets resultat i RR + BR` | `IncomeStatementView.tsx`, `BalanceSheetView.tsx` | +0 |
| 5 | `test(e2e): RR/BR årets resultat konsistens` | `tests/e2e/result-consistency.spec.ts` | +1 |
| 6 | `docs: S24b sprint-avslut + M134 i CLAUDE.md` | `STATUS.md`, `CLAUDE.md`, `docs/` | +0 |

**Total: 6 commits, +19 tester. Baseline 1493 → ~1512.**

### Detaljerad commit-beskrivning

**Commit 1 — compareAccountNumbers helper**

Ny fil `src/shared/account-number.ts`:
```ts
export function compareAccountNumbers(a: string, b: string): number {
  return parseInt(a, 10) - parseInt(b, 10)
}
```

Tester: 5 unit + 4 property (fast-check). fast-check läggs till som devDep
om ej redan installerad.

**Commit 2 — F4 SQL + application-layer fix**

5 SQL-ändringar (`ORDER BY account_number` → `ORDER BY CAST(account_number AS INTEGER)`):
- account-service.ts:33
- account-service.ts:49
- balance-queries.ts:43
- export-data-queries.ts:158
- export-data-queries.ts:220

1 application-layer-ändring:
- report-service.ts:127: `localeCompare` → `compareAccountNumbers`

2 sorteringsordning-tester.

**Commit 3 — F19 BR-fix + konsistens-tester**

report-service.ts:getBalanceSheet — ersätt rad 137–141:
```ts
// Before:
const plMovements = movements.filter(
  (m) => !m.account_number.startsWith('1') && !m.account_number.startsWith('2'),
)
const calculatedNetResult = plMovements.reduce((s, m) => s + m.net, 0)

// After:
const resultSummary = calculateResultSummary(db, fiscalYearId, dateRange)
const calculatedNetResult = resultSummary.netResultOre
```

Ny import: `calculateResultSummary` från `../result-service`.

3 BR/RR-konsistens-tester + 3 negativa kontrakt-tester.

**Commit 4 — UI-kontrakt data-testid**

IncomeStatementView.tsx rad 130–133: wrap "Årets resultat"-span med
`data-testid="arets-resultat-value"` och `data-raw-ore={data.netResult}`.

BalanceSheetView.tsx rad 140–141: wrap med
`data-testid="arets-resultat-br-value"` och
`data-raw-ore={equityAndLiabilities.calculatedNetResult}`.

**Commit 5 — E2E-test**

1 Playwright-test som verifierar att `data-raw-ore` är identiskt på
RR och BR.

**Commit 6 — Sprint-avslut**

- M134 i CLAUDE.md: "BR:s årets resultat beräknas via result-service"
- STATUS.md uppdaterad med testbaslinje och sprint-noteringar
- F19 markeras som stängd (BR-konsistens löst)
- F4 markeras som stängd (sorteringsfix + helper)

### Stoppvillkor för S24b

- [ ] Alla befintliga 1493 tester passerar (inga regressioner)
- [ ] M131-check passerar
- [ ] M133-check passerar
- [ ] BR/RR-konsistens-test passerar med klass 8-poster
- [ ] E2E verifierar data-testid-kontraktet
- [ ] fast-check property-tester passerar
## Appendix A — Existerande M-regler relevanta för F19/F4

### M96 (single source of truth för resultat-beräkning)

All beräkning av rörelseresultat (EBIT), resultat efter finansiella poster
(EBT) och årets resultat (netresult) går via `src/main/services/result-service.ts`.
Ingen annan service duplicerar kontointervall-logik eller signMultiplier-mönster.
Dashboard, Tax, Opening Balance och Report är alla konsumenter.

### M97 (INCOME_STATEMENT_CONFIG som deklarativ källa)

`result-service` återanvänder `INCOME_STATEMENT_CONFIG` från `k2-mapping.ts`.
`validateResultConfigInvariants` körs vid modulladdning. Två oberoende
invariant-tester säkerställer identitet.

### M98 (account_number-comparator-förbud)

Inga lexikografiska kontointervall-jämförelser. All konto-intervallfiltrering
via `matchesRanges()` eller `CAST(SUBSTR(...) AS INTEGER) BETWEEN`.

### Relaterade M-regler

- **M101:** Atomär paid_amount + shared export queries
- **M119:** Ore-suffix obligatoriskt
- **M127:** ADD COLUMN-begränsningar vid schema-paritets-migrationer
- **M131:** Monetära beräkningar via heltalsaritmetik
- **M133:** axeCheck-regression-skydd

### Reserverat M-nummer

- **M134** — reserverad för S24b: "BR:s årets resultat beräknas via
  result-service (calculateResultSummary)"
