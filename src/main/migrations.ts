// Alla migrationer inbäddade i TypeScript.
// Körs i ordning via BEGIN EXCLUSIVE. PRAGMA user_version spårar vilken som körts.

/** Migration 001: 13 tabeller + CHECK constraints + indexes */
const migration001 = `
-- 1. companies
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (legal_form IN ('ab', 'enskild_firma', 'hb', 'kb')),
    CHECK (fiscal_rule IN ('K2', 'K3'))
);

-- 2. users
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 3. accounts
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

-- 4. fiscal_years
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

-- 5. accounting_periods
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

-- 6. verification_sequences
CREATE TABLE verification_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
    series TEXT NOT NULL DEFAULT 'A',
    last_number INTEGER NOT NULL DEFAULT 0,
    UNIQUE (fiscal_year_id, series)
);

-- 7. journal_entries
CREATE TABLE journal_entries (
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
    CHECK (source_type IN ('manual', 'auto_invoice', 'auto_payment', 'auto_expense', 'auto_salary', 'auto_depreciation', 'auto_tax', 'import')),
    UNIQUE (verification_series, verification_number, fiscal_year_id)
);
CREATE INDEX idx_je_date ON journal_entries (journal_date);
CREATE INDEX idx_je_fiscal_year ON journal_entries (fiscal_year_id);
CREATE INDEX idx_je_status ON journal_entries (status);

-- 8. journal_entry_lines
CREATE TABLE journal_entry_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
    line_number INTEGER NOT NULL,
    account_number TEXT NOT NULL REFERENCES accounts(account_number),
    debit_amount INTEGER NOT NULL DEFAULT 0,
    credit_amount INTEGER NOT NULL DEFAULT 0,
    description TEXT,
    vat_code TEXT,
    vat_amount INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (debit_amount >= 0),
    CHECK (credit_amount >= 0),
    CHECK (NOT (debit_amount > 0 AND credit_amount > 0)),
    CHECK (debit_amount > 0 OR credit_amount > 0),
    UNIQUE (journal_entry_id, line_number)
);
CREATE INDEX idx_jel_entry ON journal_entry_lines (journal_entry_id);
CREATE INDEX idx_jel_account ON journal_entry_lines (account_number);

-- 9. counterparties
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
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (type IN ('customer', 'supplier', 'both')),
    CHECK (is_active IN (0, 1))
);

-- 10. invoices
CREATE TABLE invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    counterparty_id INTEGER NOT NULL REFERENCES counterparties(id),
    invoice_type TEXT NOT NULL,
    invoice_number TEXT NOT NULL,
    invoice_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    net_amount INTEGER NOT NULL,
    vat_amount INTEGER NOT NULL DEFAULT 0,
    total_amount INTEGER NOT NULL,
    currency TEXT NOT NULL DEFAULT 'SEK',
    status TEXT NOT NULL DEFAULT 'draft',
    paid_amount INTEGER NOT NULL DEFAULT 0,
    journal_entry_id INTEGER REFERENCES journal_entries(id),
    ocr_number TEXT,
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (invoice_type IN ('customer_invoice', 'supplier_invoice', 'credit_note')),
    CHECK (status IN ('draft', 'unpaid', 'partial', 'paid', 'overdue', 'void')),
    CHECK (net_amount >= 0),
    CHECK (vat_amount >= 0),
    CHECK (total_amount >= 0),
    CHECK (paid_amount >= 0)
);
CREATE INDEX idx_inv_counterparty ON invoices (counterparty_id);
CREATE INDEX idx_inv_status ON invoices (status);
CREATE INDEX idx_inv_due ON invoices (due_date);

-- 11. invoice_payments
CREATE TABLE invoice_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id),
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
    payment_date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (amount > 0)
);
CREATE INDEX idx_ip_invoice ON invoice_payments (invoice_id);

-- 12. vat_codes
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

-- 13. opening_balances
CREATE TABLE opening_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
    account_number TEXT NOT NULL REFERENCES accounts(account_number),
    balance INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (fiscal_year_id, account_number)
);
`

