# Sprint 55 — Summary

**Datum:** 2026-04-17. **Status:** ✅ KLAR. **Scope:** 9.5 SP (inom budget 9–11).

Bankavstämning (MVP, camt.053-import + manuell matchning) + F62-c-extension
sale-price. Avklarat enligt S55-prompten utan scope-kompromiss.

## Testbaslinje

- **Vitest:** 2314 → 2343 (+29). 226 → 229 testfiler (+3).
- **Playwright:** 47/47 → 50/50 (+3).
- **PRAGMA user_version:** 38 → 39.
- **Tabeller:** 33 → 36 (+3 bank-tabeller).
- **IPC-kanaler:** +4 (bank-statement:import / list / get / match-transaction).
- **TSC, M131, M133-baseline:** gröna.

## Commit-kedja (faktisk)

1. `feat(S55 A1)` — migration 039 + 3 tabeller + 5 index + verify-helper
2. `feat(S55 A2)` — camt.053-parser (xmlbuilder2) + 10 unit-tester
3. `feat(S55 A3)` — importBankStatement + list/get + invariant + 8 tester
4. `feat(S55 A4)` — matchBankTransaction + direction-guard + 7 tester
5. `feat(S55 A5)` — IPC (4 kanaler) + hooks + preload + electron.d.ts
6. `feat(S55 A6)` — PageBankStatements (lista + detail + MatchDialog)
7. `feat(S55 A7)` — 3 E2E-specs (happy-path, duplicate, full-stack match)
8. `feat(S55 B1)` — F62-c-extension sale-price + DisposeDialog + 4 tester

## A — Bankavstämning MVP

**Migration 039** (A1): Tre nya tabeller med split polymorphic FK och alla
upfront-beslut från QA-revisionen:
- `bank_statements` (UNIQUE (company_id, import_file_hash))
- `bank_transactions` (signed `amount_ore`, M152; 5 index)
- `bank_reconciliation_matches` (invoice_payment_id + expense_payment_id,
  CHECK exakt-en-satt)

**Parser** (A2): `parseCamt053(xml)` i `src/main/services/bank/camt053-parser.ts`.
Hanterar namespace-varianter, BOM-prefix, split TxDtls, negativt opening_balance.
Kastar `Camt053ParseError{ code, field? }` för alla valideringsfel.

**Import-service** (A3): `importBankStatement` validerar FY-tillhörighet,
statement_date inom FY, opening + SUM(tx) = closing (exakt), dublett-hash.
All-or-nothing via `db.transaction()`.

**Match-service** (A4): `matchBankTransaction` öppnar transaktion, validerar
direction (+TX→invoice, −TX→expense), anropar `_payInvoiceTx`/`_payExpenseTx`
(exponerade via `export` i respektive service för M112-symmetri). Payment-raden
kopplas via split FK i reconciliation_matches. M99 öresutjämning fungerar
automatiskt när diff ≤ 50 öre eftersom vi återanvänder den etablerade
pay-pathen.

**IPC** (A5): 4 kanaler via `wrapIpcHandler` (M128, M144). Zod-scheman i
channelMap. `useBankStatements`, `useBankStatement`, `useImportBankStatement`,
`useMatchBankTransaction` hooks. `PageId` får `'bank-statements'`.

**UI** (A6): `PageBankStatements` (lista + detail + `MatchDialog`). Import via
fördold `<input type="file">` + `FileReader.text()` → mutation. Sidebar-länk
(Banknote-ikon). Data-testid på alla kritiska E2E-kontrakt (M117).

**E2E** (A7): 3 specs — happy-path, duplicate-rejection, full-stack
match-to-verifikat (seed invoice → import camt.053 → match via IPC → verifiera
A-serie).

## B1 — F62-c-extension sale-price

`disposeFixedAsset` utökad med `sale_price_ore` + `proceeds_account`. 4
bokföringsscenarion täckta:

| Scenario | Rader i E-serie-verifikatet |
|---|---|
| `sale = 0` (utrangering) | D ack_dep, K asset, D 7970 (full book_value) |
| `sale == book_value` | D ack_dep, K asset, D proceeds (ingen 3970/7970) |
| `sale > book_value` | D ack_dep, K asset, D proceeds, K 3970 (vinst) |
| `sale < book_value` | D ack_dep, K asset, D proceeds, D 7970 (förlust) |

`DisposeDialog` ersätter prompt+confirm-kedjan i PageFixedAssets.
`proceeds_account`-dropdown filtrerad till balansräkningskonton (1xxx–2xxx).

## Nya principer

- **M152** (CLAUDE.md §53): `bank_transactions.amount_ore` är signerad rådata,
  avviker avsiktligt från M137 eftersom detta är bank-extern rådata, inte en
  domänenhet. Direction-guard i match-service säkerställer korrekt fakturasida.

## M122-inventory-update (CLAUDE.md)

Inkommande FK-referenser uppdaterade för S55:
- `invoice_payments` ← bank_reconciliation_matches (ny)
- `expense_payments` ← bank_reconciliation_matches (ny)
- `bank_statements` ← bank_transactions (ny)
- `bank_transactions` ← bank_reconciliation_matches (ny)

## Upfront-beslut (låsta från QA-revisionen, hölls genom leveransen)

Beslut 1–12 i prompten implementerade enligt spec. Inga avsteg.

## Deferred till S56-backlog

- **F66-b** auto-matchnings-algoritm (scoring + confidence)
- **F66-c** IBAN ↔ counterparty-register (auto-creation)
- **F66-d** auto-klassificering av bankavgifter (6570) + ränteintäkter (8310)
- **F66-e** bank-match unmatch via correction-service
- **F63-polish-b** SIE4 konflikt-resolution-UI (1.5 SP)
- **F67** pagination (> 1000 rader)
- **F68** a11y-bredd
- **F69** M133-städning
- **F62-c E2E-spec**, **F62-d** asset-redigering
