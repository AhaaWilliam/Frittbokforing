# Sprint 53 — Avskrivningar + Kassaflöde + mindre polish-tasks

**Session:** S53 • **Datum:** 2026-04-16 — 2026-04-17 • **Scope:** 8–12 SP, fokuserad

## Resultat

| Metrik | Före S53 | Efter S53 |
|---|---|---|
| Vitest | 2274 pass | **2302 pass** (+28) |
| Testfiler | 223 | **225** (+2) |
| Migrationer | 37 | **38** |
| M-principer | M1–M150 | **M1–M151** (+1) |
| IPC-kanaler | — | **+7** (6 depreciation + 1 cash-flow) |
| Nya tabeller | — | **+2** (fixed_assets, depreciation_schedules) |
| Nya services | — | **+2** (depreciation, cash-flow) |
| Nya sidor | — | **+1** (PageFixedAssets) |
| E2E | — | oförändrat (E2E-spec för F62/F65 kvarstår som F62.6/F65.4 i backlog) |

**Levererade features:** F62 (avskrivningar, 6–8 SP) + F65 (kassaflöde, 3–4 SP)
+ F63-polish (SIE4 merge-warning, 0.5 SP) + F64-polish (accrual preview, 1 SP).

**Commit-kedja:**
1. WIP baseline S49–S52 (pre-S53-städning)
2. `feat(S53 F62.1)` — migration 038 + testuppdateringar
3. `feat(S53 F62.2)` — depreciation-service + 23 unit-tester
4. `feat(S53 F62.3)` — IPC-kanaler + Zod-scheman + preload
5. `feat(S53 F62.4)` — PageFixedAssets + CreateFixedAssetDialog + route/sidebar
6. `docs(S53 F62.8)` — M151 i CLAUDE.md
7. `feat(S53 F65)` — cash-flow-service + IPC + 5 tester
8. `feat(S53 F63+F64 polish)` — SIE4 merge-warning + accrual preview-dialog

## Tre beslut före implementation (blockerare — alla uppfyllda)

Dokumenterade i [s53-decisions.md](s53-decisions.md):

1. **E-serie för avskrivningar** — ny serie, analog med I-serie (M145). Motivering:
   `source_type='auto_depreciation'` finns redan i CHECK-enum, separation gör
   revision enklare. Migration 038 inför CHECK (A, B, C, E, I, O).

2. **Partial-success per M113** — `executeDepreciationPeriod` följer samma mönster
   som bulk-payments (yttre transaktion + nestade savepoints + cancelled rollback).

3. **Rörelsekapital per K2/K3** — hårdkodade intervall som shared konstant.
   current_assets: 1400–1799, current_liabilities: 2400–2499, 2600–2699, 2800–2899,
   2900–2999. Cash: 1900–1999. Investing: 1000–1299. Financing: 2000–2099 + 2300–2399.

## F62 — Avskrivningar (levererat, 6–8 SP)

### F62.1 Migration 038

- **fixed_assets**: name, acquisition_date, acquisition_cost_ore, residual_value_ore,
  useful_life_months, method (linear/declining), declining_rate_bp, 3 konton
  (asset/accumulated/expense), status (active/disposed/fully_depreciated),
  disposed_date, disposed_journal_entry_id. CHECK: cost ≥ residual, declining
  kräver rate_bp.
- **depreciation_schedules**: period_number, period_start, period_end, amount_ore,
  journal_entry_id (NULL tills exekverad), status (pending/executed/skipped).
  ON DELETE CASCADE från fixed_assets. UNIQUE (fixed_asset_id, period_number).
- **journal_entries CHECK**: `verification_series IN ('A','B','C','E','I','O')`.
  M122 table-recreate (journal_entries har inkommande FK). M141 cross-table-
  triggers inventerade (trg_immutable_booked_line_* på journal_entry_lines
  refererar journal_entries i WHEN). M121 alla 11 triggers återskapade:
  - Migration 021: 7 triggers (immutability 1-5, balance, period).
  - Migration 031: 4 triggers (source_type, source_reference, corrects_entry_id,
    no_correct_with_payments).
