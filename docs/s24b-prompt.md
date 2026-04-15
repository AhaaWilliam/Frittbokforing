# Sprint 24b — BR-result-konsistens + F4 latent comparator-cleanup

**Typ:** Implementation-sprint. Alla beslut spikade i `docs/s24a-f19-f4-strategy.md`.
**Baseline:** 1493 tester, HEAD vid S24a-avslut.

---

## Steg 0 — Preflight

```bash
set -euo pipefail
cd ~/fritt-bokforing
git status

CLEAN=$(git status --porcelain | wc -l)
[ "$CLEAN" = "0" ] || { echo "STOPP: working tree inte clean"; exit 1; }

CURRENT_BRANCH=$(git branch --show-current)
[ "$CURRENT_BRANCH" = "main" ] \
  || { echo "STOPP: fel branch ($CURRENT_BRANCH)"; exit 1; }

npm test -- --run 2>&1 | tail -5
npm run check:m131
npm run check:m133
```

Verifiera att baslinje = 1493 passed. Avbryt om inte.

---

## Commit 1 — `compareAccountNumbers` helper + unit + property-tester

### 1.1 Skapa helper

Skapa `src/shared/account-number.ts`:

```ts
/**
 * Numerisk jämförelsekomparator för BAS-kontonummer.
 * Löser F4 (M98): lexikografisk jämförelse bryter för 5-siffriga konton
 * ("30000" > "4000" lexikografiskt men < numeriskt).
 *
 * Förutsätter att input är validerade numeriska strängar (via Zod-schema).
 */
export function compareAccountNumbers(a: string, b: string): number {
  return parseInt(a, 10) - parseInt(b, 10)
}
```

### 1.2 Installera fast-check

```bash
npm install --save-dev fast-check
```

### 1.3 Skapa testfil

Skapa `tests/s24b-account-comparator.test.ts` med:

**5 unit-tester:**
1. 4-siffrig vs 4-siffrig (numerisk ordning: 1510 < 3002)
2. 5-siffrig vs 4-siffrig (30000 > 4000 numeriskt)
3. Lika (1930 === 1930 → 0)
4. Lika prefix, olika suffix (1010 < 1100)
5. Omvänd ordning (3002 > 1510)

**4 property-tester (fast-check):**

```ts
import fc from 'fast-check'
import { compareAccountNumbers } from '../src/shared/account-number'

const validAccountNumber = fc.stringOf(
  fc.constantFrom('0','1','2','3','4','5','6','7','8','9'),
  { minLength: 4, maxLength: 5 }
)

// 1. Reflexivitet
fc.assert(fc.property(validAccountNumber, (a) =>
  compareAccountNumbers(a, a) === 0))

// 2. Antisymmetri
fc.assert(fc.property(validAccountNumber, validAccountNumber, (a, b) =>
  Math.sign(compareAccountNumbers(a, b)) === -Math.sign(compareAccountNumbers(b, a))))

// 3. Transitivitet
fc.assert(fc.property(validAccountNumber, validAccountNumber, validAccountNumber,
  (a, b, c) => {
    if (compareAccountNumbers(a, b) <= 0 && compareAccountNumbers(b, c) <= 0) {
      return compareAccountNumbers(a, c) <= 0
    }
    return true
  }))

// 4. Numerisk konsistens (M98-kontrakt) — ICKE-FÖRHANDLINGSBAR
fc.assert(fc.property(validAccountNumber, validAccountNumber, (a, b) =>
  Math.sign(compareAccountNumbers(a, b)) === Math.sign(Number(a) - Number(b))))
```

### 1.4 Kör tester, committa

```bash
npm test -- --run
# Förväntat: 1493 + 9 = 1502 passed
```

Commit: `feat: compareAccountNumbers helper + unit + property-tester`

**Testdelta:** +9

---

## Commit 2 — F4 numerisk ORDER BY + localeCompare-fix

### 2.1 SQL ORDER BY-ändringar (5 ställen)

