# Sprint 56 — prompt (reviderad efter QA-revision)

**Tema:** F66-b auto-matchning + F63-polish-b SIE4-konflikt-UI + F67 pagination
**Scope:** 8.5 SP (budget 7–9) • **Utgångspunkt:** S55 shipat (2343 vitest, 50 Playwright, PRAGMA 39).

## Mål

1. **(A) F66-b auto-matchning av bank-transaktioner** — deterministisk scoring-algoritm föreslår invoice/expense-matches för omatchade TX. HIGH-confidence-kandidater kan bulk-accepteras. Ingen auto-commit utan klick.
2. **(B) F63-polish-b SIE4-konflikt-resolution-UI** — vid merge-strategi exponeras konto-namnkonflikter i preview-fasen. Användaren väljer per konflikt: behåll/skriv över/skippa. Invariant-varning när skip bryter import.
3. **(C) F67 pagination** — `listInvoices`, `listExpenses` och `getBankStatement.transactions` får limit/offset med selection-bevarande över sidor. Default page size 50.

**Beräknad test-delta:** 2343 → ~2395 vitest (+52). Playwright: 50 → 54 (+4: 2 happy + 2 negative-path). PRAGMA: 39 → 40.

## Scope-breakdown (8.5 SP)

| Del | SP | Innehåll |
|---|---|---|
| **A1.** Migration 040 — match_method-enum-utökning (M122 + pre-flight) | 0.5 | Pre-flight whitelist (K2), explicit kolumnlista (K1), M141-inventering (K3) |
| **A2.** `bank-match-suggester`-service | 1.5 | Scoring-matrix + 13 unit-tester |
| **A3.** IPC + hook + hook-unit-test (F6) | 0.5 | Kanal + error-state-test |
| **A4.** UI: SuggestedMatchesPanel + bulk-accept state-machine (V2) | 1.0 | Continue-on-error, disable-on-pending |
| **A5.** E2E happy + negative-path (F1) | 0.5 | 2 specs |
| **B1.** SIE4-validator konflikt-detektion | 0.5 | Extended `SieValidationResult.conflicts[]` + 3 tester |
| **B2.** Import-service conflict-resolution + use-count-check (V6) | 0.6 | Per-rad-logik + skip-dependency-validering + 5 tester |
| **B3.** UI: ImportPreviewPhase-konflikt-sektion + invariant-varning | 0.6 | Render + blockera submit när skip bryter |
| **B4.** E2E happy + negative-path (F1) | 0.3 | 2 specs |
| **C1.** IPC-schema + service-limit/offset + search-konsistent total_items (V5) | 0.8 | `invoice:list` + `expense:list` + `bank-statement:get` + 5 tester |
| **C2.** Pagination-komponent + integration + selection-bevarande (V3) | 1.2 | `<Pagination>` + InvoiceList/ExpenseList/BankStatementDetail + useRef-first-render-guard (V4) |
| **C3.** UI-unit-tester (Pagination, page-reset-race) | 0.3 | 4 tester |
| **M153 check-script + docs** | 0.2 | `scripts/check-m153.mjs` + `check:m153` |
| **Docs + CLAUDE.md (M153)** | 0.2 | s56-summary + STATUS.md |
| **Summa** | **8.5** | Inom budget 7–9 |

## Upfront-beslut (låsta innan kod)

**Beslut 1: Match-methods i migration 040.**
Utöka enum till `'manual', 'auto_amount_exact', 'auto_amount_date', 'auto_amount_ref', 'auto_iban'`. Varje metod motsvarar en specifik match-anledning. `match_method`-kolumnen lagrar den **starkaste enskilda signalen** som vann — inga sammansatta metoder. Förlorad diagnostik-detalj (F5) accepteras; `reasons[]` exponeras runtime från suggester men persisteras INTE. Motivering: enkelt schema, revisor kan alltid re-derivera reasons deterministiskt (M153).

**Beslut 2: Ingen auto-commit.** Suggester returnerar candidates med confidence HIGH/MEDIUM. UI kräver alltid klick ("Acceptera" eller "Acceptera alla HIGH"). LOW filtreras bort (brus).

**Beslut 3: Scoring-algoritm deterministisk, inga ML-modeller (M153).**

Signaler (heltal):
| Signal | Värde | Villkor |
|---|---|---|
| `amount_exact` | 100 | `|tx.amount_ore| === remaining_ore` |
| `amount_close` | 60 | `|diff| ≤ 50 öre` och `remaining > 0` (exkl exact) |
| `date_exact` | 30 | `tx.value_date === entity_date` |
| `date_close_3` | 25 | `|days| ≤ 3` (exkl exact) |
| `date_close_7` | 15 | `|days| ≤ 7` (exkl ≤3) |
| `date_close_30` | 5 | `|days| ≤ 30` (exkl ≤7) |
| `iban_match` | 50 | `tx.counterparty_iban === counterparty.bank_account` (normaliserat, case-insensitive) |
| `ref_match` | 40 | `tx.remittance_info` innehåller `entity.invoice_number` ELLER `entity.ocr_number` |