/** Migration 002: 8 SQLite-triggers (immutabilitet, fakturaskydd, balansvalidering, periodvalidering) */
const migration002 = `
-- OBS: journal_date sätts alltid explicit av applikationen.
-- datetime('now') sparar UTC. TypeScript konverterar UTC → lokal tid vid visning.

-- 1. Blockera UPDATE på bokförda verifikationer
--    Tillåter BARA ändring av status→'corrected' och corrected_by_id.
CREATE TRIGGER trg_immutable_booked_entry_update
BEFORE UPDATE ON journal_entries
WHEN OLD.status = 'booked'
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

-- 2. Blockera DELETE på bokförda verifikationer
CREATE TRIGGER trg_immutable_booked_entry_delete
BEFORE DELETE ON journal_entries
WHEN OLD.status = 'booked'
BEGIN
    SELECT RAISE(ABORT, 'Bokförd verifikation kan inte raderas.');
END;

-- 3. Blockera UPDATE på rader i bokförd verifikation
CREATE TRIGGER trg_immutable_booked_line_update
BEFORE UPDATE ON journal_entry_lines
WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
BEGIN
    SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte ändras.');
END;

-- 4. Blockera DELETE på rader i bokförd verifikation
CREATE TRIGGER trg_immutable_booked_line_delete
BEFORE DELETE ON journal_entry_lines
WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
BEGIN
    SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte raderas.');
END;

-- 5. Blockera INSERT på rader i bokförd verifikation
CREATE TRIGGER trg_immutable_booked_line_insert
BEFORE INSERT ON journal_entry_lines
WHEN (SELECT status FROM journal_entries WHERE id = NEW.journal_entry_id) = 'booked'
BEGIN
    SELECT RAISE(ABORT, 'Kan inte lägga till rader på bokförd verifikation.');
END;

-- 6. Blockera DELETE på icke-draft-fakturor
CREATE TRIGGER trg_prevent_invoice_delete
BEFORE DELETE ON invoices
WHEN OLD.status != 'draft'
BEGIN
    SELECT RAISE(ABORT, 'Faktura som inte är utkast kan inte raderas. Makulera istället.');
END;

-- 7. Kontrollera debet = kredit vid bokning + minst 2 rader
CREATE TRIGGER trg_check_balance_on_booking
BEFORE UPDATE ON journal_entries
WHEN NEW.status = 'booked' AND OLD.status = 'draft'
BEGIN
    SELECT CASE
        WHEN (
            COALESCE(
                (SELECT SUM(debit_amount) FROM journal_entry_lines WHERE journal_entry_id = NEW.id), 0
            ) -
            COALESCE(
                (SELECT SUM(credit_amount) FROM journal_entry_lines WHERE journal_entry_id = NEW.id), 0
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

-- 8. Periodvalidering vid bokning
--    Tre kontroller: stängt år, datum utanför år, stängd period
CREATE TRIGGER trg_check_period_on_booking
BEFORE UPDATE ON journal_entries
WHEN NEW.status = 'booked' AND OLD.status = 'draft'
BEGIN
    -- Kontrollera att räkenskapsåret inte är stängt
    SELECT CASE
        WHEN (SELECT is_closed FROM fiscal_years WHERE id = NEW.fiscal_year_id) = 1
        THEN RAISE(ABORT, 'Kan inte bokföra i stängt räkenskapsår.')
    END;
    -- Kontrollera att journal_date ligger inom räkenskapsårets datumintervall
    SELECT CASE
        WHEN NOT EXISTS (
            SELECT 1 FROM fiscal_years
            WHERE id = NEW.fiscal_year_id
              AND NEW.journal_date BETWEEN start_date AND end_date
        )
        THEN RAISE(ABORT, 'Bokföringsdatum ligger utanför räkenskapsårets period.')
    END;
    -- Kontrollera att perioden (om den finns) inte är stängd
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
`

