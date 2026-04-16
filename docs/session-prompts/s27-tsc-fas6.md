# Session S27 — TSC strict-cleanup + Fas 6 cleanup

## Kontext

Projektet ar funktionellt komplett for K2-enmansbolag. 1550 vitest + 11 E2E,
135 M-principer, 0 launch-blockerare. Sprint 26 stangde 3 user-facing buggar
och etablerade CI. Denna sprint rensar all teknisk skuld: 37 tsc-fel + 5 oppna
Fas 6-findings. Resultatet: 0 tsc-fel, 0 oppna findings, typecheck i CI.

**Testbaslinje:** 1550 vitest passed, 2 skipped.
**Mal:** ~1560+ efter sessionen.

---

## 0. Pre-flight

```bash
npm run test        # 1550 passed, 2 skipped
npm run lint        # pre-existing prettier-errors (okej)
npm run check:m131  # rent
npm run check:m133  # rent
npm run build       # rent
npx tsc --noEmit    # 37 fel (baslinjen vi ska nollstalla)
```

---

## Del 1: TSC strict — Kategori A (24 fel, 1 fix)

**Problem:** `useEntityForm` constraintar TForm med `Record<string, unknown>`.
TypeScript interfaces utan index signature satisfierar inte detta. 24 fel i
6 testfiler plus formreturntypen.

**Fil:** `src/renderer/lib/use-entity-form.ts`

**Andring — 3 stallen:**

Rad 6:
```
TForm extends Record<string, unknown>,
```
-> 
```
TForm extends Record<string, unknown> & object,
```

AVBRYT. Enklare approach: lagg till index signature paa constraint-sidan.
Safest fix: andra constraints till att anvanda en utility type.

**Rekommenderad fix:**

Rad 6, 26, 46 — alla tre stallen dar `TForm extends Record<string, unknown>`:
```ts
// Fore:
TForm extends Record<string, unknown>

// Efter:
TForm extends { [key: string]: unknown }
```

Alternativ B (om A inte fixar alla 24): andra test-interfaces istallet.
I varje testfil som definierar t.ex. `interface SimpleForm { name: string }`,
andra till `interface SimpleForm { name: string; [key: string]: unknown }`.

**Val:** Testa Alternativ A forst — om `{ [key: string]: unknown }` i
use-entity-form.ts resolver alla 24, ar det en enrads-andring pa 3 stallen.
Om inte, fall tillbaka till Alternativ B (12 edits i testfiler).

**VIKTIGT:** Kolla att alla 1550 befintliga tester fortfarande passerar efter
andringen. `useEntityForm` anvands av InvoiceForm, ExpenseForm, ManualEntryForm,
CounterpartyForm, CompanyForm, ProductForm — alla maste fungera.

**Verifiering:**
```bash
npx tsc --noEmit 2>&1 | grep "TS2344\|TS2322" | wc -l
# Mal: 0 (fran 24)
npm run test  # alla passerar
```

---

## Del 2: TSC strict — Kategori B (8 fel)

**Problem:** Casts fran `ElectronAPI` till `Record<string, ...>` failar
eftersom ElectronAPI saknar index signature.

**Filer och rader:**

1. `tests/infra/mock-ipc.test.ts` — rad 15, 25, 33, 49
2. `tests/renderer/contexts/FiscalYearContext.test.tsx` — rad 70, 180
3. `tests/setup/mock-ipc.ts` — rad 212, 247

**Andring — samma monster overallt:**

```ts
// Fore:
const api = window.api as Record<string, (...)  => Promise<unknown>>

// Efter:
const api = window.api as unknown as Record<string, (...) => Promise<unknown>>
```

For `tests/setup/mock-ipc.ts` rad 212, 247 (Window-cast):
```ts
// Fore:
(window as Record<string, unknown>)

// Efter:
(window as unknown as Record<string, unknown>)
```

**Verifiering:**
```bash
npx tsc --noEmit 2>&1 | grep "TS2352" | wc -l
# Mal: 0 (fran 8)
```

---