Signalerna **excluderar varandra i samma kategori**: max en belopps-signal + max en datum-signal per candidate. Detta tillsammans med heltalsaritmetik ger `reasons[]`-sekvensen som reversibel given inputs.

Classificering:
- **HIGH:** `score ≥ 130` **och** score är unik topp efter tie-breaking (se Beslut 4)
- **MEDIUM:** `score ≥ 80` och inte HIGH
- **LOW (filtreras bort):** `score < 80`

Method-etikett (för persistence): starkaste enskilda signalen:
`iban_match > ref_match > (amount_exact + date_exact kombinerat) > amount_exact > date_exact`

Mappning:
- Om `iban_match` är med → `auto_iban`
- Annars om `ref_match` är med → `auto_amount_ref`
- Annars om `date_exact` och `amount_exact` båda är med → `auto_amount_date`
- Annars → `auto_amount_exact`

**Beslut 4: Tie-breaking — explicit ordning.**
Om flera candidates har identisk `score`:
1. **Klassificering görs FÖRE tie-breaking.** Alla candidates med samma top-score blir MEDIUM, inte HIGH. Enda undantag: om det finns exakt en candidate med top-score (ingen tie), klassas den HIGH när score ≥ 130.
2. **Sortering inom samma confidence-nivå:**
   - Invoice-candidates: äldst förfallodatum först (`due_date ASC`), sedan id ASC.
   - Expense-candidates: tidigast `expense_date` först, sedan id ASC.

Explicit unit-test: två invoices med identisk match-profil (samma belopp, samma datum, samma counterparty-IBAN) → båda blir MEDIUM, toppen i listan är den med äldst förfallodatum.

**Beslut 5: Suggester körs on-demand, inte vid import.**
Användaren klickar "Föreslå matchningar" på statement-detail-vyn. Resultatet cachas inte server-side men React Query cachar per `statementId` (invalidering vid TX- eller invoice-ändring).

Prestanda-SLA: <500ms för statement med 100 TX × 500 öppna invoices. Bench-test i A2 verifierar SLA; om överskrids → F66-d-backlog-item (server-side bucket-indexing).

**Beslut 6: En TX kan bara ha en accepterad suggestion åt gången.**
Suggester returnerar max 5 candidates per TX, sorterade på score DESC. Direction-guard: +TX → bara invoices, −TX → bara expenses. Cross-type candidates returneras INTE (V1-testet: negative TX med matching `|amount|` mot invoice → inga candidates).

**Beslut 7: Bulk-accept "Acceptera alla HIGH" — continue-on-error (V2).**
State-machine:
- Under pågående bulk-accept: knappen `disabled` (förhindrar race från dubbelklick).
- Loopa HIGH-candidates sekventiellt via existing `matchBankTransaction`-IPC.
- Per misslyckad match: samla i `failures: Array<{tx_id, reason}>`.
- Slutstate: visa toast `"X av Y matchningar accepterade"`. Vid failures: expanderbar detalj-lista per TX som failade.
- UI-unit-test: mock IPC, ge 2 av 5 failed → toast-text innehåller "3 av 5".

**Beslut 8: SIE4-konflikt = account_number finns, namn skiljer.**
Andra konflikttyper (olika `account_type`, olika `is_active`) räknas INTE som konflikter i S56. Type/active-fält påverkas inte av merge-import idag, så inga nya konflikttyper.

**Beslut 9: Konflikt-resolution default = 'keep'. Tidigare tyst overwrite-beteende tas bort.**
UI visar tre radios per konflikt: **Behåll existerande (default)** / **Skriv över med SIE-fil** / **Skippa konto helt**.

**Beslut 10: SIE4 skip-resolution + used-account = BLOCKERAS i preview (V6).**
När användaren väljer 'skip' på ett konto som används av importerade journal-entries:
- Preview visar varning: `"Skip av [1930]: 47 verifikat i SIE-filen refererar detta konto. Importen kan inte genomföras. Välj 'Behåll existerande' eller 'Skriv över' istället."`
- Importera-knappen blir `disabled` tills alla skip-konflikter är avklarade.
- Validering görs i renderer mot `validation.entries[]` (inget extra IPC-anrop).
- Om användaren ändå lyckas trigga import (t.ex. via direkt IPC): service validerar om + returnerar `VALIDATION_ERROR` utan att rulla tillbaka mid-import. Defense-in-depth.

**Beslut 11: Pagination default-size = 50, max = 200.**
Schema: `limit: z.number().int().min(1).max(200).default(50)`, `offset: z.number().int().min(0).default(0)`.

Service returnerar `total_items` (SELECT COUNT(*) med **samma WHERE-klausul** som huvudquery, utan LIMIT/OFFSET) så UI kan visa "X–Y av Z".

`counts` (status-grupperade) fortsätter räkna hela FY (befintlig query, oförändrad — används för status-filter-chips där användaren vill veta "hur många draft finns totalt").

