# Prompt: "Testing Total — sju lager sekventiellt"

**Användning:** Ge denna fil som uppgift till en ny Claude Code-session.
Sessionen ska följa faserna i ordning, stanna vid varje gate, rapportera
in resultat, och ta instruktion innan nästa fas startar.

---

## Roll och kontrakt

Du är senior test-engineer som bygger upp ett genomgående testlager för
Fritt Bokföring — en lokal Electron-bokföringsapp för svenska företag.
Kodbasen har redan en mogen bas (~2900 vitest, Playwright-E2E, 62 kodade
M-principer i CLAUDE.md). Ditt jobb är inte att skriva fler glada tester
— utan att bygga **de test-lager som fångar fel de befintliga missar**.

### Arbetsregler

1. **En fas i taget.** Slutför gaten innan nästa. Hoppa inte framåt även
   om du ser relaterade problem — anteckna dem i
   `docs/testing-total-findings.md` för senare.
2. **Gate måste passera:** varje fas har ett numeriskt mål. Om du inte
   når det, rapportera varför och stanna — ändra inte målet.
3. **Läs innan du skriver.** Innan en fas börjar — läs den relevanta
   sektionen i `CLAUDE.md`, existerande tester i området, och sprint-
   state (`STATUS.md` + memory). Kopiera aldrig mönster som du inte
   först verifierat mot nuvarande kod.
4. **Ingen refaktor.** Detta är en test-byggnad, inte en kod-förbättring.
   Om du hittar en bug: flagga i `findings.md`, skriv en test som
   FAILAR, commit, och gå vidare. Fix är separat sprint.
5. **Branch per fas.** `test-total/phase-1-mutation`,
   `test-total/phase-2-property`, etc. Squash-merge till main efter
   gate. Ingen fas börjar på smutsig arbetsyta.
6. **Test-körning:** alltid via `npm run test` (inte `npx vitest run`),
   så better-sqlite3 rebuildas för Node-ABI. Efter varje fas,
   `npx electron-rebuild -f -w better-sqlite3,better-sqlite3-multiple-ciphers`
   om du sedan ska köra manuellt i dev.
7. **Ingen prod-ändring.** Bara `tests/`, `docs/`, `scripts/`,
   `package.json`-scripts, och nya devDependencies. Om du vill röra
   `src/**` — stanna, fråga.

### Kvalitetsgate för varje fas (generiskt)

- Typecheck grön: `npm run typecheck`
- Existerande tester gröna: `npm run test`
- Nya tester gröna (kör separat)
- Inga lint-fel på nya filer: `npm run lint`
- Dokumentation skriven: uppdatera `docs/testing-total-progress.md`
  med vad som gjorts, resultat, hittade buggar
- Commit med meddelande: `test(phase-N): <fas-titel> — <one-line result>`

Rapportera ALLTID efter gate: hur många tester, hur många buggar
hittades (i findings-fil), tid det tog, kostnad mätt som
LOC-tester / LOC-produktion.

---

## Fas 0 — Baseline (gör alltid först)

**Syfte:** Mät nuvarande tillstånd så resten av faserna kan visa
förbättring.

**Steg:**

1. Kör `npm run test -- --reporter=verbose | tee docs/testing-total-baseline.txt`
2. Kör `npm run typecheck` — skriv ned output
3. `npx vitest run --coverage --reporter=default 2>&1 | tail -60`
   — statement / branch / function / line coverage per fil.
   Spara i `docs/testing-total-coverage-baseline.json` (c8 / v8
   stödjer `--coverage.reporter=json`).
4. Räkna M-principer i `CLAUDE.md`: `grep -c "^## [0-9]" CLAUDE.md`.
   Lista dem i `docs/testing-total-m-checklist.md` — en rad per, med
   "testad: ?" som kolumn (fylls i fas 3).
5. Lista alla nuvarande invariant-tester:
   `grep -l "invariant\|consistency\|parity" tests/**/*.test.ts`.
   Skriv kort anteckning per fil om vad den täcker.
