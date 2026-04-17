# Sprint 55 — prompt (godkänd efter QA-revision)

**Tema:** Bankavstämning (MVP) + F62-c sale-price-extension
**Scope:** 9.5 SP (budget 9–11) • **Datum:** 2026-04-17
**Förutsättningar:** S54 klar (2314 vitest, PRAGMA 38, Playwright 47/47).

## Mål

1. **(A) Bankavstämning camt.053 MVP** — importera kontoutdrag, visa transaktioner, tillåt manuell matchning mot öppna fakturor/kostnader. Auto-matchning ingår INTE (→ F66-b). Unmatch ingår INTE (→ korrigera via correction-service).
2. **(B1) F62-c-extension sale-price** — dispose med försäljningspris (vinst/förlust mot 3970/7970).

**Deferred från ursprunglig S55-draft efter QA-revision:**
- B2 (F63-polish-b SIE4 konflikt-UI) flyttas till S56-backlog för budget-headroom.
- Unmatch-endpoint stryks ur MVP (arkitekturkonflikt med M17/M140 append-only). Användare som gjort fel match använder `correction-service.correctJournalEntry()` (samma väg som annan bokföringskorrigering).

Post-S54 Playwright-verifiering före kodstart: `npx playwright test` → 47/47.

## Scope-breakdown (9.5 SP)

| Del | SP | Motivering |
|---|---|---|
| **A1.** Migration 039 — bank-tabeller | 1 | 3 nya tabeller, split polymorphic FK, samtliga invarianter |
| **A2.** camt.053 XML-parser | 1.7 | 10 tester (variance över banker). `xmlbuilder2` finns |
| **A3.** `importBankStatement`-service | 1.7 | Sie4-pattern + opening/closing-invariant + batch-kronologi |
| **A4.** `matchBankTransaction`-service (manuell) | 1.2 | Direction-guard + bank-fee-semantik + _payInvoiceTx/_payExpenseTx-integration |
| **A5.** IPC + hooks + preload (4 kanaler) | 0.4 | Ingen unmatch-kanal |
| **A6.** UI: PageBankStatements (list + detail) | 1.5 | Tabell, per-rad match-dialog |
| **A7.** E2E-specs (3 stycken) | 0.8 | Happy-path, duplicate-rejection, full-stack match-to-verifikat |
| **B1.** F62-c-extension sale-price | 2.5 | Service + ny UI-dialog (proceeds-konto-dropdown filtrerad till 1xxx-2xxx) |
| **Docs + M152 + M122-update** | 0.2 | CLAUDE.md-utökning |
| **Summa** | **9.5** | Inom budget 9–11 |

## Upfront-beslut (låsta innan kod)

**Beslut 1: `UNIQUE (company_id, import_file_hash)` (inte globalt).**
- Multi-tenant-safety. Hash = SHA-256 av filbuffer.

**Beslut 2: Lagra både `booking_date` och `value_date`.** ISO 20022 ger båda; svensk praxis använder value_date.

**Beslut 3: `payment_date = value_date` för verifikat som skapas vid match.**
- Motivering: svensk praxis, M142-konsistens, aging-korrekthet.

**Beslut 4: Ingen auto-counterparty-creation.** Användaren skapar counterparty själv innan match vid behov.

**Beslut 5: Manuell match går genom `_payInvoiceTx`/`_payExpenseTx`.** Återanvänder M99 öresutjämning.

**Beslut 6: Bankavgifts-TX (negativa TX utan matchbar counterparty) lämnas `unmatched`.**
- MVP flagg: användaren bokar manuellt C-serie-verifikat (6570). Auto-klass → F66-d.
- **Bank-fee ingår INTE i match-service-input.** Differens ≤ 50 öre = öresutjämning (M99). Större diff = `VALIDATION_ERROR` ("använd partial payment").

**Beslut 7: Ingen unmatch i MVP.** Fel match → `correction-service.correctJournalEntry()` (M140 en-gångs-lås).

**Beslut 8: Direction-guard i match-service.**
- `amount_ore > 0` (inkommande) → **bara invoice** accepteras som target.
- `amount_ore < 0` (utgående) → **bara expense** accepteras.
- Annars: `VALIDATION_ERROR`.

**Beslut 9: Batch-level kronologi-check (M142-mönstret från M112-M114).**
- Import-fasen validerar att statements datumspan ligger inom öppen period och att existerande A/B-serie-numrering inte bryter kronologi.
- Match-fasen använder `skipChronologyCheck=true` i `_payInvoiceTx`/`_payExpenseTx` efter batch-level-guard.

