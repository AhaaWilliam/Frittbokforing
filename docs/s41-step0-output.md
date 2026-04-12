# S41 Steg 0 — Schema- och kontraktsinventering

Sprint: 15 | Session: S41 | Typ: Steg 0 (M105)

---

## Sektion 1. Schema

Skapad via `tests/system/helpers/system-test-context.ts` `createTemplateDb()`-mönstret
(engångs-script `s41-onboard.ts` som importerar `migrations` från `src/main/migrations.ts`,
kör alla 21 migrationer mot `/tmp/s41-fresh.db`, utan seed-data).

```sql
CREATE TABLE companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    org_number TEXT NOT NULL,
    name TEXT NOT NULL,
    legal_form TEXT NOT NULL DEFAULT 'ab',
    fiscal_rule TEXT NOT NULL DEFAULT 'K2',
    address_line1 TEXT,
    address_line2 TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT NOT NULL DEFAULT 'SE',
    base_currency TEXT NOT NULL DEFAULT 'SEK',
    share_capital INTEGER,
    registration_date TEXT,
    board_members TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), vat_number TEXT, email TEXT, phone TEXT, bankgiro TEXT, plusgiro TEXT, website TEXT,
    CHECK (legal_form IN ('ab', 'enskild_firma', 'hb', 'kb')),
    CHECK (fiscal_rule IN ('K2', 'K3'))
);
CREATE TABLE sqlite_sequence(name,seq);
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    vat_code TEXT,
    sru_code TEXT,
    k2_allowed INTEGER NOT NULL DEFAULT 1,
    k3_only INTEGER NOT NULL DEFAULT 0,
    is_system_account INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')),
    CHECK (is_active IN (0, 1)),
    CHECK (k2_allowed IN (0, 1)),
    CHECK (k3_only IN (0, 1)),
    CHECK (is_system_account IN (0, 1))
);
CREATE INDEX idx_accounts_number ON accounts (account_number);
CREATE INDEX idx_accounts_type ON accounts (account_type);
CREATE TABLE fiscal_years (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    year_label TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_closed INTEGER NOT NULL DEFAULT 0,
    closed_at TEXT,
    annual_report_status TEXT NOT NULL DEFAULT 'not_started',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (end_date > start_date),
    CHECK (is_closed IN (0, 1)),
    CHECK (annual_report_status IN ('not_started', 'draft', 'preliminary', 'final', 'submitted')),
    UNIQUE (company_id, year_label)
);
CREATE TABLE accounting_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
    period_number INTEGER NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_closed INTEGER NOT NULL DEFAULT 0,
    closed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (end_date >= start_date),
    CHECK (period_number BETWEEN 1 AND 13),
    CHECK (is_closed IN (0, 1)),
    UNIQUE (fiscal_year_id, period_number)
);
CREATE INDEX idx_ap_dates ON accounting_periods (company_id, start_date, end_date);
CREATE TABLE verification_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
    series TEXT NOT NULL DEFAULT 'A',
    last_number INTEGER NOT NULL DEFAULT 0,
    UNIQUE (fiscal_year_id, series)
);
CREATE TABLE journal_entry_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
    line_number INTEGER NOT NULL,
    account_number TEXT NOT NULL REFERENCES accounts(account_number),
    debit_ore INTEGER NOT NULL DEFAULT 0,
    credit_ore INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    vat_code TEXT,
    vat_ore INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (debit_ore >= 0),
    CHECK (credit_ore >= 0),
    CHECK (NOT (debit_ore > 0 AND credit_ore > 0)),
    CHECK (debit_ore > 0 OR credit_ore > 0),
    UNIQUE (journal_entry_id, line_number)
);
CREATE INDEX idx_jel_entry ON journal_entry_lines (journal_entry_id);
CREATE INDEX idx_jel_account ON journal_entry_lines (account_number);
CREATE TABLE counterparties (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    org_number TEXT,
    email TEXT,
    phone TEXT,
    address_line1 TEXT,
    postal_code TEXT,
    city TEXT,
    country TEXT DEFAULT 'SE',
    default_revenue_account TEXT,
    default_expense_account TEXT,
    payment_terms_days INTEGER NOT NULL DEFAULT 30,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), vat_number TEXT, contact_person TEXT, updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (type IN ('customer', 'supplier', 'both')),
    CHECK (is_active IN (0, 1))
);
CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    counterparty_id INTEGER NOT NULL REFERENCES counterparties(id),
    invoice_type TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    net_amount_ore INTEGER NOT NULL,
    vat_amount_ore INTEGER NOT NULL DEFAULT 0,
    total_amount_ore INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'SEK',
    status TEXT NOT NULL DEFAULT 'draft',
    paid_amount INTEGER NOT NULL DEFAULT 0,
    journal_entry_id INTEGER REFERENCES journal_entries(id),
    ocr_number TEXT,
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')), fiscal_year_id INTEGER REFERENCES fiscal_years(id), payment_terms INTEGER NOT NULL DEFAULT 30,
    CHECK (invoice_type IN ('customer_invoice', 'supplier_invoice', 'credit_note')),
    CHECK (status IN ('draft', 'unpaid', 'partial', 'paid', 'overdue', 'void')),
    CHECK (net_amount_ore >= 0),
    CHECK (vat_amount_ore >= 0),
    CHECK (total_amount_ore >= 0),
    CHECK (paid_amount >= 0)
);
CREATE INDEX idx_inv_counterparty ON invoices (counterparty_id);
CREATE INDEX idx_inv_status ON invoices (status);
CREATE INDEX idx_inv_due ON invoices (due_date);
CREATE TABLE invoice_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
    payment_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), payment_method TEXT, account_number TEXT DEFAULT '1930' REFERENCES accounts(account_number), bank_fee_ore INTEGER, bank_fee_account TEXT, payment_batch_id INTEGER REFERENCES payment_batches(id),
    CHECK (amount > 0)
);
CREATE INDEX idx_ip_invoice ON invoice_payments (invoice_id);
CREATE TABLE vat_codes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    rate_percent REAL NOT NULL,
    vat_type TEXT NOT NULL,
    sales_account TEXT,
    purchase_account TEXT,
    vat_account TEXT,
    report_box TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    CHECK (rate_percent >= 0 AND rate_percent <= 100),
    CHECK (vat_type IN ('outgoing', 'incoming', 'exempt')),
    CHECK (is_active IN (0, 1))
);
CREATE TABLE opening_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
    account_number TEXT NOT NULL REFERENCES accounts(account_number),
    balance INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (fiscal_year_id, account_number)
);
CREATE TRIGGER trg_prevent_invoice_delete
BEFORE DELETE ON invoices
WHEN OLD.status != 'draft'
BEGIN
    SELECT RAISE(ABORT, 'Faktura som inte är utkast kan inte raderas. Makulera istället.');
END;
CREATE TRIGGER trg_validate_org_number
BEFORE INSERT ON companies
BEGIN
  SELECT CASE
    WHEN LENGTH(NEW.org_number) != 11 THEN
      RAISE(ABORT, 'org_number must be exactly 11 characters (NNNNNN-NNNN)')
    WHEN SUBSTR(NEW.org_number, 7, 1) != '-' THEN
      RAISE(ABORT, 'org_number must have hyphen at position 7')
    WHEN SUBSTR(NEW.org_number, 1, 1) NOT IN ('5','6','7','8','9') THEN
      RAISE(ABORT, 'org_number first digit must be 5-9 for AB')
  END;
END;
CREATE UNIQUE INDEX idx_companies_org_number ON companies (org_number);
CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'timme'
    CHECK(unit IN ('timme','styck','dag','månad','km','pauschal')),
  default_price INTEGER NOT NULL DEFAULT 0,
  vat_code_id INTEGER NOT NULL REFERENCES vat_codes(id),
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  article_type TEXT NOT NULL DEFAULT 'service'
    CHECK(article_type IN ('service','goods','expense')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE price_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  counterparty_id INTEGER REFERENCES counterparties(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE price_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  price INTEGER NOT NULL,
  UNIQUE(price_list_id, product_id)
);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_counterparties_active ON counterparties(is_active);
CREATE INDEX idx_counterparties_type ON counterparties(type);
CREATE INDEX idx_price_list_items_product ON price_list_items(product_id);
CREATE UNIQUE INDEX idx_counterparties_org_unique
  ON counterparties(org_number) WHERE org_number IS NOT NULL;
CREATE TABLE invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  product_id INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price_ore INTEGER NOT NULL DEFAULT 0,
  vat_code_id INTEGER NOT NULL REFERENCES vat_codes(id),
  line_total_ore INTEGER NOT NULL DEFAULT 0,
  vat_amount_ore INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), account_number TEXT REFERENCES accounts(account_number),
  CHECK (quantity > 0),
  CHECK (unit_price_ore >= 0),
  CHECK (line_total_ore >= 0)
);
CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);
CREATE UNIQUE INDEX idx_invoices_year_invnum
  ON invoices(fiscal_year_id, invoice_number)
  WHERE invoice_number != '';
CREATE INDEX idx_payments_invoice ON invoice_payments(invoice_id, amount);
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  counterparty_id INTEGER NOT NULL REFERENCES counterparties(id),
  supplier_invoice_number TEXT,
  expense_date TEXT NOT NULL,
  due_date TEXT,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK(status IN ('draft', 'unpaid', 'paid', 'overdue', 'partial')),
  payment_terms INTEGER NOT NULL DEFAULT 30,
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  total_amount_ore INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
, paid_amount INTEGER NOT NULL DEFAULT 0);
CREATE INDEX idx_expenses_fiscal_year_status
  ON expenses(fiscal_year_id, status, expense_date);
CREATE UNIQUE INDEX idx_expenses_supplier_duplicate
  ON expenses(counterparty_id, supplier_invoice_number)
  WHERE supplier_invoice_number IS NOT NULL;
CREATE TABLE expense_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
  description TEXT NOT NULL DEFAULT '',
  account_number TEXT NOT NULL REFERENCES accounts(account_number),
  quantity INTEGER NOT NULL DEFAULT 100,
  unit_price_ore INTEGER NOT NULL DEFAULT 0,
  vat_code_id INTEGER NOT NULL REFERENCES vat_codes(id),
  line_total_ore INTEGER NOT NULL DEFAULT 0,
  vat_amount_ore INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE expense_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  payment_date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  payment_method TEXT,
  account_number TEXT DEFAULT '1930' REFERENCES accounts(account_number),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
, bank_fee_ore INTEGER, bank_fee_account TEXT, payment_batch_id INTEGER REFERENCES payment_batches(id));
CREATE INDEX idx_expense_payments_expense
  ON expense_payments(expense_id, amount);
CREATE TABLE manual_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  entry_date TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','finalized')),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE manual_entry_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manual_entry_id INTEGER NOT NULL REFERENCES manual_entries(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  account_number TEXT NOT NULL,
  debit_ore INTEGER NOT NULL DEFAULT 0,
  credit_ore INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  UNIQUE(manual_entry_id, line_number)
);
CREATE TRIGGER trg_fiscal_year_no_overlap_insert
BEFORE INSERT ON fiscal_years
WHEN EXISTS (
  SELECT 1 FROM fiscal_years
  WHERE company_id = NEW.company_id
    AND NOT (NEW.end_date < start_date OR NEW.start_date > end_date)
)
BEGIN
  SELECT RAISE(ABORT, 'Räkenskapsåret överlappar med befintligt räkenskapsår.');
END;
CREATE TRIGGER trg_fiscal_year_no_overlap_update
BEFORE UPDATE OF start_date, end_date ON fiscal_years
WHEN EXISTS (
  SELECT 1 FROM fiscal_years
  WHERE company_id = NEW.company_id
    AND id != NEW.id
    AND NOT (NEW.end_date < start_date OR NEW.start_date > end_date)
)
BEGIN
  SELECT RAISE(ABORT, 'Räkenskapsåret överlappar med befintligt räkenskapsår.');
END;
CREATE TABLE IF NOT EXISTS "journal_entries" (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        company_id INTEGER NOT NULL REFERENCES companies(id),
        fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
        verification_number INTEGER,
        verification_series TEXT NOT NULL DEFAULT 'A',
        journal_date TEXT NOT NULL,
        registration_date TEXT NOT NULL DEFAULT (datetime('now')),
        description TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        locked_at TEXT,
        created_by INTEGER REFERENCES users(id),
        source_type TEXT DEFAULT 'manual',
        source_reference TEXT,
        corrects_entry_id INTEGER REFERENCES journal_entries(id),
        corrected_by_id INTEGER REFERENCES journal_entries(id),
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        CHECK (status IN ('draft', 'booked', 'corrected')),
        CHECK (source_type IN ('manual', 'auto_invoice', 'auto_payment', 'auto_expense', 'auto_salary', 'auto_depreciation', 'auto_tax', 'import', 'opening_balance', 'auto_bank_fee')),
        UNIQUE (verification_series, verification_number, fiscal_year_id)
      );
CREATE INDEX idx_je_date ON journal_entries (journal_date);
CREATE INDEX idx_je_fiscal_year ON journal_entries (fiscal_year_id);
CREATE INDEX idx_je_status ON journal_entries (status);
CREATE UNIQUE INDEX idx_journal_entries_verify_series_unique
      ON journal_entries(fiscal_year_id, verification_series, verification_number)
      WHERE verification_number IS NOT NULL;
CREATE TRIGGER trg_immutable_booked_entry_update
      BEFORE UPDATE ON journal_entries
      WHEN OLD.status = 'booked' AND OLD.source_type != 'opening_balance'
      BEGIN
          SELECT CASE
              WHEN NEW.status NOT IN ('booked', 'corrected')
              THEN RAISE(ABORT, 'Bokförd verifikation kan bara markeras som rättad (corrected).')
          END;
          SELECT CASE
              WHEN NEW.journal_date != OLD.journal_date
                  OR NEW.description != OLD.description
                  OR NEW.verification_number != OLD.verification_number
                  OR NEW.verification_series != OLD.verification_series
                  OR NEW.company_id != OLD.company_id
                  OR NEW.fiscal_year_id != OLD.fiscal_year_id
              THEN RAISE(ABORT, 'Bokförd verifikation kan inte ändras. Bara status och corrected_by_id får uppdateras.')
          END;
      END;
CREATE TRIGGER trg_immutable_booked_entry_delete
      BEFORE DELETE ON journal_entries
      WHEN OLD.status = 'booked' AND OLD.source_type != 'opening_balance'
      BEGIN
          SELECT RAISE(ABORT, 'Bokförd verifikation kan inte raderas.');
      END;
CREATE TRIGGER trg_immutable_booked_line_update
      BEFORE UPDATE ON journal_entry_lines
      WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
        AND (SELECT source_type FROM journal_entries WHERE id = OLD.journal_entry_id) != 'opening_balance'
      BEGIN
          SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte ändras.');
      END;
CREATE TRIGGER trg_immutable_booked_line_delete
      BEFORE DELETE ON journal_entry_lines
      WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
        AND (SELECT source_type FROM journal_entries WHERE id = OLD.journal_entry_id) != 'opening_balance'
      BEGIN
          SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte raderas.');
      END;
CREATE TRIGGER trg_immutable_booked_line_insert
      BEFORE INSERT ON journal_entry_lines
      WHEN (SELECT status FROM journal_entries WHERE id = NEW.journal_entry_id) = 'booked'
        AND (SELECT source_type FROM journal_entries WHERE id = NEW.journal_entry_id) != 'opening_balance'
      BEGIN
          SELECT RAISE(ABORT, 'Kan inte lägga till rader på bokförd verifikation.');
      END;
CREATE TRIGGER trg_check_balance_on_booking
      BEFORE UPDATE ON journal_entries
      WHEN NEW.status = 'booked' AND OLD.status = 'draft'
      BEGIN
          SELECT CASE
              WHEN (
                  COALESCE(
                      (SELECT SUM(debit_ore) FROM journal_entry_lines WHERE journal_entry_id = NEW.id), 0
                  ) -
                  COALESCE(
                      (SELECT SUM(credit_ore) FROM journal_entry_lines WHERE journal_entry_id = NEW.id), 0
                  )
              ) != 0
              THEN RAISE(ABORT, 'Verifikationen balanserar inte. Summa debet måste vara lika med summa kredit.')
          END;
          SELECT CASE
              WHEN (
                  SELECT COUNT(*)
                  FROM journal_entry_lines
                  WHERE journal_entry_id = NEW.id
              ) < 2
              THEN RAISE(ABORT, 'Verifikation måste ha minst två rader.')
          END;
      END;
CREATE TRIGGER trg_check_period_on_booking
      BEFORE UPDATE ON journal_entries
      WHEN NEW.status = 'booked' AND OLD.status = 'draft'
      BEGIN
          SELECT CASE
              WHEN (SELECT is_closed FROM fiscal_years WHERE id = NEW.fiscal_year_id) = 1
              THEN RAISE(ABORT, 'Kan inte bokföra i stängt räkenskapsår.')
          END;
          SELECT CASE
              WHEN NOT EXISTS (
                  SELECT 1 FROM fiscal_years
                  WHERE id = NEW.fiscal_year_id
                    AND NEW.journal_date BETWEEN start_date AND end_date
              )
              THEN RAISE(ABORT, 'Bokföringsdatum ligger utanför räkenskapsårets period.')
          END;
          SELECT CASE
              WHEN EXISTS (
                  SELECT 1 FROM accounting_periods
                  WHERE fiscal_year_id = NEW.fiscal_year_id
                    AND company_id = NEW.company_id
                    AND NEW.journal_date BETWEEN start_date AND end_date
                    AND is_closed = 1
              )
              THEN RAISE(ABORT, 'Kan inte bokföra i stängd period.')
          END;
      END;
CREATE TABLE payment_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
      batch_type TEXT NOT NULL CHECK (batch_type IN ('invoice', 'expense')),
      payment_date TEXT NOT NULL,
      account_number TEXT NOT NULL,
      bank_fee_ore INTEGER NOT NULL DEFAULT 0,
      bank_fee_journal_entry_id INTEGER REFERENCES journal_entries(id),
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'cancelled')),
      user_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
CREATE INDEX idx_pb_fiscal_year ON payment_batches(fiscal_year_id);
CREATE INDEX idx_ip_batch ON invoice_payments(payment_batch_id) WHERE payment_batch_id IS NOT NULL;
CREATE INDEX idx_ep_batch ON expense_payments(payment_batch_id) WHERE payment_batch_id IS NOT NULL;
```

