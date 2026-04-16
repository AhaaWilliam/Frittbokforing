# Sprint 34 — Cross-FY + FTS5-utvidgning + Kronologi + Renderer-tester

## Kontext

Sprint 33 levererade B6 (FTS5 indexed search), F46b (quantity-CHECK),
F57 (mock-IPC shape-validering), TD-sweep (M119-rename, E03, F49-b).
S33 etablerade `search_index` FTS5-tabell med `unicode61 remove_diacritics 2`,
full rebuild vid startup + efter writes, FTS5-first med LIKE-fallback.

Denna sprint har fyra leveranser:
1. **B7** — Cross-FY betalning (unblock S01-05 + expense-paritet)
2. **B8** — Kronologisk datumordning inom verifikationsserie (unblock S01-06)
3. **B9** — FTS5-utvidgning for fakturor och kostnader
4. **T1** — Renderer-komponenttester (ManualEntryList, PaymentDialog, BulkPaymentDialog)

**Testbaslinje:** Faststalls efter S33-stangning (uppskattning: ~1784 passed, 2 skipped).
**Mal:** ~1845+ passed, 0 skipped.
**PRAGMA user_version vid sprint-start:** 33 (efter S33). Slut: 33 (oforandrat).

---

## Relevanta M-principer (inline-sammanfattning)

- **M14:** Alla data-queries scopas till aktivt fiscal_year_id. UNDANTAG: stamdata.
- **M93-M95:** Atomicitet for fiscal year-operationer, FY-overlapp-skydd.
- **M100:** Services kastar strukturerade `{ code, error, field? }`.
- **M110-M111:** Bankavgifter vid betalning — avgiften paverkar bankraden, inte fordran/skuld.
- **M112-M114:** Bulk-betalningar — savepoints, batch-vard, cancelled-guard.
  `_payExpenseTx` stodjer `skipChronologyCheck: boolean`.
- **M118:** Opening balance entries undantagna fran immutability-triggers 1-5.
- **M126:** Batch bank-fee — hel avgift per batch, inte proportionell.
- **M128:** Handler error-patterns: direkt delegation eller `wrapIpcHandler()`.
- **M130:** Invoice vs Expense quantity-semantik (REAL vs INTEGER).
- **M140:** Korrigeringsverifikat — en-gangs-las.

---

## 0. Pre-flight

```bash
npm run test        # ~1784 passed, 2 skipped
npm run typecheck   # 0 errors
npm run check:m131  # rent
npm run check:m133  # rent
npm run build       # rent
```

---

## Kritiska design-beslut

### D1 — Cross-FY betalning: verifierad arkitekturanalys

**Problem:** S01-05 testar betalning av FY2026-faktura i FY2027. Testet
ar skippad med kommentaren "requires cross-FY payment support".

**Verifierade invarianter (kodmassigt bekraftade):**

| Invariant | Status | Bevis |
|-----------|--------|-------|
| FY deriveras fran payment_date | ✓ | `_payInvoiceTx`/`_payExpenseTx`: `SELECT id FROM fiscal_years WHERE start_date <= ? AND end_date >= ?` |
| Verifikationsnummer per FY+serie | ✓ | `SELECT MAX(verification_number)+1 WHERE fiscal_year_id = ? AND verification_series = ?` |
| Period-stangning mot paymentYear | ✓ | `SELECT is_closed FROM accounting_periods WHERE fiscal_year_id = ?` |
| createNewFiscalYear skapar perioder | ✓ | `generatePeriods()` → 12 INSERT accounting_periods |
| createNewFiscalYear skapar OB (O-serie) | ✓ | `createOpeningBalance(db, newFyId, previousFyId)` → 1510-saldo overfors |
| createNewFiscalYear stanger FY2026 | ✓ | `UPDATE fiscal_years SET is_closed = 1` (atomart sista steg) |
| S01-05 API-signatur matchar | ✓ | Alla 4 parametrar identiska med nuvarande `createNewFiscalYear(db, companyId, prevFyId, bookResult?)` |
| `calculateNetResult` finns och exporteras | ✓ | Re-export fran result-service via opening-balance-service |

**Slutsats:** Cross-FY-betalning AR implementerad. S01-05 bor ga gront
utan kodandring.

**Om hypotesen brister:** Om S01-05 INTE gar gront, analysera det
specifika felet och fixa. Potentiella problem (rangordnade):
1. Test-setup-ordning: `createNewFiscalYear` kraver att bokforingsarets
   resultat ar bokat fore stangning — testet gor detta explicit.
2. `registerCustomFunctions(db)` saknas i test-contexten — kontrollera
   att system-test-context anropar det.