/** Migration 003: Seed data — ~95 BAS-konton (K2/K3) + 7 momskoder */
const migration003 = `
-- BAS-kontoplan för svenska aktiebolag (K2/K3)
-- Kolumner: account_number, name, account_type, k2_allowed, k3_only, is_system_account

-- Klass 1 — Tillgångar (asset)
INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account) VALUES
('1010', 'Balanserade utgifter utveckling', 'asset', 0, 1, 0),
('1019', 'Ack avskrivningar balanserade utgifter', 'asset', 0, 1, 0),
('1110', 'Byggnader', 'asset', 1, 0, 0),
('1119', 'Ack avskrivningar byggnader', 'asset', 1, 0, 1),
('1210', 'Maskiner och inventarier', 'asset', 1, 0, 0),
('1219', 'Ack avskrivningar maskiner', 'asset', 1, 0, 1),
('1220', 'Inventarier och verktyg', 'asset', 1, 0, 0),
('1229', 'Ack avskrivningar inventarier', 'asset', 1, 0, 1),
('1250', 'Datorer', 'asset', 1, 0, 0),
('1259', 'Ack avskrivningar datorer', 'asset', 1, 0, 1),
('1310', 'Andelar i koncernföretag', 'asset', 1, 0, 0),
('1380', 'Andra långfristiga fordringar', 'asset', 1, 0, 0),
('1510', 'Kundfordringar', 'asset', 1, 0, 0),
('1610', 'Fordran på anställda', 'asset', 1, 0, 0),
('1630', 'Skattekonto', 'asset', 1, 0, 0),
('1710', 'Förutbetalda försäkringspremier', 'asset', 1, 0, 0),
('1790', 'Övriga förutbetalda kostnader', 'asset', 1, 0, 0),
('1910', 'Kassa', 'asset', 1, 0, 0),
('1920', 'PlusGiro', 'asset', 1, 0, 0),
('1930', 'Företagskonto', 'asset', 1, 0, 0),
('1940', 'Placeringskonto', 'asset', 1, 0, 0),
('2640', 'Ingående moms', 'asset', 1, 0, 0);

-- Klass 2 — Eget kapital (equity)
INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account) VALUES
('2081', 'Aktiekapital', 'equity', 1, 0, 0),
('2085', 'Överkursfond', 'equity', 1, 0, 0),
('2086', 'Reservfond', 'equity', 1, 0, 0),
('2090', 'Fritt eget kapital', 'equity', 1, 0, 0),
('2091', 'Balanserat resultat', 'equity', 1, 0, 0),
('2098', 'Vinst eller förlust föregående år', 'equity', 1, 0, 1),
('2099', 'Årets resultat', 'equity', 1, 0, 1);

-- Klass 2 — Obeskattade reserver (liability)
INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account) VALUES
('2110', 'Periodiseringsfond tax 2020', 'liability', 1, 0, 0),
('2120', 'Periodiseringsfond tax 2021', 'liability', 1, 0, 0),
('2123', 'Periodiseringsfond tax 2024', 'liability', 1, 0, 0),
('2124', 'Periodiseringsfond tax 2025', 'liability', 1, 0, 0),
('2125', 'Periodiseringsfond tax 2026', 'liability', 1, 0, 0),
('2150', 'Ackumulerade överavskrivningar', 'liability', 1, 0, 0);

-- Klass 2 — Skulder (liability)
INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account) VALUES
('2220', 'Avsättning uppskjuten skatt', 'liability', 0, 1, 1),
('2440', 'Leverantörsskulder', 'liability', 1, 0, 0),
('2510', 'Skatteskuld bolagsskatt', 'liability', 1, 0, 0),
('2610', 'Utgående moms 25%', 'liability', 1, 0, 0),
('2620', 'Utgående moms 12%', 'liability', 1, 0, 0),
('2630', 'Utgående moms 6%', 'liability', 1, 0, 0),
('2650', 'Momsredovisning', 'liability', 1, 0, 0),
('2710', 'Personalskatt', 'liability', 1, 0, 0),
('2730', 'Arbetsgivaravgifter', 'liability', 1, 0, 0),
('2731', 'Avräkning sociala avgifter', 'liability', 1, 0, 0),
('2820', 'Kortfristiga skulder kreditinstitut', 'liability', 1, 0, 0),
('2890', 'Övriga kortfristiga skulder', 'liability', 1, 0, 0),
('2910', 'Upplupna löner', 'liability', 1, 0, 0),
('2920', 'Upplupna semesterlöner', 'liability', 1, 0, 0),
('2940', 'Upplupna sociala avgifter', 'liability', 1, 0, 0),
('2990', 'Övriga upplupna kostnader', 'liability', 1, 0, 0);

-- Klass 3 — Intäkter (revenue)
INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account) VALUES
('3001', 'Försäljning varor 25%', 'revenue', 1, 0, 0),
('3002', 'Försäljning tjänster 25%', 'revenue', 1, 0, 0),
('3003', 'Försäljning varor 12%', 'revenue', 1, 0, 0),
('3004', 'Försäljning tjänster 6%', 'revenue', 1, 0, 0),
('3540', 'Fakturerade kostnader', 'revenue', 1, 0, 0),
('3590', 'Övriga fakturerade kostnader', 'revenue', 1, 0, 0),
('3740', 'Öresutjämning', 'revenue', 1, 0, 0),
('3960', 'Valutakursvinster', 'revenue', 1, 0, 0);

-- Klass 4 — Material och varor (expense)
INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account) VALUES
('4010', 'Inköp varor och material', 'expense', 1, 0, 0),
('4990', 'Övriga kostnader', 'expense', 1, 0, 0);

-- Klass 5 — Övriga externa kostnader (expense)
INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account) VALUES
('5010', 'Lokalhyra', 'expense', 1, 0, 0),
('5020', 'El värme vatten', 'expense', 1, 0, 0),
('5090', 'Övriga lokalkostnader', 'expense', 1, 0, 0),
('5210', 'Telekommunikation', 'expense', 1, 0, 0),
('5400', 'Förbrukningsinventarier', 'expense', 1, 0, 0),
('5410', 'Förbrukningsinventarier och material', 'expense', 1, 0, 0),
('5460', 'Förbrukningsmaterial', 'expense', 1, 0, 0),
('5500', 'Reparation och underhåll', 'expense', 1, 0, 0),
('5610', 'Resekostnader', 'expense', 1, 0, 0),
('5800', 'Traktamente', 'expense', 1, 0, 0),
('5910', 'Annonsering', 'expense', 1, 0, 0);

-- Klass 6 — Övriga externa kostnader (expense)
INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account) VALUES
('6071', 'Representation avdragsgill', 'expense', 1, 0, 0),
('6110', 'Kontorsmateriel', 'expense', 1, 0, 0),
('6210', 'Telekommunikation', 'expense', 1, 0, 0),
('6230', 'Datakommunikation', 'expense', 1, 0, 0),
('6530', 'Redovisningstjänster', 'expense', 1, 0, 0),
('6540', 'IT-tjänster', 'expense', 1, 0, 0),
('6550', 'Konsultarvoden', 'expense', 1, 0, 0),
('6570', 'Bankkostnader', 'expense', 1, 0, 0),
('6590', 'Övriga externa tjänster', 'expense', 1, 0, 0);

-- Klass 7 — Personal (expense)
INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account) VALUES
('7010', 'Löner tjänstemän', 'expense', 1, 0, 0),
('7082', 'Sjuklöner', 'expense', 1, 0, 0),
('7090', 'Förändring semesterlöneskuld', 'expense', 1, 0, 0),
('7210', 'Löner kollektivanställda', 'expense', 1, 0, 0),
('7310', 'Kontanta extraersättningar', 'expense', 1, 0, 0),
('7410', 'Pensionsförsäkringspremier', 'expense', 1, 0, 0),
('7510', 'Arbetsgivaravgifter', 'expense', 1, 0, 0),
('7519', 'Sociala avgifter semester', 'expense', 1, 0, 0),
('7530', 'Särskild löneskatt', 'expense', 1, 0, 0),
('7570', 'Arbetsmarknadsförsäkringar', 'expense', 1, 0, 0),
('7610', 'Utbildning', 'expense', 1, 0, 0),
('7631', 'Personalrepresentation avdragsgill', 'expense', 1, 0, 0),
('7690', 'Övriga personalkostnader', 'expense', 1, 0, 0),
('7832', 'Avskrivningar maskiner inventarier', 'expense', 1, 0, 0),
('7833', 'Avskrivningar datorer', 'expense', 1, 0, 0),
('7834', 'Avskrivningar bilar', 'expense', 1, 0, 0),
('7960', 'Valutakursförluster', 'expense', 1, 0, 0);

-- Klass 8 — Finansiellt och bokslut
INSERT INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account) VALUES
('8310', 'Ränteintäkter', 'revenue', 1, 0, 0),
('8410', 'Räntekostnader', 'expense', 1, 0, 0),
('8810', 'Förändring periodiseringsfond', 'expense', 1, 0, 0),
('8850', 'Förändring överavskrivningar', 'expense', 1, 0, 0),
('8910', 'Bolagsskatt', 'expense', 1, 0, 0),
('8999', 'Årets resultat', 'expense', 1, 0, 1);

-- 7 momskoder (med SKV report_box för momsdeklaration)
INSERT INTO vat_codes (code, description, rate_percent, vat_type, sales_account, vat_account, report_box) VALUES
('MP1', 'Utgående moms 25%', 25.00, 'outgoing', '3001', '2610', '10'),
('MP2', 'Utgående moms 12%', 12.00, 'outgoing', '3003', '2620', '11'),
('MP3', 'Utgående moms 6%', 6.00, 'outgoing', '3004', '2630', '12'),
('MF', 'Momsfri försäljning', 0.00, 'exempt', NULL, NULL, '42'),
('IP1', 'Ingående moms 25%', 25.00, 'incoming', NULL, '2640', '48'),
('IP2', 'Ingående moms 12%', 12.00, 'incoming', NULL, '2640', '48'),
('IP3', 'Ingående moms 6%', 6.00, 'incoming', NULL, '2640', '48');
`

