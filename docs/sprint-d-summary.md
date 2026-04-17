# Sprint D — Backlog-cleanup: E2E-failures + M100-avvikelser

**Datum:** 2026-04-17
**Tema:** Noll nya features. Stänger 5 pre-existing E2E-failures från
S57/S58 plus 2 M100-avvikelser i export-lagret. Ingen ny migration,
ingen ny M-princip, ingen ny IPC-kanal, ingen ny publik yta.

## Testbaslinje

| Mätvärde | Före (SC) | Efter (SD) | Δ |
|---|---|---|---|
| Vitest | 2471 | 2475 | +4 |
| Testfiler | 243 | 244 | +1 |
| Playwright specfiler | 65 | 65 | 0 |
| Playwright `test()`-kallor | 102 | 102 | 0 |
| Pre-existing E2E-failures | 5 | 0 | −5 |
| Full E2E (66 test()-kallor, inkl. sub-tester) | 61p/5f | 66p/0f | +5p / −5f |
| PRAGMA user_version | 41 | 41 | 0 |
| Nya IPC-kanaler | — | — | 0 |
| Nya M-principer | — | — | 0 |

## Triage-matris

| # | Spec | Kategori | Root cause (en mening) |
|---|------|----------|------------------------|
| 1 | [bank-fee-auto-classify](../tests/e2e/bank-fee-auto-classify.spec.ts) | **2** | `bank-statement-service.ts` INSERT-statement sparar inte `bank_tx_domain/family/subfamily`-kolumnerna som migration 041 lade till — parser producerar dem, suggester behöver dem, men de förloras på vägen till DB |
| 2 | [bank-statement-auto-match-partial](../tests/e2e/bank-statement-auto-match-partial.spec.ts) | **2** | `SuggestedMatchesPanel` renderar failure-sektionen inuti `suggestions.length === 0 ? empty : <>`-ternary — efter bulk-accept invalideras cachen → tom suggestions → "Inga förslag"-branch döljer failure-sektionen |
| 3 | [bank-unmatch batch-blocked](../tests/e2e/bank-unmatch.spec.ts) (rad 109) | **1** | Utdaterat `payInvoicesBulk`-payload: `items:` istället för `payments:`, extra `fiscal_year_id:` (strict-schema rejectar), `bank_fee_ore: null` matchar inte `optional()` (kräver number eller omitted) |
| 4 | [sie4-import-conflict](../tests/e2e/sie4-import-conflict.spec.ts) | **1** | Default BAS-1930 heter "Företagskonto" (migrations.ts:393), testets SIE-fil anger samma namn → `existing_name === new_name` → ingen konflikt detekteras → konflikt-sektionen renderas inte |
| 5 | [sie4-import-conflict-blocked](../tests/e2e/sie4-import-conflict-blocked.spec.ts) | **1** | Samma root cause som #4 |

**Exit-beslut:** Alla 5 är inom B1/B2-scope. Kat 2 är renderer-UI-fix + service-INSERT-fix — ingen migration, ingen ny IPC, ingen ny M-princip, ingen publik yta utvidgning. Fortsätter utan Sprint E-split.

## Bodyguard-sammanfattning

- PRAGMA user_version: 41 (oförändrat)
- Ingen ny IPC-kanal
- Ingen ny M-princip
- Ingen ny data-testid utanför whitelist
- Ingen publik funktionsyta utvidgad i bank-service, invoice-service, expense-service, correction-service, depreciation-service
- Ingen ny migration

## Levererat

### A. Triage (5 specs)

Loggfiler i [docs/sprint-d-triage-logs/](sprint-d-triage-logs/). Ingen
fix under triage — alla 5 specs körda utan interventioner för matris.

### B. E2E-fixar

**F7a — bank-statement-service `bank_tx_*`-kolumner.** INSERT-statementet
i `importBankStatement` ([bank-statement-service.ts:185–200](../src/main/services/bank/bank-statement-service.ts))
uppdaterat så att `bank_tx_domain`, `bank_tx_family` och `bank_tx_subfamily`
skrivs från parsad data. Kolumnerna lades till i migration 041 (Sprint A
S58), parser läser dem ([camt053-parser.ts:230–270](../src/main/services/bank/camt053-parser.ts)),
och suggester använder dem ([bank-match-suggester.ts:320–325](../src/main/services/bank/bank-match-suggester.ts)).
Innan fixen förlorades data mellan parser och DB → fee-classifier triggades
aldrig → tom candidates-array.