3. OB-transfer kan exkludera 1510 om inga rader ar bokforda (fakturan
   maste vara finaliserad FORE createNewFiscalYear).

### D2 — Cross-FY betalning: expense-paritet

`payExpense` har kronologi-check i `_payExpenseTx` (B-serie):
```ts
if (lastEntry && input.payment_date < lastEntry.journal_date) {
  throw { code: 'VALIDATION_ERROR', error: 'Datum före senaste verifikation i B-serien.' }
}
```

Denna check ar FY-scopad (`paymentYear.id`) — FY2027:s B-serie ar tom
→ ingen blockering. Cross-FY-betalning for expenses fungerar redan.

### D3 — Kronologisk datumordning: scope och bulk-sakerhet

**Problem:** S01-06 testar att `finalizeDraft` avvisar fakturor med datum
fore senaste bokforda post i A-serien. Denna validering saknas i:
- `invoice-service.ts` `finalizeDraft`
- `expense-service.ts` `finalizeExpense`
- `manual-entry-service.ts` `finalizeManualEntry`
- `invoice-service.ts` `_payInvoiceTx`

Kronologi-check finns BARA i `_payExpenseTx` (B-serie).

**Beslut: Enforce i alla 3 finalize + _payInvoiceTx via delad helper.**

**Bulk-sakerhet (F3-vakt):**

`payInvoicesBulk` anropar `_payInvoiceTx` per rad (med savepoints).
Idag har `_payInvoiceTx` INGEN kronologi-check → ingen risk.

NÄR vi lagger till kronologi-check i `_payInvoiceTx` (B2) maste vi
ocksa lagga till `skipChronologyCheck`-parameter — EXAKT som
`_payExpenseTx` redan har (M114-paritet):

```ts
function _payInvoiceTx(
  db: Database.Database,
  input: PayInvoiceInput,
  skipChronologyCheck = false,  // <-- NY parameter
): PayInvoiceTxResult {
  // ...
  if (!skipChronologyCheck) {
    checkChronology(db, paymentYear.id, 'A', input.payment_date)
  }
  // ...
}
```

`payInvoice` (publik) anropar med `false`.
`payInvoicesBulk` validerar kronologi EN GANG pa batch-niva
(fore loopen) och anropar `_payInvoiceTx(..., true)` per rad.

**Paritets-referens:** `payExpensesBulk` gor EXAKT detta (rad 920-930
batch-check + rad 955 `skipChronologyCheck = true`).

**Alla anropare av `_payInvoiceTx` inventerade:**
1. `payInvoice` (publik) — anropar med `skipChronologyCheck = false`
2. `payInvoicesBulk` — anropar med `skipChronologyCheck = true`
Inga ytterligare anropare.

### D3b — Kronologi: ErrorCode-beslut

Befintlig `payExpense`-check anvander `code: 'VALIDATION_ERROR'`.
Ny delad helper skulle anvanda `code: 'CHRONOLOGY_ERROR'`.

**Konsument-analys:**
- Inga renderer-tester matchar exakt felmeddelande-text
- `tests/system/S13-bulk-payment.test.ts` matchar pa `code: 'VALIDATION_ERROR'`
  (rad 480-481) — men for ANNAN validering (ej kronologi-specifik)
- Renderer visar `error.message` i toast oavsett code — ingen
  code-specifik rendering

**Beslut:** Anvand `code: 'VALIDATION_ERROR'` i delad helper for
bakatkompatibilitet. Ny `CHRONOLOGY_ERROR`-code ar INTE nödvandig —
felmeddelandet ar tillrackligt specifikt. Undvik onödig ErrorCode-expansion.

**Konsekvens:** Stryk `CHRONOLOGY_ERROR` fran prompten. Helpern kastar
`{ code: 'VALIDATION_ERROR', error: '...', field: 'date' }`.

### D3c — Kronologi: transaction-sakerhet

`checkChronology` MASTE anropas inuti `db.transaction()` for att
undvika TOCTOU-race mellan check och verifikationsnummer-allokering.

**Verifierat:** Alla anropsplatser kors redan inom `db.transaction()`:
- `finalizeDraft`: `db.transaction(() => { ... })()` (rad 491)
- `finalizeExpense`: `db.transaction(() => { ... })()` (rad 355)
- `finalizeManualEntry`: `db.transaction(() => { ... })()` (rad 246)
- `_payInvoiceTx`: anropas av `payInvoice` inom `db.transaction()` (rad 1142)
- `_payExpenseTx`: anropas av `payExpense` inom `db.transaction()` (rad 867)

