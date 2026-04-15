# Sprint 30 — Kontoutdrag-UI + Korrigeringsverifikat

## Kontext

Sprint 29 levererade UX-polish (F50–F56) och AccountStatementService (B2 backend).
Service + IPC-kanal (`account:get-statement`) ar klara med 7 tester. Renderer-sida
saknas. Kreditfakturor (S28) etablerade M137–M139. 0 oppna findings, 0 tsc-fel.

Denna sprint har tva leveranser:
1. **B2 UI** — kontoutdrag-sidan (service redo, snabb vinst)
2. **B4** — korrigeringsverifikat (tyngst, domanskritisk)

B3 (global sokning) skjuts till Sprint 31 — mest fristaende, kan byggas nar
som helst utan kontextforlust.

**Testbaslinje:** 1604 vitest passed, 2 skipped (150 testfiler). 11 Playwright E2E.
**Mal:** ~1640+ efter sessionen.
**PRAGMA user_version:** 30. Ingen ny migration for B2 UI. Migration 031 for B4.

---

## Relevanta M-principer (inline-sammanfattning)

- **M93:** closePeriod/reopenPeriod kor alltid inom db.transaction().
- **M100:** Services kastar strukturerade `{ code, error, field? }`. Aldrig `throw new Error`.
- **M128:** Handlers: direkt delegation eller `wrapIpcHandler()`.
- **M137:** Positiva belopp i DB. Doman-semantik appliceras i journal-byggaren.
- **M138:** Irreversibla relationer skyddas i 4 lager: DB-constraint, service-guard,
  UI-doljning, visuell indikator.
- **M139:** Korsrefererade transaktioner inkluderar referens i description.

---

## 0. Pre-flight

```bash
npm run test        # 1604 passed, 2 skipped (150 testfiler)
npm run typecheck   # 0 errors
npm run check:m131  # rent
npm run check:m133  # rent
npm run build       # rent
```

---

## Del A: B2 UI — Kontoutdrag-sidan

### Vad som redan finns

- **Service:** `src/main/services/account-statement-service.ts` — `getAccountStatement(db, input)`
- **IPC-kanal:** `account:get-statement` med Zod-schema `AccountStatementInputSchema`
- **Preload:** `window.api.getAccountStatement(data)` — returnerar `IpcResult<AccountStatement>`
- **electron.d.ts:** Typat korrekt
- **Tester:** 7 service-tester (empty, running balance, datumfilter, drafts exkluderade, FY-grans)

### Service-utvidgning: summary-objekt (Q2)

**Innan UI byggs:** Utvidga servicen med ett `summary`-objekt i returtypen.
Att berakna totaler fran "sista radens running_balance" ar fragilt (bryter
vid tom lista, eventuell framtida sortering, virtualisering). 3 rader extra
i servicen eliminerar en hel klass av buggar.

Utvidga `AccountStatement`-returtypen:
```ts
interface AccountStatement {
  account_number: string
  account_name: string
  lines: AccountStatementLine[]
  summary: {
    opening_balance_ore: number  // running_balance fore forsta raden (0 om ingen IB)
    total_debit_ore: number
    total_credit_ore: number
    closing_balance_ore: number  // = opening + total_debit - total_credit
    transaction_count: number
  }
}
```

Berakna `summary` i service-lagret efter rad-ackumuleringen. Uppdatera
befintliga 7 tester att assertera summary-falten. Uppdatera `electron.d.ts`.

### FY-scoping (Q1 — non-issue, dokumenterat for klarhet)

Servicens SQL har `AND je.fiscal_year_id = :fy`. Datumfiltret kan **aldrig**
korsa FY-gransen — queryn returnerar enbart rader inom aktivt FY.
"Senaste 3 manader" ar en UI-default som klipps av FY-gransen automatiskt.
Inget multi-FY-stod behovs.

### Ny route och navigation

**Route:** Lagg till i `src/renderer/lib/routes.ts`:
```ts
{ pattern: '/account-statement', page: 'account-statement' },
```

**AppShell:** Lagg till case i `src/renderer/pages/AppShell.tsx`:
```ts
case 'account-statement':
  return <PageAccountStatement />
```

