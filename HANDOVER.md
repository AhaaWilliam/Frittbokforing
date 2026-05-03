# Handover — Fritt Bokföring

Sista uppdatering: 2026-05-03. Tre autonoma loop-omgångar (VS-116..VS-146) + kritisk produktions-fix.

## TL;DR

38 sprintar levererade i fyra autonoma loop-omgångar plus en kritisk
produktions-fix:
- **Omgång 1** (VS-116..VS-129, 14 sprintar) — inkorgen-utbyggnader,
  stäng-månad-flow, VAT-deadline, settings-toggles, M156-konsolidering.
- **Omgång 2** (VS-130..VS-139, 10 sprintar) — closed_at-display i
  perioder + år, PageSettings/SkapaFakturaSheet test-paritet,
  React.memo-perf-fix, pluralDays-helper, M133-vakt-fix, dokumentation.
- **VS-140** — Bugfix: `useNavigate must be used within HashRouter`
  som kraschade Vardag-läget i produktion. HashRouter lyft från
  AppShell till App.tsx ovanför ModeRouter.
- **Omgång 3** (VS-141..VS-147, 10 sprintar) — zip-bundle export,
  push-notif moms, PDF-preview, ActivePeriodContext, OCR-pipeline
  (extract → UI → supplier-match → org-nr → pre-warm), ESLint hygiene.
- **Omgång 4** (VS-148..VS-151, 4 sprintar) — PDF-OCR via PDF.js,
  PageReports period-wiring, mock-ipc completeness audit (+ vakt-test),
  HANDOVER backlog #11 stängd.

Pushed löpande till origin/main. TypeScript rent, ESLint rent.
Statiska checks alla OK. mock-ipc nu drift-skyddad.

**Nästa naturliga steg kräver produktbeslut** (se "Öppna frågor" nedan).

## Omgång 4 (VS-148..VS-151) sprint-katalog

| Sprint | Commit | Innehåll |
|---|---|---|
| VS-148 | `be0dfc5` | PDF-OCR via PDF.js — `pdfFirstPageToBlob` (scale 2.0, dynamic import för jsdom-kompat), ocrReceipt detekterar PDF mime-type, BokforKostnadSheet accepterar `.pdf`. Multi-page tyst trunkerad till sida 1. |
| VS-149 | `1f4e500` | PageReports period-wiring → ActivePeriodContext. `mapDateRangeToPeriod` (pure, exakt 1-period-match) + useEffect i PageReports. Span över multipla perioder → ingen highlight. |
| VS-150 | `c8d3fa8` | mock-ipc methodToChannel completeness audit — 22 saknade entries lagda till (credit notes, SIE5, SEPA DD, cash flow, bank reconciliation). Vakt-test förhindrar framtida drift. |

## Omgång 3 (VS-141..VS-146) sprint-katalog

| Sprint | Commit | Innehåll |
|---|---|---|
| VS-141 | `a894586` | Receipts zip-bundle (archiver-lib, per-bolag, BFL 7 kap-arkivkrav). PageInbox-knapp. M147-bypass. |
| VS-142 | `05954ce` | Push-notif moms-deadline (opt-in). Migration 062 `companies.notify_vat_deadline`. 7/3/1-eskalering, idempotent state via settings-keys. |
| VS-143 | `6a8bd61` | PDF/bild-preview i sheets. ReceiptPreviewPane (iframe/img). IPC `receipt:get-absolute-path` med path-traversal-skydd. BokforKostnadSheet 60/40 split + Eye-knapp i PageInbox. |
| VS-144 | `06ff171` | ActivePeriodContext infrastruktur. MonthIndicator läser från useActivePeriod() (default = global FY = no-op idag). Page-wiring backlog (kräver beslut för VAT/Reports period-mappning). |
| VS-145a | `509bae2` | Tesseract.js worker singleton + pure extract-funktioner (amount/date/supplier_hint, 70% threshold). |
| VS-145b | `317b8e9` | OCR-integration i BokforKostnadSheet. Suggestion-Callout med "Tillämpa"/"Avvisa". Tyst felhantering. |
| VS-145c | `98e9994` | Counterparty fuzzy-match från supplier_hint. matchSupplier (substring + Levenshtein, suffix-strip för AB/Aktiebolag), threshold 0.7. |
| VS-145d | `99970fe` | Org-nummer-extraktion (Luhn-validering). matchSupplier optional orgNumber-arg → exakt match score=1.0 prioriteras. |
| VS-145e | `9bacef5` | Pre-warm Tesseract worker vid sheet-open. Eliminerar 3-5s cold-start vid första kvittot. |
| VS-146 | `8942bc2` | ESLint hygiene — fixat 3 pre-existerande fel (BalanceSheet/IncomeStatement prettier + index.ts lazy-require disable). Validation matrix nu helt grön. |