**UI visar:** "Visar 1–50 av 127 (filter: obetalda)" där 127 = `total_items` (filtrerat), och status-chips visar `counts[status]` (FY-totalt). Detta är explicit dubbelracerat i test (V5): `total_items === items.length` när totalt antal filtrerat ≤ limit.

**Beslut 12: Pagination återställs vid filter/sort-ändring — useRef-guard vid mount (V4).**
```tsx
const firstRender = useRef(true)
useEffect(() => {
  if (firstRender.current) { firstRender.current = false; return }
  setPage(0)
}, [status, sortBy, sortOrder, search])
```
Skyddar mot race när initialvärden kommer från framtida persistance (localStorage etc — inte använt idag men förebyggande).

**Beslut 13: Pagination bevarar selection-state över sidor (V3 — ändrat från tidigare draft).**
Selection-state (`selectedIds: Set<number>`) lever i List-komponenten och påverkas inte av page-byte. Motivering: bulk-payment (M112) är en datarisk-yta — förlorad selection kan ge tysta felaktiga bulk-betalningar. Merkostnad 0.2 SP.

Invariant: `selectedIds` får bara innehålla id:n som finns i `counts`-scope (samma FY). Vid FY-byte rensas `selectedIds` explicit (redan idag).

**Beslut 14: Bank-transaction-lista paginerar INOM getBankStatement-anropet.**
Schema utökat: `transaction_limit?: number, transaction_offset?: number`. Returnerar `{ statement, transactions, total_transactions }`. Statement-metadata oförändrad.

## A. F66-b auto-matchning — detaljerad design

### A1. Migration 040 — korrigerad efter K1+K2+K3

```typescript
/** Migration 040: Sprint 56 F66-b — match_method-enum-utökning.
 *
 * M122: table-recreate (bank_reconciliation_matches har inkommande FK från
 *   invoice_payments + expense_payments — faktiskt false, FK går ÅT ANDRA
 *   HÅLLET: denna tabell refererar dem. Men UNIQUE-indexet på
 *   bank_transaction_id kräver recreate för att uppdatera CHECK.
 * M121: inga triggers attached till bank_reconciliation_matches (verifierat).
 * M141: cross-table trigger-inventering — ingen trigger refererar tabellen i
 *   sin body.
 *
 * Pre-flight (K2): SELECT DISTINCT match_method → måste bara ge 'manual'.
 */
function migration040Programmatic(db: Database): void {
  // Idempotency
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='bank_reconciliation_matches'",
  ).get() as { sql: string } | undefined
  if (tableInfo?.sql?.includes("'auto_iban'")) return  // redan migrerat

  // K2: pre-flight whitelist
  const distinctMethods = db
    .prepare('SELECT DISTINCT match_method FROM bank_reconciliation_matches')
    .all() as { match_method: string }[]
  const allowed = ['manual']
  for (const row of distinctMethods) {
    if (!allowed.includes(row.match_method)) {
      throw new Error(
        `Migration 040 pre-flight: bank_reconciliation_matches har match_method '${row.match_method}' utanför whitelist ${JSON.stringify(allowed)}. Undersök innan migrationen kan köras.`,
      )
    }
  }

  // K3: M141 cross-table trigger-inventering (verify empty)
  const crossTableTriggers = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='trigger' AND sql LIKE '%bank_reconciliation_matches%' AND tbl_name != 'bank_reconciliation_matches'",
  ).all() as { name: string }[]
  if (crossTableTriggers.length > 0) {
    throw new Error(
      `Migration 040 M141 pre-flight: oväntad cross-table trigger refererar bank_reconciliation_matches: ${crossTableTriggers.map(t => t.name).join(', ')}`,
    )
  }

  // Table-recreate med K1: explicit kolumnlista i INSERT
  db.exec(`
    CREATE TABLE bank_reconciliation_matches_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_transaction_id INTEGER NOT NULL UNIQUE REFERENCES bank_transactions(id) ON DELETE CASCADE,
      matched_entity_type TEXT NOT NULL,
      matched_entity_id INTEGER NOT NULL,
      invoice_payment_id INTEGER REFERENCES invoice_payments(id) ON DELETE RESTRICT,
      expense_payment_id INTEGER REFERENCES expense_payments(id) ON DELETE RESTRICT,
      match_method TEXT NOT NULL DEFAULT 'manual',
      matched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      CHECK (matched_entity_type IN ('invoice','expense')),
      CHECK (match_method IN ('manual','auto_amount_exact','auto_amount_date','auto_amount_ref','auto_iban')),
      CHECK (
        (matched_entity_type = 'invoice' AND invoice_payment_id IS NOT NULL AND expense_payment_id IS NULL)
        OR
        (matched_entity_type = 'expense' AND expense_payment_id IS NOT NULL AND invoice_payment_id IS NULL)
      )
    );

    INSERT INTO bank_reconciliation_matches_new (
      id, bank_transaction_id, matched_entity_type, matched_entity_id,
      invoice_payment_id, expense_payment_id, match_method, matched_at
    )
    SELECT
      id, bank_transaction_id, matched_entity_type, matched_entity_id,
      invoice_payment_id, expense_payment_id, match_method, matched_at
    FROM bank_reconciliation_matches;

    DROP TABLE bank_reconciliation_matches;
    ALTER TABLE bank_reconciliation_matches_new RENAME TO bank_reconciliation_matches;

    CREATE INDEX idx_bank_match_entity
      ON bank_reconciliation_matches(matched_entity_type, matched_entity_id);
  `)

  migration040Verify(db)
}

function migration040Verify(db: Database): void {
  const sql = (db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='bank_reconciliation_matches'",
  ).get() as { sql: string }).sql
  if (!sql.includes("'auto_iban'")) {
    throw new Error('Migration 040 failed: auto_iban saknas i CHECK')
  }
  const idx = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_bank_match_entity'",
  ).get()
  if (!idx) throw new Error('Migration 040 failed: idx_bank_match_entity saknas')
}
```

