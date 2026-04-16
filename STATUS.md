# Fritt Bokforing -- Projektstatus

## Sprint 47 -- Feature 5a: SIE4-import parser + validering + dry-run ✅ KLAR

Session S47. SIE4 parser (CP437, alla record-typer), validator (E1-E5, W1-W5), KSUMMA-verifiering, dry-run IPC.

**Testbaslinje:** 2201 → 2234 vitest (+33). 0 skipped. 218 testfiler.
**PRAGMA user_version:** 37 (oförändrat — inga nya migrationer).
**Inga nya M-principer.**
**Nya filer:** sie4-amount-parser.ts, sie4-import-parser.ts, sie4-import-validator.ts,
session-47-sie4-import.test.ts, ipc-sie4-import.test.ts.

### Leverabler

#### 1. sie4-amount-parser.ts
- `sie4AmountToOre` — reverse av oreToSie4Amount, heltalsaritmetik (M131)

#### 2. sie4-import-parser.ts
- `parseSie4(buffer)` — CP437-dekodning via iconv-lite, radbaserad tokenizer
- Hanterar: FLAGGA, PROGRAM, FORMAT, GEN, SIETYP, FTYP, ORGNR, FNAMN, RAR,
  KPTYP, VALUTA, KONTO, KTYP, IB, UB, RES, PSALDO, VER/TRANS, KSUMMA
- Escape-hantering: `\"` i citerade strängar
- Multi-line VER/TRANS-block med { }-avgränsning
- Okända records → warning (defensiv parser)
- KSUMMA: återanvänder `calculateKsumma` från sie4-checksum.ts

#### 3. sie4-import-validator.ts
- `validateSieParseResult` → `SieValidationResult`
- **Blockerande:** E1 (obalanserat), E2 (<2 TRANS), E3 (duplikat-konton), E4 (KSUMMA), E5 (RAR saknas)
- **Varningar:** W1 (IB+rörelser≠UB), W2 (datum utanför RAR), W3 (SIETYP<4), W5 (kronologi)
- Summary: antal konton/verifikat/rader, företagsnamn, orgNr

#### 4. IPC (2 kanaler)
- import:sie4-select-file — OS-filväljare (.se, .si, .sie)
- import:sie4-validate — dry-run (läs + parse + validera, inga DB-skrivningar)

#### 5. Tester (33 nya)
- **session-47-sie4-import.test.ts** (30): amount parser (6), parser (10), validator (7), roundtrip (5), KSUMMA (2)
- **ipc-sie4-import.test.ts** (3): schema-validering

### Stängda items
- **Feature 5a** SIE4-import parser: STÄNGD

### Backlog: 0 öppna findings

## Sprint 46 -- Feature 4: Leverantörsbetalfil (ISO 20022 pain.001) ✅ KLAR

Session S46. Betalningsuppgifter på counterparties, pain.001 XML-generering, batch export tracking.

**Testbaslinje:** 2173 → 2201 vitest (+28). 0 skipped. 216 testfiler.
**PRAGMA user_version:** 37 (migration 036+037).
**Inga nya M-principer.**
**Nya filer:** bankgiro-validation.ts, pain001-export-service.ts, session-46-pain001.test.ts, ipc-pain001.test.ts.

### Leverabler

#### 1. Migration 036+037
- Counterparty: bankgiro, plusgiro, bank_account, bank_clearing
- Payment batches: exported_at, export_format, export_filename

#### 2. bankgiro-validation.ts (shared/)
- `validateBankgiroChecksum` — Luhn modulus 10
- `normalizeBankgiro` — strip bindestreck

#### 3. pain001-export-service.ts
- `validateBatchForExport` — pre-flight (batch status, company bankgiro, supplier payment info)
- `generatePain001` — ISO 20022 pain.001.001.03 XML via xmlbuilder2
- `markBatchExported` — UPDATE payment_batches

#### 4. Counterparty form + service
- CustomerForm: "Betalningsuppgifter"-sektion (bankgiro, plusgiro, bankkonto, clearingnr)
- counterparty-service: INSERT + UPDATE med payment fields

#### 5. BulkPaymentResultDialog
- "Exportera betalfil"-knapp (expense batches only)
- Flöde: validate → generate → showSaveDialog → write → mark exported

#### 6. Tester (28 nya)
- session-46-pain001.test.ts (17): bankgiro validation, XML structure, amounts, migration
- ipc-pain001.test.ts (11): schema validation

### Stängda items
- **Feature 4** Leverantörsbetalfil: STÄNGD

### Backlog: 0 öppna findings

## Sprint 45 -- Feature 3: Periodiseringar (Accruals) ✅ KLAR

Session S45. Periodiseringsscheman med C-serie verifikat, per-period-körning, execute-all.

**Testbaslinje:** 2134 → 2173 vitest (+39). 0 skipped. 214 testfiler.
**PRAGMA user_version:** 35 (migration 035 — accrual_schedules + accrual_entries).
**Inga nya M-principer.**
**Nya filer:** accrual-service.ts, PageAccruals.tsx, session-45-accruals.test.ts,
PageAccruals.test.tsx, ipc-accrual.test.ts.

### Leverabler

#### 1. Migration 035 — accrual_schedules + accrual_entries
- `accrual_schedules`: accrual_type (4 typer), balance/result-konto, period-intervall
- `accrual_entries`: trackar körda perioder med journal_entry_id
- CHECK-constraints: accrual_type IN(...), period_count 2–12, amount_ore > 0

#### 2. accrual-service.ts (5 funktioner)
- `createAccrualSchedule` — validerar kontoklass (1–2 balans, 3–8 resultat), period-overflow
- `getAccrualSchedules` — med periodStatuses, executedCount, remainingOre
- `executeAccrualForPeriod` — C-serie verifikat, D/K per accrual_type, chronology (M142), period-check (M93)
- `executeAllForPeriod` — best-effort, samlar failures
- `deactivateSchedule` — soft-delete

#### 3. D/K-logik per accrual_type
- prepaid_expense: D balans / K resultat
- accrued_expense: D resultat / K balans
- prepaid_income: D resultat / K balans
- accrued_income: D balans / K resultat

#### 4. IPC (5 kanaler) + UI
- accrual:create/list/execute/execute-all/deactivate
- PageAccruals.tsx: schedule-kort med progress-bar, per-period-badges, create-dialog
- Sidebar: CalendarClock, "Periodiseringar" under Hantera

#### 5. Tester (39 nya)
- **session-45-accruals.test.ts** (16): create, validate, execute, D/K, uneven division, execute-all, deactivate, migration
- **PageAccruals.test.tsx** (10): render, badges, progress, execute, create dialog, empty state, a11y
- **ipc-accrual.test.ts** (13): schema-validering (5 kanaler, period overflow, types)

### Stängda items
- **Feature 3** Periodiseringar: STÄNGD

### Backlog: 0 öppna findings

## Sprint 44 -- Feature 2: Budget — budget vs utfall ✅ KLAR

Session S44. Budget-funktion med inmatning + avvikelserapport per resultaträkningsrad × 12 perioder.

**Testbaslinje:** 2091 → 2129 vitest (+38). 0 skipped. 211 testfiler.
**PRAGMA user_version:** 34 (ny migration 034 — budget_targets).
**Inga nya M-principer.**
**Nya filer:** budget-service.ts, PageBudget.tsx, session-44-budget.test.ts,
PageBudget.test.tsx, ipc-budget.test.ts.

### Leverabler

#### 1. Migration 034 — budget_targets
- `budget_targets` tabell: fiscal_year_id × line_id × period_number, amount_ore (tillåter negativa, M137-undantag)
- UNIQUE-constraint, CHECK period_number 1–12

#### 2. budget-service.ts
- `getBudgetLines()` — returnerar 11 BudgetLineMeta från INCOME_STATEMENT_CONFIG
- `getBudgetTargets(db, fyId)` — alla targets för FY
- `saveBudgetTargets(db, fyId, targets[])` — INSERT OR REPLACE i transaktion, validerar line_id
- `getBudgetVsActual(db, fyId)` — **en SQL-query** med period-gruppering + matchesRanges → BudgetVarianceReport
- `copyBudgetFromPreviousFy(db, targetFyId, sourceFyId)` — INSERT OR REPLACE ... SELECT

#### 3. IPC (5 kanaler)
- budget:lines, budget:get, budget:save, budget:variance, budget:copy-from-previous
- Alla med wrapIpcHandler, Zod-scheman, IpcResult

