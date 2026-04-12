# S41 Kontraktsaudit-rapport

Sprint: 15 | Session: S41 | Typ: IPC-kontraktsaudit, inventering + djupanalys
Datum: 2026-04-12
Baserat pa: docs/s41-step0-output.md (radata), schema-dump mot user_version=21

---

## 16 Findings

### F1. Ore-suffix saknas pa 8 belopp-kolumner (SCHEMA)

Projekt-konventionen (M48, Sprint 11) ar att alla belopp-kolumner ska ha `_ore`-suffix.
8 kolumner bryter mot detta:

| Tabell | Kolumn | Borde vara |
|--------|--------|------------|
| invoices | paid_amount | paid_amount_ore |
| expenses | paid_amount | paid_amount_ore |
| invoice_payments | amount | amount_ore |
| expense_payments | amount | amount_ore |
| opening_balances | balance | balance_ore |
| companies | share_capital | share_capital_ore |
| products | default_price | default_price_ore |
| price_list_items | price | price_ore |

**Prio: A** — Driftar fraan den formaliserade M48-konventionen. 8 kolumn-renames.

### F2. manual_entry_lines.account_number saknar FK (SCHEMA)

`journal_entry_lines.account_number` och `expense_lines.account_number` har
`REFERENCES accounts(account_number)`. `manual_entry_lines.account_number` saknar
FK-constraint. Data-integritetsrisk: manuella verifikationer kan referera obefintliga
konton.

**Prio: A** — Krav table recreation (migration). 1 normaliseringsatgard.

### F3. fiscalYearId vs fiscal_year_id i IPC-schemas (KONTRAKT)

4 schemas anvander camelCase `fiscalYearId`:
- DashboardSummaryInputSchema (rad 445)
- TaxForecastInputSchema (rad 452)
- FiscalYearSwitchInputSchema (rad 673)
- NetResultInputSchema (rad 679)

Ovriga ~19 schemas anvander snake_case `fiscal_year_id`. Renderer maste veta vilken
variant varje kanal anvander.

**Prio: A** — 4 schema-andringar + matchande service/handler/renderer-uppdateringar.

### F4. Schema-namnkonvention: 5 varianter (KONTRAKT)

Exporterade schemas i ipc-schemas.ts anvander minst 5 suffix-moenster:

| Monster | Exempel | Antal |
|---------|---------|-------|
| `*InputSchema` | SaveDraftInputSchema | ~25 |
| `*Schema` (utan Input) | ListExpensesSchema, FinalizeExpenseSchema | ~20 |
| `*IdSchema` | InvoiceIdSchema, ExpenseIdSchema | 5 |
| `*PayloadSchema` | PayInvoicesBulkPayloadSchema | 2 |
| `*RequestSchema` | ExportWriteFileRequestSchema, ReportRequestSchema | 2 |

Inga regler om nar vilken variant anvands.

**Prio: B** — Kosmetiskt men skapar kognitiv last. Renames ar safe (find-replace).
63 schemas att granska, ~30 att byta namn pa. Stor ytandring, lag risk.

### F5. Finalize-schema naming-asymmetri (KONTRAKT)

| Schema | Monster |
|--------|---------|
| FinalizeInvoiceInputSchema | Entity sist, har Input |
| FinalizeExpenseSchema | Entity sist, saknar Input |
| ManualEntryFinalizeSchema | Entity forst, saknar Input |

3 schemas, 3 olika moenster for samma operation.

**Prio: B** — Del av F4 men specifikt for finalize-operationer. 2 renames.

### F6. DraftList vs ListExpenses naming-riktning (KONTRAKT)

| Schema | Monster |
|--------|---------|
| DraftListInputSchema | NounVerb |
| ListExpenseDraftsSchema | VerbNoun |
| ManualEntryListSchema | NounVerb |
| InvoiceListInputSchema | NounVerb |
| ListExpensesSchema | VerbNoun |

Expense-domanen anvander VerbNoun, ovriga NounVerb. 2 renames.

**Prio: B** — Del av F4.

### F7. payment_terms vs payment_terms_days (SCHEMA + TYPER)

- `counterparties.payment_terms_days` (med _days suffix)
- `invoices.payment_terms` (utan _days)
- `expenses.payment_terms` (utan _days)

Samma koncept, olika namn. TS-typerna anvander `payment_terms` overallt utom
counterparties som har `default_payment_terms`.

**Prio: C** — Kosmetisk. Kolumn-rename pa counterparties (1 migration). Lag prioritet.