## Del 3: TSC strict — Kategori C-F (5 fel)

### C: axeResults null-check (2 fel)

**Fil:** `tests/helpers/render-with-providers.tsx` rad 136-137

```tsx
// Fore (rad 136-137 ar inuti if-blocket men tsc ser dem utanfor):
if (axeResults.violations.length > 0) {
  const msg = axeResults.violations

// Kolla kontexten: axeResults ar deklarerad som `let axeResults: AxeResults | null = null`
// och tilldelad inuti `if (axeCheck)`. TSC ser inte att rad 136 bara nås
// inuti if-blocket dar axeResults ar tilldelad.
```

**Fix:** Redan inuti `if (axeCheck)` sa vi vet att axeResults != null efter
`await axe.run(...)`. Lagg till non-null assertion eller guard:

```tsx
// Enklast: lagg till guard (inga utropstecken)
if (axeCheck) {
  axeResults = await axe.run(result.container, AXE_OPTIONS)
  if (axeResults && axeResults.violations.length > 0) {
```

### D: Saknad payment_id i test-mock (1 fel)

**Fil:** `tests/renderer/components/ui/dialog-a11y.test.tsx` rad 60

```tsx
// Fore:
succeeded: [{ id: 1, journal_entry_id: 10 }],

// Efter:
succeeded: [{ id: 1, payment_id: 1, journal_entry_id: 10 }],
```

Typen kraver `{ id: number; payment_id: number; journal_entry_id: number }`.

### E: Stale test-property class_filter (1 fel)

**Fil:** `tests/s24b-f4-sorting.test.ts` rad 120

```ts
// Fore:
const accounts = listAccounts(db, { fiscal_rule: 'K2', class_filter: 3 })

// listAccounts signatur ar:
// input: { fiscal_rule: 'K2' | 'K3'; class?: number; is_active?: boolean }
// Propertyn heter `class`, inte `class_filter`.

// Efter:
const accounts = listAccounts(db, { fiscal_rule: 'K2', class: 3 })
```

### F: Felaktig ErrorCode literal (1 fel)

**Fil:** `tests/renderer/lib/use-entity-form.test.tsx` rad 246

```ts
// Fore:
new IpcError('E-post finns redan', 'DUPLICATE_ERROR', 'email')

// 'DUPLICATE_ERROR' finns inte i ErrorCode-union. Narmaste:
// 'DUPLICATE_ORG_NUMBER', 'DUPLICATE_NAME', 'DUPLICATE_SUPPLIER_INVOICE', etc.
// Testet testar IpcError-falt-mappning, inte specifik felkod.

// Efter — anvand en giltig ErrorCode:
new IpcError('E-post finns redan', 'DUPLICATE_NAME', 'email')
```

**Verifiering:**
```bash
npx tsc --noEmit 2>&1 | wc -l
# Mal: 0
```

---

## Del 4: Lagg till typecheck i CI

### 4a: package.json script

Lagg till i `"scripts"`:
```json
"typecheck": "tsc --noEmit"
```

### 4b: CI-workflow

Uppdatera `.github/workflows/ci.yml` — lagg till steget **efter** lint, **fore** test:
```yaml
      - run: npm run typecheck
```

**Commit Del 1-4:** `fix: resolve all 37 tsc strict errors + add typecheck to CI`

---

## Del 5: F39 — Dokumentera _kr-suffix-konvention

**Problem:** M119 kraver `_ore`-suffix for alla SQLite INTEGER-kolumner med
pengar. Renderer form-schemas anvander `_kr`-suffix (t.ex. `unit_price_kr`).
Konventionen ar avsiktlig men odokumenterad.

**Fix — lagg till i CLAUDE.md efter nuvarande regel 25 (M119):**

```markdown
## XX. Renderer form-types anvander _kr-suffix for visningstabeller (MXXX)

**MXXX.** Form-types (`*Form`-suffix i `src/renderer/lib/form-schemas/`)
anvander `_kr`-suffix for prisfalt (t.ex. `unit_price_kr`). Anvandaren
matar in kronor; konvertering till ore sker i form-transformern vid submit.
`_kr`-data far ALDRIG korsa IPC-gransen — IPC-scheman anvander uteslutande
`_ore`-suffix. Denna konvention kompletterar M119 (ore i SQLite) med
renderer-sidans spegelbild.
```