#### 4. PageBudget.tsx
- Tabs: "Budget" (inmatning) + "Avvikelse" (rapport)
- Budget-tab: 11 rader × 12 perioder grid, grupprubriker, helårs-summering
- Knappar: Spara, Kopiera från förra året, Fördela jämnt
- Avvikelse-tab: Budget/Utfall/Avvikelse per period, grön/röd färgkodning
- Print-knapp i avvikelse-tab, horizontal scroll

#### 5. Sidebar + Route
- PiggyBank-ikon, `/budget`, efter Åldersanalys i Rapporter-sektionen

#### 6. Tester (38 nya)
- **session-44-budget.test.ts** (14): service-tester (CRUD, variance, copy, migration)
- **PageBudget.test.tsx** (11): renderer (tabs, grid, inputs, save, copy, print, a11y)
- **ipc-budget.test.ts** (13): schema-validering (5 kanaler, negativa, gränsvärden)

### Stängda items
- **Feature 2** Budget vs utfall: STÄNGD

### Backlog: 0 öppna findings

## Sprint 43 -- Feature 1: PDF-faktura renderer-integration + batch-export ✅ KLAR

Session S43. PDF-knapp i faktura-vy, batch-PDF-export, utökade checkboxes, 28 nya tester.

**Testbaslinje:** 2063 → 2091 vitest (+28). 0 skipped. 208 testfiler.
**PRAGMA user_version:** 33 (oförändrat — inga nya migrationer).
**Inga nya M-principer.**
**Nya filer:** BatchPdfExportDialog.tsx, invoice-pdf-content.test.ts,
InvoicePdf.test.tsx, ipc-pdf-batch.test.ts.

### Leverabler

#### 1. PDF-knapp i faktura-vy (PageIncome view subview)
- Nytt `ViewInvoiceWrapper`-komponent i PageIncome.tsx
- "Ladda ner PDF"-knapp med FileDown-ikon, loading-state under generering
- Filnamn: `Faktura_{nummer}_{kundnamn}.pdf`
- Enbart synlig för finaliserade fakturor (status !== 'draft')

#### 2. Batch-PDF-export
- **Ny IPC-kanal:** `invoice:select-directory` — OS directory picker
- **Ny IPC-kanal:** `invoice:save-pdf-batch` — loop generate+write per faktura,
  returnerar `IpcResult<{ succeeded, failed[] }>`
- **Zod-schemas:** SelectDirectorySchema, SavePdfBatchSchema (ipc-schemas.ts)
- **Preload + electron.d.ts:** selectDirectory, savePdfBatch
- **BatchPdfExportDialog.tsx:** progress-spinner under export, resultat-vy med
  fellistning vid partiell success

#### 3. Utökade checkboxes i InvoiceList
- `isSelectable` ändrad: `item.status !== 'draft'` (var: unpaid/partial/overdue)
- Alla finaliserade fakturor (inkl paid) nu valbara
- "Bulk-betala" visas enbart när alla valda är betalningsbara
- "Exportera PDF:er" visas alltid vid ≥1 vald faktura
- Flöde: selectDirectory → savePdfBatch → resultat-dialog + toast

#### 4. Tester (28 nya)
- **invoice-pdf-content.test.ts** (11): PDF-text-extraktion via zlib inflate av
  FlateDecode-streams + TJ hex-parsing. Verifierar fakturanummer, kundnamn,
  radbeskrivigar, företagsinfo, orgNr, postnummer, FAKTURA-rubrik, multi-line,
  format, momssatser, draft-blockering.
- **InvoicePdf.test.tsx** (8): PDF-ikon synlig/dold, klick triggar generate→save,
  stopPropagation, checkbox för paid, "Exportera PDF:er" vid selektion,
  Bulk-betala villkorlig, axe a11y.
- **ipc-pdf-batch.test.ts** (9): SelectDirectorySchema + SavePdfBatchSchema
  valid/invalid cases.

### Stängda items
- **Feature 1** PDF-faktura renderer-integration + batch-export: STÄNGD

### Backlog: 0 öppna findings

## Sprint 42 -- Åldersanalys + S39–S41 (wrapIpcHandler + renderer-tester) ✅ KLAR

Session S39–S42. F62 (wrapIpcHandler-migration), T6 (YearPicker/PeriodList/Sidebar), F59
(per-kanal response-schema), T7 (GlobalSearch/EntityListPage), Åldersanalys (aging report).

**Testbaslinje:** 1981 → 2063 vitest (+82). 0 skipped. 205 testfiler.
**PRAGMA user_version:** 33 (oförändrat — inga nya migrationer).
**Inga nya M-principer.**
**Nya filer:** aging-service.ts, PageAgingReport.tsx, channel-response-schemas.ts,
YearPicker.test.tsx, PeriodList.test.tsx, Sidebar.test.tsx, GlobalSearch.test.tsx,
EntityListPage.test.tsx, PageAgingReport.test.tsx, session-42-aging.test.ts,
channel-response-schemas.test.ts.

### Del A: S39 — F62 wrapIpcHandler-migration (31 handlers)
Migrerade 31 handlers från manuell safeParse + IpcResult-konstruktion till wrapIpcHandler:
- **Grupp A** (27): fiscal-period:close/reopen, counterparty:deactivate,
  product:deactivate/set-customer-price/remove-customer-price,
  expense:delete-draft/finalize/pay/payBulk/get,
  account:create/update/toggle-active/get-statement,
  invoice:delete-draft/finalize/pay/payBulk/update-sent,
  manual-entry:save-draft/get/update-draft/delete-draft/finalize,
  journal-entry:correct/can-correct, search:global
- **Grupp B** (1): account:get-statement (raw return → auto-wrap)
- **Grupp C** (3): opening-balance:net-result, fiscal-year:switch,
  fiscal-year:create-new (multi-service/settings I/O → throw structured)
- **result:net** borttagen ur NO_SCHEMA_CHANNELS (dead mapped channel)
- wrapIpcHandler count: 35 → 67

### Del B: S40 — T6 renderer-tester + F59 (28 tester)
- **YearPicker** (10): formatFiscalYearLabel (standard + brutet FY), options rendering,
  amber styling (closed FY), lock text, open FY no amber, stängt suffix, null/tom,
  create option, axe a11y
- **PeriodList** (11): 12 månader, Klar/Öppen badges, close-knapp firstOpenIndex,
  reopen-knapp lastClosedIndex, confirm dialog open/cancel, all-closed banner,
  tom lista, isReadOnly döljer knappar, axe a11y
- **Sidebar** (7): företagsnamn+K2/K3, nav-sektioner, 14 nav-links testIds,
  YearPicker child, GlobalSearch child, axe a11y
- **F59** channel-response-schemas (7): correct data passes, incorrect data throws,
  no-schema fallback, NO_SCHEMA_CHANNELS exempt, skipDataValidation opt-out,
  error response bypass, opening-balance:net-result validation
- renderWithProviders utökad med `is_closed` option

### Del C: S41 — T7 renderer-tester (20 tester)
- **GlobalSearch** (10): placeholder, <2 chars no dropdown, debounce + results,
  grouped headers, Escape closes, empty results, ArrowDown navigation,
  ARIA combobox/searchbox roles, axe a11y
- **EntityListPage** (10): sub-view list/create/edit/view, isReadOnly hides create,
  master-detail list+empty/detail/create, axe a11y (båda varianter)
- Renderer-komponenttestcoverage: 52/52 (100%)

### Del D: S42 — Åldersanalys (27 tester)
- **aging-service.ts**: `getAgingReceivables` + `getAgingPayables`
  - Bucketisering: Ej förfallet, 1–30, 31–60, 61–90, 90+ dagar
  - Kreditfakturor exkluderade (invoice_type != 'credit_note')
  - Expenses utan due_date → separat itemsWithoutDueDate-grupp
  - paid_amount_ore läst direkt (M19/M101), ej via JOIN
  - as_of_date parameter för historisk vy (default: todayLocal())
- **IPC**: aging:receivables, aging:payables med AgingInputSchema
  - wrapIpcHandler, channelMap-registrerade
- **PageAgingReport.tsx**: tabs (Kundfordringar/Leverantörsskulder),
  bucket-tabeller, totalsummering, print-knapp, as_of_date-disclaimer
- **Sidebar**: Åldersanalys-länk under Rapporter (Clock-ikon)
- **Service-tester** (15): bucketisering (4 tidszoner), partiell betalning,
  betalda exkluderade, kreditnotor exkluderade, as_of_date, summering,
  gränsvärden 30/31, expense-paritet, null due_date
- **IPC-kontrakttester** (5): channelMap, schema validering
- **Renderer-tester** (7): titel, buckets, total, tab-byte, tom, disclaimer, axe

