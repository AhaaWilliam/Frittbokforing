# SESSION 2: Databasschema (AB K2/K3) — Plan & Prompt

## Målgrupp

**Svenska aktiebolag som tillämpar K2 eller K3.** Inte enskild firma. Schemat ska stödja:
- Årsredovisning (balansräkning, resultaträkning, noter, förvaltningsberättelse)
- Bundet och fritt eget kapital (aktiekapital, överkursfond, balanserat resultat)
- Obeskattade reserver (periodiseringsfonder, ackumulerade överavskrivningar)
- Bolagsskatt (20,6%)
- Löner, arbetsgivaravgifter, källskatt
- Planmässiga avskrivningar (K2: linjär, K3: komponent)
- Bokslutsdispositioner

## Vad vi bygger

13 tabeller (samma antal som EF-versionen — vi utökar befintliga tabeller istället för att lägga till nya). Tabeller för avskrivningar, årsredovisning och skatteberäkning kommer i senare sessioner. Session 2 lägger bara grunden — kontoplan, triggers och basstruktur.

---

## Vad du ska se när det är klart

```
npm run dev
→ Electron-fönster öppnas
→ "Databasen är ansluten ✓"
→ Schemaversion: 3 (tre migrationer körda)
→ 13 tabeller

npm test
→ Alla session 1-tester gröna
→ PLUS 29 nya tester (alla gröna)

npm run lint
→ 0 errors
```

---

## Tabellöversikt (13 tabeller)

```
companies                    ← Företagsinfo (1 rad) — utökad med AB-fält
users                        ← Användare (1 rad i fas 1)
accounts                     ← BAS-kontoplan (~95 konton, K2/K3-märkta)
fiscal_years                 ← Räkenskapsår (med annual_report_status)
accounting_periods           ← Perioder (12 månader + bokslutsperiod 13)
verification_sequences       ← Gaplös numrering per serie+år
journal_entries              ← Verifikationer (HJÄRTAT)
journal_entry_lines          ← Debet/kredit-rader
counterparties               ← Kunder och leverantörer
invoices                     ← Kund- och leverantörsfakturor
invoice_payments             ← Betalningskopplingar
vat_codes                    ← Momskoder (7 st)
opening_balances             ← Ingående balanser
```

---

## Migreringsstruktur

| Migration | user_version | Innehåll |
|-----------|-------------|----------|
| 001 | 1 | Alla 13 tabeller + CHECK constraints + indexes |
| 002 | 2 | 8 SQLite-triggers (immutabilitet, fakturaskydd, balansvalidering) |
| 003 | 3 | Seed: ~95 BAS-konton (K2/K3-anpassade) + 7 momskoder |

Migrationer inbäddade i TypeScript (inte externa .sql-filer). Varje migration i BEGIN EXCLUSIVE transaktion.

---

## Detaljerad tabellspec

### 1. companies — UTÖKAD FÖR AB

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
    -- AB-specifikt
    share_capital INTEGER,
    registration_date TEXT,
    board_members TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (legal_form IN ('ab', 'enskild_firma', 'hb', 'kb')),
    CHECK (fiscal_rule IN ('K2', 'K3'))
);
```

**Nya fält:**
- `fiscal_rule` — avgör vilka redovisningsregler som gäller (K2 vs K3). Påverkar avskrivningsmetod (K2: enbart linjär, K3: komponentavskrivning) och årsredovisningens utformning.
- `share_capital` — aktiekapital i ören (minst 25 000 kr = 2 500 000 ören)
- `registration_date` — registreringsdatum hos Bolagsverket
- `board_members` — JSON-sträng med styrelsemedlemmar (för förvaltningsberättelse)

### 2. users (oförändrad)

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 3. accounts — UTÖKAD KONTOPLAN

```sql
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_number TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    vat_code TEXT,
    sru_code TEXT,
    -- K2/K3-metadata
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
```

**Nya fält:**
- `k2_allowed` — om kontot får användas under K2 (0 = nej, t.ex. immateriella tillgångar)
- `k3_only` — om kontot bara finns i K3 (t.ex. uppskjuten skatt)
- `is_system_account` — konton som bara bokförs via systemet (t.ex. 8999 Årets resultat)

### 4. fiscal_years — UTÖKAD

```sql
CREATE TABLE fiscal_years (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    year_label TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    is_closed INTEGER NOT NULL DEFAULT 0,
    closed_at TEXT,
    -- AB-specifikt
    annual_report_status TEXT NOT NULL DEFAULT 'not_started',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    CHECK (end_date > start_date),
    CHECK (is_closed IN (0, 1)),
    CHECK (annual_report_status IN ('not_started', 'draft', 'preliminary', 'final', 'submitted')),
    UNIQUE (company_id, year_label)
);
```

**Nytt fält:**
- `annual_report_status` — spårar årsredovisningens status (obligatorisk för AB)

### 5. accounting_periods (oförändrad)

```sql
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
```

### 6. verification_sequences (oförändrad)

```sql
CREATE TABLE verification_sequences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
    series TEXT NOT NULL DEFAULT 'A',
    last_number INTEGER NOT NULL DEFAULT 0,
    UNIQUE (fiscal_year_id, series)
);
```

### 7. journal_entries (oförändrad)

```sql
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
```

**Ändring:** `source_type` utökas med `'auto_salary'`, `'auto_depreciation'`, `'auto_tax'` för automatiserade AB-bokföringar.

### 8. journal_entry_lines (oförändrad)

```sql
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
```

### 9. counterparties (oförändrad)

```sql
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
```

### 10. invoices (oförändrad)

```sql
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
```

### 11. invoice_payments (oförändrad)

```sql
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
```

### 12. vat_codes — UTÖKAD med report_box

```sql
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
```

**Nytt fält:**
- `report_box` — Skatteverkets rutanummer i momsdeklarationen (SKV 4700). T.ex. '05' (momspliktig försäljning), '10' (momspliktiga inköp), '48' (ingående moms att dra av). Gör att momsrapporten kan genereras utan hårdkodad logik per konto.

### 13. opening_balances (oförändrad)

```sql
CREATE TABLE opening_balances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
    account_number TEXT NOT NULL REFERENCES accounts(account_number),
    balance INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (fiscal_year_id, account_number)
);
```

---

## SQLite-triggers (Migration 002) — 7 st

### Immutabilitet — journal_entries (2 triggers)

```sql
-- 1. Blockera UPDATE på bokförda verifikationer
--    Tillåter BARA ändring av status→'corrected' och corrected_by_id.
--    Alla andra fält (belopp, datum, beskrivning) förblir helt orörda.
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
```

### Immutabilitet — journal_entry_lines (3 triggers)

```sql
-- 3. Blockera UPDATE
CREATE TRIGGER trg_immutable_booked_line_update
BEFORE UPDATE ON journal_entry_lines
WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
BEGIN
    SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte ändras.');