| Fil | Rad | Före | Efter |
|---|---|---|---|
| `src/main/services/account-service.ts` | 33 | `ORDER BY account_number ASC` | `ORDER BY CAST(account_number AS INTEGER) ASC` |
| `src/main/services/account-service.ts` | 49 | `ORDER BY account_number ASC` | `ORDER BY CAST(account_number AS INTEGER) ASC` |
| `src/main/services/report/balance-queries.ts` | 43 | `ORDER BY jel.account_number` | `ORDER BY CAST(jel.account_number AS INTEGER)` |
| `src/main/services/export/export-data-queries.ts` | 158 | `ORDER BY a.account_number` | `ORDER BY CAST(a.account_number AS INTEGER)` |
| `src/main/services/export/export-data-queries.ts` | 220 | `ORDER BY jel.account_number, month` | `ORDER BY CAST(jel.account_number AS INTEGER), month` |

### 2.2 Application-layer localeCompare-fix (1 ställe)

`src/main/services/report/report-service.ts` rad 127:

```ts
// Före:
bsBalances.sort((a, b) => a.account_number.localeCompare(b.account_number))

// Efter:
import { compareAccountNumbers } from '../../shared/account-number'
// ...
bsBalances.sort((a, b) => compareAccountNumbers(a.account_number, b.account_number))
```

**Notera:** importen ska läggas överst i filen tillsammans med andra importer.

### 2.3 Sorteringsordning-regressionstester

Lägg till i `tests/s24b-account-comparator.test.ts` (eller ny fil
`tests/s24b-f4-sorting.test.ts`):

```ts
it('getAccountBalances sorterar numeriskt med 5-siffrigt konto', () => {
  ensureAccountExists('30000', 'Underkonto test')
  bookEntry('2025-03-15', [
    { account: '30000', debit: 100_000, credit: 0 },
    { account: '3002', debit: 0, credit: 100_000 },
  ])

  const balances = getAccountBalances(db, fyId)
  const numbers = balances
    .filter(b => b.account_number.startsWith('3'))
    .map(b => b.account_number)
  const idx3002 = numbers.indexOf('3002')
  const idx30000 = numbers.indexOf('30000')
  expect(idx3002).toBeLessThan(idx30000) // 3002 < 30000 numeriskt
})

it('listAccounts sorterar numeriskt', () => {
  // Använd befintlig seed-data — alla 4-siffriga.
  // Verifiera att ordning matchar parseInt-ordning.
  const accounts = listAccounts(db, { fiscal_rule: 'K2', class_filter: 3 })
  const numbers = accounts.map(a => a.account_number)
  const sorted = [...numbers].sort((a, b) => parseInt(a, 10) - parseInt(b, 10))
  expect(numbers).toEqual(sorted)
})
```

### 2.4 Kör alla tester, committa

```bash
npm test -- --run
# Förväntat: 1502 + 2 = 1504 passed
```

Commit: `fix(F4): numerisk ORDER BY + localeCompare → compareAccountNumbers`

**Testdelta:** +2

---

## Commit 3 — BR netResult via calculateResultSummary + konsistens-tester

### 3.1 Ändra report-service.ts

`src/main/services/report/report-service.ts`:

1. Lägg till import överst (efter befintliga):
```ts
import { calculateResultSummary } from '../result-service'
```

Notera: `calculateResultSummary` importeras redan på rad 8 (`import { calculateResultSummary } from '../result-service'`). Dubbelkolla — om den redan finns, behövs ingen ny import.

2. Ersätt rad 136–141:

```ts
// Före (6 rader):
  // 6. Calculate net result from class 3-8 (dynamic)
  const plMovements = movements.filter(
    (m) =>
      !m.account_number.startsWith('1') && !m.account_number.startsWith('2'),
  )
  const calculatedNetResult = plMovements.reduce((s, m) => s + m.net, 0)

// Efter (2 rader):
  // 6. Net result from result-service (M134: single source of truth for årets resultat)
  const resultSummary = calculateResultSummary(db, fiscalYearId, dateRange)
  const calculatedNetResult = resultSummary.netResultOre
```

