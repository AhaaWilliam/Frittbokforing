# Arbetsprocess: Bokföringssystem — Lokal Desktop-app (Electron + SQLite)

## Produktvision

**"Fritt Bokföring"** — ett gratis, lokalt bokföringsprogram för svenska konsulter och frilansare (enskild firma). Ingen molntjänst, inget konto, ingen prenumeration. Ladda ner, installera, börja bokföra. Open source.

Konsulten ser aldrig bokföringstermer. Allt presenteras som pengar in, pengar ut, moms att betala, skatt att spara till.

---

## Tech Stack

| Komponent | Teknologi | Motivering |
|-----------|-----------|------------|
| Desktop-ramverk | **Electron** | Samma teknik som VS Code, Slack. Fungerar på macOS + Windows + Linux |
| Frontend | **React + TypeScript + Tailwind + shadcn/ui** | Samma UI-kod oavsett distribution |
| Databas | **SQLite (via better-sqlite3)** | Lokal fil, noll konfiguration, en fil per företag |
| Bygg/paketering | **electron-builder** | Skapar .dmg (macOS), .exe (Windows), .AppImage (Linux) |
| Auto-uppdatering | **electron-updater** | Kollar GitHub Releases vid start |
| E-post | **Öppna lokalt e-postprogram** (mailto: med PDF-bilaga) | Inga servrar behövs |
| Linting | **ESLint + Prettier** | Kodkvalitet |
| Distribution | **GitHub Releases** | Gratis, pålitligt |
| Hemsida | **GitHub Pages / Netlify** | Gratis |

**Vad som INTE behövs (jämfört med SaaS):**

| Borttaget | Varför |
|-----------|--------|
| ~~Clerk (auth)~~ | Ingen inloggning — en användare per installation |
| ~~Neon (databas)~~ | SQLite lokalt |
| ~~Vercel (hosting)~~ | Desktop-app, inga servrar |
| ~~RLS / multi-tenant~~ | En fil per företag, ingen delad databas |
| ~~SECURITY DEFINER~~ | Ingen tenant-isolering behövs |
| ~~withTenant()~~ | Ersätts med enkel `getDb()` som öppnar rätt SQLite-fil |
| ~~Idempotency keys~~ | Inget API att retrya |
| ~~Optimistic locking~~ | En användare |
| ~~Partitionerad audit log~~ | Overkill lokalt |
| ~~Stripe~~ | Gratis app |

---

## Projektstruktur

```
~/bokforingssystem/
├── src/
│   ├── main/                        ← Electron main process
│   │   ├── index.ts                 ← App lifecycle, fönsterhantering
│   │   ├── preload.ts               ← contextBridge — ENDA bryggan till renderer
│   │   ├── db.ts                    ← SQLite-anslutning, getDb(), PRAGMA WAL
│   │   ├── ipc-handlers.ts          ← Alla IPC-handlers samlade
│   │   ├── ipc-schemas.ts           ← Zod-scheman för all IPC-input
│   │   ├── accounting.ts            ← Auto-bokföring (skapa verifikationer)
│   │   ├── balance-check.ts         ← Balansvalidering (debet = kredit)
│   │   ├── tax.ts                   ← Skatteberäkning enskild firma
│   │   ├── sie5-export.ts           ← SIE5 XML-generator
│   │   ├── sie4-export.ts           ← SIE4 flat-text-generator (CP437-kodning)
│   │   ├── xlsx-export.ts           ← Excel-export
│   │   ├── pdf-generator.ts         ← Faktura-PDF
│   │   └── migrations/              ← SQLite-migrationer (med CHECK constraints)
│   │       ├── 001_base.sql
│   │       ├── 002_accounts.sql
│   │       └── ...
│   ├── renderer/                    ← React frontend (identisk med webbversion)
│   │   ├── App.tsx
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx        ← Intäkter, kostnader, moms, skatt
│   │   │   ├── Invoices.tsx         ← Kundfakturor
│   │   │   ├── InvoiceNew.tsx       ← Skapa faktura
│   │   │   ├── Expenses.tsx         ← Leverantörsfakturor
│   │   │   ├── ExpenseNew.tsx       ← Registrera kostnad
│   │   │   ├── TaxReport.tsx        ← Skatteprognos + momsdeklaration
│   │   │   └── Export.tsx           ← SIE4, SIE5, Excel
│   │   ├── components/
│   │   │   ├── ui/                  ← shadcn/ui
│   │   │   ├── InvoiceForm.tsx
│   │   │   ├── ExpenseForm.tsx
│   │   │   ├── DashboardCards.tsx
│   │   │   ├── TaxSummary.tsx
│   │   │   └── Sidebar.tsx
│   │   └── lib/
│   │       ├── ipc.ts              ← Kommunikation med main process
│   │       └── format.ts           ← Formatering (ören → kronor, datum)
│   └── shared/
│       └── types.ts                 ← Delade TypeScript-typer
├── tests/
│   ├── invariants.test.ts           ← Bokföringsinvarianter
│   ├── balance.test.ts              ← Debet = kredit
│   ├── immutability.test.ts         ← Append-only
│   └── sie-roundtrip.test.ts        ← Export → import → diff
├── seeds/
│   ├── bas-kontoplan.sql            ← Svenska BAS-konton
│   └── vat-codes.sql                ← Momskoder
├── CLAUDE.md                        ← Arkitekturprinciper för Claude Code
├── decision_log.md                  ← Beslutsdokumentation
├── package.json
├── tsconfig.json
├── electron-builder.yml             ← Paketeringskonfiguration
└── .eslintrc.js
```

