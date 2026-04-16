# Feature-promptar — korrigerade och fullständiga

Implementeringsordning: PDF (1) → Budget (2) → Periodiseringar (3) → Leverantörsbetalfil (4) → SIE-import (5a+5b)

Migreringsnummer: 034 (Budget), 035 (Periodiseringar), 036+037 (Leverantörsbetalfil), 038 (SIE-import om tabeller behövs).

---

## Feature 1: PDF-faktura — renderer-integration + batch-export + test-coverage

### Kontext

PDF-generering är **redan komplett** i main process:
- `src/main/services/pdf/invoice-pdf-service.ts` — pdfkit, A4, fönsterkuvert, radtabell,
  momssummering, OCR, KREDITFAKTURA-rubrik, "Avser faktura #X"-referens
- IPC: `invoice:generate-pdf` (returnerar base64) + `invoice:save-pdf` (showSaveDialog + write)
- Schemas: `GenerateInvoicePdfSchema`, `SaveInvoicePdfSchema` i ipc-schemas.ts
- `FinalizedInvoice` har `invoice_type`, `credits_invoice_id`, `credits_invoice_number`

**Vad saknas:** Renderer-knappar, batch-export, test-coverage av PDF-output.

### Leverabler

#### 1. PDF-knapp i faktura-view-subvyn (PageInvoices)
- Lägg till "Ladda ner PDF"-knapp bredvid "Korrigera" i view-subvyn
- Visa enbart för finaliserade fakturor (`status !== 'draft'`)
- Flöde: klick → `invoice:generate-pdf` → `invoice:save-pdf` → toast-bekräftelse
- Loading-state under generering (disabled knapp + spinner)
- Default-filnamn: `Faktura_{invoice_number}_{customer_name}.pdf`
- Kreditfakturor: samma flöde (servicen hanterar redan rubrik + referens)

#### 2. PDF-ikon per rad i InvoiceList
- Liten PDF-ikon (FileDown från lucide-react) per rad för finaliserade fakturor
- `e.stopPropagation()` — klick ska inte navigera till fakturavyn
- Samma generate→save-flöde som ovan
- Dölj ikonen för draft-rader

#### 3. Batch-PDF-export
- Checkbox-selektion i InvoiceList (samma mönster som bulk-betalning, BulkPaymentDialog)
- "Exportera PDF:er"-knapp i bulk-action-bar (visas vid ≥1 selekterad)
- Generera en PDF per faktura
- Spara i vald mapp via `dialog.showOpenDialog({ properties: ['openDirectory'] })`
  (INTE showSaveDialog — det är för enskilda filer)
- Filnamn: `Faktura_{invoice_number}_{customer_name}.pdf`
- Progress-indikator i dialog (X av Y)
- IPC: ny kanal `invoice:save-pdf-batch` — tar `{ directory: string, invoices: Array<{ invoiceId: number, fileName: string }> }`
  Loop i main process: generate + write per faktura. Returnera `IpcResult<{ succeeded: number, failed: Array<{ invoiceId: number, error: string }> }>`

#### 4. Tester (minst 20)

**Service-tester (pdf-parse för content-verifiering):**
- Standardfaktura: fakturanummer, kundnamn, belopp, OCR i PDF-text
- Kreditfaktura: "KREDITFAKTURA" i rubrik, "Avser faktura #X" i metadata
- Flerradig faktura (4+ rader): alla rader synliga
- Blandad moms (25% + 12%): båda momsgrupper i summering
- Fönsterkuvert: kundadress-position (Y ≥ 130pt)
- Företagsuppgifter i footer: orgNr, F-skatt

**Renderer-tester:**
- PDF-knapp synlig för finalized, dold för draft
- Klick triggar generateInvoicePdf → saveInvoicePdf-sekvens
- PDF-ikon i listrad: stopPropagation, enbart finalized
- Batch: checkbox-selektion, "Exportera PDF:er" visas vid ≥1 val
- Batch: progress-dialog under körning
- A11y: axe-check på view med PDF-knapp

**IPC-tester:**
- Schema-validering: invoiceId saknas → error
- save-pdf: base64 + fileName schema

### Regler
- PDF-generering sker ENBART i main process (aldrig renderer)
- Transport: main genererar Buffer → base64-sträng till renderer → tillbaka som base64 till main för sparande
- Ingen ny dependency — pdfkit + pdf-parse redan installerade
- Alla M-principer gäller (M128 wrapIpcHandler, M144 IpcResult)
- Batch-export: `dialog.showOpenDialog({ properties: ['openDirectory'] })`, inte showSaveDialog

---

## Feature 2: Budget — budget vs utfall

### Kontext

Fritt Bokföring har resultaträkning med INCOME_STATEMENT_CONFIG i k2-mapping.ts
som definierar 10 rad-ID:n (`net_revenue`, `other_operating_income`, `materials`,
`other_external`, `personnel`, `depreciation`, `other_operating_expenses`,
`financial_income`, `financial_expenses`, `appropriations`, `tax`) grupperade i
4 grupper. `getIncomeStatement()` i report-service.ts returnerar per-rad-data
med `dateRange?`-parameter. 13 bokföringsperioder per FY.

