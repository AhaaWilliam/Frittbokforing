# Handover — Fritt Bokföring

Sista uppdatering: 2026-05-02. Ersätter tidigare handover-dokument.

## TL;DR

15 sprintar (VS-104..115c) levererade i fyra teman: UX-keyboard-fixar (2),
Inkorgen-domänen (7), Stäng månad-checks (2), VAT-deadline-pill (3) +
2 test-/lint-städsprintar. **248 commits ahead of origin/main, otrycka.**
Tester 1397 gröna i renderer + ~70 nya domän-tester. TypeScript rent,
ESLint rent.

Tre handover-block från förra omgången (Inkorgen/OCR, Stäng månad-checks,
VAT-deadline) är funktionellt levererade enligt produktbeslut. Återstoden
av handover-listan blockeras på produktbeslut eller är spekulativ polish.

## Vad som är gjort i denna omgång

### Kluster A — UX-keyboard-fixar (VS-104, VS-105)

| Sprint | Commit | Innehåll |
|---|---|---|
| VS-104 | `b77a7b3` | mod+k-konflikt mellan AppShell-palette + GlobalSearch + InvoiceList/ExpenseList/PageAccounts. Migrerade list-search till `/`-shortcut (skippas i input/textarea). Mod+k är nu odelat mellan AppShell (palette) och GlobalSearch (sidofältet). |
| VS-105 | `00fd9f7` | Cmd+K stjäl inte fokus från öppen Radix-modal. Ny [is-modal-open.ts](src/renderer/lib/is-modal-open.ts) helper, AppShell-palette togglas bara om annan modal inte är öppen, GlobalSearch skippar fokus om modal är öppen. |

### Kluster B — Inkorgen-domänen (VS-106..112)

Komplett kvitto-kö-system. Användaren släpper PDF/bild i drop-zone,
raden hamnar i `status='inbox'`. Vid bokföring kopplas raden till en
expense och flyttas till `status='booked'`. Manuell strategi (ingen OCR
per produktbeslut).

| Sprint | Commit | Innehåll |
|---|---|---|
| VS-106 | `e67932d` | Migration 059: `receipts`-tabell, M158 company-scoping, M138 immutability-trigger, UNIQUE(company_id, file_hash), CHECK status-konsistens (booked⟺expense_id NOT NULL). 12 schema-tester. |
| VS-107 | `c5869c9` | [receipt-service.ts](src/main/services/receipt-service.ts): CRUD + bulk-archive + tx-helpers. SHA-256-hash, hash-prefix på destinationsfil, file-cleanup vid delete. 4 nya ErrorCodes. 17 service-tester. |
| VS-108 | `4acb899` | 7 IPC-kanaler: `receipt:list/create/update-notes/archive/archive-bulk/counts/delete`. Preload + electron.d.ts. |
| VS-109 | `015c59d` | 6 React-hooks: `useReceipts/useReceiptCounts/useCreateReceipt/useUpdateReceiptNotes/useArchiveReceipt/useBulkArchiveReceipts/useDeleteReceipt`. queryKeys-prefix `allReceipts()`. |
| VS-110 | `d65a302` | [PageInbox.tsx](src/renderer/pages/PageInbox.tsx) med drop-zone, tre flikar (Inkorgen/Bokförda/Arkiverade), bulk-actions-toolbar, per-rad-actions. Sidebar-länk + count-badge. Vardag-pill "Kvitton väntar" klickbar → /inbox. |
| VS-111 | `77df54d` | Public `linkReceiptToExpense` IPC + hook `useLinkReceiptToExpense`. Wrapper kring `_linkReceiptToExpenseTx` som speglar `file_path` till `expenses.receipt_path`. 4 tester. |
| VS-112 | `4deb5f2` | "Bokför från inkorgen"-flöde. BokforKostnadSheet utökad med valfri `prefilledReceipt`-prop. Drop-zone:n låses i prefilled-läge. PageInbox row "Bokför"-knapp öppnar sheet:en. |

### Kluster C — Stäng månad-checks (VS-113, VS-114)

Advisory-checks innan användaren stänger en period. **Blockerar inte**
stängning — visar varning så att användaren kan fatta informerat beslut
(per produktbeslut).