## Omgång 2 (VS-130..VS-140) sprint-katalog

| Sprint | Commit | Innehåll |
|---|---|---|
| VS-130 | `6366f1d` | PeriodList visar `Stängd <datum>` via FiscalPeriod.closed_at. Title-attr bär timestamp. Fallback till "Klar". |
| VS-131 | `861fbd9` | PageSettings UI-tester för VS-120 (has_employees) + VS-121 (vat_frequency). 5 nya tester. |
| VS-132 | `d49e168` | PageSepaDd MandateRow `React.memo` + `useCallback`. |
| VS-133 | `423a1b9` | Fixade dold M133-violation i PeriodList "returns null" (prettier-formaterad axeCheck över 3 rader). |
| VS-134 | `8e45984` | SkapaFakturaSheet 4 paritet-tester (VS-19/28/14/22). |
| VS-135 | `4836c1c` | YearPicker visar "Stängt 15 feb 2027 — skrivskyddat" via FiscalYear.closed_at + IPC-schema-paritet. |
| VS-136 | `41b5113` | `pluralDays(n)` shared helper — "1 dag" / "N dagar" enligt SAOL. Fixar "X dag(ar)"-mönstret. |
| VS-137 | `0a3dbaf` | SkapaFakturaSheet Cmd+Enter-paritet (2 tester). |
| VS-138 | `db39899` | SkapaFakturaSheet error-clearing + account-name paritet (2 tester). |
| VS-139 | `aa32797` | HANDOVER.md uppdatering + e2e/README.md whitelist för 3 nya data-testid. |
| VS-140 | `4d7025a` + `95d1ae0` | **BUGFIX:** HashRouter lyft till App.tsx (kraschade Vardag-mode). Regressionstest mountar full App-stack. |

## Vad som är gjort i denna omgång (sprint-katalog)

| Sprint | Commit | Innehåll |
|---|---|---|
| VS-116 | `503b2b8` | Bokförare-läget PeriodList använder nu CloseMonthDialog (samma advisory-checks som Vardag). Droppad ConfirmDialog. mock-ipc registrerade getPeriodChecks. |
| VS-117 | `fd60250` | VAT-deadline-pillen i Vardag-hero är klickbar → setMode('bokforare') + navigate('/vat'). |
| VS-118 | `7ae3a2e` | mod+k i Vardag växlar mode och dispatchar `global-search:focus`-event. GlobalSearch lyssnar och fokuserar input efter mount. |
| VS-119 | `da6806c` | `deleteExpenseDraft` wrappar i transaktion + anropar `_unlinkReceiptFromExpenseTx` före DELETE. Defense-in-depth mot CHECK-violation om en booked-receipt är länkad till draften. |
| VS-120 | `2def304` | Migration 061 — `companies.has_employees` boolean-flagga. salaryBooked-checken blir 'warning' (inte 'na') om flaggan=1 + inga lönerader. UI-toggle i PageSettings. |
| VS-121 | `3ddc645` | Settings-UI för `vat_frequency` (monthly/quarterly/yearly). Tidigare fastnaglat på 'quarterly'. UpdateCompanyInputSchema + ALLOWED_UPDATE_FIELDS utvidgade. |
| VS-122 | `3c38e54` | PeriodList visar status-pill på första öppna period: "Klar för stängning" (allOk) eller "Varningar" (advisory-checks pre-fetchade). |
| VS-123 | `2f88cf7` | CSV-export av kvittolista från PageInbox (BFL 7 kap arkivkrav). BOM + ; + CRLF, IPC `receipt:export-csv` med save-dialog (E2E-bypass). |
| VS-124 | `4896f44` | Native `confirm()` i PageInbox.handleDelete bytt mot Radix AlertDialog. Statisk vakt-test för regression. |
| VS-125 | `363eaba` | Slutfört native-confirm-migration: PageFixedAssets (kör avskrivningar + radera) + PageSepaDd (revoke mandat). Ny statisk vakt scannar alla 27 pages. |
| VS-126 | `836cba6` | Notes-edit dialog för receipts. StickyNote-knapp på varje row → Radix Dialog med textarea (max 500 char). Befintlig anteckning visas som tooltip-titel + warning-färgad ikon. mock-ipc registrerade 8 saknade receipt-metoder. |
| VS-127 | `b38eef3` | CloseMonthDialog warning-rader klickbara → navigerar till relevant page. Mappning: bankReconciliation→/bank-statements, vatReportReady→/vat, supplierPayments→/expenses, salaryBooked→/manual-entries. Enter/Space-aktivering. |
| VS-128 | `e9143c9` | Bugfix till VS-127: CloseMonthDialog navigation måste växla mode→bokförare innan navigate (Vardag har ingen sub-routing). |
| VS-129 | `041a0dc` | Svensk helg-bump för VAT-deadline. Computus för påsk + statiska helger. bumpToNextWorkday hanterar weekend + bankhelger. 12 nya tester. Beteende-ändring: 26 juli (lör) → 28 juli (mån). |