---

## Dataflöde (Electron-arkitektur)

```
┌──────────────────────────────────────────────────────┐
│  Renderer process (React)                             │
│                                                       │
│  Användaren klickar "Skapa faktura"                   │
│  → Formulär fylls i                                   │
│  → Klick "Spara"                                      │
│  → ipcRenderer.invoke('create-invoice', data)         │
└───────────────────────┬──────────────────────────────┘
                        │ IPC (Inter-Process Communication)
┌───────────────────────▼──────────────────────────────┐
│  Main process (Node.js)                               │
│                                                       │
│  ipcMain.handle('create-invoice', async (e, data) =>  │
│    const db = getDb()                                 │
│    db.transaction(() => {                             │
│      // 1. Skapa/hitta motpart (counterparty)         │
│      // 2. Skapa faktura (invoice)                    │
│      // 3. Skapa verifikation (journal_entry)         │
│      // 4. Skapa rader (journal_entry_lines)          │
│      // 5. Validera balans (debet = kredit)           │
│      // 6. Bokför (status → booked)                   │
│    })                                                 │
│  )                                                    │
└───────────────────────┬──────────────────────────────┘
                        │ SQL
┌───────────────────────▼──────────────────────────────┐
│  SQLite (lokal fil)                                   │
│                                                       │
│  ~/Dokument/Fritt Bokföring/foretag.db               │
│                                                       │
│  Alla tabeller, all data, en enda fil                │
│  Backup = kopiera filen                               │
└──────────────────────────────────────────────────────┘
```

**Nyckelskillnad mot SaaS:** Kommunikationen sker via Electron IPC (Inter-Process Communication) istället för HTTP. Renderer (React) anropar main process (Node.js) som pratar med SQLite. Ingen nätverkstrafik.

---

## SQLite vs PostgreSQL — vad som ändras

All bokföringslogik som fanns i PostgreSQL-triggers måste flytta till applikationslagret (main process i Electron).

| v7 (PostgreSQL) | Lokal (SQLite + TypeScript) |
|---|---|
| `check_balance_on_booking()` trigger | `balanceCheck()` i TypeScript, körs i samma transaktion |
| `prevent_booked_modification()` trigger | `ensureImmutable()` check före varje operation |
| `prevent_booking_closed_period()` trigger | `checkPeriodOpen()` i TypeScript |
| `next_verification_number()` function | `getNextNumber()` — enklare, en användare, inga race conditions |
| `book_journal_entry()` SECURITY DEFINER | `bookEntry()` — vanlig funktion, ingen tenant-check behövs |
| RLS policies | Inte relevant — en fil per företag |
| Deferred constraint triggers | `db.transaction()` — allt valideras inom transaktionen |
| `EXCLUDE USING gist` | Manuell check i kod (SQLite saknar EXCLUDE) |
| Partitionerad audit_log | Enkel logg-tabell (volymen är liten lokalt) |