### Datamodell

#### Migration 034: budget_targets
```sql
CREATE TABLE budget_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  line_id TEXT NOT NULL,  -- matchar INCOME_STATEMENT_CONFIG line IDs
  period_number INTEGER NOT NULL CHECK (period_number >= 1 AND period_number <= 12),
  amount_ore INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(fiscal_year_id, line_id, period_number)
);
CREATE INDEX idx_budget_fy ON budget_targets (fiscal_year_id);
```

**Design-beslut om M137:**
M137 (positiva belopp i DB) gäller transaktionsdata (invoices, expenses, journal entries).
Budget-targets är **planeringsstamdata**, inte transaktioner. `amount_ore` tillåts
vara negativt för kostnadsposter (t.ex. `materials` = -50000_00 innebär budgeterat
50 000 kr i kostnader). Detta speglar INCOME_STATEMENT_CONFIG:s `signMultiplier`
— intäkter positiva, kostnader negativa — så att `budget - actual = variance`
fungerar utan sign-flip i varje beräkning. Explicit undantag från M137 för denna
tabell, dokumenterat i denna prompt.

**line_id, inte group_id:** Budget per resultaträkningsrad (10 rader), inte per
grupp (4 grupper). Ger granularitet att budgetera t.ex. personal separat från
extern konsultation. 10 rader × 12 perioder = 120 rader per FY.

### Leverabler

#### 1. budget-service.ts (src/main/services/budget-service.ts)

```typescript
saveBudgetTargets(db, fiscalYearId, targets: BudgetTarget[]): IpcResult<void>
```
- Upsert (INSERT OR REPLACE) alla targets i en transaktion
- Validera att varje `line_id` matchar en rad i INCOME_STATEMENT_CONFIG
- Validera period_number 1–12

```typescript
getBudgetTargets(db, fiscalYearId): IpcResult<BudgetTarget[]>
```
- Alla targets för FY

```typescript
getBudgetVsActual(db, fiscalYearId): IpcResult<BudgetVarianceReport>
```
- **En enda SQL-query för all utfallsdata** — INTE 12 separata getIncomeStatement-anrop.
  Hämta summa debit/credit per konto grupperat per period (CAST SUBSTR för periodsidentifiering
  via `journal_entries.entry_date`). Mappa konton till line_id via `matchesRanges()` från
  k2-mapping.ts (M97, M98).
- Alternativt: utöka `result-service.ts` med `calculateResultByPeriod(db, fyId): Map<number, ResultSummary>`
  som returnerar per-period-data i ett anrop. Budget-servicen konsumerar denna.
- Returstruktur:

```typescript
interface BudgetVarianceReport {
  lines: Array<{
    lineId: string
    label: string
    groupId: string
    groupLabel: string
    periods: Array<{
      periodNumber: number
      budgetOre: number
      actualOre: number
      varianceOre: number        // actual - budget
      variancePercent: number | null  // null om budget = 0
    }>
    totalBudgetOre: number
    totalActualOre: number
    totalVarianceOre: number
    totalVariancePercent: number | null
  }>
}
```

```typescript
copyBudgetFromPreviousFy(db, targetFyId, sourceFyId): IpcResult<number>
```
- Kopierar alla targets från sourceFy till targetFy
- Returnerar antal kopierade rader
- **Medvetet undantag från M14** (FY-scoping): denna funktion läser från ett
  annat FY. Dokumenterat som M14-undantag i samma kategori som stamdata
  (counterparties, products). Budget-targets har stamdata-karaktär.

#### 2. IPC-kanaler
- `budget:save` — spara/uppdatera targets
- `budget:get` — hämta targets för FY
- `budget:variance` — budget vs utfall-rapport
- `budget:copy-from-previous` — kopiera från förra FY
- Alla med wrapIpcHandler (M128), Zod-scheman (strict), IpcResult (M144)

#### 3. PageBudget.tsx
- Route: `/budget`
- Två vyer via tabs: **"Budget"** (inmatning) och **"Avvikelse"** (rapport)

**Budget-inmatningsvyn:**
- Grid/tabell: rader = INCOME_STATEMENT_CONFIG lines (10 rader), kolumner = period 1–12 + helår
- Grupprubriker (operating_income, operating_expenses, etc.) som visuella section headers
- Editerbara celler: `<input type="number">`, kronor-inmatning (konvertera till öre vid spara)
- "Kopiera från förra året"-knapp (om tidigare FY har budget-data)
- "Fördela jämnt"-knapp per rad: manuellt inmatat helårsbelopp / 12 (sista perioden tar rest)
- Auto-summering av helårskolumn (readonly)
- Spara-knapp (batch-upsert alla celler i en transaktion)

**Avvikelsevyn:**
- Samma grid men read-only med 3 underkolumner per period: Budget / Utfall / Avvikelse
- Färgkodning: grön text om utfallet är bättre (intäkt > budget, kostnad < budget),
  röd text om utfallet är sämre. Logiken beror på `signMultiplier`:
  - `signMultiplier = 1` (intäkter): actual > budget = grön
  - `signMultiplier = -1` (kostnader): actual < budget = grön (lägre kostnad)