## Arkitektur-anteckningar

### Inkorgen-flödet är nu fullt utbyggt

PageInbox har: drop-zone, tre-tab-vy, bulk-actions, per-rad notes-edit
(VS-126), CSV-export (VS-123), bookför-flöde (VS-112), Radix-dialoger
för delete (VS-124). Återstår bara PDF-preview (BLOCKED på
visningsstrategi).

`expense-service.deleteExpenseDraft` är nu transaktionsbaserad och
rensar kopplade receipts via `_unlinkReceiptFromExpenseTx` (VS-119).
Detta täcker en defense-in-depth-lucka som var orealistisk att
trigga i nuvarande flow men oavsett var ett CHECK-constraint-brott
i väntan.

### Stäng månad — pelare lagda

CloseMonthDialog är nu primär entry-point både i Vardag (BigButton)
och bokförare (PeriodList close-knapp via VS-116). Fyra
advisory-checks (period-checks-service VS-113):
- bankReconciliation — bank-statements som ej matchats
- salaryBooked — VS-120 differentierar via `companies.has_employees`
- vatReportReady — utkast som blockerar moms-rapport
- supplierPayments — unpaid expenses med due_date i perioden

Warning-rader är klickbara (VS-127) → navigerar till åtgärds-page med
mode-byte vid behov (VS-128). PeriodList visar status-pill på första
öppna period så användaren ser status utan att öppna dialogen
(VS-122).

### VAT-deadline — komplett

`computeVatDeadline` (VS-115b) + `bumpToNextWorkday` (VS-129) ger nu
korrekt SKV-formell deadline. `vat_frequency` styrbar via Settings
(VS-121). Pillen klickbar (VS-117). Computus implementerad inline —
ingen extern beroende.

`bumpToNextWorkday(iso)` är generellt användbar utility (publik
export) — kan återanvändas av andra deadline-domäner (lön,
arbetsgivardeklaration, K10).

### M156 / native dialog — clean

Inga `confirm()`/`alert()`/`prompt()` kvar i renderer-lagret.
Statisk vakt i `tests/sprint-vs125-no-native-confirm.test.ts`
scannar alla 27 sidor och blockerar regression. EXEMPTIONS-lista
finns för framtida legitima undantag.

## Test-status + körkommandon