MXXX-numret bestams vid skrivning (nasta lediga efter M135 = M136).

**Test:** Inget — ren dokumentation.

**Commit:** `docs(M136): document _kr suffix convention for form types`

---

## Del 6: F28 — SIE5 serie-labels

**Problem:** `sie5-export-service.ts:376-380` har felaktiga serie-namn.

Serie-anvandning i kodbasen:
- **A** = Kundfakturor (invoice-service: `verification_series = 'A'`) — KORREKT
- **B** = Leverantorsfakturor (expense-service: `verification_series = 'B'`) — KORREKT
- **C** = Manuella verifikationer (manual-entry-service) + aret resultat (fiscal-service) — **FEL i SIE5: star som 'Betalningar'**
- **O** = Ingaende balanser (opening-balance-service: `verification_series = 'O'`) — **SAKNAS helt**

Notera: Betalningar (payInvoice/payExpense) anvander serie A resp B — inte C.
Serie C ar manuella verifikationer.

**Fil:** `src/main/services/sie5/sie5-export-service.ts`

**Andring rad 376-380:**

```ts
// Fore:
const seriesNames: Record<string, string> = {
  A: 'Kundfakturor',
  B: 'Leverantörsfakturor',
  C: 'Betalningar',
}

// Efter:
const seriesNames: Record<string, string> = {
  A: 'Kundfakturor',
  B: 'Leverantörsfakturor',
  C: 'Manuella verifikationer',
  O: 'Ingående balanser',
}
```

**Test:** Kolla om det finns SIE5-exporttester som assertar serie-namn. Om ja,
uppdatera. Om nej, lagg till ett enkelt test som verifierar att
`seriesNames.C === 'Manuella verifikationer'` och `seriesNames.O` existerar.

Greppstrategi:
```bash
rg "seriesNames\|Serie [A-Z]" tests/ --type ts
```

Kontrollera ocksa SIE4 (`sie4-export-service.ts`) for samma problem.

**Commit:** `fix(F28): correct SIE5 verification series labels`

---

## Del 7: F20 — VAT-report SQL bind variables

**Problem:** `vat-report-service.ts:91-114` interpolerar `${VAT_OUT_25_ACCOUNT}`
etc. direkt i SQL-strang. Ingen SQL-injection-risk (hardkodade konstanter),
men bryter mot projektkonventionen om parameteriserade queries.

**Fil:** `src/main/services/vat-report-service.ts`

**Andring:** Ersatt template literals med bind-variabler.

Konstanterna anvands 8 ganger i queryn:
- 4x i CASE WHEN (en per momskonto)
- 4x i WHERE IN

**Fore (rad 87-118):**
```sql
CASE WHEN jel.account_number = '${VAT_OUT_25_ACCOUNT}' THEN ... END
...
AND jel.account_number IN ('${VAT_OUT_25_ACCOUNT}', ...)
```

**Efter:**
```sql
CASE WHEN jel.account_number = ? THEN ... END
...
AND jel.account_number IN (?, ?, ?, ?)
```

Med `.all()`:
```ts
// Fore:
.all(fiscalYearId) as VatDataRow[]

// Efter (4 CASE + 4 IN + 1 fiscal_year_id = 9 params):
.all(
  VAT_OUT_25_ACCOUNT, VAT_OUT_12_ACCOUNT, VAT_OUT_6_ACCOUNT, VAT_IN_ACCOUNT,
  fiscalYearId,
  VAT_OUT_25_ACCOUNT, VAT_OUT_12_ACCOUNT, VAT_OUT_6_ACCOUNT, VAT_IN_ACCOUNT,
) as VatDataRow[]
```