END;

-- 4. Blockera DELETE
CREATE TRIGGER trg_immutable_booked_line_delete
BEFORE DELETE ON journal_entry_lines
WHEN (SELECT status FROM journal_entries WHERE id = OLD.journal_entry_id) = 'booked'
BEGIN
    SELECT RAISE(ABORT, 'Rader på bokförd verifikation kan inte raderas.');
END;

-- 5. Blockera INSERT
CREATE TRIGGER trg_immutable_booked_line_insert
BEFORE INSERT ON journal_entry_lines
WHEN (SELECT status FROM journal_entries WHERE id = NEW.journal_entry_id) = 'booked'
BEGIN
    SELECT RAISE(ABORT, 'Kan inte lägga till rader på bokförd verifikation.');
END;
```

### Fakturaskydd (1 trigger)

```sql
-- 6. Blockera DELETE på icke-draft-fakturor
CREATE TRIGGER trg_prevent_invoice_delete
BEFORE DELETE ON invoices
WHEN OLD.status != 'draft'
BEGIN
    SELECT RAISE(ABORT, 'Faktura som inte är utkast kan inte raderas. Makulera istället.');
END;
```

### Balansvalidering vid bokning (1 trigger)

```sql
-- 7. Kontrollera debet = kredit vid bokning
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
```

### Periodvalidering vid bokning (1 trigger)

```sql
-- 8. Kontrollera att journal_date ligger inom ett öppet räkenskapsår
--    och att eventuell matchande period inte är stängd.
--    Förhindrar bokning i stängt år, stängd period, eller utanför räkenskapsårets datumintervall.
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
```

### OBS: Tidszoner

`datetime('now')` sparar UTC. All TypeScript-kod som visar datum för användaren måste konvertera UTC → lokal svensk tid. `journal_date` ska alltid sättas explicit av applikationen.

---

## Seed data (Migration 003) — BAS-kontoplan för AB K2/K3

### ~95 BAS-konton

Märkningen `k2_allowed=0` betyder att kontot inte får användas under K2. `k3_only=1` betyder att kontot bara finns i K3. `is_system_account=1` betyder att kontot bara bokförs automatiskt.

#### Klass 1 — Tillgångar (asset)

| Konto | Namn | K2 | K3 only | System |
|-------|------|-----|---------|--------|
| 1010 | Balanserade utgifter utveckling | 0 | 1 | 0 |
| 1019 | Ack avskrivningar balanserade utgifter | 0 | 1 | 0 |
| 1110 | Byggnader | 1 | 0 | 0 |
| 1119 | Ack avskrivningar byggnader | 1 | 0 | 1 |
| 1210 | Maskiner och inventarier | 1 | 0 | 0 |
| 1219 | Ack avskrivningar maskiner | 1 | 0 | 1 |
| 1220 | Inventarier och verktyg | 1 | 0 | 0 |
| 1229 | Ack avskrivningar inventarier | 1 | 0 | 1 |
| 1250 | Datorer | 1 | 0 | 0 |
| 1259 | Ack avskrivningar datorer | 1 | 0 | 1 |
| 1310 | Andelar i koncernföretag | 1 | 0 | 0 |
| 1380 | Andra långfristiga fordringar | 1 | 0 | 0 |
| 1510 | Kundfordringar | 1 | 0 | 0 |
| 1610 | Fordran på anställda | 1 | 0 | 0 |
| 1630 | Skattekonto (fordran) | 1 | 0 | 0 |
| 1710 | Förutbetalda försäkringspremier | 1 | 0 | 0 |
| 1790 | Övriga förutbetalda kostnader | 1 | 0 | 0 |
| 1910 | Kassa | 1 | 0 | 0 |
| 1920 | PlusGiro | 1 | 0 | 0 |
| 1930 | Företagskonto | 1 | 0 | 0 |
| 1940 | Placeringskonto | 1 | 0 | 0 |
| 2640 | Ingående moms | 1 | 0 | 0 |

#### Klass 2 — Skulder och eget kapital

**Eget kapital (equity):**

| Konto | Namn | K2 | K3 only | System |
|-------|------|-----|---------|--------|
| 2081 | Aktiekapital | 1 | 0 | 0 |
| 2085 | Överkursfond | 1 | 0 | 0 |
| 2086 | Reservfond | 1 | 0 | 0 |
| 2090 | Fritt eget kapital | 1 | 0 | 0 |
| 2091 | Balanserat resultat | 1 | 0 | 0 |
| 2098 | Vinst eller förlust föregående år | 1 | 0 | 1 |
| 2099 | Årets resultat | 1 | 0 | 1 |

**Obeskattade reserver (liability):**

| Konto | Namn | K2 | K3 only | System |
|-------|------|-----|---------|--------|
| 2110 | Periodiseringsfond vid taxering 2020 | 1 | 0 | 0 |
| 2120 | Periodiseringsfond vid taxering 2021 | 1 | 0 | 0 |
| 2123 | Periodiseringsfond vid taxering 2024 | 1 | 0 | 0 |
| 2124 | Periodiseringsfond vid taxering 2025 | 1 | 0 | 0 |
| 2125 | Periodiseringsfond vid taxering 2026 | 1 | 0 | 0 |
| 2150 | Ackumulerade överavskrivningar | 1 | 0 | 0 |

**Skulder (liability):**

| Konto | Namn | K2 | K3 only | System |
|-------|------|-----|---------|--------|
| 2220 | Avsättning för uppskjuten skatt | 0 | 1 | 1 |
| 2440 | Leverantörsskulder | 1 | 0 | 0 |
| 2510 | Skatteskuld bolagsskatt | 1 | 0 | 0 |
| 2610 | Utgående moms 25% | 1 | 0 | 0 |
| 2620 | Utgående moms 12% | 1 | 0 | 0 |
| 2630 | Utgående moms 6% | 1 | 0 | 0 |
| 2650 | Momsredovisning | 1 | 0 | 0 |
| 2710 | Personalskatt (källskatt) | 1 | 0 | 0 |
| 2730 | Arbetsgivaravgifter | 1 | 0 | 0 |
| 2731 | Avräkning lagstadgade sociala avgifter | 1 | 0 | 0 |
| 2820 | Kortfristiga skulder till kreditinstitut | 1 | 0 | 0 |
| 2890 | Övriga kortfristiga skulder | 1 | 0 | 0 |
| 2910 | Upplupna löner | 1 | 0 | 0 |
| 2920 | Upplupna semesterlöner | 1 | 0 | 0 |
| 2940 | Upplupna lagstadgade sociala avgifter | 1 | 0 | 0 |
| 2990 | Övriga upplupna kostnader | 1 | 0 | 0 |

#### Klass 3 — Intäkter (revenue)

| Konto | Namn |
|-------|------|
| 3001 | Försäljning varor 25% |
| 3002 | Försäljning tjänster 25% |
| 3003 | Försäljning varor 12% |
| 3004 | Försäljning tjänster 6% |
| 3540 | Fakturerade kostnader |
| 3590 | Övriga fakturerade kostnader |
| 3740 | Öresutjämning |
| 3960 | Valutakursvinster |

#### Klass 4 — Material och varor (expense)

| Konto | Namn |
|-------|------|
| 4010 | Inköp varor och material |
| 4990 | Övriga externa kostnader |

#### Klass 5 — Övriga externa kostnader (expense)

| Konto | Namn |
|-------|------|
| 5010 | Lokalhyra |
| 5020 | El, värme, vatten |
| 5090 | Övriga lokalkostnader |
| 5210 | Telekommunikation |
| 5400 | Förbrukningsinventarier |
| 5410 | Förbrukningsinventarier och material |
| 5460 | Förbrukningsmaterial |
| 5500 | Reparation och underhåll |
| 5610 | Resekostnader |
| 5800 | Resekostnader (traktamente) |
| 5910 | Annonsering |

#### Klass 6 — Övriga externa kostnader (expense)

| Konto | Namn |
|-------|------|
| 6071 | Representation avdragsgill |
| 6110 | Kontorsmateriel |
| 6210 | Telekommunikation |
| 6230 | Datakommunikation |
| 6530 | Redovisningstjänster |
| 6540 | IT-tjänster |
| 6550 | Konsultarvoden |
| 6570 | Bankkostnader |
| 6590 | Övriga externa tjänster |

#### Klass 7 — Personal (expense) — KRAFTIGT UTÖKAD

| Konto | Namn |
|-------|------|
| 7010 | Löner till tjänstemän |
| 7082 | Sjuklöner |
| 7090 | Förändring semesterlöneskuld |
| 7210 | Löner till kollektivanställda |
| 7310 | Kontanta extraersättningar |
| 7410 | Pensionsförsäkringspremier |
| 7510 | Arbetsgivaravgifter |
| 7519 | Sociala avgifter semester |
| 7530 | Särskild löneskatt |
| 7570 | Premier för arbetsmarknadsförsäkringar |
| 7610 | Utbildning |
| 7631 | Personalrepresentation avdragsgill |
| 7690 | Övriga personalkostnader |
| 7960 | Valutakursförluster |

#### Klass 8 — Finansiellt och bokslut (revenue/expense) — KRAFTIGT UTÖKAD

| Konto | Namn | Typ |
|-------|------|-----|
| 7832 | Avskrivningar maskiner och inventarier | expense |
| 7833 | Avskrivningar datorer | expense |
| 7834 | Avskrivningar bilar | expense |
| 8310 | Ränteintäkter | revenue |
| 8410 | Räntekostnader | expense |
| 8810 | Förändring periodiseringsfond | expense |
| 8850 | Förändring överavskrivningar | expense |
| 8910 | Bolagsskatt | expense |
| 8999 | Årets resultat | expense |

**Totalt: ~95 konton** (kan justeras ±5 beroende på exakt urval).

### Momskoder — 7 st (med SKV report_box)

| Kod | Beskrivning | Sats | Typ | Momskonto | SKV-ruta |
|-----|-------------|------|-----|-----------|----------|
| MP1 | Utgående moms 25% | 25.00 | outgoing | 2610 | 10 |
| MP2 | Utgående moms 12% | 12.00 | outgoing | 2620 | 11 |
| MP3 | Utgående moms 6% | 6.00 | outgoing | 2630 | 12 |
| MF | Momsfri försäljning | 0.00 | exempt | — | 42 |
| IP1 | Ingående moms 25% | 25.00 | incoming | 2640 | 48 |
| IP2 | Ingående moms 12% | 12.00 | incoming | 2640 | 48 |
| IP3 | Ingående moms 6% | 6.00 | incoming | 2640 | 48 |

---

## Tester (28 stycken)

Alla tester använder fräsch in-memory-databas (:memory:) med alla migrationer körda.

### Struktur (6 tester)
1. Alla 13 tabeller existerar
2. BAS-konton: minst 85 rader i accounts
3. Momskoder: exakt 7 rader i vat_codes
4. PRAGMA user_version = 3
5. PRAGMA foreign_keys = ON
6. PRAGMA journal_mode = wal

### CHECK constraints (6 tester)
7. INSERT journal_entry_lines med debit_amount = -100 → error
8. INSERT journal_entry_lines med credit_amount = -100 → error
9. INSERT journal_entry_lines med debit=100 AND credit=100 → error
10. INSERT journal_entry_lines med debit=0 AND credit=0 → error
11. INSERT journal_entries med status='invalid' → error
12. INSERT invoices med net_amount = -100 → error

### Triggers (13 tester)
13. UPDATE bokförd entry — ändra description med status='corrected' → error (bara status+corrected_by_id får ändras)
14. UPDATE bokförd entry — ändra BARA status till 'corrected' → OK
15. DELETE bokförd entry → error
16. UPDATE rad på bokförd entry → error
17. DELETE rad på bokförd entry → error
18. INSERT rad på bokförd entry → error
19. DELETE faktura med status='unpaid' → error
20. DELETE faktura med status='draft' → OK
21. Bokför obalanserad verifikation (debet ≠ kredit) → error
22. Bokför verifikation med bara 1 rad → error
23. Bokför i stängt räkenskapsår (fiscal_years.is_closed=1) → error
24. Bokför i stängd period (accounting_periods.is_closed=1) → error
25. Bokför med journal_date utanför räkenskapsårets datumintervall → error

### Foreign keys (3 tester)
26. INSERT journal_entry_lines med ogiltigt journal_entry_id → error
27. INSERT journal_entry_lines med ogiltigt account_number → error
28. INSERT invoices med ogiltigt counterparty_id → error

### Integritet (1 test)
29. Skapa draft-entry → lägg till rader → verifiera att transaktioner fungerar korrekt

---

## VIKTIGT: Risker vid exekvering i Claude Code

**Trunkeringsrisk:** Denna prompt kräver att Claude Code genererar mycket kod (~95 konton, 8 triggers, 29 tester). Om Claude Code genvägar med kommentarer som `// ... add remaining accounts here` — avbryt INTE sessionen. Ge istället en uppföljningsprompt: "Du trunkerade seed-datan. Skriv ut hela Migration 003 med alla ~95 konton utan att hoppa över något."