Tabeller: 21 (companies, sqlite_sequence, users, accounts, fiscal_years, accounting_periods,
verification_sequences, journal_entry_lines, counterparties, invoices, invoice_payments,
vat_codes, opening_balances, products, price_lists, price_list_items, invoice_lines,
expenses, expense_lines, expense_payments, manual_entries, manual_entry_lines,
journal_entries, payment_batches = 24 inklusive sqlite_sequence).

---

## Sektion 2. Triggers

11 triggers, 5 distinkta tabeller har triggers.

| # | Trigger | Tabell |
|---|---------|--------|
| 1 | trg_validate_org_number | companies |
| 2 | trg_fiscal_year_no_overlap_insert | fiscal_years |
| 3 | trg_fiscal_year_no_overlap_update | fiscal_years |
| 4 | trg_prevent_invoice_delete | invoices |
| 5 | trg_check_balance_on_booking | journal_entries |
| 6 | trg_check_period_on_booking | journal_entries |
| 7 | trg_immutable_booked_entry_delete | journal_entries |
| 8 | trg_immutable_booked_entry_update | journal_entries |
| 9 | trg_immutable_booked_line_delete | journal_entry_lines |
| 10 | trg_immutable_booked_line_insert | journal_entry_lines |
| 11 | trg_immutable_booked_line_update | journal_entry_lines |

