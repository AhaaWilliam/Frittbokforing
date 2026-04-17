# Sprint A / S58 — Bank-MVP stängning (F66-d + F66-e)

**Tema:** Stäng bank-reconciliation-storyn som började i S55 (manuell match) och
fortsatte i S56–S57 (auto-match-suggester). Nu läggs auto-klassificering av
bankavgifter/ränta till (F66-d) och unmatch via correction-service (F66-e).
**Scope:** ~6.5 SP (budget 5–7). **Utgångspunkt:** S57 KLAR (2402 vitest, 55
Playwright-specs, PRAGMA 40, M153).

**Namngivning:** sprinten benämns "Sprint A / S58" i docs/STATUS. Commits
använder `S58` som prefix. Välj aldrig "Sprint A" i commits — `S58` är
sök-stabilt.

## Mål

1. **(A) F66-d backend** — parser utökad, `bank-fee-classifier.ts`-service,
   ny migration 041 (match_method-utökning + fee_journal_entry_id-kolumn +
   BkTxCd-fält på bank_transactions), `bank-fee-entry-service.ts`.
2. **(B) F66-d UI** — integration i befintlig `SuggestedMatchesPanel` så att
   fee/interest-förslag visas sida vid sida med invoice/expense-förslag.
3. **(C) F66-e backend** — unmatch-service som komponerar
   correction-service + reconciliation-DELETE + payment-DELETE atomärt
   (paid_amount-spegling via M101 bibehålls automatiskt).
4. **(D) F66-e UI** — "Ångra match"-knapp på matched TX:er (disabled med
   tooltip på batch-payments) + bekräftelse-dialog.
5. **(E) M-principer + enforcement** — M154 (unmatch-semantik) +
   ErrorCode-additioner + M153-scope-verifiering.

**Beräknad test-delta:** 2402 → 2436 vitest (+34). Playwright: 55 → 58 (+3).
PRAGMA: 40 → 41 (migration 041). **1 ny M-princip:** M154.

## Scope-breakdown (6.5 SP)

| Del | SP | Innehåll |
|---|---|---|
| **A1.** Migration 041 — match_method + fee_journal_entry_id + BkTxCd-fält | 0.7 | M122 table-recreate + data-integrity pre-flight + M141-inventering |
| **A2.** camt053-parser utökad med BkTxCd-domain/family/subfamily | 0.3 | ISO 20022 path-parsing + 3 parser-tester |
| **A3.** `bank-fee-classifier.ts` service (M153-kompatibel) | 0.8 | classifyTx + score + reasons, 10 tester |
| **A4.** `bank-fee-entry-service.ts` — skapa bankfee-verifikat | 0.7 | Split A/B-serie enligt tecken, 6 tester + prereq-smoke |
| **A5.** Integration i `bank-match-suggester.ts` | 0.3 | Fee-candidates per TX, 3 tester |
| **B1.** UI: fee-candidates i SuggestedMatchesPanel + bulk-accept chronology | 0.5 | ny candidate-typ + accept-handler + pre-sort |
| **B2.** UI-tester (RTL) | 0.2 | 2 RTL (fee-candidate-render + accept) |
| **B3.** 1 E2E fee-auto-match | 0.3 | camt.053 med BkTxCd=CHRG → bulk-accept |
| **C1.** `bank-unmatch-service.ts` | 1.0 | Atomär sammansatt operation, 8 tester |
| **C2.** IPC + preload + hook (`useUnmatchBankTransaction`) + ErrorCodes | 0.3 | M144 wrapped IpcResult |
| **C3.** Guards: batch-payment, closed period, already-corrected | 0.3 | Strukturerade fel, 3 tester (inkluderade i C1) |
| **D1.** UI: "Ångra"-knapp (disabled på batch) + bekräftelse-dialog | 0.4 | ny knapp på matched-rader + tooltip |
| **D2.** 2 E2E (unmatch happy + unmatch-blocked-på-batch) | 0.3 | __testApi-helpers |
| **E.** CLAUDE.md M154 + M153-scope + docs + STATUS | 0.3 | Skrivning |
| **Reserv** | 0.4 | Infra, oförutsedda edge-cases |
| **Summa** | **6.5** | Inom budget 5–7 |

---

## Upfront-beslut (låsta innan kod)

### F66-e semantik — M101-kompatibilitet (LÅST)

**Beslut P1 (kritiskt).** Unmatch **DELETE:ar payment-raden** i
`invoice_payments`/`expense_payments`. Den bevaras INTE som audit-trail —
korrigeringsverifikatet (C-serie) är audit-trailen. Skälet:

- **M101 kräver att `paid_amount_ore = SUM(payments.amount)`.** Att bevara
  payment-raden och samtidigt sänka `paid_amount_ore` bryter invarianten.
- **Voided-flag-alternativet** (nytt `voided_at`-fält + exkludera i
  SUM-queries + paid_amount-CASE + alla listningar + dashboard) är en
  schema-breaking ändring som inte ryms i scope och inte motiverar sin
  komplexitet när C-serie-korrigeringen ger full spårbarhet.
- **FK `ON DELETE RESTRICT`** från `bank_reconciliation_matches` →
  `invoice_payments`/`expense_payments` kräver att reconciliation-raden
  raderas FÖRE payment-raden. Unmatch-service ordnar detta.
- **FK `ON DELETE RESTRICT`** från `bank_reconciliation_matches` →
  `journal_entries` (via `fee_journal_entry_id`) förhindrar direktradering.
  Det är OK: fee-unmatch hanterar reconciliation-DELETE före
  `createCorrectionEntry` (vilket INTE raderar original-journal-entry, bara
  lägger motpost + sätter `corrected_by_id`).