| Sprint | Commit | Innehåll |
|---|---|---|
| VS-113 | `e473d0b` | [period-checks-service.ts](src/main/services/period-checks-service.ts): fyra advisory-checks (bankavstämning, lön bokförd, moms-rapport preliminärt klar, leverantörsbetalningar). Status `'ok'/'warning'/'na'`. IPC `period:checks`, hook `usePeriodChecks`. 6 tester. |
| VS-114 | `e12c303` | [CloseMonthDialog.tsx](src/renderer/components/period/CloseMonthDialog.tsx) — Radix Dialog. Visar 4 checks med ikoner (CheckCircle/AlertTriangle/MinusCircle), knapp byter label "Stäng månad" / "Stäng ändå". Vardag BigButton "Stäng månad" öppnar dialogen istället för mode-byte. |

### Kluster D — VAT-deadline-pill (VS-115a..c)

Dynamisk Vardag-pill som visar nästa moms-deklarations-deadline med
färg baserat på dagar kvar.

| Sprint | Commit | Innehåll |
|---|---|---|
| VS-115a | `a98d470` | Migration 060: `companies.vat_frequency` (monthly/quarterly/yearly, default 'quarterly'). CHECK-constraint på enum. Backfill via DEFAULT. 4 tester. |
| VS-115b | `68b2183` | [vat-deadline.ts](src/shared/vat-deadline.ts): pure utility för deadline-beräkning. monthly = 26:e i (period-månad+2), quarterly = 12:e i (kvartal-end+2), yearly = 26:e i (FY-end+2). `vatDeadlineTone` mappar dagar-kvar → mint/warning/danger. 12 tester. |
| VS-115c | `292a710` | VardagApp `VatDeadlinePill` ersätter placeholder "Momsperiod: aktuell". StatusPill utökad med `'danger'`-tone. Pillen refreshar via VardagApp:s 60-sekund-tick. |

### Städsprint

| Commit | Innehåll |
|---|---|
| `73a1057` | Routes-test inkluderar 'inbox', VardagApp-test bytt till test-id-baserad pill-assertion, CloseMonthDialog null-coalesce på useFiscalPeriods. |

## Arkitektur-anteckningar

### Inkorgen — datalager

**`receipts`-tabell** ([migrations.ts:1981-](src/main/migrations.ts)):
- `company_id` NOT NULL (M158 stamdata-scoping per bolag, ingen FY-scoping)
- `file_path` är relativ mot `<documents>/Fritt Bokföring/`
- `file_hash` är SHA-256 hex; UNIQUE(company_id, file_hash) blockerar
  dubbletter inom bolag men tillåter samma fil i flera bolag
- `expense_id` FK med `ON DELETE SET NULL` — om expense raderas
  återställer DB-FK:n (men service-lagret äger semantiken: `_unlinkReceiptFromExpenseTx`
  återställer även status='inbox')
- CHECK enforce:ar `status='booked' ⟺ expense_id NOT NULL`
- Trigger `trg_receipts_company_immutable` blockerar UPDATE av company_id

**Filstorage**:
- Inbox: `<documents>/Fritt Bokföring/receipts-inbox/<hash16>-<sanitized-basename>`
- Linked: när receipt blir booked speglar `linkReceiptToExpense` filens path
  till `expenses.receipt_path` — ingen kopiering, samma fysiska fil delas
- Detta skiljer sig från legacy-flödet i `receipt-storage.ts` (saveReceiptFile)
  som kopierar filen per expense. Båda flöden samexisterar; nya användare
  hamnar i inbox-flödet (Vardag-sheets fallar tillbaka till saveReceiptFile
  bara om inget `prefilledReceipt`-prop sätts).

### Inkorgen — service-lagret

**Publika funktioner** ([receipt-service.ts](src/main/services/receipt-service.ts)):
- `listReceipts`, `getReceiptCounts`, `createReceipt`, `updateReceiptNotes`,
  `archiveReceipt`, `bulkArchiveReceipts`, `deleteReceipt`, `linkReceiptToExpense`
- Alla returnerar `IpcResult<T>` (M144). Validerar input via egen `parseOrFail`
  helper (wraps `validateWithZod` som kastar M100-strukturerade fel).

**Interna tx-helpers** (för expense-service-integration):
- `_linkReceiptToExpenseTx(db, receiptId, companyId, expenseId)` — sätt
  status='booked' + expense_id. Antar pågående transaktion.
