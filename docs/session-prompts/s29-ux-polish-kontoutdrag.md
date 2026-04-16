# Sprint 29 — UX-polish + Kontoutdrag

## Kontext

Projektet ar funktionellt komplett for K2-enmansbolag. Sprint 28 levererade
kreditfakturor (invoice + leverantor) med omvand bokforing, M137–M139
etablerade. 0 oppna findings, 0 tsc-fel, 1566 vitest + 11 E2E.

Denna sprint ar scopad till **UX-bugfixar (Del A) + kontoutdrag (Del B)**.
Sokning, korrigeringsverifikat och ovrig ny feature-logik skjuts till Sprint 30.

**Testbaslinje:** 1566 vitest passed, 2 skipped (145 testfiler). 11 Playwright E2E.
**Mal:** ~1610+ efter sessionen.
**PRAGMA user_version:** 30 (30 migrationer). Ingen ny migration planerad i denna sprint.

---

## Relevanta M-principer (inline-sammanfattning)

Dessa principer refereras i sprinten. Inkluderade har for fristaaende lasbarhet.

- **M100:** Alla services kastar strukturerade `{ code, error, field? }`. Aldrig `throw new Error` i services.
- **M118:** `source_type='opening_balance'` ar undantaget fran immutability-triggers.
- **M119:** Alla penning-INTEGER i SQLite har `_ore`-suffix.
- **M128:** Handlers: direkt delegation eller `wrapIpcHandler()`. Ingen generisk catch.
- **M137:** Alla belopp i invoices/expenses lagras som positiva heltal. Doman-semantik (kredit, retur) appliceras i journal-byggaren genom att swappa debet/kredit. Ingen negativa belopp i DB.
- **M138:** Irreversibla relationer skyddas i 4 lager: DB-constraint, service-guard, UI-doljning, visuell indikator.
- **M139:** Korsrefererade transaktioner inkluderar referens i `journal_entries.description` for SIE-sparbarhet.

---

## 0. Pre-flight

```bash
npm run test        # 1566 passed, 2 skipped (145 testfiler)
npm run lint        # pre-existing prettier-errors (okej)
npm run typecheck   # 0 errors
npm run check:m131  # rent
npm run check:m133  # rent
npm run build       # rent
```

---

## Del A: UX-bugfixar (F50–F56)

Dessa ar bug-level findings som foljer befintlig F-numrering (nasta lediga efter F49-b).

---

### F50 — Ersatt window.confirm med Electron-dialoger

**Filer:** `src/renderer/components/invoices/InvoiceForm.tsx:165`, `src/renderer/components/expenses/ExpenseForm.tsx:214`

**Problem:** `window.confirm('Vill du verkligen ta bort detta utkast?')` ar browsernativ och bryter Electron-UX.

**Fix:**
1. Skapa `src/renderer/components/ConfirmDialog.tsx` — generisk modal-komponent (React.memo) med titel, meddelande, bekrafta/avbryt-knappar.
2. Ersatt ALLA `window.confirm`/`window.alert`/`window.prompt` i `src/renderer/` med den nya dialogen.
3. Gor en **fullstandig sokning** (grep i `src/renderer/` efter `window.confirm`, `window.alert`, `window.prompt`) och ersatt ALLA forekomster — inte bara de 2 kanda.

**A11y-krav:** `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` + `aria-describedby`, fokus-trap (Tab cyclar inom dialogen), Escape stangar.

**Tester:**
- Unit-test av ConfirmDialog: renderar, knappar fungerar, Escape stangar
- Integration: InvoiceForm draft-borttagning med bekraftelse-dialog
- Integration: ExpenseForm draft-borttagning med bekraftelse-dialog
- axe-kontroll (M133-kompatibel)

**Definition of Done:** `grep -rn 'window\.confirm\|window\.alert\|window\.prompt' src/renderer/` returnerar 0 traffar.

---

### F51 — Foretags-redigering: historisk integritet

**Filer:** `src/renderer/pages/PageSettings.tsx`, `src/main/services/company-service.ts`

