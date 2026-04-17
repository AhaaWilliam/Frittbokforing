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
  // Fas 7: Rename journal_entry_lines belopp-kolumner (M48).
  // debit_amount → debit_ore, credit_amount → credit_ore, vat_amount → vat_ore.
  // Trigger trg_check_balance_on_booking refererar dessa kolumner och måste återskapas.
  { sql: `ALTER TABLE journal_entry_lines RENAME COLUMN debit_amount TO debit_ore;
    ALTER TABLE journal_entry_lines RENAME COLUMN credit_amount TO credit_ore;
    ALTER TABLE journal_entry_lines RENAME COLUMN vat_amount TO vat_ore;

    DROP TRIGGER IF EXISTS trg_check_balance_on_booking;

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
    END;`,
    programmatic: migration018Verify },
  // Fas 8: Rename manual_entry_lines belopp-kolumner (M48, final).
  // debit_amount → debit_ore, credit_amount → credit_ore.
  // Inga triggers att återskapa — tabellen har inga.
  { sql: `ALTER TABLE manual_entry_lines RENAME COLUMN debit_amount TO debit_ore;
    ALTER TABLE manual_entry_lines RENAME COLUMN credit_amount TO credit_ore;`,
    programmatic: migration019Verify },
  // Sprint 12: bank_fee_ore + bank_fee_account on both payment tables
  { sql: '-- Migration 020: bank fee columns (se programmatic)', programmatic: migration020Programmatic },
  // Sprint 13: payment_batches + auto_bank_fee source_type
  { sql: '-- Migration 021: payment_batches + auto_bank_fee (se programmatic)', programmatic: migration021Programmatic },
  // Sprint 15 S42: öre-suffix på 5 belopp-kolumner (M119/F1)
  { sql: '-- Migration 022: öre-suffix rename (se programmatic)', programmatic: migration022Programmatic },
  // Sprint 15 S43: FK på manual_entry_lines + payment_batches (F2, F6)
  { sql: '-- Migration 023: FK account_number (se programmatic)', programmatic: migration023Programmatic },
  // Sprint 15 S44: invoice_lines.account_number conditional NOT NULL vid finalize (F5)
  // Trigger validerar att freeform-rader (product_id IS NULL) har account_number.
  // Produktbaserade rader hämtar konto via products.account_id → accounts, inte invoice_lines.account_number.
  { sql: `CREATE TRIGGER trg_invoice_lines_account_number_on_finalize
    BEFORE UPDATE OF status ON invoices
    WHEN OLD.status = 'draft' AND NEW.status = 'unpaid'
    BEGIN
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM invoice_lines
          WHERE invoice_id = NEW.id
            AND product_id IS NULL
            AND account_number IS NULL
        )
        THEN RAISE(ABORT, 'Alla fakturarader måste ha kontonummer innan fakturan slutförs.')
      END;
    END;`, programmatic: migration024Verify },
  // Sprint 16 S48: öre-suffix rename on products + price_list_items (M119/F4)
  { sql: `ALTER TABLE products RENAME COLUMN default_price TO default_price_ore;
    ALTER TABLE price_list_items RENAME COLUMN price TO price_ore;`,
    programmatic: migration025Verify },
  // Sprint 16 S49: F10 expense_lines paritet — sort_order + created_at (se programmatic)
  { sql: '-- Migration 026: expense_lines sort_order + created_at (se programmatic)', programmatic: migration026Programmatic },
  // Sprint 16 S58: F4 schema-namnkonvention — journal_entries.created_by → created_by_id
  // FK till users(id) utan _id-suffix. Inkonsistent med corrected_by_id på samma tabell.
  // Inga triggers refererar kolumnen — enkel RENAME COLUMN räcker.
  { sql: 'ALTER TABLE journal_entries RENAME COLUMN created_by TO created_by_id;',
    programmatic: migration027Verify },
  // Sprint 27: F7 — drop unused verification_sequences + rename payment_terms_days
  { sql: `DROP TABLE IF EXISTS verification_sequences;
ALTER TABLE counterparties RENAME COLUMN payment_terms_days TO payment_terms;`,
    programmatic: migration028Verify },
  // Sprint 28: Kreditfakturor — credits_invoice_id FK
  { sql: `ALTER TABLE invoices ADD COLUMN credits_invoice_id INTEGER REFERENCES invoices(id);
CREATE INDEX idx_inv_credits ON invoices(credits_invoice_id);`,
    programmatic: migration029Verify },
  // Sprint 28b: Leverantörskreditnotor — expense_type + credits_expense_id
  { sql: `ALTER TABLE expenses ADD COLUMN expense_type TEXT NOT NULL DEFAULT 'normal'
  CHECK(expense_type IN ('normal', 'credit_note'));
ALTER TABLE expenses ADD COLUMN credits_expense_id INTEGER REFERENCES expenses(id);
CREATE INDEX idx_exp_credits ON expenses(credits_expense_id);`,
    programmatic: migration030Verify },
  // Sprint 30: B4 — Immutability-hardening triggers (Q8, Q9, Q10)
  { sql: `
-- Q9: source_type kan inte ändras på bokfört verifikat
CREATE TRIGGER trg_immutable_source_type
BEFORE UPDATE ON journal_entries
WHEN OLD.status = 'booked' AND NEW.source_type != OLD.source_type
BEGIN
    SELECT RAISE(ABORT, 'source_type kan inte ändras på bokförd verifikation.');
END;

-- Q10: source_reference kan inte ändras på bokfört verifikat
CREATE TRIGGER trg_immutable_source_reference
BEFORE UPDATE ON journal_entries
WHEN OLD.status = 'booked' AND
     COALESCE(NEW.source_reference, '') != COALESCE(OLD.source_reference, '')
BEGIN
    SELECT RAISE(ABORT, 'source_reference kan inte ändras på bokförd verifikation.');
END;

-- Q10: corrects_entry_id kan inte ändras efter bokning
CREATE TRIGGER trg_immutable_corrects_entry_id
BEFORE UPDATE ON journal_entries
WHEN OLD.status = 'booked' AND
     COALESCE(NEW.corrects_entry_id, 0) != COALESCE(OLD.corrects_entry_id, 0)
BEGIN
    SELECT RAISE(ABORT, 'corrects_entry_id kan inte ändras på bokförd verifikation.');
END;

-- Q8: förbjud status → 'corrected' om beroende betalningar finns
-- Checks both paths: (1) payment verifikat directly, (2) invoice/expense verifikat
-- via their linked payments table
CREATE TRIGGER trg_no_correct_with_payments
BEFORE UPDATE ON journal_entries
WHEN OLD.status = 'booked' AND NEW.status = 'corrected'
BEGIN
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM invoice_payments WHERE journal_entry_id = OLD.id)
          OR EXISTS (SELECT 1 FROM expense_payments WHERE journal_entry_id = OLD.id)
          OR EXISTS (SELECT 1 FROM invoices i JOIN invoice_payments ip ON ip.invoice_id = i.id WHERE i.journal_entry_id = OLD.id)
          OR EXISTS (SELECT 1 FROM expenses e JOIN expense_payments ep ON ep.expense_id = e.id WHERE e.journal_entry_id = OLD.id)
        THEN RAISE(ABORT, 'Kan inte korrigera verifikat med beroende betalningar.')
    END;
END;`,
    programmatic: migration031Verify },
  // Sprint 33: F46b — quantity-CHECK defense-in-depth (table-recreate, M121)
  { sql: '-- Migration 032: quantity-CHECK (se programmatic)', programmatic: migration032Programmatic },
  // Sprint 33: B6 — FTS5 virtual table for global search
  { sql: `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    entity_type,
    entity_id,
    search_text,
    tokenize='unicode61 remove_diacritics 2'
  );` },
  // Sprint 43: Feature 2 — Budget targets
  { sql: `CREATE TABLE budget_targets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
    line_id TEXT NOT NULL,
    period_number INTEGER NOT NULL CHECK (period_number >= 1 AND period_number <= 12),
    amount_ore INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(fiscal_year_id, line_id, period_number)
  );
  CREATE INDEX idx_budget_fy ON budget_targets (fiscal_year_id);` },
  // Sprint 45: Feature 3 — Periodiseringar (accruals)
  { sql: `CREATE TABLE accrual_schedules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
    description TEXT NOT NULL,
    accrual_type TEXT NOT NULL CHECK (accrual_type IN (
      'prepaid_expense', 'accrued_expense', 'prepaid_income', 'accrued_income'
    )),
    balance_account TEXT NOT NULL REFERENCES accounts(account_number),
    result_account TEXT NOT NULL REFERENCES accounts(account_number),
    total_amount_ore INTEGER NOT NULL CHECK (total_amount_ore > 0),
    period_count INTEGER NOT NULL CHECK (period_count >= 2 AND period_count <= 12),
    start_period INTEGER NOT NULL CHECK (start_period >= 1 AND start_period <= 12),
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE accrual_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    accrual_schedule_id INTEGER NOT NULL REFERENCES accrual_schedules(id),
    journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
    period_number INTEGER NOT NULL,
    amount_ore INTEGER NOT NULL CHECK (amount_ore > 0),
    entry_type TEXT NOT NULL CHECK (entry_type IN ('accrual', 'reversal')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX idx_accrual_entries_schedule ON accrual_entries (accrual_schedule_id);` },
  // Sprint 46: Feature 4 — Counterparty payment fields
  { sql: `ALTER TABLE counterparties ADD COLUMN bankgiro TEXT DEFAULT NULL;
  ALTER TABLE counterparties ADD COLUMN plusgiro TEXT DEFAULT NULL;
  ALTER TABLE counterparties ADD COLUMN bank_account TEXT DEFAULT NULL;
  ALTER TABLE counterparties ADD COLUMN bank_clearing TEXT DEFAULT NULL;` },
  // Sprint 46: Feature 4 — Payment batch export tracking
  { sql: `ALTER TABLE payment_batches ADD COLUMN exported_at TEXT DEFAULT NULL;
  ALTER TABLE payment_batches ADD COLUMN export_format TEXT DEFAULT NULL;
  ALTER TABLE payment_batches ADD COLUMN export_filename TEXT DEFAULT NULL;` },
  // Sprint 53: F62 — fixed_assets + depreciation_schedules + verification_series CHECK
  // M121 (trigger reattach), M122 (FK-off table-recreate of journal_entries),
  // M141 (cross-table trigger inventory), M151 (E-series decision).
  { sql: '-- Migration 038: F62 avskrivningar (se programmatic)', programmatic: migration038Programmatic },
  // Sprint 55: F66-a — Bankavstämning MVP (camt.053)
  // 3 nya tabeller: bank_statements, bank_transactions, bank_reconciliation_matches.
  // Split polymorphic FK (invoice_payment_id / expense_payment_id + CHECK).
  // M152: signed amount i bank-extern rådata (bank_transactions.amount_ore).
  { sql: `
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

    CREATE TABLE bank_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_statement_id INTEGER NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,
      booking_date TEXT NOT NULL,
      value_date TEXT NOT NULL,
      amount_ore INTEGER NOT NULL,
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
      CHECK (
        (matched_entity_type = 'invoice' AND invoice_payment_id IS NOT NULL AND expense_payment_id IS NULL)
        OR
        (matched_entity_type = 'expense' AND expense_payment_id IS NOT NULL AND invoice_payment_id IS NULL)
      )
    );

    CREATE INDEX idx_bank_tx_statement ON bank_transactions(bank_statement_id);
    CREATE INDEX idx_bank_tx_status ON bank_transactions(reconciliation_status);
    CREATE INDEX idx_bank_tx_value_date ON bank_transactions(value_date);
    CREATE INDEX idx_bank_tx_booking_date ON bank_transactions(booking_date);
    CREATE INDEX idx_bank_match_entity ON bank_reconciliation_matches(matched_entity_type, matched_entity_id);
  `, programmatic: migration039Verify },
  // Sprint 56: F66-b — match_method-enum-utökning för auto-matchning.
  // Utöka CHECK från ('manual') till ('manual','auto_amount_exact','auto_amount_date',
  // 'auto_amount_ref','auto_iban'). Pre-flight whitelist (K2), explicit kolumnlista (K1),
  // M141 cross-table-trigger-inventering (K3). Inga inkommande FK → ingen FK-OFF behövs.
  { sql: '-- Migration 040: F66-b match_method-enum (se programmatic)', programmatic: migration040Programmatic },
  // Sprint A / S58: F66-d — bank-fee-reconciliation + BkTxCd-fält.
  // (1) bank_reconciliation_matches: utöka match_method-enum med auto_fee/auto_interest_*,
  //     lägg till fee_journal_entry_id, utöka matched_entity_type med 'bank_fee',
  //     uppdatera exactly-one-of CHECK. (2) bank_transactions: tre nya BkTxCd-kolumner.
  // M122 table-recreate på bank_reconciliation_matches (inga inkommande FK → ingen FK-OFF).
  // Pre-flight: Q1 match_method-whitelist, Q2 exactly-one-of på befintlig data, Q3 M141
  // cross-table-trigger-inventering (informativ).
  { sql: '-- Migration 041: S58 F66-d bank-fee-reconciliation (se programmatic)', programmatic: migration041Programmatic },
]

