# Sprint D — Backlog-cleanup: E2E-failures + M100-avvikelser (~3–5 SP)

**Datum:** 2026-04-17 (planerat)
**Tema:** Noll nya features. Stänger två dokumenterade skulder:
5 pre-existing E2E-failures (S57/S58) och 2 små M100-avvikelser i
export-services. Ingen ny arkitektur, inga nya M-principer, inga nya
migrationer.

**Testbaslinje (verifierad 2026-04-17):**
- 2471 vitest-tester (245 testfiler)
- **65 Playwright-specfiler, 102 `test()`-kallor** (ej 60 som tidigare
  utkast angav — siffran verifierad med `ls tests/e2e/**/*.spec.ts | wc -l`
  och `grep -c "^test(" ...`)
- 5 `test()`-kallor failar pre-existing (listade i A.2 nedan)
- PRAGMA user_version: 41

---

## Scope-risk (läs först innan du börjar)

S55–S58 levererade bank-reconciliation, auto-classify, unmatch och
SIE4-import-konflikter — ny funktionalitet, inte gammal städning. Alla
5 pre-existing failures ligger i det nya scope:t. Det är **sannolikt**
att triagen landar i kategori 2 (app-bug) för åtminstone 1–2 specs,
inte kategori 1/3 (testet skört).

**Förväntad utfallskurva:**

| Scenario | Utfall | Sprint D-arbete |
|---|---|---|
| Best-case | Alla 5 är kat 1/3 | 3 SP, full stängning |
| Realistiskt | 2–3 är kat 2 utan migration | 5 SP, full stängning |
| Sämsta-case | ≥1 kat 2 kräver migration / ny M-princip / ny IPC | 2–3 SP, Sprint E-split |

Om sämsta-case inträffar är det **inte** ett misslyckande — det är
korrekt scope-hygien. Sprint D är cleanup; feature-completion-arbete
separeras ut i Sprint E.

---

## Bakgrund

Sprint C lämnade explicit backlog i
[docs/sprint-c-summary.md:130](docs/sprint-c-summary.md):

> **Pre-existing E2E-failures** (5 st): bank-fee-auto-classify (S58),
> bank-statement-auto-match-partial (S57), bank-unmatch batch-blocked
> (S58), sie4-import-conflict x2 (S57). Orörda av Sprint C.

Därtill exponerade QA-audit 2026-04-17 två `throw new Error`-call-sites
i export-lagret som bryter **M100** (strukturerade valideringsfel):

- [src/main/services/export/export-data-queries.ts:97,111](src/main/services/export/export-data-queries.ts)
- [src/main/services/excel/excel-export-service.ts:92,94](src/main/services/excel/excel-export-service.ts)

**Scope-beslut:** Sprint D är cleanup. Om triagen visar att en E2E-failure
kräver affärslogik-ändring, ny migration, eller ny M-princip → dokumentera
root cause, eskalera till eng-review, och inkludera som Sprint E-kandidat.
Utvidga **aldrig** scope på egen hand.

---

## Uppgifter

### A. Triage: kör ALLA 5 specs innan någon fix

Förhandla inte halvvägs — kör hela triagen, dokumentera matris,
**sedan** fatta beslut om B-fasen. Detta förhindrar sunk-cost på specs
som visar sig vara blockerade av andra specs.

#### A.1 — Setup-kommandon

```bash
# Build är obligatorisk — E2E kör mot kompilerad app
npm run build

# En-specs-körning (snabbast per spec under triage)
npx playwright test tests/e2e/<spec-filnamn> --config=e2e/playwright.config.ts

# Full suite (verifiering efter fixar)
npm run test:e2e

# OBS: `npm run e2e` finns INTE. Rätt script är `npm run test:e2e`.
# Smoke-körning (critical-taggade): `npm run test:e2e:critical`
```

#### A.2 — Specs att triagera

Följ [tests/e2e/README.md](tests/e2e/README.md) för setup.
Data-testid-whitelist i samma README § 38.

| # | Spec (fil:rad) | Test-namn | Misstänkt area |
|---|---|---|---|
| 1 | [tests/e2e/bank-fee-auto-classify.spec.ts:45](tests/e2e/bank-fee-auto-classify.spec.ts) | S58 B3: CHRG-TX auto-klassas som bank_fee, accept skapar B-serie-verifikat | camt.053-parsning, bank-fee-classifier, B-serie-dispatch |
| 2 | [tests/e2e/bank-statement-auto-match-partial.spec.ts:62](tests/e2e/bank-statement-auto-match-partial.spec.ts) | S57 A5 partial: 1 av 3 failar → "2 av 3 accepterade" + failure-lista | bulk-accept partial-success-UI, toast-rendering |
| 3 | [tests/e2e/bank-unmatch.spec.ts:109](tests/e2e/bank-unmatch.spec.ts) | S58 D2 batch-blocked: unmatch av batch-payment avvisas med BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED | ErrorCode-propagation + toast-text |
| 4 | [tests/e2e/sie4-import-conflict.spec.ts:19](tests/e2e/sie4-import-conflict.spec.ts) | S57 B4 happy: "Skriv över"-konflikt uppdaterar kontonamn | konflikt-resolution-dialog + merge-strategi |
| 5 | [tests/e2e/sie4-import-conflict-blocked.spec.ts:19](tests/e2e/sie4-import-conflict-blocked.spec.ts) | S57 B4 negative: skip på used-account → Importera disabled | disabled-state på Import-knapp |