**Problem:** Foretagets namn och org.nr kan andras fritt, men utfardade fakturor (som ar juridiska dokument) reflekterar alltid aktuellt foretagsnamn vid PDF-generering. Namnbyte efter fakturering innebar att PDF:er for gamla fakturor far fel avsandaruppgifter.

**Beslut: Varnings-approach (Alternativ B).**

Motivering: Snapshot-pattern (Alternativ A) kraver migration 029 med ny kolumn pa invoices + datamigration av alla befintliga fakturor + PDF-service-andring. For hog komplexitet for v1 — namnbyte ar ovanligt for enmansbolag. Varningen ar tillracklig.

**Fix:**
1. Nar anvandaren andrar `name` eller `org_number` i PageSettings: visa bekraftelse-dialog (anvand F50-komponenten) med texten: "OBS: Andringar av foretagsnamn/org.nr paverkar inte redan utfardade fakturor. PDF:er for befintliga fakturor visar den nya informationen."
2. Inga andringar i backend — `updateCompany` fungerar redan korrekt.
3. ReadOnly-falt i UI forblir: `fiscal_rule` (K2/K3), `share_capital`.

**Tester:**
- Integration-test: bekraftelse-dialog visas vid namnbyte
- Integration-test: avbryt avbryter andring
- Integration-test: bekraftelse gar igenom och sparar

**Definition of Done:** Anvandaren varnas innan namnbyte, dialogen ar tydlig.

---

### F52 — Backup-restore med validering och atomicitet

**Filer:** `src/main/services/backup-service.ts` (ny funktion), `src/main/ipc-handlers.ts` (ny kanal), `src/renderer/pages/PageSettings.tsx` (ny knapp)

**Problem:** Backup-export fungerar, men restore saknas helt. Restore ar en farlig operation — overskriver hela verifikationskedjan.

**Specifikation:**

#### Validering av backup-fil (fore restore):
1. **Filfilter:** `dialog.showOpenDialog({ filters: [{ name: 'SQLite-databas', extensions: ['db', 'sqlite'] }] })`
2. **SQLite-validering:** Oppna filen med better-sqlite3 READ_ONLY. Om det inte ar en giltig SQLite-fil → felmeddelande "Filen ar inte en giltig databas."
3. **Schema-validering:** Kontrollera `PRAGMA user_version`. Om version > aktuell → "Backupen ar fran en nyare version av appen." Om version < aktuell → kör migrationer 029+ efter restore (se punkt nedan). Om 0 eller saknar `companies`-tabell → "Filen ar inte en Fritt Bokforing-databas."
4. **Integritets-check:** `PRAGMA integrity_check` (timeout 10s). Om result !== 'ok' → "Databasfilen ar korrupt."

#### Pre-restore-backup (kritiskt):
Innan overskrivning: kopiera nuvarande databas till `{dbPath}.pre-restore-{timestamp}.db`. Denna kopia ar anvandarens sista chans om backupen ar fel.

#### Atomicitet och db.close()-sekvens:

**Kritiskt:** better-sqlite3 haller en exclusive lock pa databasfilen.
`fs.rename()` pa en filen som ar oppnad av better-sqlite3 ger EBUSY pa
Windows och kan korrumpera WAL-journalen pa macOS/Linux. Sekvensen maste
vara:

1. Kopiera backup-filen till `{dbPath}.restoring` (temp)
2. Oppna `.restoring` med better-sqlite3 (ny handle, INTE delad med appen)
3. Kör migrationer pa temp-filen om `user_version < current`
4. **Stang temp-handlen** (`tempDb.close()`)
5. **Stang appens primara db-handle** (`db.close()`) — detta ar kritiskt,
   annars EBUSY vid rename
6. Atomic rename: `{dbPath}.restoring` → `{dbPath}` (OS-niva atomicitet)
7. Om krasch mid-operation: `.restoring`-filen finns men original ar opaverkad
8. `app.relaunch()` + `app.exit(0)` — appen startar om och oppnar den nya databasen

**WAL-checkpoint fore close:** Kor `PRAGMA wal_checkpoint(TRUNCATE)` pa
appens db-handle innan `db.close()` for att sakerstalla att alla WAL-anringar
ar skrivna till huvudfilen. Annars kan rename missa data i WAL-filen.