**FK-off-hantering:** `bank_reconciliation_matches` har **utgående** FK men **inga inkommande** (ingen annan tabell refererar den). `PRAGMA foreign_keys = OFF` utanför transaktion behövs INTE — table-recreate kan köras inuti transaktionen. Detta avviker från migration 022/023/032 där inkommande FK fanns. Dokumenteras i migration-kommentaren.

### A2. `bank-match-suggester`-service

```typescript
// src/main/services/bank/bank-match-suggester.ts

export type MatchMethod =
  | 'auto_iban'
  | 'auto_amount_ref'
  | 'auto_amount_date'
  | 'auto_amount_exact'

export interface MatchCandidate {
  entity_type: 'invoice' | 'expense'
  entity_id: number
  entity_number: string | null
  counterparty_name: string | null
  total_amount_ore: number
  remaining_ore: number
  entity_date: string
  due_date: string | null
  score: number
  confidence: 'HIGH' | 'MEDIUM'
  method: MatchMethod
  reasons: string[]  // runtime-only, persisteras inte (F5)
}

export interface TxSuggestion {
  bank_transaction_id: number
  candidates: MatchCandidate[]  // max 5, sorterade på score DESC, sedan tie-break
}

export function suggestMatchesForStatement(
  db: Database.Database,
  statementId: number,
): IpcResult<TxSuggestion[]>
```

**Scoring-funktion** (ren, deterministisk):
```typescript
function scoreCandidate(
  tx: BankTransaction,
  candidate: EntityCandidate,
): { score: number; reasons: string[]; method: MatchMethod } | null {
  // Direction-guard: returnera null om fel typ
  if (tx.amount_ore > 0 && candidate.type !== 'invoice') return null
  if (tx.amount_ore < 0 && candidate.type !== 'expense') return null

  let score = 0
  const reasons: string[] = []
  const absAmount = Math.abs(tx.amount_ore)
  const diff = Math.abs(absAmount - candidate.remaining_ore)

  // Belopps-signal (max en)
  if (diff === 0) { score += 100; reasons.push('Belopp exakt match') }
  else if (diff <= 50 && candidate.remaining_ore > 0) { score += 60; reasons.push('Belopp inom 50 öre') }

  // Datum-signal (max en)
  const days = daysBetween(tx.value_date, candidate.entity_date)
  if (days === 0) { score += 30; reasons.push('Samma datum') }
  else if (days <= 3) { score += 25; reasons.push(`Datum inom 3 dagar (${days})`) }
  else if (days <= 7) { score += 15; reasons.push(`Datum inom 7 dagar (${days})`) }
  else if (days <= 30) { score += 5; reasons.push(`Datum inom 30 dagar (${days})`) }

  // IBAN-match
  if (tx.counterparty_iban && candidate.counterparty_iban &&
      normalizeIban(tx.counterparty_iban) === normalizeIban(candidate.counterparty_iban)) {
    score += 50; reasons.push('IBAN match')
  }

  // Ref-match (invoice_number ELLER ocr_number)
  if (tx.remittance_info && (
    (candidate.invoice_number && tx.remittance_info.includes(candidate.invoice_number)) ||
    (candidate.ocr_number && tx.remittance_info.includes(candidate.ocr_number))
  )) { score += 40; reasons.push('Referens i meddelande') }

  const method = pickMethod(reasons)
  return { score, reasons, method }
}

function normalizeIban(iban: string): string {
  return iban.replace(/\s/g, '').toUpperCase()
}
```