**Sidebar:** Lagg till under "Rapporter"-sektionen i `src/renderer/components/layout/Sidebar.tsx`
(mellan "Rapporter" och "Moms"):
```tsx
<SidebarLink to="/account-statement" icon={ScrollText} label="Kontoutdrag" testId="nav-account-statement" />
```

Importera `ScrollText` fran lucide-react. Om den inte finns, anvand `BookOpen`
(redan importerad men oanvand). Undvik `FileText` (anvands av Bokforingsorder).

### Sidans layout

**Monstret:** Enkel sida (som PageAccounts, PageReports) — INTE EntityListPage.
Kontoutdrag ar en rapport, inte en CRUD-lista.

**Fil:** `src/renderer/pages/PageAccountStatement.tsx`

**UI-struktur:**

```
+-----------------------------------------------+
| PageHeader: "Kontoutdrag"                     |
+-----------------------------------------------+
| Konto: [Dropdown: 1510 Kundfordringar  v]     |
| Period: [2026-01-15] — [2026-04-15]           |
|         [Visa hela rakenskapsaret]             |
+-----------------------------------------------+
| Datum  | Ver.nr | Beskrivning | Debet | Kredit | Saldo |
|--------|--------|-------------|-------|--------|-------|
| 01-01  | O1     | Ingaende... |  5000 |        |  5000 |
| 01-15  | A1     | Faktura #1  | 12500 |        | 17500 |
| 02-01  | A5     | Betalning   |       | 12500  |  5000 |
+-----------------------------------------------+
| Summa debet: 17 500 | Summa kredit: 12 500    |
| Utgaende saldo: 5 000 kr (D)                  |
+-----------------------------------------------+
```

### UI-tillstand (Q5)

Fyra explicita tillstand:
1. **Inget konto valt:** "Valj ett konto for att visa kontoutdrag."
2. **Laddning:** `<LoadingSpinner />` (befintlig komponent)
3. **Tom lista:** "Inga transaktioner for detta konto i vald period."
4. **Fel:** `<div role="alert">` med felmeddelande fran IPC

**Drill-down (klick pa rad → oppna verifikat): EXPLICIT OUT OF SCOPE.**
Laggs som backlog-kandidat for Sprint 31 nar verifikatvy finns som
fristaaende sida.

### Kontoval (dropdown)

- Hamta kontolista via befintlig `useAllAccounts()` hook
- Dropdown: `<select>` med `account_number + ' ' + name`
- Grupperat per klass (1=Tillgangar, 2=Skulder, 3=Intakter, etc.) via
  `ACCOUNT_CLASS_NAMES` fran PageAccounts.tsx
- **Default:** Inget konto valt.
- Anvand `useAccountStatement()` hook med `enabled: !!selectedAccount`

### Datumfilter

- **Default:** Senaste 3 manaderna (beraknat fran `todayLocal()`).
  Berakna `date_from` som: ta today, subtrahera 3 fran manadssiffran.
  Hantera underflow (jan→okt forega ar). **Klipp mot FY start_date**
  om resultatet hamnar fore FY-start.
  `date_to` = `todayLocal()` (klippt mot FY end_date).
- **Input:** Tva `<input type="date">` falt med labels "Fran" och "Till"
- **Knapp:** "Visa hela rakenskapsaret" — satter date_from/date_to till FY start/end
- **Tidszonsinvariant:** Datum ar strangar (`YYYY-MM-DD`). Anvand ALDRIG
  `new Date(dateString)` for jamforelse. `todayLocal()` returnerar strang.
- **Edge cases att testa:** manadsslut (mars 31 - 3 man = dec 31), arsskifte

### Tabell

- Kolumner: Datum, Ver.nr (serie + nummer, t.ex. "A1"), Beskrivning, Debet, Kredit, Saldo
- **Debet/Kredit:** Visa i kronor via `formatReportAmount()` fran format.ts. Visa tom cell om 0.
- **Saldo med (D)/(K)-suffix:** `running_balance_ore > 0` → "(D)", `< 0` → "(K)", `=== 0` → "0,00".
  Anvand `formatReportAmount(Math.abs(running_balance_ore))` + suffix.
  **OBS sign-konvention (Q3):** For klass 2 (skulder) och 3 (intakter) ar negativt saldo
  "normalt". UI visar alltid ra saldo med (D)/(K) — ingen kontoklassbaserad flip.
  Revisorer forvantar sig detta format.