**VIKTIGT:** Ordningen pa bind-parametrarna maste matcha fragemarkens ordning
i queryn. CASE WHEN-parametrarna kommer forst (4 st), sedan WHERE-parametrar
(fiscalYearId + 4 IN-parametrar). Las queryn noggrant for att matcha ratt.

**Test:** Befintliga VAT-tester (`tests/s25-vat-parity.test.ts`,
`tests/session-7-vat.test.ts`) ska fortsatt passera utan andring.

**Commit:** `refactor(F20): use bind variables in VAT report SQL`

---

## Del 8: F7 — Oanvand tabell + payment_terms naming

### 8a: DROP verification_sequences

Tabellen skapades i migration 005 men anvands aldrig. All verifikatnumrering
gar via `MAX(verification_number) + 1`. Enda referensen utanfor migration ar
ett TODO i company-service.ts:181 och en INSERT i test-handlers.ts:109.

**Ny migration** (nasta lediga nummer — kolla `PRAGMA user_version`):

```sql
DROP TABLE IF EXISTS verification_sequences;
```

Ta bort TODO-kommentaren i company-service.ts:181.
Ta bort INSERT i test-handlers.ts:109 (om den anvands for seed — kontrollera).

**Risk:** Ingen. Tabellen har inga FK-referenser fran andra tabeller.

### 8b: Rename payment_terms_days -> payment_terms

Kolumnen `counterparties.payment_terms_days` ar inkonsistent med
`invoices.payment_terms` och `expenses.payment_terms`.

**Alternativ A: ALTER TABLE RENAME COLUMN** (enklast, SQLite >= 3.25):
```sql
ALTER TABLE counterparties RENAME COLUMN payment_terms_days TO payment_terms;
```

**Alternativ B: Table recreate** (om ALTER inte fungerar).

counterparties-tabellen HAR inkommande FK fran invoices och expenses
(se M122-listan i CLAUDE.md). Men RENAME COLUMN ar INTE en table-recreate —
SQLite hanterar det in-place sedan 3.25.0. Verifiera att better-sqlite3
bundlar SQLite >= 3.25:

```bash
node -e "const db = require('better-sqlite3')(':memory:'); console.log(db.pragma('compile_options'))"
```

**Filandringar efter rename:**
- `counterparty-service.ts:82` — `payment_terms_days` i INSERT → `payment_terms`
- `counterparty-service.ts:157` — uppdatera kolumnnamn
- `counterparty-service.ts:165` — ta bort mapping-entry
- `counterparty-service.ts:11-19` — mapRow kan forenklas (ingen payment_terms_days-mapping)
- `test-handlers.ts` — om den seedar counterparties, uppdatera kolumnnamn

**Test:** Befintliga counterparty-tester ska passera. Lagg till smoke-test
i migrationen som verifierar att kolumnen heter `payment_terms`.

**Commit:** `refactor(F7): drop unused verification_sequences + rename payment_terms_days`

---

## Del 9: F25 — getUsedAccounts scope

**Problem:** `getUsedAccounts` returnerar alla aktiva konton, inte bara
anvanda, pga `OR a.is_active = 1` i queryn.

**Fil:** `src/main/services/export/export-data-queries.ts:148-158`

**Fore:**
```sql
WHERE a.account_number IN (
  SELECT DISTINCT jel.account_number
  FROM journal_entry_lines jel
  JOIN journal_entries je ON jel.journal_entry_id = je.id
  WHERE je.fiscal_year_id = ? AND je.status = 'booked'
)
OR a.is_active = 1
ORDER BY CAST(a.account_number AS INTEGER)
```

**SIE-spec-analys forst!** Innan andring, kontrollera:

1. **SIE4-spec**: Kraver `#KONTO` for alla konton i kontoplanen, eller bara
   anvanda? Las SIE4-standarden eller kontrollera hur sie4-export-service.ts
   anvander `accounts`-arrayen.
2. **SIE5-spec**: Samma fraga.