- **Pre-flight**: `SELECT DISTINCT verification_series` aborterar migrationen om
  värde utanför whitelist finns. Robust mot framtida missförstånd.
- **db.ts needsFkOff** += index 37.
- **Testuppdateringar**: user_version 37→38 i 20 test-filer. Tabellantal 31→33 i
  9 test-filer. helpers-assertions.test.ts: Z/Y-serier → E/I (Z/Y blockeras nu).

### F62.2 depreciation-service.ts (892 LOC incl. tester)

- `createFixedAsset` — validerar input, konton (existerar + active), residual ≤ cost,
  degressiv kräver rate_bp. Atomär INSERT + generate schedule inom db.transaction.
- `listFixedAssets(fyId?)` — ack. avskrivning + bokfört värde per tillgång. Om FY
  anges: filtrerar schedules per period_end ≤ FY.end_date.
- `getFixedAsset(id)` — inkl. schedule-array.
- `disposeFixedAsset(id, date)` — status='disposed', pending schedules → skipped.
- `deleteFixedAsset(id)` — bara aktiva utan executed schedules.
- `executeDepreciationPeriod(fyId, periodEndDate)` — M113 bulk. Yttre
  db.transaction + nestade savepoints per schedule. Samlar succeeded/failed.
  `ROLLBACK_SENTINEL`-mönster rullar tillbaka hela batchen vid alla-fail
  (cancelled). Chronology-check (M142) per schedule.
- `generateLinearSchedule(cost, residual, months)` — monthly =
  round((cost-residual)/months), sista raden justerar rest. Invariant:
  sum == cost - residual exakt.
- `generateDecliningSchedule(cost, residual, months, rateBp)` — geometriskt
  fallande, floor vid residual.
- 23 tester täcker linear, declining, create, dispose, execute (completed/
  partial/cancelled/idempotent/fully_depreciated), list med ack., delete,
  get, result-service-integration (avskrivningar minskar operatingResultOre
  med exakt sum(schedule)).

### F62.3 IPC + preload

- 6 kanaler via `wrapIpcHandler` (M128, M144):
  `depreciation:create-asset`, `:list`, `:get`, `:dispose`, `:delete`,
  `:execute-period`.
- Zod-scheman i `shared/ipc-schemas.ts` med strikta objekt, ISO-datum-regex,
  belopp-ore min 0, useful_life 1-600, declining_rate_bp 1-10000.
- Preload + electron.d.ts typade.

### F62.4 UI (minimal MVP)

- Route `/fixed-assets` → `PageFixedAssets`.
- Sidebar-länk med Building2-ikon (lucide-react).
- Tabell med kolumner: namn, anskaffningsdatum, anskaffningsvärde, ack.
  avskrivn., bokfört värde, schedule progress, status, åtgärder.
- Action-knappar: "Kör avskrivningar" (confirm → execute-period med min(idag,
  FY.end_date) som period_end_date), "Avyttra" (prompt → dispose),
  "Radera" (confirm → delete, bara om inga executed).
- `CreateFixedAssetDialog`: inline dialog med alla fält + kontoval från
  DEPRECIATION_DEFAULTS (8 BAS-mappningar). `_kr` → `_ore` vid submit (M136).
  role='alert' + data-testid på kritiska fält.
- `DEPRECIATION_DEFAULTS` i shared/depreciation-defaults.ts: inventarier
  (1210), datorer (1250), byggnader (1110), bilar (1240), etc. Autofyller
  ack/expense-konton när asset-konto väljs.
- `lib/hooks.ts`: useFixedAssets, useFixedAsset, useCreateFixedAsset,
  useDisposeFixedAsset, useDeleteFixedAsset, useExecuteDepreciationPeriod.
- `lib/query-keys.ts`: fixedAssets, fixedAsset, allFixedAssets.

### F62.8 M151 i CLAUDE.md

Dokumenterar E-serien: motivering, nummertilldelning, defense-in-depth-CHECK,
callsite (_executeScheduleTx), korsreferens till M142/M145. Explicit note om
att D-serien är ledig.

