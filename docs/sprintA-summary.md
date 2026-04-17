# Sprint A / S58 — Bank-MVP stängning (F66-d + F66-e)

**Levererat:** 2026-04-17. Stänger bank-reconciliation-storyn från S55–S57:
auto-klassificering av bankavgifter/ränta (F66-d) och unmatch via
correction-service (F66-e).

## Testbaslinje

| Mätvärde | Före (S57) | Efter (S58) | Δ |
|---|---|---|---|
| Vitest | 2402 | 2437 | +35 |
| Testfiler | 236 | 240 | +4 |
| Playwright | 55 | 58 (3 nya specs registrerade) | +3 |
| PRAGMA user_version | 40 | 41 | +1 |
| Nya IPC-kanaler | — | `bank-statement:create-fee-entry`, `bank-statement:unmatch-transaction` | +2 |
| Nya M-principer | — | M154 | +1 |
| Nya ErrorCodes | — | `NOT_MATCHED`, `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED` | +2 |

> Playwright-räkning är registrerade specs; reell körning kräver `npm run test:e2e`.

## Levererat

### A. F66-d backend

- **A1 (Migration 041, PRAGMA 41).** M122 table-recreate på
  `bank_reconciliation_matches`:
  - `match_method`-enum utökas med `auto_fee`, `auto_interest_income`,
    `auto_interest_expense`
  - Ny kolumn `fee_journal_entry_id INTEGER REFERENCES journal_entries(id)
    ON DELETE RESTRICT`
  - `matched_entity_type`-enum utökas med `'bank_fee'`, `matched_entity_id`
    blir nullable
  - Nytt `exactly_one_of`-CHECK med tre grenar (invoice/expense/bank_fee)
  - Pre-flight: Q1 whitelist, Q2 exactly-one-of på befintlig data, Q3 M141
  - 3 nya kolumner på `bank_transactions`: `bank_tx_domain`,
    `bank_tx_family`, `bank_tx_subfamily` (ISO 20022 BkTxCd-hierarki)
  - **+2 migrations-smoke-tester** (upgrade 40→41 + exactly-one-of-CHECK)
- **A2 (camt053-parser).** Utökar `ParsedBankTransaction` med tre strukturerade
  BkTxCd-fält. `bank_transaction_code` behålls för bakåtkompabilitet. **+3 parser-tester.**
- **A3 (`bank-fee-classifier.ts`).** Deterministisk klassificerare:
  - BkTxCd-whitelist (+100 HIGH): CHRG → bank_fee, INTR + sign → interest_*
  - Heuristik (bypassas av BkTxCd, bara för belopp ≤ 1000 kr):
    bank-counterparty (+30) + text-regex (+40)
  - Serie-val: interest_income → A, bank_fee/interest_expense → B
  - Heltalspoäng (M153-clean), verifierat via `scripts/check-m153.mjs`
  - **+10 tester** inkl. 1000-iterations-determinism + source-scan
- **A4 (`bank-fee-entry-service.ts`).** Skapar bokföringsverifikat:
  - `bank_fee` (−belopp abs): D 6570 / K 1930
  - `interest_income` (+belopp): D 1930 / K 8310
  - `interest_expense` (−belopp abs): D 8410 / K 1930
  - Chronology (M142) + period-check (PERIOD_CLOSED) + `skipChronologyCheck`
    för bulk-accept
  - Reconciliation-rad med `matched_entity_type='bank_fee'` +
    `fee_journal_entry_id`
  - **+6 tester** (alla tre typer, exactly-one-of, chronology, period)
- **A5 (suggester-integration).** `classifyBankFeeTx` körs per TX FÖRE
  invoice/expense-loopen. Fee-candidates rankas i gemensam score-skala.
  **+3 tester** (CHRG vs invoice, CHRG utan entity, normal kundbetalning).

### B. F66-d UI

- **B1+B2 (SuggestedMatchesPanel).** `MatchCandidate` blir discriminated union
  (Entity | Fee). Fee renderas som "Bankavgift · konto 6570 · 12,50 kr
  [HIGH 100]". Accept-handler dispatchar till `useCreateBankFeeEntry` för
  fee, annars `useMatchBankTransaction`. Bulk-accept pre-sorterar entity före
  fee + TX-id ASC och använder `skipChronologyCheck` per A/B-serie (M114-mönster).
  **+2 RTL.**
- **B3 (E2E bank-fee-auto-classify.spec.ts).** Import camt.053 med
  BkTxCd=CHRG → suggester → acceptera via `createBankFeeEntry` →
  verifiera B-serie D 6570 / K 1930 + reconciliation-rad med
  `matched_entity_type='bank_fee'`. **+1 Playwright.**

### C. F66-e backend

- **C1 (`bank-unmatch-service.ts`).** Atomär komposition:
  1. Fetch reconciliation + payment + journal_entry
  2. Guards: NOT_MATCHED / BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED /
     PERIOD_CLOSED / ENTRY_ALREADY_CORRECTED
  3. DELETE reconciliation → DELETE payment → `createCorrectionEntry` →
     räkna om `paid_amount_ore` + `status` → flippa TX
  - Ordning kritisk (M154): DELETE FÖRE correction för att passera
    correction-service guard #4 + DB-trigger `trg_no_correct_with_payments`
  - Fee-matches skippar payment-steg (ingen invoice/expense involverad)
  - **+9 tester** inkl. prereq-smoke (correction mot payment-JE utan
    dependent payments), alla 4 guards, atomicitet