**Om SIE kraver full kontoplan:**
Splitta till tva funktioner:
```ts
// Bara anvanda konton (for #RES, #IB, #UB)
export function getUsedAccounts(db, fyId): AccountInfo[]

// Hela kontoplanen (for #KONTO)
export function getChartOfAccounts(db, fyId): AccountInfo[]
```

**Om SIE tillater enbart anvanda konton:**
Ta bort `OR a.is_active = 1`.

**Konsumenter att uppdatera:**
- `sie4-export-service.ts:55` — anvander accounts for bade #KONTO och #RES/#IB
- `sie5-export-service.ts:119` — anvander accounts for Accounts-sektion
- `excel-export-service.ts:82` — anvander accounts for Kontoplan-flik

Las respektive export-service for att forsta vilka som behover full kontoplan
vs bara anvanda konton.

**Test:** Skapa integration-test som:
1. Skapar fiscal year med bokning pa konto 3010 och 4010
2. Anropar getUsedAccounts
3. Verifierar att BARA 3010 och 4010 returneras (inte alla ~500 aktiva konton)

**Commit:** `fix(F25): getUsedAccounts returns only booked accounts`

---

## Del 10: Uppdatera bug-backlog.md + STATUS.md

### bug-backlog.md

Uppdatera Fas 6-raden (rad 15):
```
- Fas 6: F7, F8, F10, F13, F14, F20, F25, F28, F35, F38 → pending
```
->
```
- Fas 6: ✅ KLAR (F7 S27, F20 S27, F25 S27, F28 S27 | F8 S26, F10 S57, F13 S60, F14 stale-closed, F35 S26, F38 S26)
```

### STATUS.md

Ny rubrik:
```
## Sprint 27 -- TSC strict + Fas 6 cleanup ✅ KLAR
```

Innehall:
- TSC: 37 -> 0 fel, typecheck i CI
- F39, F28, F20, F7, F25 stangda
- Ny M-princip: M136
- Testbaslinje: 1550 -> XXXX
- Backlog: 0 oppna findings

**Commit:** `docs: Sprint 27 klar — 0 tsc-fel, 0 oppna findings`

---

## Verifiering (innan sista commit)

```bash
npx tsc --noEmit     # 0 fel
npm run test          # baseline + nya tester, 0 failures
npm run lint          # pre-existing prettier (okej)
npm run check:m131    # rent
npm run check:m133    # rent
npm run build         # rent
```

---

## Commit-plan (7 commits)

| # | Commit | Scope |
|---|--------|-------|
| 1 | `fix: resolve all 37 tsc strict errors + add typecheck to CI` | use-entity-form.ts, 12 testfiler, ci.yml, package.json |
| 2 | `docs(M136): document _kr suffix convention for form types` | CLAUDE.md |
| 3 | `fix(F28): correct SIE5 verification series labels` | sie5-export-service.ts + test |
| 4 | `refactor(F20): use bind variables in VAT report SQL` | vat-report-service.ts |
| 5 | `refactor(F7): drop unused verification_sequences + rename payment_terms_days` | migration + counterparty-service.ts + tester |
| 6 | `fix(F25): getUsedAccounts returns only booked accounts` | export-data-queries.ts + konsumenter + tester |
| 7 | `docs: Sprint 27 klar — 0 tsc-fel, 0 oppna findings` | STATUS.md + bug-backlog.md |

Varje commit maste passera: `npm run test && npx tsc --noEmit && npm run build`

---

## Ordning

Del 1 -> 2 -> 3 -> 4 (alla TSC, en commit)
-> Del 5 (F39, trivial)
-> Del 6 (F28, trivial)
-> Del 7 (F20, mekanisk)
-> Del 8 (F7, kraver migration)
-> Del 9 (F25, kraver SIE-spec-analys)
-> Del 10 (docs)

Del 1 ar hog-leverage (24 fel pa en fix). Del 9 ar mest komplex (SIE-spec-beroende).

---

## Out of scope (explicit)

- Nya features
- E2E i CI (separat workflow, Sprint 28)
- Prettier-fix av pre-existing formatering
- Code signing (Sprint 29)
- Release workflow (Sprint 28)
- README (Sprint 30)