- Procentuell avvikelse
- Helårs-summering
- Print-knapp (`print:hidden` på kontroller, `print:block` på rapport)

#### 4. Sidebar-integration
- Lägg till "Budget" under Rapporter-sektionen (PiggyBank-ikon från lucide-react)
- Route: `/budget`, testId: `nav-budget`
- Placering: efter "Åldersanalys", före "Moms"

#### 5. Tester (minst 25)

**Service-tester:**
- Spara targets: upsert (uppdatera befintlig), batch i transaktion
- Hämta targets: korrekt per FY
- Variance: känd data med 2 perioder, beräkning korrekt
- Variance: noll-budget → variancePercent = null
- Variance: utfall matchar getIncomeStatement (M96 single source of truth)
- Copy: kopierar korrekt, returnerar antal
- Copy: tomt käll-FY → 0 rader
- Validering: ogiltigt line_id → error

**Migration:**
- Tabell skapad, UNIQUE constraint, index
- Ogiltigt period_number → SQLITE_CONSTRAINT

**IPC:**
- Schema-validering för alla 4 kanaler
- budget:save med ogiltig input → VALIDATION_ERROR

**Renderer:**
- Grid renderar 10 rader, 12 perioder
- Cell-editering: onChange → dirty state
- Spara-knapp: anropar budget:save
- Fördela jämnt: 1200 / 12 = 100 per period
- Avvikelse-färgkodning: grön/röd baserat på signMultiplier
- Kopiera från förra året: disabled om inget tidigare FY
- Print-knapp synlig i avvikelsevyn
- A11y: axe-check på båda vyerna

### Regler
- Budget-data är FY-scopad (M14) förutom copy-operationen (dokumenterat undantag)
- Belopp i öre (M119)
- Utfallsberäkning via samma konto-ranges som INCOME_STATEMENT_CONFIG (M96, M97)
- Konto-intervallmatchning via `matchesRanges()` eller CAST/BETWEEN — ALDRIG
  lexikografisk jämförelse (M98)
- Budget-targets har stamdata-karaktär: fritt redigerbara, ingen immutability
- Alla M-principer: M128 (wrapIpcHandler), M144 (IpcResult), M100 (strukturerade fel)

---

## Feature 3: Periodiseringar

### Kontext

Fritt Bokföring har manuella bokföringsorder (C-serie) med draft→finalize-flöde,
bokföringsperioder (13 per FY, sekventiell stängning), och alla BAS-interimskonton
seedade i kontoplanen:
- 1710 Förutbetalda hyreskostnader
- 1790 Övriga förutbetalda kostnader och upplupna intäkter
- 2910 Upplupna löner
- 2920 Upplupna semesterlöner
- 2940 Upplupna lagstadgade sociala avgifter
- 2990 Övriga upplupna kostnader och förutbetalda intäkter

Periodiseringar automatiserar det vanligaste bokslutsarbetet: fördela en
kostnad/intäkt jämnt över flera perioder via parvisa verifikat.

### Datamodell

#### Migration 035: accrual_schedules + accrual_entries

```sql
CREATE TABLE accrual_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fiscal_year_id INTEGER NOT NULL REFERENCES fiscal_years(id),
  description TEXT NOT NULL,
  accrual_type TEXT NOT NULL CHECK (accrual_type IN (
    'prepaid_expense',
    'accrued_expense',
    'prepaid_income',
    'accrued_income'
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
-- Notera: INGEN UNIQUE(schedule_id, period_number, entry_type) — se "Korrigeringsflöde" nedan
CREATE INDEX idx_accrual_entries_schedule ON accrual_entries (accrual_schedule_id);
```

**Kolumnnamn: `balance_account` + `result_account` istället för `from_account`/`to_account`:**
Undviker tvetydighet om vilken sida som debiteras. Semantiken är:
- `balance_account` = interimskonto (1710, 1790, 2910, 2990 etc.) — balansräkningen
- `result_account` = kostnadskonto (5xxx, 6xxx) eller intäktskonto (3xxx) — resultaträkningen

**Debet/kredit-logik per accrual_type:**

| Type | Periodiseringsbokning (accrual) | Upplösningsbokning (reversal) |
|------|-------------------------------|-------------------------------|
| `prepaid_expense` | D balance_account / K result_account | D result_account / K balance_account |
| `accrued_expense` | D result_account / K balance_account | D balance_account / K result_account |
| `prepaid_income` | D result_account / K balance_account | D balance_account / K result_account |
| `accrued_income` | D balance_account / K result_account | D result_account / K balance_account |

Mnemonic: "prepaid" = pengar redan betalda/mottagna → balansera på interimskonto.
"accrued" = pengar ännu inte betalda/mottagna → kostnads-/intäktsför direkt, skuld på interimskonto.

