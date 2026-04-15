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