Ingen ny transaction-boundary behovs. Defense-in-depth:

```ts
export function checkChronology(...): void {
  if (!db.inTransaction) {
    throw new Error('checkChronology must be called within a transaction')
  }
  // ...
}
```

### D4 — FTS5 faktura/kostnad-utvidgning med FY-kolumn

**Problem:** FTS5-indexet (S33) tacker counterparties, products, accounts
och journal_entries. Invoices och expenses anvander fortfarande LIKE-fallback.

**FY-leakage-risk (F6):** Om FTS5 indexerar ALLA FY:s fakturor och
`ftsSearch` returnerar `LIMIT 100` rader — kan alla 100 tillhora FY2027
nar anvandaren soker i FY2026. Stage-2-queryn filtrerar bort dem →
0 resultat trots att matchningar finns i FY2026.

**Losning: `fiscal_year_id` som separat FTS5-kolumn med kolumn-filter.**

```sql
-- Utvidgat search_index-schema (migration INTE nödvandig — contentless
-- FTS5 kan inte ALTER:as, men vi kan droppa + aterskapa vid rebuild)
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
  entity_type,
  entity_id UNINDEXED,
  fiscal_year_id,     -- <-- NY: indexerad kolumn for FY-filter
  search_text,
  content='',
  tokenize='unicode61 remove_diacritics 2'
);
```

**MATCH-query med FY-filter:**
```sql
SELECT entity_id FROM search_index
WHERE search_index MATCH 'entity_type:invoice AND fiscal_year_id:2026 AND "söktext"*'
```

**Viktigt:** Counterparties, products och accounts ar globala (M14) —
deras `fiscal_year_id` setts till '0' (placeholder) vid rebuild. FY-filter
appliceras bara for invoices/expenses/journal_entries.

**Migration-strategi:** Eftersom `search_index` ar contentless och
rebuilds vid startup, behover vi INTE en SQL-migration for att andra
schemat. Andring i `rebuildSearchIndex`:
1. `DROP TABLE IF EXISTS search_index`
2. `CREATE VIRTUAL TABLE search_index USING fts5(...)` med ny kolumn
3. INSERT-block som vanligt

Kors automatiskt vid nasta startup.

**Sokfalt for FTS5 search_text:**
- **Invoices:** `invoice_number || ' ' || counterparty_name`
  (counterparty_name denormaliseras vid rebuild — JOIN vid INSERT-tid)
- **Expenses:** `COALESCE(supplier_invoice_number, '') || ' ' || description || ' ' || counterparty_name`

**Status-filtrering:**
- Drafts EXKLUDERAS vid rebuild-tid (WHERE-klausul i INSERT)
- Invoices: `status IN ('unpaid', 'paid', 'partial', 'overdue', 'credited')`
- Expenses: `status IN ('unpaid', 'paid', 'partial', 'overdue')`

**Rebuild-utvidgning — konsistensgaranti:**

`rebuildSearchIndex` ar full rebuild (DROP + CREATE + INSERT).
Counterparty-namnandring → rebuild → alla fakturor/kostnader
med den counterpartyn far uppdaterad search_text automatiskt.
Inget incremental → inget stale-data-problem.

**Alla mutations som triggar rebuild (komplett lista):**

| Service | Funktion | Varfor |
|---------|----------|--------|
| counterparty-service.ts | createCounterparty | Ny sokbar entitet (S33) |
| counterparty-service.ts | updateCounterparty | Namn kan andra → kaskad till invoices/expenses (S33) |
| product-service.ts | createProduct | Ny sokbar entitet (S33) |
| product-service.ts | updateProduct | Namn kan andra (S33) |
| manual-entry-service.ts | finalizeManualEntry | Ny sokbar journal_entry (S33) |
| correction-service.ts | createCorrectionEntry | Ny journal_entry (S33) |
| invoice-service.ts | finalizeDraft | Invoice gar fran draft → sokbar (S34 NY) |
| invoice-service.ts | payInvoice | Status andras → fortfarande sokbar men rebuild sakerställer (S34 NY) |
| expense-service.ts | finalizeExpense | Expense gar fran draft → sokbar (S34 NY) |
| expense-service.ts | payExpense | Status andras (S34 NY) |

**Try-catch-monster (M-princip-kandidat):**

Alla rebuild-anrop MASTE wrappas i try-catch. Rebuild-fail far INTE
krasha bokforingsoperationen — data ar redan committad, sokning
faller tillbaka till LIKE.

```ts
// Monster for alla callsites:
try { rebuildSearchIndex(db) } catch { /* log only, do not rethrow */ }
```