### Stängda items
- **F62** wrapIpcHandler-migration: STÄNGD (31 handlers, 67 totalt)
- **F59** per-kanal response-schema: STÄNGD (channel-response-schemas.ts)
- **T6** YearPicker/PeriodList/Sidebar: STÄNGD (28 tester)
- **T7** GlobalSearch/EntityListPage: STÄNGD (20 tester, 100% coverage)
- **Åldersanalys** feature: STÄNGD

### Backlog: 0 öppna findings
Ingen ny finding. Åldersanalysens as_of_date-begränsning (retroaktivt betalda
exkluderas) dokumenterad i UI-disclaimer.

## Sprint 38 -- F60b useDirectQuery-migration + F61 BFL-validering + T5 renderer-tester ✅ KLAR

Session S38. F60b (7 useDirectQuery-kanaler → IpcResult), F61 (BFL-startmånad-validering),
T5 (5 renderer-komponenttester).

**Testbaslinje:** 1952 → 1981 vitest (+29). 0 skipped. 197 testfiler.
**PRAGMA user_version:** 33 (oförändrat — inga nya migrationer).
**Inga nya M-principer.** M144 uppdaterad (alla useDirectQuery-kanaler migrerade).

### Del A: F60b — useDirectQuery → IpcResult (7 kanaler)
Migrerade 7 kanaler från useDirectQuery (raw return) till IpcResult via wrapIpcHandler:
- **counterparty:get** — handler + electron.d.ts + hook + CustomerDetail test fixture
- **product:get** — handler + electron.d.ts + hook + ProductDetail test fixture
- **fiscal-period:list** — handler + electron.d.ts + hook
- **invoice:list-drafts** — handler + electron.d.ts + hook
- **invoice:get-draft** — handler + electron.d.ts + hook
- **company:get** — handler (wrapIpcHandler(null)) + electron.d.ts + hook + 3 test fixtures
- **fiscal-year:list** — handler (wrapIpcHandler(null)) + electron.d.ts + hook + renderWithProviders + FiscalYearContext test

channelMap utökad med `company:get: z.void()` och `fiscal-year:list: z.void()`.
NO_SCHEMA_CHANNELS reducerad från 9 → 7 (kvarvarande: db:health-check,
opening-balance:re-transfer, backup:create, backup:restore-dialog, settings:get,
settings:set, result:net).
`useDirectQuery` borttagen från hooks.ts import (ej längre använd).

### Del B: F61 — BFL-startmånad-validering
- **Shared konstant** (`BFL_ALLOWED_START_MONTHS`, `ERR_MSG_INVALID_FY_START_MONTH`) i constants.ts
- **IPC-schema**: `.refine()` på CreateCompanyInputSchema — rejectar otillåtna startmånader
- **UI-filtrering**: StepFiscalYear dropdown filtrerad till BFL-tillåtna månader vid brutet FY
- **7 tester** i session-38-bfl-start-month.test.ts (reject mars/juni, accept jul/jan/sep,
  full coverage alla 7 förbjudna månader, BFL_ALLOWED_START_MONTHS invariant)

### Del C: T5 — Renderer-tester (5 komponenter, 22 tester)
- **EmptyState** (4): titel+description, action-knapp render, action-knapp dold utan prop, axe a11y
- **ContactList** (6): namn-rendering, typ-badges (Kund/Leverantör/Båda), klick→onSelect,
  tom lista kunder, tom lista leverantörer, axe a11y
- **DraftList** (4): datum/kund/belopp/status-badge, klick→onSelect, tom lista, axe a11y
- **ExpenseDraftList** (4): datum/leverantör/beskrivning/belopp, klick→onSelect, tom lista, axe a11y
- **MonthIndicator** (4): 12 element renderas, stängd period grön styling, legend-text, axe a11y

### Stängda items
- **F60b** del 1: STÄNGD (7 kanaler migrerade, alla useDirectQuery borta)
- **F61** BFL-startmånad: STÄNGD (IPC-schema + UI-filtrering)
- **T5** Renderer-tester: STÄNGD (EmptyState, ContactList, DraftList, ExpenseDraftList, MonthIndicator)

### Backlog: 2 öppna findings
- **F59** (per-kanal response-schema) öppen för Sprint 39+
- **F62** 12 manuella IpcResult-konstruktioner kvar i handlers (Sprint 39 med F62 del 2)

## Sprint 37 -- Renderer-tester (T4): Wizard + Dialogs + Customer ✅ KLAR

Session S37. T4 (renderer-komponenttester: wizard-steg, dialogs, customer-komponenter).
Ren test-sprint — inga produktionskodsändringar. Nya findings F61, F62 dokumenterade.

**Testbaslinje:** 1905 → 1952 vitest (+47). 0 skipped. 191 testfiler.
**PRAGMA user_version:** 33 (oförändrat).
**Inga nya M-principer.**
**Nya filer:** StepCompany.test.tsx, StepFiscalYear.test.tsx, StepConfirm.test.tsx,
BulkPaymentResultDialog.test.tsx, PayExpenseDialog.test.tsx,
CustomerForm.test.tsx, CustomerDetail.test.tsx.

### Del A: Wizard-komponenter (25 tester)
- **StepCompany** (8): render all fields, org.nr onChange callback, K2 default,
  next-disabled empty data, next-enabled valid data, share_capital < 25000 rejected,
  future registration_date rejected (vi.setSystemTime), axe a11y
- **StepFiscalYear** (11): 6 computeFiscalYear enhetstester (standard, brutet FY
  start_month=7/5/1, skottår 2024→2025-02-28, skottår 2023→2024-02-29) +
  5 renderingstester (preview, checkbox toggle, month picker, <12mån-varning, axe)
- **StepConfirm** (6): summary render, fiscal year formatted dates,
  isPending disabled submit+back, error message, axe a11y.
  Inkl formatSwedishDate enhetstester.

### Del B: Dialog-komponenter (10 tester)
- **BulkPaymentResultDialog** (7): succeeded count, failed list, all-success
  (failed gömd), cancelled status, bank_fee journal entry, open=false, axe a11y
- **PayExpenseDialog** (3): expense info + remaining, pre-filled amount, axe a11y

### Del C: Customer-komponenter (12 tester — 2 nya testfiler)
- **CustomerForm** (6): render all fields, submit calls onSaved,
  empty name validation, edit-mode pre-fill, VAT suggestion
  (SE+orgNr+01 for Sverige), axe a11y
- **CustomerDetail** (4): render name/type/org.nr, dash for null fields (4+ "—"),
  deactivate confirm → mutation.mutate({ id }) anropas, axe a11y.
  Mockas via window.api double-cast (useDirectQuery raw return).

### Del D: Nya findings
- **F61** BFL 3 kap 1§: StepFiscalYear accepterar alla 12 startmånader för
  brutet räkenskapsår. BFL begränsar till 1 maj, 1 jul, 1 sep, 1 nov, 1 jan.
  Ingen validering i vare sig renderer eller backend (CreateCompanyInputSchema).
  Låg impact — brutet FY ovanligt för målgruppen (småföretag).
- **F62** 19 IPC-handlers konstruerar IpcResult manuellt istället för
  wrapIpcHandler. Risk: format-divergens vid framtida IpcResult-ändringar.
  Sprint 38+ kandidat tillsammans med F60b.

### Observationer
- vi.setSystemTime krävs i StepCompany/StepFiscalYear för deterministisk
  todayLocal()-validering (registration_date <= today, monthsSinceReg < 12)
- Controlled components (StepCompany org.nr) kräver per-keystroke-test
  snarare än full-string-test — controlled input uppdateras inte utan re-render
- counterparty:get använder useDirectQuery (raw return) — same pattern
  som product:get i Sprint 36, mockas via double-cast
- Renderer-komponenttestcoverage: 42/52 (81%, upp från 67%)
- 10 kvarvarande otestade: GlobalSearch, EntityListPage, Sidebar, YearPicker,
  PeriodList, MonthIndicator, ContactList, EmptyState, DraftList, ExpenseDraftList

### Stängda items
- **T4** Renderer-komponenttester: STÄNGD (wizard, dialogs, customer)

### Backlog: 2 öppna findings
- **F59** (per-kanal response-schema) öppen för Sprint 39+
- **F61** BFL-startmånad-validering saknas i brutet räkenskapsår
- **F62** 19 manuella IpcResult-konstruktioner i handlers

## Sprint 36 -- Renderer-tester (T3) + Formaterings-utilities ✅ KLAR

Session S36. T3 (renderer-komponenttester: dialogs, products, reports, dashboard),
E1 (formaterings-utility-tester). Ren test-sprint — inga produktionskodsändringar.