/** Migration 004: org_number format validation (defense in depth) */
const migration004 = `
-- Defense in depth: fånga felaktigt org_number-format även om Zod kringgås.
-- Luhn-kontroll görs INTE här (för komplex för SQL-trigger), bara formatvalidering.
CREATE TRIGGER IF NOT EXISTS trg_validate_org_number
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

-- Lägg till UNIQUE constraint via ny tabell-skapelse (SQLite kan inte ALTER TABLE ADD CONSTRAINT)
CREATE UNIQUE INDEX IF NOT EXISTS idx_companies_org_number ON companies (org_number);
`

/** Migration 005: Stamdata tables + schema extensions (smart — checks existing columns) */
const migration005 = `
-- Nya tabeller
CREATE TABLE IF NOT EXISTS products (
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

CREATE TABLE IF NOT EXISTS price_lists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK(is_default IN (0,1)),
  counterparty_id INTEGER REFERENCES counterparties(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS price_list_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  price_list_id INTEGER NOT NULL REFERENCES price_lists(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  price INTEGER NOT NULL,
  UNIQUE(price_list_id, product_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
CREATE INDEX IF NOT EXISTS idx_counterparties_active ON counterparties(is_active);
CREATE INDEX IF NOT EXISTS idx_counterparties_type ON counterparties(type);
CREATE INDEX IF NOT EXISTS idx_price_list_items_product ON price_list_items(product_id);

-- Partiellt UNIQUE index på org_number
CREATE UNIQUE INDEX IF NOT EXISTS idx_counterparties_org_unique
  ON counterparties(org_number) WHERE org_number IS NOT NULL;

-- Backup-konton
INSERT OR IGNORE INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account)
VALUES ('3040', 'Varuförsäljning', 'revenue', 1, 0, 0);
INSERT OR IGNORE INTO accounts (account_number, name, account_type, k2_allowed, k3_only, is_system_account)
VALUES ('3050', 'Fakturerade kostnader', 'revenue', 1, 0, 0);
`