**PRAGMA foreign_keys = ON:** SQLite har foreign keys AVSTÄNGDA som default. db.ts MÅSTE köra `PRAGMA foreign_keys = ON` varje gång databasen öppnas — annars fungerar inga relationscheck tyst. Test #5 verifierar detta, men det är en kritisk kodrad.

**Immutabilitetsbeslut:** Trigger 1 tillåter UPDATE av en bokförd verifikation, men BARA för fälten `status` (till 'corrected') och `corrected_by_id`. Alla andra fält (datum, beskrivning, belopp, kontonummer) förblir helt orörda. Om någon försöker ändra t.ex. description samtidigt → ABORT. Denna design ger spårbarhet (vi kan se att verifikation X har rättats) utan att bryta dataintegritet.

---

## PROMPT FÖR CLAUDE CODE

Kopiera allt nedan och klistra in i Claude Code:

---

Jag bygger "Fritt Bokföring" — en lokal desktop-bokföringsapp med Electron + React + SQLite. Målgrupp: svenska aktiebolag med K2 och K3. Session 1 (projektsetup) är klar. Nu: Session 2 — Databasschema.

Läs CLAUDE.md först. Följ alla principer.

## Uppgift

Skapa det kompletta databasschemat med tre migrationer (inbäddade i TypeScript), SQLite-triggers och seed data. Uppdatera IPC, UI och tester.

