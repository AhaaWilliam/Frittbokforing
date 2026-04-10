# Decision Log

## Session 1: Projektsetup

**Datum:** 2026-03-25

**Vad byggdes:**
- Electron + React + TypeScript projektgrund
- SQLite-anslutning med WAL-läge
- IPC-grundstruktur med contextBridge
- TanStack Query setup
- ESLint + Prettier konfiguration
- Vitest setup

**Beslut och motiveringar:**
- **Electron** valt för lokal desktop-distribution, zero hosting cost
- **SQLite** istället för PostgreSQL — en fil per företag, enkel backup, zero config
- **better-sqlite3** (synkron) istället för sqlite3 (asynkron) — enklare i Electron main process, snabbare
- **WAL-läge** aktiverat för stabilitet vid oväntade krascher
- **PRAGMA user_version** för migrationsspårning — enklare och säkrare än separat tabell i lokal SQLite
- **BEGIN EXCLUSIVE** för migrationer — förhindrar korruption om appen kraschar under migration
- **contextIsolation + sandbox** — Electron-säkerhet, renderer har noll access till system-APIs
- **Zod** för IPC-validering — all input från renderer behandlas som untrusted
- **TanStack Query** för renderer state — IPC-anrop är "server state", ger caching + loading states gratis
- **Vitest** istället för Jest — snabbare, bättre TypeScript-stöd

**Alternativ som övervägdes:**
- Tauri istället för Electron — lättare men sämre React-ekosystem och svårare native module-stöd (better-sqlite3)
- Next.js (SaaS) — avfärdat pga driftskostnad vid gratis app
- PostgreSQL — overkill för single-user lokal app

## Session 2: Databasschema (AB K2/K3)

**Datum:** 2026-03-25

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
- Immutabilitetstrigger tillåter BARA status+corrected_by_id ändring — strikt kontroll
- Periodvalidering vid bokning (trigger 8) — förhindrar bokföring i stängt år eller stängd period
- PRAGMA foreign_keys = ON varje gång DB öppnas — SQLite default är OFF
- source_type utökad med auto_salary, auto_depreciation, auto_tax
- annual_report_status på fiscal_years — spårar årsredovisningens status
- report_box på vat_codes — SKV momsdeklarationsruta för automatisk momsrapport

## Session 3: Onboarding

**Datum:** 2026-03-25

### Orgnummer: full Luhn-validering
- Format NNNNNN-NNNN, siffra 1 = 5-9, modulus 10
- Motivering: konsekvent med övrig precision i projektet (104 BAS-konton, SKV report_box)

### Brutet räkenskapsår: stöds med avgränsning
- Kalenderår (default) eller brutet (välj startmånad, alltid 12 hela månader)
- INTE förkortat/förlängt första år i v1 (CHECK constraint kräver 1-12 perioder)

### En databas per företag
- Inget flerföretagsstöd. company:get returnerar 1 eller null.

### K2/K3 filtreras vid runtime (arkitekturprincip #13)
- fiscal_rule i companies = enda sanningskällan
- Alla framtida queries mot accounts filtrerar baserat på fiscal_rule

### IPC-mönster: entity:action + IpcResult<T> + ErrorCode
- Namnkonvention: entity:action (company:create, company:get)
- Alla handlers returnerar IpcResult<T> = { success, data/error, code, field? }
- Standardiserade ErrorCode: VALIDATION_ERROR, DUPLICATE_ORG_NUMBER, PERIOD_GENERATION_ERROR, TRANSACTION_ERROR, NOT_FOUND
- field? mappar felkod till specifikt formulärfält
- Mönstret gäller för ALLA framtida IPC-kanaler

### Defense in depth: org_number-trigger i SQLite
- Migration 004: BEFORE INSERT trigger på companies validerar format (längd, bindestreck, siffra 1)
- Luhn-validering enbart i Zod (för komplex för SQL-trigger)
- Motivering: fångar felaktig data om framtida kod kringgår IPC-lagret