- **Summeringsrad:** Anvand `summary` fran service-svaret (Q2).
- **Tom tabell:** "Inga transaktioner for detta konto i vald period."

### Hook

Skapa `useAccountStatement` i `src/renderer/lib/hooks.ts`:
```ts
export function useAccountStatement(
  fiscalYearId: number | undefined,
  accountNumber: string | undefined,
  dateFrom?: string,
  dateTo?: string,
) {
  return useQuery({
    queryKey: ['account-statement', fiscalYearId, accountNumber, dateFrom, dateTo],
    queryFn: () => window.api.getAccountStatement({
      fiscal_year_id: fiscalYearId!,
      account_number: accountNumber!,
      date_from: dateFrom,
      date_to: dateTo,
    }),
    enabled: !!fiscalYearId && !!accountNumber,
  })
}
```

### Tester

- Service-test: summary-objekt stammer (total_debit, total_credit, closing_balance)
- Service-test: summary for tom lista (alla nollor)
- Renderer-test: sidan renderar med konto-dropdown
- Renderer-test: tabell renderar rader med korrekt debet/kredit/saldo-kolumner
- Renderer-test: tom vy nar inget konto valt
- Renderer-test: "Visa hela rakenskapsaret"-knapp andrar datumfilter
- Renderer-test: saldo visar (D)/(K)-suffix korrekt for skuld-konto (klass 2)
- Renderer-test: summeringsrad visar service-summary
- axe-check (M133)

**Definition of Done:** Kontoutdrag-sidan visar korrekt lopande saldo med summary,
datumfilter fungerar, tom vy vid inget konto. Navigerbar fran sidomenyn.

---

## Mellan Fas 1 och Fas 2: Design-beslut for B4

Foljande fragar MASTE besvaras fore Fas 2 borjar. Varje beslut tar <5 min
men om de missas maste service och UI byggas om.

### Q11 — Cross-FY-korrigering (period closure)

**Scenario:** Original verifikat fran FY2025 (stangt). Anvandaren vill korrigera
idag (FY2026, oppet). Trigger `trg_check_period_on_booking` blockerar bokning
i stangt FY, sa korrigeringen MASTE bokas i FY2026.

**Beslut: Tillat cross-FY-korrigering.**
Motivering: Bokforingslagen (BFL 5 kap 5§) kraver att rattelse i avslutad
period bokfors i pagaende period med tydlig referens. M139 hanterar referensen.
`corrects_entry_id` har ingen FY-scope-constraint (verifierat i schema-audit).

**Konsekvens for service:** Korrigeringsverifikatets `fiscal_year_id` ar
inputparametern (aktivt FY), INTE originalets FY. `journal_date = todayLocal()`.
Guarden "FY maste vara oppet" galler korrigeringens FY, inte originalets.

### Q12 — Korrigering av korrigering

**Beslut: Forbjud.**
Guard: `WHERE corrects_entry_id IS NULL` pa originalet. Korrigeringsverifikat
har `corrects_entry_id` satt → kan inte sjalva korrigeras. Kedje-korrigeringar
skapar komplexitet utan affarsnytta. Om ett korrigeringsverifikat ar fel:
skapa nytt manuellt verifikat (C-serie) som justerar.

### Q15 — Terminologi

Kodbasen anvander "makulera" for fakturor (trigger-meddelande i migrations.ts).
For betalningar: anvand **"Aterfor betalningarna forst"** — mer precist an
"makulera" for betalningskontext.

---

## Del B: B4 — Korrigeringsverifikat

### Befintlig infrastruktur

**DB-schema (redan pa plats):**
- `journal_entries.corrects_entry_id` — FK till det verifikat som korrigeras
- `journal_entries.corrected_by_id` — FK till korrigeringsverifikatet
- `status IN ('draft', 'booked', 'corrected')` — CHECK-constraint