6. Skapa `docs/testing-total-progress.md` som:
   ```
   # Testing Total — progress log
   Start: <datum>
   Baseline: <vitest-count>, <coverage-line-%>, <PRAGMA-version>

   ## Phase 0 — baseline
   Done <datum>. <anteckningar>.
   ```

**Gate:** Progressfil + coverage-baseline + m-checklist existerar.
Ingen kod skriven än.

**Rapport:** Visa baseline-siffror och vänta på "go" för fas 1.

---

## Fas 1 — Mutation testing (Stryker)

**Syfte:** Avgöra om befintliga ~2900 tester faktiskt fångar logiska
mutationer. Om mutation score < 60% på en fil — den filen har
test-teater, och att skriva fler tester där utan att förstå varför
gamla missar är bortkastad tid.

### Läs först

- `src/main/services/result-service.ts` (källan, M96–M98)
- `src/main/services/invoice-service.ts` (core: finalizeDraft,
  payInvoice, payInvoicesBulk)
- `src/main/services/expense-service.ts` (spegel)
- `src/shared/money.ts` (M131)
- Det befintliga mönstret i test-filerna för dessa services

### Steg

1. **Installera Stryker** (förordar @stryker-mutator/vitest-runner):
   ```
   npm install -D @stryker-mutator/core @stryker-mutator/vitest-runner \
     @stryker-mutator/typescript-checker --legacy-peer-deps
   ```
2. **Skapa `stryker.conf.json`**:
   ```json
   {
     "$schema": "./node_modules/@stryker-mutator/core/schema/stryker-schema.json",
     "packageManager": "npm",
     "testRunner": "vitest",
     "coverageAnalysis": "perTest",
     "mutate": [
       "src/main/services/result-service.ts",
       "src/main/services/invoice-service.ts",
       "src/main/services/expense-service.ts",
       "src/main/services/correction-service.ts",
       "src/main/services/opening-balance-service.ts",
       "src/main/services/vat-service.ts",
       "src/main/services/vat-report-service.ts",
       "src/main/services/depreciation-service.ts",
       "src/shared/money.ts",
       "src/main/services/report/result-service.ts",
       "src/main/services/bank/bank-match-suggester.ts"
     ],
     "checkers": ["typescript"],
     "tsconfigFile": "tsconfig.json",
     "timeoutMS": 30000,
     "concurrency": 4,
     "thresholds": { "high": 85, "low": 70, "break": 60 },
     "reporters": ["clear-text", "html", "json"],
     "htmlReporter": { "fileName": "reports/mutation/index.html" },
     "jsonReporter": { "fileName": "reports/mutation/mutation-report.json" }
   }
   ```
3. **Kör på EN fil först** (`money.ts` — minst; verifiera uppsättning):
   `npx stryker run --mutate src/shared/money.ts`
4. Iterera på config om fel — dokumentera i progress.
5. **Full körning** med ovan fil-lista. Förväntad tid: 30-90 min
   beroende på concurrency och mutanter.
6. **Analys** av `reports/mutation/mutation-report.json`:
   - Lista ÖVERLEVANDE mutanter per fil, sortera efter kritikalitet
   - För varje överlevande: identifiera vilken specifik logik som inte
     har assertion-täckning
   - Skriv upp i `docs/testing-total-findings.md` under
     "Phase 1 — mutation gaps"
7. **Skriv tester som dödar ÖVERLEVANDE mutanter** — inte fler tester,
   utan targetade tester per överlevare. Mål:
   - `money.ts` → 95%+
   - `result-service.ts` → 90%+
   - Övriga → 85%+ eller dokumentera varför lägre är OK

### Gate

- Mutation score ≥ 85% på filerna ovan (except money.ts ≥ 95%)
- Progress-fil uppdaterad med siffror per fil före/efter
- `reports/mutation/` committad för transparens (eller länkad i docs)
- Ett nytt NPM-script `npm run test:mutation` kör ovan

### Rapport

Visa score per fil före/efter och antalet nya dödade mutanter.
Vänta på "go" för fas 2.

---

## Fas 2 — Property-based testing (fast-check)

**Syfte:** Ersätta hand-kodade exempel för aritmetik-intensiva regler
med genererade scenarier. Fångar F44/F27-klassens
float-precision-buggar, edge-cases runt noll/gränsvärden, och
kommutativitets-brott.