## Migration 001: 13 Tabeller

Alla belopp i ören (INTEGER). Tidsstämplar som TEXT (ISO 8601). Booleans som INTEGER (0/1). Alla tabeller har INTEGER PRIMARY KEY AUTOINCREMENT.

Skapa tabellerna i denna ordning (foreign key-beroenden):

1. **companies** — org_number TEXT NOT NULL, name TEXT NOT NULL, legal_form TEXT NOT NULL DEFAULT 'ab' CHECK IN ('ab','enskild_firma','hb','kb'), fiscal_rule TEXT NOT NULL DEFAULT 'K2' CHECK IN ('K2','K3'), address_line1/line2/postal_code/city TEXT, country TEXT DEFAULT 'SE', base_currency TEXT DEFAULT 'SEK', share_capital INTEGER, registration_date TEXT, board_members TEXT, created_at

2. **users** — name TEXT NOT NULL, email TEXT, created_at

3. **accounts** — account_number TEXT NOT NULL UNIQUE, name TEXT NOT NULL, account_type TEXT CHECK IN ('asset','liability','equity','revenue','expense'), is_active INTEGER DEFAULT 1, vat_code TEXT, sru_code TEXT, k2_allowed INTEGER DEFAULT 1, k3_only INTEGER DEFAULT 0, is_system_account INTEGER DEFAULT 0, created_at. INDEX på account_number och account_type.