**Classificering + tie-breaking** (efter scoring):
```typescript
function classifySuggestions(candidates: MatchCandidate[]): MatchCandidate[] {
  if (candidates.length === 0) return []
  const sorted = [...candidates].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    // tie-break
    const dateA = a.entity_type === 'invoice' ? (a.due_date ?? '') : a.entity_date
    const dateB = b.entity_type === 'invoice' ? (b.due_date ?? '') : b.entity_date
    if (dateA !== dateB) return dateA.localeCompare(dateB)
    return a.entity_id - b.entity_id
  })

  const topScore = sorted[0].score
  const topTieCount = sorted.filter(c => c.score === topScore).length
  const isUniqueTop = topTieCount === 1

  return sorted.slice(0, 5).map(c => ({
    ...c,
    confidence: (c.score >= 130 && isUniqueTop && c.score === topScore)
      ? 'HIGH' as const
      : c.score >= 80
        ? 'MEDIUM' as const
        : null as never
  })).filter(c => c.confidence !== null)
}
```

### A3. IPC + hook + unit-test (F6)

- Kanal: `bank-statement:suggest-matches` (schema: `{ statement_id }`)
- Hook: `useSuggestBankMatches(statementId, enabled)` — stängd av default, aktiveras när användaren klickar "Föreslå"
- Hook-unit-test: mock IPC med error → verifiera `error` state exponeras via React Query

### A4. UI: SuggestedMatchesPanel — continue-on-error (V2)

Expandable panel ovanför transaktionstabellen i `BankStatementDetail`:

```
┌ Föreslagna matchningar ─────────────────────────── [ Expandera ▼ ] ┐
│ 3 säkra (HIGH) · 7 möjliga (MEDIUM)                                  │
│                                                                       │
│ [ Acceptera alla HIGH (3) ]    (disabled when pending)                │
└───────────────────────────────────────────────────────────────────────┘
```

Expanderad: per TX-rad, visa candidates med confidence-badge.

**Bulk-accept state-machine (V2 + Beslut 7):**
```typescript
const [pending, setPending] = useState(false)
const [results, setResults] = useState<{ ok: number; failed: Array<{txId: number, reason: string}> } | null>(null)

async function acceptAllHigh() {
  if (pending) return
  setPending(true); setResults(null)
  const highCandidates = /* pick first HIGH per tx */
  let ok = 0
  const failed: Array<{txId: number, reason: string}> = []
  for (const { txId, candidate } of highCandidates) {
    try {
      const r = await matchMutation.mutateAsync({ bank_transaction_id: txId, ... })
      if (r.success) ok++
      else failed.push({ txId, reason: r.error })
    } catch (e) {
      failed.push({ txId, reason: String(e) })
    }
  }
  setPending(false)
  setResults({ ok, failed })
  toast[failed.length ? 'warning' : 'success'](`${ok} av ${highCandidates.length} matchningar accepterade`)
}
```

### A5. E2E-specs (F1)

**A5-a happy:** `tests/e2e/bank-statement-auto-match.spec.ts`
- Seed 2 invoices (olika belopp + counterparty med IBAN)
- Import camt.053 med 2 TX som matchar belopp exakt + IBAN
- Klicka "Föreslå matchningar" → båda HIGH
- Klicka "Acceptera alla HIGH" → 2 A-serie-verifikat bokförda

**A5-b negative-path:** `tests/e2e/bank-statement-auto-match-empty.spec.ts`
- Seed 1 invoice utan counterparty-IBAN, 1 irrelevant belopp
- Importera camt.053 där ingen TX matchar
- Klicka "Föreslå matchningar" → panel visar "Inga förslag hittades"
- Verifiera att `matchBankTransaction` INTE anropas

## B. F63-polish-b SIE4-konflikt-UI — detaljerad design

### B1. Validator-extension

`SieValidationResult` utökas:
```typescript
export interface AccountConflict {
  account_number: string
  existing_name: string
  new_name: string
  /** Antal verifikat-rader i SIE-filen som refererar detta konto. Används av UI för V6-varning. */
  referenced_by_entries: number
}

export interface SieValidationResult {
  // ...existing fields
  conflicts: AccountConflict[]
}
```

Validator tar emot DB-handle + parseResult. Körs endast vid `strategy === 'merge'`. Bygger `conflicts[]` i en pass över `parseResult.accounts` + SELECT från `accounts`-tabellen. `referenced_by_entries` räknas från `parseResult.entries.transactions[].account`.

Tests (3):
- Namnkonflikt detekteras vid merge
- Inget konflikt vid 'new'-strategi (valideras separat)
- `referenced_by_entries` räknar korrekt

### B2. Import-service conflict-resolution + skip-dependency-check (V6)

```typescript
export interface ImportOptions {
  strategy: ImportStrategy
  fiscalYearId?: number
  conflict_resolutions?: Record<string, 'keep' | 'overwrite' | 'skip'>
}
```

Per konflikt:
- `'keep'`: existerande rad lämnas oförändrad (default vid missing resolution)
- `'overwrite'`: UPDATE accounts SET name = ? (tidigare tyst beteende, nu explicit)
- `'skip'`: kontot hoppas över + **VALIDATION_ERROR om några journal_entries refererar det** (pre-insert-check)