**Beslut P2 (prereq-test).** Innan C1 påbörjas körs en **prereq-smoke**:
verifiera att `createCorrectionEntry` korrekt kan köras mot ett
payment-verifikat (A-serie från `payInvoice`, B-serie från `payExpense`) och
att resultatet är omvänd D/K. Om denna test saknas idag läggs den till som
en del av C1 (se C1 testlista nedan). Detta garanterar att unmatch-
flödet inte bygger på outestat antagande.

### F66-d design

**Beslut A1.** Migration 041 kör M122 table-recreate på
`bank_reconciliation_matches` för:
1. CHECK `match_method IN ('manual','auto_amount_exact','auto_amount_date','auto_amount_ref','auto_iban','auto_fee','auto_interest_income','auto_interest_expense')`.
2. Ny kolumn `fee_journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE RESTRICT`.
3. CHECK `exactly_one_of`:
   - `matched_entity_type='invoice'`: `invoice_payment_id IS NOT NULL AND expense_payment_id IS NULL AND fee_journal_entry_id IS NULL AND matched_entity_id IS NOT NULL`
   - `matched_entity_type='expense'`: `expense_payment_id IS NOT NULL AND invoice_payment_id IS NULL AND fee_journal_entry_id IS NULL AND matched_entity_id IS NOT NULL`
   - `matched_entity_type='bank_fee'`: `fee_journal_entry_id IS NOT NULL AND invoice_payment_id IS NULL AND expense_payment_id IS NULL AND matched_entity_id IS NULL`
4. `matched_entity_type` CHECK utökas med `'bank_fee'`.
5. Nya kolumner på `bank_transactions`: `bank_tx_domain TEXT`,
   `bank_tx_family TEXT`, `bank_tx_subfamily TEXT` (alla NULL-tillåtna).
   `bank_transaction_code` behålls för backward-compat, markeras i kommentar
   som deprecerad.

**Pre-flight (utanför transaktion):** M141 cross-table-inventering + **tre
data-integrity-queries** som MÅSTE returnera 0 rader innan recreate:

```sql
-- Q1: match_method-whitelist
SELECT COUNT(*) FROM bank_reconciliation_matches
WHERE match_method NOT IN ('manual','auto_amount_exact','auto_amount_date','auto_amount_ref','auto_iban');

-- Q2: exactly-one-of för befintlig data (skyddar mot att CHECK failar vid INSERT ... SELECT)
SELECT COUNT(*) FROM bank_reconciliation_matches
WHERE NOT (
  (matched_entity_type='invoice' AND invoice_payment_id IS NOT NULL AND expense_payment_id IS NULL AND matched_entity_id IS NOT NULL) OR
  (matched_entity_type='expense' AND expense_payment_id IS NOT NULL AND invoice_payment_id IS NULL AND matched_entity_id IS NOT NULL)
);

-- Q3: M141-inventering (informativ — dokumenteras i migration-kommentar)
SELECT name, tbl_name, sql FROM sqlite_master
WHERE type='trigger' AND sql LIKE '%bank_reconciliation_matches%'
  AND tbl_name != 'bank_reconciliation_matches';
```

Om Q1 eller Q2 returnerar > 0 rader → kasta fel i migrationen med tydligt
meddelande som pekar på korrupt data.

**Post-flight (efter txn, foreign_keys=ON):** `PRAGMA foreign_key_check`
måste vara tom. Annars rulla tillbaka externt.

**Ingen `journal_entries`-recreate i S58.** Se Beslut A4 nedan (split
A/B-serie) — vi behöver inte införa ny verifikationsserie.

**Beslut A2.** `camt053-parser.ts` utökas:
```ts
interface ParsedBankTx {
  // ... befintliga fält
  bank_tx_domain: string | null       // ISO 20022 BkTxCd-Domn.Cd
  bank_tx_family: string | null       // BkTxCd-Domn.Fmly.Cd
  bank_tx_subfamily: string | null    // BkTxCd-Domn.Fmly.SubFmlyCd
}
```

3 tester i `tests/session-55-camt053-parser.test.ts`:
1. Full BkTxCd-hierarki → alla tre fält satta
2. Bara `<Prtry><Cd>` → alla tre NULL
3. Ingen BkTxCd → alla tre NULL

**Beslut A3 (scoring — LÅST).** `src/main/services/bank/bank-fee-classifier.ts`:

```ts
export type FeeType = 'bank_fee' | 'interest_income' | 'interest_expense'

export interface FeeClassification {
  type: FeeType
  account: '6570' | '8310' | '8410'
  series: 'A' | 'B'
  score: number                    // HELTAL
  confidence: 'HIGH' | 'MEDIUM'
  reasons: string[]
  method: 'auto_fee' | 'auto_interest_income' | 'auto_interest_expense'
}

export function classifyBankFeeTx(tx: BankTxInput): FeeClassification | null
```

**Scoring-regler (deterministiska, heltalsaritmetik, M153-kompatibla):**

| Signal | Poäng | Villkor |
|---|---|---|
| BkTxCd primär: `subfamily='CHRG'` | +100 | → bank_fee (6570, B-serie) |
| BkTxCd primär: `subfamily='INTR' AND amount_ore > 0` | +100 | → interest_income (8310, A-serie) |
| BkTxCd primär: `subfamily='INTR' AND amount_ore < 0` | +100 | → interest_expense (8410, B-serie) |
| Counterparty-namn bank-heuristik | +30 | `/^(bank|seb|swedbank|handelsbanken|nordea|danske|icabank|lf|länsförsäkringar)/i` |
| Text-heuristik fee | +40 | remittance_info matchar `/\b(avgift|fee|charge|kostnad|serviceavgift)\b/i` |
| Text-heuristik interest | +40 | `/\b(ränta|interest)\b/i` |