- `_unlinkReceiptFromExpenseTx(db, expenseId)` — återställ till inbox när
  expense raderas. (Anropas inte ännu — expense-service utkast-radering
  bör hooka denna när framtida sprintar säkerställer integriteten.)

### Inkorgen — UI

**[PageInbox.tsx](src/renderer/pages/PageInbox.tsx)** är page-komponent under bokförare-läget. Vardag-pillen
"Kvitton väntar" gör `setMode('bokforare')` + `navigate('/inbox')`. Den
växlar alltid mode eftersom Vardag har ingen sub-routing per
[VardagApp.tsx:23](src/renderer/modes/vardag/VardagApp.tsx).

**Bokförare-flödet "Bokför från inkorgen"**:
1. PageInbox row → setBokforReceipt(r)
2. Renderar `<BokforKostnadSheet prefilledReceipt={...}>` lokalt
3. Sheet:n låser drop-zone, hoppar över attachReceipt, anropar
   linkReceiptToExpense efter finalize → receipt blir booked + expense.receipt_path sätts

**[BokforKostnadSheet.tsx](src/renderer/modes/vardag/BokforKostnadSheet.tsx)** är 678 rader och delas mellan Vardag-läget
(vanligt flöde) och bokförare-läget (Inkorgen-flöde) via en valfri
`prefilledReceipt`-prop. Återanvändning skedde för att undvika
duplikering — risken är att framtida ändringar i sheet:n kan ha bredare
påverkan än uppenbart. Om sheet:n växer mer kan det vara värt att
extrahera en delad `expense-form-core` och bygga två thin shells över.

### Stäng månad — service

[period-checks-service.ts](src/main/services/period-checks-service.ts) har fyra rena query-funktioner som var
och en returnerar `{ status, count, detail }`. Inga sidoeffekter. Heuristik
för 'na'-status:
- bankReconciliation: 'na' om inga statements finns för perioden
- salaryBooked: 'na' om inga rader mot löne-konton (7010/7090/7210/7211/7510/7520).
  Avsiktligt: vi har ingen `companies.has_employees`-flagga så solo-bolag
  utan löne-bokföring får aldrig "warning" här.
- vatReportReady: 'warning' om draft-fakturor eller draft-kostnader finns
  i perioden. Annars 'ok'.
- supplierPayments: 'warning' om unpaid expenses med due_date <= periodens slut. Annars 'ok'.

`allOk = alla checks !== 'warning'`. CloseMonthDialog respekterar detta
för att byta knapp-label/färg.

### VAT-deadline — utility

**[vat-deadline.ts](src/shared/vat-deadline.ts)** är 100% pure (ingen DB, ingen IO). Tar
`{ frequency, asOf, fiscal_year_end? }` och returnerar
`{ periodLabel, dueDate, daysUntil } | null`.

**Algoritmen för monthly/quarterly**: iterativ search bakåt från asOf-månaden
för att hitta period vars deadline är mest imminent utan att ha passerats.
Maxar 24/8 iterationer som safety-rail. Edge cases:
- 15 maj 2025 → mest imminent är mars-perioden (deadline 26 maj)
- 27 juli 2025 → maj-deadline (26 jul) är passerad, returnerar juni-perioden (26 aug)
- Q4 → 12 feb året efter (årsskifte)

**Helger/röda dagar approximeras inte** — formellt SKV-datum returneras.
UI:n visar "förfallit" först efter formell deadline; ingen kompliansrisk
eftersom användaren ser samma datum som SKV förväntar sig.

`vatDeadlineTone(daysUntil)`:
- `'mint'` om ≥14
- `'warning'` om 1..13
- `'danger'` om ≤0

## Test-status + körkommandon

```bash
# Type-check (rent)
npx tsc --noEmit

# ESLint (rent)
npx eslint src/renderer src/main src/shared

# Renderer-tester (1397 gröna)
npx vitest run tests/renderer

# Specifika nya testfiler
npx vitest run tests/sprint-vs106-receipts-table.test.ts
npx vitest run tests/sprint-vs107-receipt-service.test.ts
npx vitest run tests/sprint-vs111-link-receipt.test.ts
npx vitest run tests/sprint-vs113-period-checks.test.ts
npx vitest run tests/sprint-vs115a-vat-frequency.test.ts
npx vitest run tests/sprint-vs115b-vat-deadline.test.ts
npx vitest run tests/renderer/lib/useKeyboardShortcuts.test.tsx
npx vitest run tests/renderer/lib/is-modal-open.test.ts

# Commits ahead of origin/main
git log origin/main..HEAD --oneline | wc -l   # 248
```