- **C2 (IPC + hook).** Ny IPC-kanal `bank-statement:unmatch-transaction`
  + `BankUnmatchTransactionSchema` (Zod strict). `useUnmatchBankTransaction`
  hook (M144 IpcResult). Även ny `bank-statement:create-fee-entry`-kanal
  + `useCreateBankFeeEntry` hook (server-side classification för säkerhet).
  Nya ErrorCodes: `NOT_MATCHED`, `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED`.

### D. F66-e UI

- **D1 (Ångra-knapp).** `PageBankStatements.BankStatementDetail` utökas med
  röd "Ångra"-knapp på matched-rader. Batch-payments disableas (inte döljs)
  med tooltip "Batch-betalningar kan inte unmatchas per rad". Click →
  `ConfirmDialog` (danger-variant) med M154-text. Per-ErrorCode toast-
  meddelande.
  `BankTransactionRow` får nullable `payment_batch_id`-fält (hämtas via
  LEFT JOIN reconciliation → payments) så UI kan fatta beslut utan extra
  query.
- **D2 (E2E bank-unmatch.spec.ts).** Två specs:
  - Happy: match invoice via IPC → unmatch → reconciliation borta,
    C-serie-verifikat skapat, invoice.paid_amount=0, status=unpaid,
    TX=unmatched
  - Batch-blocked: bulk-pay → länka via `__testApi.linkPaymentToBankTx` →
    unmatch returnerar `BATCH_PAYMENT_UNMATCH_NOT_SUPPORTED`
  - Nya `__testApi`-helpers: `getReconciliationMatches`,
    `linkPaymentToBankTx`
  - **+2 Playwright.**

### E. M-principer + docs

- **M154 (ny).** Unmatch-semantik: C-serie-korrigering + DELETE payment
  istället för voided-flag, ordning kritisk, en-gångs-lås per
  payment-JE, batch disabled. Inlagt i CLAUDE.md som princip 58.
- **M153-scope.** `scripts/check-m153.mjs` skannar redan
  `src/main/services/bank/**.ts` → `bank-fee-classifier.ts` hamnar
  automatiskt i scope. Verifierat.

## Valideringsmatris

- [x] Vitest: **2437/2437** passerar (+35 nya)
- [x] TypeScript strict: 0 fel
- [x] `npm run check:m131`: ✅
- [x] `npm run check:m153`: ✅
- [x] Playwright: 3 nya specs registrerade (B3 + D2×2)
- [x] PRAGMA user_version: 41

## Risker och uppföljning

- **Payment-radering i unmatch (M101-invariant):** unmatch DELETE:ar
  payment-raden för att bevara SUM(payments)=paid_amount_ore-invariant.
  Detta är medvetet val dokumenterat i M154 — audit-trailen ligger i
  C-serie-verifikatet, inte i bevarad payment-rad.
- **Nested db.transaction():** `unmatchBankTransaction` anropar
  `createCorrectionEntry` som själv öppnar en transaktion. better-sqlite3
  hanterar detta via SAVEPOINT. Test 8 (atomicitet) verifierar att en
  correction-failure rullar tillbaka hela unmatch-flödet.
- **BkTxCd-täckning i svenska banker:** SEB/Swedbank/Handelsbanken/Nordea
  använder olika Prtry-koder. Heuristik-fallback (counterparty + text)
  täcker upp med MEDIUM-confidence om BkTxCd saknas eller är
  leverantörsspecifik. Om första produktionsbank visar att whitelist är
  otillräcklig → F-item för konfigurerbar mapping.
- **Batch-unmatch (backlog).** Ångra-knappen disableas idag för
  batch-payments. När användare efterfrågar batch-unmatch krävs separat
  prompt (reverserar hela batchen + skapar C-serie-verifikat per payment).

## Commits

1. `feat(S58 A1): migration 041 — match_method + fee_journal_entry_id + BkTxCd-kolumner`
2. `feat(S58 A2): camt053-parser BkTxCd Domn/Fmly/SubFmly (+3 tester)`
3. `feat(S58 A3): bank-fee-classifier-service (+10, M153-clean)`
4. `feat(S58 A4): bank-fee-entry-service split A/B-serie (+6)`
5. `feat(S58 A5): suggester integrerar fee-candidates (+3)`
6. `feat(S58 C1+C2): bank-unmatch-service + IPC + hook + 9 tester`
7. `feat(S58 B1+B2): SuggestedMatchesPanel fee-candidates + bulk-chronology (+2 RTL)`
8. `feat(S58 D1): "Ångra match"-knapp disabled-on-batch + ConfirmDialog`
9. `test(S58 B3+D2): E2E fee-auto-match + unmatch happy + batch-blocked (+3 Playwright)`
10. `docs(S58): CLAUDE.md M154 + sprintA-summary + STATUS` (denna commit)