/**
 * Migration 005 also needs ALTER TABLE for columns that don't exist yet.
 * This must be done programmatically since we need to check PRAGMA table_info.
 */
export interface MigrationEntry {
  sql: string
  programmatic?: (db: import('better-sqlite3').Database) => void
}

function getTableColumns(
  db: import('better-sqlite3').Database,
  table: string,
): Set<string> {
  if (!VALID_SQL_IDENTIFIER.test(table)) {
    throw new Error(`Invalid SQL identifier: table=${table}`)
  }
  const columns = db.pragma('table_info(' + table + ')') as { name: string }[]
  return new Set(columns.map((c) => c.name))
}

const VALID_SQL_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function addColumnIfMissing(
  db: import('better-sqlite3').Database,
  table: string,
  column: string,
  definition: string,
  existingColumns: Set<string>,
): void {
  if (!VALID_SQL_IDENTIFIER.test(table) || !VALID_SQL_IDENTIFIER.test(column)) {
    throw new Error(`Invalid SQL identifier: table=${table}, column=${column}`)
  }
  if (!existingColumns.has(column)) {
    db.exec('ALTER TABLE ' + table + ' ADD COLUMN ' + column + ' ' + definition)
  }
}

function migration005Programmatic(db: import('better-sqlite3').Database): void {
  // Counterparties extensions
  const cpCols = getTableColumns(db, 'counterparties')
  addColumnIfMissing(db, 'counterparties', 'vat_number', 'TEXT', cpCols)
  addColumnIfMissing(db, 'counterparties', 'contact_person', 'TEXT', cpCols)
  addColumnIfMissing(
    db,
    'counterparties',
    'updated_at',
    "TEXT NOT NULL DEFAULT (datetime('now'))",
    cpCols,
  )

  // Companies extensions
  const coCols = getTableColumns(db, 'companies')
  addColumnIfMissing(db, 'companies', 'vat_number', 'TEXT', coCols)
  addColumnIfMissing(db, 'companies', 'email', 'TEXT', coCols)
  addColumnIfMissing(db, 'companies', 'phone', 'TEXT', coCols)
  addColumnIfMissing(db, 'companies', 'bankgiro', 'TEXT', coCols)
  addColumnIfMissing(db, 'companies', 'plusgiro', 'TEXT', coCols)
  addColumnIfMissing(db, 'companies', 'website', 'TEXT', coCols)
}