function migration039Verify(db: import('better-sqlite3').Database): void {
  const expectedTables = ['bank_statements', 'bank_transactions', 'bank_reconciliation_matches']
  for (const t of expectedTables) {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
      .get(t)
    if (!exists) throw new Error(`Migration 039 failed: tabell ${t} saknas`)
  }
  const expectedIndexes = [
    'idx_bank_tx_statement',
    'idx_bank_tx_status',
    'idx_bank_tx_value_date',
    'idx_bank_tx_booking_date',
    'idx_bank_match_entity',
  ]
  for (const idx of expectedIndexes) {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
      .get(idx)
    if (!exists) throw new Error(`Migration 039 failed: index ${idx} saknas`)
  }
}

/**
 * Migration 040: Sprint 56 F66-b — match_method-enum-utökning.
 *
 * Pre-flight (K2): SELECT DISTINCT match_method måste vara delmängd av ['manual'].
 * K1: explicit kolumnlista i INSERT (ej SELECT *).
 * K3: M141 cross-table trigger-inventering — verifiera 0 träffar.
 *
 * bank_reconciliation_matches har inga inkommande FK → table-recreate kan
 * köras inuti transaktionen (PRAGMA foreign_keys OFF behövs inte).
 */
function migration040Programmatic(db: import('better-sqlite3').Database): void {
  // Idempotency
  const tableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bank_reconciliation_matches'")
    .get() as { sql: string } | undefined
  if (tableInfo?.sql?.includes("'auto_iban'")) return

  // K2: pre-flight whitelist
  const distinct = db
    .prepare('SELECT DISTINCT match_method FROM bank_reconciliation_matches')
    .all() as { match_method: string }[]
  const allowed = ['manual']
  for (const row of distinct) {
    if (!allowed.includes(row.match_method)) {
      throw new Error(
        `Migration 040 pre-flight: bank_reconciliation_matches har match_method '${row.match_method}' utanför whitelist ${JSON.stringify(allowed)}. Undersök innan migrationen kan köras.`,
      )
    }
  }

  // K3: M141 cross-table trigger-inventering
  const crossTriggers = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND sql LIKE '%bank_reconciliation_matches%' AND tbl_name != 'bank_reconciliation_matches'",
    )
    .all() as { name: string }[]
  if (crossTriggers.length > 0) {
    throw new Error(
      `Migration 040 M141 pre-flight: oväntad cross-table trigger refererar bank_reconciliation_matches: ${crossTriggers.map((t) => t.name).join(', ')}`,
    )
  }

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

  // Verify
  const sql = (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bank_reconciliation_matches'")
      .get() as { sql: string }
  ).sql
  if (!sql.includes("'auto_iban'")) {
    throw new Error('Migration 040 failed: auto_iban saknas i CHECK')
  }
  const idx = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_bank_match_entity'")
    .get()
  if (!idx) throw new Error('Migration 040 failed: idx_bank_match_entity saknas')
}

/**
 * Migration 041: Sprint A/S58 F66-d — bank-fee-reconciliation + BkTxCd-fält.
 *
 * Del 1: bank_reconciliation_matches table-recreate (M122-mönster men utan
 * FK-OFF eftersom tabellen saknar inkommande FK).
 *   - Utöka match_method-enum med 'auto_fee', 'auto_interest_income', 'auto_interest_expense'
 *   - Lägg till fee_journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE RESTRICT
 *   - Utöka matched_entity_type-enum med 'bank_fee' (matched_entity_id blir nullable)
 *   - Uppdatera exactly-one-of CHECK
 *
 * Del 2: bank_transactions ALTER TABLE ADD COLUMN x 3 (nullable).
 *   - bank_tx_domain, bank_tx_family, bank_tx_subfamily (ISO 20022 BkTxCd)
 *
 * Pre-flight:
 *   Q1: befintlig match_method måste vara delmängd av 040-whitelist
 *   Q2: befintlig data måste uppfylla exactly-one-of (skyddar mot att nya CHECK failar vid INSERT)
 *   Q3: M141 cross-table trigger-inventering (informativ)
 */