4. **fiscal_years** — company_id REFERENCES companies, year_label TEXT, start_date TEXT, end_date TEXT CHECK > start_date, is_closed INTEGER DEFAULT 0, closed_at TEXT, annual_report_status TEXT DEFAULT 'not_started' CHECK IN ('not_started','draft','preliminary','final','submitted'), created_at. UNIQUE(company_id, year_label).

5. **accounting_periods** — company_id REFERENCES companies, fiscal_year_id REFERENCES fiscal_years, period_number INTEGER CHECK BETWEEN 1 AND 13, start_date, end_date, is_closed INTEGER DEFAULT 0, closed_at, created_at. UNIQUE(fiscal_year_id, period_number). INDEX.

6. **verification_sequences** — fiscal_year_id REFERENCES fiscal_years, series TEXT DEFAULT 'A', last_number INTEGER DEFAULT 0. UNIQUE(fiscal_year_id, series).

7. **journal_entries** — company_id REFERENCES companies, fiscal_year_id REFERENCES fiscal_years, verification_number INTEGER (nullable), verification_series TEXT DEFAULT 'A', journal_date TEXT NOT NULL, registration_date TEXT DEFAULT datetime('now'), description TEXT NOT NULL, status TEXT DEFAULT 'draft' CHECK IN ('draft','booked','corrected'), locked_at, created_by REFERENCES users, source_type TEXT DEFAULT 'manual' CHECK IN ('manual','auto_invoice','auto_payment','auto_expense','auto_salary','auto_depreciation','auto_tax','import'), source_reference, corrects_entry_id REFERENCES journal_entries, corrected_by_id REFERENCES journal_entries, version INTEGER DEFAULT 1, created_at. UNIQUE(verification_series, verification_number, fiscal_year_id). INDEX.

8. **journal_entry_lines** — journal_entry_id REFERENCES journal_entries, line_number INTEGER, account_number TEXT REFERENCES accounts(account_number), debit_amount INTEGER DEFAULT 0 CHECK >= 0, credit_amount INTEGER DEFAULT 0 CHECK >= 0, CHECK NOT(debit > 0 AND credit > 0), CHECK (debit > 0 OR credit > 0), description, vat_code, vat_amount INTEGER DEFAULT 0, created_at. UNIQUE(journal_entry_id, line_number). INDEX.

9. **counterparties** — type TEXT CHECK IN ('customer','supplier','both'), name TEXT NOT NULL, org_number, email, phone, address_line1, postal_code, city, country DEFAULT 'SE', default_revenue_account, default_expense_account, payment_terms_days INTEGER DEFAULT 30, is_active INTEGER DEFAULT 1, created_at.

10. **invoices** — counterparty_id REFERENCES counterparties, invoice_type TEXT CHECK IN ('customer_invoice','supplier_invoice','credit_note'), invoice_number TEXT, invoice_date, due_date, net_amount INTEGER CHECK >= 0, vat_amount INTEGER DEFAULT 0 CHECK >= 0, total_amount INTEGER CHECK >= 0, currency TEXT DEFAULT 'SEK', status TEXT DEFAULT 'draft' CHECK IN ('draft','unpaid','partial','paid','overdue','void'), paid_amount INTEGER DEFAULT 0 CHECK >= 0, journal_entry_id REFERENCES journal_entries, ocr_number, notes, version INTEGER DEFAULT 1, created_at, updated_at. INDEX.