Hela sekvensen wrappas i try/catch — vid fel pa steg 5-6, forsok oppna
original-databasen igen (basta anstrengning) och returnera felmeddelande
istallet for relaunch.

#### user_version-hantering:
- **Backup version == aktuell:** Restore direkt.
- **Backup version < aktuell:** Kör migrationer pa den importerade databasen efter kopiering men fore rename. Visa varning: "Backupen ar fran en aldre version. Databasen uppgraderas automatiskt."
- **Backup version > aktuell:** Vagra restore. "Backupen ar fran en nyare version. Uppgradera appen forst."

#### IPC-kanal (beslut: dialog-i-main):
`backup:restore-dialog` — **ingen input fran renderer.** Main-process visar
`dialog.showOpenDialog` internt, validerar filen, och returnerar
`IpcResult<{ restored: boolean, message?: string }>`.

Motivering: filsokvag far aldrig korsa IPC-gransen fran renderer till main
(Electron-sakerhet — renderer ska inte kunna instruera main att oppna
godtyckliga filer). Samma monster som befintliga `backup:create` som ocksa
visar dialog i main.

Zod-schema: `z.object({})` (tomt — ingen input). Returnerar IpcResult.

**Tester:**
- **Giltig backup:** restore + relaunch-signal
- **Ogiltigt filformat:** returnar felmeddelande, original opaverkad
- **Aldre user_version:** migrationer kors, schema korrekt efter restore
- **Nyare user_version:** vagrar restore
- **Korrupt fil:** integrity_check failar, felmeddelande
- **Pre-restore-backup skapas:** verifierar att `.pre-restore-*`-filen existerar
- **Atomicitet:** original opaverkad om migrering failar mid-operation
- **Ej Fritt Bokforing-databas:** saknar companies-tabell

**Definition of Done:** Restore-flode fungerar end-to-end. Pre-restore-backup skapas ALLTID. Original opaverkad vid felaktigt val.

---

### F53 — Formattering och validering av visade datum

**Filer:** Diverse renderer-komponenter som visar datum fran DB.

**Problem:** Datum visas inkonsekvent (ibland ISO-format, ibland svenskt format). FY-granser hanteras inte explicit.

**Fix:**

**Steg 1 — Scope-identifiering (grep):**
```bash
# Hitta alla stallen dar datum renderas i UI:
grep -rn 'invoice_date\|expense_date\|verification_date\|due_date\|journal_date\|created_at\|start_date\|end_date' src/renderer/ --include='*.tsx' --include='*.ts'
# Hitta alla Date-konstruktorer som tar en strang (potentiell tz-bugg):
grep -rn 'new Date(' src/renderer/ --include='*.tsx' --include='*.ts'
```
Var uppmärksam pa `new Date(someString)` — det ar den primara tz-risken.

**Steg 2:** Sakerstall konsekvent `YYYY-MM-DD`-format (svensk standard) overallt.
**Steg 3:** Validera att alla datumfalt ar giltiga strangar (inte tomma, inte `undefined`).
**Steg 4:** Inga tidszons-transformationer — M28/B1-konventionen galler. Datum som kommer fran DB ar redan `YYYY-MM-DD`-strangar. Rendrera dem DIREKT, utan att parsa till Date-objekt.

**Tidszonsinvariant (historisk skuld — Sprint 8/9):**
All datumhantering i detta projekt ar strang-baserad (`YYYY-MM-DD`). Inga
`Date`-objekt med implicit tidszonkonvertering far anvandas for datumjamforelse
eller filtrering. Orsak: `new Date('2026-01-01')` tolkas som UTC midnatt,
vilket i CET (UTC+1) blir `2025-12-31T23:00:00` lokalt. Strang-jamforelse
(`date >= '2026-01-01'`) ar tidszons-safe. Verifiera att B2:s datumfilter
ocksa foljer detta (se B2 nedan).

**Tester:**
- Edge case: sista dag pa FY, forsta dag pa FY
- FY-gransdatum: 2026-01-01 visas som 2026-01-01 (inte 2025-12-31 via Date-objekt)
- Tom datumstrang hanteras utan krasch
- Verifiering: ingen `new Date(dateString)` for jamforelse i renderer-kod