function migration041Programmatic(db: import('better-sqlite3').Database): void {
  // Idempotency: om fee_journal_entry_id finns → redan kört
  const brmCols = getTableColumns(db, 'bank_reconciliation_matches')
  if (brmCols.has('fee_journal_entry_id')) return

  // Q1: match_method-whitelist (befintlig S56-whitelist)
  const distinctMethods = db
    .prepare('SELECT DISTINCT match_method FROM bank_reconciliation_matches')
    .all() as { match_method: string }[]
  const allowedMethods = [
    'manual',
    'auto_amount_exact',
    'auto_amount_date',
    'auto_amount_ref',
    'auto_iban',
  ]
  for (const row of distinctMethods) {
    if (!allowedMethods.includes(row.match_method)) {
      throw new Error(
        `Migration 041 pre-flight Q1: bank_reconciliation_matches har match_method '${row.match_method}' utanför whitelist ${JSON.stringify(allowedMethods)}.`,
      )
    }
  }

  // Q2: exactly-one-of på befintlig data
  const q2 = db
    .prepare(
      `SELECT COUNT(*) AS n FROM bank_reconciliation_matches
       WHERE NOT (
         (matched_entity_type = 'invoice' AND invoice_payment_id IS NOT NULL AND expense_payment_id IS NULL AND matched_entity_id IS NOT NULL)
         OR
         (matched_entity_type = 'expense' AND expense_payment_id IS NOT NULL AND invoice_payment_id IS NULL AND matched_entity_id IS NOT NULL)
       )`,
    )
    .get() as { n: number }
  if (q2.n > 0) {
    throw new Error(
      `Migration 041 pre-flight Q2: ${q2.n} rad(er) i bank_reconciliation_matches uppfyller inte exactly-one-of. Undersök innan migrationen kan köras.`,
    )
  }

  // Q3: M141 cross-table trigger-inventering (informativ — dokumenterar läget)
  const crossTriggers = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND sql LIKE '%bank_reconciliation_matches%' AND tbl_name != 'bank_reconciliation_matches'",
    )
    .all() as { name: string }[]
  if (crossTriggers.length > 0) {
    throw new Error(
      `Migration 041 M141 pre-flight: oväntad cross-table trigger refererar bank_reconciliation_matches: ${crossTriggers.map((t) => t.name).join(', ')}`,
    )
  }

  // Del 1: bank_reconciliation_matches table-recreate
  db.exec(`
    CREATE TABLE bank_reconciliation_matches_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank_transaction_id INTEGER NOT NULL UNIQUE REFERENCES bank_transactions(id) ON DELETE CASCADE,
      matched_entity_type TEXT NOT NULL,
      matched_entity_id INTEGER,
      invoice_payment_id INTEGER REFERENCES invoice_payments(id) ON DELETE RESTRICT,
      expense_payment_id INTEGER REFERENCES expense_payments(id) ON DELETE RESTRICT,
      fee_journal_entry_id INTEGER REFERENCES journal_entries(id) ON DELETE RESTRICT,
      match_method TEXT NOT NULL DEFAULT 'manual',
      matched_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
      CHECK (matched_entity_type IN ('invoice','expense','bank_fee')),
      CHECK (match_method IN (
        'manual','auto_amount_exact','auto_amount_date','auto_amount_ref','auto_iban',
        'auto_fee','auto_interest_income','auto_interest_expense'
      )),
      CHECK (
        (matched_entity_type = 'invoice' AND invoice_payment_id IS NOT NULL AND expense_payment_id IS NULL AND fee_journal_entry_id IS NULL AND matched_entity_id IS NOT NULL)
        OR
        (matched_entity_type = 'expense' AND expense_payment_id IS NOT NULL AND invoice_payment_id IS NULL AND fee_journal_entry_id IS NULL AND matched_entity_id IS NOT NULL)
        OR
        (matched_entity_type = 'bank_fee' AND fee_journal_entry_id IS NOT NULL AND invoice_payment_id IS NULL AND expense_payment_id IS NULL AND matched_entity_id IS NULL)
      )
    );

    INSERT INTO bank_reconciliation_matches_new (
      id, bank_transaction_id, matched_entity_type, matched_entity_id,
      invoice_payment_id, expense_payment_id, fee_journal_entry_id, match_method, matched_at
    )
    SELECT
      id, bank_transaction_id, matched_entity_type, matched_entity_id,
      invoice_payment_id, expense_payment_id, NULL, match_method, matched_at
    FROM bank_reconciliation_matches;

    DROP TABLE bank_reconciliation_matches;
    ALTER TABLE bank_reconciliation_matches_new RENAME TO bank_reconciliation_matches;

    CREATE INDEX idx_bank_match_entity
      ON bank_reconciliation_matches(matched_entity_type, matched_entity_id);
    CREATE INDEX idx_brm_fee_entry
      ON bank_reconciliation_matches(fee_journal_entry_id) WHERE fee_journal_entry_id IS NOT NULL;

    -- Del 2: bank_transactions BkTxCd-fält (ISO 20022 Domn/Fmly/SubFmlyCd)
    ALTER TABLE bank_transactions ADD COLUMN bank_tx_domain TEXT;
    ALTER TABLE bank_transactions ADD COLUMN bank_tx_family TEXT;
    ALTER TABLE bank_transactions ADD COLUMN bank_tx_subfamily TEXT;
  `)

  // Verify
  const sqlNew = (
    db
      .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='bank_reconciliation_matches'")
      .get() as { sql: string }
  ).sql
  if (!sqlNew.includes('fee_journal_entry_id')) {
    throw new Error('Migration 041 failed: fee_journal_entry_id saknas i bank_reconciliation_matches')
  }
  if (!sqlNew.includes("'auto_fee'")) {
    throw new Error('Migration 041 failed: auto_fee saknas i match_method CHECK')
  }
  if (!sqlNew.includes("'bank_fee'")) {
    throw new Error('Migration 041 failed: bank_fee saknas i matched_entity_type CHECK')
  }
  const btCols = getTableColumns(db, 'bank_transactions')
  if (!btCols.has('bank_tx_domain') || !btCols.has('bank_tx_family') || !btCols.has('bank_tx_subfamily')) {
    throw new Error('Migration 041 failed: BkTxCd-kolumner saknas på bank_transactions')
  }
}

/**
 * Migration 022: Sprint 15 S42 — öre-suffix rename (M119/F1).
 * 5 kolumner: invoice_payments.amount → amount_ore, expense_payments.amount → amount_ore,
 * invoices.paid_amount → paid_amount_ore, expenses.paid_amount → paid_amount_ore,
 * opening_balances.balance → balance_ore.
 * Table-recreate för de 3 tabeller med CHECK-constraints, RENAME COLUMN för övriga 2.
 */
function migration022Programmatic(db: import('better-sqlite3').Database): void {
  // Idempotency: if amount_ore already exists, skip
  const ipCols = getTableColumns(db, 'invoice_payments')
  if (ipCols.has('amount_ore')) return

  // === Phase 1: Create _new tables and copy data ===
  // invoice_payments (table-recreate: CHECK references amount)
  db.exec(`
    CREATE TABLE invoice_payments_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id),
      journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
      payment_date TEXT NOT NULL,
      amount_ore INTEGER NOT NULL CHECK (amount_ore > 0),
      payment_method TEXT,
      account_number TEXT DEFAULT '1930' REFERENCES accounts(account_number),
      bank_fee_ore INTEGER,
      bank_fee_account TEXT,
      payment_batch_id INTEGER REFERENCES payment_batches(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO invoice_payments_new (id, invoice_id, journal_entry_id, payment_date,
      amount_ore, payment_method, account_number, bank_fee_ore, bank_fee_account,
      payment_batch_id, created_at)
    SELECT id, invoice_id, journal_entry_id, payment_date,
      amount, payment_method, account_number, bank_fee_ore, bank_fee_account,
      payment_batch_id, created_at
    FROM invoice_payments;
  `)

  // expense_payments (table-recreate: CHECK references amount)
  db.exec(`
    CREATE TABLE expense_payments_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL REFERENCES expenses(id),
      journal_entry_id INTEGER NOT NULL REFERENCES journal_entries(id),
      payment_date TEXT NOT NULL,
      amount_ore INTEGER NOT NULL CHECK (amount_ore > 0),
      payment_method TEXT,
      account_number TEXT DEFAULT '1930' REFERENCES accounts(account_number),
      bank_fee_ore INTEGER,
      bank_fee_account TEXT,
      payment_batch_id INTEGER REFERENCES payment_batches(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO expense_payments_new (id, expense_id, journal_entry_id, payment_date,
      amount_ore, payment_method, account_number, bank_fee_ore, bank_fee_account,
      payment_batch_id, created_at)
    SELECT id, expense_id, journal_entry_id, payment_date,
      amount, payment_method, account_number, bank_fee_ore, bank_fee_account,
      payment_batch_id, created_at
    FROM expense_payments;
  `)

  // invoices (table-recreate: CHECK references paid_amount)
  db.exec(`
    CREATE TABLE invoices_new (
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
      paid_amount_ore INTEGER NOT NULL DEFAULT 0,
      journal_entry_id INTEGER REFERENCES journal_entries(id),
      ocr_number TEXT,
      notes TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      fiscal_year_id INTEGER REFERENCES fiscal_years(id),
      payment_terms INTEGER NOT NULL DEFAULT 30,
      CHECK (invoice_type IN ('customer_invoice', 'supplier_invoice', 'credit_note')),
      CHECK (status IN ('draft', 'unpaid', 'partial', 'paid', 'overdue', 'void')),
      CHECK (net_amount_ore >= 0),
      CHECK (vat_amount_ore >= 0),
      CHECK (total_amount_ore >= 0),
      CHECK (paid_amount_ore >= 0)
    );
    INSERT INTO invoices_new (id, counterparty_id, invoice_type, invoice_number,
      invoice_date, due_date, net_amount_ore, vat_amount_ore, total_amount_ore,
      currency, status, paid_amount_ore, journal_entry_id, ocr_number, notes,
      version, created_at, updated_at, fiscal_year_id, payment_terms)
    SELECT id, counterparty_id, invoice_type, invoice_number,
      invoice_date, due_date, net_amount_ore, vat_amount_ore, total_amount_ore,
      currency, status, paid_amount, journal_entry_id, ocr_number, notes,
      version, created_at, updated_at, fiscal_year_id, payment_terms
    FROM invoices;
  `)

  // === Phase 2: Drop old tables (children first to avoid FK violations) ===
  db.exec(`
    DROP TABLE invoice_payments;
    DROP TABLE expense_payments;
    DROP TABLE invoices;
  `)

  // === Phase 3: Rename new tables + recreate indexes + trigger ===
  db.exec(`
    ALTER TABLE invoices_new RENAME TO invoices;
    ALTER TABLE invoice_payments_new RENAME TO invoice_payments;
    ALTER TABLE expense_payments_new RENAME TO expense_payments;
    CREATE INDEX idx_inv_counterparty ON invoices(counterparty_id);
    CREATE INDEX idx_inv_status ON invoices(status);
    CREATE INDEX idx_inv_due ON invoices(due_date);
    CREATE UNIQUE INDEX idx_invoices_year_invnum
      ON invoices(fiscal_year_id, invoice_number)
      WHERE invoice_number != '';
    CREATE TRIGGER trg_prevent_invoice_delete
    BEFORE DELETE ON invoices
    WHEN OLD.status != 'draft'
    BEGIN
        SELECT RAISE(ABORT, 'Faktura som inte är utkast kan inte raderas. Makulera istället.');
    END;
    CREATE INDEX idx_ip_invoice ON invoice_payments(invoice_id);
    CREATE INDEX idx_payments_invoice ON invoice_payments(invoice_id, amount_ore);
    CREATE INDEX idx_ip_batch ON invoice_payments(payment_batch_id) WHERE payment_batch_id IS NOT NULL;
    CREATE INDEX idx_expense_payments_expense ON expense_payments(expense_id, amount_ore);
    CREATE INDEX idx_ep_batch ON expense_payments(payment_batch_id) WHERE payment_batch_id IS NOT NULL;
  `)

  // === 4. expenses: simple rename (no CHECK on paid_amount) ===
  db.exec(`ALTER TABLE expenses RENAME COLUMN paid_amount TO paid_amount_ore;`)

  // === 5. opening_balances: simple rename (no CHECK on balance) ===
  db.exec(`ALTER TABLE opening_balances RENAME COLUMN balance TO balance_ore;`)

  // Verify
  migration022Verify(db)
}