**better-sqlite3 ABI**: om vitest klagar med `NODE_MODULE_VERSION`-mismatch
(typiskt efter att Electron-byggen körts), kör `npm rebuild better-sqlite3`.
Native-modulen kompileras för antingen Node.js eller Electron, inte båda
samtidigt (M115 i CLAUDE.md).

## Vad som är kvar att bygga

### Blockerat på produktbeslut

**1. PDF-preview i sheets** (handover-item 4, ~5h)
Sheet:erna visar idag bara filnamn + 📎-emoji. Ingen visuell preview.
**Frågor**: Räcker `<iframe src={path}>` för PDF + `<img>` för bilder, eller behöver
vi PDF.js-rendering? Var ska PreviewPane visas (sidebar i sheet, eller ny
modal)? Acceptabelt med native iframe-rendering trots olika look per OS?

**2. Receipt-visual i KostnadSheet** (handover-item 5, ~3h utöver #1)
Bygger ovanpå #1 — när PDF-preview finns kan kvittot visas inline i sheet:n
istället för bara filename-chip.

**3. Period-label dynamic per kontext** (handover-item 9, ~2h)
Sidebar-headern visar samma period-label överallt. På PageBudget och
PageVat skulle period kunna reflektera vald period.
**Frågor**: Ska Sidebar bero på vilken page som visas, eller ska det finnas
en separat per-page-period-context? Hur hanteras "valda perioder" på sidor
som har egna period-pickers (t.ex. PageReports)?

### Inkorgen — möjliga utbyggnader (utan blockerande beslut)

**1. Receipt-detail-vy med PDF-preview**
Klicka på inbox-rad öppnar en detalj-modal med större preview, notes-
inmatning, och möjlighet att redigera filename. Idag har raden bara
ikon + filnamn + storlek + datum.

**2. `_unlinkReceiptFromExpenseTx` aktiv-koppling**
expense-service `deleteExpenseDraft` rensar inte sin länkade receipt än.
Om en booked-receipt råkar ha sin expense raderad lämnas den i 'booked'-
status med expense_id pekande på borta-rad (FK ON DELETE SET NULL räddar
schema-integriteten men inte status-fältet). Sprint behövs för att hooka
unlink i alla expense-radera-vägar.

**3. Receipt-CSV/SIE-export**
För revisor: exportera lista över alla receipts (inbox + booked + arkiverade)
för en period, inkl. fysiska filer i en zip-bundle (BFL 7 kap-arkivkrav).

**4. OCR-pipeline (om/när produktbeslut ändras)**
Receipts-schema och file-storage är förberett. Tesseract.js eller
cloud-API kan läggas på som best-effort post-upload-steg som pre-fyller
amount/supplier-fält. Hänger inte fast i något befintligt — kan
implementeras isolerat.

### Stäng månad — möjliga utbyggnader

**1. Bokförare-period-vy med inline-checks**
PageBokforare har idag en period-list med Stäng/Öppna-knappar.
CloseMonthDialog kan återanvändas där (samma komponent, annan trigger-yta).
PeriodList kan visa check-status som indikator-prick per period.

**2. `companies.has_employees`-flagga**
För att kunna ge salaryBooked = 'warning' (istället för 'na') för bolag
som har anställda men ännu inte bokfört lön för perioden. Kräver
schema-tillägg + Settings-UI. Blockerar inte nuvarande flöde.

**3. Helger/röda dagar i deadline-beräkning**
SKV bumpar deadline till närmsta vardag. Approximerat idag.
För 100% korrekthet behövs Sveriges helgkalender (skiftande påsk etc.).
Påverkar UX vid kant-fall (deadline på söndag visas som söndag, inte måndag).

### VAT-deadline — möjliga utbyggnader

**1. Settings-UI för vat_frequency**
Användaren kan inte ändra `companies.vat_frequency` från GUI:n än —
default 'quarterly' fastnar. Sprint för Settings-toggle (monthly/quarterly/yearly)
+ uppdatera-mutation i company-service.

**2. Klick på pillen → /vat med pre-vald period**
Pillen är idag dekorativ. Klick kunde navigera till PageVat med den
specifika perioden förvald.

**3. Push-notifiering nära deadline**
Electron stöder native notifications. Vid `daysUntil ≤ 7` vid app-start
kan en system-notification öppnas. Behöver dock per-användare-stäng-knapp
för att inte bli irriterande.

### Tekniska skulder utan produktblockad

**4. Bokförare-mode CloseMonthDialog-integration**
`PeriodList` ([src/renderer/components/period/PeriodList.tsx]) använder
fortsatt direktanrop till `closePeriod` utan checks-modal. Borde dirigeras
genom `<CloseMonthDialog>` så bokförare-läget får samma confirmation-flow
som Vardag.

**5. shadcn-token-migration** (handover-item 8)
Avskriven — `Button.tsx` använder redan design-tokens via Tailwind v4
`@theme`. Förra handovern hade fel diagnos. Inget att göra.

**6. mod+k på Vardag**
VardagApp:s VatDeadlinePill triggar inte VS-105-skyddet eftersom Vardag
inte renderar AppShell:s palette eller GlobalSearch. Men cmd+k inom Vardag
gör inget alls — kan vara värt att rikta cmd+k till GlobalSearch även
i Vardag-läget om sökning är önskat där.

**7. Linka receipt-status till expense-utkast-radering**
Om en draft-expense länkad till en receipt raderas innan finalize blir
receipten kvar som status='booked' (eftersom link sätter status redan
vid sheet-finalize → expense är då redan finalized). Faktiskt edge-case
existerar inte i nuvarande flöde, men bör verifieras i E2E-test om
inkorgen-flow stress-testas.

## Filer att läsa först i nästa session

```
CLAUDE.md                                          # M1..M162 projektprinciper
STATUS.md                                          # sprint-historik (uppdaterad?)
HANDOVER.md                                        # detta dokument
src/shared/types.ts                                # Receipt, ReceiptStatus, ReceiptCounts, VatFrequency
src/shared/vat-deadline.ts                         # pure utility, 12 tester
src/main/services/receipt-service.ts               # CRUD + tx-helpers
src/main/services/period-checks-service.ts         # advisory-checks
src/renderer/pages/PageInbox.tsx                   # inkorgen-UI
src/renderer/components/period/CloseMonthDialog.tsx # checks-modal
src/renderer/modes/vardag/BokforKostnadSheet.tsx   # prefilledReceipt-prop
```

## Kommandoreferens

```bash
# Snabb sanity-check vid sessionsstart
npx tsc --noEmit                                   # ren
npx eslint src/renderer src/main src/shared       # ren
npx vitest run tests/renderer                     # 1397 gröna

# Kör en enskild domän
npx vitest run tests/sprint-vs1               # alla VS-* tester (mönster-match)

# Ny migration: lägg till i src/main/migrations.ts (befintlig user_version=60)
# Ny IPC-kanal: lägg till i src/shared/ipc-schemas.ts (channelMap) +
#               src/shared/ipc-response-schemas.ts (channelResponseMap) +
#               src/main/ipc-handlers.ts (registrera) +
#               src/main/preload.ts (expose) +
#               src/renderer/electron.d.ts (typer)

# Arkitektur-principer som gäller tvärs alla sprintar
# (sammanfattat — fullständig lista i CLAUDE.md)
# - All bokföringslogik i main process, aldrig i renderer
# - All IPC-input valideras med Zod
# - Belopp i ören (INTEGER), aldrig float för pengar
# - Append-only journal_entries; korrigeringar via C-serie
# - Strukturerade fel { code, error, field? } (M100)
# - K2/K3-filtrering vid runtime (regel 13)
# - FY-scoping för transaktionsdata, ej för stamdata (regel 14, M14)
```

## Loop-instruktion (om du vill köra flera sprintar i rad)

```
loop kör nästa del av designen på Fritt Bokföring. Stoppa loopen
(skicka final summary, kalla inte ScheduleWakeup) om någon av
dessa gäller:
  (a) sprinten skulle kräva produktbeslut eller refaktor > 5 timme
  (b) jag har kört 40 sprintar i rad — paus för granskning
```

Inkludera produktbeslut för pågående kluster i prompten så agenten
inte fastnar på (a). De öppna besluten i denna handover är PDF-preview-
strategi (#1), period-label-semantik (#3), och om Settings-UI för
vat_frequency ska prioriteras nu eller senare.