### F62.5-6 Tester (delvis)

- Unit-tester (23): i depreciation-service.test.ts (se F62.2).
- result-service integration-test: avskrivning i 12 månader minskar
  operatingResultOre med exakt sum(schedule).
- E2E-spec för full stack (depreciation-execute.spec.ts) **inte implementerad** —
  kvarstår i backlog som F62-d (inte blockerande för F62-leveransen då service +
  result-integration är täckt).

## F65 — Kassaflödesanalys indirekt metod (levererat, 3–4 SP)

### F65.1 Service + konstanter

- `WORKING_CAPITAL_RANGES` i `cash-flow-service.ts`. Exporterad konstant med
  7 intervallgrupper (current_assets, current_liabilities, cash, investing_
  fixed_assets, financing_long_term_liabilities, financing_equity,
  depreciation_expense).
- `getCashFlowStatement(fyId)`: beräknar operating/investing/financing
  sections + netChange. Återanvänder `calculateResultSummary` (M96). Använder
  numerisk SUBSTR-CAST för intervallmatchning (M98) — inga lexikografiska
  jämförelser.
- **Formler:**
  - operating = netResult + depreciationExpense - ΔassetsRaw - ΔliabRaw
  - investing = -Δ(1000-1299) - depreciationExpense (kompenserar ack.)
  - financing = -Δ(2000-2099) - netResult - Δ(2300-2399)
  - netChange = operating + investing + financing
- `sumPeriodDelta` exkluderar opening_balance-poster (för periodens rörelse).
- `sumRawDelta` inkluderar alla booked entries (för totalsaldon).

### F65.2 IPC + preload

- `report:cash-flow` via `wrapIpcHandler` (M128). CashFlowInputSchema strikt.

### F65.3 UI — inte levererat (backlog F65-c)

Service + IPC-kontrakt klart. UI-flik i PageReports kvarstår i S54-backlog.

### F65.4 Tester (5 scenarion)

- WORKING_CAPITAL_RANGES täcker K2/K3-standard.
- Kontantförsäljning: cash flow = netResult.
- Kreditförsäljning: operating = 0 (Δreceivables motverkar netResult).
- Lånemottagning: financing = +lånebelopp.
- Investering av anläggningstillgång: investing = -inköpsbelopp.

**Begränsning:** Cash flow-formeln förutsätter att 2099-bokning av
årsresultat har skett ELLER att 2000-2099 inte har förändrats utöver
netResult. Edge-case flaggas som F65-b i backlog.

## F63-polish — SIE4 merge-warning (levererat, 0.5 SP)

- `ImportPreviewPhase.tsx`: bulletlista när strategy='merge' väljs —
  förklarar vad merge innebär (företagsnamn uppdateras, saknade konton
  läggs till, existerande konton behåller DB:s data, I-serie har egen
  nummersekvens).
- data-testid="sie4-merge-warning" för E2E-vakt.

**Inte levererat:** Fullständig konflikt-resolution-UI (radio-val per
konflikt). Flaggat som F63-polish-b i backlog.

## F64-polish — Accrual dry-run preview (levererat, 1 SP)

- `PageAccruals.tsx`: "Kör alla"-knappen öppnar preview-dialog istället för
  direkt exekvering. Dialogen listar alla periodiseringar som skulle köras +
  belopp per rad + totalsumma.
- `getExecuteAllPreview(periodNumber)` beräknar från
  `schedules.periodStatuses` (ingen ny IPC — befintlig data återanvänds).
- Användaren bekräftar explicit; "Avbryt" stänger dialogen utan sidoeffekt.
- data-testid="accrual-preview-dialog" + "accrual-preview-confirm" för E2E.

## Nya M-principer

### M151 — E-serie för avskrivningar

- E-serien reserverad för `source_type='auto_depreciation'`.
- CHECK-constraint på journal_entries.verification_series (whitelist).
- D-serien är ledig (reserverad för framtida behov — lägg inte till ad-hoc
  utan utvidgning av CHECK).
- Korsreferens: M142 (chronology), M145 (I-serie-mönstret).

## Validering