**Immutability-trigger (migration 011/018/021):**
- Bokforda verifikat kan BARA andra `status` (→ 'corrected') och `corrected_by_id`
- Alla andra falt (journal_date, description, verification_number, etc.) ar lasta
- Rader pa bokforda verifikat kan inte andras/raderas/laggas till
- **Sakehetslucka (Q10/Q9):** 9 kolumner ar INTE skyddade av triggern.
  Se Migration 031 nedan.

**Serier:** A (fakturor), B (kostnader), C (manuella + arsbokslut), O (IB)

### Design-beslut

**Serie for korrigeringsverifikat: C-serie.**
Motivering: Korrigering ar en manuell atgard (revisionsmassig) — samma kategori
som manuella bokforingsorder. Ny serie (t.ex. 'K') kraver schema-andring och
ger inget semantiskt varde. C-serie ar redan etablerad och numreras oberoende
per FY.

**Visuell sarskilning (Q13):** C-serie-verifikat med `corrects_entry_id IS NOT NULL`
visas med badge "Korrigering" + lank till originalet i alla listvyer. Skiljs
fran manuella C-serie via `source_type` eller FK-forefintlighet.

**Korrigeringslogik: Omvanda rader (inte diff-baserad).**
Korrigeringsverifikatet skapar exakt omvanda rader fran originalet: varje
originalrad med debet_ore=X kredit_ore=Y → korrigeringsrad med debet_ore=Y
kredit_ore=X. Net-effekt: original + korrigering = 0 pa varje konto.

### Guards (M138 — 4 lager)

1. **DB-constraint:** FK `corrects_entry_id REFERENCES journal_entries(id)`.
   `corrected_by_id` setts atomart vid korrigering.
   **Ny trigger (migration 031):** Forbjud `UPDATE status = 'corrected'`
   om det finns beroende payments (Q8, defense-in-depth).

2. **Service-guards (alla maste implementeras):**
   - Original maste ha `status = 'booked'` (inte 'draft', inte 'corrected')
   - Original far INTE vara ett korrigeringsverifikat (`corrects_entry_id IS NULL`) (Q12)
   - Original far INTE ha beroende betalningsverifikat (Q7 — fullstandig audit):
     ```sql
     SELECT 1 FROM invoice_payments WHERE journal_entry_id = :id LIMIT 1
     UNION ALL
     SELECT 1 FROM expense_payments WHERE journal_entry_id = :id LIMIT 1
     ```
     Om resultat → `{ code: 'HAS_DEPENDENT_PAYMENTS', error: 'Verifikatet har beroende betalningar. Återför betalningarna först.' }`

     **Audit (Q7):** 7 tabeller refererar journal_entries(id):
     `journal_entry_lines` (barn), `invoices` (nullable), `invoice_payments` (NOT NULL),
     `expenses` (nullable), `expense_payments` (NOT NULL), `manual_entries` (nullable),
     `payment_batches` (nullable). Guarden tacker de 2 NOT NULL-FK:erna.
     Nullable-FK:er ar informationslankar — originalet kan markeras corrected
     utan att de bryter.
   - Original far INTE redan vara korrigerad (`corrected_by_id IS NULL`)
   - **Korrigeringens** FY maste vara oppet (inte originalets — Q11 cross-FY)
   - Perioden for korrigeringsdatumet (`todayLocal()`) maste vara oppen

3. **UI-doljning:** "Korrigera"-knappen visas BARA om:
   - `status === 'booked'`
   - `corrected_by_id === null`
   - `corrects_entry_id === null` (ar inte sjalv en korrigering — Q12)
   - Inte har beroende betalningar (via `journal-entry:can-correct`)
   - Rakenskapsaret ar oppet (isReadOnly === false)

4. **Visuell indikator:**
   - Badge "Korrigerad" (rodaktig) pa verifikat med `status === 'corrected'`
   - Badge "Korrigering" (blaaktig) pa verifikat med `corrects_entry_id IS NOT NULL` (Q13)
   - Lank till korrigeringsverifikat / originalverifikat i bada riktningar

### Service-implementation

**Fil:** `src/main/services/correction-service.ts`

**Funktion:** `createCorrectionEntry(db, input: { journal_entry_id: number, fiscal_year_id: number })`