### D5 — Renderer-komponenttester: prioritering

**Analys av 30 otestade komponenter — topp 3 kritiska:**

| Komponent | Tester idag | Lucka | Prio |
|-----------|------------|-------|------|
| ManualEntryList.tsx | 0 | Allt | KRITISK |
| PaymentDialog.tsx | 4-5 | Validering, fel-states | HOG |
| BulkPaymentDialog.tsx | 2 | Rad-hantering, totaler | HOG |

**Obs (S33 F57):** Alla `mockIpcResponse`-anrop i nya tester MASTE
folja IpcResult-shape: `{ success: true, data: ... }`. S33 F57 lade
till `IpcResultSchema`-validering i mock-ipc.ts — felaktigt formaterade
mock-responses kastar vid setup, inte vid assert.

Exempel:
```ts
// KORREKT:
mockIpcResponse('manual-entry:list', { success: true, data: [...] })

// FEL (saknar IpcResult-wrapper):
mockIpcResponse('manual-entry:list', [...])
```

**A11y-walkthrough (M133):**

Fore test-skrivning: inspektera varje komponent for potentiella
a11y-violations. Identifiera och fixa FORE tester skrivs, undvik
M133-blockering.

Specifika risker:
- ManualEntryList: status-badges kan sakna aria-labels
- BulkPaymentDialog: per-rad-inputs kan sakna labels
- BulkPaymentDialog: dynamisk total bor ha `aria-live="polite"`

---

## Del A: B7 — Cross-FY betalning

### A0. Unskip och verifiera S01-05

**Fil:** `tests/system/S01-invoice-lifecycle.test.ts`

1. Andra `it.skip(` → `it(` (S01-05, cross-FY invoice-betalning)
2. Kor testet isolerat: `npx vitest run tests/system/S01-invoice-lifecycle.test.ts`
3. Om gront: klar. Om rott: analysera det specifika felet och fixa.

### A1. Cross-FY expense-betalningstest (paritet)

Nytt test parallellt med S01-05 men for expense-sidan:

```ts
it('S01-05b: expense-betalning i annat räkenskapsår', () => {
  // 1. Skapa kostnad i FY2026 (expense_date: 2026-12-20)
  // 2. Skapa FY2027 (createNewFiscalYear med bookResult)
  // 3. Verifiera: FY2027 har perioder (accounting_periods count = 12)
  // 4. Verifiera: O-serie i FY2027 inkluderar 2440-saldo (leverantorsskuld)
  // 5. Betala i FY2027 (payment_date: 2027-01-15)
  // 6. Verifiera: payment journal_entry.fiscal_year_id === fy2027.id
  // 7. Verifiera: B-serie verifikationsnummer ar 1 i FY2027
})
```

### Tester (A-fasen):

1. S01-05 unskipped: invoice cross-FY betalning fungerar
2. S01-05b: expense cross-FY betalning fungerar
3. Cross-FY: betalnings-JE hamnar i ratt FY (payment_date-baserat)
4. Cross-FY: verifikationsnummer startar om i nya FY:t (A1/B1)
5. Cross-FY: FY2026 stangd → betalning i FY2026 avvisas (YEAR_IS_CLOSED)
6. Cross-FY: FY2027 oppen → betalning i FY2027 accepteras
7. Cross-FY: O-serie i FY2027 inkluderar korrekt 1510/2440-saldo

---

## Del B: B8 — Kronologisk datumordning

### B0. Delad helper

**Fil:** `src/main/services/chronology-guard.ts` — ny fil.

```ts
import type Database from 'better-sqlite3'

/**
 * Validates that entryDate is >= the latest booked journal_date
 * in the given verification series within the fiscal year.
 * Same-day is allowed (strict less-than comparison).
 *
 * MUST be called within db.transaction() — throws if not.
 *
 * Throws structured { code: 'VALIDATION_ERROR', error, field } on violation.
 */
export function checkChronology(
  db: Database.Database,
  fiscalYearId: number,
  series: string,
  entryDate: string,
): void {
  if (!db.inTransaction) {
    throw new Error('checkChronology must be called within a transaction')
  }

  const lastEntry = db.prepare(`
    SELECT journal_date FROM journal_entries
    WHERE fiscal_year_id = ? AND verification_series = ?
    ORDER BY verification_number DESC LIMIT 1
  `).get(fiscalYearId, series) as { journal_date: string } | undefined

  if (lastEntry && entryDate < lastEntry.journal_date) {
    throw {
      code: 'VALIDATION_ERROR' as const,
      error: `Datum ${entryDate} är före senaste bokförda datum ${lastEntry.journal_date} i ${series}-serien.`,
      field: 'date',
    }
  }
}
```

