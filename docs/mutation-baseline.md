# Mutation Testing — Baseline

**Senast körd:** 2026-04-30 (Sprint 51 — efter brainstorm-session som identifierade
mutation testing som det enskilt största gapet i testtäckningen).

**Verktyg:** [Stryker](https://stryker-mutator.io) v9.6.1 via `@stryker-mutator/vitest-runner`.

**Konfig:** `stryker.conf.json`. Subset av tester körs via
`vitest.config.stryker.ts` (better-sqlite3 + worker_threads-konflikt
löst med `pool: 'forks'` + `isolate: false` + curated test-include-lista).

**Kör:** `npm run test:mutation` (~1 min).

## Baseline 2026-04-30

| Fil | Score | Killed | Survived | NoCov |
|-----|-------|--------|----------|-------|
| **Totalt** | **77.97%** | 230 | 48 | 17 |
| chronology-guard.ts | 93.75% | 15 | 1 | 0 |
| result-service.ts | 84.52% | 71 | 13 | 0 |
| correction-service.ts | 78.20% | 104 | 16 | 13 |
| vat-report-service.ts | 64.52% | 40 | 18 | 4 |

**Break-threshold:** 90%. Nuvarande baseline understiger gaten.

**Trend:** 71.3% (2026-04-21) → 77.97% (2026-04-30). +6.7 pp efter
Sprint 30 (invoice paritetstest), S34 (bank-saldo), S43 (FieldError),
S44/S47 (BANK/VAT-invariants). Tillägg av tester förbättrar score även
utan att testen tänker på mutation-täckning explicit.

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

**Steg 1 (genomfört):** Etablera baseline. ✅

**Steg 2 (backlog):**
1. Stäng top-3 vat-report-gap (datum-aritmetik + substring-bounds) → +5 pp.
2. Lägg description-asserts i correction-tests → +3 pp.
3. Testa "missing income_group"-edge case i result-service → +3 pp.
4. Förvänta total: ≥85% efter en sprint.

**Steg 3 (backlog):** Utöka scope till `invoice-service`, `money.ts`,
`expense-service`, `preview-service`. Förvänta lägre baseline (kanske
60-70%) eftersom dessa har komplex sign-flip-logik (M137) och
heltalsaritmetik (M131) som är klassisk mutation-mat.

**Steg 4 (backlog):** Sätt up CI-gate på `≥80%` (trend-bevarande) i
GitHub Actions. Höj tröskel gradvis när nya tester landar.

## Referenser

- [Stryker docs](https://stryker-mutator.io/docs)
- HTML-rapport: `reports/mutation/index.html` (öppna i browser för
  rad-för-rad-vy med diff av varje surviving mutant).
- JSON-rapport: `reports/mutation/mutation-report.json`.