**Flode (atomar `db.transaction()` — Q14):**
1. Hamta original journal_entry + lines
2. Validera alla guards ovan (inom transaktionen — TOCTOU-skydd)
3. Allokera nasta C-serie-nummer for korrigeringens FY
4. Skapa nytt journal_entry:
   - `status: 'draft'` (bokas i steg 7)
   - `source_type: 'manual'`
   - `corrects_entry_id: original.id`
   - `fiscal_year_id: input.fiscal_year_id` (aktivt FY — kan skilja fran originalets, Q11)
   - `journal_date: todayLocal()` (korrigeringsdatum = idag)
   - `description: 'Korrigering av ver. {serie}{nummer} — {original.description}'` (M139)
5. Skapa omvanda journal_entry_lines:
   - For varje originalrad: swap debit_ore ↔ credit_ore
   - Behall account_number och description
6. Boka korrigeringsverifikatet (`status = 'booked'`)
   - Trigger 6 (balanscheck) validerar automatiskt
   - Trigger 7 (period-check) validerar automatiskt
7. Markera originalet: `UPDATE journal_entries SET status = 'corrected', corrected_by_id = ? WHERE id = ?`
8. Returnera korrigeringsverifikatet

**Returnerar:** `IpcResult<{ correction_entry: JournalEntry, original_entry_id: number }>`

**Hjalp-funktion:** `canCorrectEntry(db, journalEntryId): { canCorrect: boolean, reason?: string }`
Kor guard-check 1–6 utan att skapa nagot. Anvands av UI for att visa/dolja knappen.

### IPC-kanaler och schema

**Kanal 1:** `journal-entry:correct`
```ts
export const CorrectJournalEntrySchema = z.object({
  journal_entry_id: z.number().int().positive(),
  fiscal_year_id: z.number().int().positive(),
}).strict()
```

**Kanal 2:** `journal-entry:can-correct`
```ts
export const CanCorrectSchema = z.object({
  journal_entry_id: z.number().int().positive(),
}).strict()
```
Returnerar `IpcResult<{ canCorrect: boolean, reason?: string }>`

### Migration 031 — Immutability-hardening

Tre nya triggers som tatar sakerhetsluckor identifierade i Q9/Q10-audit:

```sql
-- Q9: source_type far inte andras pa bokforda verifikat
-- (kringgår opening_balance-undantag i trigger 1-2)
-- OBS: WHEN OLD.status = 'booked' — drafts far andra source_type
CREATE TRIGGER trg_immutable_source_type
BEFORE UPDATE ON journal_entries
WHEN OLD.status = 'booked' AND NEW.source_type != OLD.source_type
BEGIN
    SELECT RAISE(ABORT, 'source_type kan inte ändras på bokförd verifikation.');
END;

-- Q10: source_reference far inte andras pa bokforda verifikat (audit trail)
CREATE TRIGGER trg_immutable_source_reference
BEFORE UPDATE ON journal_entries
WHEN OLD.status = 'booked' AND
     COALESCE(NEW.source_reference, '') != COALESCE(OLD.source_reference, '')
BEGIN
    SELECT RAISE(ABORT, 'source_reference kan inte ändras på bokförd verifikation.');
END;

-- Q10: corrects_entry_id far inte andras efter bokning
-- (forbjuder att i efterhand peka om vilken entry som korrigerades)
CREATE TRIGGER trg_immutable_corrects_entry_id
BEFORE UPDATE ON journal_entries
WHEN OLD.status = 'booked' AND
     COALESCE(NEW.corrects_entry_id, 0) != COALESCE(OLD.corrects_entry_id, 0)
BEGIN
    SELECT RAISE(ABORT, 'corrects_entry_id kan inte ändras på bokförd verifikation.');
END;

-- Q8: forbjud status → 'corrected' om det finns beroende betalningar
-- (defense-in-depth — service-guard ar primar, denna ar sakerhetsnatt)
CREATE TRIGGER trg_no_correct_with_payments
BEFORE UPDATE ON journal_entries
WHEN OLD.status = 'booked' AND NEW.status = 'corrected'
BEGIN
    SELECT CASE
        WHEN EXISTS (SELECT 1 FROM invoice_payments WHERE journal_entry_id = OLD.id)
          OR EXISTS (SELECT 1 FROM expense_payments WHERE journal_entry_id = OLD.id)
        THEN RAISE(ABORT, 'Kan inte korrigera verifikat med beroende betalningar.')
    END;
END;
```