**ErrorCode:** `VALIDATION_ERROR` (bakatkompatibelt med befintlig
`payExpense`-check). Inget nytt ErrorCode behöver laggas till.
Renderer visar `error.message` i toast — felmeddelandet ar tillrackligt
specifikt for att anvandaren forstar problemet.

### B1. Integrera i finalize-funktioner

**invoice-service.ts — finalizeDraft:**
Anropa `checkChronology(db, invoice.fiscal_year_id, 'A', invoice.invoice_date)`
omedelbart FORE verifikationsnummer-allokering, inuti befintlig
`db.transaction()`.

**expense-service.ts — finalizeExpense:**
Anropa `checkChronology(db, expense.fiscal_year_id, 'B', expense.expense_date)`
omedelbart FORE verifikationsnummer-allokering.

**manual-entry-service.ts — finalizeManualEntry:**
Anropa `checkChronology(db, entry.fiscal_year_id, 'C', entry.entry_date)`
omedelbart FORE verifikationsnummer-allokering.

### B2. Integrera i _payInvoiceTx med skipChronologyCheck

**invoice-service.ts — `_payInvoiceTx`:**

1. Lagg till `skipChronologyCheck = false` parameter (paritet med `_payExpenseTx`):
   ```ts
   function _payInvoiceTx(
     db: Database.Database,
     input: PayInvoiceInput,
     skipChronologyCheck = false,
   ): PayInvoiceTxResult {
   ```

2. Anropa `checkChronology` omedelbart efter `paymentYear`-derivering
   och period-stangnings-check, FORE verifikationsnummer-allokering:
   ```ts
   if (!skipChronologyCheck) {
     checkChronology(db, paymentYear.id, 'A', input.payment_date)
   }
   ```

3. `payInvoice` (publik) anropar med default `false`.

4. `payInvoicesBulk` — lagg till batch-niva kronologi-check FORE loopen
   (paritet med `payExpensesBulk` rad 920-930) + anropa `_payInvoiceTx(..., true)`:
   ```ts
   // Batch-level M6 chronology check — A-serie
   const lastEntry = db.prepare(`
     SELECT journal_date FROM journal_entries
     WHERE fiscal_year_id = ? AND verification_series = 'A'
     ORDER BY verification_number DESC LIMIT 1
   `).get(paymentYear.id) as { journal_date: string } | undefined
   if (lastEntry && input.payment_date < lastEntry.journal_date) {
     return {
       success: false,
       error: 'Datum före senaste verifikation i A-serien.',
       code: 'VALIDATION_ERROR',
       field: 'payment_date',
     }
   }

   // Per-rad loop med skipChronologyCheck = true:
   const txResult = _payInvoiceTx(db, { ... }, true)
   ```

### B3. Migrera befintlig payExpense-check till delad helper

**expense-service.ts — `_payExpenseTx`:**
Ersatt inline kronologi-check med:
```ts
if (!skipChronologyCheck) {
  checkChronology(db, paymentYear.id, 'B', input.payment_date)
}
```

**OBS:** Felmeddelandet andras fran
`'Datum före senaste verifikation i B-serien.'`
till
`'Datum {date} är före senaste bokförda datum {lastDate} i B-serien.'`

Verifierat: inga konsumenter matchar exakt text. Tester matchar pa
`result.success === false`, inte felmeddelande-strang.

### B4. Unskip S01-06

**Fil:** `tests/system/S01-invoice-lifecycle.test.ts`

Andra `it.skip(` → `it(` (S01-06, kronologisk ordning).

### Tester (B-fasen):

8. S01-06 unskipped: kronologisk ordning enforced for A-serie
9. Kronologi A-serie: samma-dag ar tillaten (2026-03-15 efter 2026-03-15 → OK)
10. Kronologi A-serie: senare datum accepteras (2026-03-20 efter 2026-03-15 → OK)
11. Kronologi A-serie: tom serie → inget fel (forsta posten)
12. Kronologi B-serie: expense finalize — fore senaste → avvisas
13. Kronologi C-serie: manual entry finalize — fore senaste → avvisas
14. Kronologi A-serie: payInvoice — fore senaste → avvisas
15. Kronologi B-serie: payExpense — beteendeidentiskt efter migration till delad helper
16. Kronologi cross-FY: FY2027 B-serie tom → inga kronologi-fel (FY-scopad)
17. Kronologi bulk: payInvoicesBulk batch-check avvisar fore loop-start
18. Kronologi bulk: payInvoicesBulk per-rad skippar check (skipChronologyCheck=true)
19. Kronologi: A1=2026-03-15, A2=2026-03-15, A3=2026-03-14 → A3 avvisas (MAX, inte LAST)
20. checkChronology: kastar om anropad utanfor transaktion (db.inTransaction guard)

