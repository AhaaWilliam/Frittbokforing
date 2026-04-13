# S48 Inventory — F4 Schema-namnkonvention

Sprint 16 Session 48. Inventering av schema-namnkonventionsbrott (F4 från S41-auditen).

## 0.1 Schema-dump

- **Tabeller:** 22 (exkl. sqlite_sequence)
- **Kolumner:** 241 totalt
- **Triggers:** 12 (matchar EXPECTED_TRIGGERS i trigger-inventory.test.ts exakt)
- **user_version:** 24 (24 migrations)

## 0.2 Empirisk konventionsverifiering

| Konvention | Regel | Antal OK | Antal brott | Dominans | Status |
|---|---|---|---|---|---|
| Casing | snake_case | 241 | 0 | 100% | Pass |
| Datetime/timestamp | `_at`-suffix | 26 | 0 | 100% | Pass |
| Date (ren dag) | `_date`-suffix / semantiskt | 15 | 0 | 100% | Pass |
| Foreign keys (surrogat) | `_id`-suffix | 37 | 1 (`created_by`) | 97% | Pass (>80%) |
| Foreign keys (naturlig nyckel) | `account_number` | 8 | 0 | n/a | Intentionellt (C) |
| Booleans | `is_`-prefix | 8 | 2 (`k2_allowed`, `k3_only`) | 80% | Borderline |
| Belopp i öre | `_ore`-suffix (M119) | 22 | 2 | 92% | A-fynd |
| Counts/ordinals | inget suffix | OK | 0 | 100% | Pass |

### Belopp utan `_ore`-suffix (M119-brott)
- `products.default_price` — INTEGER, default 0, kommenterad `// ören` i types.ts
- `price_list_items.price` — INTEGER, NOT NULL, kommenterad `// ören` i types.ts

Dessa missades i Sprint 15 F1 (M119) som hanterade 8 kolumner men
inte products/price_list_items-tabellerna (stamdata vs transaktionsdata).

**Empirisk verifiering:** App-DB visar `default_price: 10000` (= 100 kr),
testfiler bekräftar `95000 // 950 kr`, `100000 // 1000 kr for easy math`.
Värdena är i öre — rent rename, ingen datatransformation.

## 0.3 Per-tabell inventering

### accounting_periods
(inga avvikelser) — A:0 B:0 C:0

### accounts
- `k2_allowed` — B: boolean utan `is_`-prefix. Domänspecifikt kortnamn, `is_k2_allowed` är verbost. Lämnas.
- `k3_only` — B: boolean utan `is_`-prefix. Samma motivering. Lämnas.

### companies
(inga avvikelser) — A:0 B:0 C:0

### counterparties
(inga avvikelser) — A:0 B:0 C:0

### expense_lines
(inga avvikelser) — A:0 B:0 C:0

### expense_payments
(inga avvikelser) — A:0 B:0 C:0

### expenses
(inga avvikelser) — A:0 B:0 C:0

### fiscal_years
(inga avvikelser) — A:0 B:0 C:0

### invoice_lines
(inga avvikelser) — A:0 B:0 C:0

### invoice_payments
(inga avvikelser) — A:0 B:0 C:0

### invoices
(inga avvikelser) — A:0 B:0 C:0

### journal_entries
- `created_by` — C: FK till users(id) utan `_id`-suffix. Intentionell avvikelse:
  `created_by` är ett brett etablerat mönster (Rails, Django, SQL-konventioner).
  Enda `_by`-fält utan `_id`-suffix (jfr `corrected_by_id` som har det). Dokumenterad
  som intentionell — det är ett erkänt namnmönster, inte ett misstag.

### journal_entry_lines
(inga avvikelser) — A:0 B:0 C:0

### manual_entries
(inga avvikelser) — A:0 B:0 C:0

### manual_entry_lines
(inga avvikelser) — A:0 B:0 C:0

### opening_balances
(inga avvikelser) — A:0 B:0 C:0

### payment_batches
(inga avvikelser) — A:0 B:0 C:0

### price_list_items
- `price` — **A:** belopp i öre utan `_ore`-suffix (M119-brott). Förslag: `price_ore`.
  Triggers: 0. Index: 0 (kolumnen ej i index). Views: 0.

### price_lists
(inga avvikelser) — A:0 B:0 C:0