Fullständig SQL-kropp för varje trigger finns i sektion 1 (schema-dumpen).

---

## Sektion 3. Migrations

- **PRAGMA user_version:** 21
- **Antal migrationer:** 21

| Version | Titel |
|---------|-------|
| 001 | 13 tabeller + CHECK constraints + indexes |
| 002 | 8 SQLite-triggers (immutabilitet, fakturaskydd, balansvalidering, periodvalidering) |
| 003 | Seed data — ~95 BAS-konton (K2/K3) + 7 momskoder |
| 004 | org_number format validation (defense in depth) |
| 005 | Stamdata tables + schema extensions (smart — checks existing columns) [programmatic] |
| 006 | Invoice extensions — fiscal_year_id, payment_terms, invoice_lines table [programmatic] |
| 007 | invoice_lines.account_number + UNIQUE constraints for finalize [programmatic] |
| 008 | invoice_payments extensions for payment tracking [programmatic] |
| 009 | expenses + expense_lines + B-series support |
| 010 | expense_payments + auto_expense_payment source_type [programmatic] |
| 011 | Manual entries (C-series) |
| 012 | Opening balance support (table recreation for CHECK constraint + trigger exceptions) [programmatic] |
| 013 | Mark additional system-critical accounts |
| 014 | Defense in depth — förhindra överlappande fiscal years |
| 015 | Add paid_amount to expenses (speglar invoices.paid_amount, M66) [programmatic] |
| 016 | invoice_lines: unit_price → unit_price_ore |
| 017 | invoice domain rename (total_amount → total_amount_ore, vat_amount → vat_amount_ore, net_amount → net_amount_ore, line_total → line_total_ore) |
| 018 | journal_entry_lines: debit_amount → debit_ore, credit_amount → credit_ore, vat_amount → vat_ore + trg_check_balance_on_booking recreated [programmatic verify] |
| 019 | manual_entry_lines: debit_amount → debit_ore, credit_amount → credit_ore [programmatic verify] |
| 020 | bank_fee_ore + bank_fee_account on both payment tables [programmatic] |
| 021 | payment_batches + auto_bank_fee source_type [programmatic] |