**Service-validering före insert (V6 defense-in-depth):**
```typescript
for (const [accNum, resolution] of Object.entries(conflict_resolutions ?? {})) {
  if (resolution === 'skip') {
    const referencedInParse = parseResult.entries.some(e =>
      e.transactions.some(t => t.account === accNum)
    )
    if (referencedInParse) {
      return { success: false, code: 'VALIDATION_ERROR',
        error: `Kan inte skippa konto ${accNum} — det används av ${N} verifikat i importen.`,
        field: `conflict_resolutions.${accNum}` }
    }
  }
}
```

Tests (5):
- `keep` lämnar existerande oförändrad
- `overwrite` uppdaterar namn
- `skip` med använd konto → `VALIDATION_ERROR` utan partial commit
- `skip` med oanvänd konto → OK
- Missing resolution defaultar till 'keep'

### B3. UI: ImportPreviewPhase konflikt-sektion + varning

State i `PageImport`: `conflictResolutions: Record<string, 'keep' | 'overwrite' | 'skip'>`.

Per konflikt-rad:
```
1230 — "Maskiner" (existerande) vs "Maskiner och utrustning" (SIE)
  (•) Behåll existerande   ( ) Skriv över   ( ) Skippa konto
```

**Vid skip + `referenced_by_entries > 0` (Beslut 10 + V6):**
```
⚠ Skip av 1230: 47 verifikat i SIE-filen refererar detta konto.
  Importen kan inte genomföras. Välj "Behåll existerande" eller "Skriv över".
```

`disabled={hasInvalidSkip}` på Importera-knappen. `hasInvalidSkip` = finns någon konto där `resolution === 'skip' && conflict.referenced_by_entries > 0`.

### B4. E2E-specs (F1)

**B4-a happy:** `tests/e2e/sie4-import-conflict.spec.ts`
- Seed 1930 med namn "Bank"
- SIE4 med 1930 namn "Företagskonto"
- Preview visar konflikt → välj "Skriv över" → importera → verifiera namn uppdaterat

**B4-b negative-path:** `tests/e2e/sie4-import-conflict-blocked.spec.ts`
- Seed 1930 med namn "Bank"
- SIE4 med 1930 (olika namn) + 1 verifikat som refererar 1930
- Preview visar konflikt → välj "Skippa" → importera-knapp `disabled`, varning syns
- Försök importera via direkt IPC → VALIDATION_ERROR med fält

## C. F67 pagination — detaljerad design

### C1. IPC + service

**InvoiceListInputSchema:**
```typescript
limit: z.number().int().min(1).max(200).default(50),
offset: z.number().int().min(0).default(0),
```

**listInvoices** returnerar:
```typescript
{
  items: InvoiceListItem[],
  counts: InvoiceStatusCounts,  // FY-totalt, oförändrat
  total_items: number            // MED filter (search, status) tillämpade
}
```

Implementation: lägg till separat `SELECT COUNT(*) FROM invoices i LEFT JOIN counterparties c ... WHERE ${conditions}` (utan LIMIT/OFFSET, samma WHERE som huvudquery). Parameter-bindings delas.

Samma för `expense:list`.

**getBankStatement:** tar `transaction_limit?`, `transaction_offset?`. Returnerar `{ statement, transactions, total_transactions }`.

Tests (5):
- offset=0, limit=10 → 10 items (om ≥10 finns)
- offset=10, limit=10 → items 11–20
- `counts[total]` oförändrat oavsett pagination (FY-totalt)
- `total_items === items.length` när filtrerat total ≤ limit (V5-regression)
- `total_items` reflekterar search-filter (V5 drift-test)

### C2. UI — Pagination + selection-bevarande (V3) + first-render-guard (V4)

Ny komponent `src/renderer/components/ui/Pagination.tsx`:
```typescript
interface PaginationProps {
  page: number
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  label?: string  // "fakturor", "kostnader", "transaktioner"
}
```

Renderar:
```
Visar 1–50 av 127 fakturor   [‹ Föregående] Sida 1 / 3 [Nästa ›]
```

Knappar `disabled` vid gräns. Ingen sidnr-picker (out-of-scope — kan läggas till i F67-polish).

**Integration i InvoiceList / ExpenseList / BankStatementDetail:**
```tsx
const [page, setPage] = useState(0)
const firstRender = useRef(true)

useEffect(() => {
  if (firstRender.current) { firstRender.current = false; return }
  setPage(0)
}, [status, sortBy, sortOrder, search])  // V4: skippar first render

// Selection (V3): selectedIds LEVER IGENOM page-byte
const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
// Vid FY-byte: rensa selectedIds (befintligt pattern)
```

Query med pagination:
```tsx
const { data } = useInvoiceList(fyId, {
  status, search, sort_by: sortBy, sort_order: sortOrder,
  limit: 50, offset: page * 50,
})
```

### C3. UI-unit-tester (4)

- Pagination-komponent: render "Visar 1–50 av 127", knappar enabled/disabled korrekt
- First-render-guard: mount med non-default `status` filter → `setPage` anropas INTE på första render
- Selection-bevarande: välj id=5 på page=0, byt till page=1, tillbaka till page=0 → id=5 fortfarande i selectedIds
- FY-byte rensar selection (befintligt beteende, regressionstest)