### Läs först

- `src/shared/money.ts` — M131 helpers
- `src/main/services/vat-service.ts`
- `src/main/services/invoice-service.ts` `processLines`-funktionen
- `src/renderer/components/invoices/InvoiceTotals.tsx` (M129)
- Befintliga fast-check-tester:
  `grep -l "fast-check\|fc\.assert" tests/`
- `docs/s67b-characterization.md` om den finns

### Properties att skriva (minst 20)

Välj minst 20 från listan nedan. Varje test körs default 1000 gånger
(`fc.assert(..., { numRuns: 1000 })`).

#### Money-aritmetik (`tests/property/money.property.test.ts`)
- `multiplyKrToOre(qty, priceKr)` returnerar alltid heltal ≥ 0 för
  positiva input
- Kommutativitet: `multiplyDecimalByOre(a, toOre(b)) ===
  multiplyKrToOre(a, b)` inom 1 öre tolerans (eller noll tolerans per M131)
- Monotonicitet: större priceKr → större output (ceteris paribus)
- Noll-fall: `qty=0` eller `priceKr=0` → alltid 0
- Precision-gränser: qty max 999999, priceKr max 999999.99 — inga overflow
- Inverse: for `k = multiplyKrToOre(q, p)`, `k / q` bör vara ungefär `p * 100`
  inom avrundningsfel

#### VAT (`tests/property/vat.property.test.ts`)
- Summa av moms per rad = moms på summan (inom 1 öre per M129)
- 0%-moms → vat_ore alltid 0
- Sum(lines) + sum(vat) == total (öresutjämnad)
- VAT-percent-invariant: samma rad-summa → samma moms-summa oavsett
  quantitetens uppdelning (1 × 100kr === 2 × 50kr)

#### Invoice-totals
- Totalen i InvoiceTotals (renderer) === processLines(...).total_ore
  (main) för alla gererade rad-kombinationer — M135 paritet
- Invoice med 0 rader → total 0, inga crashes
- Credit-note (isCreditNote=true): debet/kredit-swap men samma absolut total

#### Öresutjämning (`tests/property/rounding.property.test.ts`)
- `|diff| ≤ ROUNDING_THRESHOLD` och `remaining > 0` → öresutjämning
  triggas; utanför triggers inte
- Öresutjämnings-rad belastar 3740 med rätt tecken
- Utan öresutjämning: `paid + remaining === invoice.total`

#### Depreciation (`tests/property/depreciation.property.test.ts`)
- `SUM(pending) + executed_acc === cost - residual` alltid
- Linjär schedule: alla rader utom sista är exakt lika; sista korrigerar
  rounding
- Declining balance: sista månaden når residual exakt
- `updateFixedAsset` efter partial execution: bevarad historik,
  summa-invariant (M155)

#### Rate-limiter (`tests/property/rate-limiter.property.test.ts`)
- Delay-schedule ALDRIG negativt
- Efter N felade försök, väntetid ≥ schedule[min(N, last)]
- recordSuccess → checkAllowed === 0 (oavsett historia)

### Gate

- ≥ 20 properties, varje med `numRuns: 1000`
- Alla gröna (kör `npm run test tests/property/`)
- Varje property dokumenterad i kommentar med VILKEN invariant den
  testar och vilken bug den skyddar mot
- Nytt script `npm run test:property` i package.json
- Stryker körs om på samma filer — mutation score bör stiga

### Rapport

Antal properties, total numRuns, eventuella shrunk-motexempel som
avslöjade buggar. Vänta på "go" för fas 3.

---

## Fas 3 — Invariant-audit

**Syfte:** Varje M-princip i CLAUDE.md ska ha minst en test som
bevisar den empiriskt. Test ska inte läsa implementationen utan
verifiera egenskapen i resulterande data / observerbart beteende.

### Läs först

- `CLAUDE.md` — alla 62 M-principer
- Befintlig pattern i `tests/s24b-br-rr-consistency.test.ts` (den
  bästa existerande invariant-testen)

### Steg