/** Migration 006: Invoice extensions — fiscal_year_id, payment_terms, invoice_lines table */
const migration006 = `
-- Invoice lines table (didn't exist before)
CREATE TABLE IF NOT EXISTS invoice_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  product_id INTEGER REFERENCES products(id),
  description TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 1,
  unit_price INTEGER NOT NULL DEFAULT 0,
  vat_code_id INTEGER NOT NULL REFERENCES vat_codes(id),
  line_total INTEGER NOT NULL DEFAULT 0,
  vat_amount INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (quantity > 0),
  CHECK (unit_price >= 0),
  CHECK (line_total >= 0)
);
CREATE INDEX IF NOT EXISTS idx_invoice_lines_invoice ON invoice_lines(invoice_id);
`

function migration006Programmatic(db: import('better-sqlite3').Database): void {
  const invCols = getTableColumns(db, 'invoices')
  addColumnIfMissing(
    db,
    'invoices',
    'fiscal_year_id',
    'INTEGER REFERENCES fiscal_years(id)',
    invCols,
  )
  addColumnIfMissing(
    db,
    'invoices',
    'payment_terms',
    'INTEGER NOT NULL DEFAULT 30',
    invCols,
  )
}

/** Migration 007: invoice_lines.account_number + UNIQUE constraints for finalize */
const migration007 = `
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_year_vernum
  ON journal_entries(fiscal_year_id, verification_number)
  WHERE verification_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_year_invnum
  ON invoices(fiscal_year_id, invoice_number)
  WHERE invoice_number != '';
`

function migration007Programmatic(db: import('better-sqlite3').Database): void {
  const ilCols = getTableColumns(db, 'invoice_lines')
  addColumnIfMissing(
    db,
    'invoice_lines',
    'account_number',
    'TEXT REFERENCES accounts(account_number)',
    ilCols,
  )
}

/** Migration 008: invoice_payments extensions for payment tracking */
const migration008 = `
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON invoice_payments(invoice_id, amount);
`

function migration008Programmatic(db: import('better-sqlite3').Database): void {
  const cols = getTableColumns(db, 'invoice_payments')
  addColumnIfMissing(db, 'invoice_payments', 'payment_method', 'TEXT', cols)
  addColumnIfMissing(
    db,
    'invoice_payments',
    'account_number',
    "TEXT DEFAULT '1930' REFERENCES accounts(account_number)",
    cols,
  )
}

/** Migration 009: expenses + expense_lines + B-series support */
const migration009 = `
-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
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
);

CREATE INDEX IF NOT EXISTS idx_expenses_fiscal_year_status
  ON expenses(fiscal_year_id, status, expense_date);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_supplier_duplicate
  ON expenses(counterparty_id, supplier_invoice_number)
  WHERE supplier_invoice_number IS NOT NULL;

-- Expense lines
CREATE TABLE IF NOT EXISTS expense_lines (
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

-- Update UNIQUE index to include verification_series
DROP INDEX IF EXISTS idx_journal_entries_year_vernum;
CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_verify_series_unique
  ON journal_entries(fiscal_year_id, verification_series, verification_number)
  WHERE verification_number IS NOT NULL;

-- Seed incoming 0% VAT code if missing
INSERT OR IGNORE INTO vat_codes (code, description, rate_percent, vat_type, vat_account, report_box)
  VALUES ('MF0', 'Ingående momsfri', 0, 'incoming', NULL, NULL);
`

/** Migration 010: expense_payments + auto_expense_payment source_type */
const migration010 = `
-- Expense payments table (mirrors invoice_payments)
CREATE TABLE IF NOT EXISTS expense_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_id INTEGER NOT NULL REFERENCES expenses(id),
  journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
  payment_date TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK(amount > 0),
  payment_method TEXT,
  account_number TEXT DEFAULT '1930' REFERENCES accounts(account_number),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_expense_payments_expense
  ON expense_payments(expense_id, amount);
`

function migration010Programmatic(
  _db: import('better-sqlite3').Database,
): void {
  // Note: We reuse source_type='auto_payment' for expense payments
  // (same as invoice payments). The B-series verification_series and
  // description distinguish them. Adding a new CHECK value to SQLite
  // requires table rebuild which conflicts with triggers — not worth
  // the complexity for a defense-in-depth constraint.
}

// ═══ Migration 011: Manual entries (C-series) ═══
const migration011 = `
CREATE TABLE IF NOT EXISTS manual_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  entry_date TEXT,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','finalized')),
  journal_entry_id INTEGER REFERENCES journal_entries(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS manual_entry_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  manual_entry_id INTEGER NOT NULL REFERENCES manual_entries(id) ON DELETE CASCADE,
  line_number INTEGER NOT NULL,
  account_number TEXT NOT NULL,
  debit_amount INTEGER NOT NULL DEFAULT 0,
  credit_amount INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  UNIQUE(manual_entry_id, line_number)
);
`

