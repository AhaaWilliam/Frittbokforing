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
backlog-item som överlevde Sprint 11. Process-not: öppna findings bör
auditeras mot M-regler vid sprint-planning.

**SIE-import existerar inte:** Enbart export-services. Ingen import-path kan
introducera 5-siffriga konton.

**Schema-constraint:** `CHECK(length(account_number) BETWEEN 4 AND 5)` på
`accounts`-tabellen övervägs som commit 7 i S24b. Se sektion 4.2.

### Sprint-namnbyte

S24b bör heta **"BR-result-konsistens + F4 latent comparator-cleanup"**
istället för "F19 + F4 implementation".

### Kvarvarande open questions

Inga. Alla designbeslut spikade i sektionerna.