#### A.3 — Kategorisering (en per spec)

1. **Kat 1 — Testet är utdaterat.** Appen fungerar, testet förväntar
   gammal UI/API. Fix: uppdatera testet. (Precedent: S51 bulk-payment-flake,
   [STATUS.md:323](STATUS.md).)
2. **Kat 2 — Appen har bug.** Testet förväntar rätt beteende, koden är
   trasig. Fix: rotorsaks-fix i appen (se B2 för gränsdragning mot scope).
3. **Kat 3 — Infrastruktur-skörhet.** Race, saknad wait, flaky selector.
   Fix: stabilisera testet.

#### A.4 — Triage-output per spec

Spara:
- Failing-logg (sista 40 rader `stderr`) i
  `docs/sprint-d-triage-logs/{spec-namn}.log`
- Screenshot vid visuell regression från
  `test-results/*/test-failed-1.png` (kopieras till triage-logs-mappen)

Sammanställ i `docs/sprint-d-summary.md` under **§ Triage-matris**:

```markdown
| # | Spec | Kategori | Root cause (en mening) |
|---|------|----------|------------------------|
| 1 | bank-fee-auto-classify | 2 | ... |
| 2 | bank-statement-auto-match-partial | ... | ... |
```

#### A.5 — Exit från A till B

Först **efter att matrisen är fullständigt ifylld för alla 5 specs**:
- Om alla är kat 1/3 → fortsätt till B1
- Om ≥1 är kat 2 utan migration / ny M-princip / ny IPC → fortsätt till B2
- Om ≥1 är kat 2 **med** migration, ny M-princip eller ny IPC-kanal →
  **STOPPA**, rapportera till användaren, fråga om Sprint E-split

Delfixar av några specs medan andra är otriagerade är **förbjudet**.

---

### B. Fixar (per triage-kategori)

#### B1 — Kat 1 / 3 (testet är utdaterat eller skört)

Fixa i testet. Håll dig till befintliga patterns:

- **Wait:** använd `expect(locator).toBeVisible({ timeout })` eller
  `await locator.waitFor({ state: 'visible', timeout })`. Undvik
  `page.waitForTimeout` — om det ändå krävs, motivera i inline-kommentar
  (tidsberoende, `setInterval`-baserad UI, etc.)
- **Data-testid:** endast om redan på whitelist
  ([tests/e2e/README.md § 38](tests/e2e/README.md))
- **Seedning via IPC** (M148): `window.api.*` eller `window.__testApi.*` —
  aldrig direkt `better-sqlite3` i test-processen
- **Tid-frysning:** `freezeClock(window, iso)` om testet är datumberoende
  (M150)

`waitForIdle()` finns **inte** som helper i repot — förväxla inte med
Playwright-native wait-API.

#### B2 — Kat 2 (app-bug)

STOP → läs triagen tillsammans med följande guard-policy:

| Fix-krav | Beslut |
|---|---|
| Inom befintlig service, ingen ny IPC, ingen migration, ingen publik-yta-utvidgning | Implementera + system-layer-test + E2E-verifiering |
| Kräver ny M-princip | STOPPA, eskalera till eng-review |
| Kräver ny migration (PRAGMA-bump) | STOPPA, eskalera till eng-review |
| Kräver ny IPC-kanal | STOPPA, eskalera till eng-review |
| Kräver ny data-testid utanför whitelist | STOPPA, eskalera till eng-review |
| Utvidgar publik funktionsyta (ny export, ny prop, nytt returfält) | STOPPA, eskalera till eng-review |

**Bodyguard-undantag:** om en kat-2-fix berör bank-service,
invoice-service, expense-service, correction-service eller
depreciation-service — och ändringen **inte** utvidgar publik yta
eller datamodell — är det tillåtet inom B2. Scope-väktaren är "ny
princip eller persisterat state" (→ eskalering), inte "filen får inte
röras".

Dokumentera varje kat-2-fix som `F7{a..e}` i
`docs/sprint-d-summary.md` → § Levererat.

---

### C. M100-fixar i export-lagret

#### C.0 — Pre-flight

