# Sprint 57 — prompt (UI + E2E follow-through från S56 + F66-c quick win)

**Tema:** Stänga UI/E2E-skulden från S56 + lägga till F66-c (IBAN ↔ counterparty
auto-uppdatering) som naturlig påbyggnad på A4.
**Scope:** ~5.5 SP (budget 5–7) • **Utgångspunkt:** S56-PARTIAL shipat
(2380 vitest, 50 Playwright, PRAGMA 40, M153).

## Mål

1. **(A4+A5) F66-b UI** — SuggestedMatchesPanel + bulk-accept i `BankStatementDetail`
   + 2 E2E (happy + negative).
2. **(B3+B4) F63-polish-b UI** — wire-through av conflicts från validate-IPC →
   ImportPreviewPhase + V6 invariant-blockad + 2 E2E.
3. **(C2+C3) F67 UI** — Pagination-komponent + integration i InvoiceList,
   ExpenseList (BankStatementDetail-transactions blir egen sub-task) + 4 UI-tester.
4. **(D) F66-c** — auto-uppdatering av `counterparties.bank_account` när manuell/
   auto-match sker mot TX som har IBAN och counterparty saknar IBAN.

**Beräknad test-delta:** 2380 → ~2415 vitest (+35). Playwright: 50 → 54 (+4).
PRAGMA: 40 (oförändrat — ingen migration). Inga nya M-principer.

## Scope-breakdown (5.5 SP)

| Del | SP | Innehåll |
|---|---|---|
| **A4.** SuggestedMatchesPanel + bulk-accept + UI-tester | 1.0 | Panel + state-machine + 2 RTL-tester |
| **A5.** 2 E2E auto-match (happy + negative) | 0.5 | Happy: HIGH bulk-accept; negative: inga förslag |
| **B3a.** validate-handler exponerar conflicts + Sie4ImportSchema utökas | 0.3 | IPC-pipe + ValidationResult-typ |
| **B3b.** ImportPreviewPhase konflikt-sektion + V6-varning | 0.5 | Radio-grupper + disable Importera-knappen |
| **B4.** 2 E2E SIE4-konflikt (happy + negative) | 0.3 | Re-use sie4-import.spec.ts-mönstret |
| **C2a.** Pagination-komponent (`<Pagination>`) | 0.4 | Visar X–Y av Z + nav-knappar |
| **C2b.** Integration: InvoiceList + ExpenseList | 0.6 | useState page + first-render-guard + selection-bevarande |
| **C3.** 4 UI-unit-tester | 0.3 | Pagination, first-render-guard, selection-bevarande, FY-byte regression |
| **D1.** F66-c counterparty.bank_account auto-update | 0.5 | Service-utvidgning av matchBankTransaction + 4 tester |
| **D2.** F66-c E2E (1 spec) | 0.2 | Verifiera bank_account är satt efter match |
| **D3.** F66-c-extension i suggester (re-rank med ny IBAN) | (skip) | Hör hemma i F66-d-backlog |
| **Docs + STATUS.md** | 0.2 | s57-summary + STATUS-uppdatering |
| **Reserv** | 0.7 | Test-flakighet, infra-debt, oförutsedda backend-blockers |
| **Summa** | **5.5** | Inom budget 5–7 |

## Upfront-beslut (låsta innan kod)

**Beslut 1: A4 SuggestedMatchesPanel placeras inuti `BankStatementDetail`.**
Ingen separat sida. Kollapsbar `<details>` ovanför transaktions-tabellen.
Initialt stängd; klick på "Föreslå matchningar" expanderar och triggar
`useSuggestBankMatches(statementId, true)`. Resultat cachas via React Query
30s (matchar `staleTime` i hook).