**F7b — `SuggestedMatchesPanel` failure-sektion lyftes ut.** Failure-sektionen
flyttades från inuti `suggestions.length === 0 || every(candidates.length===0) ? empty : <>`-ternary
till ovanför hela det villkorliga blocket ([SuggestedMatchesPanel.tsx:337–356](../src/renderer/components/bank/SuggestedMatchesPanel.tsx)).
Så länge `results !== null && results.failed.length > 0` renderas sektionen
oavsett om cachen invaliderats till tom efter bulk-accept.

**F7f — bank-match-service IpcResult-wrapping.** Upptäckt under F7b-
debugning. Både inre och yttre catch-block i
[bank-match-service.ts:118–137 + :200–220](../src/main/services/bank/bank-match-service.ts)
returnerade raw `{ code, error }`-objekt `as IpcResult<...>` — men
strukturerade fel saknar `success`-fältet som
[wrapIpcHandler.isIpcResult](../src/main/ipc/wrap-ipc-handler.ts) kräver.
Konsekvensen: wrapIpcHandler klassificerade error-objektet som data och
wrappade det som `{ success: true, data: {code, error} }`. Renderer såg
success=true → panel rapporterade 3 av 3 lyckade matchningar trots att
DB bara fick 2 reconciliation-rader. Fix: inre catch re-kastar (yttre
catch hanterar struct-wrapping), yttre catch bygger korrekt
`{ success: false, code, error, field? }`-objekt. Ingen publik yta-
utvidgning — bara ett latent buggfix.

**F7c — bank-unmatch test payload uppdaterat.** `payInvoicesBulk`-anropet i
testet bytt från `items: [...]` + `fiscal_year_id: ...` + `bank_fee_ore: null`
till `payments: [...]` utan extras och utan `bank_fee_ore`.

**F7d + F7e — SIE4-konflikt-tester fixar namn-konflikten.** SIE-filerna i
båda specs ändrade från `1930 "Företagskonto"` (identiskt med DB-default)
till `1930 "Bankkonto"` så att `existing_name !== new_name` och konflikt
detekteras.

### C. M100-fixar i export-lagret

**C1 — `export-data-queries.ts:97,111`.** `throw new Error('No company found')`
och `throw new Error('Fiscal year X not found')` bytta till strukturerade
`{ code: 'NOT_FOUND' as const, error: ... }`-objekt. `as const` krävs för
att TypeScript ska smalna typen i `wrapIpcHandler.isStructuredError`-branch.

**C2 — `excel-export-service.ts:92,94`.** Samma mönster:
`throw new Error('startDate is before fiscal year start')` →
`{ code: 'VALIDATION_ERROR' as const, error: ..., field: 'startDate' }`.

**C3 — `tests/session-60-m100-export.test.ts`.** 4 system-layer-tester
(3 krävda + en bonus för endDate-symmetri):
(1) `getCompanyInfo` på tom companies-tabell → `NOT_FOUND`,
(2) `getFiscalYear` med invalid id → `NOT_FOUND`,
(3) `exportExcel` med `startDate < fy.start_date` → `VALIDATION_ERROR`
med `field: 'startDate'`,
(4) `exportExcel` med `endDate > fy.end_date` → `VALIDATION_ERROR`
med `field: 'endDate'`.

**C4 — uppdatera `s24b-br-rr-consistency.test.ts`.** Ett befintligt test
`'obefintligt fiscal_year_id kastar Error'` asserterade på den gamla
`'Fiscal year 99999 not found'`-plain-Error-formaten. Uppdaterad till att
assertera `{ code: 'NOT_FOUND' }` (M100-struktur) och döpta om till
`'obefintligt fiscal_year_id kastar strukturerat NOT_FOUND-fel (M100)'`.

## Acceptance-status

- [x] `npm run check:m133 && check:m133-ast && check:m153` — OK
- [x] `npm run typecheck` — 0 fel
- [x] `npm test -- --run` — **246 testfiler, 2475 tester** (baseline 2471 + 4 nya)
- [x] Full Playwright-suite — **66/66 passing** (baseline 61p/5f → 66p/0f)
- [x] `docs/sprint-d-summary.md` med § Triage-matris + § Levererat + § Backlog
- [x] Ingen ändring i `src/main/migrations.ts`
- [x] `docs/sprint-d-triage-logs/` — 5 triage-loggar + post-fix-verifiering
- [x] `git status` clean efter commit

## Backlog

**Latent buggvariant: bank-statement-service.ts:219.** Samma mönster som
F7f-fixen (yttre catch returnerar raw struct-error `as IpcResult<...>`
utan `success`-fält). `importBankStatement` kastar dock aldrig
strukturerade fel från sin transaction (alla inre fel returneras som
full IpcResult), så buggen är latent — oreachable i produktion. Kan
fixas för typ-säkerhet men har ingen observerbar effekt. Ej scope för
Sprint D.

Nya poster: inga utöver det latenta ovan.