**Belopps-gräns:** `abs(amount_ore) > MAX_FEE_HEURISTIC_ORE` (konstant =
**100 000 öre = 1 000 kr**, definierad i `src/shared/constants.ts` per M132)
**reject:ar endast heuristik-baserad klassificering**. BkTxCd-whitelist
(+100) överstyrs INTE av beloppsgränsen — en bank som skickar en genuin
CHRG-post på 15 000 kr ska klassificeras.

**Confidence-nivåer:**
- **HIGH**: score ≥ 100 (kräver antingen BkTxCd eller counterparty+text)
- **MEDIUM**: score ≥ 50 (text OCH amount ≤ tröskel)
- **< 50 eller belopp > tröskel utan BkTxCd**: returnera `null`

**10 tester** i `tests/session-58-bank-fee-classifier.test.ts`:

1. `subfamily='CHRG'`, negativ amount → bank_fee HIGH, account 6570, series B
2. `subfamily='INTR'`, positiv amount → interest_income HIGH, 8310, series A
3. `subfamily='INTR'`, negativ amount → interest_expense HIGH, 8410, series B
4. Ingen BkTxCd + `remittance_info='Månadsavgift'` + amount=-50kr → bank_fee MEDIUM
5. Ingen BkTxCd + `counterparty_name='SEB'` + `remittance_info='Ränta mars'` + amount=+200kr → interest_income HIGH (30+40+... räknas till ≥100? — **nej**, bank-match + text-match = 70; detta test ska assertar MEDIUM, INTE HIGH). Korrigerad regel: HIGH kräver BkTxCd **eller** (bank + text + BkTxCd-family='PMNT'). Revidera test-assertion till MEDIUM.
6. Normal kundbetalning (`counterparty_name='ACME AB'`, positiv, inga text-träffar) → `null`
7. `subfamily='CHRG'` + amount=-15 000 kr → fortfarande HIGH (BkTxCd bypass:ar tröskel)
8. Ingen BkTxCd + text-match + amount=-50 000 kr (över tröskel) → `null`
9. Determinism: 1000 iterationer av identisk input → identiskt output
10. M153-clean: inga `Date.now`/`Math.random`/externa state-källor (verifieras både som unit-test och via `scripts/check-m153.mjs`)

**Beslut A4 (serie-val — LÅST).** `src/main/services/bank/bank-fee-entry-service.ts`:

**Split A/B-serie:**
- `interest_income` (positiv) → **A-serien** (intäkt, samma som kundfaktura)
- `bank_fee` + `interest_expense` (negativ) → **B-serien** (kostnad, samma
  som leverantörsfaktura)

**Motivering (vs alternativen):**
- **"Allt i B"** (ursprunglig plan) → revisor som söker efter intäkter i A
  missar ränteintäkter. Bokföringsmässigt dissonant.
- **Ny F-serie** → kräver M122-recreate av `journal_entries` med många
  inkommande FK (se M122-lista i CLAUDE.md). Tung operation, lägger
  ~1.0 SP och är inte motiverad när split A/B uppnår samma mål.
- **Split A/B** → återanvänder existerande serier konsistent med deras
  semantik ("A = pengar in", "B = pengar ut").

**Konsekvens:** ingen ändring av `journal_entries.verification_series` CHECK
behövs. Chronology-check (M142) körs per serie — passar in automatiskt.

```ts
export function createBankFeeEntry(
  db: Database.Database,
  input: {
    bank_transaction_id: number
    classification: FeeClassification
    payment_account: string            // default '1930'
    skipChronologyCheck?: boolean      // för bulk-accept
  },
): { journal_entry_id: number; match_id: number }
```

Bokföring (inga moms — ML 3 kap 9§):

- **bank_fee** (belopp negativt på TX, bokförs som abs):
  ```
  D 6570 Bankkostnader        abs(amount_ore)
  K 1930 Företagskonto        abs(amount_ore)
  ```
- **interest_income** (belopp positivt):
  ```
  D 1930                       amount_ore
  K 8310 Ränteintäkter         amount_ore
  ```
- **interest_expense** (belopp negativt):
  ```
  D 8410 Räntekostnader        abs(amount_ore)
  K 1930                       abs(amount_ore)
  ```

**6 tester** i `tests/session-58-bank-fee-entry.test.ts`:
1. bank_fee (−50 kr) → D 6570:5000, K 1930:5000, serie B, chronology OK
2. interest_income (+100 kr) → D 1930:10000, K 8310:10000, serie A
3. interest_expense (−200 kr) → D 8410:20000, K 1930:20000, serie B
4. `bank_reconciliation_matches`-rad skapas med rätt exactly-one-of-kombination
5. Chronology-check (M142): bakåtdaterad mot senare B-serie-verifikat → VALIDATION_ERROR;
   med `skipChronologyCheck=true` → passerar
6. Stängd period → PERIOD_CLOSED

**Beslut A5 (suggester — LÅST).** `bank-match-suggester.ts` utökas:
- Före candidates-loop: anropa `classifyBankFeeTx(tx)`.
- Resultat (om icke-null) läggs till i candidate-listan MED **samma
  score-skala** som invoice/expense-candidates. Ingen separat sortering;
  alla candidates rankas tillsammans efter score, sedan trunkeras listan
  till topp-5.
- K5 tie-break (konfidens+metod-prioritet) gäller alla candidates
  gemensamt — fee-candidates ÄR del av rankingen, ingen specialbehandling.
  Tidigare textens "Fee-candidates påverkar INTE K5 tie-break" är
  **struken**.

3 tester i `tests/session-58-fee-suggestion-integration.test.ts`:
1. TX med CHRG + matchande invoice (score 80) → fee (100) rankas först
2. TX med CHRG + inga invoice-kandidater → bara fee-candidate
3. TX utan BkTxCd (kundbetalning till existerande faktura) → fee-candidate
   är `null`, normala candidates returneras

### F66-d UI (LÅST)

**Beslut B1.** `SuggestedMatchesPanel` utökas:

```ts
type Candidate =
  | { entity_type: 'invoice' | 'expense'; /* ... befintlig */ }
  | {
      entity_type: 'bank_fee' | 'interest_income' | 'interest_expense'
      account: '6570' | '8310' | '8410'
      series: 'A' | 'B'
      amount_ore: number
      score: number
      confidence: 'HIGH' | 'MEDIUM'
      method: 'auto_fee' | 'auto_interest_income' | 'auto_interest_expense'
      reasons: string[]
    }
```

Rendering per candidate-typ:
- Invoice/expense: oförändrat
- Fee: `"Bankavgift · konto 6570 · 12,50 kr [HIGH 100]"` etc.

Accept-handler:
- Invoice/expense: `useMatchBankTransaction` (befintlig)
- Fee: `useCreateBankFeeEntry` (ny mutation, se B2)

**Bulk-accept — chronology-säker ordning.** "Acceptera alla HIGH" MÅSTE:
1. Samla alla HIGH-candidates.
2. **Separera per verification-series** (A, B).
3. **Sortera inom varje serie** efter TX-datum stigande (icke-minskande).
4. Kör mutations i ordning. Första fee-entry per serie kör med
   `skipChronologyCheck=false`; påföljande inom samma bulk-anrop kör med
   `skipChronologyCheck=true` (batch-nivå-check enligt M142/M114-mönstret).
5. Om någon fee-mutation failar → fortsätt (best-effort), aggregera
   fel som idag.

Invoice/expense-mutations behåller sitt nuvarande per-rad-chronology-
beteende (oförändrat från S57).

**Beslut B2.** Ny hook `useCreateBankFeeEntry()` i `hooks.ts`. Invaliderar:
`allBankStatements`, `allJournalEntries` (för revisor-vyer). Ingen
`paid_amount`-påverkan.

2 RTL i `SuggestedMatchesPanel.test.tsx`:
1. Fee-candidate renderas korrekt (konto-nr + belopp + confidence)
2. Accept fee-candidate → anropar `createBankFeeEntry`-mutation (inte
   matchBankTransaction)

### F66-e design (LÅST)

**Beslut C1.** `src/main/services/bank/bank-unmatch-service.ts`:

```ts
export function unmatchBankTransaction(
  db: Database.Database,
  input: { bank_transaction_id: number; correction_description?: string },
): IpcResult<{
  correction_journal_entry_id: number
  unmatched_payment_id: number | null      // null för fee-matches
  unmatched_fee_entry_id: number | null    // null för invoice/expense-matches
}>
```

Operationen atomär via `db.transaction`:

1. **Hämta reconciliation-rad** för TX. Saknas → `{ code: 'NOT_MATCHED' }`.
2. **Guard: batch-payment-medlem.** För invoice/expense-match: om
   respektive payment har `payment_batch_id IS NOT NULL` → blockera med
   `{ code: 'BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED' }`. Batch-unmatch är
   backlog.
3. **Guard: stängd period.** Hämta `journal_entries.journal_date` för
   originalet; verifiera att periodens `is_closed=0` och FY är öppen.
   Annars `{ code: 'PERIOD_CLOSED' }`.
4. **Guard: redan korrigerad.** `journal_entries.corrected_by_id IS NULL`
   för originalet, annars `{ code: 'ALREADY_CORRECTED' }`.
5. **Skapa korrigeringsverifikat** via `createCorrectionEntry(db, {
   journal_entry_id: originalId, description })`. Default-description:
   `"Unmatch bank-TX #${tx_id} — ${original.description}"`. Detta:
   - Skapar C-serie-reversal med omvänd D/K
   - Sätter `original.corrected_by_id = new_id`, `original.status =
     'corrected'` (M140 aktiveras)
6. **Radera reconciliation-raden** FÖRST (ON DELETE RESTRICT från
   reconciliation → payments/journal_entries frigörs):
   ```sql
   DELETE FROM bank_reconciliation_matches WHERE bank_transaction_id = ?
   ```
7. **För invoice/expense-matches:** radera payment-raden:
   ```sql
   DELETE FROM invoice_payments WHERE id = ?
   -- eller DELETE FROM expense_payments WHERE id = ?
   ```
   **M101-spegling:** eftersom `paid_amount_ore` uppdateras via CASE i
   `payInvoice`/`payExpense` men INTE har motsvarande trigger vid DELETE
   av payment, måste unmatch EXPLICIT räkna om:
   ```sql
   UPDATE invoices SET
     paid_amount_ore = COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = ?), 0),
     status = CASE
       WHEN COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = ?), 0) <= 0 THEN 'unpaid'
       WHEN COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE invoice_id = ?), 0) < total_amount_ore THEN 'partial'
       ELSE 'paid'
     END
   WHERE id = ?
   ```
   Motsvarande för expenses. Detta säkerställer M101-invarianten.
8. **För fee-matches:** ingen payment-rad att radera, ingen paid_amount
   att uppdatera. Correction-entry räcker.
9. **UPDATE bank_transactions** SET `reconciliation_status='unmatched'`
   WHERE id = ?.
10. Returnera `{ correction_journal_entry_id, unmatched_payment_id,
    unmatched_fee_entry_id }`.

**8 tester** i `tests/session-58-bank-unmatch.test.ts`:

1. **Prereq-smoke:** `createCorrectionEntry` mot ett A-serie-payment-
   verifikat (skapat via `payInvoice`) → genererar omvänd D/K, sätter
   `corrected_by_id`. (Om detta saknas i befintlig testsvit — lägg här
   som grund för övriga tester.)
2. Unmatch invoice-match (happy) → correction-entry skapat,
   payment-rad DELETE:ad, `invoices.paid_amount_ore = 0`, status='unpaid',
   reconciliation-rad borta, TX='unmatched'
