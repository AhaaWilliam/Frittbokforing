# Arbetsprocess: Bokföringssystem MVP

## Principer

1. **Planera här, bygga i Claude Code.** Chatten är för att tänka, diskutera och ta beslut. Claude Code är för att skriva kod, köra tester och deploya.
2. **En sak i taget.** Vi bygger i små, testbara delar. Aldrig mer än en komponent per session.
3. **Verifiera efter varje steg.** Inget nytt byggs innan det föregående fungerar och du sett det med egna ögon.
4. **Du äger besluten, Claude Code äger koden.** Du bestämmer vad som byggs. Claude Code bestämmer hur.

---

## Flöde per feature

```
┌──────────────────────────────────────────────────┐
│                                                  │
│  1. PLANERA (här i chatten)                      │
│     ├── Vad ska byggas?                          │
│     ├── Vad ser användaren?                      │
│     ├── Vad händer under huven?                  │
│     └── Klart när: du säger "kör"                │
│                                                  │
│  2. BYGGA (Claude Code i terminalen)             │
│     ├── Du klistrar in planen som prompt         │
│     ├── Claude Code genererar kod                │
│     ├── Du godkänner varje steg (y/n)            │
│     └── Klart när: koden körs utan fel           │
│                                                  │
│  3. TESTA (automatiserat — NYA STEGET)           │
│     ├── Kör invarianttester mot DB               │
│     │   psql -f tests/test_invariants.sql        │
│     ├── Alla 22 tester ska passera               │
│     ├── Om något fallerar → fixa innan steg 4    │
│     └── Klart när: 22/22 OK                     │
│                                                  │
│  4. VERIFIERA (du testar i webbläsaren)          │
│     ├── Öppna localhost:3000                     │
│     ├── Klicka igenom flödet                     │
│     ├── Fungerar det som planerat?               │
│     └── Klart när: du är nöjd                    │
│                                                  │
│  5. COMMIT + DOKUMENTERA (Claude Code)           │
│     ├── Committa med beskrivande meddelande      │
│     ├── Uppdatera decision_log.md                │
│     │   (vad byggdes, varför, viktiga beslut)    │
│     └── Klart när: git log visar committen       │
│                                                  │
│  → Nästa feature (tillbaka till steg 1)          │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## Byggordning Fas 1

Varje rad är en session. Komplexitet: 🟢 enkel (2-3h) | 🟡 medel (3-5h) | 🔴 komplex (5-8h+)

### Sprint 1: Grund (vecka 1)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 1 | Projektsetup | Next.js + TypeScript (strict) + Tailwind + shadcn/ui + **ESLint + Prettier** + DB-anslutning + withTenant() | localhost:3000 visar en sida, DB-anslutning fungerar, `npm run lint` passerar | 🟡 |
| 2 | Auth | Clerk integration (registrering, inloggning, utloggning) | Du kan skapa konto och logga in | 🟡 |
| 3 | Onboarding | Ny användare → skapa företag (namn, org.nr) → företag + räkenskapsår skapas i DB | Nytt företag syns i databasen | 🟡 |
| 3b | **Security audit** | Granska att set_tenant() alltid körs, att SECURITY DEFINER-funktioner har tenant-check, att ingen route saknar auth | Alla databasanrop går via withTenant() | 🟢 |
| 4 | Layout | Sidebar + navigation + autentiserad layout | Du kan navigera mellan sidor | 🟢 |

### Sprint 2: Kundfakturering (vecka 2)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 5 | Fakturamall | Formulär: kund, rader, moms beräknas auto (preview i frontend, **backend är source of truth**) | Du kan fylla i en faktura | 🟡 |
| 6 | Spara faktura | Server Action → skapar invoice + counterparty + auto-verifikation i DB. **Moms beräknas och valideras i backend.** | Faktura finns i DB med korrekt bokföring | 🟡 |
| 7 | Fakturalista | Lista alla fakturor med status (utkast/skickad/betald) | Du ser dina fakturor | 🟢 |
| 8 | Markera betald | Klick → skapar betalningsverifikation automatiskt | Verifikation stämmer i DB | 🟢 |

### Sprint 3: Leverantörsfakturor (vecka 2-3)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 9 | Registrera kostnad | Formulär: leverantör, belopp, moms, kategori (hyra/telefon/etc). **Moms valideras i backend.** | Kostnad sparad med korrekt bokföring | 🟡 |
| 10 | Betala kostnad | Markera betald → betalningsverifikation | Verifikation stämmer | 🟢 |
| 11 | Kostnadslista | Lista alla leverantörsfakturor med status | Du ser dina kostnader | 🟢 |

### Sprint 4: Dashboard + Rapporter (vecka 3)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 12 | Dashboard | KPI-kort: intäkter, kostnader, resultat, moms | Siffrorna stämmer med bokade verifikationer | 🟡 |
| 13 | Skatteprognos | Skatteberäkning enskild firma | Rimlig skatteuppskattning visas | 🟡 |
| 14 | Momsrapport | Momsdeklarationsunderlag per period | Rätt utgående/ingående moms | 🟡 |

### Sprint 5: Export + Polish (vecka 3-4)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 15 | SIE5-export (primär) | XML-export enligt SIE5 XSD, validering mot schema, digital signatur. **Testa mot golden test files. Roundtrip-test: export → import → diff (ingen dataförlust).** | Genererad fil validerar mot sie5.xsd, roundtrip matchar | 🔴 |
| 16 | SIE4-export (kompatibilitet) | Flat-text-export i SIE4-format för äldre system | Filen kan öppnas i Fortnox/Visma | 🟡 |
| 17 | E-post | Skicka faktura som PDF via Resend | Du får fakturan i din inbox | 🟡 |
| 18 | Polish + Excel-export | Felhantering, laddningstillstånd, tomma tillstånd, responsivt. **Structured logging. Sentry. XLSX-export (resultaträkning, balansräkning, huvudbok).** | Appen känns färdig, fel loggas, Excel-filer laddas ner korrekt | 🟡 |
| 18b | Power Query endpoints (bonus) | JSON-endpoints för live-koppling: `/api/data/income-statement`, `/api/data/balance-sheet`, `/api/data/general-ledger` | Excel Power Query kan hämta data via URL | 🟢 |
| 19 | Deploy | Vercel + Neon (produktionsdatabas) | Appen fungerar på en riktig URL | 🟡 |

**Session 15 — SIE5 i detalj:**

SIE5 är primärt exportformat. Vår v7-datamodell mappar nästan 1:1 mot SIE5-schemat:

```
Vår databas                    →  SIE5 XML
─────────────────────────────────────────────────
companies                      →  FileInfo/Company
fiscal_years                   →  FileInfo/FiscalYears/FiscalYear
accounts + opening_balances    →  Accounts/Account (med OpeningBalance/ClosingBalance)
dimensions                     →  Dimensions/Dimension/Object
journal_entries                →  Journal/JournalEntry
journal_entry_lines            →  JournalEntry/LedgerEntry
invoices (customer)            →  CustomerInvoices/CustomerInvoice
invoices (supplier)            →  SupplierInvoices/SupplierInvoice
fixed_assets                   →  FixedAssets/FixedAsset
counterparties (customer)      →  Customers/Customer
counterparties (supplier)      →  Suppliers/Supplier
attachments                    →  Documents/EmbeddedFile eller FileReference
budget_lines                   →  Account/Budget
corrects_entry_id              →  JournalEntry/CorrectedBy
locked_at + status='booked'    →  LockingInfo
registration_date + created_by →  EntryInfo
currency + original_amount     →  LedgerEntry/ForeignCurrencyAmount
```

Exportflöde i appen:
```
"Ladda ner för revisorn"       →  SIE5 (XML, signerad, med bilagor)
"Ladda ner för Fortnox/Visma"  →  SIE4 (bakåtkompatibilitet)
"Importera bokföring"          →  Acceptera både SIE4 och SIE5
```

---

## Hur en session ser ut i praktiken

### Exempel: Session 5 (Fakturamall)

**Steg 1 — Planera (här i chatten):**
Du: "Jag vill bygga fakturamallen"
Jag: Visar dig exakt vad som ska byggas, vad konsulten ser, vad som händer i DB
Du: "Kör"

**Steg 2 — Bygga (Claude Code):**
Du klistrar in planen i Claude Code. Den skapar filer, du godkänner.

**Steg 3 — Testa (Claude Code):**
Claude Code kör `psql -f tests/test_invariants.sql` → 22/22 OK

**Steg 4 — Verifiera:**
Du öppnar localhost:3000/invoices/new
Du fyller i en faktura
Du ser den i listan

**Steg 5 — Commit + Dokumentera:**
Claude Code committar och uppdaterar decision_log.md:
```
## Session 5: Fakturamall
- Byggde formulär med kund, rader, auto-momsberäkning
- Valde att beräkna moms i frontend (25% default) och verifiera i backend
- Moms beräknas per rad, inte på totalsumma (enligt SKV praxis)
```

**Klart.** Nästa session.

---

## Regler

1. **Bygg aldrig vidare på något som inte fungerar.** Om session 5 inte fungerar, fixar vi det innan session 6.
2. **Testa i webbläsaren OCH i databasen.** "Knappen fungerar" ≠ "bokföringen är korrekt". Kör invarianttester efter varje session.
3. **Committa efter varje session — alltid.** Claude Code committar automatiskt som sista steg. Om något går sönder kan vi alltid gå tillbaka.
4. **Om du fastnar: kom tillbaka hit.** Chatten är för problemlösning, Claude Code är för kodning.
5. **En feature = en prompt till Claude Code.** Inte "bygg hela appen", utan "bygg fakturamallen".
6. **Decision log efter varje session.** Claude Code uppdaterar `decision_log.md` med vad som byggdes, varför, viktiga beslut, och alternativ som övervägdes.
7. **Inget committas utan gröna tester.** Om invarianttesterna fallerar → fixa först, committa sedan.
8. **Linting måste passera.** `npm run lint` ska vara grönt innan commit. Sätts upp i session 1 och ändras aldrig.

---

## Arkitekturprinciper (för Claude Code)

Dessa principer gäller för all kod som genereras. Lägg dem i `CLAUDE.md` i projektroten.

1. **Fat DB, thin API.** All bokföringslogik (balanscheck, immutabilitet, periodlåsning, numrering) lever i databasen. API-lagret validerar input och anropar DB-funktioner.
2. **Backend är source of truth för moms.** Frontend visar preview, backend beräknar och validerar. Moms ska aldrig kunna manipuleras från klientsidan. **Avrundningsregel:** moms beräknas per fakturarad (`rad_belopp * momssats`, avrundat till heltal ören), sedan summeras. Öresavrundning på fakturatotalen (standard avrundning, inte banker's rounding — det är SKV-praxis).
3. **journal_entries är kärnan.** Allt annat (fakturor, kostnader, betalningar) är derivat som genererar verifikationer. Duplicera aldrig bokföringslogik.
4. **Aldrig ändra, bara korrigera.** Append-only. Bokförda poster ändras aldrig — bara korrigeringsverifikationer.
5. **Varje databasanrop via withTenant().** Inga undantag. Ingen direkt SQL utan tenant-kontext.
6. **TypeScript strict mode.** Inga `any`, inga implicit `undefined`. ESLint + Prettier formaterar all kod.
7. **Inga pengaberäkningar i floating point.** Alla belopp i ören (BIGINT i DB, heltal i TypeScript). Konvertering till kronor bara vid visning.

---

## API-referens per session

Inget separat API-lager — Next.js Server Actions och Route Handlers byggs som del av varje feature. Här är den kompletta listan.

### Infrastruktur (session 1-3)

```
src/lib/db.ts                          Session 1
├── pool                                DB connection pool
├── withTenant(companyId, userId, cb)   Tenant-isolerad transaktion
└── query(sql, params)                  Enkel query-wrapper

