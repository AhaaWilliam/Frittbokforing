# Handover — Fritt Bokföring

Sista uppdatering: 2026-05-03. Två autonoma loop-omgångar (VS-116..VS-138).

## TL;DR

23 sprintar levererade i två autonoma loop-omgångar:
- **Omgång 1** (VS-116..VS-129, 14 sprintar) — inkorgen-utbyggnader,
  stäng-månad-flow, VAT-deadline, settings-toggles, M156-konsolidering.
- **Omgång 2** (VS-130..VS-138, 9 sprintar) — closed_at-display i
  perioder + år, PageSettings/SkapaFakturaSheet test-paritet,
  React.memo-perf-fix, pluralDays-helper, M133-vakt-fix.

**273 commits ahead of origin/main, otrycka.** Tester 1433 gröna i
renderer (+23 från omgång 2). TypeScript rent, ESLint rent.

Återstående backlog är dominerat av medvetna produktblockeringar
(PDF-preview-strategi, OCR, push-notifieringar) eller större
refaktorer (BokforKostnadSheet ~3-4h). Inga "låghängande frukter" kvar
i den ursprungliga handover-listan.

## Omgång 2 (VS-130..VS-138) sprint-katalog

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
git log origin/main..HEAD --oneline | wc -l   # 263
```

**better-sqlite3 ABI**: kvarstår som M115 — `npm rebuild better-sqlite3`
om vitest klagar på NODE_MODULE_VERSION efter Electron-bygge.

## Vad som är kvar att bygga

### Helt blockerat på produktbeslut

**1. PDF-preview i sheets** (~5h, från föregående handover)
Sheet:erna visar idag bara filnamn + 📎-emoji. Ingen visuell preview.
**Frågor**: `<iframe src={path}>` för PDF + `<img>` för bilder, eller
PDF.js? Var ska PreviewPane visas (sidebar i sheet vs. ny modal)?
Acceptabelt med native iframe-rendering trots olika look per OS?

**2. Receipt-detail-vy / inline-preview i KostnadSheet** (~3h utöver #1)
Bygger ovanpå #1.

**3. OCR-pipeline för auto-fyllning** (medvetet uppskjuten)
Tesseract.js (lokal) eller cloud-API. Receipts-schema och file-storage
är förberett. Hänger inte fast i något befintligt — kan
implementeras isolerat.

**4. Period-label dynamic per kontext** (~2h)
Sidebar-headern visar samma period-label överallt. På PageBudget,
PageVat, PageReports skulle period kunna reflektera vald period.
**Frågor**: Sidebar bero på vilken page som visas? Separat
per-page-period-context? Hur hanteras "valda perioder" på sidor med
egna period-pickers?

**5. Push-notifiering nära deadline** (UX-design behövs)
Electron stöder native notifications. Vid `daysUntil ≤ 7` vid
app-start kan notification öppnas. Behöver per-användare-settings
för opt-in/dismiss-mekanism.

### Möjliga utan produktblockad

**6. BokforKostnadSheet refactor** (~3-5h, riskerar gränsen)
678 rader, delas mellan Vardag-läget och PageInbox via
`prefilledReceipt`-prop. Kunde extraheras till `expense-form-core`
+ två thin shells (Vardag-sheet, Inkorgen-context). Räknas som
arkitektur-skuld men inte akut.

**7. Receipts zip-bundle med fysiska filer** (BFL-arkivkrav-utbyggnad)
VS-123 ger CSV med metadata. BFL 7 kap kräver att även de fysiska
kvittofilerna arkiveras. Skulle exportera CSV + alla files i
zip-bundle. Filerna ligger redan strukturerade i
`<documents>/Fritt Bokföring/receipts-inbox/` — bara att packa.

**8. Helg-bump generaliserad** (VS-129 är specifik för VAT)
`bumpToNextWorkday` är publik export. Kan användas av:
- Lönedeklaration-deadline (om/när det implementeras)
- K10-deadline (juli)
- Inkomstdeklaration (maj)

**9. Test-coverage för PageSettings** (saknas helt)
Inga befintliga tester. Med VS-120 + VS-121 har Settings utökats
med 3 nya kontroller utan UI-test.

**10. Bokförare-PeriodList per-period status även för stängda**
VS-122 visar status bara på första öppna period. För stängda perioder
kunde en "stängd"-pill med datumet visas istället för "Klar"-pill.
Liten UX-polish.

### Tekniska skulder utan produktblockad

**11. PageSepaDd MandateRow är extraherad men prop-onRevoke är
kvar som inline-callback** (efter VS-125). Småsak.

**12. CloseMonthDialog auto-pickar "första öppna" period när inget
override** — pickActivePeriod-funktionen tittar bara på
`is_closed === 0`. Om FY börjar mid-period kan det leda till en
felaktig pick. Edge-case som inte triggar i praktiken.

**13. mock-ipc.ts methodToChannel är inkomplett**
VS-126 upptäckte att 8 receipt-metoder saknades. Det finns
sannolikt fler — t.ex. inga av sepa-dd, banking, depreciation
finns med. När nya tester skrivs som behöver dem måste de
registreras manuellt.

## Filer att läsa först i nästa session

```
CLAUDE.md                                          # M1..M162 projektprinciper
HANDOVER.md                                        # detta dokument
src/shared/vat-deadline.ts                         # VS-129 helg-bump
src/main/services/period-checks-service.ts         # VS-120 has_employees
src/main/services/receipt-service.ts               # VS-123 CSV + VS-119 unlink
src/renderer/components/period/CloseMonthDialog.tsx # VS-127+128 navigation
src/renderer/pages/PageInbox.tsx                   # VS-124+126 dialogs + notes
src/renderer/pages/PageSettings.tsx                # VS-120+121 toggles
src/renderer/components/overview/PeriodList.tsx    # VS-116+122
tests/sprint-vs125-no-native-confirm.test.ts       # statisk vakt — pages-scan
```

## Kommandoreferens

```bash
# Snabb sanity-check vid sessionsstart
npx tsc --noEmit                                   # ren
npx eslint src/renderer src/main src/shared       # ren
npx vitest run tests/renderer                     # 1410 gröna

# Kör en domän
npx vitest run tests/sprint-vs1               # alla VS-* tester (mönster-match)

# Ny migration: lägg till i src/main/migrations.ts (befintlig user_version=61)
# Ny IPC-kanal: lägg till i src/shared/ipc-schemas.ts (channelMap) +
#               src/shared/ipc-response-schemas.ts (channelResponseMap) +
#               src/main/ipc-handlers.ts (registrera) +
#               src/main/preload.ts (expose) +
#               src/renderer/electron.d.ts (typer) +
#               tests/setup/mock-ipc.ts methodToChannel (för tester)
```

## Loop-instruktion (om du vill fortsätta)

```
loop kör nästa del av designen på Fritt Bokföring. Stoppa loopen
(skicka final summary, kalla inte ScheduleWakeup) om någon av
dessa gäller:
  (a) sprinten skulle kräva produktbeslut eller refaktor > 5 timme
  (b) jag har kört 40 sprintar i rad — paus för granskning
```

**Notera:** Med denna omgångs leveranser har de mest uppenbara
unblocked items konsumerats. Nästa loop-körning kommer sannolikt
träffa stop-villkor (a) tidigt eftersom återstående backlog
(handover #1-5) kräver produktbeslut. Inkludera ev. nya direktiv
för PDF-strategi, OCR-prioritering eller period-label-semantik om
du vill fortsätta loopen utan paus.