3. Unmatch expense-match (happy) → spegel av #2 för expense
4. Unmatch fee-match → correction-entry skapat på fee-verifikatet, ingen
   payment-påverkan, reconciliation-rad borta, TX='unmatched'
5. Unmatch redan unmatchad TX → `NOT_MATCHED`
6. Unmatch av batch-payment → `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED`
7. Unmatch i stängd period → `PERIOD_CLOSED`
8. Unmatch av redan-korrigerat original → `ALREADY_CORRECTED`
9. **Atomicitet:** simulera fel i step 9 (t.ex. genom att patcha
   prepared statement) → alla tidigare steg rullas tillbaka; correction-
   entry existerar inte, payment-raden finns kvar, reconciliation finns
   kvar, TX-status är fortfarande 'matched'

(Test 1 är prereq-smoke; övriga 2–9 är 8 scenario-tester. Total för C1:
9 tester. Test-delta justeras nedan.)

**Beslut C2.** IPC + ErrorCodes:

```ts
// ipc-schemas.ts
export const BankUnmatchSchema = z.object({
  bank_transaction_id: z.number().int().positive(),
  correction_description: z.string().max(200).optional(),
}).strict()
```

**Nya ErrorCode-värden** (lägg till i `src/shared/types.ts` ErrorCode-union):
- `'NOT_MATCHED'`
- `'BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED'`
- `'ALREADY_CORRECTED'`

(`'PERIOD_CLOSED'` finns redan.)

`wrapIpcHandler` per M128. `useUnmatchBankTransaction()` i hooks.ts —
invaliderar `allBankStatements`, `allInvoices`, `allExpenses`,
`allJournalEntries`.

### F66-e UI (LÅST)

**Beslut D1.** `PageBankStatements::BankStatementDetail` — på rader med
`reconciliation_status='matched'`:

```tsx
{tx.reconciliation_status === 'matched' && (
  <button
    onClick={() => !isBatch && setUnmatchingTxId(tx.id)}
    disabled={isBatch}
    title={isBatch ? "Batch-betalningar kan inte unmatchas per rad" : undefined}
    className="text-xs text-red-600 hover:underline disabled:text-gray-400 disabled:cursor-not-allowed disabled:no-underline"
    data-testid={`bank-unmatch-${tx.id}`}
  >
    Ångra
  </button>
)}
```

`isBatch` härleds från payload (reconciliation-raden exposar
`payment_batch_id` via join — lägg till i befintlig list-query för
matched-rader).

**Dialog:** `ConfirmDialog` (befintlig) med titel "Ångra match":
> "Detta skapar ett korrigeringsverifikat i C-serien som reverserar
> betalningen. Ursprungsverifikatet låses mot ytterligare ändringar.
> Fortsätt?"

Submit → `mutateAsync`, toast: `"Match reverserad — korrigeringsverifikat
C${N} skapat."`.

**Error-hantering per ErrorCode:**
- `NOT_MATCHED` → "Transaktionen är inte matchad"
- `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED` → "Batch-betalningar stöds inte —
  använd batch-hantering istället" (idag: backlog)
- `PERIOD_CLOSED` → "Perioden är stängd — öppna den först"
- `ALREADY_CORRECTED` → "Verifikatet är redan korrigerat"

### F66-e E2E (LÅST)

**Beslut D2.**

**E2E-1: `tests/e2e/bank-unmatch.spec.ts`** (happy):
- Seed customer + invoice + bank_statement + match manuellt via
  `window.api.matchBankTransaction`
- Navigera till bank-statement-detail, klick `[data-testid=bank-unmatch-<id>]`
- Bekräfta dialog
- Assert via `__testApi.getReconciliationMatches(stmtId)`:
  reconciliation-rad borta
- Assert C-serie-verifikat finns (via `getJournalEntries` filter
  `series='C'`)
- Assert `invoices.paid_amount_ore = 0`, `status = 'unpaid'`
- Assert `bank_transactions.reconciliation_status = 'unmatched'`

**E2E-2: `tests/e2e/bank-unmatch-batch-blocked.spec.ts`** (negative):
- Seed 2 invoices + bulk-pay (skapar `payment_batch`)
- Manuellt seed bank-reconciliation: en av payment-raderna länkas till en
  TX via `__testApi.linkPaymentToBankTx(paymentId, txId, 'invoice')`.
  Reconciliation-raden har `invoice_payment_id` som pekar på en payment
  vars `payment_batch_id` är satt (länk sker transitivt via payment-tabellen,
  inte direkt på reconciliation — detta förtydligande ersätter den tidigare
  felaktiga beskrivningen om "reconciliation-rad med payment_batch_id").
- Navigera, hovra "Ångra"-knappen → assert `disabled` + tooltip med "Batch"
  i text
- **Inget klick sker** (knappen är disabled — inte dold). E2E verifierar
  disabled-tillståndet, inte klick+toast.

**Nya `__testApi`-helpers:**
- `getReconciliationMatches(stmtId?: number): BankReconciliationMatch[]`
  → SELECT * FROM bank_reconciliation_matches WHERE bank_transaction_id IN
  (SELECT id FROM bank_transactions WHERE statement_id = ?)
- `linkPaymentToBankTx(paymentId: number, txId: number, entityType: 'invoice' | 'expense'): void`
  → INSERT i `bank_reconciliation_matches` med rätt exactly-one-of. Endast
  för test-setup; guardad av `FRITT_TEST=1`.

### M-principer + docs (LÅST)

**Beslut E — M154 ny princip:**