11. **invoice_payments** — invoice_id REFERENCES invoices, journal_entry_id REFERENCES journal_entries, payment_date TEXT, amount INTEGER CHECK > 0, created_at. INDEX.

12. **vat_codes** — code TEXT UNIQUE, description TEXT, rate_percent REAL CHECK BETWEEN 0 AND 100, vat_type TEXT CHECK IN ('outgoing','incoming','exempt'), sales_account, purchase_account, vat_account, report_box TEXT (SKV momsdeklarationsruta t.ex. '10','48'), is_active INTEGER DEFAULT 1.

13. **opening_balances** — fiscal_year_id REFERENCES fiscal_years, account_number TEXT REFERENCES accounts(account_number), balance INTEGER NOT NULL, created_at. UNIQUE(fiscal_year_id, account_number).

## Migration 002: 8 Triggers

Felmeddelanden på svenska:

1. **trg_immutable_booked_entry_update** — BEFORE UPDATE ON journal_entries WHEN OLD.status='booked'. Tillåt BARA ändring av status (till 'booked' eller 'corrected') och corrected_by_id. Om NÅGOT annat fält ändras (journal_date, description, verification_number, verification_series, company_id, fiscal_year_id) → RAISE ABORT. Två separata SELECT CASE-kontroller.
2. **trg_immutable_booked_entry_delete** — BEFORE DELETE ON journal_entries WHEN OLD.status='booked' → RAISE ABORT
3. **trg_immutable_booked_line_update** — BEFORE UPDATE ON journal_entry_lines WHEN parent status='booked' → RAISE ABORT
4. **trg_immutable_booked_line_delete** — BEFORE DELETE → RAISE ABORT
5. **trg_immutable_booked_line_insert** — BEFORE INSERT → RAISE ABORT
6. **trg_prevent_invoice_delete** — BEFORE DELETE ON invoices WHEN OLD.status!='draft' → RAISE ABORT
7. **trg_check_balance_on_booking** — BEFORE UPDATE ON journal_entries WHEN NEW.status='booked' AND OLD.status='draft' → Kontrollera att COALESCE(SUM(debit_amount),0) - COALESCE(SUM(credit_amount),0) = 0 i journal_entry_lines för NEW.id. Använd COALESCE för NULL-säkerhet. Kontrollera även att det finns minst 2 rader.
8. **trg_check_period_on_booking** — BEFORE UPDATE ON journal_entries WHEN NEW.status='booked' AND OLD.status='draft' → Tre kontroller: (1) fiscal_years.is_closed=0 för NEW.fiscal_year_id, (2) journal_date ligger INOM räkenskapsårets start_date och end_date (NOT EXISTS → RAISE ABORT 'Bokföringsdatum ligger utanför räkenskapsårets period.'), (3) om det finns en matchande accounting_period (journal_date BETWEEN start_date AND end_date) så är den inte stängd. Tre separata SELECT CASE-kontroller.

**OBS: Tidszoner** — Dokumentera i koden att `journal_date` alltid sätts explicit av applikationen (datetime('now') = UTC).

## Migration 003: Seed data

### BAS-konton (~95 st, för AB K2/K3)

INSERT alla konton med account_number, name, account_type, k2_allowed, k3_only, is_system_account. Komplett lista:

Klass 1 — Tillgångar (asset):
('1010','Balanserade utgifter utveckling','asset',0,1,0), ('1019','Ack avskrivningar balanserade utgifter','asset',0,1,0), ('1110','Byggnader','asset',1,0,0), ('1119','Ack avskrivningar byggnader','asset',1,0,1), ('1210','Maskiner och inventarier','asset',1,0,0), ('1219','Ack avskrivningar maskiner','asset',1,0,1), ('1220','Inventarier och verktyg','asset',1,0,0), ('1229','Ack avskrivningar inventarier','asset',1,0,1), ('1250','Datorer','asset',1,0,0), ('1259','Ack avskrivningar datorer','asset',1,0,1), ('1310','Andelar i koncernföretag','asset',1,0,0), ('1380','Andra långfristiga fordringar','asset',1,0,0), ('1510','Kundfordringar','asset',1,0,0), ('1610','Fordran på anställda','asset',1,0,0), ('1630','Skattekonto','asset',1,0,0), ('1710','Förutbetalda försäkringspremier','asset',1,0,0), ('1790','Övriga förutbetalda kostnader','asset',1,0,0), ('1910','Kassa','asset',1,0,0), ('1920','PlusGiro','asset',1,0,0), ('1930','Företagskonto','asset',1,0,0), ('1940','Placeringskonto','asset',1,0,0), ('2640','Ingående moms','asset',1,0,0)

