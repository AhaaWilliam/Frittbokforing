# Session S26 — B-light: 3 user-facing fixar + GitHub Actions CI

## Kontext

Projektet ar funktionellt komplett for K2-enmansbolag. 1529 vitest + 11 E2E,
135 M-principer, 0 launch-blockerare. Reflektions-session beslutade B-light:
fixa 3 user-facing buggar + satt upp CI. Inget annat — ingen Fas 6-rensning,
ingen TSC strict-cleanup, inga nya M-principer.

**Testbaslinje:** 1529 vitest passed, 2 skipped.
**Mal:** ~1545+ efter sessionen.

---

## 0. Pre-flight

Innan implementation, verifiera baseline:

```bash
npm run test        # 1529 passed, 2 skipped
npm run lint        # rent
npm run check:m131  # rent
npm run check:m133  # rent
npm run build       # rent
```

LIKE-audit (bekrafta 4 user-input-sajter):
```bash
rg -n "LIKE" src/main/services/ --type ts
```

Forvantade user-input-traffar (de enda som behover fixas):
1. `invoice-service.ts:786` — `LIKE '%' || ? || '%'`
2. `expense-service.ts:1116` — `LIKE '%' || ? || '%'`
3. `product-service.ts:30` — `LIKE ?` med `%${search}%`
4. `counterparty-service.ts:42` — `LIKE ?` med `%${search}%`

Hardkodade (safe, ror dem inte):
- `fiscal-service.ts:228` — `LIKE '%arets resultat%'`
- `db.ts:86` — `LIKE 'sqlite_%'`

Om fler user-input-traffar hittas: utoka scope.

---

## Del 1: F35 — ExpenseLineRow quantity min=0 -> min=1

**Problem:** HTML-input tillater qty=0 visuellt. Backend Zod fangar det redan
(`z.number().int().min(1)` i bade form-schema och IPC-schema), men HTML `min`
attributet ar `0`. Enrads-HTML-fix.

**M130 ager semantiken:** Expense quantity = heltal >= 1. Decimaler ar forbjudna
(till skillnad fran invoices). Andra INTE step/min till decimaler.

**Filandringar:**

`src/renderer/components/expenses/ExpenseLineRow.tsx:67`
```
min={0}  ->  min={1}
```

**Test:**

Utoka `tests/renderer/components/expenses/ExpenseLineRow.test.tsx` (existerar,
har fixturer + renderWithProviders-setup). Lagg till:

```ts
it('quantity input has min=1 (M130: expense qty integer >= 1)', () => {
  render(...)
  const input = screen.getByLabelText('Antal')
  expect(input).toHaveAttribute('min', '1')
})
```

**Commit:** `fix(F35): expense line quantity min=1`

---

## Del 2: F38 — ManualEntryForm diff-riktning

**Problem:** `Math.abs(diff)` tar bort teckeninformation. Anvandaren ser beloppet
men inte om debet > kredit eller tvartom.

**Dataflode:**
- `parseSwedishAmount(l.debitKr)` returnerar **ore** (heltal)
- `diff = totalDebit - totalCredit` (ore, signed)
- `formatKr(ore)` konverterar till kronor for visning
- Positivt diff = debet overskott, negativt = kredit overskott

**Fil:** `src/renderer/components/manual-entries/ManualEntryForm.tsx:340-349`

**Nuvarande:**
```tsx
{formatKr(Math.abs(diff))}
```

**Andringsforslag — visa riktning i klartext:**
```tsx
{diff === 0
  ? formatKr(0)
  : diff > 0
    ? `${formatKr(diff)} (debet > kredit)`
    : `${formatKr(Math.abs(diff))} (kredit > debet)`}
```

Behalll `Math.abs()` for det negativa fallet sa att formatKr far ett positivt
ore-varde. Fargkodning oforandrad (gron vid 0, rod annars).

**Teststrategi:**

ManualEntryForm kraver tunga providers (QueryClient, FiscalYearProvider,
HashRouter, mock IPC for company:get + account:list). Att rendera hela
formularet i vitest ar mojligt men tungt.

**Rekommendation: extrahera berakningslogik till ren funktion.**

Skapa `src/renderer/lib/manual-entry-calcs.ts`:
```ts
import { parseSwedishAmount } from './form-schemas/manual-entry'
import type { ManualEntryLineForm } from './form-schemas/manual-entry'

export function calculateManualEntryTotals(lines: ManualEntryLineForm[]) {
  const totalDebit = lines.reduce((sum, l) => sum + parseSwedishAmount(l.debitKr), 0)
  const totalCredit = lines.reduce((sum, l) => sum + parseSwedishAmount(l.creditKr), 0)
  return { totalDebit, totalCredit, diff: totalDebit - totalCredit }
}

export function formatDiffLabel(diff: number): { text: string; balanced: boolean } {
  if (diff === 0) return { text: '', balanced: true }
  return {
    text: diff > 0 ? 'debet > kredit' : 'kredit > debet',
    balanced: false,
  }
}
```