### 3.2 Konsistens-tester

Skapa `tests/s24b-br-rr-consistency.test.ts`.

Använd samma testinfrastruktur som `session-43-result-service.test.ts`
(createTestDb, bookEntry, ensureAccountExists pattern).

**3 BR/RR-konsistens-tester:**

```ts
describe('BR/RR netResult konsistens (F19)', () => {
  it('positivt resultat med klass 8', () => {
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
    expect(rr.netResult).toBe(17_000_000)
  })

  it('negativt resultat', () => {
    // Expense 50k, no revenue
    bookEntry('2025-03-01', [
      { account: '5010', debit: 5_000_000, credit: 0 },
      { account: '1930', debit: 0, credit: 5_000_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    const br = getBalanceSheet(db, fyId)
    expect(br.equityAndLiabilities.calculatedNetResult).toBe(rr.netResult)
    expect(rr.netResult).toBe(-5_000_000)
  })

  it('noll-resultat', () => {
    const rr = getIncomeStatement(db, fyId)
    const br = getBalanceSheet(db, fyId)
    expect(br.equityAndLiabilities.calculatedNetResult).toBe(rr.netResult)
    expect(rr.netResult).toBe(0)
  })
})
```

**3 negativa kontrakt-tester:**

```ts
describe('negativa kontrakt', () => {
  it('obefintligt fiscal_year_id → 0, inte krasch', () => {
    const rr = getIncomeStatement(db, 99999)
    expect(rr.netResult).toBe(0)
    const br = getBalanceSheet(db, 99999)
    expect(br.equityAndLiabilities.calculatedNetResult).toBe(0)
  })

  it('klass 8 finns men 89xx saknas → 0 skatt, korrekt netResult', () => {
    // Financial income only, no tax
    bookEntry('2025-06-30', [
      { account: '1930', debit: 50_000, credit: 0 },
      { account: '8310', debit: 0, credit: 50_000 },
    ])

    const rr = getIncomeStatement(db, fyId)
    expect(rr.netResult).toBe(50_000) // only financial income
  })

  it('BR balanserar efter fix', () => {
    bookEntry('2025-03-01', [
      { account: '1930', debit: 10_000_000, credit: 0 },
      { account: '3002', debit: 0, credit: 10_000_000 },
    ])
    bookEntry('2025-06-30', [
      { account: '8410', debit: 500_000, credit: 0 },
      { account: '1930', debit: 0, credit: 500_000 },
    ])

    const br = getBalanceSheet(db, fyId)
    expect(br.balanceDifference).toBe(0)
  })
})
```

**1 all-consumers-identical-test:**

```ts
describe('F19 permanent vakt', () => {
  it('alla 4 konsument-vägar ger identisk netResult', () => {
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

    const summary = calculateResultSummary(db, fyId)
    const viaReExport = calculateNetResult(db, fyId)
    const rr = getIncomeStatement(db, fyId)
    const br = getBalanceSheet(db, fyId)

    const consumers = new Map<string, number>([
      ['result-service.netResultOre', summary.netResultOre],
      ['opening-balance-reexport.calculateNetResult', viaReExport],
      ['getIncomeStatement.netResult', rr.netResult],
      ['getBalanceSheet.calculatedNetResult', br.equityAndLiabilities.calculatedNetResult],
    ])

    const distinctValues = new Set(consumers.values())
    expect(distinctValues.size).toBe(1)
    expect(summary.netResultOre).toBe(17_000_000)
  })
})
```

### 3.3 Kör alla tester, committa

```bash
npm test -- --run
# Förväntat: 1504 + 7 = 1511 passed
# Verifiera att S05-04 (BR balanserar) fortfarande passerar
```

Commit: `fix(F19): BR netResult via calculateResultSummary + konsistens-tester`

**Testdelta:** +7

---

## Commit 4 — data-testid för årets resultat i RR + BR

### 4.1 IncomeStatementView.tsx

Hitta rad ~130–134 i `src/renderer/components/reports/IncomeStatementView.tsx`:

```tsx
// Före:
<div className="flex justify-between border-t pt-1 text-sm font-bold">
  <span>Årets resultat</span>
  <span className="tabular-nums">
    {formatReportAmount(data.netResult)}
  </span>
</div>

// Efter:
<div className="flex justify-between border-t pt-1 text-sm font-bold">
  <span>Årets resultat</span>
  <span
    className="tabular-nums"
    data-testid="arets-resultat-value"
    data-raw-ore={String(data.netResult)}
  >
    {formatReportAmount(data.netResult)}
  </span>
</div>
```

### 4.2 BalanceSheetView.tsx

Hitta rad ~140–141 i `src/renderer/components/reports/BalanceSheetView.tsx`:

```tsx
// Före:
<span className="tabular-nums">
  {formatReportAmount(equityAndLiabilities.calculatedNetResult)}
</span>

// Efter:
<span
  className="tabular-nums"
  data-testid="arets-resultat-br-value"
  data-raw-ore={String(equityAndLiabilities.calculatedNetResult)}
>
  {formatReportAmount(equityAndLiabilities.calculatedNetResult)}
</span>
```

### 4.3 Uppdatera E2E data-testid whitelist

Lägg till i `tests/e2e/README.md` under whitelist:

```
- `arets-resultat-value` — Årets resultat i resultaträkningen (RR)
- `arets-resultat-br-value` — Årets resultat i balansräkningen (BR)
```

### 4.4 Kör tester, committa

```bash
npm test -- --run
# Förväntat: 1511 passed (inga nya tester, inga regressioner)
```

Commit: `feat: data-testid för årets resultat i RR + BR`

**Testdelta:** +0

---

## Commit 5 — E2E RR/BR årets resultat konsistens

### 5.1 Skapa E2E-test

Skapa `tests/e2e/result-consistency.spec.ts`.

Följ befintliga E2E-mönster i `tests/e2e/full-cycle.spec.ts` och
`tests/e2e/helpers/`. Seed via IPC (window.api / window.__testApi).
Appen använder hash-router.

```ts
import { test, expect } from '@playwright/test'
import { launchApp, closeApp } from './helpers/launch-app'

test('årets resultat identisk i RR och BR', async () => {
  const { app, page } = await launchApp()

  try {
    // 1. Seed: wizard → company + fiscal year
    //    (Använd befintligt wizard-flöde eller __testApi.seed om tillgängligt)

    // 2. Seed journal entries med klass 8 via IPC
    //    bookEntry med revenue 100k, financial expense 5k, tax 10k

    // 3. Navigera till rapporter (hash-router: #/reports eller motsvarande)
    //    Klicka på resultaträkning-fliken

    // 4. Läs data-raw-ore från RR
    const rrValue = await page.getAttribute(
      '[data-testid="arets-resultat-value"]',
      'data-raw-ore'
    )

    // 5. Klicka på balansräkning-fliken

    // 6. Läs data-raw-ore från BR
    const brValue = await page.getAttribute(
      '[data-testid="arets-resultat-br-value"]',
      'data-raw-ore'
    )

    // 7. Assert identiska
    expect(rrValue).toBeTruthy()
    expect(brValue).toBeTruthy()
    expect(rrValue).toBe(brValue)
  } finally {
    await closeApp(app)
  }
})
```

**Notera:** Anpassa seed- och navigeringsmönstret till befintlig E2E-infra.
Läs `tests/e2e/full-cycle.spec.ts` och `tests/e2e/helpers/seed.ts` för
exakta API:er. Seed **måste** gå via IPC (M115), inte direkt SQL.

### 5.2 Kör E2E separat

```bash
# E2E körs separat från vitest
npx playwright test tests/e2e/result-consistency.spec.ts
```

Commit: `test(e2e): RR/BR årets resultat konsistens`

**Testdelta:** +1 (E2E, körs separat)

---

## Commit 6 — Sprint-avslut + M134

### 6.1 CLAUDE.md — lägg till M134