`ErrorCode`-unionen bor i
[src/shared/types.ts:15-47](src/shared/types.ts). `NOT_FOUND` (rad 20)
och `VALIDATION_ERROR` (rad 16) finns **redan** — **ingen enum-utökning
behövs**. Tidigare utkast pekade felaktigt på `shared/ipc-errors.ts`
som inte existerar.

Renderer-toast-sanity (0 träffar förväntade):

```bash
grep -rn "UNEXPECTED_ERROR" src/renderer --include="*.ts" --include="*.tsx" \
  | grep -iE "export|excel|sie"
```

Om träffar finns: dokumentera i § Backlog — hardcoded toast-fallback är
en egen refaktor utanför Sprint D.

#### C.1 — `export-data-queries.ts:97,111`

Byt:
```ts
if (!row) throw new Error('No company found')
// ...
if (!row) throw new Error(`Fiscal year ${fiscalYearId} not found`)
```

till M100-strukturerade fel:
```ts
if (!row) throw { code: 'NOT_FOUND' as const, error: 'Inget företag hittades' }
// ...
if (!row) throw { code: 'NOT_FOUND' as const, error: `Räkenskapsår ${fiscalYearId} hittades inte` }
```

`as const` krävs för att TypeScript ska smalna typen korrekt i
`wrapIpcHandler.isStructuredError`-branchen
([src/main/ipc/wrap-ipc-handler.ts:78-85](src/main/ipc/wrap-ipc-handler.ts)).

Konsumenter (SIE4-, SIE5-, Excel-export, `report:income-statement`,
`report:balance-sheet`) bubblar redan upp via `wrapIpcHandler` — se
[ipc-handlers.ts:656-680](src/main/ipc-handlers.ts). Ingen
konsument-sida-ändring krävs.

#### C.2 — `excel-export-service.ts:92,94`

Byt:
```ts
if (startDate && startDate < fy.start_date)
  throw new Error('startDate is before fiscal year start')
if (endDate && endDate > fy.end_date)
  throw new Error('endDate is after fiscal year end')
```

till:
```ts
if (startDate && startDate < fy.start_date)
  throw { code: 'VALIDATION_ERROR' as const, error: 'startDate ligger före räkenskapsårets start', field: 'startDate' }
if (endDate && endDate > fy.end_date)
  throw { code: 'VALIDATION_ERROR' as const, error: 'endDate ligger efter räkenskapsårets slut', field: 'endDate' }
```

#### C.3 — Tester för C1/C2

Lägg till **minst 3** system-layer-tester i filen
`tests/session-XX-m100-export.test.ts` (ersätt `XX` med nästa fria
session-nummer efter S59 — se STATUS.md för senaste).

Namnkonventionen `session-XX-*` följer projektets etablerade mönster
(se [tests/session-44-rounding-and-errors.test.ts](tests/session-44-rounding-and-errors.test.ts),
session-56, session-58).

**Tre paths att täcka (en per test, eller ett test med tre `it`-block):**

1. `getCompanyInfo` på tom `companies`-tabell → assert
   `{code: 'NOT_FOUND'}` med text som matchar `/företag/i`
2. `getFiscalYear` (indirekt via `getIncomeStatement`) med ogiltigt
   `fiscalYearId` → assert `{code: 'NOT_FOUND'}` med text som matchar
   `/räkenskapsår/i`
3. `exportExcel` med `startDate < fy.start_date` → assert
   `{code: 'VALIDATION_ERROR', field: 'startDate'}`

**VIKTIGT:** importera `exportExcel`, **inte** `generateExcelExport`
(tidigare utkast hade fel funktionsnamn; det faktiska namnet är
`exportExcel` — se
[excel-export-service.ts:75](src/main/services/excel/excel-export-service.ts)
och [preload.ts:192](src/main/preload.ts)).

Eftersom `export-data-queries`-funktionerna är rena funktioner (inte
service-wrappers) kan de testas direkt:

```ts
import { getCompanyInfo, getFiscalYear } from '../src/main/services/export/export-data-queries'

it('getCompanyInfo kastar NOT_FOUND vid tom companies-tabell', () => {
  // Not ens createCompany körs — DB migrerad men tom
  expect(() => getCompanyInfo(db)).toThrow(
    expect.objectContaining({ code: 'NOT_FOUND' })
  )
})
```

Följ test-mönstret från
[tests/session-44-rounding-and-errors.test.ts](tests/session-44-rounding-and-errors.test.ts)
(M100-referens). Använd samma `createTestDb()`-helper.

---

## Bodyguards (inget dessa ska röra)

- Inga nya M-principer (utan eng-review-eskalering)
- Inga nya migrationer (PRAGMA stannar på 41)
- Inga nya IPC-kanaler
- Inga publik-yta-utvidgningar i bank-service, invoice-service,
  expense-service, correction-service, depreciation-service