function migration022Verify(db: import('better-sqlite3').Database): void {
  const checks: Array<[string, string, string]> = [
    ['invoice_payments', 'amount_ore', 'amount'],
    ['expense_payments', 'amount_ore', 'amount'],
    ['invoices', 'paid_amount_ore', 'paid_amount'],
    ['expenses', 'paid_amount_ore', 'paid_amount'],
    ['opening_balances', 'balance_ore', 'balance'],
  ]
  for (const [table, expected, forbidden] of checks) {
    const cols = getTableColumns(db, table)
    if (!cols.has(expected)) throw new Error(`Migration 022 failed: ${table}.${expected} saknas`)
    if (cols.has(forbidden)) throw new Error(`Migration 022 failed: ${table}.${forbidden} finns kvar`)
  }
}

/**
 * Migration 023: Sprint 15 S43 — FK account_number på manual_entry_lines + payment_batches (F2, F6).
 *
 * Del A: manual_entry_lines.account_number → REFERENCES accounts(account_number)
 *   Bladtabell (ingen inkommande FK) → M121-mönster, ingen trigger-reattach behövs.
 *
 * Del B: payment_batches.account_number → REFERENCES accounts(account_number)
 *   Inkommande FK från invoice_payments + expense_payments → M122-mönster.
 *   PRAGMA foreign_keys OFF/ON hanteras av db.ts (needsFkOff).
 */
function migration023Programmatic(db: import('better-sqlite3').Database): void {
  // Idempotency: check if manual_entry_lines already has FK on account_number
  const melSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='manual_entry_lines'")
    .get() as { sql: string } | undefined
  if (melSchema && melSchema.sql.includes('REFERENCES accounts')) return

  // === Del A: manual_entry_lines (M121) ===
  // Verify no triggers attached before drop
  const melTriggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='manual_entry_lines'")
    .all() as { name: string }[]
  if (melTriggers.length > 0) {
    throw new Error(`Migration 023: unexpected triggers on manual_entry_lines: ${melTriggers.map(t => t.name).join(', ')}`)
  }

  db.exec(`
    CREATE TABLE manual_entry_lines_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manual_entry_id INTEGER NOT NULL REFERENCES manual_entries(id) ON DELETE CASCADE,
      line_number INTEGER NOT NULL,
      account_number TEXT NOT NULL REFERENCES accounts(account_number),
      debit_ore INTEGER NOT NULL DEFAULT 0,
      credit_ore INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      UNIQUE(manual_entry_id, line_number)
    );
    INSERT INTO manual_entry_lines_new (id, manual_entry_id, line_number, account_number, debit_ore, credit_ore, description)
    SELECT id, manual_entry_id, line_number, account_number, debit_ore, credit_ore, description
    FROM manual_entry_lines;
    DROP TABLE manual_entry_lines;
    ALTER TABLE manual_entry_lines_new RENAME TO manual_entry_lines;
  `)

  // === Del B: payment_batches (M122) ===
  // Verify no triggers attached before drop
  const pbTriggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='payment_batches'")
    .all() as { name: string }[]
  if (pbTriggers.length > 0) {
    throw new Error(`Migration 023: unexpected triggers on payment_batches: ${pbTriggers.map(t => t.name).join(', ')}`)
  }

  db.exec(`
    CREATE TABLE payment_batches_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
      batch_type TEXT NOT NULL CHECK (batch_type IN ('invoice', 'expense')),
      payment_date TEXT NOT NULL,
      account_number TEXT NOT NULL REFERENCES accounts(account_number),
      bank_fee_ore INTEGER NOT NULL DEFAULT 0,
      bank_fee_journal_entry_id INTEGER REFERENCES journal_entries(id),
      status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial', 'cancelled')),
      user_note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO payment_batches_new (id, fiscal_year_id, batch_type, payment_date, account_number,
      bank_fee_ore, bank_fee_journal_entry_id, status, user_note, created_at)
    SELECT id, fiscal_year_id, batch_type, payment_date, account_number,
      bank_fee_ore, bank_fee_journal_entry_id, status, user_note, created_at
    FROM payment_batches;
    DROP TABLE payment_batches;
    ALTER TABLE payment_batches_new RENAME TO payment_batches;
  `)

  // Recreate index (M121)
  db.exec(`CREATE INDEX idx_pb_fiscal_year ON payment_batches(fiscal_year_id);`)

  // Verify
  migration023Verify(db)
}

function migration023Verify(db: import('better-sqlite3').Database): void {
  // 1. manual_entry_lines has FK on account_number
  const melSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='manual_entry_lines'")
    .get() as { sql: string }
  if (!melSchema.sql.includes('REFERENCES accounts(account_number)')) {
    throw new Error('Migration 023 failed: manual_entry_lines.account_number FK saknas')
  }

  // 2. payment_batches has FK on account_number
  const pbSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='payment_batches'")
    .get() as { sql: string }
  if (!pbSchema.sql.includes('REFERENCES accounts(account_number)')) {
    throw new Error('Migration 023 failed: payment_batches.account_number FK saknas')
  }

  // 3. Index recreated
  const idx = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_pb_fiscal_year'")
    .get()
  if (!idx) throw new Error('Migration 023 failed: idx_pb_fiscal_year saknas')

  // 4. Verify all 11 triggers still intact (none should have been affected)
  const triggerCount = db
    .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'")
    .get() as { cnt: number }
  if (triggerCount.cnt !== 11) {
    throw new Error(`Migration 023 failed: expected 11 triggers, found ${triggerCount.cnt}`)
  }
}

function migration024Verify(db: import('better-sqlite3').Database): void {
  const trigger = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name='trg_invoice_lines_account_number_on_finalize'")
    .get()
  if (!trigger) throw new Error('Migration 024 failed: trigger trg_invoice_lines_account_number_on_finalize saknas')

  const triggerCount = db
    .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'")
    .get() as { cnt: number }
  if (triggerCount.cnt !== 12) {
    throw new Error(`Migration 024 failed: expected 12 triggers, found ${triggerCount.cnt}`)
  }
}

function migration025Verify(db: import('better-sqlite3').Database): void {
  const prodCols = db.prepare('PRAGMA table_info(products)').all() as { name: string }[]
  const prodNames = prodCols.map(c => c.name)
  if (!prodNames.includes('default_price_ore')) throw new Error('Migration 025 failed: default_price_ore saknas')
  if (prodNames.includes('default_price')) throw new Error('Migration 025 failed: default_price finns kvar')

  const pliCols = db.prepare('PRAGMA table_info(price_list_items)').all() as { name: string }[]
  const pliNames = pliCols.map(c => c.name)
  if (!pliNames.includes('price_ore')) throw new Error('Migration 025 failed: price_ore saknas')
  if (pliNames.includes('price')) throw new Error('Migration 025 failed: price finns kvar')
}