1. För varje M i `docs/testing-total-m-checklist.md`:
   - Gå igenom M-beskrivningen
   - Identifiera **observerbart fenomen** som skulle bryta om regeln
     bryts (t.ex. "M98 förbjuder lexikografiska konto-jämförelser" →
     observerbart: konto 89991 finns i resultat när det borde)
   - Skriv test i `tests/invariants/M-<nn>-<slug>.test.ts`
   - Testet ska GENERERA data som skulle avslöja brott + köra
     beräkningen + verifiera
2. **Helfläck-tester** (fånga brott som inte är per-M):
   - Scanner-test: iterera alla journal_entries i seed-DB, verifiera
     SUM(debit) === SUM(credit) per entry
   - Scanner-test: alla invoices, verify paid_amount === SUM(payments)
   - Scanner-test: alla fixed_assets, verify summa-invariant (M155)
   - Scanner-test: alla företag har exakt en aktiv FY-tim
3. **Test med stor seed**: skapa en "mega-seed" via befintliga IPC
   — 100 fakturor, 50 kostnader, 20 bulk-betalningar, 10 korrigeringar,
   5 avskrivningar, manuell bokföring. Kör alla invariant-scanner
   mot den.

### Gate

- 100% av M-principer har minst ett invariant-test. Markera grön i
  `m-checklist.md`
- Scanner-tester gröna mot mega-seed
- Minst 3 buggar borde ha hittats (om noll: invariant-testerna är
  inte tillräckligt starka; revidera)

### Rapport

Antal invariant-tester, M-täckning i procent, hittade buggar.
Vänta på "go" för fas 4.

---

## Fas 4 — State-machine-tester (fc.commands)

**Syfte:** Test-workflow-sekvenser som handskrivna exempel inte täcker.

### Modeller att implementera (minst 3)

1. **InvoiceLifecycle** (`tests/state-machine/invoice-lifecycle.test.ts`):
   - States: draft → unpaid → partial → paid → corrected
   - Commands: SaveDraft, UpdateDraft, Finalize, Pay(amount),
     Credit (creates credit-note), Correct, Delete(only-draft)
   - Invariants: status matchar SUM(payments); paid_amount ≤ total;
     corrected_by_id ← unique; period-closed blocks
   - Seed en tom DB, kör 100+ sekvenser à 20-50 commands
2. **BankReconciliation**:
   - States per TX: unmatched → suggested → matched → unmatched (via
     unmatch)
   - Commands: ImportStatement, AutoSuggest, AcceptSuggestion,
     ManualMatch, Unmatch, ClassifyAsFee
   - Invariants: match-method är en av legala; unmatch skapar
     C-korrigering; M154 en-gångs-lås per payment-verifikat
3. **FiscalYearLifecycle**:
   - States: open → closed → reopened (en gång)
   - Commands: CreateFY, OpenPeriod, ClosePeriod, BookEntry,
     CreateNewFY (inlinear close), ReopenPeriod, ReTransferOB
   - Invariants: ingen booking efter close; IB matchar UB för
     föregående FY; reopen blockerar efter årsbokslut

### Implementation-mönster

```ts
import fc from 'fast-check'
import { createTestDb } from '../helpers/create-test-db'

class InvoiceModel { /* pure JS shadow — track expected state */ }
const commands = [
  fc.record({ type: fc.constant('finalize'), id: fc.integer() })
    .map(input => new FinalizeCommand(input)),
  // ...
]
fc.assert(fc.property(fc.commands(commands, { maxCommands: 50 }), (cmds) => {
  const db = createTestDb()
  const model = new InvoiceModel()
  fc.modelRun(() => ({ model, real: db }), cmds)
}), { numRuns: 200 })
```

### Gate

- 3 state-machines, 200+ runs per
- All invariants asserted in varje command's post-condition
- Shrunk motexempel (om någon failar) — committad som regression-test
  i `tests/<name>-regression.test.ts` med tydlig beskrivning

### Rapport

Antal shrunk motexempel hittade och vad de avslöjade.
Vänta på "go" för fas 5.

---

## Fas 5 — Migrations regression-matrix

**Syfte:** En användare som kör v0.5 ska kunna uppgradera till v1.0
utan dataförlust. Och alla steg däremellan.