**Beslut 10: Opening + SUM(amount) = closing-invariant valideras vid import.**
- `opening_balance_ore + SUM(bank_transactions.amount_ore) === closing_balance_ore` exakt.
- Annars: `VALIDATION_ERROR` ("Bankfilen är korrupt eller trunkerad — öppnings- och slutsaldo matchar inte summan av transaktioner").

**Beslut 11: Scope-semantik — `reconciliation_status` enum = `unmatched | matched | excluded`** (ingen `manual`, ej dubbletts-semantik).

**Beslut 12: `match_method` enum MVP = bara `manual`.** Auto-metoder (ocr, amount_date, amount_rounding) läggs till via migration 040 vid F66-b.

## Schema-detaljer (A1)

```sql
CREATE TABLE bank_statements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  statement_number TEXT NOT NULL,
  bank_account_iban TEXT NOT NULL,
  statement_date TEXT NOT NULL,
  opening_balance_ore INTEGER NOT NULL,
  closing_balance_ore INTEGER NOT NULL,
  source_format TEXT NOT NULL DEFAULT 'camt.053',
  import_file_hash TEXT NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (source_format IN ('camt.053')),
  UNIQUE (company_id, import_file_hash)
);

-- Ingen `currency`-kolumn (YAGNI — MVP är SEK-only; multi-valuta läggs till vid behov).

CREATE TABLE bank_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_statement_id INTEGER NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
  booking_date TEXT NOT NULL,
  value_date TEXT NOT NULL,
  amount_ore INTEGER NOT NULL,  -- signed (M152): +inkommande, −utgående. Extern rådata.
  transaction_reference TEXT,
  remittance_info TEXT,
  counterparty_iban TEXT,
  counterparty_name TEXT,
  bank_transaction_code TEXT,
  reconciliation_status TEXT NOT NULL DEFAULT 'unmatched',
  CHECK (amount_ore <> 0),
  CHECK (reconciliation_status IN ('unmatched','matched','excluded'))
);

CREATE TABLE bank_reconciliation_matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_transaction_id INTEGER NOT NULL UNIQUE REFERENCES bank_transactions(id) ON DELETE CASCADE,
  matched_entity_type TEXT NOT NULL,
  matched_entity_id INTEGER NOT NULL,
  invoice_payment_id INTEGER REFERENCES invoice_payments(id) ON DELETE RESTRICT,
  expense_payment_id INTEGER REFERENCES expense_payments(id) ON DELETE RESTRICT,
  match_method TEXT NOT NULL DEFAULT 'manual',
  matched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (matched_entity_type IN ('invoice','expense')),
  CHECK (match_method IN ('manual')),
  -- Exactly one of invoice_payment_id / expense_payment_id must be set, matching entity_type
  CHECK (
    (matched_entity_type = 'invoice' AND invoice_payment_id IS NOT NULL AND expense_payment_id IS NULL)
    OR
    (matched_entity_type = 'expense' AND expense_payment_id IS NOT NULL AND invoice_payment_id IS NULL)
  )
);

-- Ingen `journal_entry_id` i bank_reconciliation_matches (M120-disciplin —
-- härledbart via invoice_payment_id/expense_payment_id → *_payments.journal_entry_id).

CREATE INDEX idx_bank_tx_statement ON bank_transactions(bank_statement_id);
CREATE INDEX idx_bank_tx_status ON bank_transactions(reconciliation_status);
CREATE INDEX idx_bank_tx_value_date ON bank_transactions(value_date);
CREATE INDEX idx_bank_tx_booking_date ON bank_transactions(booking_date);
CREATE INDEX idx_bank_match_entity ON bank_reconciliation_matches(matched_entity_type, matched_entity_id);
```

**M122-inventory (docs-commit):** lägg till i CLAUDE.md:
- `invoice_payments` ← bank_reconciliation_matches (ny inkommande FK)
- `expense_payments` ← bank_reconciliation_matches (ny inkommande FK)
- `bank_statements` ← bank_transactions
- `bank_transactions` ← bank_reconciliation_matches

## IPC-kanaler (A5) — 4 st (ingen unmatch)

Alla via `wrapIpcHandler` (M128, M144):

1. `bank-statement:import` → `{ statement_id, transaction_count }`
2. `bank-statement:list` → `BankStatementSummary[]`
3. `bank-statement:get` → `{ statement, transactions }`
4. `bank-statement:match-transaction` → `{ payment_id, journal_entry_id }` (skapar payment via `_payInvoiceTx`/`_payExpenseTx` + rad i `bank_reconciliation_matches` + uppdaterar `reconciliation_status = 'matched'`)

## Nya M-principer (docs-commit)