### products
- `default_price` — **A:** belopp i öre utan `_ore`-suffix (M119-brott). Förslag: `default_price_ore`.
  Triggers: 0. Index: 0 (kolumnen ej i index). Views: 0.

### users
(inga avvikelser) — A:0 B:0 C:0

### vat_codes
(inga avvikelser) — A:0 B:0 C:0

### verification_sequences
(inga avvikelser) — A:0 B:0 C:0

## 0.4 Summering + scope-gate

- **A-fynd:** 2 kolumner över 2 tabeller (`products.default_price`, `price_list_items.price`)
- **B-fynd:** 2 kolumner (`accounts.k2_allowed`, `accounts.k3_only`) — lämnas
- **C-fynd:** 9 kolumner (8 `account_number` FK:er + `journal_entries.created_by`) — intentionella, dokumenterat

**Scope-gate: A = 2 → 1 migration.** Båda kolumner saknar triggers/index
på kolumnen. Ren `ALTER TABLE RENAME COLUMN` räcker (inget table-recreate).

## 0.5 Triggers + index + views som påverkas

### products.default_price → default_price_ore
- Triggers som refererar kolumnen: 0
- Index som refererar kolumnen: 0
- Views: 0
- **Strategi:** `ALTER TABLE products RENAME COLUMN default_price TO default_price_ore`

### price_list_items.price → price_ore
- Triggers som refererar kolumnen: 0
- Index som refererar kolumnen: 0 (`idx_price_list_items_product` indexerar `product_id`, inte `price`)
- Views: 0
- **Strategi:** `ALTER TABLE price_list_items RENAME COLUMN price TO price_ore`

Båda är ren RENAME COLUMN — SQLite ≥ 3.25 uppdaterar automatiskt
eventuella trigger-/view-/index-refs (men inga existerar).
Inget table-recreate behövs. M121/M122 ej relevant.

## 0.6 Fyra grep-ytor per A-fynd

### products.default_price → default_price_ore

| Yta | Filer | Träffar |
|---|---|---|
| main (services, migrations) | 1 (product-service.ts) + migrations.ts | 7 |
| shared (types, ipc-schemas) | 2 (types.ts, ipc-schemas.ts) | 3 |
| renderer | 5 (ArticlePicker, ProductList, ProductDetail, ProductForm, form-schemas/product) | 8 |
| tests | ~18 filer | 44 |
| **Totalt** | **~26 filer** | **~62** |

### price_list_items.price → price_ore

| Yta | Filer | Träffar |
|---|---|---|
| main (services) | 1 (product-service.ts) | 6 |
| shared (types, ipc-schemas) | 2 (types.ts, ipc-schemas.ts) | 3 |
| renderer | 2 (ArticlePicker, CustomerPriceTable) | 2 |
| tests | 2 filer (S07, session-5b) | 7 |
| **Totalt** | **~7 filer** | **~18** |

**OBS:** `price` i service-returvärden (`{ price, source }` från `resolvePrice`)
och typer (`CustomerPrice.price`, `SetCustomerPriceInput.price`) behöver
också uppdateras — dessa är inte DB-kolumner men bär samma belopp i öre.
Totalt påverkas: kolumnen + typ-fält + Zod-schema + IPC-returvärden.

### Sammanlagt

~33 filer, ~80 träffar. Test-multiplikator: 44+7 = 51 test-hits (×6–8 av
service-hits, i linje med M109-prediktionen).

## 0.7 Migration-strategi

**1 migration (025):** Båda renames i samma migration — samma konvention (M119),
samma commit, minimalt scope. Båda är ren `ALTER TABLE RENAME COLUMN`.

```sql
ALTER TABLE products RENAME COLUMN default_price TO default_price_ore;
ALTER TABLE price_list_items RENAME COLUMN price TO price_ore;
```

Ingen `PRAGMA foreign_keys = OFF` behövs (inget table-recreate).
Ingen trigger-reattach behövs (M121 ej relevant).
`FK_OFF_MIGRATION_INDEXES` oförändrad.

### Föreslagen implementation-ordning
1. Migration 025 (SQL rename)
2. `src/main/services/product-service.ts`
3. `src/shared/types.ts` + `src/shared/ipc-schemas.ts`
4. `src/renderer/` (5 filer)
5. `tests/` (~20 filer, ~51 ändringar)
6. Verifiering: `npm test`, `tsc --noEmit`, PRAGMA-checks