---

## Del C: B9 — FTS5 faktura/kostnad-utvidgning

### C0. Utvidga rebuildSearchIndex med FY-kolumn

**Fil:** `src/main/services/search-service.ts`

Andra `rebuildSearchIndex` till att droppa + aterskapa FTS5-tabellen
med ny `fiscal_year_id`-kolumn:

```ts
export function rebuildSearchIndex(db: Database.Database): void {
  db.transaction(() => {
    // Drop + recreate med FY-kolumn (contentless FTS5 kan inte ALTER:as)
    db.exec('DROP TABLE IF EXISTS search_index')
    db.exec(`
      CREATE VIRTUAL TABLE search_index USING fts5(
        entity_type,
        entity_id UNINDEXED,
        fiscal_year_id,
        search_text,
        content='',
        tokenize='unicode61 remove_diacritics 2'
      )
    `)

    // Counterparties (global — fiscal_year_id = '0')
    db.exec(`
      INSERT INTO search_index (entity_type, entity_id, fiscal_year_id, search_text)
      SELECT 'counterparty', id, '0', name || ' ' || COALESCE(org_number, '')
      FROM counterparties WHERE is_active = 1
    `)

    // Products (global — fiscal_year_id = '0')
    db.exec(`
      INSERT INTO search_index (entity_type, entity_id, fiscal_year_id, search_text)
      SELECT 'product', id, '0', name
      FROM products WHERE is_active = 1
    `)

    // Accounts (global — fiscal_year_id = '0')
    db.exec(`
      INSERT INTO search_index (entity_type, entity_id, fiscal_year_id, search_text)
      SELECT 'account', id, '0', account_number || ' ' || name
      FROM accounts WHERE is_active = 1
    `)

    // Journal entries (FY-scopade)
    db.exec(`
      INSERT INTO search_index (entity_type, entity_id, fiscal_year_id, search_text)
      SELECT 'journal_entry', je.id, CAST(je.fiscal_year_id AS TEXT),
        je.verification_series || ' ' || CAST(je.verification_number AS TEXT) || ' ' || je.description
      FROM journal_entries je
      WHERE je.status IN ('booked', 'corrected')
        AND je.source_type = 'manual'
    `)

    // Invoices (FY-scopade, non-draft)
    db.exec(`
      INSERT INTO search_index (entity_type, entity_id, fiscal_year_id, search_text)
      SELECT 'invoice', i.id, CAST(i.fiscal_year_id AS TEXT),
        i.invoice_number || ' ' || cp.name
      FROM invoices i
      JOIN counterparties cp ON cp.id = i.counterparty_id
      WHERE i.status IN ('unpaid', 'paid', 'partial', 'overdue', 'credited')
    `)

    // Expenses (FY-scopade, non-draft)
    db.exec(`
      INSERT INTO search_index (entity_type, entity_id, fiscal_year_id, search_text)
      SELECT 'expense', e.id, CAST(e.fiscal_year_id AS TEXT),
        COALESCE(e.supplier_invoice_number, '') || ' ' || e.description || ' ' || cp.name
      FROM expenses e
      JOIN counterparties cp ON cp.id = e.counterparty_id
      WHERE e.status IN ('unpaid', 'paid', 'partial', 'overdue')
    `)
  })()
}
```

### C1. Uppdatera ftsSearch med FY-filter

**Fil:** `src/main/services/search-service.ts`

Utvidga `ftsSearch` med optional `fiscalYearId`:

```ts
function ftsSearch(
  db: Database.Database,
  entityType: FtsEntityType,
  query: string,
  limit: number,
  fiscalYearId?: number,
): number[] | null {
  try {
    const escaped = escapeFtsQuery(query)
    const fyFilter = fiscalYearId
      ? ` AND fiscal_year_id:${fiscalYearId}`
      : ''
    const matchExpr = `entity_type:${entityType}${fyFilter} AND "${escaped}"*`
    // ...
  } catch { return null }
}
```

Globala entiteter (counterparty, product, account) anropas utan `fiscalYearId`.
FY-scopade (invoice, expense, journal_entry) anropas med `input.fiscal_year_id`.

### C2. Byt invoice/expense-query till FTS5-first

**Fil:** `src/main/services/search-service.ts`

Ersatt LIKE-only-blocket for invoices med FTS5-first + LIKE-fallback
(samma monster som S33 counterparties).