**M152 — Signed amount i bank-extern rådata (bank_transactions.amount_ore).**
`bank_transactions.amount_ore` är signerad (positiv=inkommande, negativ=utgående). Detta avviker från **M137** (belopp alltid positiva i DB, sign-flip i journal-byggaren) men är korrekt eftersom:

- `bank_transactions` är **extern rådata** från bankens kontoutdrag, inte en domänenhet.
- Signen kommer från ISO 20022 `CdtDbtInd`-elementet — ändring till unsigned skulle kräva sidokolumn och införa översättningskomplexitet utan semantisk vinst.
- Direction-guard i match-service säkerställer korrekt fakturasida-flip innan bokföring.

Framtida externa rådata-tabeller (camt.054, MT940, BGC-returfil) får också använda signed amounts utan M137-konflikt.

## Order-of-operations

1. Playwright baseline (47/47)
2. **A1** Migration 039 + helper-assertions + user_version-bumptests (PRAGMA 38 → 39, tabeller 33 → 36)
3. **A2** camt.053-parser (10 unit-tester mot fixtures)
4. **A3** `importBankStatement`-service + opening/closing-invariant + unit-tester
5. **A4** `matchBankTransaction`-service + direction-guard + batch-kronologi + unit-tester
6. **A5** IPC + preload + electron.d.ts (M144)
7. **A6** PageBankStatements + match-dialog
8. **A7** E2E-specs × 3
9. **B1** F62-c-extension sale-price (service + UI-dialog)
10. Validering: vitest, tsc, m131, m133, Playwright
11. Docs (s55-summary, STATUS.md, CLAUDE.md + M152 + M122-update) + commit-kedja

## Test-strategi

**A2. camt.053-parser (10 tester):**
- Happy-path (1 Stmt, 3 Ntry)
- Empty statement (0 Ntry)
- Multiple Ntry + sub-Ntry (split transactions)
- Negativt opening_balance
- Non-SEK currency → reject
- Saknad IBAN → VALIDATION_ERROR
- Duplicate transaction_reference inom statement → allow (bank kan ge samma ref)
- Malformed XML → parse-error
- BOM-prefix i fil → tolerera
- Namespace-varianter (urn:iso:std:iso:20022)

**A3. Import-service (6 tester):**
- Valid import kör rent
- Duplicate `(company_id, import_file_hash)` → VALIDATION_ERROR
- Wrong FY (statement_date utanför öppen FY) → VALIDATION_ERROR
- Rollback on error (parse-fel mitt i import rullar tillbaka)
- Opening + SUM = closing-invariant: pass (exakt)
- Opening + SUM = closing-invariant: fail (drift) → VALIDATION_ERROR med klar text

**A4. Match-service (7 tester):**
- Invoice full-pay match → payment-rad skapas, status → matched
- Invoice partial-pay match → status = partially_paid
- Invoice öresutjämning (diff ≤ 50 öre → M99) → M99 triggas korrekt
- Expense match med negativ TX → payment-rad skapas
- Direction-guard: +TX mot expense → VALIDATION_ERROR
- Direction-guard: −TX mot invoice → VALIDATION_ERROR
- Already-matched TX → VALIDATION_ERROR (UNIQUE-constraint på bank_transaction_id)

**A7. E2E (3 specs):**
- Happy-path: mock camt.053 → import wizard → manual match på 1 TX → verifikat bekräftat
- Duplicate rejection: import samma fil två gånger → andra körningen ger tydligt felmeddelande i UI
- Full-stack match-to-verifikat: bokförd A-serie-verifikation matchar belopp + datum + counterparty

**B1. F62-c-extension (4 scenarion):**
- `sale_price_ore == book_value_ore` → ingen vinst/förlust-rad, bara K asset + D ack_dep + D/K proceeds
- `sale_price_ore > book_value_ore` → K 3970 (vinst = diff)
- `sale_price_ore < book_value_ore` → D 7970 (förlust = diff)
- `sale_price_ore == 0` → identiskt med S54-basic (full write-off, ingen proceeds-rad)

**Total: 2314 → ~2340 tester (+26).**

## Acceptanskriterier (DoD)