---

## Sektion 4. IPC-ytor

### Yta 1 — Shared IPC-schemas

| Fil | Rader |
|-----|-------|
| `src/shared/ipc-schemas.ts` | 681 |
| `src/shared/types.ts` | 780 |
| `src/shared/date-utils.ts` | 112 |
| **Totalt** | **1573** |

- `src/main/ipc-schemas.ts` — barrel re-export, 8 rader. Ej räknad i sektion 5.
- Inga ytterligare filer i `src/shared/` exporterar Zod-scheman (bara ovan tre filer).

### Yta 2 — Main services och IPC-handlers

| Fil | Rader |
|-----|-------|
| `src/main/services/account-service.ts` | 237 |
| `src/main/services/backup-service.ts` | 30 |
| `src/main/services/company-service.ts` | 280 |
| `src/main/services/counterparty-service.ts` | 221 |
| `src/main/services/dashboard-service.ts` | 83 |
| `src/main/services/excel/excel-export-service.ts` | 470 |
| `src/main/services/expense-service.ts` | 1191 |
| `src/main/services/export/export-data-queries.ts` | 450 |
| `src/main/services/fiscal-service.ts` | 299 |
| `src/main/services/invoice-service.ts` | 1341 |
| `src/main/services/manual-entry-service.ts` | 391 |
| `src/main/services/opening-balance-service.ts` | 212 |
| `src/main/services/pdf/invoice-pdf-service.ts` | 416 |
| `src/main/services/pdf/ocr.ts` | 38 |
| `src/main/services/product-service.ts` | 320 |
| `src/main/services/report/balance-queries.ts` | 85 |
| `src/main/services/report/k2-mapping.ts` | 363 |
| `src/main/services/report/report-service.ts` | 158 |
| `src/main/services/result-service.ts` | 129 |
| `src/main/services/sie4/sie4-account-type-mapper.ts` | 31 |
| `src/main/services/sie4/sie4-amount.ts` | 16 |
| `src/main/services/sie4/sie4-checksum.ts` | 20 |
| `src/main/services/sie4/sie4-export-service.ts` | 256 |
| `src/main/services/sie5/account-type-mapper.ts` | 50 |
| `src/main/services/sie5/amount-conversion.ts` | 23 |
| `src/main/services/sie5/sie5-data-queries.ts` | 32 |
| `src/main/services/sie5/sie5-export-service.ts` | 415 |
| `src/main/services/tax-service.ts` | 99 |
| `src/main/services/vat-report-service.ts` | 194 |
| `src/main/services/vat-service.ts` | 18 |
| **Totalt services** | **7868** |

