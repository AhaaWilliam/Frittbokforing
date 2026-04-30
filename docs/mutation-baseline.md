# Mutation Testing — Baseline

**Senast körd:** 2026-04-30 (Sprint 51 — efter brainstorm-session som identifierade
mutation testing som det enskilt största gapet i testtäckningen).

**Verktyg:** [Stryker](https://stryker-mutator.io) v9.6.1 via `@stryker-mutator/vitest-runner`.

**Konfig:** `stryker.conf.json`. Subset av tester körs via
`vitest.config.stryker.ts` (better-sqlite3 + worker_threads-konflikt
löst med `pool: 'forks'` + `isolate: false` + curated test-include-lista).

**Kör:** `npm run test:mutation` (~1 min).

## Trend

| Datum | Score | Δ | Anledning |
|-------|-------|---|-----------|
| 2026-04-21 | 71.30% | baseline | initial mutation-konfig |
| 2026-04-30 (S51) | 77.97% | +6.67 | sprint 30/34/40/43/44/47 lyfte oavsiktligt |
| 2026-04-30 (S55) | **85.08%** | **+7.11** | S52 (vat-report) + S53 (correction) — riktade |

## Baseline 2026-04-30 (efter Sprint 52 + 53)

| Fil | Score | Killed | Survived | NoCov | Δ från S51 |
|-----|-------|--------|----------|-------|------------|
| **Totalt** | **85.08%** | 251 | 32 | 12 | +7.11 pp |
| chronology-guard.ts | 93.75% | 15 | 1 | 0 | ±0 |
| vat-report-service.ts | **83.87%** | 52 | 6 | 4 | **+19.35 pp** |
| correction-service.ts | **84.96%** | 113 | 12 | 8 | **+6.76 pp** |
| result-service.ts | 84.52% | 71 | 13 | 0 | ±0 (defensive) |

**Break-threshold:** 90%. Nuvarande är 85.08% — under gaten men riktningen
är tydlig.

## Sprintar som stängde gap

**S52 — vat-report (+19.35 pp i en sprint).** 17 nya tester som
assertar exakt quarterLabel-format (`Kv 1 (jan–mar 2026)`),
quarter date-bounds, sparse-data hasData-flag, yearTotal aggregering,
12%/6% taxableBase-aritmetik. Fångar StringLiteral, ArithmeticOp,
ConditionalExpression och UnaryOp-mutanter på datum-aritmetik och
substring-bounds.

**S53 — correction-service (+6.76 pp).** 10 nya tester som assertar
exakt reason-text för alla 4 guards (StringLiteral-kill), exakta
ErrorCode-mappningar (ENTRY_ALREADY_CORRECTED, ENTRY_IS_CORRECTION,
NOT_FOUND, YEAR_IS_CLOSED), och structured-error-propagering
(LogicalOperator-kill).

**S54 — result-service skipped.** 13 surviving är optional-chaining
på `groups.find(...)?.subtotalNet`. INCOME_STATEMENT_CONFIG är
statisk konstant med 4 grupper + invariant-kontroll vid load
(`validateResultConfigInvariants`). `find()` returnerar **alltid**
en grupp, så `?.` är defensiv kod som inte kan triggas utan att
först bryta en module-load-invariant. Att döda dessa mutationer
kräver mockad buildGroups eller refaktor till asserts-istället-för-
optional-chaining (möjligt, ej gjort).

## Top survival-mönster (var testerna är svaga)

### 1. vat-report-service.ts (svagast — 64.52%)

- **Aritmetiska mutationer på datum-aritmetik (L26, L41)** —
  `parseInt(isoDate.substring(5,7), 10) + 1` kan bli `- 1` utan att
  något test bryter. Kvartalsberäkning är inte assertad mot
  exakta månadsgränser.
- **Block-statement-mutationer (L25, L29)** — funktionskroppar kan
  ersättas med `{}` utan att tester bryter. Dessa hjälpfunktioner
  är inte direkt-testade.
- **Metodexpression (L26, L30)** — `isoDate.substring(5,7)` kan bli
  `isoDate` utan att tester märker. Substring-bounds otestade.

### 2. correction-service.ts (78.20%, 13 NoCoverage)

- **String-literal-mutationer (L65, L74)** — verifikationstexter som
  "Korrigering" kan tomma ut. Tester assertar inte på description-
  innehåll. M139-paritet är inte vakt:ad mot text-drift.
- **Conditional-expression (L53, L108)** — guards som blir `false`
  permanent passerar. Defensive checks otestade.
- **Logical-operator (L307)** — `err && typeof err === 'object'` →
  `err || typeof err === 'object'`. Error-handler-kod otestad.

### 3. result-service.ts (84.52%, mest överlevande är optional-chaining)

- **OptionalChaining på 10 ställen (L42, L44, L66 m.fl.)** —
  `groups.find(g => g.id === 'X')?.subtotalNet` → `.subtotalNet` (utan ?.)
  passerar för testfixturer fångar alltid en grupp. Defensiv kod är
  inte testad mot frånvarande grupper.

## Vad rapporten INTE säger

- Stryker-scope är 4 services. Mutation testing kör INTE mot
  `invoice-service`, `expense-service`, `money.ts`, `preview-service`,
  `dashboard-service`, eller någon renderer-kod. **Verkligt mutation-
  score över hela kodbasen är okänd.**
- 30s timeout per mutant — långsamma kombinationer kan tyst dö som
  "Timeout" istället för att avslöja gap.
- Stryker assar mot en curated test-lista (vitest.config.stryker.ts
  `include`). Om en kritisk test ligger utanför listan räknas den
  inte med — möjlig falsk-positiv (mutant flaggas survived fast den
  egentligen dödas av oinkluderad test).

## Roadmap

**Steg 1 ✅ etablera baseline (S51).**
**Steg 2 ✅ stäng top-3 (S52 + S53).** Mål: ≥85%. Utfall: 85.08%.

**Steg 3 (backlog):** Utöka scope till `invoice-service`, `money.ts`,
`expense-service`, `preview-service`. Förvänta lägre baseline (kanske
60-70%) eftersom dessa har komplex sign-flip-logik (M137) och
heltalsaritmetik (M131) som är klassisk mutation-mat.

**Steg 4 (backlog):** Refaktor `result-service` så att optional-chaining
ersätts av asserts (eftersom invarianten är statisk). Vinst: +6 pp och
13 surviving mutanter elimineras.

**Steg 5 (backlog):** Sätt upp CI-gate på `≥85%` (trend-bevarande) i
GitHub Actions. Höj tröskel gradvis till 90% när nya tester landar.

## Referenser

- [Stryker docs](https://stryker-mutator.io/docs)
- HTML-rapport: `reports/mutation/index.html` (öppna i browser för
  rad-för-rad-vy med diff av varje surviving mutant).
- JSON-rapport: `reports/mutation/mutation-report.json`.