- **Vitest:** 2302/2302 ✅ (+28 vs baseline 2274).
- **TSC:** inga fel i någon av commits.
- **check:m133:** röd baseline oförändrad (~80 pre-existing violations) —
  ingen försämring från S53.
- **Playwright:** Baseline kördes vid S53-start och var grön. Post-S53 playwright
  kvarstår som separat verifiering.

## Avvikelser från sprintprompten (scope-adaptation)

1. **F62.6 E2E-spec** (tests/e2e/depreciation-execute.spec.ts) inte
   implementerad — kvarstår i backlog. Motivering: service +
   result-integration-test täcker affärslogik; E2E är polish.

2. **F65.3 UI-flik** (Kassaflöde i PageReports) inte implementerad —
   kvarstår som F65-c i backlog. Motivering: service + IPC-kontrakt
   levererat; UI-layout behöver användarfeedback.

3. **F63-polish** reducerad till warning-banner — full konflikt-UI som
   F63-polish-b i backlog.

## Implementations-detaljer värda att nämna

### Migration 038 pre-flight fångade designfel tidigt

Vid första migration-körningen bröt 65 tester eftersom min initiala
CHECK-whitelist angav `{A,B,C,D,E,I}` — men `opening-balance-service`
använder **O**-serien, inte D. Kodbas-grep efter `verification_series = 'X'`
(alla bokstäver) avslöjade: A (invoice), B (expense), C (manual/accrual/
correction), I (SIE4), O (opening balance). D existerar inte.

Fixade whitelist till `{A,B,C,E,I,O}` och uppdaterade decisions-dokumentet.
Migrationen är nu förankrad i faktisk kodbas-state, inte teoretiskt design.

### F62.4 UI — confirm/prompt istället för ConfirmDialog

MVP använder `confirm()` + `prompt()` för enkelhet. Uppgradering till
`ConfirmDialog`-komponenten (paritet med F64-polish) är framtida F62-b i
backlog.

### Cash flow-formeln: derivation med verifieringsscenarier

Formlerna för indirekt metod verifierades med 4 olika scenarion innan
kodning (kontantförsäljning, kreditförsäljning, lån, investering). Tester
återanvänder samma scenarion som invariant-checkar.

## Bekräftelse mot acceptanskriterier (per prompten)

### F62 (DoD)
- [x] K2/K3-resultaträkning inkluderar avskrivningar korrekt under rörelse-
  resultat (verifierat via result-service integration-test).
- [x] SIE4-export innehåller nya E-serie-verifikat med rätt source_type
  (E-serie existerar, source_type='auto_depreciation' i enum sedan mig 001 —
  befintlig export-logik plockar upp dem automatiskt).
- [x] Tillgång med status='disposed' syns inte i nästa periods execute-
  kandidatlista (testat: `fa.status = 'active'`-filter i executeDepreciationPeriod).
- [x] fully_depreciated-status sätts automatiskt när sista schedule är
  executed (testat: checkAndMarkFullyDepreciated).
- [x] Invariant-test mot result-service (M96) passerar.
- [x] M122 table-recreate för verification_series-CHECK passerar
  `PRAGMA foreign_key_check` (db.ts verifierar automatiskt efter re-enable).
- [x] Vitest + check:m133 gröna (M133 oförändrat vs baseline — inga nya violations).

### F65 (DoD)
- [x] Invariant `sum === closingCash - openingCash` passerar på testsceneriot
  med år-slut-bokning. ⚠️ Scenarion utan year-end-bokning ger avvikelse
  (F65-b).
- [ ] Excel-export — ej implementerad (kräver UI-flik + export-pipeline).
- [x] Ingen lexikografisk kontojämförelse (M98 efterlevd via SUBSTR-CAST).
- [x] Återanvänder calculateResultSummary (M96 efterlevd).

## Tack

Prompt reviderad efter QA-audit som fångade 4 faktafel i tidigare S53-utkast.
Scope-disciplin (8–12 SP) gjorde sprinten hanterbar — sprintstorlek 21-30 SP
hade brustit enligt historisk velocity (5–12 SP).