| Fil | Rader |
|-----|-------|
| `src/main/ipc-handlers.ts` | 1172 |
| `src/main/ipc/test-handlers.ts` | 116 |

Inga andra filer i `src/main/ipc/`.

### Yta 3 — Renderer form-schemas och IPC-lager

| Fil | Rader |
|-----|-------|
| `src/renderer/lib/form-schemas/customer.ts` | 63 |
| `src/renderer/lib/form-schemas/expense.ts` | 83 |
| `src/renderer/lib/form-schemas/invoice.ts` | 83 |
| `src/renderer/lib/form-schemas/manual-entry.ts` | 72 |
| `src/renderer/lib/form-schemas/product.ts` | 47 |
| **Totalt form-schemas** | **348** |

| Fil | Rader |
|-----|-------|
| `src/renderer/lib/query-keys.ts` | 76 |
| `src/renderer/lib/ipc-helpers.ts` | 28 |
| `src/renderer/lib/use-ipc-query.ts` | 41 |
| `src/renderer/lib/use-ipc-mutation.ts` | 50 |
| **Totalt IPC-lager** | **195** |

---

## Sektion 5. PayloadSchemas

**Notering:** Prompten använde namnkonventionen `*PayloadSchema`. Faktisk namnkonvention
i `src/shared/ipc-schemas.ts` är `*Schema` (utan "Payload"-prefix). Bara 2 av 63
exporterade scheman har "PayloadSchema" i namnet.