PRAGMA user_version 30 → 31.

**Tester for migrationen:**
- trg_immutable_source_type blockerar UPDATE pa booked, tillater pa draft
- trg_immutable_source_reference blockerar UPDATE pa booked
- trg_immutable_corrects_entry_id blockerar UPDATE pa booked
- trg_no_correct_with_payments blockerar status→corrected vid payments
- Befintlig korrigeringsflode (status→corrected + corrected_by_id) FUNGERAR nar inga payments finns

### UI-integration

**Var "Korrigera"-knappen placeras:**
I verifikatvy (PageManualEntries view-mode). Knappen visas villkorligt
baserat pa `canCorrect`-fragan.

**Dialog:** Anvand `<ConfirmDialog>` fran F50 (Sprint 29):
- Titel: "Korrigera verifikat"
- Beskrivning: "En omvand bokning skapas som nollstaller detta verifikats
  effekt pa alla beroreda konton. Verifikatet markeras som korrigerat."
- Bekrafta-knapp: "Korrigera"
- Variant: `warning`

**Badges:**
- `status === 'corrected'` → `<span className="... bg-red-100 text-red-700">Korrigerad</span>`
- `corrects_entry_id != null` → `<span className="... bg-blue-100 text-blue-700">Korrigering</span>` (Q13)

### Tester

**Service-tester:**
1. Framgangsrik korrigering: original → corrected, korrigeringsverifikat → booked
2. Net-balance: original + korrigering = 0 per konto
3. Korrigeringsverifikat har omvanda rader (swap debet/kredit)
4. description innehaller M139-korsreferens
5. C-serie-nummer ar korrekt (nasta lediga i korrigeringens FY)
6. Cross-FY-korrigering: original i FY1, korrigering i FY2 (Q11)
7. Guard: kan inte korrigera draft → felkod
8. Guard: kan inte korrigera redan korrigerad → felkod
9. Guard: kan inte korrigera korrigeringsverifikat (Q12) → felkod
10. Guard: kan inte korrigera verifikat med invoice_payments → felkod
11. Guard: kan inte korrigera verifikat med expense_payments → felkod
12. Guard: kan inte korrigera i stangt FY → felkod
13. Guard: kan inte korrigera nar perioden ar stangd → felkod
14. Atomar: hela operationen rullas tillbaka vid fel

**Migration-tester:**
15. trg_immutable_source_type blockerar booked, tillater draft
16. trg_immutable_source_reference blockerar booked
17. trg_immutable_corrects_entry_id blockerar booked
18. trg_no_correct_with_payments blockerar vid payments
19. Befintlig korrigeringsflode fungerar utan payments

**IPC contract test:**
20. Zod-schema for `journal-entry:correct`
21. Zod-schema for `journal-entry:can-correct`

**Renderer-test:**
22. "Korrigera"-knapp visas for booked entry utan betalningar
23. "Korrigera"-knapp doljs for corrected/draft/korrigerings-entries
24. "Korrigerad"-badge visas for corrected entries
25. "Korrigering"-badge visas for entries med corrects_entry_id (Q13)

**Definition of Done:** Korrigering skapar atomart omvant verifikat, alla guards
blockerar felaktig anvandning, M138 (4 lager) implementerad, M139 (korsreferens)
i description. Cross-FY stods. Korrigering av korrigering forbjuden.

---

## UTANFOR SCOPE (Sprint 31)

### B3 — Global sokning
Sokfalt i header. Kraver:
- Ny IPC-kanal `search:global` som soker over fakturor, kostnader, leverantorer,
  kunder, verifikat
- `escapeLikePattern` (redan finns)
- Debounced search (redan finns: `useDebouncedSearch`)
- Svenska tecken: SQLite default collation ar BINARY (case-sensitive).
  Overlag att lagga till `COLLATE NOCASE` eller LOWER()-wrapping i framtiden.
- Resultat-ranking (enkel: senaste forst)

### Backlog:
- Drill-down fran kontoutdrag (klick pa rad → oppna verifikat)
- URL-sync av filterstate i kontoutdrag (Q6)
- **Pagination** for alla listor
- **Snapshot company-info** pa fakturor (F51 Alternativ A)
- **F46b** DB-CHECK defense-in-depth for quantity
- **F49-b** AST-baserad M133-utokning