```bash
# Type-check (rent)
npx tsc --noEmit

# ESLint (rent)
npx eslint src/renderer src/main src/shared

# Renderer-tester (1410 gröna, +13 från denna omgång)
npx vitest run tests/renderer

# Specifika nya testfiler
npx vitest run tests/sprint-vs115b-vat-deadline.test.ts          # +12 VS-129
npx vitest run tests/sprint-vs113-period-checks.test.ts          # +2 VS-120
npx vitest run tests/sprint-vs119-delete-draft-unlink.test.ts    # 4 nya
npx vitest run tests/sprint-vs121-update-company-fields.test.ts  # 6 nya
npx vitest run tests/sprint-vs123-receipts-csv-export.test.ts    # 5 nya
npx vitest run tests/sprint-vs125-no-native-confirm.test.ts      # 27 (en per page)
npx vitest run tests/renderer/components/period/CloseMonthDialog.test.tsx  # 4 (VS-127+128)
npx vitest run tests/renderer/components/overview/PeriodList.test.tsx     # 13 (incl VS-122)
npx vitest run tests/renderer/pages/PageInbox.test.tsx                    # 4 (VS-124+126)
npx vitest run tests/renderer/components/layout/GlobalSearch.test.tsx     # 11 (incl VS-118)
npx vitest run tests/renderer/modes/vardag/VardagApp.test.tsx             # 11 (VS-117+118)

# Commits ahead of origin/main
git log origin/main..HEAD --oneline | wc -l   # 276
```

**better-sqlite3 ABI**: kvarstår som M115 — `npm rebuild better-sqlite3`
om vitest klagar på NODE_MODULE_VERSION efter Electron-bygge.

## Lärdomar från VS-140

Bugg där Vardag-mode kraschade i produktion (men inte i tester) avslöjade
ett mönster:

- **`renderWithProviders` ger false positives för router-buggar.** Testerna
  wrappar alltid i HashRouter, så test-suite kan grön-stämpla en render-tree
  där production-stacken saknar provider.
- **Mönster för regressionstest:** `tests/renderer/sprint-vs140-app-router-mount.test.tsx`
  mountar full `<App />` utan helper-wrapper. Använd samma mönster för
  framtida hela-app-stack-tester.
- **Princip:** Provider-monteringar (HashRouter, FiscalYearProvider,
  ActiveCompanyProvider, QueryClientProvider) ska ligga i `App.tsx`, inte
  i mode-skal som AppShell — annars måste varje mode duplicera dem.

Lägg till i checklista vid framtida mode-arbete: se till att hooks som
useNavigate/useFiscalYearContext/useActiveCompany funkar i båda modes
genom att verifiera provider-hierarkin i App.tsx.

## Öppna frågor — kräver produktbeslut före nästa sprint

VS-141..VS-150 levererade ursprungliga planen + extras. Återstående beslut:

1. **VS-144 page-wiring för PageVat:** Q1-Q4 = 3 perioder per kvartal. Nuvarande ActivePeriodContext stödjer bara *en* periods-highlight. Multi-period-highlight kräver context-shape-refactor (~5h) — vill vi det, eller skip PageVat-wiring?
2. **VS-144 page-wiring för PageBudget:** 12-period grid har inget "vald period"-koncept. Lägga till per-period-fokus är design-arbete.
3. **OCR till SkapaFakturaSheet:** ANSWERED — nej (sannolikt inte värdefullt för utgående fakturor).
4. **Push commits → origin/main:** löpande nu (VS-148..VS-151 pushas i slutet av denna omgång).

### Avlöst

- ~~PDF-OCR~~ — Levererat i VS-148.
- ~~PageReports period-wiring~~ — Levererat i VS-149.
- ~~HANDOVER #11 (PageSepaDd MandateRow inline-callback)~~ — VS-132 löste primär-fallet. Återstående map-iterationer i PageSepaDd har antingen egen state (BatchRowComponent) eller är för små/utan callback-prop (CollectionRowComponent, pendingCollections). Ej aktivt issue.
- ~~HANDOVER #13 (mock-ipc methodToChannel)~~ — VS-150 auditade och lade till 22 saknade entries + vakt-test mot framtida drift.

## Plan för förra sprint-omgången (VS-141..VS-150) — LEVERERAD

**Status:** VS-141..VS-145e + VS-146 (ESLint hygiene) levererade. VS-146..VS-150-platser i numreringen kvarstår fritt för framtida sprintar.

**Produktbeslut mottagna:** "Ok på allt" — alla rekommenderade defaults gäller.

### Prioriterad ordning

#### 🟢 Första session (snabba, väl-avgränsade — 6-9h)