### Tre grep-siffror (anpassade till faktisk namnkonvention `*Schema`)

| Mätning | Resultat |
|---------|----------|
| `grep -c "Schema" src/shared/ipc-schemas.ts` | (ej meningsfullt — matchar importer, `z.object` etc.) |
| `grep -E "^export const \w+\s*=" ... \| wc -l` (deklarationsrader) | **63** |
| `grep -oE "\w+Schema\b" ... \| sort -u \| wc -l` (unika schemanamn, inkl. refererade) | **65** |

Avvikelse från förväntat ~61: **faktisk siffra 63 deklarerade, 65 unika namn.**
Delta +2 unika namn kan vara interna sub-scheman eller re-exporter.

### Alla 63 exporterade scheman (sorterat)

```
AccountCreateInputSchema
AccountListAllInputSchema
AccountListInputSchema
AccountToggleActiveInputSchema
AccountUpdateInputSchema
BulkPaymentResultSchema
CounterpartyIdSchema
CounterpartyListInputSchema
CreateCompanyInputSchema
CreateCounterpartyInputSchema
CreateProductInputSchema
DashboardSummaryInputSchema
DraftListInputSchema
ExportExcelSchema
ExportSie4Schema
ExportSie5Schema
ExportWriteFileRequestSchema
ExpenseIdSchema
FinalizeExpenseSchema
FinalizeInvoiceInputSchema
FiscalPeriodListInputSchema
FiscalYearCreateNewInputSchema
FiscalYearSwitchInputSchema
GenerateInvoicePdfSchema
GetExpensePaymentsSchema
GetExpenseSchema
GetPaymentsInputSchema
GetPriceForCustomerInputSchema
InvoiceDraftLineSchema
InvoiceIdSchema
InvoiceListInputSchema
ListExpenseDraftsSchema
ListExpensesSchema
ManualEntryFinalizeSchema
ManualEntryIdSchema
ManualEntryListSchema
NetResultInputSchema
NextNumberInputSchema
PayExpenseInputSchema
PayExpensesBulkPayloadSchema
PayInvoiceInputSchema
PayInvoicesBulkPayloadSchema
PeriodActionInputSchema
ProductIdSchema
ProductListInputSchema
RemoveCustomerPriceInputSchema
ReportRequestSchema
SaveDraftInputSchema
SaveExpenseDraftSchema
SaveInvoicePdfSchema
SaveManualEntryDraftSchema
SetCustomerPriceInputSchema
TaxForecastInputSchema
UpdateCompanyInputSchema
UpdateCounterpartyInputSchema
UpdateDraftInputSchema
UpdateExpenseDraftSchema
UpdateManualEntryDraftSchema
UpdateProductInputSchema
UpdateSentInvoiceInputSchema
VatCodeListInputSchema
VatNumberSchema
VatReportInputSchema
```