Klass 2 — Eget kapital (equity):
('2081','Aktiekapital','equity',1,0,0), ('2085','Överkursfond','equity',1,0,0), ('2086','Reservfond','equity',1,0,0), ('2090','Fritt eget kapital','equity',1,0,0), ('2091','Balanserat resultat','equity',1,0,0), ('2098','Vinst eller förlust föregående år','equity',1,0,1), ('2099','Årets resultat','equity',1,0,1)

Klass 2 — Obeskattade reserver (liability):
('2110','Periodiseringsfond tax 2020','liability',1,0,0), ('2120','Periodiseringsfond tax 2021','liability',1,0,0), ('2123','Periodiseringsfond tax 2024','liability',1,0,0), ('2124','Periodiseringsfond tax 2025','liability',1,0,0), ('2125','Periodiseringsfond tax 2026','liability',1,0,0), ('2150','Ackumulerade överavskrivningar','liability',1,0,0)

Klass 2 — Skulder (liability):
('2220','Avsättning uppskjuten skatt','liability',0,1,1), ('2440','Leverantörsskulder','liability',1,0,0), ('2510','Skatteskuld bolagsskatt','liability',1,0,0), ('2610','Utgående moms 25%','liability',1,0,0), ('2620','Utgående moms 12%','liability',1,0,0), ('2630','Utgående moms 6%','liability',1,0,0), ('2650','Momsredovisning','liability',1,0,0), ('2710','Personalskatt','liability',1,0,0), ('2730','Arbetsgivaravgifter','liability',1,0,0), ('2731','Avräkning sociala avgifter','liability',1,0,0), ('2820','Kortfristiga skulder kreditinstitut','liability',1,0,0), ('2890','Övriga kortfristiga skulder','liability',1,0,0), ('2910','Upplupna löner','liability',1,0,0), ('2920','Upplupna semesterlöner','liability',1,0,0), ('2940','Upplupna sociala avgifter','liability',1,0,0), ('2990','Övriga upplupna kostnader','liability',1,0,0)

Klass 3 — Intäkter (revenue):
('3001','Försäljning varor 25%','revenue',1,0,0), ('3002','Försäljning tjänster 25%','revenue',1,0,0), ('3003','Försäljning varor 12%','revenue',1,0,0), ('3004','Försäljning tjänster 6%','revenue',1,0,0), ('3540','Fakturerade kostnader','revenue',1,0,0), ('3590','Övriga fakturerade kostnader','revenue',1,0,0), ('3740','Öresutjämning','revenue',1,0,0), ('3960','Valutakursvinster','revenue',1,0,0)

Klass 4 — Material (expense):
('4010','Inköp varor och material','expense',1,0,0), ('4990','Övriga kostnader','expense',1,0,0)

Klass 5 — Externa kostnader (expense):
('5010','Lokalhyra','expense',1,0,0), ('5020','El värme vatten','expense',1,0,0), ('5090','Övriga lokalkostnader','expense',1,0,0), ('5210','Telekommunikation','expense',1,0,0), ('5400','Förbrukningsinventarier','expense',1,0,0), ('5410','Förbrukningsinventarier och material','expense',1,0,0), ('5460','Förbrukningsmaterial','expense',1,0,0), ('5500','Reparation och underhåll','expense',1,0,0), ('5610','Resekostnader','expense',1,0,0), ('5800','Traktamente','expense',1,0,0), ('5910','Annonsering','expense',1,0,0)

Klass 6 — Externa tjänster (expense):
('6071','Representation avdragsgill','expense',1,0,0), ('6110','Kontorsmateriel','expense',1,0,0), ('6210','Telekommunikation','expense',1,0,0), ('6230','Datakommunikation','expense',1,0,0), ('6530','Redovisningstjänster','expense',1,0,0), ('6540','IT-tjänster','expense',1,0,0), ('6550','Konsultarvoden','expense',1,0,0), ('6570','Bankkostnader','expense',1,0,0), ('6590','Övriga externa tjänster','expense',1,0,0)

Klass 7 — Personal (expense):
('7010','Löner tjänstemän','expense',1,0,0), ('7082','Sjuklöner','expense',1,0,0), ('7090','Förändring semesterlöneskuld','expense',1,0,0), ('7210','Löner kollektivanställda','expense',1,0,0), ('7310','Kontanta extraersättningar','expense',1,0,0), ('7410','Pensionsförsäkringspremier','expense',1,0,0), ('7510','Arbetsgivaravgifter','expense',1,0,0), ('7519','Sociala avgifter semester','expense',1,0,0), ('7530','Särskild löneskatt','expense',1,0,0), ('7570','Arbetsmarknadsförsäkringar','expense',1,0,0), ('7610','Utbildning','expense',1,0,0), ('7631','Personalrepresentation avdragsgill','expense',1,0,0), ('7690','Övriga personalkostnader','expense',1,0,0), ('7832','Avskrivningar maskiner inventarier','expense',1,0,0), ('7833','Avskrivningar datorer','expense',1,0,0), ('7834','Avskrivningar bilar','expense',1,0,0), ('7960','Valutakursförluster','expense',1,0,0)

Klass 8 — Finansiellt och bokslut:
('8310','Ränteintäkter','revenue',1,0,0), ('8410','Räntekostnader','expense',1,0,0), ('8810','Förändring periodiseringsfond','expense',1,0,0), ('8850','Förändring överavskrivningar','expense',1,0,0), ('8910','Bolagsskatt','expense',1,0,0), ('8999','Årets resultat','expense',1,0,1)