// ═══ Migration 012: Opening balance support (table recreation for CHECK constraint + trigger exceptions) ═══
const migration012 = `-- Placeholder SQL (table recreation done programmatically)`

function migration012Programmatic(db: import('better-sqlite3').Database): void {
  // 1. Recreate journal_entries with updated CHECK constraint (add 'opening_balance')
  db.exec(`
    CREATE TABLE journal_entries_new (
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
      CHECK (source_type IN ('manual', 'auto_invoice', 'auto_payment', 'auto_expense', 'auto_salary', 'auto_depreciation', 'auto_tax', 'import', 'opening_balance')),
      UNIQUE (verification_series, verification_number, fiscal_year_id)
    );
  `)

  db.exec(`INSERT INTO journal_entries_new SELECT * FROM journal_entries;`)

  // Drop old triggers that reference journal_entries before dropping the table
  db.exec(`DROP TRIGGER IF EXISTS trg_immutable_booked_entry_update;`)
  db.exec(`DROP TRIGGER IF EXISTS trg_immutable_booked_entry_delete;`)
  db.exec(`DROP TRIGGER IF EXISTS trg_immutable_booked_line_update;`)
  db.exec(`DROP TRIGGER IF EXISTS trg_immutable_booked_line_delete;`)
  db.exec(`DROP TRIGGER IF EXISTS trg_immutable_booked_line_insert;`)
  db.exec(`DROP TRIGGER IF EXISTS trg_check_balance_on_booking;`)
  db.exec(`DROP TRIGGER IF EXISTS trg_check_period_on_booking;`)

  // Drop old indexes
  db.exec(`DROP INDEX IF EXISTS idx_je_date;`)
  db.exec(`DROP INDEX IF EXISTS idx_je_fiscal_year;`)
  db.exec(`DROP INDEX IF EXISTS idx_je_status;`)
  db.exec(`DROP INDEX IF EXISTS idx_journal_entries_verify_series_unique;`)

  db.exec(`DROP TABLE journal_entries;`)
  db.exec(`ALTER TABLE journal_entries_new RENAME TO journal_entries;`)

  // Recreate indexes
  db.exec(`CREATE INDEX idx_je_date ON journal_entries (journal_date);`)
  db.exec(
    `CREATE INDEX idx_je_fiscal_year ON journal_entries (fiscal_year_id);`,
  )
  db.exec(`CREATE INDEX idx_je_status ON journal_entries (status);`)
  db.exec(`
    CREATE UNIQUE INDEX idx_journal_entries_verify_series_unique
    ON journal_entries(fiscal_year_id, verification_series, verification_number)
    WHERE verification_number IS NOT NULL;
  `)

  // 2. Recreate triggers WITH opening_balance exceptions

  // UPDATE trigger — exception for opening_balance
  db.exec(`
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
  `)

  // DELETE trigger — exception for opening_balance
  db.exec(`
    CREATE TRIGGER trg_immutable_booked_entry_delete
    BEFORE DELETE ON journal_entries
    WHEN OLD.status = 'booked' AND OLD.source_type != 'opening_balance'
    BEGIN
        SELECT RAISE(ABORT, 'Bokförd verifikation kan inte raderas.');
    END;
  `)

  // Line UPDATE trigger — exception via subquery
  db.exec(`
    CREATE TRIGGER trg_immutable_booked_line_update
    BEFORE UPDATE ON journal_entry_lines
    WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
      AND (SELECT source_type FROM journal_entries WHERE id = OLD.journal_entry_id) != 'opening_balance'
    BEGIN
        SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte ändras.');
    END;
  `)

  // Line DELETE trigger — exception via subquery
  db.exec(`
    CREATE TRIGGER trg_immutable_booked_line_delete
    BEFORE DELETE ON journal_entry_lines
    WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
      AND (SELECT source_type FROM journal_entries WHERE id = OLD.journal_entry_id) != 'opening_balance'
    BEGIN
        SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte raderas.');
    END;
  `)

  // Line INSERT trigger — exception via subquery
  db.exec(`
    CREATE TRIGGER trg_immutable_booked_line_insert
    BEFORE INSERT ON journal_entry_lines
    WHEN (SELECT status FROM journal_entries WHERE id = NEW.journal_entry_id) = 'booked'
      AND (SELECT source_type FROM journal_entries WHERE id = NEW.journal_entry_id) != 'opening_balance'
    BEGIN
        SELECT RAISE(ABORT, 'Kan inte lägga till rader på bokförd verifikation.');
    END;
  `)

  // Balance + period check triggers — unchanged (no opening_balance exception needed)
  db.exec(`
    CREATE TRIGGER trg_check_balance_on_booking
    BEFORE UPDATE ON journal_entries
    WHEN NEW.status = 'booked' AND OLD.status = 'draft'
    BEGIN
        SELECT CASE
            WHEN (
                COALESCE(
                    (SELECT SUM(debit_amount) FROM journal_entry_lines WHERE journal_entry_id = NEW.id), 0
                ) -
                COALESCE(
                    (SELECT SUM(credit_amount) FROM journal_entry_lines WHERE journal_entry_id = NEW.id), 0
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
  `)

  db.exec(`
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
  `)
}