src/lib/auth.ts                        Session 2-3
├── getCurrentUser()                    Clerk → user_id
├── getCurrentCompany()                 Clerk metadata → company_id
└── requireAuth()                       Middleware: redirect om ej inloggad

src/lib/accounting.ts                  Session 6
├── createJournalEntry(client, data)    Skapar verifikation (draft)
├── bookJournalEntry(client, entryId)   Anropar book_journal_entry()
├── createInvoiceEntries(client, inv)   Kundfaktura → verifikationsrader
├── createPaymentEntries(client, inv)   Betalning → verifikationsrader
├── createExpenseEntries(client, exp)   Leverantörsfaktura → verifikationsrader
└── createExpensePayment(client, exp)   Betalning lev.faktura → rader

src/lib/tax.ts                         Session 13
├── calculateTaxEstimate(revenue, expenses)  Skatteprognos EF
└── TAX_CONSTANTS                       Skattetabell 2025

src/lib/sie5.ts                        Session 15
├── generateSIE5(companyId, fiscalYearId)    XML-export
└── validateSIE5(xml)                        XSD-validering

src/lib/sie4.ts                        Session 16
└── generateSIE4(companyId, fiscalYearId)    Flat-text-export

src/lib/email.ts                       Session 17
└── sendInvoiceEmail(invoiceId)         Faktura-PDF via Resend
```

### Server Actions (anropas från UI)

```
src/actions/company.ts                 Session 3
├── createCompany(name, orgNr)          Onboarding: skapar företag + FY + perioder
└── getCompanyInfo()                    Hämta företagsdata