> **54. Unmatch via korrigeringsverifikat (M154).**
>
> `unmatchBankTransaction` återställer en bank-reconciliation genom att
> (1) skapa ett korrigeringsverifikat via `correction-service` på det
> ursprungliga payment/fee-verifikatet, (2) radera reconciliation-raden,
> (3) radera payment-raden (för invoice/expense-matches; fee-matches har
> ingen payment), (4) räkna om `paid_amount_ore` och `status` från
> `SUM(payments)` för att bibehålla M101-invariant, (5) sätta
> `bank_transactions.reconciliation_status='unmatched'`.
>
> **Payment-raden raderas** — audit-trail upprätthålls av
> korrigeringsverifikatet i C-serien, inte av bevarad payment-rad.
> Voided-flag-mönstret övervägdes men förkastades: det skulle kräva att
> alla SUM-queries, `paid_amount`-CASE och listor exkluderar voided,
> en genomgripande ändring som inte motiveras när C-serie-korrigeringen
> ger fullständig spårbarhet.
>
> **En-gångs-lås (M140) gäller per payment-verifikat, inte per TX.** Efter
> unmatch kan användaren skapa en **ny manuell match** (som skapar ett
> nytt payment-verifikat). Det nya kan också unmatchas en gång. Endast
> det specifika verifikat som redan har `corrected_by_id IS NOT NULL` är
> permanent låst.
>
> **Batch-payments (M112) kan inte unmatchas per rad.** Blockeras av
> `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED`. Batch-unmatch är backlog.

**Beslut E — M153-scope-verifiering.**
`scripts/check-m153.mjs` skannar redan `src/main/services/bank/**.ts` via
glob. Kör `npm run check:m153` efter A3 och verifiera att classifier
ingår i utskriften (grep på filnamnet). Ingen script-ändring förväntas;
om scopet visar sig begränsat — utöka eller kommentera.

**Docs:**
- `docs/sprintA-summary.md` enligt S57-mallen (mål + leveranser + tester +
  risker + commit-lista)
- `STATUS.md` — ny sektion "Sprint A / S58" med test-delta, PRAGMA, M154

---

## Migration 041 — fullständig SQL

**Kör utanför transaktion:**
```sql
PRAGMA foreign_keys = OFF;
```

**Pre-flight (utanför transaktion):**
```sql
-- Q1: match_method-whitelist
SELECT COUNT(*) AS q1 FROM bank_reconciliation_matches
WHERE match_method NOT IN ('manual','auto_amount_exact','auto_amount_date','auto_amount_ref','auto_iban');
-- MÅSTE vara 0

-- Q2: exactly-one-of för befintlig data
SELECT COUNT(*) AS q2 FROM bank_reconciliation_matches
WHERE NOT (
  (matched_entity_type='invoice' AND invoice_payment_id IS NOT NULL AND expense_payment_id IS NULL AND matched_entity_id IS NOT NULL) OR
  (matched_entity_type='expense' AND expense_payment_id IS NOT NULL AND invoice_payment_id IS NULL AND matched_entity_id IS NOT NULL)
);
-- MÅSTE vara 0

-- Q3: M141-inventering (informativ — skriv resultat i migrations-kommentar)
SELECT name, tbl_name, sql FROM sqlite_master
WHERE type='trigger' AND sql LIKE '%bank_reconciliation_matches%'
  AND tbl_name != 'bank_reconciliation_matches';
```

Om Q1 > 0 eller Q2 > 0 → `throw new Error(...)` med detaljer, avbryt migration.

**Table-recreate (i transaktion):**
```sql
BEGIN;

CREATE TABLE bank_reconciliation_matches_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_transaction_id INTEGER NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
  matched_entity_type TEXT NOT NULL CHECK(matched_entity_type IN ('invoice','expense','bank_fee')),
  matched_entity_id INTEGER,
  invoice_payment_id INTEGER REFERENCES invoice_payments(id) ON DELETE RESTRICT,
  expense_payment_id INTEGER REFERENCES expense_payments(id) ON DELETE RESTRICT,
  fee_journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE RESTRICT,
  match_method TEXT NOT NULL CHECK(match_method IN (
    'manual','auto_amount_exact','auto_amount_date','auto_amount_ref','auto_iban',
    'auto_fee','auto_interest_income','auto_interest_expense'
  )),
  created_at DATETIME NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (
    (matched_entity_type='invoice' AND invoice_payment_id IS NOT NULL AND expense_payment_id IS NULL AND fee_journal_entry_id IS NULL AND matched_entity_id IS NOT NULL) OR
    (matched_entity_type='expense' AND expense_payment_id IS NOT NULL AND invoice_payment_id IS NULL AND fee_journal_entry_id IS NULL AND matched_entity_id IS NOT NULL) OR
    (matched_entity_type='bank_fee' AND fee_journal_entry_id IS NOT NULL AND invoice_payment_id IS NULL AND expense_payment_id IS NULL AND matched_entity_id IS NULL)
  )
);

INSERT INTO bank_reconciliation_matches_new (
  id, bank_transaction_id, matched_entity_type, matched_entity_id,
  invoice_payment_id, expense_payment_id, fee_journal_entry_id, match_method, created_at
)
SELECT
  id, bank_transaction_id, matched_entity_type, matched_entity_id,
  invoice_payment_id, expense_payment_id, NULL, match_method, created_at
FROM bank_reconciliation_matches;

DROP TABLE bank_reconciliation_matches;
ALTER TABLE bank_reconciliation_matches_new RENAME TO bank_reconciliation_matches;

CREATE INDEX idx_brm_bank_tx ON bank_reconciliation_matches(bank_transaction_id);
CREATE INDEX idx_brm_invoice_payment ON bank_reconciliation_matches(invoice_payment_id) WHERE invoice_payment_id IS NOT NULL;
CREATE INDEX idx_brm_expense_payment ON bank_reconciliation_matches(expense_payment_id) WHERE expense_payment_id IS NOT NULL;
CREATE INDEX idx_brm_fee_entry ON bank_reconciliation_matches(fee_journal_entry_id) WHERE fee_journal_entry_id IS NOT NULL;

-- Återskapa eventuella triggers enligt M121 (ingen förväntas idag) + M141-inventering

-- BkTxCd-kolumner på bank_transactions
ALTER TABLE bank_transactions ADD COLUMN bank_tx_domain TEXT;
ALTER TABLE bank_transactions ADD COLUMN bank_tx_family TEXT;
ALTER TABLE bank_transactions ADD COLUMN bank_tx_subfamily TEXT;

COMMIT;
```

