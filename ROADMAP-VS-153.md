# Roadmap — VS-153..VS-165

Skapad: 2026-05-03. Bygger vidare på VS-141..VS-152 (OCR-pipeline, push-notif moms, PDF-preview, ActivePeriodContext, mock-ipc audit).

## Översikt

13 sprintar fördelade på 3 teman som bygger på existerande arkitektur. Estimerad total scope: 35-45h. Varje sprint ≤5h så loopen kan köra dem autonomt.

| Tema | Sprintar | Tema-estimat | Varför nu |
|---|---|---|---|
| **A — Lön & AGI** | VS-153..VS-156 | 12-15h | `companies.has_employees`-flaggan finns sedan VS-120 men ingen löne-workflow. Mirror av VAT-arkitekturen (deadline + notif + bokföring). |
| **B — Inkomstdeklaration** | VS-157..VS-160 | 10-13h | K10/INK2-deadlines saknas helt. Notif-arkitekturen från VS-142 är återanvändbar. Förbereder för bokslut. |
| **C — Vardag-polish** | VS-161..VS-165 | 13-17h | VardagPageSpend save är gammalt backlog-item (STATUS.md). Övriga är UX-vinster ovanpå färdig arkitektur. |

---

## Tema A — Lön & AGI (VS-153..VS-156)

### VS-153 — AGI-deadline-beräkning + push-notif (~3h)

**Mål:** Mirror av VS-115b/VS-142 fast för Skatteverket arbetsgivardeklaration (AGI).

**Bakgrund:** Företag med anställda måste lämna AGI senast den 12:e i månaden efter löneutbetalningen (eller nästa bankdag om helg). Push-notif 7/3/1 dagar innan om `companies.has_employees=1`.

**Beslut taget (default):**
- Använd VS-115b/129 helg-bump-algoritm (publik export)
- Samma toggle-mönster som `notify_vat_deadline` (VS-142): nytt fält `notify_agi_deadline` i companies
- Eskalering 7/3/1 dagar (samma som VS-142)
- Klick på notif → navigerar till `/manual-entries` (där löne-bokföring sker)

**Implementation:**
- `src/shared/agi-deadline.ts` — `computeAgiDeadline(year, month): string` (12:e nästa månad → bumpToNextWorkday)
- Migration 063: `companies.notify_agi_deadline INTEGER NOT NULL DEFAULT 0`
- Settings-UI: ny toggle under has_employees-toggle
- Notifier: utvidga eller spegla `vat-deadline-notifier.ts`
- Tester: ~10 (deadline-beräkning + helg-edge cases + notifier)

**Filer att läsa:** `src/shared/vat-deadline.ts`, `src/main/services/vat-deadline-notifier.ts`, `src/renderer/pages/PageSettings.tsx`

---

### VS-154 — Lön-bokföringsmall (~4h)

**Mål:** UI där användaren matar in en löne-utbetalning och systemet genererar verifikat (D 7010 brutto, D 7510 arb.giv.avg, K 2710 prel.skatt, K 2730 arb.giv.avg, K 1930 netto till bank).

**Beslut taget (default):**
- Manuell mall (ingen integration mot Skatteverket-API i v1)
- Ett verifikat per löne-utbetalning per anställd (inte aggregerat per period — BFL 5 kap kräver spårbarhet)
- C-serie (manuell), `source_type='salary_payment'`
- Använd existerande manual-entry-pipeline (M142 chronology-check)

**Implementation:**
- Ny page `/payroll` eller dialog under PageManualEntries
- Form: anställd-namn (fri text v1, ingen employee-tabell), brutto, prel.skatt, period-start/end
- Beräkna automatiskt: arbetsgivaravgifter via VS-155 satser
- Submit → manual entry med 5 rader
- Tester: ~8 (form-validering, beräkning, paritet med expected-verifikat)

**Filer att läsa:** `src/main/services/manual-entry-service.ts`, `src/renderer/pages/PageManualEntries.tsx`