/** Migration 013: Mark additional system-critical accounts */
const migration013 = `
-- Markera systemkritiska konton som inte redan har is_system_account = 1
UPDATE accounts SET is_system_account = 1 WHERE account_number IN (
  '1630',  -- Skattekonto
  '1930',  -- Företagskonto/bank
  '2010',  -- Eget kapital
  '2091',  -- Balanserad vinst/förlust
  '2098',  -- Vinst/förlust föregående år
  '2099',  -- Årets resultat
  '2440',  -- Leverantörsskulder
  '2610',  -- Utgående moms 25%
  '2620',  -- Utgående moms 12%
  '2630',  -- Utgående moms 6%
  '2640',  -- Ingående moms
  '2650',  -- Moms redovisningskonto
  '3740',  -- Öresutjämning
  '8999'   -- Årets resultat (resultaträkning)
);
`

/** Migration 014: Defense in depth — förhindra överlappande fiscal years */
const migration014 = `
CREATE TRIGGER IF NOT EXISTS trg_fiscal_year_no_overlap_insert
BEFORE INSERT ON fiscal_years
WHEN EXISTS (
  SELECT 1 FROM fiscal_years
  WHERE company_id = NEW.company_id
    AND NOT (NEW.end_date < start_date OR NEW.start_date > end_date)
)
BEGIN
  SELECT RAISE(ABORT, 'Räkenskapsåret överlappar med befintligt räkenskapsår.');
END;

CREATE TRIGGER IF NOT EXISTS trg_fiscal_year_no_overlap_update
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
`

/** Migration 015: Add paid_amount to expenses (speglar invoices.paid_amount, M66).
 *  Backfill från expense_payments. Ingen CHECK-constraint (ALTER TABLE-begränsning). */
function migration015Programmatic(db: import('better-sqlite3').Database): void {
  const cols = getTableColumns(db, 'expenses')
  addColumnIfMissing(
    db,
    'expenses',
    'paid_amount',
    'INTEGER NOT NULL DEFAULT 0',
    cols,
  )

  // Backfill: beräkna paid_amount från befintliga expense_payments.
  // Idempotent — säkert att köra om (SUM ersätter alltid).
  db.exec(`
    UPDATE expenses
    SET paid_amount = COALESCE((
      SELECT SUM(amount) FROM expense_payments
      WHERE expense_id = expenses.id
    ), 0)
  `)
}

export const migrations: MigrationEntry[] = [
  { sql: migration001 },
  { sql: migration002 },
  { sql: migration003 },
  { sql: migration004 },
  { sql: migration005, programmatic: migration005Programmatic },
  { sql: migration006, programmatic: migration006Programmatic },
  { sql: migration007, programmatic: migration007Programmatic },
  { sql: migration008, programmatic: migration008Programmatic },
  { sql: migration009 },
  { sql: migration010, programmatic: migration010Programmatic },
  { sql: migration011 },
  { sql: migration012, programmatic: migration012Programmatic },
  { sql: migration013 },
  { sql: migration014 },
  { sql: '-- Migration 015: expense paid_amount (se programmatic)', programmatic: migration015Programmatic },
  { sql: 'ALTER TABLE invoice_lines RENAME COLUMN unit_price TO unit_price_ore;' },
  // Fas 6: Slutför öre-rename för invoice-domänen.
  // Symmetri DB+TS med expense-domänen. Filformat behåller legacy-aliaser (M92).
  { sql: `ALTER TABLE invoice_lines RENAME COLUMN line_total TO line_total_ore;
    ALTER TABLE invoice_lines RENAME COLUMN vat_amount TO vat_amount_ore;
    ALTER TABLE invoices RENAME COLUMN total_amount TO total_amount_ore;
    ALTER TABLE invoices RENAME COLUMN vat_amount TO vat_amount_ore;
    ALTER TABLE invoices RENAME COLUMN net_amount TO net_amount_ore;` },
]