FTS5-queryn anvander FY-filter:
```ts
const invoiceFtsIds = ftsSearch(db, 'invoice', trimmed, perLimit * 2, input.fiscal_year_id)
```

Stage-2-queryn behover INTE `WHERE fiscal_year_id = ?` (redan filtrerat
i FTS5-match) men BEHALL den som defense-in-depth.

Samma monster for expenses.

### C3. Utvidga FtsEntityType och rebuild-anropspunkter

Utvidga typen:
```ts
type FtsEntityType = 'counterparty' | 'product' | 'account' | 'journal_entry' | 'invoice' | 'expense'
```

Nya rebuild-anropspunkter (try-catch):

| Service | Funktion |
|---------|----------|
| invoice-service.ts | finalizeDraft |
| invoice-service.ts | payInvoice |
| expense-service.ts | finalizeExpense |
| expense-service.ts | payExpense |

### Tester (C-fasen):

21. FTS5: faktura sokbar via invoice_number efter finalize
22. FTS5: faktura sokbar via counterparty-namn
23. FTS5: expense sokbar via description
24. FTS5: expense sokbar via supplier_invoice_number
25. FTS5: expense sokbar via counterparty-namn
26. FTS5: draft-fakturor exkluderade fran FTS5-index
27. FTS5: draft-expenses exkluderade
28. FTS5: FY-scopning — 100 fakturor i FY2027 + 1 i FY2026 → FY2026-sok hittar den 1
29. FTS5: ny finaliserad faktura sokbar direkt (rebuild efter finalize)
30. FTS5: betalning andrar status → fortfarande sokbar efter rebuild
31. FTS5: counterparty-namnandring → faktura sokbar via nytt namn efter rebuild
32. Fallback: invoice-sok fungerar utan search_index-tabell
33. Perf: FTS5 vs LIKE relativ jamforelse — FTS5 < 50% av LIKE-tid pa 1000 fakturor

---

## Del D: T1 — Renderer-komponenttester

### D0. ManualEntryList.tsx — 0 → 10+ tester

**Fil:** `tests/renderer/components/manual-entries/ManualEntryList.test.tsx` — ny fil.

**Setup:** `render-with-providers.tsx` + `mockIpcResponse` for
`manual-entry:list-drafts` och `manual-entry:list`.
Alla mock-responses i IpcResult-format: `{ success: true, data: [...] }`.

**Tester:**

34. Renderar loading-state (spinner) initialt
35. Renderar utkast-sektion med draft-rader
36. Draft-rad: klick anropar onEdit(id)
37. Renderar finaliserad-sektion med tabell-rader
38. Finaliserad rad: klick anropar onView(id)
39. Empty state visas nar bade drafts OCH entries ar tomma
40. Empty state: "Ny bokforingsorder"-knapp anropar onCreate
41. Status-badge "Korrigerad" visas for corrected_by_id !== null
42. Status-badge "Korrigering" visas for corrects_entry_id !== null
43. Verifikationsnummer formateras korrekt (Cn)
44. Belopp visas i kronor (formatKr)
45. axe-check: inga a11y-violations

### D1. PaymentDialog.tsx — 5 → 12+ tester

**Fil:** `tests/renderer/components/ui/PaymentDialog.test.tsx` — ny fil
(eller utvidga befintlig s59-payment-dialog-timezone.test.tsx).

**Tester:**

46. Amount-validering: 0 kr avvisas
47. Amount-validering: mer an remaining avvisas
48. Amount-validering: exakt remaining accepteras
49. Datum-validering: fore document_date avvisas
50. Datum-validering: efter FY-end avvisas
51. Bank-fee: optional, 0 kr → ingen fee
52. Loading-state: submit-knapp disabled
53. Cancel: stanger dialog och aterställer form

### D2. BulkPaymentDialog.tsx — 2 → 10+ tester

**Fil:** `tests/renderer/components/ui/BulkPaymentDialog.test.tsx` — ny fil.

**Tester:**

54. Renderar tabell med alla rader fran props
55. Per-rad-belopp: andring i en rad paverkar inte andra
56. Total-berakning: summan av alla rad-belopp
57. Submit disabled nar total <= 0
58. Submit filtrerar bort noll-belopp-rader
59. Submit formaterar belopp som ore (×100)
60. Account number default "1930"
61. Bank-fee och anteckning ar optional
62. Form-reset vid re-open (stanger + oppnar igen)
63. axe-check: inga a11y-violations

---

## Fas-ordning och rollback-strategi