---

### VS-155 — Skattetabell + arbetsgivaravgifter konstanter (~2h)

**Mål:** Pure-funktioner för svenska socialavgifter 2025/2026.

**Beslut taget (default):**
- Standardsats: 31.42% (full arb.giv.avg)
- Reducerad sats: 19.73% (under 26 år, första anställning)
- Pensionärer (66+ år född 1939+): 10.21% endast ålderspensionsavgift
- Hardkoda för 2025/2026 i `src/shared/payroll-rates.ts` — uppdatera årligen via PR

**Implementation:**
- `src/shared/payroll-rates.ts` — `getEmployerContributionRate(birthYear, year): number` (returns t.ex. 0.3142)
- `getEmployerContributionOre(grossOre, birthYear, year): number` — heltalsaritmetik (M131-mönster)
- Tester: ~10 (alla satser × edge-fall)
- Konsumeras av VS-154

**Filer att läsa:** `src/shared/money.ts` (M131 helpers)

---

### VS-156 — Lön-historik-vy (~3h)

**Mål:** Lista över alla löne-events under aktivt FY, med drilldown till verifikatet.

**Beslut taget (default):**
- Filter `source_type='salary_payment'` på journal_entries
- Visar: datum, anställd-namn, brutto, netto till bank, verifikat#
- Klick → öppnar verifikatet i bokförare-läge
- Ingen redigering — append-only via korrigeringsverifikat (M140)

**Implementation:**
- Ny IPC `payroll:list-payments` (IpcResult, M144)
- Page `/payroll-history` eller flik under PageManualEntries
- Tester: ~5 (lista, filter på FY, sortering, empty state)

---

## Tema B — Inkomstdeklaration (VS-157..VS-160)

### VS-157 — K10/INK2-deadline-beräkning (~2h)

**Mål:** Pure-funktioner för svenska årsdeklaration-deadlines.

**Beslut taget (default):**
- INK2 (aktiebolag) deadline: 1 juli år+1 (digital), 1 maj år+1 (papper). Vi defaultar digital.
- K10 (fåmansbolag, bilaga till INK2): samma deadline som INK2
- Bumpa till nästa bankdag om helg (helg-bump från VS-129)
- Beräknas från `fiscal_years.fiscal_year_end`

**Implementation:**
- `src/shared/income-tax-deadline.ts` — `computeIncomeTaxDeadline(fyEnd: string, mode: 'digital'|'paper'): string`
- Tester: ~6 (kalenderår vs brutet räkenskapsår, helg-bump, mode-skillnad)

---

### VS-158 — Push-notif INK2/K10 (~2h)

**Mål:** Spegla VS-142/VS-153-arkitekturen för årsdeklaration.

**Beslut taget (default):**
- En toggle: `companies.notify_income_tax_deadline` (täcker både INK2 och K10)
- Eskalering 30/14/7 dagar (årsdeklaration är längre framförhållning än moms)
- Klick → navigerar till `/reports` (där BR/RR finns för deklarationen)

**Implementation:**
- Migration 064: `companies.notify_income_tax_deadline INTEGER NOT NULL DEFAULT 0`
- Settings-UI: ny toggle
- Notifier: utvidga `vat-deadline-notifier.ts` → rename `deadline-notifier.ts` (allmän)
- Tester: ~8

---

### VS-159 — Aktieägar-register CRUD (~3h)

**Mål:** Lagra ägare för fåmansbolag — krav för K10-bilagan.

**Beslut taget (default):**
- Ny tabell `shareholders` med company_id, namn, person-nr, andel_promille, anskaffningskostnad_ore
- M122 mönster (cross-bolag-skydd via FK)
- M158 (per-bolag scope)