**VS-141: Receipts zip-bundle (~4-5h)** — handover-item #5

Mål: BFL 7 kap-konform arkivexport (CSV + alla fysiska kvittofiler).

**Beslut tagna:**
- Lib: `archiver` (mest mogen, MIT-licens, ~80 KB med deps)
- Granularitet: per-bolag (alla statusar, alla år)
- Filstruktur: `receipts/<expense_id>/<basename>` + `metadata.csv` i roten

Implementation:
- Ny dep: `npm install archiver @types/archiver`
- `receipt-service.exportReceiptsZipBundle(db, { company_id })` returnerar
  `IpcResult<{ filename: string }>` (skriver direkt till disk via stream).
- IPC `receipt:export-zip-bundle` med save-dialog (M147 E2E-bypass).
- PageInbox-knapp bredvid "Exportera CSV" (VS-123).
- Återanvänd VS-123 CSV-genereringslogik som rad-källa.
- Test: säkerhetskopia-mönstret (skriver tmp-fil, läser tillbaka, verifierar
  metadata.csv + minst en fysisk fil i zip:en).

**VS-142: Push-notifiering MVP — moms-deadline (~2-3h)** — handover-item #4

Mål: Native OS-notification 7/3/1 dagar före moms-deadline.

**Beslut tagna:**
- Opt-in (default off), via Settings-toggle
- Bara moms i v1 (K10/inkomstdeklaration backlog)
- Eskalerande trigger vid 7, 3, 1 dagar (en gång per nivå per deadline)
- One-shot-state: `last_notified_vat_deadline_<level>` settings

Implementation:
- Ny migration 062 — `companies.notify_vat_deadline INTEGER NOT NULL DEFAULT 0`
- Settings-UI under "Moms-deklarationsfrekvens" (PageSettings).
- Main-process: `vat-deadline-notifier.ts` triggas i `app.whenReady()` i
  `src/main/index.ts`. Hämtar alla bolag, beräknar nästa deadline per bolag
  via `computeVatDeadline` + `bumpToNextWorkday` (VS-129), filtrerar de som
  har `notify=1` och `daysUntil ∈ {7, 3, 1, 0, -1, -2, ...}`.
- Settings-key per bolag+deadline-nivå: `vat_notif_<companyId>_<isoDate>_<level>`.
- `new Notification(...)` på main side via `webContents.send('notification:show', ...)`
  → renderer dispatchar `new Notification`. (Renderer-side så Electron-permissions
  hanteras naturligt.)
- Klick på notif: öppnar appen + navigerar till `/vat`.
- Test: enhetstest av `shouldNotify(now, deadline, last_notified, frequency)`-logik.

#### 🟡 Andra session (medel-svår, layout-arbete — 4-6h)

**VS-143: PDF-preview i sheets (MVP) (~3-5h)** — handover-item #1

Mål: Visa kvittofil inline i BokforKostnadSheet + Inkorgen.

**Beslut tagna:**
- Native iframe (PDF) + `<img>` (bild) — inte PDF.js
- Sheet-sidobar (split-vy: form vänster, preview höger)
- Bildformat: jpg/png/webp/heic via OS-default — fallback "Kan inte
  visa filen" om misslyckat

Implementation:
- Ny komponent: `src/renderer/components/receipts/ReceiptPreviewPane.tsx`
- Tar `receiptPath: string | null` (relativ path mot `<documents>/Fritt Bokföring/`)
- IPC `receipt:get-absolute-path(receipt_path)` — returnerar `file://...`-URL
  efter path-traversal-validering (workaround för Electron file://-protokoll
  i renderer; absolut-path resolveras i main för säkerhet).
- BokforKostnadSheet: layout breddas till 60/40 split när `prefilledReceipt`
  eller egen `receipt_path` finns. Preview-pane försvinner när inget kvitto.
- Format-detection: `path.endsWith('.pdf')` → `<iframe>`; bildtyper → `<img>`.
- Tester: snapshot för layout-shift, mock receipt:get-absolute-path med
  fake file://-URL, verifiera iframe vs img per filtyp.

**VS-144: Period-label dynamic per kontext (~2h)** — handover-item #3

Mål: Sidebar's MonthIndicator + period-label reflekterar page-vald period
där det finns (PageBudget, PageVat, PageReports).