**Cross-FY-begränsning (medvetet):**
`period_count` max 12 = periodiseringar begränsade till ett räkenskapsår.
Periodiseringar som sträcker sig över FY-gränsen kräver att användaren skapar
ett nytt schema i nästa FY. Motivering: IB-transfer hanterar balansförda poster
automatiskt, och ett cross-FY-schema kräver komplex kopplingslogik mellan
fiscal_years som inte motiveras av målgruppens behov (småföretag).

**Korrigeringsflöde (ingen UNIQUE-constraint):**
Om en accrual-entry bokförs med fel belopp: användaren skapar ett korrigerings-
verifikat (befintlig correction-service, C-serie) mot det felaktiga verifikatet,
sedan kör om perioden. Därför saknar `accrual_entries` UNIQUE-constraint —
samma (schedule, period, type) kan ha flera entries om en körts, korrigerats
och körts igen.

### Leverabler

#### 1. accrual-service.ts (src/main/services/accrual-service.ts)

```typescript
createAccrualSchedule(db, input): IpcResult<{ id: number }>
```
- Validera att balance_account och result_account är aktiva konton
- Validera att kontotyperna matchar (balance_account = klass 1 eller 2, result_account = klass 3–8)
- Validera start_period + period_count - 1 ≤ 12 (får inte spilla utanför FY)

```typescript
executeAccrualForPeriod(db, scheduleId, periodNumber): IpcResult<{ journalEntryId: number }>
```
- Inom `db.transaction()`:
  - Kontrollera att period ej stängd (M93)
  - Beräkna period-belopp: `Math.floor(total_amount_ore / period_count)`, sista perioden
    tar rest: `total_amount_ore - Math.floor(total_amount_ore / period_count) * (period_count - 1)`
  - Skapa C-serie verifikat via befintligt manual-entry-pattern:
    - `source_type = 'manual'`
    - Description: `Periodisering: {schedule.description} (period {periodNumber}/{period_count})`
    - Kronologicheck (M142) — datum = sista dagen i perioden
  - Spara i accrual_entries: `entry_type = 'accrual'`
  - FTS5 rebuild (M143, try-catch)

```typescript
getAccrualSchedules(db, fiscalYearId): IpcResult<AccrualScheduleWithStatus[]>
```
- Lista med status per period: vilka perioder är körda, kvarvarande belopp

```typescript
deactivateSchedule(db, scheduleId): IpcResult<void>
```
- Sätt `is_active = 0`. Befintliga entries orörda.

#### 2. IPC-kanaler
- `accrual:create` — skapa schema
- `accrual:list` — lista per FY
- `accrual:execute` — kör för vald period
- `accrual:execute-all` — kör ALLA aktiva scheman för vald period (transaktion)
- `accrual:deactivate` — mjuk radering
- Alla med wrapIpcHandler (M128), Zod-scheman (strict), IpcResult (M144)

#### 3. PageAccruals.tsx
- Route: `/accruals`
- Lista alla periodiseringsscheman för aktivt FY
- Per schema:
  - Beskrivning, typ-badge (Förutbetald kostnad / Upplupen kostnad / etc.)
  - Belopp, period-intervall
  - Visuell progress: t.ex. "3 av 6 perioder körda" med progress-bar
  - Status-badges per period: Ej körd (grå) / Körd (grön)
- "Ny periodisering"-formulär (EntityListPage create-subvy):
  - Typ-dropdown (4 alternativ)
  - Konto-pickers: balance_account (filtrerat klass 1+2), result_account (filtrerat klass 3–8)
  - Belopp (kronor, konvertera till öre)
  - Startperiod + antal perioder
  - Beskrivning (fritext)
- "Kör period X"-knapp per schema
- "Kör alla (period X)"-knapp: kör execute-all för vald period

#### 4. Sidebar-integration
- Lägg till "Periodiseringar" under Hantera-sektionen (CalendarClock-ikon från lucide-react)
- Route: `/accruals`, testId: `nav-accruals`
- Placering: efter "Bokföringsorder"

#### 5. Tester (minst 25)

**Service-tester:**
- Skapa schema: korrekt insert, returnerar id
- Köra period: verifikat skapas, balanserar (debit = credit)
- Ojämn division: 100_00 / 3 = 33 + 33 + 34
- Redan körd period: tillåtet (ingen UNIQUE-constraint) men skapar nytt verifikat
- Stängd period → VALIDATION_ERROR
- Felaktigt konto (klass 1 som result_account) → VALIDATION_ERROR
- start_period + period_count > 12 → VALIDATION_ERROR
- Deactivate: is_active = 0, entries orörda
- execute-all: 3 scheman, alla körs i en transaktion
- D/K-logik: prepaid_expense debiterar balance, krediterar result
- D/K-logik: accrued_expense debiterar result, krediterar balance

**Migration:**
- Tabeller skapade, CHECK-constraints, FK
- Ogiltigt accrual_type → SQLITE_CONSTRAINT

**IPC:**
- Schema-validering för alla 5 kanaler

**Renderer:**
- Lista renderar scheman med progress
- Create-formulär: alla fält, typ-dropdown
- Execute-knapp: klick triggar execute, progress uppdateras
- A11y: axe-check