Layout:
```
┌ Föreslagna matchningar ─────────────────────── [ Föreslå matchningar ▼ ] ┐
│ Vid expansion + data:                                                       │
│   3 säkra (HIGH) · 7 möjliga (MEDIUM)        [ Acceptera alla HIGH (3) ]   │
│   ▸ TX 2026-03-15 · +12 500 kr · "ACME REF 1042"                            │
│       1042 · ACME AB · 12 500 kr   [HIGH 150]   [ Acceptera ]               │
│   ▸ TX 2026-03-16 · +8 000 kr                                               │
│       1041 · ACME AB · 8 000 kr     [MEDIUM 130] [ Acceptera ]              │
│       1043 · BETA AB · 8 000 kr     [MEDIUM 130] [ Acceptera ]              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Beslut 2: A4 bulk-accept använder existing `useMatchBankTransaction`-hook
via loop.** Ingen ny IPC-kanal för "match-multiple" — för många edge-cases
(per-rad-fel-rapportering, partial-success). Komponenten driver loopen och
ackumulerar `failures[]`.

State:
```ts
const [pending, setPending] = useState(false)
const [results, setResults] = useState<{ ok: number; failed: Array<{txId, reason}> } | null>(null)

async function acceptAllHigh() {
  if (pending) return
  setPending(true); setResults(null)
  const high = collectHighCandidates(suggestions)
  let ok = 0; const failed = []
  for (const { txId, candidate } of high) {
    try {
      const r = await matchMutation.mutateAsync({...})
      r.success ? ok++ : failed.push({ txId, reason: r.error })
    } catch (e) {
      failed.push({ txId, reason: String(e) })
    }
  }
  setPending(false); setResults({ ok, failed })
  toast[failed.length ? 'warning' : 'success'](`${ok} av ${high.length} accepterade`)
}
```

`disabled={pending}` på knappen + första-radens accept-knappar (förhindrar dubbelklick).

**Beslut 3: A4 enskilda accept-knappar per candidate.** Användaren kan välja
specifika MEDIUM-candidates utan att triggga bulk. Använder samma mutation.

**Beslut 4: Default `payment_account` = '1930'.** Ingen UI-prompt i panel-flödet
(skiljer sig från MatchDialog där användaren kan ändra). Reasonable default
för svenska företag; framtida F-item kan lägga till per-statement bank-konto-
detektion via IBAN.

**Beslut 5: B3a — validate-handler får ny output-shape.** `ValidationResult`
i `import-types.ts` utökas med `conflicts: AccountConflict[]`. Handlern
`import:sie4-validate` anropar `detectAccountConflicts(db, parseResult)`
efter `validateSieParseResult`. Validate-handler är nu DB-beroende (idag är
det en pure parse). Acceptabel — DB är tillgänglig i handlern via closure.

**Beslut 6: B3a — Sie4ImportSchema utökas med `conflict_resolutions`.**
```ts
conflict_resolutions: z.record(
  z.string(),
  z.enum(['keep', 'overwrite', 'skip'])
).optional()
```
Backward-compat: avsaknad → tom objekt → defaultar 'keep' i service (M-deciderat
i S56 B2).

**Beslut 7: B3b — UI default 'keep'.** Vid första render efter validate
initieras `conflictResolutions = {}` (inte fyll i 'keep' explicit). Service
defaultar. UI visar radio "Behåll existerande (default)" som checked när
inget värde är satt för konto.

**Beslut 8: B3b — V6-blockad är pure UI.** Disable Importera-knappen när
`hasInvalidSkip = conflicts.some(c => resolutions[c.account_number] === 'skip' && c.referenced_by_entries > 0)`.
Defense-in-depth på service-nivå (S56 B2) blockerar även om någon kringgår
UI:t. Inget extra IPC-anrop för validering — UI använder befintlig
`validation.conflicts[]`-data.

**Beslut 9: B4 — 2 E2E specs återanvänder sie4-import.spec.ts-mönstret.**
- Happy: seed company + 1930 "Bank" → mock E2E_MOCK_OPEN_FILE pekar på SIE
  med 1930 "Företagskonto" + 1 verifikat → preview visar konflikt → klick
  "Skriv över" → klick Importera → assert namn = "Företagskonto".
- Negative: samma fil → klick "Skippa" → assert Importera-knappen `disabled`,
  varningstext synlig.

**Beslut 10: C2a — Pagination-komponent är "dum".**
```ts
interface PaginationProps {
  page: number              // 0-indexed
  pageSize: number
  totalItems: number
  onPageChange: (page: number) => void
  label?: string            // 'fakturor' | 'kostnader' | 'transaktioner'
  testIdPrefix?: string     // för E2E-stabilitet
}
```
Renderar `Visar X–Y av Z {label}` + `‹` `Sida N / M` `›`. Knappar
disabled vid gräns. Inget sidnr-väljare (out-of-scope, F-item om behov).

**Beslut 11: C2b — page-state lever i List-komponenten, INTE i context.**
Varje lista har egen pagination-state. FY-byte rensar via existing
`activeFiscalYear`-prop-effekt.

```ts
const [page, setPage] = useState(0)
const firstRender = useRef(true)
useEffect(() => {
  if (firstRender.current) { firstRender.current = false; return }
  setPage(0)
}, [statusFilter, debouncedSearch, sortBy, sortOrder])