## Nya M-principer + enforcement-script (F3)

**M153 — Deterministisk scoring för auto-matchning + enforcement.**
Alla scoring-funktioner i `src/main/services/bank/bank-match-suggester.ts` (och framtida auto-klassificerare) ska vara:
1. **Heltalspoäng** — inga floats i score/thresholds.
2. **Deterministiska** — inga `Math.random`, `Date.now`, eller externa tillståndskällor.
3. **Rena** — samma input ger samma output oavsett när/var funktionen körs.

**Enforcement (F3):** `scripts/check-m153.mjs` kör AST-scan över `src/main/services/bank/**/*.ts`:
```js
// Förbjudna tokens i scoring-moduler:
const FORBIDDEN = [/Math\.random\b/, /Date\.now\b/, /performance\.now\b/]
// parseFloat/parseInt är OK (deterministiska)
```

`package.json`: `"check:m153": "node scripts/check-m153.mjs"`. Körs i valideringsmatrisen nedan.

Framtida backlog: expandera scope till `src/main/services/**/auto-*.ts` vid F66-d auto-klassificering.

## Order-of-operations

1. Playwright baseline (50/50) — kör `npx electron-rebuild -f -w better-sqlite3` + `npx playwright test`
2. **A1** Migration 040 + programmatic + verify + version-bumptests (39 → 40). Tabell-count oförändrat (36).
3. **A2** bank-match-suggester (service, classifySuggestions, pickMethod) + 13 unit-tester
4. **A3** IPC-kanal + hook + hook-unit-test (F6)
5. **A4** SuggestedMatchesPanel + bulk-accept state-machine + UI-unit-test
6. **A5** 2 E2E-specs (happy + negative)
7. **B1** Validator conflict-detection + 3 unit-tester
8. **B2** Import-service conflict_resolutions + skip-validering + 5 unit-tester
9. **B3** UI konflikt-sektion + invariant-varning i ImportPreviewPhase
10. **B4** 2 E2E-specs (happy + negative)
11. **C1** IPC-schema + service limit/offset + total_items + 5 unit-tester
12. **C2** Pagination-komponent + integration + selection-bevarande + first-render-guard
13. **C3** 4 UI-unit-tester
14. `scripts/check-m153.mjs` + package.json script
15. Validering: vitest, tsc, m131, m133, **m153**, Playwright
16. Docs (s56-summary, STATUS.md, CLAUDE.md + M153) + commit-kedja

## Test-strategi (realistiskt estimat, F2)

**A2. Scoring-suggester (13 tester):**
1. Belopp-exakt + IBAN-match → HIGH (130 score)
2. Belopp-exakt + samma datum (100+30=130) → HIGH när unik
3. Belopp-exakt + datum ±3 (100+25=125) → MEDIUM
4. Belopp-exakt + datum ±7 (100+15=115) → MEDIUM
5. Belopp ±50 öre + datum ±3 (60+25=85) → MEDIUM
6. Belopp ±50 öre + datum ±7 (60+15=75) → LOW, filtreras bort
7. Ingen amount-match → filtreras bort (score < 80)
8. Direction-guard: +TX ger bara invoices
9. Direction-guard: −TX ger bara expenses
10. V1: −TX med matching `|amount|` mot invoice → 0 candidates
11. Redan matchad TX: 0 suggestions
12. OCR-match i remittance_info (+40)
13. K5 tie-break: 2 invoices med identisk score → båda MEDIUM, toppen har äldst due_date

**A4. UI bulk-accept (2 tester):**
- Mock IPC → 2 av 5 failed → toast innehåller "3 av 5"
- Dubbelklick "Acceptera alla HIGH" under pending → andra klicket no-op

**A3. IPC hook (1 test):** error-state exponeras

**B1. Validator conflict-detector (3 tester):** se B1-sektion

**B2. Import-service conflict_resolutions (5 tester):** se B2-sektion

**C1. Pagination service (5 tester):** se C1-sektion

**C3. Pagination UI (4 tester):** se C3-sektion

**Migration smoke (2 tester):** version 40, idempotency

**M153-invariant (1 test):** scoreCandidate(tx, candidate) === scoreCandidate(tx, candidate) (determinism)

**M122-inventory + F5 rationale test (1 test):** bank_reconciliation_matches.match_method-kolumn accepterar alla 5 värden + rejecterar oväntat värde (CHECK-enforcing)

**E2E (4 specs):**
- bank-statement-auto-match.spec.ts (happy)
- bank-statement-auto-match-empty.spec.ts (negative)
- sie4-import-conflict.spec.ts (happy)
- sie4-import-conflict-blocked.spec.ts (negative)

**Total: 2343 → ~2395 tester (+52).**

## Acceptanskriterier (DoD)