src/actions/invoices.ts                Session 5-8
├── createInvoice(data)                 Skapa kundfaktura (draft)
├── updateInvoice(id, version, data)    Uppdatera utkast (optimistic lock)
├── deleteInvoice(id)                   Radera utkast (bara drafts)
├── sendInvoice(id)                     Bokför + skicka e-post
├── markInvoicePaid(id)                 Markera betald → betalningsverifikation
└── listInvoices(filters?)              Lista med status/sök

src/actions/expenses.ts                Session 9-11
├── createExpense(data)                 Registrera leverantörsfaktura
├── updateExpense(id, version, data)    Uppdatera utkast
├── deleteExpense(id)                   Radera utkast
├── markExpensePaid(id)                 Betala → betalningsverifikation
└── listExpenses(filters?)              Lista med status/sök

src/actions/dashboard.ts               Session 12-14
├── getDashboardData(period?)           Intäkter, kostnader, resultat, moms
├── getTaxEstimate()                    Skatteprognos
└── getVatReport(period)                Momsdeklarationsunderlag

src/actions/export.ts                  Session 15-16
├── exportSIE5()                        Generera + ladda ner SIE5
└── exportSIE4()                        Generera + ladda ner SIE4
```

### Route Handlers (REST — för framtida integrationer)

```
src/app/api/export/sie5/route.ts       Session 15
└── GET /api/export/sie5                 Ladda ner SIE5-fil