- Inga nya arkitektur-ADR
- Ingen ny data-testid utanför befintlig whitelist

Om en kat-2-fix kräver något av ovan → STOPPA och fråga användaren.
Sprint D är cleanup, inte feature-work.

---

## Acceptance

Grön build betyder:

1. `npm run check:m133 && npm run check:m133-ast && npm run check:m153` — alla OK
2. `npm run typecheck` — 0 fel
3. `npm test -- --run` — **2474+ tester** passerar (2471 baseline + ≥3 från C3)
4. `npm run test:e2e` full suite: **alla `test()`-kallor passerar**
   (baseline 102 `test()`-kallor i 65 spec-filer; minst de 5 i
   triage-matrisen ska stänga)
5. `docs/sprint-d-summary.md` existerar med § Triage-matris +
   § Levererat + § Backlog
6. Ingen ändring i [src/main/migrations.ts](src/main/migrations.ts)
7. `docs/sprint-d-triage-logs/` innehåller en logg per triagerad spec
8. `git status` clean efter commit (endast avsiktliga ändringar + nya filer)

**Gated acceptance vid Sprint E-split** (sämsta-case per scope-risk):
punkt 1–3, 5–8 måste uppfyllas. Punkt 4 begränsas till de specs som
faktiskt stängts i Sprint D. Öppna specs flaggas som Sprint E-backlog
med tydlig kat-2-root-cause-beskrivning.

---

## Deliverables

- `docs/sprint-d-summary.md` — § Triage-matris + § Levererat + § Backlog
- `docs/sprint-d-triage-logs/*.log` — 5 loggar (en per triagerad spec)
- `tests/session-XX-m100-export.test.ts` — minst 3 tester (C3)
- Uppdaterad MEMORY.md (`project_sprint_state.md`) — ett-radig
  sprint-state som reflekterar faktiskt utfall:
  - Full stängning: "Sprint D KLAR — 5 E2E pre-existing fails stängda, 2 M100-avvikelser fixade. PRAGMA 41 oförändrad."
  - Sprint E-split: "Sprint D DELVIS — M100 (C1/C2) fixade, N av 5 E2E-specs stängda. Sprint E äger återstående M st."
- Uppdaterad STATUS.md med Sprint D-sektion (följ formatet från Sprint C)

---

## Tidsuppskattning

- A (triage alla 5 specs, ingen fix): 1 SP
- B (fixar, beroende av triage-utfall):
  - Kat 1/3: ~30 min per spec
  - Kat 2 utan migration: 1–2 h per spec
  - Kat 2 med migration / ny princip: STOPPA → Sprint E
- C (M100 + 3 tester): 0.5 SP
- Docs + commits: 0.5 SP

**Total:** 3–5 SP i realistiskt fall. Vid Sprint E-split:
2–3 SP i Sprint D (triage + M100 + docs) + återstoden i Sprint E.

---

## Rättelse-historik (jämfört med första utkastet)

Denna version ersätter första utkastet 2026-04-17. Ändringar:

- `npm run e2e` → `npm run test:e2e` (scriptet `e2e` finns inte i
  package.json)
- `shared/ipc-errors.ts` → `shared/types.ts` (ErrorCode-unionens
  faktiska plats; `NOT_FOUND` och `VALIDATION_ERROR` finns redan —
  ingen enum-utökning behövs)
- `generateExcelExport` → `exportExcel` (korrekt funktionsnamn i
  `excel-export-service.ts:75`)
- `waitForIdle()`-helper avlägsnad — finns inte i repot; använd
  Playwright-native `expect(locator).toBeVisible({ timeout })`
- Baseline-siffror korrigerade: "60 Playwright-specs" → "65 specfiler,
  102 `test()`-kallor" (verifierat via `ls` + `grep`)
- C3 utökad från 2 till 3 tester — täcker nu både rad 97 (company) och
  rad 111 (fiscal year) i `export-data-queries.ts`, inte bara den ena
- Testfilnamn: `sprint-d-m100-export.test.ts` →
  `session-XX-m100-export.test.ts` (följer projektkonvention)
- Ny § Scope-risk (läs först) — explicit förväntan att kat 2 är
  sannolikt, och att Sprint E-split **inte** är misslyckande
- A.5 triage exit-criterion förtydligat: delfixar medan andra specs
  otriagerade är förbjudet
- Triage-loggmapp: `sprint-d-triage/` → `sprint-d-triage-logs/`
- C.0 pre-flight grep för renderer-toast-hardcoded-error-scan
- B2 guard-tabell tydlig i kolumnformat; bodyguard-undantag
  förtydligat (publik-yta vs filänddring)
- Gated acceptance vid Sprint E-split (punkt 4 i Acceptance) dokumenterad