**Viktigt:** Valideringarna är *identiska* — debet måste vara lika med kredit, bokförda poster kan inte ändras, perioder kan stängas. Bara *var* de körs ändras (DB-triggers → TypeScript-funktioner).

---

## Principer

1. **Planera här, bygga i Claude Code.** Chatten är för att tänka och besluta. Claude Code är för kod.
2. **En sak i taget.** Aldrig mer än en session utan verifiering.
3. **Verifiera efter varje steg.** Testa i appen OCH kör automatiserade tester.
4. **Du äger besluten, Claude Code äger koden.**

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
│  3. TESTA (automatiserat)                        │
│     ├── npm test (invarianttester)               │
│     ├── Alla tester ska passera                  │
│     ├── Om något fallerar → fixa innan steg 4    │
│     └── Klart när: alla tester gröna             │
│                                                  │
│  4. VERIFIERA (du testar i appen)                │
│     ├── npm run dev (startar Electron)           │
│     ├── Klicka igenom flödet                     │
│     ├── Fungerar det som planerat?               │
│     └── Klart när: du är nöjd                    │
│                                                  │
│  5. COMMIT + DOKUMENTERA (Claude Code)           │
│     ├── Committa med beskrivande meddelande      │
│     ├── Uppdatera decision_log.md                │
│     ├── npm run lint måste passera               │
│     └── Klart när: git log visar committen       │
│                                                  │
│  → Nästa feature (tillbaka till steg 1)          │
│                                                  │
└──────────────────────────────────────────────────┘
```

---

## Byggordning Fas 1

Komplexitet: 🟢 enkel (2-3h) | 🟡 medel (3-5h) | 🔴 komplex (5-8h+)

### Sprint 1: Grund (vecka 1)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 1 | Projektsetup | Electron + React + TypeScript (strict) + Tailwind + shadcn/ui + ESLint + Prettier + SQLite (med **PRAGMA WAL**) + IPC-grundstruktur. **Electron-säkerhet: contextIsolation: true, nodeIntegration: false, sandbox: true, preload.ts med contextBridge. Zod installerat för IPC-validering.** | `npm run dev` öppnar Electron-fönster, SQLite-fil skapas med WAL, renderer har INTE access till Node.js/fs | 🔴 |
| 2 | Databasschema | SQLite-migrationer: accounts, fiscal_years, accounting_periods, journal_entries, journal_entry_lines, counterparties, invoices, vat_codes. Seed BAS-kontoplan + momskoder. **SQLite CHECK constraints: status IN ('draft','booked','corrected'), debit_amount >= 0, credit_amount >= 0, NOT(debit > 0 AND credit > 0). SQLite trigger: blockera UPDATE/DELETE på rader med status='booked'.** | Tabeller skapas, BAS-konton finns, constraints kastar fel vid ogiltig data | 🔴 |
| 3 | Onboarding | Första start → "Välkommen! Fyll i ditt företagsnamn och org.nr" → skapar företag + räkenskapsår + perioder | Företag skapas, appen visar dashboard | 🟢 |
| 4 | Layout + Navigation | Sidebar: Dashboard, Fakturor, Kostnader, Moms & Skatt, Export | Du kan navigera mellan alla sidor | 🟢 |

### Sprint 2: Kundfakturering (vecka 2)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 5 | Fakturamall | Formulär: kund, rader (beskrivning, antal, pris), moms beräknas auto (preview). **Backend (main process) är source of truth.** | Du kan fylla i en faktura | 🟡 |
| 6 | Spara + bokför faktura | IPC → skapar invoice + counterparty + journal_entry + lines i en transaktion. Balanscheck. Gaplös numrering. | Faktura + verifikation finns i DB, balans stämmer | 🟡 |
| 7 | Fakturalista | Lista alla fakturor med status (utkast/skickad/betald). Klickbar → detalj. | Du ser dina fakturor | 🟢 |
| 8 | Markera betald | Klick → skapar betalningsverifikation automatiskt | Verifikation stämmer i DB | 🟢 |

### Sprint 3: Leverantörsfakturor (vecka 2-3)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 9 | Registrera kostnad | Formulär: leverantör, belopp, moms, kategori (dropdown: hyra, telefon, material, etc.). **Moms valideras i main process.** | Kostnad sparad med korrekt bokföring | 🟡 |
| 10 | Betala kostnad | Markera betald → betalningsverifikation | Verifikation stämmer | 🟢 |
| 11 | Kostnadslista | Lista alla leverantörsfakturor med status | Du ser dina kostnader | 🟢 |

### Sprint 4: Dashboard + Rapporter (vecka 3)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 12 | Dashboard | KPI-kort: intäkter, kostnader, resultat, moms att betala | Siffrorna stämmer med bokade verifikationer | 🟡 |
| 13 | Skatteprognos | Skatteberäkning enskild firma (egenavgifter, kommunalskatt, statlig skatt) | Rimlig skatteuppskattning visas | 🟡 |
| 14 | Momsrapport | Momsdeklarationsunderlag per kvartal. Utgående - ingående = att betala. | Rätt utgående/ingående moms | 🟡 |

### Sprint 5: Export (vecka 3-4)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 15 | SIE5-export | XML-export enligt SIE5 XSD, validering mot schema. **Roundtrip-test: export → import → diff.** | Fil validerar mot sie5.xsd, roundtrip matchar | 🔴 |
| 16 | SIE4-export | Flat-text-export i SIE4-format. **OBS: CP437-teckenkodning krävs (ÅÄÖ). Testa att Fortnox/Visma kan importera.** | Filen kan öppnas i Fortnox/Visma utan teckenproblem | 🟡 |
| 17 | Excel-export | XLSX-export: resultaträkning, balansräkning, huvudbok. Via exceljs. | Excel-filer laddas ner korrekt | 🟡 |

### Sprint 6: Faktura-PDF + Polish (vecka 4)

| # | Session | Vad byggs | Verifiering | |
|---|---------|-----------|-------------|---|
| 18 | Faktura-PDF | Generera PDF av kundfaktura. Primärt: "Öppna i e-post" (mailto: med PDF). **Fallback: "Spara PDF" om mailto inte fungerar.** | PDF ser professionell ut, båda knappar fungerar | 🟡 |
| 19 | Backup + filhantering | **Automatisk backup vid app-start och app-stängning** (roterade: max 10 kopior med tidsstämpel). "Säkerhetskopiera nu" → manuell kopia. "Öppna annan bokföring" → byt SQLite-fil. Senaste filen öppnas vid start. **Backup-påminnelse om >7 dagar sedan senaste manuella backup.** | Auto-backup skapas, rotation fungerar, kan byta mellan företag | 🟡 |
| 20 | Polish | Felhantering, laddningstillstånd, tomma tillstånd (inga fakturor ännu), keyboard shortcuts, about-dialog med version | Appen känns färdig och professionell | 🟡 |
| 21 | Paketering + distribution | electron-builder → .dmg (macOS), .exe (Windows). Auto-updater via GitHub Releases. Hemsida (enkel landningssida). | Appen kan installeras från nedladdad fil | 🟡 |

---

## Hur en session ser ut i praktiken

### Exempel: Session 6 (Spara + bokför faktura)

**Steg 1 — Planera (här i chatten):**

```
Konsulten fyller i faktura och klickar "Spara & bokför"