**Implementation:**
- Migration 065: `shareholders` (id PK, company_id FK, name TEXT, personal_number TEXT, share_promille INTEGER, acquisition_cost_ore INTEGER)
- IPC: list/create/update/delete (M144 IpcResult)
- Page `/shareholders` eller flik under PageSettings
- Tester: ~10 (CRUD + cross-bolag-skydd + andel-summering)

---

### VS-160 — K10 PDF-utkast (~5h)

**Mål:** Generera PDF som mall för K10-bilagan baserat på shareholders-data och bokföring.

**Beslut taget (default):**
- Återanvänd existerande PDF-stack (`src/main/services/pdf/`)
- Inte officiell SKV-form (kräver SKV-XML-export, separat projekt) — bara underlag för revisor
- Layout: ägare, andelar, gränsbelopp (förenklingsregeln 2.75 IBB), utdelning från företaget
- Visa varning "Detta är ett UTKAST — verifiera mot SKV-blankett före inlämning"

**Implementation:**
- `src/main/services/pdf/k10-draft-service.ts`
- IPC `k10:generate-pdf` med save-dialog (M147 bypass)
- Knapp i ny `/k10`-page eller PageSettings
- Tester: ~5 (snapshot på PDF-text, edge-cases för andelar)

**OBS:** Detta är gränsen för 5h. Komplext. Om sprinten överstiger, bryta i a/b.

---

## Tema C — Vardag-polish (VS-161..VS-165)

### VS-161 — VardagPageSpend save med auto-kontoallokering (~3h)

**Mål:** Stänga STATUS.md-backlog-item. VardagPageSpend ska kunna spara expense draft.

**Beslut taget (default):**
- Auto-konto-strategi:
  1. Om counterparty har `default_expense_account` → använd den
  2. Annars: 6230 (övriga övriga kostnader, mest generisk)
  3. Visa edit-knapp så användaren kan ändra inline om fel
- Single-line submit (ingen multi-line — det hänvisar till bokförare-läget per M162)

**Implementation:**
- Wira VardagPageSpend till `useSaveExpenseDraft` (samma hook som BokforKostnadSheet)
- Auto-konto-helper i `src/renderer/lib/vardag/auto-account.ts`
- Inline override via `<select>` av accounts (filtrerade till 6xxx-7xxx)
- Tester: ~5 (default fall, override, fel-state)

---

### VS-162 — Vardag swipe/keyboard navigation (~2h)

**Mål:** Pil-tangenter (← →) växlar mellan Vardag-sheets (Inbox / Spend / Income / Status).

**Beslut taget (default):**
- Tangentbordsbinding (ingen touch-swipe i v1 — Electron-desktop-fokus)
- Hoppar bara mellan vardag-routes, inte ut till bokförare-läge
- Indikator-prickar (1/4) under bottom-nav visar position
- Cmd+Left/Right alternativ (för Mac som har ← →-system-shortcuts)

**Implementation:**
- KeyboardShortcut-helper i VardagApp
- Tester: ~4

---

### VS-163 — Quick-record kontantbetalning (~3h)

**Mål:** Användaren kan registrera "Jag betalade 250 kr kontant för parkering" utan kvitto-attach.

**Beslut taget (default):**
- Ny knapp i Vardag-Inbox: "Snabbkostnad"
- Sheet: belopp + datum + kort beskrivning + auto-konto (samma logik som VS-161)
- Ingen counterparty (anonym kostnad ok för småbelopp)
- Status: 'unpaid' → kan attacha kvitto senare via PageInbox
- BFL 5 kap: kvitto-krav är fortfarande på användaren — vi varnar i sheet:n om belopp > 100 kr

**Implementation:**
- Ny QuickExpenseSheet (mirror BokforKostnadSheet, slimmare)
- Återanvänd `buildQuickExpensePayload` (M162)
- Tester: ~6

---

### VS-164 — SkapaFakturaSheet kreditnote-mode (~3h)

**Mål:** En toggle/knapp i SkapaFakturaSheet som flippar form till kreditnote-läge för en specifik original-faktura.