**Post-flight (utanför transaktion):**
```sql
PRAGMA foreign_keys = ON;
PRAGMA foreign_key_check;
-- MÅSTE vara tom
```

`runMigrations` i `db.ts` har `needsFkOff`-guard-index-array — lägg till index
för migration 041.

---

## Order-of-operations

1. **A1 migration 041** (M122 recreate, data-integrity pre-flight, BkTxCd-kolumner) + 2 migration-smoke-tester
2. **A2 camt053-parser** BkTxCd-utökning + 3 tester
3. **A3 bank-fee-classifier** + 10 tester + `npm run check:m153`
4. **A4 bank-fee-entry-service** (split A/B-serie, chronology) + 6 tester
5. **A5 suggester-integration** + 3 tester
6. **C1 bank-unmatch-service** + 9 tester (inkl. prereq-smoke)
7. **C2 IPC + preload + hook + ErrorCode-additioner**
8. **B1/B2 SuggestedMatchesPanel + bulk-accept chronology-sort** + 2 RTL
9. **D1 Ångra-UI** (disabled på batch + tooltip) + ConfirmDialog-integration
10. **B3 E2E fee-auto-match** (+1 Playwright)
11. **D2 E2E unmatch-happy + batch-blocked-disabled** (+2 Playwright) + nya `__testApi`-helpers
12. **Validering:** `npm run test`, `tsc`, `npm run check:m131`, `npm run check:m133`, `npm run check:m153`, `npm run test:e2e`
13. **Docs:** CLAUDE.md M154 + `docs/sprintA-summary.md` + `STATUS.md`

---

## Ny testbaslinje (förväntat)

| Del | Tester |
|---|---|
| A1 | 2 migration-smoke (upgrade + foreign_key_check) |
| A2 | 3 parser |
| A3 | 10 classifier |
| A4 | 6 fee-entry |
| A5 | 3 suggester-integration |
| B2 | 2 RTL |
| C1 | 9 unmatch-service (inkl. prereq-smoke) |
| **Σ vitest (nya)** | **+35** |
| **Σ Playwright (nya)** | **+3** |

**Total:** 2402 → 2437 vitest. Playwright: 55 → 58.

(Scope-breakdown listade 34 tester; efter att prereq-smoke inkluderats blir
det 35. Båda siffrorna kan accepteras — målet är ≥34.)

---

## Acceptanskriterier (DoD)

### A. F66-d backend
- [ ] Migration 041 ✅ (M122 table-recreate på `bank_reconciliation_matches` + BkTxCd-kolumner)
- [ ] Data-integrity pre-flight Q1+Q2 returnerade 0 rader på dev-DB
- [ ] M141-inventering (Q3) dokumenterad i migration-kommentar
- [ ] `PRAGMA foreign_key_check` tom efter migration
- [ ] camt053-parser utökad med Domn/Fmly/SubFmly + 3 tester
- [ ] `bank-fee-classifier.ts` deterministisk + M153-clean + 10 tester
- [ ] `bank-fee-entry-service.ts` skapar **A-serie** för interest_income och
      **B-serie** för bank_fee/interest_expense + chronology (M142) + 6 tester
- [ ] Suggester-integration: fee-candidates rankas tillsammans med
      invoice/expense via gemensam score-skala + 3 tester

### B. F66-d UI
- [ ] Fee-candidate renderas i `SuggestedMatchesPanel` med konto-nr + belopp + confidence
- [ ] Accept-fee anropar `createBankFeeEntry`-mutation
- [ ] Bulk-accept "Acceptera alla HIGH" pre-sorterar per serie + TX-datum,
      använder `skipChronologyCheck=true` från rad 2 i varje serie
- [ ] 2 RTL + 1 E2E gröna

### C. F66-e backend
- [ ] `bank-unmatch-service` atomär med 4 guards (NOT_MATCHED,
      BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED, PERIOD_CLOSED, ALREADY_CORRECTED)
- [ ] Korrigeringsverifikat skapas via `createCorrectionEntry`
- [ ] Reconciliation-rad + payment-rad raderas atomärt
- [ ] `paid_amount_ore` + `status` räknas om från `SUM(payments)` per M101
- [ ] Fee-matches hanteras utan paid_amount-påverkan
- [ ] Prereq-smoke ("createCorrectionEntry mot payment-verifikat") grön
- [ ] 9 tester gröna
- [ ] Nya `ErrorCode`-värden (`NOT_MATCHED`,
      `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED`, `ALREADY_CORRECTED`) tillagda i
      `src/shared/types.ts`

### D. F66-e UI
- [ ] "Ångra"-knapp på matched-rader; **disabled med tooltip** på
      batch-payments (inte dold)
- [ ] Bekräftelse-dialog med spec-text
- [ ] Error-handling per `ErrorCode` med användarvänligt meddelande
- [ ] 2 E2E gröna (happy + batch-blocked-disabled)
- [ ] `__testApi.getReconciliationMatches` + `__testApi.linkPaymentToBankTx`
      implementerade och guardade av `FRITT_TEST=1`

### E. M-principer + docs
- [ ] M154 i CLAUDE.md, nummer 54 (unmatch-semantik med DELETE-payment)
- [ ] `npm run check:m153` inkluderar classifier.ts i scope (verifierat)
- [ ] `docs/sprintA-summary.md` skriven
- [ ] `STATUS.md` uppdaterad