ManualEntryForm.tsx importerar och anvandar dessa istallet for inline-berakning.

**Testfil:** `tests/renderer/lib/manual-entry-calcs.test.ts` (ren funktionstest,
inga providers):

```
calculateManualEntryTotals:
- Tom array -> { totalDebit: 0, totalCredit: 0, diff: 0 }
- Balanserad -> diff === 0
- Debet-tung -> diff > 0 (ore)
- Kredit-tung -> diff < 0 (ore)

formatDiffLabel:
- diff=0 -> { text: '', balanced: true }
- diff=50000 -> { text: 'debet > kredit', balanced: false }
- diff=-50000 -> { text: 'kredit > debet', balanced: false }
```

**Commit:** `fix(F38): manual entry diff direction indicator`

---

## Del 3: F8 — LIKE-pattern escaping

**Problem:** Soktermer med `%` eller `_` tolkas som SQL-wildcards.

### Steg A: Helper

Skapa `src/shared/escape-like.ts`:
```ts
/**
 * Escape SQL LIKE wildcards so %, _ and the escape char itself
 * are matched literally. Use with ESCAPE '!' in SQL.
 */
export const LIKE_ESCAPE_CHAR = '!'

export function escapeLikePattern(s: string): string {
  return s.replace(/[!%_]/g, '!$&')
}
```