/**
 * Migration 026: Sprint 16 S49 — F10 expense_lines paritet mot invoice_lines.
 * Lägger till sort_order (INTEGER NOT NULL DEFAULT 0) och created_at (TEXT NOT NULL DEFAULT (datetime('now'))).
 * Backfill: sort_order via ROW_NUMBER (0-indexerat), created_at från parent expenses.created_at.
 * Pre-migration orphan-check: kastar INNAN schemaändring om expense_lines har orphans.
 */
function migration026Programmatic(db: import('better-sqlite3').Database): void {
  // Idempotency: skip if sort_order already exists
  const cols = getTableColumns(db, 'expense_lines')
  if (cols.has('sort_order')) return

  // Pre-migration orphan check — BEFORE schema change so partial failure is impossible
  const orphanCount = db
    .prepare(
      'SELECT COUNT(*) as cnt FROM expense_lines el LEFT JOIN expenses e ON e.id = el.expense_id WHERE e.id IS NULL',
    )
    .get() as { cnt: number }
  if (orphanCount.cnt > 0) {
    throw new Error(
      `Migration 026 failed: ${orphanCount.cnt} orphaned expense_lines found (no matching expenses row). Fix data before migrating.`,
    )
  }

  // ADD COLUMN sort_order — matches invoice_lines: INTEGER NOT NULL DEFAULT 0
  db.exec('ALTER TABLE expense_lines ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0')

  // Backfill: deterministic 0-indexed order per expense_id (matches invoice_lines convention)
  db.exec(`
    UPDATE expense_lines
    SET sort_order = sub.rn - 1
    FROM (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY expense_id ORDER BY id) AS rn
      FROM expense_lines
    ) sub
    WHERE expense_lines.id = sub.id
  `)

  // ADD COLUMN created_at — two-step: add with constant default (SQLite ADD COLUMN limitation),
  // then backfill from parent. New rows will get datetime('now') via the runtime default after
  // we recreate the table constraint check won't trigger since we immediately backfill all rows.
  // Note: SQLite ADD COLUMN does NOT support non-constant defaults even in 3.45+.
  // We use a placeholder constant and backfill immediately.
  db.exec("ALTER TABLE expense_lines ADD COLUMN created_at TEXT NOT NULL DEFAULT '1970-01-01 00:00:00'")

  // Backfill: inherit from parent expenses.created_at
  db.exec(`
    UPDATE expense_lines
    SET created_at = (
      SELECT created_at FROM expenses WHERE expenses.id = expense_lines.expense_id
    )
  `)

  // Verify
  const newCols = getTableColumns(db, 'expense_lines')
  if (!newCols.has('sort_order')) throw new Error('Migration 026 failed: sort_order saknas')
  if (!newCols.has('created_at')) throw new Error('Migration 026 failed: created_at saknas')

  // Parity check: compare sort_order + created_at column definitions with invoice_lines
  const elInfo = db.prepare('PRAGMA table_info(expense_lines)').all() as { name: string; notnull: number; dflt_value: string | null; type: string }[]
  const ilInfo = db.prepare('PRAGMA table_info(invoice_lines)').all() as { name: string; notnull: number; dflt_value: string | null; type: string }[]

  for (const colName of ['sort_order', 'created_at']) {
    const elCol = elInfo.find(c => c.name === colName)
    const ilCol = ilInfo.find(c => c.name === colName)
    if (!elCol || !ilCol) throw new Error(`Migration 026 failed: ${colName} saknas i en av tabellerna`)
    if (elCol.notnull !== ilCol.notnull) throw new Error(`Migration 026 parity failed: ${colName} notnull mismatch (expense_lines=${elCol.notnull}, invoice_lines=${ilCol.notnull})`)
    if (elCol.type !== ilCol.type) throw new Error(`Migration 026 parity failed: ${colName} type mismatch (expense_lines=${elCol.type}, invoice_lines=${ilCol.type})`)
  }

  // Trigger count should be unchanged (12)
  const triggerCount = db
    .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'")
    .get() as { cnt: number }
  if (triggerCount.cnt !== 12) {
    throw new Error(`Migration 026 failed: expected 12 triggers, found ${triggerCount.cnt}`)
  }
}

function migration018Verify(db: import('better-sqlite3').Database): void {
  const cols = db.prepare('PRAGMA table_info(journal_entry_lines)').all() as { name: string }[]
  const colNames = cols.map(c => c.name)
  const expectedNew = ['debit_ore', 'credit_ore', 'vat_ore']
  const forbiddenOld = ['debit_amount', 'credit_amount', 'vat_amount']
  for (const name of expectedNew) {
    if (!colNames.includes(name)) throw new Error(`Migration 018 failed: ${name} saknas`)
  }
  for (const name of forbiddenOld) {
    if (colNames.includes(name)) throw new Error(`Migration 018 failed: ${name} finns kvar`)
  }
}

function migration019Verify(db: import('better-sqlite3').Database): void {
  const cols = db.prepare('PRAGMA table_info(manual_entry_lines)').all() as { name: string }[]
  const colNames = cols.map(c => c.name)
  const expectedNew = ['debit_ore', 'credit_ore']
  const forbiddenOld = ['debit_amount', 'credit_amount']
  for (const name of expectedNew) {
    if (!colNames.includes(name)) throw new Error(`Migration 019 failed: ${name} saknas`)
  }
  for (const name of forbiddenOld) {
    if (colNames.includes(name)) throw new Error(`Migration 019 failed: ${name} finns kvar`)
  }
}

function migration020Programmatic(db: import('better-sqlite3').Database): void {
  const ipCols = getTableColumns(db, 'invoice_payments')
  addColumnIfMissing(db, 'invoice_payments', 'bank_fee_ore', 'INTEGER', ipCols)
  addColumnIfMissing(db, 'invoice_payments', 'bank_fee_account', 'TEXT', ipCols)

  const epCols = getTableColumns(db, 'expense_payments')
  addColumnIfMissing(db, 'expense_payments', 'bank_fee_ore', 'INTEGER', epCols)
  addColumnIfMissing(db, 'expense_payments', 'bank_fee_account', 'TEXT', epCols)
}

/**
 * Migration 021: Sprint 13 — payment_batches + auto_bank_fee source_type
 *
 * 1. Rebuild journal_entries to add 'auto_bank_fee' to source_type CHECK.
 * 2. Drop and recreate all 7 triggers (with opening_balance exception on 1–5,
 *    debit_ore/credit_ore column names on balance trigger).
 * 3. Recreate 4 indexes.
 * 4. CREATE payment_batches table.
 * 5. Add payment_batch_id FK to invoice_payments and expense_payments.
 * 6. Partial indexes on payment_batch_id.
 */