---

## Sektion 6. Testbaslinje

Kord mot ren HEAD (alla Sprint 12-14 committade).

```
Test Files  85 passed (85)
     Tests  1159 passed | 2 skipped (1161)
  Start at  23:19:51
  Duration  6.66s (transform 2.78s, setup 0ms, import 17.38s, tests 24.77s, environment 2.31s)
```

- **Totalt antal tester:** 1159 passed + 2 skipped = 1161
- **Testfiler:** 85
- **Kortid:** 6.66s

**Avvikelse:** Forvantat ~916 tester (S40). Faktiskt 1161 — +245 tester.
Forklaring: Sprint 12-14 har tillkommit sedan S40-baslinjen (bank-fee, bulk-payment,
system-tester, E2E-infra, etc.).

---

## Sektion 7. Git-state

**Branch:** `main`

**Working tree:** Clean (efter att Sprint 12-14 committats i S41-forberedelsen).
Enda untracked: `docs/s41-step0-output.md` (denna fil).

**Senaste 5 commits:**
```
2b748ee chore: gitignore notion-diffs/ och notion-snapshots/
fec4f22 Sprint 14: E2E-testinfrastruktur (Playwright, db-path, full bokforingscykel)
fe9beb3 Sprint 12+13: bankavgifter (migration 020) + bulk-betalningar (migration 021)
ddb032c Sprint 11 Fas 8 (S53): Migration 019 — manual_entry_lines debit_amount/credit_amount -> debit_ore/credit_ore
c721787 Sprint 11 Fas 7 (S51): Migration 018 — journal_entry_lines debit_amount/credit_amount/vat_amount -> debit_ore/credit_ore/vat_ore
```

---

Steg 0 klar. Vantar pa djupanalys i chatten.