**Beslut tagna:**
- Page-driven: pages med egen period-picker exponerar via context
- Pages utan picker (PageOverview, PageIncome m.fl.) — sidebar fortsätter
  visa global FY (oförändrat)

Implementation:
- Ny `ActivePeriodContext` (analogt med FiscalYearContext) i
  `src/renderer/contexts/ActivePeriodContext.tsx` med default = global FY.
- PageBudget/PageVat/PageReports wrappar sin sub-tree i provider med
  page-state.
- MonthIndicator läser från `useActivePeriod()` istället för
  `useFiscalYearContext()` direkt.
- Test: render Sidebar inom PageBudget med period-override, verifiera
  highlight på rätt månad.

#### 🔵 Tredje session (komplex, kräver mest beslut — 5-7h)

**VS-145: OCR-MVP via Tesseract.js (~5-7h)** — handover-item #2

Mål: När användare attachar kvitto, försök auto-extrahera datum + belopp
och pre-fyll fält i BokforKostnadSheet.

**Beslut tagna:**
- Tesseract.js (lokal, ~5 MB bundle) — privacy-första
- Pre-fill med "föreslagen"-toast: "Vi tror datumet är 2026-04-15 och
  beloppet 2 350 kr — klicka för att tillämpa" (inte auto-overwrite)
- Confidence-threshold: visa förslag bara om >70% confidence

Implementation:
- Ny dep: `npm install tesseract.js`
- Worker körs i renderer (web worker för att inte blockera UI).
- `src/renderer/lib/ocr/extract-receipt-fields.ts` — pure function:
  - Input: bild-blob (skip för PDF i v1 — användare attachar bild)
  - Output: `{ amount_kr?: number; date?: string; supplier_hint?: string; confidence: number }`
  - Regex-baserad post-processing av OCR-text: SEK-formaterade belopp,
    yyyy-mm-dd / dd/mm/yyyy / dd.mm.yyyy datum, leta supplier-namn
    (första rad i printbart område).
- Hook in: `BokforKostnadSheet.handleReceiptAttached` startar OCR i
  bakgrunden, visar toast med "Tillämpa förslag"-knapp.
- Tester: enhetstest av regex-parser med 5-10 olika kvitto-text-fixtures.

#### ⚪ Backlog efter VS-141..VS-145

**VS-146+ (BokforKostnadSheet refactor):** Skip till naturligt drift.
Bygg eventuellt `expense-form-core` om PDF-preview (VS-143) tvingar
fram delning mellan BokforKostnadSheet och ExpenseForm — annars vänta.

**Kvarvarande backlog från ursprunglig handover:**
- #8 Helg-bump generaliserad (VS-129) — vänta tills callsite uppstår
- #11 PageSepaDd MandateRow inline-callback (delvis löst i VS-132)
- #12 CloseMonthDialog edge-case (mid-period FY) — låg prio
- #13 mock-ipc methodToChannel komplettering — gör när nya tester behöver

### Beslut som fortfarande är öppna

Inga från huvudplanen — alla frågor har defaults (rekommenderad approach
i parantes per item ovan).

**Eventuellt extra under arbete:**
- **VS-145 OCR confidence-threshold:** 70% är gissning. Justera baserat
  på faktiska kvitton i testdata. Be om feedback efter första iteration.
- **VS-142 push-notif klick-beteende:** Min antagande "öppna app +
  navigera till /vat". Verifiera UX-känslan när det är byggt.
- **VS-141 zip-filnamn:** Förslag `receipts-<bolagsnamn>-<datum>.zip`.
  Föreslå bättre om något visar sig bra.

### Tekniska skulder utan produktblockad (oförändrade)

- #11 PageSepaDd MandateRow edge-case
- #12 CloseMonthDialog mid-period edge-case
- #13 mock-ipc methodToChannel komplettering

## Filer att läsa först i nästa session

**För VS-141 (zip-bundle):**
```
src/main/services/receipt-service.ts               # VS-123 exportReceiptsCsv som mall
src/renderer/pages/PageInbox.tsx                   # VS-123 export-knapp + IPC-anrop
src/main/utils/e2e-helpers.ts                      # M147 dialog-bypass-mönstret
```