Under huven (main process):
1. db.transaction(() => {
2.   Skapa/hitta counterparty
3.   Skapa invoice (status: 'unpaid')
4.   Skapa journal_entry (status: 'draft')
5.   Skapa journal_entry_lines:
        1510 Kundfordringar  debet  31250  (25000 + 6250 moms)
        3001 Försäljning            kredit 25000
        2610 Utg moms 25%          kredit  6250
6.   balanceCheck(entryId) — kastar error om debet ≠ kredit
7.   bookEntry(entryId) — status → 'booked', tilldela verifikationsnummer
8. })

Om steg 6 eller 7 misslyckas → hela transaktionen rollbackas.
Inget halvskrivet tillstånd kan uppstå.
```

Du: "Kör"

**Steg 2 — Bygga (Claude Code)**
**Steg 3 — Testa:** `npm test` → alla invarianttester gröna
**Steg 4 — Verifiera:** Öppna appen, skapa faktura, se att den dyker upp
**Steg 5 — Commit + Dokumentera**

---

## Regler

1. **Bygg aldrig vidare på något som inte fungerar.** Om session 5 inte fungerar, fixar vi det innan session 6.
2. **Testa i appen OCH automatiserat.** "Knappen fungerar" ≠ "bokföringen är korrekt". Kör `npm test` efter varje session.
3. **Committa efter varje session — alltid.** Om något går sönder kan vi alltid gå tillbaka.
4. **Om du fastnar: kom tillbaka hit.** Chatten är för problemlösning, Claude Code är för kodning.
5. **En feature = en prompt till Claude Code.** Inte "bygg hela appen", utan "bygg fakturamallen".
6. **Decision log efter varje session.** Vad som byggdes, varför, alternativ som övervägdes.
7. **Inget committas utan gröna tester.** `npm test` + `npm run lint` måste passera.
8. **Linting måste passera.** ESLint + Prettier konfigureras i session 1 och ändras aldrig.

---

## Arkitekturprinciper (för CLAUDE.md)

1. **All bokföringslogik i main process.** Renderer (React) visar data och tar emot input. Main process (Node.js) gör alla beräkningar och databasoperationer. Renderer gör aldrig SQL.
2. **Electron-säkerhet är icke-förhandlingsbar.** `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`. All IPC via `preload.ts` + `contextBridge`. Renderer har ALDRIG access till Node.js, `fs`, `process` eller SQLite.
3. **All IPC-input är untrusted.** Varje IPC-handler validerar input med Zod-schema innan den når databasen. Ingen data från renderer accepteras utan validering.
4. **Hybridmodell: kritiska invarianter i DB, affärslogik i TypeScript.** SQLite CHECK constraints (status, belopp ≥ 0, inte båda debet+kredit) och triggers (blockera UPDATE på bokförda poster) som sista försvarslinje. TypeScript-funktioner för affärslogik (momsberäkning, auto-kontering, skatteprognos).
5. **Backend (main process) är source of truth för moms.** Renderer visar preview, main process beräknar och validerar. **Avrundningsregel:** moms beräknas per fakturarad (belopp × momssats, avrundat till heltal ören), sedan summeras.
6. **journal_entries är kärnan.** Allt annat (fakturor, kostnader, betalningar) är derivat som genererar verifikationer. Duplicera aldrig bokföringslogik.
7. **Aldrig ändra, bara korrigera.** Append-only. Bokförda poster ändras aldrig — bara korrigeringsverifikationer. Enforced i både SQLite-trigger OCH TypeScript.
8. **TypeScript strict mode.** Inga `any`, inga implicit `undefined`. ESLint + Prettier formaterar all kod.
9. **Inga pengaberäkningar i floating point.** Alla belopp i ören (INTEGER i SQLite, number i TypeScript). Konvertering till kronor bara vid visning.
10. **Alla databasändringar i transaktioner.** `db.transaction(() => { ... })` — aldrig lösa INSERT/UPDATE utanför transaktion. SQLite i WAL-läge (`PRAGMA journal_mode = WAL`).
11. **IPC-gränssnitt är tydligt definierat.** Varje IPC-kanal har ett Zod-schema i `ipc-schemas.ts` och delade TypeScript-typer i `shared/types.ts`.

---

## Checklista före start

- [x] Claude Code installerat
- [x] SIE5 XSD-schema (sie5.xsd) — referens för export
- [ ] Node.js installerat (du har det via Claude Code-installationen)
- [ ] Electron fungerar (`npx create-electron-app test` → fönster öppnas)

**Inte längre behövs:**
- ~~PostgreSQL / Docker~~ (SQLite istället)
- ~~Clerk-konto~~ (ingen auth)
- ~~Resend-konto~~ (lokalt e-postprogram)
- ~~Neon-konto~~ (lokal databas)