Anvand `!` som escape-tecken (inte `\`) — undviker JS string-escaping-forvirring.
SQLite stodjer godtyckligt escape-tecken via `ESCAPE`-klausul.

### Steg B: Migrera 4 services

**Mönster 1** — invoice-service + expense-service (SQL-concat med `||`):

invoice-service.ts:784-789 — fore:
```ts
conditions.push(
  "(c.name LIKE '%' || ? || '%' OR CAST(i.invoice_number AS TEXT) LIKE '%' || ? || '%')"
)
params.push(input.search, input.search)
```

efter:
```ts
const escaped = escapeLikePattern(input.search)
conditions.push(
  "(c.name LIKE '%' || ? || '%' ESCAPE '!' OR CAST(i.invoice_number AS TEXT) LIKE '%' || ? || '%' ESCAPE '!')"
)
params.push(escaped, escaped)
```

Samma monster for expense-service.ts:1114-1119 (3 LIKE-uttryck, 3 ESCAPE).

**Mönster 2** — product-service + counterparty-service (JS-wrapping):

product-service.ts:29-33 — fore:
```ts
sql += ' AND (name LIKE ? OR description LIKE ?)'
const term = `%${input.search}%`
```

efter:
```ts
sql += " AND (name LIKE ? ESCAPE '!' OR description LIKE ? ESCAPE '!')"
const term = `%${escapeLikePattern(input.search)}%`
```

Samma monster for counterparty-service.ts:41-45 (3 LIKE-uttryck, 3 ESCAPE).

### Steg C: Tester

**Unit-test:** `tests/escape-like.test.ts`
```
escapeLikePattern:
- '' -> ''
- 'hello' -> 'hello'
- '50%' -> '50!%'
- 'foo_bar' -> 'foo!_bar'
- '!' -> '!!'
- '50% rabatt_special!' -> '50!% rabatt!_special!!'
- 'aao' -> 'aao' (svenska tecken oforandrade)
```

**Integrations-test:** Utoka `tests/session-5a.test.ts` (testar redan
counterparty search) eller skapa `tests/s26-like-escaping.test.ts`:
- Skapa counterparty med namn `'50% Rabatt AB'`
- Skapa counterparty med namn `'Helt Annat AB'`
- Sok `'50%'` → returnerar BARA `'50% Rabatt AB'` (inte alla)
- Sok `'foo_bar'` → returnerar tom (literal match, inga wildcards)

Testa minst 2 av 4 services (en fran varje monster).

### Steg D: Arkitektur-vakt (valfri)

Skapa `tests/infra/like-escape-audit.test.ts` som grepar `src/main/services/`
for `LIKE ?` och `LIKE '%'` utan `ESCAPE` pa samma rad. Failar om nagon
user-input LIKE saknar ESCAPE. Hardkodade (fiscal-service, db.ts) undantas
med kommentar `// like-exempt: hardcoded pattern`.

**Commit:** `fix(F8): escape LIKE wildcards in search queries`

(En commit for hela F8 — helper + 4 services + tester. Atomart: alla
services andras samtidigt sa att ingen inkonsistens uppstar mellan commits.)

---

## Del 4: GitHub Actions CI

### Nya filer

**`.node-version`:**
```
20
```

**`.github/workflows/ci.yml`:**
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: '.node-version'
          cache: 'npm'
      - run: npm ci
        # postinstall kör electron-rebuild automatiskt
      - run: npm run lint
      - run: npm run check:m131
      - run: npm run check:m133
      - run: npm run test -- --reporter=verbose
      - run: npm run build
```

### Design-beslut (dokumentera i commit-message):

**Enbart ubuntu-latest.**  macOS/Windows-matrix laggs till efter att
ubuntu ar stabilt gront (better-sqlite3 native rebuild kan vara instabilt
cross-platform). Startar smalt, breddar vid behov.

**Inget `npm run typecheck` (tsc --noEmit).** Scriptet existerar inte i
package.json. 91 pre-existing TSC strict-fel gor att det blockerar CI.
Lagg till nar TSC-skulden ar stangd.

**Ingen `electron-rebuild` i CI-steg.** `postinstall` i package.json kör
`electron-rebuild -f -w better-sqlite3` automatiskt vid `npm ci`.

**Ingen E2E.** Kraver xvfb + electron display — separat workflow senare.

**Ingen coverage-upload.** vitest.config.ts har ingen coverage-konfiguration.

**`npm run test` inkluderar system + security.** vitest include-pattern:
`tests/**/*.test.ts` + `tests/**/*.test.tsx` — alla testfiler kors.

**Commit:** `ci: add GitHub Actions workflow (test + lint + build)`

---

## Del 5: STATUS.md-uppdatering

Uppdatera STATUS.md (intern sprint-tracker, INTE publik README):
- Ny rubrik: `## Sprint 26 -- B-light: user-facing fixar + CI ✅ KLAR`
- Stang F35, F38, F8 i backlog-sektionen
- Uppdatera testbaslinje
- Notera CI-etablering under "Known infrastructure contracts"
- Uppdatera "Kanda fynd" — ta bort F8/F35/F38, kvarstaende: 7 oppna (1 gul F39, 6 gron Fas 6)

(STATUS.md ar intern. Publik README ar ett separat framtida arbete.)

**Commit:** `docs: Sprint 26 klar — F35, F38, F8 stangda, CI etablerad`

---

## Verifiering (innan sista commit)

```bash
npm run test          # baseline + nya tester, 0 failures
npm run lint          # rent
npm run check:m131    # rent
npm run check:m133    # rent
npm run build         # rent
```

Manuell verifiering (dev-server):
- ExpenseForm: quantity-input accepterar inte 0
- ManualEntryForm: skapa obalanserat verifikat, se riktningstext
- Sok fakturor/kostnader med `%` i sokfalt: literal match

---

## Commit-plan (5 commits)

| # | Commit | Scope |
|---|--------|-------|
| 1 | `fix(F35): expense line quantity min=1` | ExpenseLineRow + 1 test |
| 2 | `fix(F38): manual entry diff direction indicator` | ManualEntryForm + manual-entry-calcs.ts + ~6 tester |
| 3 | `fix(F8): escape LIKE wildcards in search queries` | escape-like.ts + 4 services + ~10 tester + arkitektur-vakt |
| 4 | `ci: add GitHub Actions workflow (test + lint + build)` | ci.yml + .node-version |
| 5 | `docs: Sprint 26 klar — F35, F38, F8 stangda, CI etablerad` | STATUS.md |

Varje commit maste passera: `npm run test && npm run lint && npm run build`

---

## Ordning

Del 1 -> 2 -> 3 -> 4 -> 5 med commit efter varje del.
Del 1 ar snabbast (1 rad + 1 test). Del 2 kraver extraktion men ar isolerad.
Del 3 har flest filandringar men ar mekaniskt. Del 4 ar ny fil. Del 5 dokumentation.

---

## Out of scope (explicit)

- TSC strict-cleanup (91 fel) — egen session
- Playwright E2E i CI — egen workflow
- Fas 6 cleanup (F7, F10, F13, F20, F25, F28, F39) — post-launch
- Code signing / Apple Developer — parallellt spar
- Nya M-principer — behövs inte for dessa fixar
- Lint-glob-fix (.tsx testfiler) — tangentiell, egen commit om tid over
- Public README — separat fran STATUS.md