### Regler
- C-serie för alla periodiseringsverifikat (source_type='manual')
- M142 kronologi: periodiseringsdatum = sista dagen i perioden, måste vara ≥ senaste C-serie-datum
- Belopp i öre (M119), positiva i DB och i accrual_entries (M137)
- Periodiseringar är FY-scopade (M14, regel 14)
- Konton måste vara aktiva och existerande
- Alla M-principer: M128, M144, M100, M142, M143

---

## Feature 4: Leverantörsbetalningsfil (ISO 20022 pain.001 + Bankgiro LB-fallback)

### Kontext

Fritt Bokföring har bulk-betalning (`payExpensesBulk`, `payment_batches`-tabell
med `batch_type`, `status`, `bank_fee_ore`) och company-data med bankgiro/plusgiro.
Men counterparties saknar bankgiro/plusgiro-fält, och det finns ingen filexport
för betalningsinstruktioner.

**Formatval:** ISO 20022 pain.001 (XML) är modern standard som alla svenska storbanker
stöder. Bankgiro LB-rutinen (fast bredd, 80 tecken) är äldre men fortfarande i drift
hos BGC. Denna sprint implementerar **pain.001 som primärt format** med LB som
framtida fallback (enklare att lägga till senare, samma datamodell).

### Datamodell

#### Migration 036: counterparty payment fields
```sql
ALTER TABLE counterparties ADD COLUMN bankgiro TEXT DEFAULT NULL;
ALTER TABLE counterparties ADD COLUMN plusgiro TEXT DEFAULT NULL;
ALTER TABLE counterparties ADD COLUMN bank_account TEXT DEFAULT NULL;
ALTER TABLE counterparties ADD COLUMN bank_clearing TEXT DEFAULT NULL;
```

Ingen table-recreate krävs — ADD COLUMN med nullable TEXT + DEFAULT NULL är
ADD COLUMN-safe (M127). counterparties har inkommande FK (M122-listan) men
ADD COLUMN kräver inte table-recreate.

**Validering i Zod-schema (IPC + form):**
- `bankgiro`: regex `^\d{3,4}-?\d{4}$` (7–8 siffror, valfritt bindestreck).
  **Modulus 10-checksumma:** sista siffran är kontrollsiffra (Luhn-variant).
  Validering via `validateBankgiroChecksum()` helper.
- `plusgiro`: regex `^\d{2,8}$` (2–8 siffror)
- `bank_account`: fritext (banker har olika format, IBAN möjligt)
- `bank_clearing`: regex `^\d{4}$` (4 siffror)

#### Migration 037: payment_batches export tracking
```sql
ALTER TABLE payment_batches ADD COLUMN exported_at TEXT DEFAULT NULL;
ALTER TABLE payment_batches ADD COLUMN export_format TEXT DEFAULT NULL;
ALTER TABLE payment_batches ADD COLUMN export_filename TEXT DEFAULT NULL;
```

### Leverabler

#### 1. bankgiro-validation.ts (src/shared/bankgiro-validation.ts)
- `validateBankgiroChecksum(bankgiro: string): boolean` — modulus 10 (Luhn-variant)
  på bankgironummer utan bindestreck
- `normalizeBankgiro(input: string): string` — strip bindestreck, returnera 7–8 siffror
- Placerad i shared/ — används av både IPC-schema (main) och form-schema (renderer)

#### 2. Counterparty-formulär utökning
- Lägg till sektion "Betalningsuppgifter" i CounterpartyForm (CustomerForm/SupplierForm)
  under befintliga fält
- Fält: Bankgiro, Plusgiro, Bankkonto, Clearingnummer
- Bankgiro: real-time Luhn-validering, felmeddelande "Ogiltigt bankgironummer (kontrollsiffra)"
- Visa i CustomerDetail/SupplierDetail

#### 3. pain001-export-service.ts (src/main/services/payment/pain001-export-service.ts)

```typescript
generatePain001(db, batchId): IpcResult<{ buffer: Buffer, filename: string }>
```
- Generera ISO 20022 pain.001.001.03 XML (Customer Credit Transfer Initiation)
- Strukturer:
  - `<CstmrCdtTrfInitn>` — root
  - `<GrpHdr>` — MessageId (UUID), CreationDateTime, NumberOfTransactions, ControlSum, InitiatingParty (company name + orgNr)
  - `<PmtInf>` — per batch: PaymentInfoId, PaymentMethod (TRF), BatchBooking, RequestedExecutionDate, Debtor (company), DebtorAccount (BBAN/bankgiro)
  - `<CdtTrfTxInf>` — per payment: EndToEndId, Amount (öre→kronor 2 decimaler), CreditorAgent, Creditor (supplier), CreditorAccount (bankgiro/plusgiro/BBAN), RemittanceInformation (supplier_invoice_number)
- Belopp: öre → kronor med 2 decimaler, punkt som decimaltecken (XML-standard)
- Encoding: UTF-8 (pain.001 = XML)
- Använd `xmlbuilder2` (redan installerat) för XML-generering