### A. F66-b auto-matchning
- [ ] Migration 040 kör rent på tom DB + uppgradering från 39. Pre-flight whitelist (K2) fungerar. PRAGMA 40.
- [ ] `suggestMatchesForStatement` returnerar HIGH-classificerade candidates enligt scoring-matrix (Beslut 3).
- [ ] Direction-guard: V1-testet (negativ TX med matching `|amount|`) ger 0 candidates.
- [ ] K5 tie-break: två identiska candidates → båda MEDIUM, inte HIGH.
- [ ] SuggestedMatchesPanel visar HIGH-count + "Acceptera alla HIGH".
- [ ] Bulk-accept continue-on-error: 2 failures av 5 → toast "3 av 5".
- [ ] Accept applicerar via `matchBankTransaction`-path (M144).
- [ ] E2E: 2 specs gröna.

### B. F63-polish-b SIE4-konflikt
- [ ] Merge-strategi visar konflikter i preview-fasen.
- [ ] Default = 'keep' (inga tyst overwrites längre).
- [ ] Skip + used-account blockerar Importera-knappen (V6).
- [ ] Service-nivå skip-check (defense-in-depth) returnerar VALIDATION_ERROR utan partial commit.
- [ ] E2E: 2 specs gröna.

### C. F67 pagination
- [ ] listInvoices + listExpenses + getBankStatement tar limit/offset.
- [ ] `total_items` reflekterar aktiva filter (V5).
- [ ] `counts[total]` oförändrat (FY-totalt).
- [ ] Pagination-komponent visar rätt sidtal, disablar knappar vid gräns.
- [ ] First-render-guard: mount med non-default filter hoppar INTE till page=0 (V4).
- [ ] Selection-bevarande: selectedIds lever över page-byte (V3).

### M-enforcement
- [ ] `npm run check:m153` exit 0 på baseline (F3).
- [ ] M131 + M133 baseline oförändrade.

### Valideringsmatris
- [ ] Vitest: 2395+/2395+ ✅
- [ ] TSC: 0 fel
- [ ] M131: ✅, M133: baseline oförändrad, M153: ✅
- [ ] Playwright: 50 → 54/54 ✅ (+4)

## Commit-kedja (förväntad)

1. `feat(S56 A1)` — migration 040 + pre-flight + M141-inventering
2. `feat(S56 A2)` — bank-match-suggester + 13 tester
3. `feat(S56 A3+A4)` — IPC + SuggestedMatchesPanel + bulk-accept
4. `feat(S56 A5)` — 2 E2E auto-match
5. `feat(S56 B1+B2)` — SIE4 conflict-detector + resolutions + skip-check
6. `feat(S56 B3+B4)` — konflikt-UI + invariant-varning + 2 E2E
7. `feat(S56 C1)` — IPC + service pagination + total_items
8. `feat(S56 C2+C3)` — Pagination-komponent + selection-bevarande + tester
9. `chore(S56): check-m153 script` — scripts/check-m153.mjs
10. `docs(S56)` — summary + STATUS + CLAUDE.md (M153 + enforcement)

## QA-revision — sammanfattning av ändringar (vs draft 1)

Jämfört med ursprunglig S56-draft:

**Kritiska fixes (K1–K5):**
- K1: Migration 040 använder explicit kolumnlista i INSERT (ej `SELECT *`).
- K2: Pre-flight `SELECT DISTINCT match_method` + whitelist-abort (M38-mönstret).
- K3: M141 cross-table trigger-inventerings-query körs explicit i programmatic, även om förväntan är 0 träffar.
- K4: Scoring-signaler omarbetade: `date_close_3 = 25` är distinkt från `date_close_7 = 15`. Tabell i Beslut 3 ersätter tidigare lista.
- K5: "Unik topp-kandidat för HIGH" definierad explicit: klassificering sker FÖRE tie-breaking; ties → båda MEDIUM. Unit-test (#13 i A2) verifierar.

**Viktiga (V1–V6) — V7 avvisad som icke-risk:**
- V1: Explicit test för negativ TX med matching `|amount|` → 0 candidates (test #10).
- V2: Bulk-accept continue-on-error state-machine + disable-during-pending + UI-unit-test.
- V3: Selection-state bevaras över page-byte (ändrat från tidigare draft — säkerhetsventil för M112).
- V4: useRef-first-render-guard + test (#2 i C3).
- V5: `total_items` reflekterar filter; `counts[total]` är FY-wide. Drift-test (#5 i C1).
- V6: Skip + used-account blockeras i preview + defense-in-depth på service-nivå.

**Förbättringar (F-serie):**
- F1: 2 negative-path-E2E tillagda (A5-b, B4-b).
- F2: Test-estimat 37 → 52 (A2 10→13, +UI-tester, +migration-smoke, +M153-invariant).
- F3: `npm run check:m153` AST-scan införs som enforcement.
- F5: `reasons[]` är runtime-only (inte persisterad) — explicit decision, dokumenterad i Beslut 1.
- F6: A3 hook-unit-test för error-state.

**Scope:** 7.5 → 8.5 SP (inom budget 7–9).