**Definition of Done:** Alla datum i UI visas som `YYYY-MM-DD`. Ingen datumjamforelse gar genom Date-objekt.

---

### F54 — Kontonummer-tooltip med kontobeskrivning

**Filer:** Diverse renderer-komponenter som visar kontonummer.

**Problem:** Kontonummer (t.ex. "1930", "3010") visas utan forklaring. Anvandare utan bokforingsvana forstaar inte.

**Fix:** Visa kontobeskrivning som tooltip vid hover pa kontonummer i listor (verifikatlista, kontoutdrag, etc.).

**VIKTIGT — A11y-korrekt implementation:**
- INTE `title`-attribut (inkonsekvent skarmlasar-stod, ingen tangentbords-access).
- Anvand en `<Tooltip>`-komponent med `aria-describedby`. Toggla via `onMouseEnter`/`onMouseLeave` + `onFocus`/`onBlur` for tangentbordsanvandare.
- Om projektet saknar tooltip-komponent: skapa en minimal `src/renderer/components/Tooltip.tsx` (React.memo, portal-baserad, aria-korrekt).

**Tester:**
- Unit-test: Tooltip renderas vid hover
- A11y: focusable + aria-describedby
- axe-check

**Definition of Done:** Kontonummer i listor visar kontobeskrivning vid hover och fokus.

---

### F55 — A11y-forbattringar (utover F50/F54)

**Scope:** Kompletterande a11y-pass utover det som F50 (ConfirmDialog) och F54 (Tooltip) redan tacker.

**Fix:**
1. Granska alla interaktiva element i huvudnavigering for tangentbords-navigerbarhet.
2. Kontrollera kontrast-ratios pa knappar och lankar (WCAG AA: 4.5:1 for text, 3:1 for stora element).
3. Sakerstall att `aria-current="page"` setts pa aktiv navigationslank.

**Tester:**
- axe-kontroller pa alla sidkomponenter (M133-kompatibla)
- Tangentbordsnavigering: Tab genom hela appen utan att "fastna"

**Definition of Done:** `npm run check:m133` rent. Inga nya axe-violations.

---

### F56 — Minimum fonsterstorlek

**Fil:** `src/main/index.ts:93`

**Problem:** Inget `minWidth`/`minHeight` satt. Anvandaren kan krympa fonstret tills UI:t ar oanvandbart.

**Fix:**
```ts
// src/main/index.ts, BrowserWindow-optioner:
minWidth: 900,
minHeight: 600,
```

**Test-overvagande:** 13" MacBook Air med dock ≈ 1280x750 anvandbar yta. 900x600 ar safe. Testa sjalv pa en mindre skarm for verifiering.

**Tester:**
- Manuell verifiering (inget automatiserat test kravs — det ar en BrowserWindow-option)

**Definition of Done:** Fonstret kan inte krympas under 900x600.

---

## Del B: Nya features

---

### B1 — Partiell kreditering: explicit E2E-verifiering

**Status: UI:t stodjer redan partiell kreditering (Sprint 28).** Kreditfaktura-utkastet skapas med identiska rader som originalet. Anvandaren kan justera quantity/pris innan bokning.

**DOCK:** Partiell kreditering har aldrig testats explicit. Generisk UI ≠ verifierat beteende. F27-principen: "om det inte ar testat ar det inte korrekt."

**Krav: Explicit E2E- och systemtester.**

**Tester (systemtest, vitest):**
1. Skapa faktura med 2 rader (100kr netto + 200kr netto, 25% moms) → kreditera → justera rad 1 till qty=0.5 → bokfor → verifikat har omvand D/K pa 50kr netto + 12.50kr moms (rad 1), 200kr netto + 50kr moms (rad 2)
2. Partiell kreditering: alla rader justerade → total (inkl moms) ar lika med summan av justerade rader, inte originalsumma
3. Kreditfaktura med justerade rader balanserar (debet == kredit)
4. Original-faktura flaggas korrekt som krediterad (`has_credit_note = true`)
5. **Moms-korrekthet:** kreditfakturans momsrad (2611) ar exakt proportionell mot justerad nettosumma, inte originalens moms. Anvand shared fixture fran `tests/fixtures/vat-scenarios.ts` for momssatser (M135).
6. **Blandade momssatser:** faktura med rad 1 (25%) + rad 2 (12%) → kreditera → justera bara rad 1 → momsverifikatet har korrekt 25%-moms pa justerad rad, 12%-moms oforandrad