```typescript
validateBatchForExport(db, batchId): IpcResult<PaymentExportValidation>
```
- Pre-flight-validering:
  - Alla leverantörer i batchen har bankgiro ELLER plusgiro ELLER bankkonto+clearing
  - Företaget har bankgiro (avsändare-konto)
  - Batchen har status 'completed' eller 'partial' (inte 'cancelled')
  - Batchen är inte redan exporterad (`exported_at IS NULL`)
- Returnera per-leverantör-status:
  ```typescript
  interface PaymentExportValidation {
    valid: boolean
    issues: Array<{
      counterpartyId: number
      counterpartyName: string
      issue: 'missing_bankgiro' | 'missing_all_payment_info'
    }>
    batchIssue?: 'already_exported' | 'cancelled' | 'company_missing_bankgiro'
  }
  ```

```typescript
markBatchExported(db, batchId, format, filename): void
```
- Uppdatera payment_batches: `exported_at`, `export_format`, `export_filename`

#### 4. IPC-kanaler
- `payment-batch:validate-export` — pre-flight-validering
- `payment-batch:export-pain001` — generera + spara fil (showSaveDialog, `.xml`)
- `payment-batch:list` — lista batchar med exportstatus (lägg till exported_at, export_filename i return)
- Alla med wrapIpcHandler (M128), Zod-scheman, IpcResult (M144)

#### 5. UI-integration
- **BulkPaymentResultDialog** (befintlig): ny "Exportera betalfil"-knapp
  - Visas efter lyckad batch (status !== 'cancelled')
  - Flöde: validate → om valid → export-pain001 → showSaveDialog → bekräftelse-toast
  - Om validation misslyckas: visa vilka leverantörer som saknar betalningsuppgifter
    med "Redigera"-länk per leverantör
- **Varning i BulkPaymentDialog** (befintlig): om ≥1 vald leverantör saknar bankgiro
  → varningstext "X leverantörer saknar betalningsuppgifter — betalfil kan inte genereras"
  (icke-blockerande, batch-betalning fungerar fortfarande)

#### 6. Tester (minst 25)

**bankgiro-validation:**
- Korrekt bankgiro passerar checksumma (3 kända giltiga nummer)
- Felaktig kontrollsiffra → false
- 7 siffror, 8 siffror, med bindestreck: alla hanteras
- normalizeBankgiro strip bindestreck

**pain001-export:**
- XML-struktur: GrpHdr, PmtInf, CdtTrfTxInf present
- Belopp: öre→kronor 2 decimaler, punkt-separator
- Per-payment: rätt mottagare, rätt belopp, rätt referens
- Summering: ControlSum = summa alla payments
- UTF-8 encoding
- Tomt batch → error

**Validering:**
- Saknat bankgiro → issue per leverantör
- Redan exporterad → batchIssue
- Cancelled batch → batchIssue
- Saknat företags-bankgiro → batchIssue
- Alla OK → valid: true

**Migration:**
- Nya kolumner, NULL default, befintliga counterparties opåverkade
- export_format nullable

**Counterparty-formulär:**
- Bankgiro-fält renderas, validering vid ogiltigt format
- Checksumma-validering: felmeddelande visas
- A11y: axe-check

**IPC:**
- Schema-validering för alla 3 kanaler
- Export med ogiltig batchId → error

### Regler
- pain.001-generering sker i main process
- `xmlbuilder2` för XML (redan installerat — INGEN ny dependency)
- Belopp i öre internt (M119), konverteras till kronor i XML-output
- En exportfil per payment_batch (1:1-relation)
- Företagets bankgiro krävs vid export (validera vid export, inte vid batch-skapande)
- Alla M-principer: M128, M144, M100, M119

---

## Feature 5a: SIE4-import — Fas 1: Parser + Validering + Dry-run

### Kontext

Fritt Bokföring har SIE4-export (`src/main/services/sie4/sie4-export-service.ts`)
med CP437 encoding (`iconv-lite`, redan installerat), CRC32 checksumma (`node:zlib`),
och befintliga helpers:
- `sie4-checksum.ts`: `calculateKsumma()` — CP437-encode via iconv-lite + crc32
- `sie4-amount.ts`: `oreToSie4Amount()` — öre→kronor för export
- `sie4-account-type-mapper.ts`: `mapSie4AccountType()` — BAS-klass→SIE4-typ

Exportservicen stöder: #FLAGGA, #PROGRAM, #FORMAT, #GEN, #SIETYP, #PROSA, #FTYP,
#FNR, #ORGNR, #FNAMN, #RAR, #KPTYP, #VALUTA, #KONTO, #KTYP, #IB, #UB, #RES,
#PSALDO, #VER/#TRANS, #KSUMMA.

Fas 1 fokuserar på parser + validering + dry-run. **Fas 2** (separat sprint) gör
själva importen till databasen (conflict resolution, merge-strategi, IB-hantering).

### Leverabler

#### 1. sie4-amount-parser.ts (src/main/services/sie4/sie4-amount-parser.ts)
- `sie4AmountToOre(amount: string): number` — omvändningen av befintlig `oreToSie4Amount`
- Kronor med decimaler → öre: `"1234.50"` → `123450`, `"-500.25"` → `-50025`, `"1234"` → `123400`
- **Hanterar negativa belopp** — SIE4-belopp kan vara negativa (skulder, negativa IB).
  `Math.round(parseFloat(amount) * 100)` — signed, ingen abs().