### Säkerhet: unencrypted at rest (accepterat i v1)
- data.db ligger okrypterad på disk. Vid stöld av datorn exponeras all finansiell data.
- Acceptabelt i MVP: målgruppen är små AB, inte enterprise.
- Framtida förbättring: SQLCipher för krypterad SQLite.

## Session 4: Layout + Navigation

### Routing: useState med navigate-funktion
- useState<PageId> för toppnivå. Ingen React Router i v1.
- navigate('income') byter sida. Session 5 kan uppgradera om sub-vyer behövs.

### Årsväljare: global kontext i sidebar
- FiscalYearContext wrappas runt alla sidor
- Alla framtida data-queries tar fiscal_year_id (arkitekturprincip #14)
- Stängda år → read-only mode, action-knappar döljs

### Periodstängning: sekventiell
- Bara nästa öppna period kan stängas, bara senast stängda kan öppnas
- Trigger 8 i SQLite enforcar redan stängda perioder vid bokning
- Nya ErrorCodes: PERIOD_NOT_SEQUENTIAL, YEAR_IS_CLOSED

### Månadsindikator visar månadsnamn från start_date
- Inte från period_number — korrekt för brutet räkenskapsår
- toLocaleDateString('sv-SE') för svenska månadsnamn

### Persistence av valt räkenskapsår
- Enkel JSON-fil (fritt-settings.json) sparar last_fiscal_year_id
- Appen minns valt år vid omstart
- settings:get / settings:set IPC-kanaler (generiska, återanvänds av session 19+)
- electron-store undvekts pga ESM/CJS-problem, ersatt med enkel fs-baserad lösning

### "Alla perioder stängda"-meddelande
- Informationsruta visas när alla 12 perioder stängda men året ej stängt
- Bara information, ingen boksluts-logik (session 26)

## Session 5a: Stamdata + Kundregister

### Migration 005: stamdata-tabeller + schema-utökning
- 3 nya tabeller: products, price_lists, price_list_items
- counterparties utökad: VAT-nummer, contact_person, updated_at
- companies utökad: VAT-nr, email, phone, bankgiro, plusgiro, website
- Smart migration: kollar PRAGMA table_info innan ALTER TABLE (MigrationEntry med programmatic callback)

### Princip #14 undantag
- Stamdata (counterparties, products, price_lists) är globala
- Gäller över alla räkenskapsår — tar INTE fiscal_year_id

### VAT-nummer
- Formatvalidering: ^[A-Z]{2}[A-Z0-9]{2,12}$
- Ingen VIES-kontroll i v1
- Delad VatNumberSchema — samma regex för counterparties och companies

### Kundregister
- Master-detail-layout: lista vänster, detalj höger
- CRUD: skapa, visa, redigera, inaktivera (soft delete)
- Typ: customer, supplier, both
- UNIQUE index på org_number (partiellt, WHERE NOT NULL)

### Inställningar-sidan
- Uppgraderad från placeholder till företagsuppgiftsformulär
- company:update IPC-kanal

### Zod-säkerhet
- .strict() på alla nya scheman — avvisar okända fält

### Teknisk skuld (medveten)
- counterparties.type saknar CHECK constraint i DB. Valideras i Zod.
- payment_terms_days heter annorlunda i DB vs TypeScript (mappad i service)

## Session 5b: Artikelregister + Prislistor

### Artikeltyper: Tjänst, Vara, Utlägg
- 3 typer med automatisk kontomappning (ARTICLE_TYPE_DEFAULTS)
- service→3002, goods→3040, expense→3050
- Användaren ser kontonamn, aldrig kontonummer

### Prislistemodell: standard + kundspecifik
- products.default_price = standardpris i ören
- Kundspecifikt via price_lists + price_list_items (upsert med ON CONFLICT)
- Prislogik: kundpris > default_price

### Stödjande IPC-kanaler
- vat-code:list: filtrerar på vat_type (outgoing/incoming)
- account:list: K2/K3-filtrering (princip #13) + kontoklass-filter
- Båda återanvänds av session 6 (fakturamall)

### kr-ören-konvertering
- toOre/toKr/formatKr i renderer/lib/format.ts
- DB lagrar alltid ören (princip #9)

### Felmeddelande-sanitering
- Generiska meddelanden till renderer, console.error i main process

## Session 6: Fakturamall + Draft-sparande

### Migration 006: invoice extensions
- Ny tabell invoice_lines (quantity REAL, unit_price/line_total/vat_amount i ören)
- invoices utökad: fiscal_year_id, payment_terms
- invoice_number='' för drafts (TEXT NOT NULL i befintligt schema)

### Draft-flöde
- status='draft', invoice_number=''
- Kan redigeras (DELETE+INSERT lines) och raderas
- Trigger 6 skyddar icke-drafts
- Session 7 lägger till "Bokför"

### Momsberäkning (princip #5)
- Main process: exakt beräkning med pre-fetched vat_codes Map (undviker N+1)
- rate_percent lagras som 25, 12, 6, 0 → divideras med 100
- Math.round() per rad, inte på summan
- Renderer: preview-beräkning i InvoiceTotals

### Formulär-state: useReducer
- Actions: SET_CUSTOMER, ADD_LINE, UPDATE_LINE, REMOVE_LINE, etc.
- InvoiceFormLine med temp_id (crypto.randomUUID) för React key

### Fakturanummer-preview
- MAX(CAST(invoice_number AS INTEGER)) + 1 per fiscal_year_id
- Informativt, inte reserverande

### Prestandaoptimeringar
- Pre-fetch alla vat_codes till Map (1 query istf N)
- listDrafts hämtar INTE invoice_lines
- UpdateDraftInputSchema: omit fiscal_year_id

## Session 7: Spara + Bokför

### Migration 007
- invoice_lines.account_number för friform-rader
- UNIQUE index på (fiscal_year_id, verification_number) och (fiscal_year_id, invoice_number)

### finalizeDraft — hela bokföringsflödet i EN transaktion
- Validerar: draft status, lines exist, friform account_number, period open
- Allokerar gaplöst fakturanummer (MAX+1 per fiscal_year)
- Allokerar verifikationsnummer (MAX+1 per fiscal_year)
- buildJournalLines: SQL GROUP BY för aggregering per account_number
- Öresutjämning: auto-korrigering ≤50 öre via konto 3740
- INSERT journal_entry som draft → book (triggers validate balance)
- UPDATE invoice: status → 'unpaid', invoice_number, journal_entry_id

### Kontering (dubbel bokföring)
- DEBET 1510 (Kundfordringar): totalt inkl moms
- KREDIT intäktskonton (3001/3002/3040/3050): per account_number
- KREDIT momskonton (2610/2620/2630): per vat_account
- Schema uses account_number TEXT (not account_id INT) — adapted from prompt

### updateSentInvoice
- Kan uppdatera notes, payment_terms, due_date på bokförda fakturor
- Belopp/rader kan INTE ändras (princip #7)

### Beslut
- Status 'unpaid' (inte 'sent') — matchar befintligt schema
- journal_entry skapas som draft först, sedan booked — triggers validerar
- Friform-rader kräver account_number vid bokföring, inte vid draft-sparande

## Session 8: Fakturalista med status + sök/filter

### listInvoices
- Filtrerar fiscal_year_id (princip #14) + status + sökning (kundnamn/fakturanummer)
- Sortbar: invoice_date, due_date, invoice_number, total_amount, counterparty_name
- JOIN counterparties + journal_entries för kundnamn och verifikationsnummer
- Composite index: (fiscal_year_id, status, invoice_date)

### Overdue-logik
- refreshInvoiceStatuses: UPDATE unpaid → overdue WHERE due_date < today
- Körs vid app-start och före varje invoice:list
- Draft påverkas INTE

### InvoiceList UI
- Filter-pills: Alla/Utkast/Obetald/Betald/Förfallen med statusräknare
- Sökfält med 300ms debounce
- Tabell: Nr/Datum/Kund/Netto/Moms/Totalt/Status/Förfaller/Verif
- Klick: draft → edit, bokförd → view

## Session 9: Markera betald → betalningsverifikation

### Migration 008
- invoice_payments utökad: payment_method, account_number
- Index: (invoice_id, amount) för snabb SUM-query

### payInvoice — transaktionsbaserad betalning
- Validerar: status (unpaid/overdue/partial), belopp, period, datum
- Kontering: DEBET bank + KREDIT 1510 (kundfordringar)
- Öresutjämning: ±50 öre auto via konto 3740 (med remaining-guard)
- Status: unpaid → paid (full) eller partial (del)
- Verifikationsnummer i betalningens räkenskapsår (inte fakturans)

### Delbetalning
- Status 'partial' (matchar DB CHECK constraint)
- Flera delbetalningar → SUM(payments) trackar total_paid
- listInvoices inkluderar total_paid + remaining via LEFT JOIN subquery

### Öresutjämning vid betalning
- Max ±50 öre
- Kräver remaining > 100 öre (undviker auto-writeoff på små restbelopp)
- Balanscheck: totalDebit === totalCredit (defense in depth)

### Beslut
- Framtidsdatum blockeras (pre-flight check)
- 'partial' status (inte 'partially_paid') — matchar schema CHECK constraint
- Betalningskonton: 1930 (bank), 1920 (plusgiro), 1910 (kassa)

## Session 10: Registrera kostnad (leverantörsfaktura)

### Migration 009
- expenses + expense_lines tabeller
- UNIQUE index uppdaterad: (fiscal_year_id, verification_series, verification_number)
- MF0 vat code seeded (ingående momsfri)

### expense-service.ts
- 6 funktioner: save/get/update/delete draft + listDrafts + finalizeExpense
- Kontering: DEBET kostnadskonton + DEBET 2640 (ing. moms) / KREDIT 2440 (lev.skulder)
- B-serie gaplöst verifikationsnummer (oberoende av A-serien)
- Öresutjämning 3740 max 50 öre

### B-serie verifikationer
- A-serie: kundfakturor + kundbetalningar
- B-serie: leverantörsfakturor (+ leverantörsbetalningar i session 11)
- invoice-service uppdaterad: explicit verification_series='A' i alla queries

### Beslut
- Dubblettkontroll leverantörsfakturanummer (UNIQUE partiellt index)
- Counterparty type-validering (supplier/both) vid save + finalize
- Framtidsdatum tillåts i drafts, blockeras vid finalize
- Status 'partial' (matchar invoices schema)

## Session 11: Betala kostnad (leverantörsbetalning)

**Datum:** 2026-03-26

### Beslut
- `payExpense()` speglar `payInvoice()` exakt men med omvänd kontering (DEBET 2440 / KREDIT bank)
- B-serie verifikationsnummer (sekventiellt, gaplöst)
- `source_type = 'auto_payment'` återanvänds (istället för ny typ) — SQLite CHECK constraint kräver table rebuild med trigger-konflikter; inte värt komplexiteten
- Öresutjämning ±50 öre via konto 3740 med remaining-guard (>100 öre) — bidirektionell
- Betalning scopas till betalningsdatumets räkenskapsår (M8), inte kostnadens
- `expense_payments` tabell speglar `invoice_payments` exakt (amount, payment_method, account_number som TEXT)
- `getExpense()` returnerar `total_paid` + `remaining` — undviker extra IPC-anrop från PayExpenseDialog
- `ExpenseDetail` typ skapad (extends Expense med lines + total_paid + remaining)
- Kronologisk datumordning (M6) inom B-serien
- Betaldatum före kostnadsdatum blockeras (PAYMENT_BEFORE_EXPENSE)