Lägg till efter sektion 38 (M133):

```markdown
## 39. BR årets resultat via result-service (M134)

**M134.** `getBalanceSheet()` i `report-service.ts` beräknar "årets resultat"
(den dynamiska posten under Eget kapital) via `calculateResultSummary()` från
`result-service.ts`, inte via egen filter-reduce. Detta garanterar att BR:s
"årets resultat" är identisk med RR:s bottom-line.

Historik: Före S24b använde BR `!startsWith('1') && !startsWith('2')` för att
filtrera movements och summera class 3–8. Denna beräkning var funktionellt
korrekt med nuvarande BAS-chart men bröt mot M96 (single source of truth)
och kunde divergera vid icke-standard-konton.

Invariant-test i `s24b-br-rr-consistency.test.ts` verifierar 4 konsument-vägar
(result-service direkt, re-export via opening-balance, getIncomeStatement,
getBalanceSheet) ger identisk siffra.
```

### 6.2 STATUS.md — uppdatera

Lägg till sprint-sektion:

```markdown
## Sprint 24b -- BR-result-konsistens + F4 comparator-cleanup ✅ KLAR

Session S24b. F19 (BR oberoende netResult-beräkning) och F4 (latent
lexikografisk kontonummerjämförelse). Testbaslinje: 1493 → 1512.
Ny M-princip: M134 (BR årets resultat via result-service).
Ny shared helper: compareAccountNumbers (src/shared/account-number.ts).

F19 stängd: BR:s calculatedNetResult läser nu från calculateResultSummary().
F4 stängd: 5 SQL ORDER BY + 1 localeCompare fixade med CAST/helper.

Process-finding: Stale backlog-items ska auditeras mot M-regler vid
sprint-avslut. F19 överlevde Sprint 11 (M96–M98) utan att stängas.

S24c-finding: CHECK(length(account_number) BETWEEN 4 AND 5) på accounts-
tabellen (kräver M122 table-recreate). Eskaleras om import-väg läggs till,
BAS-uppdatering ger 5-siffriga konton, eller backup-restore kringgår
validering.
```

Uppdatera test-count och "Nasta sprint"-sektion.

### 6.3 Kör slutgiltig verifiering

```bash
npm test -- --run
npm run check:m131
npm run check:m133
```

Commit: `docs: Sprint 24b klar — M134, F19 stängd, F4 stängd`

**Testdelta:** +0

---

## Stoppvillkor

- [ ] Alla 1493 baseline-tester passerar (inga regressioner)
- [ ] +19 nya tester passerar (9 comparator + 2 sortering + 7 konsistens + 1 E2E)
- [ ] M131-check passerar
- [ ] M133-check passerar
- [ ] `getBalanceSheet().calculatedNetResult === getIncomeStatement().netResult` med klass 8
- [ ] 4-konsument-Map har size 1 (permanent F19-vakt)
- [ ] E2E verifierar data-testid-kontrakt (data-raw-ore identisk RR/BR)
- [ ] fast-check property-test #4 (numerisk konsistens) passerar
- [ ] BR balanserar fortfarande (S05-04 passerar)

---

## Out of scope

- Schema-constraint CHECK(length) på accounts (→ S24c, kräver M122)
- Branded type `AccountNumber` (→ S24c)
- SIE-import (existerar inte)
- K3-stöd
- Observability-breakdown med per-bucket top_accounts
- Perf-baseline-test (result-service redan etablerad, inga rapporterade problem)
- Snapshot-tester för breakdown-struktur (redan testat via session-43)

---

## Regler

- Kör `npm test -- --run` efter varje commit. Avbryt om regressioner.
- Alla importer ska vara korrekta (dubbelkolla befintliga importer innan tillägg).
- M98: inga nya lexikografiska kontojämförelser.
- M100: strukturerade fel, inte plain Error.
- M117: nya data-testid ska läggas i whitelist.
- E2E seedar via IPC (M115), inte direkt SQL.
- Commit-ordning: 1→2→3→4→5→6. Inget commit får skippa.