**E2E-test:**
7. Flode: skapa faktura → kreditera → justera qty pa en rad → bokfor → verifikat visas med korrekta belopp inkl moms

**Definition of Done:** Partiell kreditering verifierad med korrekta belopp i verifikatet. Inte bara "UI tillater det" utan "bokforingen ar korrekt".

---

### B2 — Kontoutdrag (Account Statement)

**Ny feature:** Visa alla transaktioner for ett enskilt konto inom aktivt rakenskapsaar.

#### Specifikation:

**Navigation:** Ny sida eller modal, atakomlig fran kontolistan eller verifikatlistan.

**Visning per konto:**
- Rubrik: kontonummer + kontobeskrivning (t.ex. "1930 Foretags­konto / checkrakningskonto")
- Tabell: datum, verifikat-nummer, beskrivning, debet, kredit, lopande saldo
- **IB-hantering — VIKTIGT:** IB lagras som `source_type='opening_balance'`
  journal entries med rader i `journal_entry_lines` (O-serie verifikat).
  Dessa rader fångas REDAN av queryn nedan (`status = 'booked'`).
  **Hamta INTE IB separat fran `opening_balances`-tabellen** — det skulle
  ge dubbelrakning. `opening_balances`-tabellen ar en berakningstabell for
  FY-overgang, inte en lastabell for kontoutdrag.
- **Lopande saldo:** Ackumulerat fran 0. Forsta raden (IB-verifikatet, O-serie)
  ger start-saldo. Varje efterfoljande rad: `running += debit_ore - credit_ore`.
  For skuld-/intaktskonton (klass 2, 3) ar credit > debit normalt — saldot
  ar negativt, vilket ar korrekt. Visa absolut varde + (D)/(K)-suffix i UI.
- **Sorterat:** kronologiskt efter verifikat-datum, sedan serie (O forst),
  sedan verifikat-nummer for samma datum. Detta garanterar att IB-raden
  alltid ar forst aven om annan bokning har samma datum.
- **Drafts EXKLUDERADE:** Enbart bokforda verifikat (`status = 'booked'`).

**Datumfilter:**
Eftersom paginering ar utanfor scope men konto 1930 kan ha 1500–2500 rader/ar:
- Datumintervallfalt (fran-datum, till-datum) som filtrerar transaktioner.
- **Default: senaste 3 manaderna** (inte hela FY). Orsak: konto 1930 pa ett
  aktivt foretag landar runt 2000 rader/ar — hela FY som default traffar
  perf-budgetens tak pa forsta bankvyn. 3 manader ger ~500 rader, val under
  gransen. Anvandaren kan expandera till hela FY med ett klick.
- IB-raden visas ALLTID (aven vid filtrering) — lopande saldo ar relativt IB.
- **Tidszonsinvariant:** from/to-jamforelse sker som strang-jamforelse i SQL
  (`verification_date >= ?`), INTE via Date-objekt. Se F53 tidszonsinvariant.

**IPC-kanal:** `account:get-statement`
- Schema: `{ fiscal_year_id: z.number(), account_number: z.string(), date_from?: z.string().optional(), date_to?: z.string().optional() }`
- Returnerar: `IpcResult<{ account_number, account_name, lines: Array<{ date, verification_series, verification_number, description, debit_ore, credit_ore, running_balance_ore }> }>`
- **Notera:** Ingen separat `opening_balance_ore` i returtypen — IB ar en
  vanlig rad (O-serie) med `running_balance_ore` beraknat fran 0.