**Beslut taget (default):**
- "Skapa kreditnote"-knapp i InvoiceList row (öppnar SkapaFakturaSheet med pre-fyllt original-id)
- Form: belopp redigerbart (default = original-belopp), rader pre-kopierade
- M137 sign-flip i journal-byggaren (positiva belopp i DB)
- M138 defense-in-depth + M139 cross-reference + M140 en-gångs-lås

**Implementation:**
- Pre-fyll-helper `buildCreditNoteFromInvoice(originalId)`
- UI: röd badge "Kreditnote" + locked counterparty
- Tester: ~6 (pre-fyll, sign-flip, kan inte krediteras igen)

---

### VS-165 — Vardag keyboard cheatsheet (~2h)

**Mål:** ?-knappen visar overlay med alla Vardag-tangentbindingar (mod+k, ← →, Esc, Cmd+Enter).

**Beslut taget (default):**
- Modal med Radix Dialog
- Lista bindings i 2 kolumner: vardag, sheets-specifika
- Trigger: ? eller Shift+/
- Stängs med Esc

**Implementation:**
- KeyboardCheatsheet-komponent
- Hook in i VardagApp + ev. AppShell för bokförare-läget framtida)
- Tester: ~4 (öppna, stäng, focus-trap)

---

## Sammanfattning

| Sprint | Tema | Estimat | Beroenden |
|---|---|---|---|
| VS-153 | A | 3h | VS-115b helg-bump |
| VS-154 | A | 4h | VS-155 (samma sprint OK) |
| VS-155 | A | 2h | M131 |
| VS-156 | A | 3h | VS-154 |
| VS-157 | B | 2h | VS-115b helg-bump |
| VS-158 | B | 2h | VS-142 notifier |
| VS-159 | B | 3h | M122/M158 |
| VS-160 | B | 5h | VS-159, PDF-stack |
| VS-161 | C | 3h | M162, BokforKostnadSheet |
| VS-162 | C | 2h | VardagApp routing |
| VS-163 | C | 3h | M162, VS-161 |
| VS-164 | C | 3h | M137-M140 (kredit-arkitektur klar) |
| VS-165 | C | 2h | Radix Dialog (M156) |

**Total: ~37h över 13 sprintar.**

## Beslut som öppna frågor (jag har gissat defaults)

Jag har valt sensible defaults för varje sprint så loopen kan köra utan check-in. Men dessa är inga officiella produktbeslut — säg till om du vill avvika:

1. **VS-155 satser:** hardkodade 2025/2026 i kod (vs. settings-tabell). Settings-tabellen är säkrare för framtida-årsuppdatering men addas senare.
2. **VS-160 K10-utkast vs full SKV-XML:** PDF-utkast (för revisor) är 5h. Officiell SKV-XML-export är ~20h och kräver SIE-XML-bibliotek. Default = utkast.
3. **VS-161 default-konto 6230:** kanske 6991 (övriga externa kostnader) är mer korrekt? Säg till om annan default önskas.
4. **VS-163 kvitto-varning:** 100 kr-tröskel är godtyckligt. SKV har inte hård gräns — varningen är best-practice.

## Om loop-arbete

Roadmap är optimerad för autonom körning:
- Varje sprint är ≤5h (under tröskel a)
- Inga sprintar har "BLOCKED på decision" (alla har defaults)
- Tema A → B → C ger naturlig progression (A bygger fundament för B; C är polish)
- Loop kan stoppa mellan teman om granskning behövs

## Föreslagen startprompt

```
loop kör VS-153..VS-156 (Tema A — Lön & AGI) enligt ROADMAP-VS-153.md.
Stoppa loopen om någon sprint avviker från plan eller blir röd.
```

Eller en sprint i taget (säkraste varianten):

```
loop kör VS-153 (AGI-deadline + push-notif) enligt ROADMAP-VS-153.md.
Stoppa när committad.
```