function migration021Programmatic(db: import('better-sqlite3').Database): void {
  // === Idempotency guard: check if auto_bank_fee is already in CHECK ===
  const tableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'")
    .get() as { sql: string } | undefined
  const needsRebuild = !tableInfo?.sql?.includes('auto_bank_fee')

  if (needsRebuild) {
    // 1. Rebuild journal_entries with extended CHECK
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
        CHECK (source_type IN ('manual', 'auto_invoice', 'auto_payment', 'auto_expense', 'auto_salary', 'auto_depreciation', 'auto_tax', 'import', 'opening_balance', 'auto_bank_fee')),
        UNIQUE (verification_series, verification_number, fiscal_year_id)
      );
    `)

    db.exec(`INSERT INTO journal_entries_new SELECT * FROM journal_entries;`)

    // Drop all 7 triggers that reference journal_entries
    db.exec(`DROP TRIGGER IF EXISTS trg_immutable_booked_entry_update;`)
    db.exec(`DROP TRIGGER IF EXISTS trg_immutable_booked_entry_delete;`)
    db.exec(`DROP TRIGGER IF EXISTS trg_immutable_booked_line_update;`)
    db.exec(`DROP TRIGGER IF EXISTS trg_immutable_booked_line_delete;`)
    db.exec(`DROP TRIGGER IF EXISTS trg_immutable_booked_line_insert;`)
    db.exec(`DROP TRIGGER IF EXISTS trg_check_balance_on_booking;`)
    db.exec(`DROP TRIGGER IF EXISTS trg_check_period_on_booking;`)

    // Drop indexes
    db.exec(`DROP INDEX IF EXISTS idx_je_date;`)
    db.exec(`DROP INDEX IF EXISTS idx_je_fiscal_year;`)
    db.exec(`DROP INDEX IF EXISTS idx_je_status;`)
    db.exec(`DROP INDEX IF EXISTS idx_journal_entries_verify_series_unique;`)

    db.exec(`DROP TABLE journal_entries;`)
    db.exec(`ALTER TABLE journal_entries_new RENAME TO journal_entries;`)

    // Recreate 4 indexes
    db.exec(`CREATE INDEX idx_je_date ON journal_entries (journal_date);`)
    db.exec(`CREATE INDEX idx_je_fiscal_year ON journal_entries (fiscal_year_id);`)
    db.exec(`CREATE INDEX idx_je_status ON journal_entries (status);`)
    db.exec(`
      CREATE UNIQUE INDEX idx_journal_entries_verify_series_unique
      ON journal_entries(fiscal_year_id, verification_series, verification_number)
      WHERE verification_number IS NOT NULL;
    `)

    // Recreate 7 triggers — opening_balance exception on immutability triggers 1–5,
    // debit_ore/credit_ore on balance trigger (post-M18 column names)

    // 1. UPDATE trigger — exception for opening_balance
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

    // 2. DELETE trigger — exception for opening_balance
    db.exec(`
      CREATE TRIGGER trg_immutable_booked_entry_delete
      BEFORE DELETE ON journal_entries
      WHEN OLD.status = 'booked' AND OLD.source_type != 'opening_balance'
      BEGIN
          SELECT RAISE(ABORT, 'Bokförd verifikation kan inte raderas.');
      END;
    `)

    // 3. Line UPDATE trigger — exception via subquery
    db.exec(`
      CREATE TRIGGER trg_immutable_booked_line_update
      BEFORE UPDATE ON journal_entry_lines
      WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
        AND (SELECT source_type FROM journal_entries WHERE id = OLD.journal_entry_id) != 'opening_balance'
      BEGIN
          SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte ändras.');
      END;
    `)

    // 4. Line DELETE trigger — exception via subquery
    db.exec(`
      CREATE TRIGGER trg_immutable_booked_line_delete
      BEFORE DELETE ON journal_entry_lines
      WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
        AND (SELECT source_type FROM journal_entries WHERE id = OLD.journal_entry_id) != 'opening_balance'
      BEGIN
          SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte raderas.');
      END;
    `)

    // 5. Line INSERT trigger — exception via subquery
    db.exec(`
      CREATE TRIGGER trg_immutable_booked_line_insert
      BEFORE INSERT ON journal_entry_lines
      WHEN (SELECT status FROM journal_entries WHERE id = NEW.journal_entry_id) = 'booked'
        AND (SELECT source_type FROM journal_entries WHERE id = NEW.journal_entry_id) != 'opening_balance'
      BEGIN
          SELECT RAISE(ABORT, 'Kan inte lägga till rader på bokförd verifikation.');
      END;
    `)

    // 6. Balance check trigger (debit_ore/credit_ore — post-M18)
    db.exec(`
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
    `)

    // 7. Period check trigger
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

  // === payment_batches table ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS payment_batches (
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
  `)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_pb_fiscal_year ON payment_batches(fiscal_year_id);`)

  // === payment_batch_id on invoice_payments ===
  const ipCols = getTableColumns(db, 'invoice_payments')
  addColumnIfMissing(db, 'invoice_payments', 'payment_batch_id', 'INTEGER REFERENCES payment_batches(id)', ipCols)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ip_batch ON invoice_payments(payment_batch_id) WHERE payment_batch_id IS NOT NULL;`)

  // === payment_batch_id on expense_payments ===
  const epCols = getTableColumns(db, 'expense_payments')
  addColumnIfMissing(db, 'expense_payments', 'payment_batch_id', 'INTEGER REFERENCES payment_batches(id)', epCols)
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ep_batch ON expense_payments(payment_batch_id) WHERE payment_batch_id IS NOT NULL;`)

  // Verify
  migration021Verify(db)
}

function migration027Verify(db: import('better-sqlite3').Database): void {
  const cols = getTableColumns(db, 'journal_entries')
  if (!cols.has('created_by_id')) throw new Error('Migration 027 failed: created_by_id saknas')
  if (cols.has('created_by')) throw new Error('Migration 027 failed: created_by finns kvar')
}

function migration028Verify(db: import('better-sqlite3').Database): void {
  // 1. verification_sequences should not exist
  const vsTable = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='verification_sequences'")
    .get() as { name: string } | undefined
  if (vsTable) throw new Error('Migration 028 failed: verification_sequences still exists')

  // 2. counterparties should have payment_terms, not payment_terms_days
  const cols = getTableColumns(db, 'counterparties')
  if (!cols.has('payment_terms')) throw new Error('Migration 028 failed: counterparties.payment_terms saknas')
  if (cols.has('payment_terms_days')) throw new Error('Migration 028 failed: counterparties.payment_terms_days finns kvar')
}

function migration031Verify(db: import('better-sqlite3').Database): void {
  const triggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='journal_entries'")
    .all() as { name: string }[]
  const triggerNames = new Set(triggers.map((t) => t.name))
  const expected = [
    'trg_immutable_source_type',
    'trg_immutable_source_reference',
    'trg_immutable_corrects_entry_id',
    'trg_no_correct_with_payments',
  ]
  for (const name of expected) {
    if (!triggerNames.has(name)) throw new Error(`Migration 031 failed: trigger ${name} saknas`)
  }
}

function migration030Verify(db: import('better-sqlite3').Database): void {
  const cols = getTableColumns(db, 'expenses')
  if (!cols.has('expense_type')) throw new Error('Migration 030 failed: expenses.expense_type saknas')
  if (!cols.has('credits_expense_id')) throw new Error('Migration 030 failed: expenses.credits_expense_id saknas')

  const idxRows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='expenses' AND name='idx_exp_credits'")
    .all() as { name: string }[]
  if (idxRows.length === 0) throw new Error('Migration 030 failed: idx_exp_credits index saknas')
}

function migration029Verify(db: import('better-sqlite3').Database): void {
  const cols = getTableColumns(db, 'invoices')
  if (!cols.has('credits_invoice_id')) throw new Error('Migration 029 failed: invoices.credits_invoice_id saknas')

  const idxRows = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='invoices' AND name='idx_inv_credits'")
    .all() as { name: string }[]
  if (idxRows.length === 0) throw new Error('Migration 029 failed: idx_inv_credits index saknas')
}

function migration021Verify(db: import('better-sqlite3').Database): void {
  // 1. CHECK constraint includes auto_bank_fee
  const tableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'")
    .get() as { sql: string }
  if (!tableInfo.sql.includes('auto_bank_fee')) {
    throw new Error('Migration 021 failed: auto_bank_fee not in journal_entries CHECK')
  }

  // 2. All 7 triggers exist
  const triggers = db
    .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name IN ('journal_entries', 'journal_entry_lines')")
    .all() as { name: string }[]
  const triggerNames = new Set(triggers.map(t => t.name))
  const expected = [
    'trg_immutable_booked_entry_update',
    'trg_immutable_booked_entry_delete',
    'trg_immutable_booked_line_update',
    'trg_immutable_booked_line_delete',
    'trg_immutable_booked_line_insert',
    'trg_check_balance_on_booking',
    'trg_check_period_on_booking',
  ]
  for (const name of expected) {
    if (!triggerNames.has(name)) {
      throw new Error(`Migration 021 failed: trigger ${name} saknas`)
    }
  }

  // 3. trg_immutable_booked_entry_update still has opening_balance exception
  const updateTrigger = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='trg_immutable_booked_entry_update'")
    .get() as { sql: string }
  if (!updateTrigger.sql.includes('opening_balance')) {
    throw new Error('Migration 021 failed: trg_immutable_booked_entry_update missing opening_balance exception')
  }

  // 4. payment_batches exists with correct CHECK
  const pbInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='payment_batches'")
    .get() as { sql: string } | undefined
  if (!pbInfo) throw new Error('Migration 021 failed: payment_batches table missing')

  // 5. payment_batch_id column exists on both payment tables
  const ipCols = getTableColumns(db, 'invoice_payments')
  if (!ipCols.has('payment_batch_id')) throw new Error('Migration 021 failed: invoice_payments.payment_batch_id missing')
  const epCols = getTableColumns(db, 'expense_payments')
  if (!epCols.has('payment_batch_id')) throw new Error('Migration 021 failed: expense_payments.payment_batch_id missing')
}

/**
 * Migration 032: Sprint 33 F46b — quantity-CHECK defense-in-depth.
 *
 * Table-recreate for invoice_lines (CHECK quantity > 0 AND quantity <= 9999.99)
 * and expense_lines (CHECK quantity >= 1 AND quantity <= 9999).
 *
 * Both are leaf tables (no inbound FK) — M121 only, no PRAGMA foreign_keys OFF.
 * invoice_lines has 1 index (idx_invoice_lines_invoice). No triggers on invoice_lines itself.
 * expense_lines has 0 indexes, 0 triggers.
 */
function migration032Programmatic(db: import('better-sqlite3').Database): void {
  // Idempotency: check if invoice_lines already has upper-bound CHECK
  const ilSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoice_lines'")
    .get() as { sql: string } | undefined
  if (ilSchema && ilSchema.sql.includes('9999.99')) return

  // Pre-flight validation — fail early if existing rows violate new CHECK
  const ilViolations = db
    .prepare('SELECT COUNT(*) as cnt FROM invoice_lines WHERE quantity <= 0 OR quantity > 9999.99')
    .get() as { cnt: number }
  if (ilViolations.cnt > 0) {
    throw new Error(`F46b pre-flight: ${ilViolations.cnt} invoice_lines rows violate new CHECK (quantity <= 0 OR > 9999.99)`)
  }

  const elViolations = db
    .prepare('SELECT COUNT(*) as cnt FROM expense_lines WHERE quantity < 1 OR quantity > 9999')
    .get() as { cnt: number }
  if (elViolations.cnt > 0) {
    throw new Error(`F46b pre-flight: ${elViolations.cnt} expense_lines rows violate new CHECK (quantity < 1 OR > 9999)`)
  }

  // === invoice_lines table-recreate ===
  // trg_invoice_lines_account_number_on_finalize is on `invoices` but references
  // `invoice_lines` in its body — must be dropped before DROP TABLE and recreated after.
  db.exec('DROP TRIGGER IF EXISTS trg_invoice_lines_account_number_on_finalize;')

  db.exec(`
    CREATE TABLE invoice_lines_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
      product_id INTEGER REFERENCES products(id),
      description TEXT NOT NULL DEFAULT '',
      quantity REAL NOT NULL DEFAULT 1 CHECK (quantity > 0 AND quantity <= 9999.99),
      unit_price_ore INTEGER NOT NULL DEFAULT 0,
      vat_code_id INTEGER NOT NULL REFERENCES vat_codes(id),
      line_total_ore INTEGER NOT NULL DEFAULT 0,
      vat_amount_ore INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      account_number TEXT REFERENCES accounts(account_number),
      CHECK (unit_price_ore >= 0),
      CHECK (line_total_ore >= 0)
    );
    INSERT INTO invoice_lines_new (id, invoice_id, product_id, description,
      quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore,
      sort_order, created_at, account_number)
    SELECT id, invoice_id, product_id, description,
      quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore,
      sort_order, created_at, account_number
    FROM invoice_lines;
    DROP TABLE invoice_lines;
    ALTER TABLE invoice_lines_new RENAME TO invoice_lines;
  `)

  // Recreate index (M121)
  db.exec('CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);')

  // Recreate trigger (cross-table reference from invoices → invoice_lines)
  db.exec(`
    CREATE TRIGGER trg_invoice_lines_account_number_on_finalize
    BEFORE UPDATE OF status ON invoices
    WHEN OLD.status = 'draft' AND NEW.status = 'unpaid'
    BEGIN
      SELECT CASE
        WHEN EXISTS (
          SELECT 1 FROM invoice_lines
          WHERE invoice_id = NEW.id
            AND product_id IS NULL
            AND account_number IS NULL
        )
        THEN RAISE(ABORT, 'Alla fakturarader måste ha kontonummer innan fakturan slutförs.')
      END;
    END;
  `)

  // === expense_lines table-recreate ===
  db.exec(`
    CREATE TABLE expense_lines_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
      description TEXT NOT NULL DEFAULT '',
      account_number TEXT NOT NULL REFERENCES accounts(account_number),
      quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity >= 1 AND quantity <= 9999),
      unit_price_ore INTEGER NOT NULL DEFAULT 0,
      vat_code_id INTEGER NOT NULL REFERENCES vat_codes(id),
      line_total_ore INTEGER NOT NULL DEFAULT 0,
      vat_amount_ore INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO expense_lines_new (id, expense_id, description, account_number,
      quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore,
      sort_order, created_at)
    SELECT id, expense_id, description, account_number,
      quantity, unit_price_ore, vat_code_id, line_total_ore, vat_amount_ore,
      sort_order, created_at
    FROM expense_lines;
    DROP TABLE expense_lines;
    ALTER TABLE expense_lines_new RENAME TO expense_lines;
  `)

  // expense_lines has no indexes or triggers to recreate

  // Verify
  migration032Verify(db)
}

function migration032Verify(db: import('better-sqlite3').Database): void {
  // 1. invoice_lines has upper-bound CHECK
  const ilSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='invoice_lines'")
    .get() as { sql: string }
  if (!ilSchema.sql.includes('9999.99')) {
    throw new Error('Migration 032 failed: invoice_lines missing quantity upper-bound CHECK')
  }

  // 2. expense_lines has CHECK with integer bounds
  const elSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='expense_lines'")
    .get() as { sql: string }
  if (!elSchema.sql.includes('9999')) {
    throw new Error('Migration 032 failed: expense_lines missing quantity upper-bound CHECK')
  }

  // 3. Index recreated
  const idx = db
    .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_invoice_lines_invoice'")
    .get()
  if (!idx) throw new Error('Migration 032 failed: idx_invoice_lines_invoice saknas')

  // 4. Total trigger count unchanged (16 triggers in current schema)
  const triggerCount = db
    .prepare("SELECT COUNT(*) as cnt FROM sqlite_master WHERE type='trigger'")
    .get() as { cnt: number }
  if (triggerCount.cnt !== 16) {
    throw new Error(`Migration 032 failed: expected 16 triggers, found ${triggerCount.cnt}`)
  }
}

/**
 * Migration 038 (Sprint 53 F62): Avskrivningar & anläggningstillgångar.
 *
 * 1. CREATE fixed_assets — anläggningstillgångar (namn, anskaffningsdatum,
 *    anskaffningsvärde, avskrivningsmetod, konton, status).
 * 2. CREATE depreciation_schedules — periodvisa avskrivningsposter (ON DELETE
 *    CASCADE från fixed_assets, journal_entry_id nullable tills exekverad).
 * 3. Table-recreate journal_entries för att lägga till CHECK-constraint på
 *    verification_series (whitelist: A,B,C,D,E,I). Defense-in-depth mot
 *    ogiltiga serier. M122: foreign_keys=OFF utanför tx (hanteras av db.ts),
 *    PRAGMA foreign_key_check efter commit. M121: alla triggers dropas och
 *    återskapas. M141: cross-table-triggers på journal_entry_lines som
 *    refererar journal_entries i body inventerade och återskapade.
 *
 * Pre-flight: SELECT DISTINCT verification_series måste ge endast värden i
 * whitelist — om annat finns aborteras migrationen.
 */
function migration038Programmatic(db: import('better-sqlite3').Database): void {
  // === Idempotency: check if verification_series CHECK already exists ===
  const jeTableInfo = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'")
    .get() as { sql: string } | undefined
  const needsJeRebuild = !jeTableInfo?.sql?.includes("verification_series IN")

  // === 1. fixed_assets ===
  // Idempotent via IF NOT EXISTS — running migration twice is safe.
  db.exec(`
    CREATE TABLE IF NOT EXISTS fixed_assets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_id INTEGER NOT NULL REFERENCES companies(id),
      name TEXT NOT NULL,
      acquisition_date TEXT NOT NULL,
      acquisition_cost_ore INTEGER NOT NULL CHECK (acquisition_cost_ore >= 0),
      residual_value_ore INTEGER NOT NULL DEFAULT 0 CHECK (residual_value_ore >= 0),
      useful_life_months INTEGER NOT NULL CHECK (useful_life_months > 0),
      method TEXT NOT NULL CHECK (method IN ('linear', 'declining')),
      declining_rate_bp INTEGER,
      account_asset TEXT NOT NULL REFERENCES accounts(account_number),
      account_accumulated_depreciation TEXT NOT NULL REFERENCES accounts(account_number),
      account_depreciation_expense TEXT NOT NULL REFERENCES accounts(account_number),
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disposed', 'fully_depreciated')),
      disposed_date TEXT,
      disposed_journal_entry_id INTEGER REFERENCES journal_entries(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (residual_value_ore <= acquisition_cost_ore),
      CHECK (method != 'declining' OR declining_rate_bp IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS idx_fixed_assets_company ON fixed_assets (company_id);
    CREATE INDEX IF NOT EXISTS idx_fixed_assets_status ON fixed_assets (status);
  `)

  // === 2. depreciation_schedules ===
  db.exec(`
    CREATE TABLE IF NOT EXISTS depreciation_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fixed_asset_id INTEGER NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
      period_number INTEGER NOT NULL CHECK (period_number >= 1),
      period_start TEXT NOT NULL,
      period_end TEXT NOT NULL,
      amount_ore INTEGER NOT NULL CHECK (amount_ore >= 0),
      journal_entry_id INTEGER REFERENCES journal_entries(id),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'executed', 'skipped')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (fixed_asset_id, period_number)
    );
    CREATE INDEX IF NOT EXISTS idx_dep_schedules_asset ON depreciation_schedules (fixed_asset_id);
    CREATE INDEX IF NOT EXISTS idx_dep_schedules_status ON depreciation_schedules (status);
  `)

  if (!needsJeRebuild) return // CHECK already added — idempotent exit

  // === 3. Pre-flight: verify no existing journal_entries violate new CHECK ===
  const allowedSeries = ['A', 'B', 'C', 'E', 'I', 'O']
  const distinctSeries = db
    .prepare('SELECT DISTINCT verification_series FROM journal_entries')
    .all() as { verification_series: string }[]
  for (const row of distinctSeries) {
    if (!allowedSeries.includes(row.verification_series)) {
      throw new Error(
        `Migration 038 pre-flight: journal_entries har serie '${row.verification_series}' utanför whitelist ${JSON.stringify(allowedSeries)}. Undersök innan migrationen kan köras.`,
      )
    }
  }

  // === 4. Table-recreate journal_entries with verification_series CHECK ===
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
      created_by_id INTEGER REFERENCES users(id),
      source_type TEXT DEFAULT 'manual',
      source_reference TEXT,
      corrects_entry_id INTEGER REFERENCES journal_entries(id),
      corrected_by_id INTEGER REFERENCES journal_entries(id),
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      CHECK (status IN ('draft', 'booked', 'corrected')),
      CHECK (source_type IN ('manual', 'auto_invoice', 'auto_payment', 'auto_expense', 'auto_salary', 'auto_depreciation', 'auto_tax', 'import', 'opening_balance', 'auto_bank_fee')),
      CHECK (verification_series IN ('A', 'B', 'C', 'E', 'I', 'O')),
      UNIQUE (verification_series, verification_number, fiscal_year_id)
    );
  `)

  db.exec(`INSERT INTO journal_entries_new SELECT * FROM journal_entries;`)

  // M141 trigger inventory — all triggers on journal_entries OR referring to
  // journal_entries in body. Cross-table (journal_entry_lines) triggers are
  // included because DROP TABLE journal_entries would leave them referring to
  // a non-existent table during the rename window.
  db.exec('DROP TRIGGER IF EXISTS trg_immutable_booked_entry_update;')
  db.exec('DROP TRIGGER IF EXISTS trg_immutable_booked_entry_delete;')
  db.exec('DROP TRIGGER IF EXISTS trg_immutable_booked_line_update;')
  db.exec('DROP TRIGGER IF EXISTS trg_immutable_booked_line_delete;')
  db.exec('DROP TRIGGER IF EXISTS trg_immutable_booked_line_insert;')
  db.exec('DROP TRIGGER IF EXISTS trg_check_balance_on_booking;')
  db.exec('DROP TRIGGER IF EXISTS trg_check_period_on_booking;')
  db.exec('DROP TRIGGER IF EXISTS trg_immutable_source_type;')
  db.exec('DROP TRIGGER IF EXISTS trg_immutable_source_reference;')
  db.exec('DROP TRIGGER IF EXISTS trg_immutable_corrects_entry_id;')
  db.exec('DROP TRIGGER IF EXISTS trg_no_correct_with_payments;')

  db.exec('DROP INDEX IF EXISTS idx_je_date;')
  db.exec('DROP INDEX IF EXISTS idx_je_fiscal_year;')
  db.exec('DROP INDEX IF EXISTS idx_je_status;')
  db.exec('DROP INDEX IF EXISTS idx_journal_entries_verify_series_unique;')

  db.exec('DROP TABLE journal_entries;')
  db.exec('ALTER TABLE journal_entries_new RENAME TO journal_entries;')

  // Recreate indexes
  db.exec('CREATE INDEX idx_je_date ON journal_entries (journal_date);')
  db.exec('CREATE INDEX idx_je_fiscal_year ON journal_entries (fiscal_year_id);')
  db.exec('CREATE INDEX idx_je_status ON journal_entries (status);')
  db.exec(`
    CREATE UNIQUE INDEX idx_journal_entries_verify_series_unique
    ON journal_entries(fiscal_year_id, verification_series, verification_number)
    WHERE verification_number IS NOT NULL;
  `)

  // Recreate triggers 1–7 (from migration 021)
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
  db.exec(`
    CREATE TRIGGER trg_immutable_booked_entry_delete
    BEFORE DELETE ON journal_entries
    WHEN OLD.status = 'booked' AND OLD.source_type != 'opening_balance'
    BEGIN
        SELECT RAISE(ABORT, 'Bokförd verifikation kan inte raderas.');
    END;
  `)
  db.exec(`
    CREATE TRIGGER trg_immutable_booked_line_update
    BEFORE UPDATE ON journal_entry_lines
    WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
      AND (SELECT source_type FROM journal_entries WHERE id = OLD.journal_entry_id) != 'opening_balance'
    BEGIN
        SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte ändras.');
    END;
  `)
  db.exec(`
    CREATE TRIGGER trg_immutable_booked_line_delete
    BEFORE DELETE ON journal_entry_lines
    WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
      AND (SELECT source_type FROM journal_entries WHERE id = OLD.journal_entry_id) != 'opening_balance'
    BEGIN
        SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte raderas.');
    END;
  `)
  db.exec(`
    CREATE TRIGGER trg_immutable_booked_line_insert
    BEFORE INSERT ON journal_entry_lines
    WHEN (SELECT status FROM journal_entries WHERE id = NEW.journal_entry_id) = 'booked'
      AND (SELECT source_type FROM journal_entries WHERE id = NEW.journal_entry_id) != 'opening_balance'
    BEGIN
        SELECT RAISE(ABORT, 'Kan inte lägga till rader på bokförd verifikation.');
    END;
  `)
  db.exec(`
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

  // Recreate migration 031 immutability triggers (Q8, Q9, Q10)
  db.exec(`
    CREATE TRIGGER trg_immutable_source_type
    BEFORE UPDATE ON journal_entries
    WHEN OLD.status = 'booked' AND NEW.source_type != OLD.source_type
    BEGIN
        SELECT RAISE(ABORT, 'source_type kan inte ändras på bokförd verifikation.');
    END;
  `)
  db.exec(`
    CREATE TRIGGER trg_immutable_source_reference
    BEFORE UPDATE ON journal_entries
    WHEN OLD.status = 'booked' AND
         COALESCE(NEW.source_reference, '') != COALESCE(OLD.source_reference, '')
    BEGIN
        SELECT RAISE(ABORT, 'source_reference kan inte ändras på bokförd verifikation.');
    END;
  `)
  db.exec(`
    CREATE TRIGGER trg_immutable_corrects_entry_id
    BEFORE UPDATE ON journal_entries
    WHEN OLD.status = 'booked' AND
         COALESCE(NEW.corrects_entry_id, 0) != COALESCE(OLD.corrects_entry_id, 0)
    BEGIN
        SELECT RAISE(ABORT, 'corrects_entry_id kan inte ändras på bokförd verifikation.');
    END;
  `)
  db.exec(`
    CREATE TRIGGER trg_no_correct_with_payments
    BEFORE UPDATE ON journal_entries
    WHEN OLD.status = 'booked' AND NEW.status = 'corrected'
    BEGIN
        SELECT CASE
            WHEN EXISTS (SELECT 1 FROM invoice_payments WHERE journal_entry_id = OLD.id)
              OR EXISTS (SELECT 1 FROM expense_payments WHERE journal_entry_id = OLD.id)
              OR EXISTS (SELECT 1 FROM invoices i JOIN invoice_payments ip ON ip.invoice_id = i.id WHERE i.journal_entry_id = OLD.id)
              OR EXISTS (SELECT 1 FROM expenses e JOIN expense_payments ep ON ep.expense_id = e.id WHERE e.journal_entry_id = OLD.id)
            THEN RAISE(ABORT, 'Kan inte korrigera verifikat med beroende betalningar.')
        END;
    END;
  `)

  migration038Verify(db)
}

function migration038Verify(db: import('better-sqlite3').Database): void {
  // 1. fixed_assets + depreciation_schedules exist
  const fixedAssets = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='fixed_assets'")
    .get()
  if (!fixedAssets) throw new Error('Migration 038 failed: fixed_assets saknas')

  const depSchedules = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='depreciation_schedules'")
    .get()
  if (!depSchedules) throw new Error('Migration 038 failed: depreciation_schedules saknas')

  // 2. journal_entries has verification_series CHECK
  const jeSchema = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='journal_entries'")
    .get() as { sql: string }
  if (!jeSchema.sql.includes("verification_series IN")) {
    throw new Error('Migration 038 failed: verification_series CHECK saknas')
  }

  // 3. All 11 journal_entries-related triggers recreated (7 original + 4 från mig 031)
  const expectedTriggers = [
    'trg_immutable_booked_entry_update',
    'trg_immutable_booked_entry_delete',
    'trg_immutable_booked_line_update',
    'trg_immutable_booked_line_delete',
    'trg_immutable_booked_line_insert',
    'trg_check_balance_on_booking',
    'trg_check_period_on_booking',
    'trg_immutable_source_type',
    'trg_immutable_source_reference',
    'trg_immutable_corrects_entry_id',
    'trg_no_correct_with_payments',
  ]
  for (const t of expectedTriggers) {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name=?")
      .get(t)
    if (!exists) throw new Error(`Migration 038 failed: trigger ${t} saknas`)
  }

  // 4. All 4 journal_entries indexes recreated
  const expectedIndexes = [
    'idx_je_date',
    'idx_je_fiscal_year',
    'idx_je_status',
    'idx_journal_entries_verify_series_unique',
  ]
  for (const idx of expectedIndexes) {
    const exists = db
      .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name=?")
      .get(idx)
    if (!exists) throw new Error(`Migration 038 failed: index ${idx} saknas`)
  }
}