**SQL-query (service):**
```sql
SELECT je.verification_date, je.verification_series,
       je.verification_number, je.description,
       jel.debit_ore, jel.credit_ore
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE jel.account_number = ?1
  AND je.fiscal_year_id = ?2
  AND je.status = 'booked'
  AND (?3 IS NULL OR je.verification_date >= ?3)
  AND (?4 IS NULL OR je.verification_date <= ?4)
ORDER BY je.verification_date,
         CASE je.verification_series WHEN 'O' THEN 0 ELSE 1 END,
         je.verification_number
```

**SQL parameter-hantering:** Anvand namngivna parametrar (`?1`, `?2`, `?3`, `?4`)
eller named parameters (`:fiscal_year_id`). better-sqlite3 stodjer bada.
`?3 IS NULL OR verification_date >= ?3` kraver att samma parameter
skickas tva ganger i positional mode: `[account, fyId, dateFrom, dateFrom, dateTo, dateTo]`.
Alternativ: anvand named parameters for klarhet:

```ts
stmt.all({
  account: accountNumber,
  fy: fiscalYearId,
  from: dateFrom ?? null,
  to: dateTo ?? null,
})
```

Med named-query: `WHERE ... AND (:from IS NULL OR je.verification_date >= :from)`.
**Valj named parameters** — undviker den felbenagna dubbel-positional-buggen.

Lopande saldo beraknas i TypeScript (ackumulering fran 0), inte i SQL.

**Performance-budget:** Rendering av 2000 rader < 500ms. Om detta overskrids: virtualiserad lista (react-window eller motsvarande).

**Tester:**
- Service-test: konto med 0 transaktioner (inget IB-verifikat, inga bokningar) → tom lista
- Service-test: konto med IB-verifikat (O-serie) men inga andra bokningar → en rad, saldo = IB
- Service-test: konto med 3 transaktioner → korrekt lopande saldo
- Service-test: datumfilter exkluderar rader utanfor intervall men IB kvarstar
- Service-test: default datumfilter ar senaste 3 manader (inte hela FY)
- Service-test: enbart bokforda verifikat inkluderas (inte drafts, inte corrected)
- Service-test: FY-gransdatum (2026-01-01) inkluderas korrekt i filter (strang-jamforelse, inte Date-objekt)
- Zod IPC contract test for `account:get-statement`
- Renderer-test: tabellen renderas med korrekta kolumner
- Renderer-test: "Visa hela rakenskapsaaret"-knapp expanderar datumfilter
- Performance-test: 2000 rader renderas utan timeout (valfritt, se budget ovan)

**Definition of Done:** Kontoutdrag visar korrekt lopande saldo fran IB. Default visar senaste 3 manader. Datumfilter fungerar. Drafts exkluderade.

---

## UTANFOR SCOPE (Sprint 30)

Foljande features skjuts till Sprint 30 for att halla sprinten hanterbar:

### B3 — Global sokning (Sprint 30)

Sokfalt i header som soker over fakturor, kostnader, leverantorer, kunder.
Kraver ny IPC-kanal + Zod-schema + sakerhetsovervaganden (SQL-injection,
svenska tecken, case sensitivity, tom query).

### B4 — Korrigeringsverifikat (Sprint 30)

DB-schema ar redo (`corrects_entry_id`, `corrected_by_id`). Kraver:
- Service-logik for att skapa korrigeringsverifikat
- Guards: kan inte korrigera redan korrigerad. Kan inte korrigera bokning
  med beroende betalningsverifikat (kravs av M138 defense-in-depth).
  Korrigering ar all-or-nothing (atomar transaktion).
- Net-balance-test: original + korrigering = 0
- UI for att valja verifikat och skapa korrigering
- Foljer M137 (positiva belopp), M138 (4 lager), M139 (korsreferens i description)

### Framtida (v1.1+):
- **Pagination** for alla listor
- **Snapshot company-info** pa fakturor (F51 Alternativ A)
- **F46b** DB-CHECK defense-in-depth for quantity

---

## Fas-ordning och rollback-strategi

| Fas | Scope | Tagg vid klar |
|-----|-------|---------------|
| 1 | F50 ConfirmDialog | `s29-f50` |
| 2 | F51 Foretagsvarning + F56 minWidth | `s29-f51-f56` |
| 3 | F52 Backup-restore | `s29-f52` |
| 4 | F53 Datum + F54 Tooltip + F55 A11y | `s29-f53-f55` |
| 5 | B1 Partiell kreditering (tester) | `s29-b1` |
| 6 | B2 Kontoutdrag | `s29-b2` |