**För VS-142 (push-notif):**
```
src/shared/vat-deadline.ts                         # VS-115b/129 deadline-beräkning
src/renderer/modes/vardag/VardagApp.tsx            # VAT-pill konsumer (referens)
src/main/index.ts                                  # app.whenReady() entry-point
src/renderer/pages/PageSettings.tsx                # toggle-mönster (vat_frequency)
```

**För VS-143 (PDF-preview):**
```
src/renderer/modes/vardag/BokforKostnadSheet.tsx   # ReceiptVisual-komponent (line 596)
src/renderer/pages/PageInbox.tsx                   # receipt-row med samma path
src/main/services/receipt-service.ts               # file-path-resolution + sanity
```

**För VS-144 (period-label):**
```
src/renderer/components/layout/MonthIndicator.tsx  # nuvarande global FY-konsumer
src/renderer/contexts/FiscalYearContext.tsx        # mönster för ny ActivePeriodContext
src/renderer/pages/PageBudget.tsx                  # exempel page med period-picker
```

**För VS-145 (OCR):**
```
src/renderer/modes/vardag/BokforKostnadSheet.tsx   # handleReceiptAttached hook-in-punkt
src/main/services/receipt-service.ts               # file-storage + path-helpers
```

**Allmänna referenser:**
```
CLAUDE.md                                          # M1..M162 projektprinciper
src/main/migrations.ts                             # user_version=61, lägg till 062
tests/setup/mock-ipc.ts                            # methodToChannel för nya kanaler
tests/renderer/sprint-vs140-app-router-mount.test.tsx  # mönster för full-stack-tester
```

## Kommandoreferens

```bash
# Snabb sanity-check vid sessionsstart
npx tsc --noEmit                                   # ren
npx eslint src/renderer src/main src/shared       # ren
npx vitest run tests/renderer                     # 1428 gröna

# Statiska checks (kör innan commit)
npm run check:m133 && npm run check:m133-ast      # axeCheck-vakt + AST-scan
npm run check:m131                                 # heltalsmoms-aritmetik
npm run check:m144-ast                             # IpcResult-mandat
npm run check:m150-ast                             # getNow() i main
npm run check:m153                                 # deterministisk scoring
npm run check:dynamic-update                       # SQL UPDATE-templates
npm run check:ipc-handlers                         # handler-mönster

# Commits ahead of origin/main
git log origin/main..HEAD --oneline | wc -l       # 276

# Ny migration: lägg till i src/main/migrations.ts (nästa: user_version=62)
# Ny IPC-kanal: lägg till i src/shared/ipc-schemas.ts (channelMap) +
#               src/shared/ipc-response-schemas.ts (channelResponseMap) +
#               src/main/ipc-handlers.ts (registrera) +
#               src/main/preload.ts (expose) +
#               src/renderer/electron.d.ts (typer) +
#               tests/setup/mock-ipc.ts methodToChannel (för tester)
```

**better-sqlite3 ABI:** kvarstår som M115 — `npm rebuild better-sqlite3`
om vitest klagar på NODE_MODULE_VERSION efter Electron-bygge.

## Loop-instruktion för nästa session

Föreslagen prompt för att starta:

```
loop kör VS-141 (receipts zip-bundle) enligt plan i HANDOVER.md.
Använd archiver-lib, per-bolag-export, filstruktur receipts/<expense_id>/<basename>.
Återanvänd VS-123 CSV-genereringen som metadata.csv inuti zip:en.
Stoppa loopen efter VS-141 är committad och pusha en final-summary.
```

Eller, om du vill köra hela planen i ett:

```
loop kör VS-141..VS-145 enligt plan i HANDOVER.md. Stoppa loopen
(final summary) om någon av dessa gäller:
  (a) en sprint avviker från planen och kräver nytt produktbeslut
  (b) jag har kört 40 sprintar i rad — paus för granskning
  (c) test-suite blir röd och inte direkt fixbar
```

Den första prompten är säkrast (ett välavgränsat steg). Den andra
är mer aggressiv — gör många timmars arbete utan check-in. Stop-villkor
(a) i v2-prompten gör att du fortfarande hör av mig vid avvikelser.