### A. Bankavstämning MVP
- [ ] Migration 039 kör rent på tom DB + uppgradering från 38. PRAGMA 39.
- [ ] camt.053 happy-path kan importeras. Re-import av samma `(company_id, file_hash)` → VALIDATION_ERROR.
- [ ] Parser hanterar 10 test-scenarion (se test-strategi).
- [ ] Opening + SUM = closing-invariant enforcas, med tydligt felmeddelande vid mismatch.
- [ ] Manuell match skapar payment-rad + A/B-serie-verifikat. `invoice.paid_amount += tx.amount`.
- [ ] Direction-guard blockerar +TX → expense och −TX → invoice.
- [ ] Öresutjämning (M99) triggeras korrekt för TX med diff ≤ 50 öre.
- [ ] `bank_transactions.reconciliation_status` flyttas `unmatched → matched` vid match. **Ingen unmatch i MVP**.
- [ ] PageBankStatements visar lista + detail-vy. "Matcha"-knapp per rad triggar IPC.
- [ ] M142 batch-kronologi enforcas vid import; match använder `skipChronologyCheck=true`.
- [ ] **Soft:** minst 1 anonymiserad real-fil (SEB/Nordea/Handelsbanken/Swedbank) i `tests/fixtures/camt053-real-*.xml` passerar parsern. Om ingen real-fil finns tillgänglig → strict ISO 20022-compliance räcker, documenterat i s55-summary.

### B1. Sale-price
- [ ] `disposeFixedAsset(.., sale_price_ore, proceeds_account)` skapar korrekt verifikat för alla **4 scenarion**.
- [ ] Invariant debit=credit för alla 4.
- [ ] UI-dialog ersätter confirm-prompten. Proceeds-konto-dropdown filtrerad till balansräkningskonton (1xxx-2xxx).

### Valideringsmatris
- [ ] Vitest: 2340+/2340+ ✅ (+26)
- [ ] TSC: 0 fel
- [ ] M131-check: ✅
- [ ] M133: baseline oförändrad (nya komponenter har INTE `axeCheck: false`)
- [ ] Playwright: 47 → 50/50 ✅ (+3 nya)

## Commit-kedja (förväntad)

1. `feat(S55 A1)` — migration 039 + schemas
2. `feat(S55 A2)` — camt.053-parser + 10 tester
3. `feat(S55 A3)` — importBankStatement-service + invariant
4. `feat(S55 A4)` — matchBankTransaction-service + direction-guard
5. `feat(S55 A5+A6)` — IPC + PageBankStatements
6. `feat(S55 A7)` — 3 E2E-specs
7. `feat(S55 B1)` — F62-c-extension sale-price
8. `docs(S55)` — s55-summary + STATUS + CLAUDE.md (M152 + M122-update) + s56-backlog

## Risker och mitigeringar

- **Bank-specifika camt.053-varianter:** MVP kör ISO 20022-strikt; extensions i F66. Soft-AC för real-fil fångar regression om real-fil finns.
- **UI-omskrivning för disposal (B1):** återanvänd `CreateFixedAssetDialog`-pattern istället för ny dialog från scratch.
- **Scope-overrun om auto-match smyger in:** Disciplin — match-service tar bara `(tx_id, entity_type, entity_id, payment_account)`, ingen scoring.
- **Opening/closing-invariant kan falla false-positive** på riktiga bankfiler om bankens rundning avviker: tillåt `±1 öre`-tolerans om tester mot real-fil visar problemet (defer decision till implementation-tid).

## Deferred till S56-backlog

- **F66-b:** auto-matchnings-algoritm (scoring + confidence). Migration 040 utökar `match_method`-enum.
- **F66-c:** IBAN ↔ counterparty-register (auto-creation).
- **F66-d:** auto-klassificering av bankavgifter (6570) + ränteintäkter (8310).
- **F66-e:** bank-match unmatch via correction-service-integration (om användarbehov).
- **F63-polish-b** SIE4 konflikt-resolution-UI (1.5 SP — flyttad från S55).
- **F67:** Pagination i InvoiceList/ExpenseList + bank-transactions om > 1000 rader.
- **F68:** A11y-bredd.
- **F69:** M133-städning.
- **F62-c E2E-spec.**
- **F62-d:** asset-redigering (edit existing fixed asset).

## QA-revision — sammanfattning av ändringar

Jämfört med ursprunglig draft:
- **Struket:** unmatch-endpoint (M17/M140-konflikt), F63-polish-b B2, `currency`-kolumn, `journal_entry_id` i matches-tabellen, 'manual'-värde från reconciliation_status, 'manual_entry' från matched_entity_type, auto-metoder från match_method.
- **Tillagt:** `UNIQUE (company_id, import_file_hash)`, split polymorphic FK (invoice_payment_id/expense_payment_id + CHECK), `CHECK (amount_ore <> 0)`, index på value_date/booking_date, direction-guard (beslut 8), batch-kronologi (beslut 9), opening/closing-invariant (beslut 10), payment_date=value_date (beslut 3), bank-fee-semantik (beslut 6), M152 signed-amount-undantag, M122-inventory-update, +5 parser-tester, +2 E2E-specs, +1 B1-scenario.
- **Scope:** 11 SP → 9.5 SP (inom budget).