**Testbaslinje:** 1858 → 1905 vitest (+47). 0 skipped. 184 testfiler.
**PRAGMA user_version:** 33 (oförändrat).
**Inga nya M-principer.**
**Nya filer:** ConfirmDialog.test.tsx, ConfirmFinalizeDialog.test.tsx,
ProductForm.test.tsx, ProductDetail.test.tsx, MetricCard.test.tsx,
BalanceSheetView.test.tsx, IncomeStatementView.test.tsx.

### Del A: UI-dialogkomponenter (11 tester)
- **ConfirmDialog** (8): render, open=false unmount, variant=danger red button,
  onConfirm callback, cancel callback, Escape key, focus-trap entry point, axe a11y
- **ConfirmFinalizeDialog** (3): render + permanent warning text, isLoading disabled
  state, axe a11y

### Del B: Produktkomponenter (9 tester)
- **ProductForm** (6): renders all fields, submit with valid data, empty name
  validation, edit-mode pre-fill, article type change → unit update, axe a11y
- **ProductDetail** (3): renders name/price/unit, deactivation confirm step, axe a11y

### Del C: Dashboard-komponent (5 tester)
- **MetricCard** (5): label + value, variant=positive green text,
  variant=negative red text, isLoading skeleton, sublabel rendering

### Del D: Rapportvyer (9 tester)
- **BalanceSheetView** (6): main headings, SUMMA totals, årets resultat row,
  balance difference warning (show + hide), axe a11y
- **IncomeStatementView** (3): group labels, result totals
  (rörelseresultat/finansiella/årets resultat), axe a11y

### Del E: Formaterings-utilities (13 tester)
- **format.test.ts** utökad: kronorToOre (2), formatReportAmount (7 inkl
  parameteriserade edge cases, negativa, stora belopp), formatKr (2),
  unitLabel (2). Totalt 13 nya + 10 befintliga = 23 tester i filen.

### Observationer
- `product:get` använder `useDirectQuery` (raw return, inte IpcResult-wrapped).
  Mock-IPC kräver bypass via `window.api.getProduct.mockResolvedValue()`.
  F60 migrerade inte denna kanal — kvarstår som useDirectQuery.
- Report-vyernas axe-tester disablar `heading-order` — komponenterna renderar
  h2→h4 (h3 finns i parent page-context, inte i isolerad rendering).
- `formatReportAmount` använder U+2212 (minus sign) och Intl.NumberFormat
  sv-SE med non-breaking space (U+00A0/U+202F). Tester normaliserar whitespace.

### Stängda items
- **T3** Renderer-komponenttester: STÄNGD (dialogs, products, reports, dashboard)
- **E1** Formaterings-utility-tester: STÄNGD

### Backlog: 0 öppna findings
- F59 (per-kanal response-schema) öppen för Sprint 37+

## Sprint 35 -- IpcResult-standardisering + Kreditnota-hardering + Renderer-tester ✅ KLAR

Session S35. F60 (IpcResult-standardisering), C1 (kreditnota-testhardering),
T2 (renderer-komponenttester InvoiceList/ExpenseList/ProductList).

**Testbaslinje:** 1827 → 1858 vitest (+31). 0 skipped. 177 testfiler.
**PRAGMA user_version:** 33 (oförändrat).
**Ny M-princip:** M144 (IpcResult-mandat för affärsdata-kanaler).
**Nya filer:** session-35-credit-note-defense.test.ts, InvoiceList.test.tsx, ExpenseList.test.tsx, ProductList.test.tsx.

### Del A: F60 — IpcResult-standardisering
11 IPC-kanaler migrerade från raw data till `IpcResult<T>` wrapper:
- **7 lågrisk** (list-queries): account:list, account:list-all, counterparty:list,
  product:list, vat-code:list, manual-entry:list, manual-entry:list-drafts
- **3 medelrisk** (special returns): invoice:next-number, product:get-price-for-customer,
  expense:get-draft
- **1 bonus**: expense:list-drafts (hade inkonsekvent IpcResult)

Per-kanal-migration: handler → wrapIpcHandler, hook → useIpcQuery, electron.d.ts → IpcResult<T>.
35+ testfixtures uppdaterade med `{ success: true, data: ... }` wrapper.
NO_SCHEMA_CHANNELS reducerad till 7 infrastruktur-kanaler (health-check, company:get,
fiscal-year:list, settings, backup, opening-balance:re-transfer, result:net).

### Del B: C1 — Kreditnota-testhardering
12 nya tester i session-35-credit-note-defense.test.ts:
- Sign-flip (M137): per-konto D/K-inversion verifierad, inga negativa belopp
- 4-lager-defense (M138): dubbel-kreditering blockerad, typ-guard, credits_id populerad, has_credit_note-flagga
- Cross-reference (M139): JE description innehåller originalfakturanummer och motpartsnamn
- Expense-paritet: samma tester för leverantörs-kreditnotor

### Del C: T2 — Renderer-komponenttester
19 nya renderer-tester:
- InvoiceList (7): rendering, filter-tabs, empty state, navigation, credit note badge, axe
- ExpenseList (7): rendering, supplier invoice number, filter-tabs, empty state, navigation, axe
- ProductList (5): rendering, click, empty state, price display, axe

### Stängda findings
- **F60** IpcResult-standardisering: STÄNGD (11 kanaler migrerade, NO_SCHEMA_CHANNELS rensat)
- **C1** Kreditnota-testhardering: STÄNGD (M137/M138/M139 verifierade)
- **T2** Renderer-tester: STÄNGD (InvoiceList, ExpenseList, ProductList)

### Backlog: 0 öppna findings
- F59 (per-kanal response-schema) öppen för Sprint 36+

## Sprint 34 -- Cross-FY + Kronologi + FTS5-utvidgning + Renderer-tester ✅ KLAR

Session S34. B7 (cross-FY betalning), B8 (kronologisk datumordning),
B9 (FTS5 faktura/kostnad-utvidgning), T1 (renderer-komponenttester).

**Testbaslinje:** 1776 → 1827 vitest (+51). 0 skipped (2→0). 173 testfiler.
**PRAGMA user_version:** 33 (oförändrat — inga nya migrationer).
**Nya filer:** chronology-guard.ts, session-34-cross-fy.test.ts, session-34-chronology.test.ts, session-34-fts5-ext.test.ts.
**Nya M-principer:** M142 (kronologisk datumordning), M143 (FTS5 rebuild try-catch). M141 (cross-table trigger-inventering) redan dokumenterad från S33.

### Del A: B7 — Cross-FY betalning
- S01-05 unskipped: invoice-betalning i annat räkenskapsår fungerar
- S01-05b: expense cross-FY betalning med paritetstester
- Payment JE hamnar i FY baserat på payment_date (inte invoice/expense FY)
- Verifikationsnummer startar om i nya FY:t
- O-serie i FY2027 inkluderar korrekt 1510/2440-saldo
- **5 nya tester** i session-34-cross-fy.test.ts

### Del B: B8 — Kronologisk datumordning
**chronology-guard.ts** — delad helper:
- `checkChronology(db, fyId, series, date)` — kastar VALIDATION_ERROR om datum < senaste bokförda i serien
- Must be called within transaction (db.inTransaction guard)
- Same-day tillåtet (strict less-than)

**Integrerad i 5 callsites:**
- `finalizeDraft` (A-serie), `finalizeExpense` (B-serie), `finalizeManualEntry` (C-serie)
- `_payInvoiceTx` (A-serie, med `skipChronologyCheck` för bulk)
- `_payExpenseTx` (B-serie, migrerad från inline till delad helper)

**payInvoicesBulk** — batch-level kronologi-check (paritet med payExpensesBulk):
- Validerar en gång före loop, per-rad skippar check

- S01-06 unskipped: kronologisk ordning enforced i A-serien
- **12 nya tester** i session-34-chronology.test.ts + befintliga S13/S13b anpassade

### Del C: B9 — FTS5 faktura/kostnad-utvidgning
**rebuildSearchIndex** — utvidgad med FY-kolumn + invoice/expense:
- DROP + CREATE med `fiscal_year_id` som ny kolumn
- Invoices: `invoice_number || ' ' || cp.name`, non-draft only
- Expenses: `supplier_invoice_number || ' ' || description || ' ' || cp.name`, non-draft only
- Globala entiteter: `fiscal_year_id = '0'`

**ftsSearch** — FY-filter:
- `entity_type:invoice AND fiscal_year_id:X AND "query"*`
- Eliminerar FY-leakage-risken (F6)