### Steg

1. **Skapa fixture-snapshots per PRAGMA-version** (0 till nuvarande 44):
   - För varje PRAGMA-version: skapa DB via migrations upp till den,
     seed representativ data via IPC (1-2 bolag, 10 fakturor, 5 kost-
     nader, 1 korrigering, 1 bankavstämning), spara som
     `tests/fixtures/db-snapshots/v<nn>.db`
   - Dokumentera vad som är i varje snapshot i README i samma mapp
2. **Regression-test**:
   - För varje snapshot → kör alla efterföljande migrations →
     verifiera: schema matchar nuvarande, user_version = 44,
     FK-integrity (PRAGMA foreign_key_check), triggers attached,
     indexes re-created (M121/M122/M141)
   - För varje snapshot: verifiera specifika invarianter: alla
     fakturor kvarstår med rätt belopp, alla journal_entries
     balanserade, alla payment-summor intakt
3. **Rollback-test** (där möjligt):
   - Skapa snapshot vid v44, kör en migration, rollback via
     explicit reverse-SQL om migration stödjer det — annars
     dokumentera att rollback inte stöds
4. **Legacy-DB-migration** (ADR 004 §9):
   - Seed en okrypterad v44-DB → kör migrateLegacyToEncrypted →
     öppna krypterad → verifiera alla rader, user_version, triggers

### Gate

- Alla snapshots migrerar grönt till v44
- FK-integrity check grön efter varje steg
- Legacy-migration test grön
- Nytt script `npm run test:migrations:matrix`

### Rapport

Snapshot-täckning, eventuella migrationer som failar på gamla DB,
tid per full matrix-körning. Vänta på "go" för fas 6.

---

## Fas 6 — E2E user-journeys

**Syfte:** Full-stack-verifiering av de viktigaste arbetsflödena som
en verklig användare skulle köra.

### Journeys (skriv minst 5)

Varje journey är en Playwright-test i `e2e/journeys/`:

1. **En månads bokföring**:
   - Skapa bolag (onboarding)
   - 20 fakturor (10 olika kunder, olika moms)
   - 15 kostnader (10 leverantörer, 3 bankavgifter)
   - 3 bulk-betalningar
   - 1 kreditnota
   - 1 korrigeringsverifikat
   - Skapa momsrapport
   - Exportera SIE4
   - Verifiera: alla verifikat balanserar, BR/RR stämmer,
     SIE4-filen importerbar tillbaka ger samma data (roundtrip)

2. **Årsbokslut**:
   - Seed ett FY med 100+ verifikat
   - Skapa IB från föregående år
   - Kör avskrivningar för året
   - Periodiseringar
   - Årsbokslut (net_result beräknas)
   - Stäng perioder
   - Skapa nästa FY (inline close av föregående)
   - Verify IB-matching mellan år

3. **Migration från legacy**:
   - Seed en okrypterad v44-DB i expected legacy path
   - Starta app som ny användare via `__test:createAndLoginUser`
     (fast, ingen recovery-UX)
   - Trigger legacy-import
   - Verify all data bevarad

4. **Bankavstämning end-to-end**:
   - Seed 30 fakturor/kostnader
   - Importera camt.053 med 30 matching + 5 unmatching TXs
   - Kör auto-match
   - Manuellt match resterande
   - Klassificera avgifter
   - Unmatch en, rematcha
   - Verify SUM(payments) === SUM(matched TX amounts)

5. **Multi-user och auth**:
   - Skapa 3 användare
   - Switch mellan dem (logout + login)
   - Verifiera isolation: data av användare A osynlig för B
   - Auto-lock: sätt timeout 1 min, idle, verify lock
   - Recovery-login: använd phrase, verify samma data synlig

### Gate

- 5 journeys, alla gröna i `npm run test:e2e`
- Varje journey 1-3 min, total E2E < 20 min
- Artefakter (screenshot, logs) sparade vid failure

### Rapport

Antal journeys, tid, eventuella flakiness-problem.
Vänta på "go" för fas 7.

---

## Fas 7 — Fuzz + security

**Syfte:** Systemet ska inte krascha eller läcka data ens under
fientlig input.