| Fas | Scope | Tagg vid klar | Test-suite |
|-----|-------|---------------|------------|
| 0 | A0-A1: Cross-FY unskip + expense-paritet | `s34-crossfy` | Fokuserad + full |
| 1 | B0-B4: Kronologisk ordning + unskip S01-06 | `s34-chrono` | Fokuserad + full + re-run Fas 0 |
| 2 | C0-C3: FTS5 invoice/expense-utvidgning | `s34-fts5ext` | Fokuserad + full |
| 3 | D0-D2: Renderer-komponenttester | `s34-renderer` | Full |

**Fas-beroenden:**
- Fas 0 → Fas 1: B7 bor verifieras FORE kronologi laggs till. Kronologi
  kan paverka cross-FY — men FY-scopning innebar att ny FY:s serie ar tom
  → ingen blockering. **Vakt:** Kor Fas 0-tester igen efter Fas 1 for
  att bekrafta att kronologi-check inte regressar cross-FY.
- Fas 2 ar oberoende av 0/1
- Fas 3 ar oberoende av 0/1/2

**Test-policy:** Fokuserad suite (relevanta service- + impactade
renderer-tester) mellan faser. Full vitest-suite vid varje tagg.
Playwright vid sprint-slut.

---

## UTANFOR SCOPE (Sprint 35+)

- **F59** per-kanal response-schema-validering i mock-IPC (60+ schemas, hog effort)
- **F60** centraliserad rebuild-trigger (event-baserad istallet for spridda callsites)
- **FTS5 BM25 ranking** — relevans-rankning istallet for flat list
- **F47** display-lager M131 (backlog, lagrisk)
- **Renderer-tester fas 2** — GlobalSearch keyboard-edge-cases,
  ConfirmDialog variant-visuella tester, CustomerDetail, ProductForm

---

## Manuellt smoke-test-script

### Cross-FY (2 min)
1. [ ] Skapa faktura i FY2026 (dec) → bokfor → skapa FY2027 → betala i jan 2027
2. [ ] Verifiera O1 i FY2027 inkluderar korrekt 1510-saldo fran FY2026
3. [ ] Betalningsverifikat har FY2027:s A-serie (A1)
4. [ ] FY2026 ar stangd → betalning med dec-datum avvisas

### Kronologi (2 min)
5. [ ] Bokfor faktura 2026-03-15 (A1) → bokfor 2026-03-10 → avvisas
6. [ ] Bokfor faktura 2026-03-15 (A1) → bokfor 2026-03-15 (A2) → OK
7. [ ] Bokfor kostnad 2026-03-15 (B1) → bokfor 2026-03-10 → avvisas
8. [ ] Skapa manual entry 2026-03-15 (C1) → 2026-03-10 → avvisas

### FTS5 faktura/expense (2 min)
9. [ ] Sok fakturanummer → traff via FTS5
10. [ ] Sok leverantorsnamn pa kostnad → traff
11. [ ] Draft-faktura → inte sokbar → bokfor → nu sokbar
12. [ ] FY-scopning: faktura i FY2026 syns inte vid sok i FY2027

### Dev-verifiering (ej slutanvandare)
13. [ ] Droppa search_index via DevTools → sok → LIKE-fallback fungerar
14. [ ] Alla renderer-tester gar gront

---

## Nya tester per feature — sammanfattning

| Feature | Typ | Antal |
|---------|-----|-------|
| A: Cross-FY betalning | System | 7 |
| B: Kronologisk ordning | Service + system | 13 |
| C: FTS5 utvidgning | Service + perf | 13 |
| D: Renderer-tester | Component | 30 |
| **Totalt** | | **63** |

**Unskipped:** 2 (S01-05, S01-06) → gar fran skipped till passed.

**Netto nya test-filer:** 4 (session-34-chronology.test.ts,
ManualEntryList.test.tsx, BulkPaymentDialog.test.tsx, PaymentDialog.test.tsx).
Befintliga filer utvidgas.

**Mal:** baseline + 63 nya + 2 unskipped = ~1849 passed, 0 skipped.

---

## Verifiering vid sprint-avslut

```bash
npm run test          # ~1849 passed, 0 skipped
npm run typecheck     # 0 errors
npm run check:m131    # rent
npm run check:m133    # rent
npm run build         # rent
grep -rn 'it\.skip' tests/ | wc -l   # 0
```

- Uppdatera STATUS.md (B7, B8, B9, T1, 0 skipped tests)
- Uppdatera CLAUDE.md med ny M-princip for kronologisk ordning
  och try-catch-rebuild-monster
- Kor manuellt smoke-test-script ovan
- Tagga `s34-done`