**globalSearch** — FTS5-first → LIKE fallback för invoices/expenses:
- FTS5 matchar cp.name (denormaliserat), LIKE täcker invoice_number/supplier_invoice_number
- Combined query: FTS5-ids OR invoice_number LIKE

**Nya rebuild-callsites:** finalizeDraft, payInvoice, finalizeExpense, payExpense (try-catch)

- **10 nya tester** i session-34-fts5-ext.test.ts

### Del D: T1 — Renderer-komponenttester
- ManualEntryList: 10 tester (drafts, finalized, badges, empty state, axe)
- PaymentDialog: 6 tester (render, close, remaining, loading, validation, axe)
- BulkPaymentDialog: 6 tester (rows, close, empty, cancel, loading, account default, axe)
- Axe race condition: M133-exempt `axeCheck: false` med dedicated axe test per file

### Stängda findings
- **B7** Cross-FY betalning: STÄNGD (redan implementerad, test-coverage saknades)
- **B8** Kronologisk datumordning: STÄNGD (ny chronology-guard + 5 callsites)
- **B9** FTS5 invoice/expense: STÄNGD (FY-scopad FTS5, LIKE fallback)
- **T1** Renderer-tester: STÄNGD (22 nya component-tester)

### Backlog: 0 öppna findings
- F59 (per-kanal response-schema) öppen för Sprint 35+
- F60 (raw-data-kanaler) öppen för Sprint 35+

## Sprint 33 -- FTS5 + Quantity-CHECK + Tech-debt-sweep ✅ KLAR