useEffect(() => {
  setPage(0)
  setSelectedIds(new Set())  // FY-byte rensar selection
}, [activeFiscalYear?.id])
```

**Beslut 12: C2b — selection-bevarande över sidor är default.**
`selectedIds: Set<number>` påverkas EJ av page-byte. Detta är säkerhets-
ventilen för M112 (bulk-payment) — förlorad selection skulle kunna ge tysta
felaktiga bulk-betalningar. Användaren ser `{selectedIds.size} valda` även
när hen är på en annan sida.

**Beslut 13: C2 — BankStatementDetail-transactions paginerar INTE i S57.**
S56 C1 implementerade aldrig `transaction_limit/offset` i `getBankStatement`-
schemat (vilket var planerat). Eftersom statements typiskt har <100 TX är
risken låg — uppskjutet till F67-extension om behov uppstår.

**Beslut 14: D1 — F66-c auto-uppdatering är opportunistisk.**
I `matchBankTransaction` (efter lyckad match): om `tx.counterparty_iban`
finns OCH counterparty (via invoice/expense → counterparty_id) saknar
`bank_account`, sätt det till normaliserad IBAN. Konflikt (befintlig IBAN
skiljer sig) → skriv inte över, logga warning. Detta påverkar inte
suggester direkt — nästa anrop kommer hämta nya counterparty-data via React
Query-invalidation.

```ts
// I matchBankTransaction, efter step 4 (reconciliation insert):
if (tx.counterparty_iban) {
  const cpRow = db.prepare(
    `SELECT c.id, c.bank_account
     FROM counterparties c
     JOIN ${input.matched_entity_type}s e ON e.counterparty_id = c.id
     WHERE e.id = ?`
  ).get(input.matched_entity_id) as { id: number; bank_account: string | null } | undefined
  if (cpRow && !cpRow.bank_account) {
    db.prepare('UPDATE counterparties SET bank_account = ? WHERE id = ?')
      .run(normalizeIban(tx.counterparty_iban), cpRow.id)
  }
}
```

**Beslut 15: D1 — normalizeIban() exporteras från suggester och återanvänds.**
DRY mellan suggester-scoring och D1-uppdatering.

## A. F66-b UI (A4 + A5)

### A4. SuggestedMatchesPanel

Ny komponent: `src/renderer/components/bank/SuggestedMatchesPanel.tsx`.
Importeras i `PageBankStatements.tsx::BankStatementDetail` ovanför
transaktions-tabellen.

Props:
```ts
interface Props {
  statementId: number
}
```

Internal:
- `useSuggestBankMatches(statementId, expanded)` — bara aktiv när panelen är expanderad
- `useState` för: `expanded`, `pending`, `results`
- `acceptOne(txId, candidate)` + `acceptAllHigh()` — båda använder
  `useMatchBankTransaction()`-mutation

Test-fil: `tests/renderer/components/bank/SuggestedMatchesPanel.test.tsx`.
Testfall:
1. Expandera utan data → loader visas, IPC-anrop sker en gång
2. Bulk-accept med 5 HIGH → mock 2 failures → toast-text "3 av 5 accepterade",
   `failures[]`-detail-lista visas

### A5. 2 E2E

`tests/e2e/bank-statement-auto-match.spec.ts` (happy):
- Seed: 1 customer (med IBAN `SE4550000000058398257466`), 1 finalize:ad invoice
  (12_500 öre)
- Importera camt.053 med 1 TX (+125.00, samma IBAN)
- Navigate till bank-statement-detail
- Expandera SuggestedMatchesPanel → klick "Acceptera alla HIGH (1)"
- Assert: toast-text "1 av 1 accepterade", TX visar "Matchad", verifikat i
  A-serie via `getJournalEntries()`

`tests/e2e/bank-statement-auto-match-empty.spec.ts` (negative):
- Seed: 1 invoice utan counterparty-IBAN
- Importera camt.053 med 1 TX där belopp inte matchar
- Klick "Föreslå matchningar" → assert text "Inga förslag hittades"

## B. F63-polish-b UI (B3 + B4)

### B3a. Backend-pipe (IPC + types)

1. `Sie4ImportSchema` utökad:
   ```ts
   conflict_resolutions: z.record(
     z.string(), z.enum(['keep', 'overwrite', 'skip'])
   ).optional()
   ```
2. `import-types.ts::ValidationResult` utökad: `conflicts: AccountConflict[]`
3. `import:sie4-validate`-handler: efter `validateSieParseResult` → anropa
   `detectAccountConflicts(db, parseResult)` och inkludera i returobjektet
4. `import:sie4-execute`-handler: skicka `data.conflict_resolutions` vidare till
   `importSie4(db, parseResult, { strategy, fiscalYearId, conflict_resolutions })`

Test: `tests/ipc-sie4-import.test.ts` får 2 nya testfall som verifierar
shape-utökningen (validate returnerar conflicts; execute accepterar
conflict_resolutions och förmedlar dem).

### B3b. ImportPreviewPhase

Ny prop:
```ts
conflictResolutions: Record<string, 'keep' | 'overwrite' | 'skip'>
onConflictResolutionChange: (accNum: string, r: 'keep' | 'overwrite' | 'skip') => void
```

State i `PageImport`:
```ts
const [conflictResolutions, setConflictResolutions] = useState<Record<string, 'keep' | 'overwrite' | 'skip'>>({})
// Reset vid ny validation:
useEffect(() => { setConflictResolutions({}) }, [filePath])
```

Render i ImportPreviewPhase (när `strategy === 'merge'` OCH `conflicts.length > 0`):
```
┌ Konto-konflikter (3) ──────────────────────────────────────────────┐
│ 1230 — "Maskiner" (existerande) vs "Maskiner och utrustning" (SIE) │
│   (•) Behåll existerande   ( ) Skriv över   ( ) Skippa konto       │
│                                                                     │
│ 1930 — "Bank" (existerande) vs "Företagskonto" (SIE)                │
│   ( ) Behåll existerande   ( ) Skriv över   (•) Skippa konto       │
│   ⚠ Skip av 1930: 47 verifikat refererar detta konto. Importen     │
│     kan inte genomföras. Välj "Behåll" eller "Skriv över".          │
└─────────────────────────────────────────────────────────────────────┘
```

`handleImport()` skickar `conflict_resolutions: conflictResolutions` med.

`hasInvalidSkip = conflicts.some(...)` → `disabled` på Importera-knappen +
hjälptext under knappen.

Test-fil: `tests/renderer/components/import/ImportPreviewPhase.test.tsx`.
Testfall (4):
1. Inga conflicts → ingen sektion renderas
2. 1 conflict + default-keep → radio "Behåll" är checked
3. Skip på used-account → varningstext + Importera-knapp `disabled`
4. Skip på unused-account → ingen varning, knapp aktiv

### B4. 2 E2E

`tests/e2e/sie4-import-conflict.spec.ts` (happy):
- Seed: company med 1930 "Bank"
- SIE-fil med 1930 "Företagskonto" + ingen verifikat-referens till 1930
- Navigate → välj fil (E2E_MOCK_OPEN_FILE) → preview visar konflikt →
  klick "Skriv över" → klick Importera → assert namn uppdaterat

`tests/e2e/sie4-import-conflict-blocked.spec.ts` (negative):
- Seed: company med 1930 "Bank"
- SIE-fil med 1930 "Företagskonto" + 1 verifikat refererar 1930
- Klick "Skippa" → assert: Importera-knappen `disabled`, varningstext synlig

## C. F67 UI (C2 + C3)

### C2a. `<Pagination>`-komponent

`src/renderer/components/ui/Pagination.tsx`:
```tsx
export function Pagination({ page, pageSize, totalItems, onPageChange, label = 'rader', testIdPrefix = 'pag' }: Props) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const from = totalItems === 0 ? 0 : page * pageSize + 1
  const to = Math.min((page + 1) * pageSize, totalItems)
  return (
    <div className="flex items-center justify-between gap-4 border-t px-4 py-2 text-sm">
      <span className="text-muted-foreground" data-testid={`${testIdPrefix}-summary`}>
        Visar {from}–{to} av {totalItems} {label}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          data-testid={`${testIdPrefix}-prev`}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >‹ Föregående</button>
        <span data-testid={`${testIdPrefix}-position`}>Sida {page + 1} / {totalPages}</span>
        <button
          type="button"
          disabled={page >= totalPages - 1}
          onClick={() => onPageChange(page + 1)}
          data-testid={`${testIdPrefix}-next`}
          className="rounded border px-2 py-1 disabled:opacity-50"
        >Nästa ›</button>
      </div>
    </div>
  )
}
```

### C2b. Integration

**InvoiceList.tsx + ExpenseList.tsx:**
```ts
const [page, setPage] = useState(0)
const PAGE_SIZE = 50
const firstRender = useRef(true)