- Notera: M137 (positiva belopp i DB) gäller vid *import till DB* (Fas 2), inte vid
  parsing. Parsern returnerar signerade öre-värden. Fas 2 ansvarar för sign-hantering.

#### 2. sie4-import-parser.ts (src/main/services/sie4/sie4-import-parser.ts)

Radbaserad tokenizer:
- **CP437→UTF-8 dekodning** via `iconv-lite` (redan installerat, INTE ny const-array).
  `iconv.decode(buffer, 'cp437')` konverterar hela filen.
- Escape-hantering: citerade strängar med `\"` escape, `\\` literal backslash
- Multi-line #VER-block med `{` `}` avgränsning
- Okända records ignoreras med **warning** (inte error) — defensiv parser

**Records som parsas:**

| Record | Hantering |
|--------|-----------|
| #FLAGGA | Flagga i header (1/0) |
| #PROGRAM | Programnamn + version |
| #FORMAT | PC8 (validera) |
| #GEN | Genereringsdatum + sign |
| #SIETYP | 1–4 (spara som metadata) |
| #FTYP | Företagstyp (AB, EF, etc.) |
| #ORGNR | Organisationsnummer |
| #FNAMN | Företagsnamn |
| #RAR | Räkenskapsår: index + from + to |
| #KPTYP | Kontoplanstyp (BAS95, BAS2024) |
| #VALUTA | Valuta (SEK) |
| #KONTO | Kontonummer + namn |
| #KTYP | Kontotyp (T/S/K/I) |
| #IB | Ingående balans: yearIndex + account + amount |
| #UB | Utgående balans: yearIndex + account + amount |
| #RES | Resultat: yearIndex + account + amount |
| #PSALDO | Periodsaldo: yearIndex + period + account + {} + amount |
| #VER | Verifikat: serie + nummer + datum + text + regdatum |
| #TRANS | Transaktion (inuti VER): account + {} + amount + date + text |
| #KSUMMA | Checksumma (CRC32 signed int) |

**SIETYP-hantering:** Parsern accepterar alla typer (1–4) men markerar i metadata.
Typ 1–3 har ingen VER/TRANS-data. Validatorn varnar om typ < 4 och inga VER finns.

**Returtyp:**
```typescript
interface SieParseResult {
  header: SieHeader  // program, format, sieTyp, orgNr, companyName, fiscalYears, currency, chartOfAccountsType
  accounts: SieAccount[]  // { number, name, type }
  openingBalances: SieBalance[]  // { yearIndex, accountNumber, amountOre }
  closingBalances: SieBalance[]
  periodBalances: SiePeriodBalance[]  // { yearIndex, period, accountNumber, amountOre }
  results: SieBalance[]  // RES-poster
  entries: SieEntry[]  // { series, number, date, description, regDate, transactions: SieTransaction[] }
  checksum: { expected: number | null; computed: number; valid: boolean }  // null om #KSUMMA saknas
  warnings: string[]  // okända records, saknade valfria fält
}
```

#### 3. KSUMMA-verifiering
- Återanvänd `calculateKsumma()` från `sie4-checksum.ts` (INGEN ny CRC32-implementation)
- Flöde: läs fil som Buffer → beräkna CRC32 på CP437-content UTAN #KSUMMA-raden → jämför med parsad #KSUMMA
- Om #KSUMMA saknas: `checksum.expected = null`, `valid = true` (valfritt fält)

#### 4. sie4-import-validator.ts (src/main/services/sie4/sie4-import-validator.ts)

```typescript
validateSieParseResult(result: SieParseResult): SieValidationResult
```

**Blockerande fel (errors):**
- E1: Verifikat obalanserat (sum debit ≠ sum credit per VER, tolerans ≤ 1 öre)
- E2: Verifikat med < 2 TRANS-rader
- E3: Duplicerade kontonummer i #KONTO-poster
- E4: KSUMMA mismatch (om expected !== null && !valid)
- E5: #RAR saknas (inget räkenskapsår definierat)

**Varningar (warnings, icke-blockerande):**
- W1: IB + movements ≠ UB per konto (om UB finns) — kan bero på saknade verifikat
- W2: Datum utanför RAR-intervall
- W3: SIETYP < 4 och inga VER-poster (förväntat men värt att visa)
- W4: Okänd kontoplanstyp
- W5: Verifikat inte i kronologisk ordning per serie

**Returtyp:**
```typescript
interface SieValidationResult {
  valid: boolean  // true om inga errors (warnings OK)
  errors: Array<{ code: string; message: string; context?: string }>
  warnings: Array<{ code: string; message: string; context?: string }>
  summary: {
    accounts: number
    entries: number
    lines: number
    fiscalYears: number
    sieType: number
    programName: string | null
    companyName: string | null
    orgNumber: string | null
  }
}
```

