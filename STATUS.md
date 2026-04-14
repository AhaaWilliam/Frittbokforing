# Fritt Bokforing -- Projektstatus

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

## Nasta sprint -- F46 (max-qty UX) eller F49 (a11y-konsistens)

## Test-count
- Vitest (system + unit): 1472 passed, 2 skipped (1474 totalt)
- Testfiler: 125
- Playwright E2E: 10 (kors separat)
- Korning: ~13s

## Known infrastructure contracts
- **FRITT_DB_PATH**: guardad till test-env (NODE_ENV=test eller FRITT_TEST=1). Ignoreras i production.
- **FRITT_TEST=1**: aktiverar `window.__testApi` och test-only IPC-handlers (`__test:`-prefix).
- **E2E_DOWNLOAD_DIR**: bypass for dialog.showSaveDialog i E2E.
- **better-sqlite3 handle-kontrakt**: Electron ager primary rw-handle under test. Test-kod seedar via IPC, inte direkt db-access.
- **Playwright workers: 1**: Electron singleton per test-fil.

## Kanda fynd vantande

### Schema conventions -- medvetna avvikelser (klass B)
- **accounts.k2_allowed** -- boolean utan `is_`-prefix. `is_k2_allowed` borderline, ej tydligt battre. 54 referenser over 8 filer.
- **accounts.k3_only** -- boolean utan `is_`-prefix. `is_k3_only` borderline. Samma fotavtryck som k2_allowed.

Dokumenterat i S58 (Sprint 16 F4). Konservativ default: ej andrade.

### Tech debt (by design, ej blockerande)
1. **4 invariant-throws i validatePeriodInvariants** -- fangade av PERIOD_GENERATION_ERROR-wrapper, inte user-facing.
2. **ManualEntryListItem.total_amount** -- saknar `_ore`-suffix (M119). Rename ar breaking for renderer. Lagreprioritet.
3. **E03 supplier-picker** -- saknar data-testid for E2E-selektering.

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
- Sprint 15 (S41-S47): Kritiska normaliseringar -- KLAR
- Sprint 14 (S48-S53): E2E-testinfrastruktur -- KLAR
- Sprint 13 (S55-S56): Bulk-betalningar -- KLAR
- Sprint 12 (S54): Bankavgifter -- KLAR
- Sprint 11 (S42-S53): Atomicitet, SSOT resultat, Oresutjamning, Performance, Rename -- KLAR