### Momskoder (7 st, med report_box för SKV momsdeklaration)
INSERT INTO vat_codes (code, description, rate_percent, vat_type, sales_account, vat_account, report_box) VALUES
('MP1','Utgående moms 25%',25.00,'outgoing','3001','2610','10'),
('MP2','Utgående moms 12%',12.00,'outgoing','3003','2620','11'),
('MP3','Utgående moms 6%',6.00,'outgoing','3004','2630','12'),
('MF','Momsfri försäljning',0.00,'exempt',NULL,NULL,'42'),
('IP1','Ingående moms 25%',25.00,'incoming',NULL,'2640','48'),
('IP2','Ingående moms 12%',12.00,'incoming',NULL,'2640','48'),
('IP3','Ingående moms 6%',6.00,'incoming',NULL,'2640','48');

## Uppdatera befintlig kod

### db.ts — Migreringslogik
Inbäddade TypeScript-strängar. PRAGMA user_version. BEGIN EXCLUSIVE per migration.
**KRITISKT:** Kör `PRAGMA foreign_keys = ON` och `PRAGMA journal_mode = WAL` VARJE gång databasen öppnas (i getDb() eller liknande). SQLite har foreign keys AVSTÄNGDA som default — utan denna rad fungerar inga relationscheck tyst.

### IPC health-check
Returnera: `{ ok: true, path: '...', schemaVersion: 3, tableCount: 13 }`

### App.tsx
Visa "Schemaversion: 3" och "13 tabeller".

### shared/types.ts + electron.d.ts
Lägg till tableCount i HealthCheckResponse.

## Tester (tests/schema.test.ts)

Ny testfil. Varje test använder fräsch :memory: DB med alla migrationer. 29 tester:

### Struktur (6)
1. 13 tabeller existerar
2. Minst 85 konton i accounts
3. 7 momskoder
4. user_version = 3
5. foreign_keys = ON
6. journal_mode = wal

### CHECK constraints (6)
7-10. Ogiltiga belopp i journal_entry_lines (negativ debit/credit, båda > 0, båda = 0)
11. Ogiltig status journal_entries
12. Negativt belopp invoices

### Triggers (12)
Skapa hjälpdata (company med fiscal_rule='K2', user, fiscal_year, accounting_periods, konton '1930' och '3001').
13. UPDATE bokförd entry — ändra description med status='corrected' → error (bara status+corrected_by_id)
14. UPDATE bokförd entry — ändra BARA status till 'corrected' → OK
15. DELETE bokförd entry → error
16-18. Immutabilitet rader (UPDATE/DELETE/INSERT)
19-20. Fakturaskydd (delete unpaid → error, delete draft → ok)
21. Bokför obalanserad verifikation → error
22. Bokför verifikation med 1 rad → error
23. Bokför i stängt räkenskapsår → error
24. Bokför i stängd period → error

### Foreign keys (3)
25-27. Ogiltiga references

### Integritet (1)
28. Draft → rader → transaktioner fungerar

## Uppdatera decision_log.md

```
## Session 2: Databasschema (AB K2/K3)
**Datum:** [dagens datum]
**Vad byggdes:** 13 tabeller, 8 triggers, ~95 BAS-konton (K2/K3), 7 momskoder, 29 tester
**Beslut:**
- Målgrupp: Aktiebolag K2/K3 (inte enskild firma)
- fiscal_rule-fält på companies — avgör K2 vs K3 regler
- k2_allowed/k3_only-flaggor på accounts — filtrerar kontoplanen per regelverk
- is_system_account — konton som 2099, 1219 bokförs bara via systemet
- ~95 BAS-konton (inte hela 600+) — täcker vanligaste AB-behoven
- Obeskattade reserver (2110-2150) — periodiseringsfonder och överavskrivningar
- Personalrelaterade konton (7xxx) — löner, arbetsgivaravgifter, pension
- Bokslutsdispositioner (8810-8850) — för AB-bokslut
- Konto 2640 (ingående moms) som asset — fordran på Skatteverket
- Konto 2099 (årets resultat) som equity (inte expense) — korrekt för AB
- datetime('now') sparar UTC — journal_date sätts alltid explicit
- Balansvalidering som SQLite-trigger vid bokning — hybridmodell
- COALESCE i balanstrigger — NULL-säkerhet vid SUM
- Immutabilitetstrigger tillåter BARA status+corrected_by_id ändring — strikt kontroll, alla andra fält förblir orörda
- Periodvalidering vid bokning (trigger 8) — förhindrar bokföring i stängt år eller stängd period
- PRAGMA foreign_keys = ON varje gång DB öppnas — SQLite default är OFF
- source_type utökad med auto_salary, auto_depreciation, auto_tax
- annual_report_status på fiscal_years — spårar årsredovisningens status
```

## Kör sedan

1. `npm run dev` — visa "Schemaversion: 3" och "13 tabeller"
2. `npm test` — alla tester gröna (session 1 + session 2)
3. `npm run lint` — 0 errors

Rapportera resultatet.

Börja.