**Rollback:** Varje fas taggas vid klar. Om Fas N introducerar regression:
`git revert` till tagg `s29-fasN-1`. Faserna ar oberoende — inga
korsreferenser utom att F50 (ConfirmDialog) anvands av F51 och F52.

---

## Manuellt smoke-test-script

Kor efter alla faser ar klara. Varje steg ar explicit verifierbart.

### Grundflode (5 min)
1. [ ] Starta appen → fonstret oppnas i 1200x800
2. [ ] Forsok krympa fonstret under 900x600 → stoppas av minWidth/minHeight
3. [ ] Navigera till Installningar → foretagsuppgifter visas

### Foretagsredigering (3 min)
4. [ ] Andra foretagsnamn → bekraftelse-dialog visas med varningstext
5. [ ] Klicka "Avbryt" → namn oforandrat
6. [ ] Klicka "Bekrafta" → namn andrat, sparas

### Backup/Restore (5 min)
7. [ ] Klicka "Skapa backup" → filvaljare oppnas, .db-fil sparas
8. [ ] Klicka "Aterstall backup" → filvaljare oppnas (filtrerad till .db/.sqlite)
9. [ ] Valj en ogiltig fil (t.ex. textfil) → felmeddelande
10. [ ] Valj den sparade backupen → bekraftelse-dialog, sedan omstart
11. [ ] Verifiera att data ar intakt efter omstart

### Kreditfaktura partiell (5 min)
12. [ ] Skapa faktura med 2 rader (100kr + 200kr) → bokfor
13. [ ] Kreditera fakturan → kreditfaktura-utkast oppnas med 2 rader
14. [ ] Justera rad 1 qty till 0.5 → bokfor kreditfakturan
15. [ ] Oppna verifikatet → debet/kredit ar pa 50kr (rad 1) + 200kr (rad 2)
16. [ ] Originalfakturan visar "Krediterad"-badge

### Kontoutdrag (3 min)
17. [ ] Navigera till kontoutdrag for konto 1930
18. [ ] Verifiera: IB-rad forst, lopande saldo stammer
19. [ ] Filtrera pa datumintervall → rader utanfor intervall forsvinner, IB kvarstar
20. [ ] Hovra over kontonummer → tooltip visar kontobeskrivning

### A11y snabbcheck (2 min)
21. [ ] Tab genom hela appen utan att "fastna"
22. [ ] Bekraftelse-dialog (F50): Escape stangar, Tab cyclar inom
23. [ ] Tooltip pa kontonummer: synlig vid fokus (inte bara hover)

---

## Nya tester per feature — sammanfattning

| Feature | Typ | Antal (ca) |
|---------|-----|------------|
| F50 ConfirmDialog | Unit + integration + axe | 6-8 |
| F51 Foretagsvarning | Integration | 3 |
| F52 Backup-restore | Service + integration | 8-10 |
| F53 Datum | Edge case | 2-3 |
| F54 Tooltip | Unit + axe | 3-4 |
| F55 A11y-pass | axe | 2-3 |
| B1 Partiell kreditering | System + E2E | 7 |
| B2 Kontoutdrag | Service + IPC contract + renderer | 8-11 |
| **Totalt** | | **~40-50** |

**IPC contract test-krav:** Varje ny IPC-kanal (B2 `account:get-statement`, F52 `backup:restore-dialog`) kraver Zod-schema i `ipc-schemas.ts` + contract test.

**Mal:** ~1610+ vitest efter sprinten (1566 baseline + ~45 nya).

---

## Verifiering vid sprint-avslut

```bash
npm run test          # ~1610+ passed
npm run typecheck     # 0 errors
npm run check:m131    # rent
npm run check:m133    # rent
npm run build         # rent
npm run lint          # (pre-existing prettier-errors okej)
```

- Uppdatera STATUS.md
- Uppdatera bug-backlog.md (F50–F56 stangda)
- Kör manuellt smoke-test-script ovan
- Tagga `s29-done`