Session S33. B6 (FTS5 indexed search), F46b (quantity-CHECK defense-in-depth),
F57 (mock-IPC response-shape validation), TD-sweep (F49-b won't-fix, M119 rename, E03 testIds).

**Testbaslinje:** 1743 → 1776 vitest (+33). 167 testfiler.
**PRAGMA user_version:** 31 → 33 (migration 032: quantity-CHECK, migration 033: FTS5).
**Nya filer:** escape-fts.ts, session-33-fts5.test.ts, session-33-quantity-check.test.ts, session-33-mock-ipc-shape.test.ts.

### Del A: B6 — FTS5 indexed search

**Migration 033** — FTS5 virtual table:
- `search_index` med `tokenize='unicode61 remove_diacritics 2'`
- Accent-stripping: "ostgota" matchar "Östgöta", "ake" matchar "Åke"
- Non-contentless (content stored) — entity_id retrievable after MATCH

**search-service.ts** — FTS5-first with LIKE fallback:
- Counterparties, products, accounts: FTS5 MATCH → join back to source table
- Invoices, expenses: LIKE only (FY-scoped, not in FTS5 index)
- Journal entries: LIKE only (verRef-parsing "C1" → exact match required)
- Fallback: if search_index missing or corrupt, falls back to LIKE silently

**rebuildSearchIndex** — full rebuild after every write:
- Called at startup (db.ts) and after create/update in 4 services
- Wrapped in try-catch — failure doesn't crash the app
- ~50ms for 5k rows

**escape-fts.ts** — FTS5 special character escaping (double-quote doubling).

**14 nya tester** (migration, rebuild, accent-stripping, case-insensitive, prefix, fallback, incremental, escape, F8 regression).

### Del B: F46b — Quantity-CHECK defense-in-depth

**Migration 032** — table-recreate for invoice_lines and expense_lines:
- `invoice_lines`: `CHECK (quantity > 0 AND quantity <= 9999.99)` (M130: REAL)
- `expense_lines`: `CHECK (quantity >= 1 AND quantity <= 9999)` (M130: INTEGER)
- Pre-flight validation: fails early if existing rows violate new CHECK
- M121 compliance: index + trigger (cross-table) recreated after DROP
- No PRAGMA foreign_keys OFF needed — both are leaf tables

**12 nya tester** (direct SQL bypass CHECKs, boundary values, migration smoke, index/trigger preservation).

### Del C: F57 — Mock-IPC response-shape validation

**mock-ipc.ts** — IpcResult shape validation:
- `mockIpcResponse` validates response against `IpcResultSchema` (Zod discriminated union)
- `.strict()` rejects extra fields
- NO_SCHEMA_CHANNELS exempt (channels returning raw data without IpcResult wrapper)
- Known limitation (F59): validates outer IpcResult shape only, not `data` inner type

**7 nya tester** (shape-brott, strict-mode, correct responses, exempt channels).

### Del D: Tech-debt-sweep

**D0: F49-b stängd som won't fix.**
Grep-baserad M133-check är tillräcklig. AST-baserad statisk analys för a11y-mönster
är inte motiverad — hellre runtime axe-checks (befintliga) än AST.

**D1: ManualEntryListItem.total_amount → total_amount_ore (M119).**
Rename across 7 files: types.ts, manual-entry-service.ts, ManualEntryList.tsx,
PageManualEntries.tsx, 2 test files. Inga migrationer (query alias, inte DB-kolumn).

**D2: E03 — SupplierPicker + CustomerPicker testId.**
Both components now accept `testId?: string` prop, applied to input element.
Follows ArticlePicker pattern.

### Stängda findings
- **B6** FTS5 indexed search: STÄNGD
- **F46b** quantity-CHECK defense-in-depth: STÄNGD
- **F57** mock-IPC shape validation: STÄNGD (F59 öppen för per-kanal response-schema)
- **F49-b** AST-baserad M133: STÄNGD (won't fix)
- **M119** ManualEntryListItem rename: STÄNGD
- **E03** SupplierPicker/CustomerPicker testId: STÄNGD

### Backlog: 0 öppna findings
F59 (per-kanal response-schema-validering) öppen som Sprint 34+ kandidat.

## Sprint 32 -- Unicode-sokning + Verifikat-sokning + Perf-baseline ✅ KLAR

Session S32. F58 (Unicode-medveten sokning), B5 (verifikat-sokning i GlobalSearch),
F13 (perf-baseline).

**Testbaslinje:** 1714 → 1743 vitest (+29). 164 testfiler.
**PRAGMA user_version:** 31 (oforandrat — ingen ny migration).
**Nya filer:** db-functions.ts, session-32-unicode-search.test.ts, session-32-verifikat-search.test.ts, session-32-search-perf.test.ts.

### Del A: F58 — Unicode-medveten sokning

**db-functions.ts** — ny delad helper:
- `registerCustomFunctions(db)` registrerar `lower_unicode` som custom SQLite-funktion
- Anvander JS `toLowerCase()` (locale-oberoende, deterministisk)
- `{ deterministic: true }` for framtida index-anvandning
- Registreras i db.ts (produktion) och create-test-db.ts (test)

**search-service.ts** — alla 12 `LOWER()` ersatta med `lower_unicode()`:
- Cross-case-sokning pa aao fungerar nu ("åke" → "Åke Andersson")
- Kand begransning: eszett-folding ej stödd (FTS5-scope)

**Status-filter hardening (D4):**
- Fakturor: `status != 'draft'` → `status IN ('unpaid','paid','partial','overdue','credited')`
- Kostnader: `status != 'draft'` → `status IN ('unpaid','paid','partial','overdue')`

**8 nya tester** (parameteriserade function-tests + cross-case + F8-regression).

### Del B: B5 — Verifikat-sokning

**search-service.ts** — ny query-block for manuella verifikat:
- LEFT JOIN `manual_entries` + `manual_entries orig_me` for bidirectional routing
- Verifikat-ref-parsning: `C3` → exakt-match (serie='C', nummer=3), ej prefix C30/C31
- `status IN ('booked', 'corrected')`, `source_type = 'manual'`
- Korrigerade verifikat: title far suffix "(korrigerad)"
- Korrigeringsverifikat: subtitle far "korrigering", routes till originalets vy med `?highlight=Cn`
- Bidirectional findability: bade original och korrigering sokbara

**search-types.ts** — `'journal_entry'` tillagd i `SearchResultType`.

**GlobalSearch.tsx** — ny typ-label "Verifikat", sist i TYPE_ORDER.

**14 nya tester** (description-match, ref-match, prefix-guard, FY-scoping, draft-exclude, routing, correction-status, correction-routing-highlight, correction-searchable-by-own-ref, M140-invariant).

### Del C: F13 — Perf-baseline

**session-32-search-perf.test.ts:**
- 1000 counterparties + search: median av 7 korningar < 200ms (lokal) / 500ms (CI)
- 1000 manuella verifikat + description-sok + ref-sok: samma gate
- Loggar median i testoutput for trend-tracking

**2 nya perf-tester.**

### Stangda findings
- **F58** aao-diakritik i sokning: STANGD (lower_unicode custom function)
- **F13** perf-baseline: STANGD (etablerad med 2 gate-tester)

### Close-out review fix
Korrigeringsverifikat gjordes sokbara (Option A): LEFT JOIN + route till originalets vy med `?highlight=Cn`.
Bidirectional findability: "C12" hittar korrigeringen, "Hyra" visar bade original och korrigering.
+2 tester (correction routing, correction searchable by own ref).

### Backlog: 0 oppna findings

## Sprint 31 -- Global sokning + Kontoutdrag-polish ✅ KLAR

Session S31. B2-polish (URL-sync, subtractMonths, print) + B3 (global sokning).

**Testbaslinje:** 1657 → 1714 vitest (+57). 161 testfiler.
**PRAGMA user_version:** 31 (oforandrat — ingen ny migration).
**Nya filer:** search-service.ts, search-types.ts, GlobalSearch.tsx, date-utils.test.ts, router-params.test.ts.

### Del A: B2-polish — URL-sync + subtractMonths + print

**A1: Router URL-params**
- `getHashPath()` strippar query params fore route-matching
- Nya exports: `getHashParams()`, `setHashParams()` (replaceState — ingen history-pollution)
- 7 router-param tester

**A2: PageAccountStatement URL-sync**
- Filter-state (konto, from, to) synkas till URL: `#/account-statement?account=1510&from=2026-01-01&to=2026-04-15`
- Aterstarks fran URL vid mount (forutsattning for B3 konto-routing)

**A3: subtractMonths**
- `subtractMonths(dateStr, months)` i `src/shared/date-utils.ts`
- Dag-clamp for Feb/30-dags-manader, cross-year, skottar
- `defaultDateFrom()` refaktorerad till enrad via subtractMonths
- 19 tester (10 subtractMonths + 9 defaultDateFrom)

**A4: Print-mode**
- Print-knapp i PageHeader (samma monster som PageReports)
- `print:hidden` pa filter-sektion, `print:block` pa konto/period-header
- 3 renderer-tester

### Del B: B3 — Global sokning

**search-service.ts** — 6 sokeniteter:
| Entitet | Sok-falt | WHERE-filter | Route |
|---------|----------|--------------|-------|
| Fakturor | invoice_number, cp.name | FY-scopad, status != draft | `/income/view/{id}` |
| Kostnader | supplier_invoice_number, description, cp.name | FY-scopad, status != draft | `/expenses/view/{id}` |
| Kunder | name, org_number | type IN (customer, both), is_active | `/customers/{id}` |
| Leverantorer | name, org_number | type IN (supplier, both), is_active | `/suppliers/{id}` |
| Artiklar | name | is_active | `/products/{id}` |
| Konton | account_number, name | is_active | `/account-statement?account={nr}` |

- D1 counterparty-diskriminering: type=both visas i bada grupper
- D2 aao case: SQLite stock LOWER() ar ASCII-only — LOWER('Å')='Å'. Same-case aao fungerar, cross-case gor det inte. F58 oppen.
- D4 verifikat-sokning: skippat i v1 (95% av use-cases tackta)
- LIKE-escape via `escapeLikePattern()` (M8/F8)
- 20 service-tester + 4 IPC contract-tester

**GlobalSearch.tsx** — ARIA combobox:
- Placerad i Sidebar under header
- Ctrl+K / Cmd+K global kortvar
- Debounce 300ms, min 2 tecken
- Grupperad dropdown med typ-rubriker, max 5/grupp, max 20 totalt
- ArrowUp/Down/Enter/Escape tangentnavigering
- 7 renderer-tester inkl axe-check

**IPC:** `search:global` kanal, Zod-schema (min(2), max(200), strict), M128 direkt delegation.

### Tech debt update
- **PageAccountStatement URL-sync** (punkt 5 i tech debt): STANGD i denna sprint.
- Ovriga tech debt-items oforandrade.

### Backlog: 1 oppen finding
- **F58** aao-diakritik i sokning: SQLite stock LOWER() ar ASCII-only. Cross-case-sokning pa aao fungerar inte. Fix-alternativ: (1) `db.function('lower_unicode', s => s.toLowerCase())` — billigast, (2) FTS5 med unicode61-tokenizer — bast langterm. Sprint 32 kandidat.

Alla Sprint 29-planerade B-features levererade (B1, B2, B3, B4).

## Sprint 30 -- Kontoutdrag-UI + Korrigeringsverifikat ✅ KLAR

Session S30. B2 UI (kontoutdrag-sida) + B4 (korrigeringsverifikat).

**Testbaslinje:** 1604 → 1657 vitest (+53). 156 testfiler.
**PRAGMA user_version:** 30 → 31 (migration 031: 4 immutability-triggers).
**Nya filer:** PageAccountStatement.tsx, correction-service.ts.
**Nya M-principer:** M138 (4-lager-skydd) och M139 (korsreferens i description) tillämpade.

### Del A: B2 UI — Kontoutdrag
- Service utvidgad med `summary`-objekt (opening_balance, total_debit, total_credit, closing_balance, transaction_count)
- Ny sida PageAccountStatement med konto-dropdown (grupperad per klass), datumfilter, (D)/(K)-suffix
- Route `/account-statement`, sidebar-länk under Rapporter
- Hook `useAccountStatement` + query key
- 9 tester (2 service + 7 renderer inkl axe)

### Del B: B4 — Korrigeringsverifikat
**Migration 031 (4 triggers):**
- `trg_immutable_source_type`: blockerar source_type-ändring på bokförda
- `trg_immutable_source_reference`: blockerar source_reference-ändring på bokförda
- `trg_immutable_corrects_entry_id`: blockerar corrects_entry_id-ändring på bokförda
- `trg_no_correct_with_payments`: blockerar status→'corrected' vid beroende betalningar (via invoice/expense join)

**correction-service.ts:**
- `createCorrectionEntry`: atomär omvänd bokning (swap debit↔credit), C-serie, M139-referens i description
- `canCorrectEntry`: guard-check utan sidoeffekt (för UI)
- Guards: not-booked, already-corrected, is-correction (Q12), has-payments (Q7), FY-closed, period-closed
- Cross-FY stöds (Q11): korrigering i aktivt FY med referens till original i stängt FY

**UI-integration:**
- IPC: `journal-entry:correct`, `journal-entry:can-correct` med Zod-scheman
- ManualEntryList: "Korrigerad" (röd) och "Korrigering" (blå) badges, klickbar vy
- PageManualEntries: ny view-subvy med "Korrigera"-knapp + ConfirmDialog
- 35 tester (6 migration, 18 service, 7 IPC-schema, 4 renderer)

### Backlog: 0 öppna findings
B3 (global sökning) skjuten till Sprint 31.

## Sprint 29 -- UX-polish + Kontoutdrag ✅ KLAR

Session S29. 7 findings stängda (F50–F56) + 2 features (B1 testhardering, B2 kontoutdrag-service).

**Testbaslinje:** 1566 → 1604 vitest (+38). 150 testfiler.
**PRAGMA user_version:** 30 (oförändrat — inga nya migrationer).
**Nya komponenter:** ConfirmDialog, Tooltip, AccountStatementService.

### Del A: UX-fixar
| Finding | Fix |
|---------|-----|
| F50 | ConfirmDialog ersätter window.confirm i InvoiceForm + ExpenseForm. 7 tester. |
| F51 | Företagsnamn/org.nr redan read-only i UI — ingen ändring krävs. |
| F52 | Backup-restore: validering, pre-restore-backup, atomic rename, user_version-hantering. 8 tester. |
| F53 | YearPicker timezone-fix: string-slice istället för new Date().getFullYear(). |
| F54 | Tooltip-komponent med aria-describedby + hover/focus. 6 tester. |
| F55 | A11y: M133 rent, inga nya violations. |
| F56 | minWidth: 900, minHeight: 600 på BrowserWindow. |

### Del B: Features
| Feature | Scope |
|---------|-------|
| B1 | 6 tester: partiell kreditering med justerad qty, blandade momssatser 25%+12%, balanscheck. |
| B2 | AccountStatementService: running balance från 0, O-serie sorterad först, named params, datumfilter. 7 tester. UI-sida ej inkluderad — service+IPC klart. |

### Backlog: 0 öppna findings
Alla F50–F56 stängda. B2 renderer-sida kvarstår som feature-backlog (ej bug).

## Sprint 27 -- TSC strict + Fas 6 cleanup ✅ KLAR

Session S27. TSC strict: 37→0 fel (alla i testfiler). Fas 6: alla 5 kvarvarande
findings stängda. Ny M-princip: M136. Migration 028.

**Testbaslinje:** 1550 vitest (oförändrat — inga nya tester, bara fixar).
**Ny M-princip:** M136 (_kr-suffix-konvention för form-types).
**PRAGMA user_version:** 27 → 28. **Tabeller:** 23 → 22 (verification_sequences droppad).

### TSC strict: 37 → 0
- Kategori A (24 fel): `extends object` istället för `extends Record<string, unknown>` i useEntityForm + FormField/FormSelect/FormTextarea + useTestForm
- Kategori B (8 fel): dubbel-cast via `unknown` för ElectronAPI/Window
- Kategori C-F (5 fel): axeResults null-guard, saknad payment_id, stale class_filter, felaktig ErrorCode
- `npm run typecheck` tillagt i CI

### Fas 6: alla 5 findings stängda
| Finding | Fix |
|---------|-----|
| F39 | M136: dokumenterad _kr-suffix-konvention i CLAUDE.md |
| F28 | SIE5 serie C → "Manuella verifikationer", +serie O |
| F20 | VAT-report SQL bind variables istället för template literals |
| F7 | Migration 028: DROP verification_sequences + RENAME payment_terms_days → payment_terms |
| F25 | getUsedAccounts: enbart bokförda konton + IB-täckning (inte alla aktiva) |

### Backlog: 0 öppna findings
Hela Fas 6-listan stängd. Inga kvarvarande findings.

## Sprint 26 -- B-light: user-facing fixar + CI ✅ KLAR

Session S26. Tre user-facing buggar (F35, F38, F8) fixade + GitHub Actions CI etablerad.
Ingen ny affärslogik, inga nya M-principer.

**Testbaslinje:** 1529 → 1550 vitest (+21).

### F35 stängd
ExpenseLineRow HTML `min={0}` → `min={1}`. Backend Zod fångade redan qty=0
men HTML-input tillät det visuellt. 1 test.

### F38 stängd
ManualEntryForm diff visade `Math.abs(diff)` utan riktning. Nu visar
"(debet > kredit)" eller "(kredit > debet)". Beräkningslogik extraherad
till `manual-entry-calcs.ts` för testbarhet. 7 tester.

### F8 stängd
Söktermer med `%` eller `_` tolkades som SQL-wildcards. Ny helper
`escapeLikePattern()` i `src/shared/escape-like.ts` med `ESCAPE '!'`.
4 services migrerade (invoice, expense, product, counterparty).
Arkitektur-vakt (`like-escape-audit.test.ts`) förhindrar regression. 13 tester.

### CI etablerad
`.github/workflows/ci.yml` — ubuntu-only, lint + M131/M133-checks + test + build.
Node 20 via `.node-version`. Inget tsc (91 pre-existing errors), ingen E2E (kräver xvfb).

## Sprint 25 -- F40 VAT-testhardering ✅ KLAR

Session S25. F40 (moms-skalning otestad i InvoiceTotals) stängd.
Ingen produktionskod ändrad — enbart testhardering.

**Testbaslinje:** 1511 → 1529 vitest (+18).
**Ny M-princip:** M135 (dual-implementation paritetstest med delad fixture).
**Ny shared fixture:** `tests/fixtures/vat-scenarios.ts`.

### F40 stängd
18 nya tester via shared fixture (6 scenarios × 3 testlager):
- 6 isolerade VAT-skalning i InvoiceTotals (B5, renderer)
- 6 backend processLines VAT via saveDraft→getDraft
- 6 renderer↔backend paritets-tester (divergens-vakt)

S25 research bekräftade: ingen beräkningsdivergensbugg — renderer och backend
använder identisk M131 Alt B-formel. Sprinten var testhardering, inte bugfix.

### Process-audit-resultat
S24b/S25 process-audit stängde totalt 6 stale findings (F3, F9, F14, F19, F41, F43)
plus F4 och F40 via sprint-arbete. Backlog: 18 → 10 öppna (1 🟡 F39, 9 🟢 Fas 6).

### Prompt-mall-validering (S24b-lärdomar)
1. Return-shape preflight (0.1.D): Fungerade — nästlad shape `InvoiceWithLines.lines[].vat_amount_ore` fångades korrekt.
2. Export-status preflight (0.1.C): Load-bearing — styrde testdesign till saveDraft→getDraft istället för privat processLines.
3. Ingen miljö-överraskning (jfr S24b:s 5 issues) — testinfrastruktur mognare för ren test-sprint.

## Sprint 24b -- BR-result-konsistens + F4 comparator-cleanup ✅ KLAR

Session S24b. F19 (BR oberoende netResult-beräkning) och F4 (latent
lexikografisk kontonummerjämförelse) stängda.

**Testbaslinje:** 1493 → 1511 vitest (+18) + 1 E2E.
**Ny M-princip:** M134 (BR årets resultat via result-service).
**Ny shared helper:** `compareAccountNumbers` (`src/shared/account-number.ts`).

### F19 stängd
BR:s `calculatedNetResult` läser nu från `calculateResultSummary().netResultOre`.
Acceptanskriteriet bekräftat via:
- 3 BR/RR-konsistens-tester (positivt med klass 8, negativt, noll)
- 1 all-consumers-identical-test (permanent vakt över 4 konsument-vägar)
- 1 E2E (klass 8 + 89xx-skatt-scenario, locale-oberoende via data-raw-ore)

### F4 stängd
6 A/B-träffar fixade: 5 SQL `ORDER BY CAST(account_number AS INTEGER)` +
1 application-layer `localeCompare → compareAccountNumbers`. C-träffar
(defensiva single-char prefix-checks) lämnade orörda.

### Process-finding (S24a)
Stale backlog-items ska auditeras mot M-regler vid sprint-avslut. F19 var
i backlog som "tre olika definitioner av årets resultat" men Sprint 11
(M96–M98) etablerade `result-service.ts` som single source of truth utan
att stänga findingen. **Ny rutin:** vid sprint-avslut auditeras alla
refererade findings i sprint-scope mot M-reglerna som etablerats — om
findingen är löst av en M-regel ska den stängas i samma commit, inte
överleva som öppen i backlog.

### S24c-finding: Schema-constraint på account_number
Lägg till `CHECK(length(account_number) BETWEEN 4 AND 5)` på `accounts`-
tabellen som permanent F4-vakt. Kräver M122 table-recreate (FK från 6
tabeller). Inte i scope för S24b eftersom CAST + compareAccountNumbers är
tillräckligt defense-in-depth givet att SIE-import inte existerar.

**Eskaleringstriggers — flytta till sprint om något inträffar:**
1. Import-väg läggs till (SIE-import, CSV-import, eller motsvarande)
2. BAS-uppdatering ger 5-siffriga konton som standard
3. Backup-restore visar sig kringgå application-layer-validering

### Follow-up: data-testid för Dashboard + Tax
Dashboard och Tax-vyn renderar också "årets resultat" men fick inte
`data-testid="arets-resultat-value"` i denna sprint eftersom acceptans-
kriteriet bara krävde RR + BR. Lägg till samma kontrakt vid nästa
beröring av dessa vyer för framtida E2E-utvidgning.

## Sprint 21 -- M131-precision + CI-verifiering ✅ KLAR (2026-04-14)

Session S68: F47 display-lager (InvoiceLineRow + ExpenseLineRow Alt B),
F48 IPC-precision-gate (invoice channels), M131 grep-check med självtest.
Testbaslinje: 1464 → 1472. Hela M131-ytan nu konsekvent: service (S20) +
totals (S20) + display (S68a/b) + IPC-gate (S68c) + statisk verifiering (S68d).

### Sprint 21 sessioner
| Session | Scope | Status |
|---------|-------|--------|
| S68a | F47: InvoiceLineRow Alt B + DOM-smoke | KLAR |
| S68b | F47: ExpenseLineRow Alt B + Zod-regression-guard | KLAR |
| S68c | F48: IPC decimal-precision-gate | KLAR |
| S68d | M131 grep-check med självtest | KLAR |

## Sprint 20 -- M131 heltalsaritmetik ✅ KLAR (2026-04-14)

Sessioner: S67a (F45 datum-felrendering), S67b (F44 Alt B heltalsaritmetik).
Testbaslinje: 1449 → 1464. Ny M-princip: M131 (monetära beräkningar via
heltalsaritmetik). Zod-refine for invoice quantity ≤2 decimaler.

## Sprint 16 -- Schema+IPC-normalisering ✅ KLAR (2026-04-13)

Sessioner: S57 (F10 expense_lines paritet), S58 (F4 schema-namnkonvention),
S59 (F9 timezone-konsolidering), S60 (F13 handler error-patterns +
sprint-stangning). Testbaslinje: 1190 → 1223. Nya M-principer:
M127 (schema-paritet, S57), M128 (handler error-patterns, S60).
PRAGMA user_version = 27, 22 tabeller.

### Sprint 16 sessioner
| Session | Scope | Status |
|---------|-------|--------|
| S48 | F4: ore-suffix products/price_list_items (M119) | KLAR |
| S57 | F10: expense_lines paritet (M127) | KLAR |
| S58 | F4: Schema-namnkonvention (created_by → created_by_id) | KLAR |
| S59 | F9: Timezone-konsolidering | KLAR |
| S60 | F13: Handler error-patterns + sprint-stangning | KLAR |

## Test-count
- Vitest (system + unit): 2063 passed, 0 skipped
- Testfiler: 205
- Playwright E2E: 11 (körs separat)
- Körning: ~27s
- TSC: 0 errors (`npm run typecheck`)

## Known infrastructure contracts
- **FRITT_DB_PATH**: guardad till test-env (NODE_ENV=test eller FRITT_TEST=1). Ignoreras i production.
- **FRITT_TEST=1**: aktiverar `window.__testApi` och test-only IPC-handlers (`__test:`-prefix).
- **E2E_DOWNLOAD_DIR**: bypass for dialog.showSaveDialog i E2E.
- **better-sqlite3 handle-kontrakt**: Electron ager primary rw-handle under test. Test-kod seedar via IPC, inte direkt db-access.
- **Playwright workers: 1**: Electron singleton per test-fil.
- **GitHub Actions CI**: ubuntu-only, Node 20, typecheck + lint + checks + test + build.
- **PRAGMA user_version**: 33 (Sprint 33: migration 032 quantity-CHECK + migration 033 FTS5). Oförändrat i Sprint 34.

## Kanda fynd vantande

Backlog: 0 oppna findings.

### Schema conventions -- medvetna avvikelser (klass B)
- **accounts.k2_allowed** -- boolean utan `is_`-prefix. `is_k2_allowed` borderline, ej tydligt battre. 54 referenser over 8 filer.
- **accounts.k3_only** -- boolean utan `is_`-prefix. `is_k3_only` borderline. Samma fotavtryck som k2_allowed.

Dokumenterat i S58 (Sprint 16 F4). Konservativ default: ej andrade.

### Tech debt (by design, ej blockerande)
1. **4 invariant-throws i validatePeriodInvariants** -- fangade av PERIOD_GENERATION_ERROR-wrapper, inte user-facing.
2. ~~**ManualEntryListItem.total_amount**~~ -- STANGD i Sprint 33 (D1, M119 rename).
3. ~~**E03 supplier-picker**~~ -- STANGD i Sprint 33 (D2, testId prop).
4. ~~**F57 mock-IPC shape-validering**~~ -- STANGD i Sprint 33 (C0, IpcResult Zod validation). F59 oppen for per-kanal response-schema.
5. ~~**PageAccountStatement URL-sync**~~ -- STANGD i Sprint 31 (A2).

### Known tech debt (S60)

#### TypeScript strict-compile (hog prio)
- **91 tsc-fel i ~20 filer.** Pre-existing fran tidigare sprints,
  ej introducerade av Sprint 16. Aktuell komplexitet: kraver dedikerad
  sprint (uppskattat 1-2 sessioner). Paverkar inte runtime.
- Exempel: S12-bank-fee.test.ts-familjen har aterkommande typ-fel
  i test-fixtures.
- Atgard: Sprint 17 eller senare. Bor inte blandas med feature-arbete.

#### Renderer-komponenttester via vitest (medel prio)
- Upptackt i Sprint 16 S59. `vitest.config.ts` utokades for att
  inkludera `tests/**/*.test.tsx`. Fore S59 korde vitest ENDAST `.ts`-
  filer. Noll renderer-komponenttester via vitest.
- Konsekvens: FormField-buggar (Sprint 10+) upptacktes bara via E2E.
- Atgard: Egen sprint for renderer-komponenttester.

#### ESLint toISOString-regel tacker inte alla varianter (lag prio)
- Inford i Sprint 16 S60. Tacker `.slice`, `.split`, `.substring`
  pa `.toISOString()`.
- Potentiella edge cases: destrukturering, indirekt referens via
  variabel, andra datum-bibliotek om de infors senare.
- Atgard: Monitorera. Utoka regeln vid behov.

### UX-friktioner (upptackta under S51 E2E)
4. **Picker-komponenter saknar data-testid** -- CustomerPicker/ArticlePicker dropdown-rader har inga testbara selektorer.
5. **"Bokfor" text-collision** -- Navigation-lank, sidrubriker och submit-knapp delar texten "Bokfor".
6. **Payment fran list-row med stopPropagation** -- Betala-knappen finns bara i InvoiceList action-kolumn.

### Arkitektur/test-beslut vantande
7. **Bank-fee proportionalitet** -- nuvarande policy: hel avgift per batch (M126). Framtida: proportionell fordelning.
8. **Trigger 6/7-analys** -- opening_balance entries exempterade fran triggers 1-5 men ej 6-7.
9. **Redundans-audit** -- se tests/REDUNDANCY_AUDIT.md.

## Timezone conventions — medvetna avvikelser

Dokumenterade via Sprint 16 S59 (F9) audit. Varje avvikelse lamnad orord
med explicit motivering. ESLint `no-restricted-syntax`-regel inford i S60
for `.toISOString().slice/.split/.substring`. Klass B-filer och
test-filer undantagna.

| # | Fil | Rad | Monster | Motivering |
|---|---|---|---|---|
| B1 | src/main/services/expense-service.ts | 138, 254 | `datetime('now')` for `created_at` INSERT | Matchar migration DEFAULT `datetime('now')` (UTC). Andra till localtime skulle skapa inkonsistens med rows som faller tillbaka pa DEFAULT. Metadata, inte affarsdatum. |
| B2 | src/main/services/sie5/sie5-export-service.ts | 182 | `new Date().toISOString()` for SIE5 XML-timestamp | SIE5-spec kraver ISO 8601 UTC timestamps. Korrekt per extern standard. |
| B3 | src/main/services/sie5/sie5-export-service.ts | 87 | `currentDate.toISOString().substring(0,7)` | `currentDate` konstruerad fran `YYYY-MM-01`, inte "now". Ingen timezone-risk. |
| B4 | src/main/pre-update-backup.ts | 19 | `new Date().toISOString().slice(0,19)` for filnamn | Auto-updater backup. UTC-timestamp i filnamn acceptabelt som unikt ID, inte visningstid. |
| B5 | src/renderer/pages/PageSettings.tsx | 23 | `new Date().toISOString()` for `last_backup_date` | Metadata-timestamp lagras som UTC, jamfors aldrig med lokala datum. |
| B6 | src/renderer/components/wizard/StepFiscalYear.tsx | 36, 74 | `new Date().getFullYear()` + `new Date()` for manadsdiff | `getFullYear()` ger lokalt ar (korrekt). Relativ manadsjamforelse utan date-strangar ar safe. |
| B7 | src/main/services/excel/excel-export-service.ts | 444 | `new Date()` med `.getFullYear/.getMonth/.getDate/.getHours` | Manuellt formaterad lokal tid via getters. Samma resultat som `todayLocal()`. Korrekt per M28. |

## Tidigare sprintar
- Sprint 32 (S32): Unicode-sokning + Verifikat-sokning + Perf-baseline -- KLAR
- Sprint 31 (S31): Global sokning + Kontoutdrag-polish — B3 global search, B2 URL-sync, print-mode -- KLAR
- Sprint 30 (S30): Kontoutdrag-UI + Korrigeringsverifikat — B2 UI, B4 correction-service -- KLAR
- Sprint 29 (S29): UX-polish + Kontoutdrag — F50–F56, B1 tester, B2 service -- KLAR
- Sprint 27 (S27): TSC strict + Fas 6 cleanup — 0 tsc-fel, 0 findings -- KLAR
- Sprint 26 (S26): B-light — F35, F38, F8 stängda, CI etablerad -- KLAR
- Sprint 25 (S25): F40 VAT-testhardering -- KLAR
- Sprint 24b (S24b): BR-result-konsistens + F4 comparator-cleanup -- KLAR
- Sprint 15 (S41-S47): Kritiska normaliseringar -- KLAR
- Sprint 14 (S48-S53): E2E-testinfrastruktur -- KLAR
- Sprint 13 (S55-S56): Bulk-betalningar -- KLAR
- Sprint 12 (S54): Bankavgifter -- KLAR
- Sprint 11 (S42-S53): Atomicitet, SSOT resultat, Oresutjamning, Performance, Rename -- KLAR