### Tester

1. **IPC-fuzzing** (`tests/security/ipc-fuzz.test.ts`):
   - För varje IPC-kanal, generera 500 random payloads (fast-check
     arbitrary matchande men muterat runt Zod-schemat)
   - Invoka varje → main-processen får ALDRIG krascha
   - Varje svar ska vara giltig IpcResult (success+data eller
     success+code+error)
   - Ingen svarsfält får vara `undefined` där typen säger `string`
   - Ingen path-leak i error-meddelanden

2. **SQL-injektions-audit** (`tests/security/sql-injection.test.ts`):
   - Payload-lista med 30 klassiska injections:
     `'; DROP TABLE invoices; --`, `' OR '1'='1`, `UNION SELECT...`,
     `%` (LIKE escape), Unicode-zero-width, etc.
   - Inject i varje text-fält via IPC
   - Efter varje: kör `PRAGMA integrity_check`, verify att test-tabel-
     ler finns kvar, att ingen data auktoriserats som inte skulle

3. **Auth-penetration** (`tests/security/auth-pentest.test.ts`):
   - Timing-attack på login: 1000 login-försök med varierande
     passwordslängd, verify att response-time inte beror på lösenords-
     prefix-match (within 20% σ)
   - Rate-limiter-bypass: parallelliserade parallella login-attempts
     mot samma user — verify backoff triggas även vid parallell
   - Recovery-key-brute-force: 10000 slump-phrases — ingen ska lyckas
     (statistiskt omöjligt, men verify att detta inte ger cache-hit
     eller annan infoläcka)
   - Path-traversal: `FRITT_AUTH_ROOT=../../../etc` eller
     displayName med `../` — verify att file-operations saniteras

4. **Memory-dump (defensivt)**:
   - Skriv test som (efter login + logout) dumpar process memory och
     grep:ar efter lösenord-plaintext och K-bytes
   - Detta är en best-effort-check, inte en bevisning — dokumentera
     i kommentar

### Gate

- IPC-fuzz: 0 kraschar över 500×(antal IPC-handlers) invokationer
- SQL-injection: 0 tabeller borttagna, 0 auktoriserade data-läckor
- Auth-pentest: timing-σ < 20%, ingen rate-limit-bypass, ingen
  path-traversal
- Memory-dump-test löper (även om bara "warning" vid hit —
  V8 kan inte garantera)
- Allt dokumenterat i `docs/security-test-report.md`

### Rapport

Antal hittade säkerhets-gaps (0 förväntat, men ärliga resultat).
Rapport skrivs även om gate fails.

---

## Efter alla faser — slutrapport

Skapa `docs/testing-total-final-report.md`:

```
# Testing Total — Slutrapport

## Numerics
- Baseline: <x> tester, <y>% line coverage, <z>% mutation score
- Slut:     <a> tester, <b>% line coverage, <c>% mutation score
- Delta:    +<n> tester, +<n>pp coverage, +<n>pp mutation

## Fas-för-fas
### Fas 1 Mutation: <result>
### Fas 2 Property: <result>
### ... etc

## Hittade buggar
<lista från findings.md>

## Skuld kvar
<vad vi valde att INTE testa och varför>

## Kostnad
LOC tester / LOC prod: <ratio>. Tid totalt: <timmar>.
```

Commit med meddelande: `test(total): 7-layer testing buildout complete`.

Skapa sedan en fil `.testing-total-done` som markerar sessionen som klar.

---

## Metadata för AI-agenten

- Tid per fas: fas 1 ~1 dag, fas 2-3 ~1 dag var, fas 4 ~1-2 dagar,
  fas 5 ~0.5 dag, fas 6 ~1-2 dagar, fas 7 ~1 dag. Total: ~7-10 dagar
  arbete.
- Antal commits per fas: 3-10 beroende på storlek.
- Vid tveksamhet: rapportera till användaren. Detta är inte en fas
  där du ska optimera för autonomi — du ska optimera för KORREKTHET.
- Om du hittar en bug i produktionskod: flagga i findings, skriv
  testfall som failar, markera `.skip` tills separat sprint.
  Fortsätt med testbygget.

Slut.