### F8. verification_sequences.series vs journal_entries.verification_series (SCHEMA)

Samma koncept (verifikationsserie-prefix) med olika kolumnnamn:
- `verification_sequences.series`
- `journal_entries.verification_series`

**Prio: C** — Kosmetisk. Rename pa verification_sequences.series → verification_series.
1 migration, lag risk men lat paverkan.

### F9. created_at timezone-inkonsistens (SCHEMA)

- De flesta tabeller: `DEFAULT (datetime('now'))` — UTC
- manual_entries + manual_entry_lines: `DEFAULT (datetime('now','localtime'))` — lokal tid

Blandar UTC och lokal tid i samma databas.

**Prio: B** — Datakvalitetsrisk vid fragor som spanner bada tabeller. Krav table recreation
for manual_entries (ALTER TABLE kan inte andra DEFAULT pa befintlig kolumn i SQLite).
2 table recreations.

### F10. expense_lines saknar sort_order och created_at (SCHEMA)

`invoice_lines` har bade `sort_order` och `created_at`. `expense_lines` saknar bada.
Kostnadsposter saknar deterministisk radordning och audittrail.

**Prio: B** — 2 ALTER TABLE (enkel migration, ingen table recreation).

### F11. Saknade CHECK-constraints pa belopp-kolumner (SCHEMA)

Flera belopp-kolumner saknar CHECK >= 0 eller liknande:

| Tabell | Kolumn | Constraint |
|--------|--------|------------|
| opening_balances | balance | Ingen (kan vara negativ — intentionellt?) |
| companies | share_capital | Ingen |
| products | default_price | Ingen |
| price_list_items | price | Ingen |
| journal_entry_lines | vat_ore | Ingen (men har CHECK pa debit/credit) |
| payment_batches | bank_fee_ore | Ingen |

**Prio: C** — Defense-in-depth. Krav table recreation for CHECK-constraint-andringar i
SQLite (ALTER TABLE stoder inte ADD CHECK). Stor effort, lag paverkan.

### F12. Inline ALTER-kolumner skapar olasbara schema-dumpar (SCHEMA)

7 tabeller har kolumner som lagts till via ALTER TABLE och nu dyker upp efter CHECK-constraints
i .schema-dumpen: companies, counterparties, invoices, invoice_lines, invoice_payments,
expenses, expense_payments.

Inte en bugg, men forsvaarar schema-lasbarhet och audits.

**Prio: C** — Fixas genom table recreation-migrationer som anda behovs for F2/F9/F11.
Ingen separat atgard behover planeras.

### F13. IPC-handler error-handling: 3 varianter (KONTRAKT)

Handlers i ipc-handlers.ts anvander tre olika monster:
- **Pattern A:** Return `[]` pa validation error (list-handlers)
- **Pattern B:** Return explicit `{ success: false, error, code }` (mutation-handlers)
- **Pattern C:** Delegera validering till service (blandade)

**Prio: B** — Pattern B borde vara standard. ~10 handlers att normalisera.

### F14. company_id pa journal_entries och accounting_periods (SCHEMA)

Bada tabeller har `company_id` trots att `fiscal_year_id` redan ger company-scopet via
FK till fiscal_years. Denormalisering for query-performance (idx_ap_dates, trigger
trg_check_period_on_booking).

**Prio: C** — Intentionell denormalisering. Dokumentera i CLAUDE.md, ingen atgard.

### F15. expense_payments saknar single-column FK-index (SCHEMA)

`invoice_payments` har bade `idx_ip_invoice(invoice_id)` och `idx_payments_invoice(invoice_id, amount)`.
`expense_payments` har bara `idx_expense_payments_expense(expense_id, amount)` — saknar
single-column index pa `expense_id`.

**Prio: C** — Enkel CREATE INDEX. 1 migration-rad.

### F16. BulkPaymentResultSchema definierad men inte validerad server-side (KONTRAKT)

`BulkPaymentResultSchema` (rad 580) ar definierad i ipc-schemas.ts men handlers bygger
return-objekt inline utan att validera mot schemat. Schema och runtime kan drifta.

**Prio: C** — Lag risk (schema ar korrekt idag). Dokumentera forvantning att bulk-return
ska valideras mot schemat, alternativt ta bort schemat och anvand enbart TS-typen.

---

## Scope-gate-rakning

Normaliseringsatgard = ett PayloadSchema, en tabellkolumn, eller en service-return-typ
som kraver strukturell andring.