---

## Fas-ordning och rollback-strategi

| Fas | Scope | Tagg vid klar | Full test-suite |
|-----|-------|---------------|-----------------|
| 1 | B2 UI: service summary + PageAccountStatement + hook + route + sidebar | `s30-b2-ui` | Ja (Q16) |
| 2 | B4: Migration 031 (4 triggers) | `s30-b4-migration` | Ja (Q16) |
| 3 | B4: correction-service + guards + tester | `s30-b4-service` | Ja (Q16) |
| 4 | B4: IPC-handler + preload + UI-integration | `s30-b4-ui` | Ja (Q16) |

**Rollback:** Varje fas taggas. Faserna ar oberoende — Fas 1 (B2 UI) har
ingen koppling till Fas 2–4 (B4). Vid regression i Fas 3–4: `git revert`
till `s30-b4-migration` bevarar B2 UI intakt.

**Mellan varje fas: kor full test-suite** (`npm run test`). Gor INTE vidare
till nasta fas om tester failar.

---

## Manuellt smoke-test-script

### Kontoutdrag (5 min)
1. [ ] Navigera till "Kontoutdrag" i sidomenyn
2. [ ] Tom vy visas med instruktion "Valj ett konto"
3. [ ] Valj konto 1510 (Kundfordringar) i dropdown
4. [ ] Transaktioner visas med lopande saldo
5. [ ] Saldo visar (D)/(K)-suffix korrekt
6. [ ] Valj konto 2440 (Leverantorsskulder) → negativt saldo visar "(K)" (Q3)
7. [ ] Andra datumfilter → rader filtreras
8. [ ] "Visa hela rakenskapsaret" → alla rader visas
9. [ ] Summeringsrad visar summary (debet + kredit + slutsaldo)

### Korrigeringsverifikat (5 min)
10. [ ] Skapa en manuell bokforingsorder → bokfor
11. [ ] "Korrigera"-knapp syns pa det bokforda verifikatet
12. [ ] Klicka "Korrigera" → bekraftelsedialog
13. [ ] Bekrafta → korrigeringsverifikat skapas, original visar "Korrigerad"-badge
14. [ ] Korrigeringsverifikatet visar "Korrigering"-badge (Q13)
15. [ ] Oppna korrigeringsverifikatet → rader ar omvanda
16. [ ] Oppna kontoutdrag for berorrt konto → bada verifikat syns, netto = 0
17. [ ] "Korrigera"-knapp doljs pa det korrigerade verifikatet
18. [ ] "Korrigera"-knapp doljs pa korrigeringsverifikatet (Q12)
19. [ ] Forsok korrigera verifikat med betalning → felmeddelande "Aterfor betalningarna forst"

### Regression (2 min)
20. [ ] Skapa faktura → bokfor → betala → verifikat-kedjan intakt
21. [ ] Manuell bokforingsorder → bokfor → korrekt C-serie-nummer

---

## Nya tester per feature — sammanfattning

| Feature | Typ | Antal (ca) |
|---------|-----|------------|
| B2 UI: service summary | Service | 2 |
| B2 UI: renderer | Renderer + axe | 7 |
| B4 migration 031 | Migration + trigger | 5 |
| B4 correction service | Service + guards | 14 |
| B4 IPC contract | Zod schema | 2 |
| B4 renderer | Integration | 4 |
| **Totalt** | | **~34** |

**IPC contract test-krav:** `journal-entry:correct` och `journal-entry:can-correct`
kraver Zod-schema i `ipc-schemas.ts` + contract test.

**Mal:** ~1640+ vitest efter sprinten (1604 baseline + ~34 nya).

---

## Verifiering vid sprint-avslut

```bash
npm run test          # ~1640+ passed
npm run typecheck     # 0 errors
npm run check:m131    # rent
npm run check:m133    # rent
npm run build         # rent
npm run lint          # (pre-existing prettier-errors okej)
```

- Uppdatera STATUS.md
- Uppdatera bug-backlog.md
- Kor manuellt smoke-test-script ovan
- Tagga `s30-done`