useEffect(() => {
  if (firstRender.current) { firstRender.current = false; return }
  setPage(0)
}, [statusFilter, debouncedSearch /* , sortBy, sortOrder vid framtida sort-state */])

useEffect(() => {
  setPage(0)
  setSelectedIds(new Set())
}, [activeFiscalYear?.id])

// Anrop:
const response = useInvoiceList(activeFiscalYear?.id, {
  status: statusFilter,
  search: debouncedSearch || undefined,
  limit: PAGE_SIZE,
  offset: page * PAGE_SIZE,
})

// Render <Pagination ... /> efter tabellen, före bulk-action-baren
const totalItems = response.data?.total_items ?? 0
```

**Hook-uppdatering** (`useInvoiceList`, `useExpenses`): lägg till `limit` +
`offset` i filter-typen. Query-key inkluderar dem så att olika sidor cachas
separat.

### C3. 4 UI-tester

`tests/renderer/components/ui/Pagination.test.tsx`:
1. Render: "Visar 1–50 av 127 fakturor", knappar enabled/disabled korrekt
2. First-render-guard (i InvoiceList): mount med non-default `statusFilter`
   → `setPage` anropas INTE på första render (verifiera via mock på
   useInvoiceList)

`tests/renderer/components/invoices/InvoiceList-pagination.test.tsx`
(eller utöka befintlig InvoiceList.test.tsx):
3. Selection-bevarande: välj id=5 på page=0, byt page → tillbaka, id=5 är
   fortfarande i selectedIds
4. FY-byte rensar selection (regression — befintligt beteende)

## D. F66-c counterparty.bank_account auto-update

### D1. Service-utvidgning

I `src/main/services/bank/bank-match-service.ts` (efter step 4 reconciliation
insert, före step 5 status-flip):

```ts
// F66-c: auto-uppdatera counterparty.bank_account om saknas
if (tx.counterparty_iban) {
  const ibanNorm = normalizeIban(tx.counterparty_iban)
  const cpRow = db.prepare(
    input.matched_entity_type === 'invoice'
      ? `SELECT c.id, c.bank_account
         FROM counterparties c JOIN invoices i ON i.counterparty_id = c.id
         WHERE i.id = ?`
      : `SELECT c.id, c.bank_account
         FROM counterparties c JOIN expenses e ON e.counterparty_id = c.id
         WHERE e.id = ?`
  ).get(input.matched_entity_id) as { id: number; bank_account: string | null } | undefined

  if (cpRow && !cpRow.bank_account) {
    db.prepare('UPDATE counterparties SET bank_account = ? WHERE id = ?')
      .run(ibanNorm, cpRow.id)
  } else if (cpRow && cpRow.bank_account && normalizeIban(cpRow.bank_account) !== ibanNorm) {
    log.warn(`F66-c: IBAN-konflikt för counterparty ${cpRow.id}: ${cpRow.bank_account} vs ${tx.counterparty_iban} — skriver inte över`)
  }
}
```

`normalizeIban` exporteras från `bank-match-suggester.ts` och importeras i
match-service.

Tester (`tests/session-57-iban-autoupdate.test.ts`, 4):
1. Manuell match med TX-IBAN + counterparty saknar IBAN → bank_account satt
2. Match utan TX-IBAN → ingen uppdatering
3. Counterparty redan har samma IBAN → ingen UPDATE-statement körs (verifiera
   via `prepare-spy` eller via "ingen log-warning")
4. Counterparty har OLIKA IBAN → varning loggas, befintlig IBAN behålls

### D2. E2E (1 spec)

`tests/e2e/bank-iban-autoupdate.spec.ts`:
- Seed: customer utan IBAN, invoice
- Importera camt.053 med IBAN i counterparty_iban-fält
- Manuell match via UI
- Assert via `__test:listCounterparties`-helper: counterparty.bank_account är
  satt till normaliserad IBAN

(Helper kan behöva läggas till i `tests/e2e/helpers/test-api.ts` om den
inte finns — `__testApi`-IPC redan exponerar listCounterparties? Verifiera.)

## Ny testbaslinje (förväntat)

| Del | Tester |
|---|---|
| A4 | 2 RTL |
| A5 | 2 E2E |
| B3a | 2 IPC |
| B3b | 4 RTL |
| B4 | 2 E2E |
| C2a | 1 RTL (Pagination component) |
| C3 | 3 RTL (first-render-guard, selection-bevarande, FY-byte) |
| D1 | 4 unit |
| D2 | 1 E2E |
| **Σ vitest** | **+16** |
| **Σ Playwright** | **+5** |

Bredare regression: befintliga InvoiceList- och ExpenseList-tester kan
behöva små justeringar för att hantera `total_items`-fältet i mockad
respons. Reserv-budget täcker.

**Total: 2380 → ~2396 vitest. Playwright: 50 → 55.**

(Lägre än S56-prognos om +52 — många UI-tester kräver bredare setup;
realistiskt antal efter S56-erfarenheten.)

## Order-of-operations

1. **B3a backend-pipe** först (validate-handler exposar conflicts) — låser
   typer och låter B3b/B4 köra parallellt
2. **C2a Pagination-komponent** (isolerad, 1 RTL-test)
3. **C2b InvoiceList integration** + 2 RTL (selection + FY-byte)
4. **C2b ExpenseList integration**
5. **B3b ImportPreviewPhase** + 4 RTL
6. **A4 SuggestedMatchesPanel** + 2 RTL (kan göras parallellt med B3b)
7. **D1 F66-c service-update** + 4 unit-tester
8. **A5 E2E happy + negative**
9. **B4 E2E happy + negative**
10. **D2 E2E IBAN-autoupdate**
11. Validering: vitest, tsc, m131, m133, m153, Playwright
12. Docs (s57-summary + STATUS.md). CLAUDE.md INTE uppdaterad (inga nya
    M-principer i S57).
13. Commit-kedja.

## Acceptanskriterier (DoD)

### A. F66-b UI
- [ ] SuggestedMatchesPanel renderas i BankStatementDetail
- [ ] Bulk-accept loop: per-rad-fel ackumuleras, toast visar `${ok} av ${total}`
- [ ] Disable-during-pending förhindrar dubbelklick
- [ ] 2 E2E gröna (happy + negative)

### B. F63-polish-b UI
- [ ] validate-handler returnerar conflicts[]
- [ ] ImportPreviewPhase visar konflikt-sektion vid merge + conflicts > 0
- [ ] V6 invariant-blockad: skip + used → Importera-knappen disabled
- [ ] 4 RTL + 2 E2E gröna

### C. F67 UI
- [ ] Pagination-komponent renderar `Visar X–Y av Z` korrekt
- [ ] InvoiceList + ExpenseList paginerar (default 50)
- [ ] First-render-guard fungerar (verifierat med RTL)
- [ ] Selection-bevarande över page-byte (regression-skydd för M112)
- [ ] FY-byte rensar selection

### D. F66-c
- [ ] matchBankTransaction skriver `bank_account` när tx.counterparty_iban + saknas
- [ ] Konflikt → varning loggas, ingen UPDATE
- [ ] 4 unit + 1 E2E gröna

### Valideringsmatris
- [ ] Vitest: 2396+/2396+ ✅
- [ ] TSC: 0 fel
- [ ] M131 + M133 baseline + M153: ✅
- [ ] Playwright: 50 → 55/55 ✅ (+5)

## Commit-kedja (förväntad)

1. `feat(S57 B3a): SIE4 validate-handler exponerar conflicts[]`
2. `feat(S57 C2a): Pagination-komponent + 1 RTL`
3. `feat(S57 C2b+C3): InvoiceList + ExpenseList pagination + 3 RTL`
4. `feat(S57 B3b): ImportPreviewPhase konflikt-sektion + 4 RTL`
5. `feat(S57 A4): SuggestedMatchesPanel + bulk-accept + 2 RTL`
6. `feat(S57 D1): F66-c counterparty.bank_account auto-update + 4 tester`
7. `feat(S57 A5): 2 E2E auto-match`
8. `feat(S57 B4): 2 E2E SIE4-konflikt`
9. `feat(S57 D2): 1 E2E IBAN-autoupdate`
10. `docs(S57)` — summary + STATUS.md

## Risker och fallbacks

**Risk 1: useDebouncedSearch + first-render-guard interaktion.**
debouncedSearch ändras async vid mount → kan trigga page-reset på "second
render" trots ref-guard. Mitigation: jämför `prevDebouncedSearch.current`
istället för att reagera på ändring.

**Risk 2: Bulk-accept-loop kan ge inkonsekvent UI om mutation mid-flight
invaliderar React Query-cache.** matchBankTransaction-mutation invaliderar
`allBankStatements` + `allInvoices` + `allExpenses` per anrop → re-render
mellan loop-steg. Mitigation: läs candidates en gång före loopen, inte från
React Query-state under loopen.

**Risk 3: B3a — validate-handler är nu DB-beroende.** ipc-sie4-import-tester
som inte använder seedad DB kan brytas. Mitigation: dessa tester kör redan
mot test-DB (kontrollerad).

**Risk 4: D1 IBAN-konflikt-loggen är icke-deterministisk.** electron-log
kan mata till stdout/fil under tester. Mitigation: använd `vi.spyOn(log, 'warn')`
i test 4 istället för stdout-capture.

**Fallback om scope överstiger budget:** Skippa D2 (E2E för IBAN-autoupdate)
först — feature är värdefull men E2E-skydd kan vänta. Sedan B4 (negativ
E2E) — UI-validering testas redan i B3b RTL.

## Tekniska anteckningar

- **Mock-IPC i tests/setup/mock-ipc.ts** saknar fortfarande bank-metoder
  (känd debt sedan S55). A4 RTL-tester mockar `window.api` direkt
  (samma mönster som S56 A3-test).
- **Pagination-state och localStorage**: out-of-scope för S57. Användaren
  förlorar page-position vid sidbyte i routern. F-item om behov uppstår.
- **Sort-state**: InvoiceList/ExpenseList har idag default-sort i hooks/service
  (sort_by='invoice_date', sort_order='desc'). Ingen UI för att ändra sort —
  first-render-guard behöver alltså inte hantera sort-state-ändringar idag.
  När sort-UI tillkommer (framtida F-item) måste deps-arrayen utökas.

## Vad som INTE ingår

- **F66-d** auto-klassificering bankavgifter/ränta — kräver nytt service-lager
  + UI-flöde, ~3 SP, separat sprint
- **F66-e** bank-match unmatch via correction-service — kräver design-
  beslut om reconciliation-rollback semantik (förfaller bara reconciliation-
  raden eller även underliggande payment-verifikat?)
- **F62-c E2E-spec** — låg prioritet, F62 har god unit-coverage
- **F62-d** asset-redigering — komplex pga schedule-regeneration när
  metod/livslängd/restvärde ändras + behov att blockera om något schedule-
  steg redan är executed. ~2 SP, separat prompt
- **F49-b** AST-baserad M133 — låg prioritet, grep-versionen täcker huvudfall
- **F68/F69** A11y-bredd / M133-städning — bör tas tillsammans (~1.5 SP)
  som dedicated kvalitets-sprint
- **camt.054 / MT940 / BGC** — backlog för andra halvan av 2026