| Finding | Normaliseringsatgarder | Typ |
|---------|----------------------|-----|
| F1 | 8 kolumn-renames | tabellkolumn |
| F2 | 1 FK-constraint (table recreation) | tabellkolumn |
| F3 | 4 schema-faltrenames + handler/service-uppdatering | PayloadSchema |
| F4 | ~30 schema-namnbyten | PayloadSchema |
| F5 | 2 schema-namnbyten | PayloadSchema (del av F4) |
| F6 | 2 schema-namnbyten | PayloadSchema (del av F4) |
| F7 | 1 kolumn-rename | tabellkolumn |
| F8 | 1 kolumn-rename | tabellkolumn |
| F9 | 2 DEFAULT-andringar (table recreation) | tabellkolumn |
| F10 | 2 nya kolumner | tabellkolumn |
| F11 | ~6 CHECK-constraints (table recreation) | tabellkolumn |
| F13 | ~10 handler-refaktorer | service-return-typ |
| F15 | 1 index | (ej normaliseringsatgard) |

**Totalt: ~34 normaliseringsatgarder** exkl. index-tillagg och dokumentation.

> Scope-gate-grans per prompt: 15 atgarder.
> **34 >> 15 => Sprint 16 bryts ut per M109.**

---

## A/B/C-beslut

### Kategori A — Krav (maste fixas)

| # | Finding | Atgarder | Motivering |
|---|---------|----------|------------|
| F1 | Ore-suffix | 8 kolumn-renames | Bryter mot formaliserad M48-konvention |
| F2 | manual_entry_lines FK | 1 table recreation | Dataintegritet |
| F3 | fiscalYearId casing | 4 schema+handler | API-kontrakt-inkonsistens |

**Sprint 15 scope:** F1 + F2 + F3 = 13 atgarder. Under scope-gate 15.

### Kategori B — Bor fixas (nasta sprint)

| # | Finding | Atgarder | Motivering |
|---|---------|----------|------------|
| F4 | Schema-namnkonvention | ~30 renames | Kognitiv last, drift-risk |
| F5 | Finalize-asymmetri | (del av F4) | |
| F6 | List-riktning | (del av F4) | |
| F9 | Timezone-inkonsistens | 2 table recreations | Datakvalitet |
| F10 | expense_lines kolumner | 2 ALTER TABLE | Paritet |
| F13 | Handler-patterns | ~10 refaktorer | Kodkvalitet |

**Sprint 16 scope:** F4 + F9 + F10 + F13 = ~44 atgarder. Bryts i 2-3 sessioner.

### Kategori C — Dokumentera / parkera

| # | Finding | Beslut |
|---|---------|--------|
| F7 | payment_terms_days | Dokumentera i CLAUDE.md |
| F8 | series vs verification_series | Parkera — lag risk |
| F11 | Saknade CHECK-constraints | Parkera — table recreation for defense-in-depth ar overkill |
| F12 | ALTER-kolumner i schema-dump | Fixas som biprodukt av F2/F9 table recreations |
| F14 | company_id denormalisering | Dokumentera som intentionell |
| F15 | expense_payments index | Lagg till i narmaste migration |
| F16 | BulkPaymentResultSchema | Dokumentera forvantning |

---

## Sprint-split

### Sprint 15 (S41-S43): Kritiska normaliseringar

| Session | Scope |
|---------|-------|
| S41 | Kontraktsaudit + rapport (denna session) |
| S42 | F1: Ore-suffix-renames (8 kolumner, 8 migrationer) |
| S43 | F2: manual_entry_lines FK + F3: fiscalYearId casing |

### Sprint 16 (S44-S46): Schema+IPC-normalisering

| Session | Scope |
|---------|-------|
| S44 | F4/F5/F6: Schema-namnkonvention (63 schemas, ~30 renames) |
| S45 | F9: Timezone-fix + F10: expense_lines paritet |
| S46 | F13: Handler error-pattern normalisering |

### Nytt M-nummer

**M119: Ore-suffix ar obligatoriskt for alla belopp-kolumner.**
Alla INTEGER-kolumner i SQLite som representerar pengar i ore ska ha `_ore`-suffix.
Undantag: ingen. Galler retroaktivt (Sprint 15 F1) och framaat.

---

## Verifiering

- docs/s41-step0-output.md: radata (7 sektioner), skapad 2026-04-12
- docs/s41-report.md: denna fil
- Testbaslinje: 1161 tester (85 filer), alla groena
- Working tree: clean (utom docs/)

Steg 0 + djupanalys klar. Sprint 15 S42 kan borja.