### Valideringsmatris
- [ ] Vitest: 2437/2437 ✅ (+35)
- [ ] TSC: 0 fel
- [ ] M131 + M133 + M153: ✅
- [ ] Playwright: 58/58 ✅ (+3)
- [ ] PRAGMA user_version: 41

---

## Commit-kedja (13 commits)

1. `feat(S58 A1): migration 041 — match_method + fee_journal_entry_id + BkTxCd-kolumner`
2. `test(S58 A1): migration 041 upgrade + foreign_key_check smoke (+2)`
3. `feat(S58 A2): camt053-parser BkTxCd Domn/Fmly/SubFmly (+3)`
4. `feat(S58 A3): bank-fee-classifier-service (+10, M153-clean)`
5. `feat(S58 A4): bank-fee-entry-service split A/B-serie (+6)`
6. `feat(S58 A5): suggester integrerar fee-candidates (+3)`
7. `feat(S58 C1): bank-unmatch-service + prereq-smoke (+9)`
8. `feat(S58 C2): IPC + hook + ErrorCode-additioner`
9. `feat(S58 B1+B2): SuggestedMatchesPanel fee-candidates + bulk-chronology (+2 RTL)`
10. `feat(S58 D1): "Ångra match"-knapp disabled-on-batch + ConfirmDialog`
11. `test(S58 B3): E2E fee-auto-match (+1 Playwright)`
12. `test(S58 D2): E2E unmatch happy + batch-blocked-disabled (+2 Playwright)`
13. `docs(S58): CLAUDE.md M154 + sprintA-summary + STATUS`

---

## Risker och fallbacks

**Risk 1: Migration 041 — befintlig data bryter nya CHECK.**
Q2 i pre-flight kan hitta rader som inte uppfyller exactly-one-of (t.ex.
`matched_entity_id IS NULL` på invoice-rad i dev-data från S55-testning).
Mitigation: kör Q2 först, om > 0 → dumpa raderna, städa manuellt i dev-DB
eller skriv data-migration för att fixa inkonsistenta rader innan recreate.
Risk tillsatt 0.2 SP i A1-budget.

**Risk 2: `createCorrectionEntry` kan ha outestat beteende mot payment-verifikat.**
C1 börjar med prereq-smoke som verifierar detta. Om testen failar → fixa
correction-service innan fortsatt (kan äta reserv-budget).

**Risk 3: camt.053-BkTxCd är leverantörsspecifik.**
Svenska banker kan använda Prtry-koder istället för ISO. Mitigation:
heuristik-fallback (counterparty + text) täcker bank_fee/interest genom
MEDIUM-confidence även utan BkTxCd. Om första produktionsbank visar på
att nya koder krävs → konfigurerbar whitelist som F-item i nästa sprint.

**Risk 4: `paid_amount_ore`-omräkning via SUM-subquery kan kollidera med CHECK-triggers.**
Befintliga triggers på `invoices`/`expenses` kan blockera UPDATE om
paid_amount > total_amount. Unmatch sänker alltid paid_amount → bör gå
igenom. Test 2+3 i C1 fångar regressioner.

**Risk 5: Bulk-accept-pre-sort kan missa edge-case.**
Om flera fee-candidates har samma datum men olika amount → sortstabilitet
spelar roll. Mitigation: sortnyckel `(tx_date ASC, tx_id ASC)` garanterar
deterministisk ordning.

**Fallback om scope överstiger 7 SP:**
1. Skippa B3 E2E (täckt av A4+A5 unit + B2 RTL)
2. Skippa D2-negative (batch-blocked) — guard testas i C1 unit
3. **Skippa INTE** D1 UI (halvklar story utan UI-yta är värre än att
   senarelägga hela F66-e; bättre att krympa F66-d istället)

---

## Tekniska anteckningar

- **Mock-IPC** saknar bank-metoder sedan S55 — B2 RTL mockar `window.api`
  direkt.
- **M153-scope** skannar redan `src/main/services/bank/**.ts` — classifier
  ingår automatiskt. Verifiera med grep efter A3-commit.
- **M142 chronology för A-serie:** interest_income delar serie med
  fakturor — det innebär att en fee-entry med datum < senaste
  faktura-datum blockas. Ovanligt men möjligt. Bulk-sort (B1) hanterar
  det inom samma bulk-anrop; cross-bulk-problem kräver att användaren
  accepterar fees i kronologisk ordning (UI kan lägga till
  tidsstämpel-sort i panel-presentationen som F-item).
- **B-serie för bank_fee + interest_expense:** identisk mekanik som i A
  men med leverantörsfakturor som samsorteringar.
- **Batch-unmatch (backlog):** separat prompt vid användarefterfrågan.
  Ångra-knappen är disabled med tooltip som kommunicerar begränsningen.
- **Re-match efter unmatch:** M140-lås gäller det specifika
  payment-verifikatet. Ett nytt manuellt match skapar nytt payment-
  verifikat som kan unmatchas en gång. Dokumenterat i M154.
- **ErrorCode-additioner:** kontrollera att `ErrorCode`-union i
  `src/shared/types.ts` INTE har dessa värden idag innan tillägg.

---

## Vad som INTE ingår

- **Batch-unmatch** — backlog, separat prompt om behov
- **camt.054 / MT940 / BGC** — H2 2026
- **URL-state för pagination** — F-item, orelaterat
- **F62-d asset-redigering, F49-b AST-M133, F68/F69 a11y** — Sprint B/C
- **Konfigurerbara BkTxCd-mappningar per bank** — framtida F-item om
  default-whitelist otillräcklig
- **Unmatch → auto-re-match till suggestion** — komplex UX, separat
  övervägande
- **Voided-flag på payments istället för DELETE** — övervägt och förkastat
  (se M154-text och Beslut P1)
- **F-serie för bank-automatik** — övervägt och förkastat (split A/B
  räcker; F kräver `journal_entries`-recreate som är oproportionellt)