#### 5. Dry-run IPC-kanal
- `import:sie4-validate` — tar `{ filePath: string }`, returnerar `IpcResult<SieValidationResult>`
- Main-process öppnar filen direkt (filPath valideras av Zod: `z.string().min(1)`)
- Filval i renderer via `dialog.showOpenDialog` med filter `{ name: 'SIE', extensions: ['se', 'si', 'sie'] }`
- IPC-kanal för dialog: `import:sie4-select-file` — returnerar `IpcResult<{ filePath: string } | null>`
  (null = användaren avbröt)
- wrapIpcHandler (M128), IpcResult (M144)

#### 6. Tester (minst 30)

**Parser-tester:**
- Header-records: program, format, sieTyp, orgNr, fNamn, rar
- Kontoplan: konto + ktyp
- IB/UB: yearIndex 0 och -1
- VER/TRANS: serie, nummer, datum, text, multi-line block
- Escape-strängar: `\"` och `\\` inuti citerad text
- CP437-tecken: åäö, £, §, ² korrekt dekodade
- Okänd record (#OKÄND) → warning, inte error
- Tom fil → minimal header, inga entries
- SIETYP 1 (enbart saldon, inga VER) → parser returnerar tom entries[]
- Negativa belopp i IB/UB: korrekt parsade som negativa öre

**Amount-parser:**
- `"1234"` → `123400`
- `"1234.50"` → `123450`
- `"-500.25"` → `-50025`
- `"0"` → `0`
- `"-0.01"` → `-1`

**KSUMMA:**
- Känd checksumma matchar
- Modifierad fil → mismatch (valid: false)
- Saknad #KSUMMA → valid: true, expected: null

**Validator:**
- Balanserade verifikat → valid: true
- Obalanserade → error E1 med kontext (VER-nummer)
- <2 TRANS → error E2
- Duplicerade konton → error E3
- IB/UB-inkonsistens → warning W1

**IPC:**
- Schema-validering: tom filePath → error
- Dry-run med testfil → SieValidationResult

**Roundtrip (kritiskt):**
- Exportera SIE4 (befintlig export-service) → parsa tillbaka → jämför:
  - Samma antal konton, samma kontonamn
  - Samma antal verifikat, samma saldon per verifikat
  - IB/UB-belopp identiska
  - KSUMMA valid
- Denna test bevisar att parser och export är kompatibla

**Testfixtures:**
- `tests/fixtures/sie4-minimal.se` — minsta giltiga SIE4-fil (header + 1 konto + 1 VER)
- `tests/fixtures/sie4-full.se` — komplett fil med alla record-typer, åäö, kreditfaktura
- `tests/fixtures/sie4-invalid.se` — obalanserat verifikat, felaktig KSUMMA

### Regler
- **Återanvänd `iconv-lite`** (redan installerat) — INGEN ny dependency, INGEN const-array
- **Återanvänd `calculateKsumma()`** från sie4-checksum.ts — INGEN ny CRC32-implementation
- Alla belopp i öre internt (M119)
- Parser ska vara **defensiv**: okända records → warning, inte crash
- Negativa belopp tillåtna i parse-result (sign-hantering vid import = Fas 2)
- Inga databas-skrivningar i Fas 1 — enbart parsing + validering
- M128 (wrapIpcHandler), M144 (IpcResult), M100 (strukturerade fel)

---

## Feature 5b: SIE4-import — Fas 2: Databasimport (separat sprint)

### Kontext
Fas 1 levererar parser + validator + dry-run. Fas 2 använder det parsade
resultatet för att skriva till databasen. Denna fas är den mest designkritiska.

### Leverabler (skiss — detaljeras vid sprint-planering)

#### 1. Import-strategier
Två scenarion:
- **Ny databas (inget företag):** Full import — skapa company, fiscal year, accounts, IB, verifikat
- **Befintligt företag:** Kräver conflict resolution:
  - Konton: match på kontonummer, uppdatera namn vid diff, lägg till saknade
  - Verifikat: serie+nummer-unicity per FY — om kollision, ge ny serie (I = Import)
  - IB: merge eller ersätt (användarval)

#### 2. Import-service
- `importSie4(db, parseResult, options): IpcResult<ImportResult>`
- Options: `{ strategy: 'new' | 'merge', fiscalYearId?: number }`
- Allt i en `db.transaction()` — antingen importeras allt eller inget
- Sign-hantering: SIE4-belopp som är negativa (skulder) kan behöva sign-flip
  vid INSERT till tabeller som kräver positiva belopp (M137). Skuld-konton
  (klass 2) har naturligt negativa saldon i SIE4 men lagras som positiva
  i journal_entries med kredit > debet.

#### 3. UI: Import-wizard
- Steg 1: Välj fil (redan i Fas 1)
- Steg 2: Visa valideringsresultat + sammanfattning
- Steg 3: Välj strategi (ny/merge) + conflict-preview
- Steg 4: Bekräfta + importera + resultat

#### 4. Tester
- Full roundtrip: export → import → verify DB state = original
- Merge: befintliga konton + nya konton
- Sign-hantering: IB för skuld-konton korrekt
- Rollback vid fel mitt i import

### Denna fas planeras i detalj vid sprint-start efter Fas 1 är levererad.