src/app/api/export/sie4/route.ts       Session 16
└── GET /api/export/sie4                 Ladda ner SIE4-fil

src/app/api/health/route.ts            Session 1
└── GET /api/health                      DB-anslutning + invariantcheck
```

### Dataflöde: Kundfaktura (komplett)

```
Konsulten klickar "Skapa faktura"
    │
    ▼
[Frontend] InvoiceForm.tsx
    │ onSubmit()
    ▼
[Server Action] createInvoice(data)
    │ await withTenant(companyId, userId, async (client) => {
    │   // 1. Skapa/hämta counterparty
    │   // 2. Skapa invoice (status='draft')
    │   // 3. Returnera invoice
    │ })
    ▼
[Frontend] Visar faktura i listan (status: Utkast)
    │
    │ Konsulten klickar "Skicka"
    ▼
[Server Action] sendInvoice(id)
    │ await withTenant(companyId, userId, async (client) => {
    │   // 1. Skapa journal_entry (draft) med rader:
    │   //    1510 debet (kundfordran)
    │   //    3001 kredit (intäkt)
    │   //    2610 kredit (utg moms)
    │   // 2. Anropa book_journal_entry() → status='booked'
    │   // 3. Uppdatera invoice status='unpaid'
    │   // 4. Skicka e-post med faktura-PDF
    │ })
    ▼
[Frontend] Faktura visas som "Skickad"
    │
    │ Konsulten klickar "Markera betald"
    ▼
[Server Action] markInvoicePaid(id)
    │ await withTenant(companyId, userId, async (client) => {
    │   // 1. Skapa journal_entry (draft) med rader:
    │   //    1930 debet (bankkonto)
    │   //    1510 kredit (kundfordran)
    │   // 2. Anropa book_journal_entry()
    │   // 3. Skapa invoice_payment
    │   // 4. Uppdatera invoice status='paid'
    │ })
    ▼
[Frontend] Faktura visas som "Betald" ✓
    │
    │ Dashboard uppdateras automatiskt
    ▼
[Server Action] getDashboardData()
    │ SELECT från v_income_statement, v_balance_sheet, v_vat_summary
    ▼
[Frontend] Visar: Intäkter +25 000 kr, Moms att betala 6 250 kr
```

---

## Checklista före start

- [x] PostgreSQL körs i Docker
- [x] Claude Code installerat
- [x] v7-schema migrerat och testat
- [x] Seed data (BAS-kontoplan, momskoder, exempelföretag)
- [x] SIE5 XSD-schema (sie5.xsd) — referens för SIE5-export
- [ ] Clerk-konto skapat (clerk.com — gratis tier)
- [ ] Resend-konto skapat (resend.com — gratis tier)
- [ ] Neon-konto skapat (neon.tech — gratis tier, behövs först vid deploy)
